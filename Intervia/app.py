from google import genai
from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
from google.genai import types
from docx import Document
import requests
import os
import json
import uuid
import tempfile
from werkzeug.utils import secure_filename
from flask import send_file
import base64
import json
import threading
import websocket
from flask_sock import Sock
from datetime import datetime, timezone

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
gemini_client = genai.Client(api_key=GEMINI_API_KEY)

app = Flask(__name__)
sock = Sock(app)
CORS(app)

# IMPORTANT: this directory must live OUTSIDE app.root_path.
# Flask's debug-mode reloader (Werkzeug) watches the project directory
# for changes and restarts the whole server whenever it sees one.
# Storing uploaded resumes inside the project tree meant every resume
# upload was silently triggering a full server restart, which is why
# the very next request (the dashboard reload) could hit a dead/
# restarting server and appear to "lose" the resume. Uploaded user
# files should never live inside a reloader-watched source directory
# regardless of this bug — this fixes both problems at once.
RESUME_UPLOAD_DIR = os.path.join(
    tempfile.gettempdir(), "intervia_uploads", "resumes"
)
os.makedirs(RESUME_UPLOAD_DIR, exist_ok=True)

HASURA_URL = os.getenv("HASURA_URL")
HASURA_ADMIN_SECRET = os.getenv("HASURA_ADMIN_SECRET")

HEADERS = {
    "Content-Type": "application/json",
    "x-hasura-admin-secret": HASURA_ADMIN_SECRET,
}

RESUME_SCHEMA = {
    "type": "object",
    "properties": {
        "candidate": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "email": {"type": "string"},
                "phone": {"type": "string"},
                "location": {"type": "string"},
                "linkedin": {"type": "string"},
                "github": {"type": "string"},
            },
            "required": ["name", "email", "phone", "location", "linkedin", "github"],
        },
        "professional_summary": {"type": "string"},
        "experience_level": {"type": "string"},
        "skills": {"type": "array", "items": {"type": "string"}},
        "experience": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "job_title": {"type": "string"},
                    "company": {"type": "string"},
                    "location": {"type": "string"},
                    "start_date": {"type": "string"},
                    "end_date": {"type": "string"},
                    "description": {"type": "string"},
                },
                "required": [
                    "job_title",
                    "company",
                    "location",
                    "start_date",
                    "end_date",
                    "description",
                ],
            },
        },
        "education": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "degree": {"type": "string"},
                    "institution": {"type": "string"},
                    "location": {"type": "string"},
                    "start_date": {"type": "string"},
                    "end_date": {"type": "string"},
                },
                "required": [
                    "degree",
                    "institution",
                    "location",
                    "start_date",
                    "end_date",
                ],
            },
        },
        "projects": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "technologies": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["name", "description", "technologies"],
            },
        },
        "certifications": {"type": "array", "items": {"type": "string"}},
        "languages": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "candidate",
        "professional_summary",
        "experience_level",
        "skills",
        "experience",
        "education",
        "projects",
        "certifications",
        "languages",
    ],
}

RESUME_PROMPT = """
You are Intervia's professional resume analysis engine.

Analyze the uploaded resume carefully and extract only information that is actually present in the resume.

Do not invent employers, dates, skills, education, projects, certifications, contact details, or experience.

If a field is not available, return an empty string or an empty array.

Determine the candidate's experience level from the evidence in the resume. Use one of:
Student, Entry Level, Junior, Mid Level, Senior, Lead, Executive, or Not Specified.

For skills, extract technical and professional skills that are explicitly present.

For experience, preserve the actual job title, company, location, dates and a concise description of the responsibilities or achievements.

For projects, extract projects explicitly mentioned in the resume and include the technologies used when available.

Return only the requested structured JSON.
"""


def extract_docx_text(file):
    document = Document(file)
    parts = []

    for paragraph in document.paragraphs:
        text = paragraph.text.strip()
        if text:
            parts.append(text)

    for table in document.tables:
        for row in table.rows:
            cells = []
            for cell in row.cells:
                text = cell.text.strip()
                if text:
                    cells.append(text)
            if cells:
                parts.append(" | ".join(cells))

    return "\n".join(parts)


@app.route("/api/resume/parse", methods=["POST"])
def parse_resume():
    file = request.files.get("resume")
    user_id = request.form.get("user_id")

    if not file:
        return jsonify({"error": "Please select a resume file."}), 400

    if not user_id:
        return jsonify({"error": "User ID is required."}), 400

    if not file.filename:
        return jsonify({"error": "Invalid resume file."}), 400

    extension = os.path.splitext(file.filename)[1].lower()

    if extension not in [".pdf", ".docx"]:
        return jsonify({"error": "Only PDF and DOCX files are supported."}), 400

    file_data = file.read()

    if len(file_data) > 10 * 1024 * 1024:
        return jsonify({"error": "Resume must be smaller than 10 MB."}), 400

    try:
        if extension == ".pdf":
            resume_content = types.Part.from_bytes(
                data=file_data,
                mime_type="application/pdf"
            )
            contents = [RESUME_PROMPT, resume_content]

        else:
            from io import BytesIO

            resume_text = extract_docx_text(BytesIO(file_data))

            if not resume_text.strip():
                return jsonify({
                    "error": "Could not extract text from the DOCX resume."
                }), 400

            contents = [
                RESUME_PROMPT +
                "\n\nRESUME TEXT:\n" +
                resume_text
            ]

        response = gemini_client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=contents,
            config={
                "response_mime_type": "application/json",
                "response_schema": RESUME_SCHEMA,
            },
        )

        if not response.text:
            return jsonify({
                "error": "Gemini returned an empty response."
            }), 502

        resume_data = json.loads(response.text)

        resume_id = str(uuid.uuid4())

        user_resume_dir = os.path.join(
            RESUME_UPLOAD_DIR,
            user_id
        )

        os.makedirs(
            user_resume_dir,
            exist_ok=True
        )

        safe_filename = secure_filename(file.filename)

        stored_filename = f"{resume_id}{extension}"

        stored_path = os.path.join(
            user_resume_dir,
            stored_filename
        )

        with open(stored_path, "wb") as saved_file:
            saved_file.write(file_data)

        file_url = f"/api/resume/view/{resume_id}"

        deactivate_mutation = """
        mutation DeactivateResumes($userId:uuid!){
            update_resumes(
                where:{
                    user_id:{_eq:$userId},
                    is_active:{_eq:true}
                }
                _set:{
                    is_active:false
                }
            ){
                affected_rows
            }
        }
        """

        deactivate_response = requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={
                "query": deactivate_mutation,
                "variables": {
                    "userId": user_id
                }
            }
        )

        deactivate_result = deactivate_response.json()

        if "errors" in deactivate_result:
            print(
                "Deactivate resume error:",
                deactivate_result["errors"]
            )

            if os.path.exists(stored_path):
                os.remove(stored_path)

            return jsonify({
                "error": "Could not update the previous resume."
            }), 500

        insert_mutation = """
        mutation SaveResume(
            $id:uuid!,
            $userId:uuid!,
            $fileName:String!,
            $fileUrl:String!,
            $parsedData:jsonb!
        ){
            insert_resumes_one(
                object:{
                    id:$id
                    user_id:$userId
                    file_name:$fileName
                    file_url:$fileUrl
                    is_active:true
                    parsed_data:$parsedData
                }
            ){
                id
                user_id
                file_name
                file_url
                uploaded_at
                is_active
                parsed_data
            }
        }
        """

        insert_response = requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={
                "query": insert_mutation,
                "variables": {
                    "id": resume_id,
                    "userId": user_id,
                    "fileName": safe_filename,
                    "fileUrl": file_url,
                    "parsedData": resume_data
                }
            }
        )

        insert_result = insert_response.json()

        if "errors" in insert_result:
            print(
                "Save resume error:",
                insert_result["errors"]
            )

            if os.path.exists(stored_path):
                os.remove(stored_path)

            return jsonify({
                "error": insert_result["errors"][0]["message"]
            }), 500

        saved_resume = insert_result["data"]["insert_resumes_one"]

        print(
            f"Resume {resume_id} saved successfully."
        )

        print(
            json.dumps(
                resume_data,
                indent=2
            )
        )

        return jsonify({
            "success": True,
            "resume": resume_data,
            "saved_resume": saved_resume
        }), 200

    except json.JSONDecodeError:
        print(
            "Gemini returned invalid JSON:",
            response.text if "response" in locals() else ""
        )

        return jsonify({
            "error": "Gemini returned an invalid resume analysis."
        }), 502

    except Exception as e:
        print(
            "Resume analysis error:",
            str(e)
        )

        return jsonify({
            "error": "Unable to analyze and save the resume.",
            "details": str(e)
        }), 500
@app.route("/api/resume/view/<resume_id>", methods=["GET"])
def view_resume(resume_id):
    try:
        user_id = request.args.get("user_id")

        if not user_id:
            return jsonify({
                "error": "User ID is required."
            }), 400

        query = """
        query GetResumeFile($id: uuid!) {
            resumes_by_pk(id: $id) {
                id
                user_id
                file_name
            }
        }
        """

        response = requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={
                "query": query,
                "variables": {
                    "id": resume_id
                }
            }
        )

        result = response.json()

        if "errors" in result:
            print(
                "Resume lookup error:",
                result["errors"]
            )

            return jsonify({
                "error": "Could not load resume."
            }), 500

        resume = result["data"].get("resumes_by_pk")

        if not resume:
            return jsonify({
                "error": "Resume not found."
            }), 404

        if resume["user_id"] != user_id:
            return jsonify({
                "error": "You are not authorized to view this resume."
            }), 403

        original_filename = secure_filename(
            resume["file_name"]
        )

        extension = os.path.splitext(
            original_filename
        )[1].lower()

        stored_filename = f"{resume_id}{extension}"

        file_path = os.path.join(
            RESUME_UPLOAD_DIR,
            user_id,
            stored_filename
        )

        if not os.path.exists(file_path):
            return jsonify({
                "error": "Resume file is not available."
            }), 404

        mime_types = {
            ".pdf": "application/pdf",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        }

        return send_file(
            file_path,
            mimetype=mime_types.get(
                extension,
                "application/octet-stream"
            ),
            as_attachment=False,
            download_name=original_filename
        )

    except Exception as e:
        print(
            "Resume view error:",
            str(e)
        )

        return jsonify({
            "error": "Unable to open the resume."
        }), 500

@app.route("/api/resume/<resume_id>", methods=["DELETE"])
def delete_resume(resume_id):
    try:
        data = request.get_json() or {}
        user_id = data.get("user_id")

        if not user_id:
            return jsonify({
                "error": "User ID is required."
            }), 400

        query = """
        query GetResumeForDelete($id: uuid!) {
            resumes_by_pk(id: $id) {
                id
                user_id
                file_name
            }
        }
        """

        response = requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={
                "query": query,
                "variables": {
                    "id": resume_id
                }
            }
        )

        result = response.json()

        if "errors" in result:
            print(
                "Resume lookup error:",
                result["errors"]
            )

            return jsonify({
                "error": "Could not find the resume."
            }), 500

        resume = result["data"].get("resumes_by_pk")

        if not resume:
            return jsonify({
                "error": "Resume not found."
            }), 404

        if resume["user_id"] != user_id:
            return jsonify({
                "error": "You are not authorized to remove this resume."
            }), 403

        original_filename = secure_filename(
            resume["file_name"]
        )

        extension = os.path.splitext(
            original_filename
        )[1].lower()

        stored_filename = f"{resume_id}{extension}"

        file_path = os.path.join(
            RESUME_UPLOAD_DIR,
            user_id,
            stored_filename
        )

        delete_mutation = """
        mutation DeleteResume($id: uuid!) {
            delete_resumes_by_pk(id: $id) {
                id
            }
        }
        """

        delete_response = requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={
                "query": delete_mutation,
                "variables": {
                    "id": resume_id
                }
            }
        )

        delete_result = delete_response.json()

        if "errors" in delete_result:
            print(
                "Resume delete error:",
                delete_result["errors"]
            )

            return jsonify({
                "error": "Unable to remove the resume."
            }), 500

        deleted_resume = delete_result["data"].get(
            "delete_resumes_by_pk"
        )

        if not deleted_resume:
            return jsonify({
                "error": "Resume could not be removed."
            }), 500

        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError as file_error:
                print(
                    "Resume file cleanup error:",
                    str(file_error)
                )

        print(
            f"Resume {resume_id} removed successfully."
        )

        return jsonify({
            "success": True,
            "message": "Resume removed successfully."
        }), 200

    except Exception as e:
        print(
            "Resume delete error:",
            str(e)
        )

        return jsonify({
            "error": "Unable to remove the resume.",
            "details": str(e)
        }), 500
    
@app.route("/api/test-gemini", methods=["GET"])
def test_gemini():
    try:
        response = gemini_client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents="Reply with exactly: Gemini connection successful",
        )
        return jsonify({"message": response.text})
    except Exception as e:
        print("Gemini error:", str(e))
        return jsonify({"error": str(e)}), 500


@app.route("/")
def home():
    return jsonify({"success": True, "message": "Intervia Backend Running"})


@app.route("/register", methods=["POST"])
def register():
    try:
        data = request.get_json()

        full_name = data.get("full_name")
        email = data.get("email")
        password = data.get("password")

        if not full_name or not email or not password:
            return jsonify({"success": False, "error": "All fields are required."}), 400

        password_hash = generate_password_hash(password)

        mutation = """
        mutation RegisterUser(
            $full_name: String!,
            $email: String!,
            $password_hash: String!
        ) {
            insert_users_one(
                object: {
                    full_name: $full_name,
                    email: $email,
                    password_hash: $password_hash
                }
            ) {
                id
                full_name
                email
                profile_image
                target_role
            }
        }
        """

        response = requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={
                "query": mutation,
                "variables": {
                    "full_name": full_name,
                    "email": email,
                    "password_hash": password_hash,
                },
            },
        )

        result = response.json()

        if "errors" in result:
            return (
                jsonify({"success": False, "error": result["errors"][0]["message"]}),
                400,
            )

        return jsonify({"success": True, "user": result["data"]["insert_users_one"]})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/login", methods=["POST"])
def login():
    try:
        data = request.get_json()

        email = data.get("email")
        password = data.get("password")

        if not email or not password:
            return (
                jsonify(
                    {"success": False, "message": "Email and password are required."}
                ),
                400,
            )

        query = """
        query Login($email: String!) {
            users(
                where: {email: {_eq: $email}},
                limit: 1
            ) {
                id
                full_name
                email
                password_hash
                profile_image
                target_role
            }
        }
        """

        response = requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={"query": query, "variables": {"email": email}},
        )

        result = response.json()

        if "errors" in result:
            return (
                jsonify({"success": False, "message": result["errors"][0]["message"]}),
                400,
            )

        users = result["data"]["users"]

        if not users:
            return jsonify({"success": False, "message": "Email not found."})

        user = users[0]

        if not check_password_hash(user["password_hash"], password):
            return jsonify({"success": False, "message": "Incorrect password."})

        del user["password_hash"]

        return jsonify({"success": True, "user": user})

    except Exception as e:
        return jsonify({"success": False, "message": "Server error."}), 500


@app.route("/api/dashboard", methods=["POST"])
def dashboard_data():
    try:
        data = request.get_json() or {}
        user_id = data.get("user_id")

        if not user_id:
            return jsonify({"error": "User ID is required."}), 400

        query = """
        query DashboardData($userId: uuid!) {
            user: users_by_pk(id: $userId) {
                id
                full_name
                email
                profile_image
                target_role
            }

            resume: resumes(
                where: {
                    user_id: {_eq: $userId},
                    is_active: {_eq: true}
                },
                order_by: {uploaded_at: desc},
                limit: 1
            ) {
                id
                file_name
                file_url
                uploaded_at
                parsed_data
            }

            interviews: interviews(
                where: {
                    user_id: {_eq: $userId},
                    status: {_eq: "completed"},
                    completed_at: {_is_null: false}
                },
                order_by: {completed_at: desc},
                limit: 10
            ) {
                id
                interview_type
                duration_minutes
                questions_asked
                overall_score
                rating
                started_at
                completed_at
                status
            }
        }
        """

        response = requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={
                "query": query,
                "variables": {
                    "userId": user_id
                }
            }
        )

        result = response.json()

        if "errors" in result:
            print("Hasura dashboard error:", result["errors"])
            return jsonify({"error": result["errors"][0]["message"]}), 500

        dashboard = result["data"]

        interviews = dashboard.get("interviews") or []

        interview_ids = [interview["id"] for interview in interviews]

        scores_by_interview = {}

        if interview_ids:
            scores_query = """
            query DashboardInterviewScores($interviewIds: [uuid!]!) {
                interview_scores(
                    where: {
                        interview_id: {_in: $interviewIds}
                    }
                ) {
                    interview_id
                    communication
                    confidence
                    technical_skills
                    answer_structure
                }
            }
            """

            scores_response = requests.post(
                HASURA_URL,
                headers=HEADERS,
                json={
                    "query": scores_query,
                    "variables": {
                        "interviewIds": interview_ids
                    }
                }
            )

            scores_result = scores_response.json()

            if "errors" in scores_result:
                print("Hasura interview scores error:", scores_result["errors"])
                return jsonify({
                    "error": scores_result["errors"][0]["message"]
                }), 500

            scores = scores_result["data"].get("interview_scores") or []

            scores_by_interview = {
                score["interview_id"]: score
                for score in scores
            }

        for interview in interviews:
            score = scores_by_interview.get(interview["id"])

            if score:
                interview["competency_scores"] = {
                    "communication": float(score.get("communication") or 0),
                    "confidence": float(score.get("confidence") or 0),
                    "technical_skills": float(score.get("technical_skills") or 0),
                    "answer_structure": float(score.get("answer_structure") or 0)
                }
            else:
                interview["competency_scores"] = {
                    "communication": 0,
                    "confidence": 0,
                    "technical_skills": 0,
                    "answer_structure": 0
                }

        return jsonify({
            "success": True,
            "user": dashboard.get("user"),
            "resume": (dashboard.get("resume") or [None])[0],
            "interviews": interviews
        }), 200

    except Exception as e:
        print("Dashboard API error:", str(e))
        return jsonify({
            "error": str(e)
        }), 500

INTERVIEW_QUESTIONS_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "category": {"type": "string"},
                    "difficulty": {"type": "string"},
                },
                "required": ["question", "category", "difficulty"],
            },
        }
    },
    "required": ["questions"],
}
INTERVIEW_EVALUATION_SCHEMA = {
    "type": "object",
    "properties": {
        "evaluations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question_number": {"type": "integer"},
                    "score": {"type": "integer"},
                    "feedback": {"type": "string"},
                },
                "required": ["question_number", "score", "feedback"],
            },
        },
        "overall_score": {"type": "integer"},
        "rating": {"type": "integer"},
        "communication": {"type": "integer"},
        "confidence": {"type": "integer"},
        "technical_skills": {"type": "integer"},
        "answer_structure": {"type": "integer"},
        "summary": {"type": "string"},
    },
    "required": [
        "evaluations",
        "overall_score",
        "rating",
        "communication",
        "confidence",
        "technical_skills",
        "answer_structure",
        "summary",
    ],
}


@app.route("/api/interview/start", methods=["POST"])
def start_interview():
    try:
        data = request.get_json() or {}

        user_id = data.get("user_id")
        target_role = data.get("target_role")
        experience_level = data.get("experience_level")
        interview_type = data.get("interview_type")
        interview_mode = data.get("interview_mode", "text")

        question_count_raw = data.get("question_count")
        duration_minutes_raw = data.get("duration_minutes")

        if interview_mode == "voice":
            question_count = None
            duration_minutes = int(duration_minutes_raw or 5)
        else:
            question_count = int(question_count_raw or 15)
            duration_minutes = None

        if not user_id:
            return jsonify({"error": "User ID is required."}), 400

        if not target_role:
            return jsonify({"error": "Target role is required."}), 400

        if not experience_level:
            return jsonify({"error": "Experience level is required."}), 400

        if interview_type not in ["technical", "behavioral", "full"]:
            return jsonify({"error": "Invalid interview type."}), 400

        if interview_mode not in ["text", "voice"]:
            return jsonify({"error": "Invalid interview mode."}), 400

        if interview_mode == "voice":
            if duration_minutes not in [5, 10, 15]:
                return jsonify({
                    "error": "Voice interview duration must be 5, 10, or 15 minutes."
                }), 400
        else:
            if question_count not in [5, 10, 15]:
                return jsonify({
                    "error": "Text interview question count must be 5, 10, or 15."
                }), 400

        resume_query = """
        query GetActiveResume($userId: uuid!) {
            resumes(
                where: {
                    user_id: {_eq: $userId},
                    is_active: {_eq: true}
                },
                order_by: {uploaded_at: desc},
                limit: 1
            ) {
                id
                file_name
                parsed_data
            }
        }
        """

        resume_response = requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={
                "query": resume_query,
                "variables": {
                    "userId": user_id
                }
            }
        )

        resume_result = resume_response.json()

        if "errors" in resume_result:
            print(
                "Resume lookup error:",
                resume_result["errors"]
            )
            return jsonify({
                "error": "Could not load your resume."
            }), 500

        resumes = resume_result["data"].get("resumes") or []

        if not resumes:
            return jsonify({
                "error": "Please upload and analyze your resume first."
            }), 400

        resume = resumes[0]
        resume_data = resume.get("parsed_data") or {}

        resume_json = json.dumps(
            resume_data,
            ensure_ascii=False,
            indent=2
        )

        if interview_mode == "voice":

            from datetime import datetime, timezone

            interview_mutation = """
            mutation CreateVoiceInterview(
                $userId: uuid!,
                $interviewType: String!,
                $interviewMode: String!,
                $durationMinutes: Int!,
                $questionsAsked: Int!,
                $startedAt: timestamptz!,
                $status: String!
            ) {
                insert_interviews_one(
                    object: {
                        user_id: $userId
                        interview_type: $interviewType
                        interview_mode: $interviewMode
                        duration_minutes: $durationMinutes
                        questions_asked: $questionsAsked
                        overall_score: 0
                        rating: 0
                        started_at: $startedAt
                        status: $status
                    }
                ) {
                    id
                    user_id
                    interview_type
                    interview_mode
                    duration_minutes
                    questions_asked
                    overall_score
                    rating
                    started_at
                    created_at
                    status
                }
            }
            """

            started_at = datetime.now(
                timezone.utc
            ).isoformat()

            interview_response = requests.post(
                HASURA_URL,
                headers=HEADERS,
                json={
                    "query": interview_mutation,
                    "variables": {
                        "userId": user_id,
                        "interviewType": interview_type,
                        "interviewMode": "voice",
                        "durationMinutes": duration_minutes,
                        "questionsAsked": 0,
                        "startedAt": started_at,
                        "status": "in_progress"
                    }
                }
            )

            interview_result = interview_response.json()

            if "errors" in interview_result:
                print(
                    "Create voice interview error:",
                    interview_result["errors"]
                )

                return jsonify({
                    "error":
                        interview_result["errors"][0]["message"]
                }), 500

            interview = interview_result["data"]["insert_interviews_one"]

            print(
                f"Voice interview {interview['id']} created "
                f"with {duration_minutes} minutes."
            )

            return jsonify({
                "success": True,
                "interview": interview,
                "questions": [],
                "target_role": target_role,
                "experience_level": experience_level,
                "interview_type": interview_type,
                "interview_mode": "voice",
                "duration_minutes": duration_minutes,
                "resume": resume_data
            }), 200

        previous_interviews_query = """
        query GetPreviousInterviews($userId: uuid!) {
            interviews(
                where: {user_id: {_eq: $userId}},
                order_by: {created_at: desc}
            ) {
                id
                created_at
            }
        }
        """

        previous_interviews_response = requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={
                "query": previous_interviews_query,
                "variables": {
                    "userId": user_id
                }
            }
        )

        previous_interviews_result = (
            previous_interviews_response.json()
        )

        if "errors" in previous_interviews_result:
            print(
                "Previous interviews lookup error:",
                previous_interviews_result["errors"]
            )

            return jsonify({
                "error":
                    "Could not load previous interview history."
            }), 500

        previous_interviews = (
            previous_interviews_result["data"].get(
                "interviews"
            ) or []
        )

        previous_questions = []

        if previous_interviews:

            previous_interview_ids = [
                interview["id"]
                for interview in previous_interviews
            ]

            previous_questions_query = """
            query GetPreviousQuestions($interviewIds: [uuid!]!) {
                interview_questions(
                    where: {
                        interview_id: {
                            _in: $interviewIds
                        }
                    },
                    order_by: {
                        created_at: desc
                    }
                ) {
                    question
                }
            }
            """

            previous_questions_response = requests.post(
                HASURA_URL,
                headers=HEADERS,
                json={
                    "query": previous_questions_query,
                    "variables": {
                        "interviewIds":
                            previous_interview_ids
                    }
                }
            )

            previous_questions_result = (
                previous_questions_response.json()
            )

            if "errors" in previous_questions_result:
                print(
                    "Previous questions lookup error:",
                    previous_questions_result["errors"]
                )

                return jsonify({
                    "error":
                        "Could not load previous interview questions."
                }), 500

            previous_questions = [
                item["question"]
                for item in previous_questions_result["data"].get(
                    "interview_questions"
                ) or []
                if item.get("question")
            ]

        previous_questions_text = "\n".join(
            f"- {question}"
            for question in previous_questions
        )

        if not previous_questions_text:
            previous_questions_text = (
                "No previous interview questions. "
                "This is the candidate's first interview."
            )

        if interview_type == "technical":

            interview_focus = """
Focus mainly on technical knowledge, programming concepts,
technologies, projects, architecture, debugging and problem solving.
Include behavioral or introductory questions only where they naturally
fit a realistic technical interview.
"""

        elif interview_type == "behavioral":

            interview_focus = """
Focus mainly on behavioral questions, communication,
teamwork, leadership, conflict handling, decision making and real experience.
Use the candidate's resume to make the behavioral questions specific.
"""

        else:

            interview_focus = """
Create a balanced interview containing introductory,
technical, project-based, problem-solving and behavioral questions.
"""

        interview_prompt = f"""
You are Intervia's AI mock interview question generator.

Create exactly {question_count} interview questions for the candidate.

TARGET ROLE:
{target_role}

EXPERIENCE LEVEL:
{experience_level}

INTERVIEW TYPE:
{interview_type}

INTERVIEW FOCUS:
{interview_focus}

CANDIDATE RESUME:
{resume_json}

QUESTIONS ASKED IN PREVIOUS INTERVIEWS:
{previous_questions_text}

IMPORTANT RULES:

1. Generate exactly {question_count} questions.
2. The first question should feel like a realistic interview opening.
3. For the opening question, use a natural variation of a question such as asking the candidate to introduce themselves, summarize their background, or walk through their experience.
4. Do not use the exact phrase "Tell me about yourself" every time.
5. Questions must be based on the candidate's actual resume.
6. Do not invent technologies, companies, projects, education or experience.
7. Use the target role to decide what knowledge and skills should be tested.
8. Include resume-specific questions.
9. Include project questions when projects exist.
10. Start with easier questions and gradually increase difficulty.
11. Avoid asking questions from previous interviews.
12. Do not repeat the same question using slightly different wording.
13. Do not repeat a previous question unless it is especially important for evaluating the candidate.
14. If a previous topic is important, test it using a meaningfully different question rather than copying the old question.
15. For a 5-question interview, strongly prefer all new questions.
16. For larger interviews, prioritize new questions while allowing occasional natural revisiting of important skills.
17. Questions should sound like realistic human interview questions.
18. Questions should match the selected interview type.
19. Do not provide answers.
20. Do not provide explanations.
21. Return only the requested JSON.

Question progression should generally follow this pattern:

Question 1:
Realistic opening/introduction question.

Early questions:
Resume, background, basic technical or project questions.

Middle questions:
Deeper technical, project or behavioral questions.

Later questions:
Harder technical, problem-solving, scenario or role-specific questions.

Allowed categories:
technical, project, behavioral, problem-solving, resume

Allowed difficulty values:
easy, medium, hard

Each question must contain:
- question
- category
- difficulty
"""

        print("Generating interview questions...")
        print(
            f"Previous questions available: "
            f"{len(previous_questions)}"
        )

        ai_response = gemini_client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=interview_prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema":
                    INTERVIEW_QUESTIONS_SCHEMA,
            },
        )

        if not ai_response.text:
            return jsonify({
                "error": "AI returned an empty response."
            }), 502

        generated_data = json.loads(
            ai_response.text
        )

        questions = (
            generated_data.get("questions")
            or []
        )

        if len(questions) != question_count:

            print(
                f"Expected {question_count} questions, "
                f"but AI returned {len(questions)}."
            )

            return jsonify({
                "error":
                    "AI did not generate the required number of questions."
            }), 502

        interview_mutation = """
        mutation CreateInterview(
            $userId: uuid!,
            $interviewType: String!,
            $interviewMode: String!,
            $durationMinutes: Int,
            $questionsAsked: Int!,
            $startedAt: timestamptz!,
            $status: String!
        ) {
            insert_interviews_one(
                object: {
                    user_id: $userId
                    interview_type: $interviewType
                    interview_mode: $interviewMode
                    duration_minutes: $durationMinutes
                    questions_asked: $questionsAsked
                    overall_score: 0
                    rating: 0
                    started_at: $startedAt
                    status: $status
                }
            ) {
                id
                user_id
                interview_type
                interview_mode
                duration_minutes
                questions_asked
                overall_score
                rating
                started_at
                created_at
                status
            }
        }
        """

        from datetime import datetime, timezone

        started_at = datetime.now(
            timezone.utc
        ).isoformat()

        interview_response = requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={
                "query": interview_mutation,
                "variables": {
                    "userId": user_id,
                    "interviewType": interview_type,
                    "interviewMode": "text",
                    "durationMinutes": None,
                    "questionsAsked": question_count,
                    "startedAt": started_at,
                    "status": "in_progress"
                }
            }
        )

        interview_result = interview_response.json()

        if "errors" in interview_result:

            print(
                "Create interview error:",
                interview_result["errors"]
            )

            return jsonify({
                "error":
                    interview_result["errors"][0]["message"]
            }), 500

        interview = (
            interview_result["data"]
            ["insert_interviews_one"]
        )

        interview_id = interview["id"]

        question_objects = []

        for index, item in enumerate(
            questions,
            start=1
        ):

            question_objects.append({
                "interview_id": interview_id,
                "question_number": index,
                "question": item["question"],
                "answer": None,
                "score": 0,
                "feedback": None
            })

        questions_mutation = """
        mutation SaveInterviewQuestions(
            $objects: [interview_questions_insert_input!]!
        ) {
            insert_interview_questions(
                objects: $objects
            ) {
                affected_rows
                returning {
                    id
                    interview_id
                    question_number
                    question
                    answer
                    score
                    feedback
                }
            }
        }
        """

        questions_response = requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={
                "query": questions_mutation,
                "variables": {
                    "objects": question_objects
                }
            }
        )

        questions_result = (
            questions_response.json()
        )

        if "errors" in questions_result:

            print(
                "Save questions error:",
                questions_result["errors"]
            )

            return jsonify({
                "error":
                    questions_result["errors"][0]["message"]
            }), 500

        saved_questions = (
            questions_result["data"]
            ["insert_interview_questions"]
            ["returning"]
        )

        print(
            f"Interview {interview_id} created "
            f"with {len(saved_questions)} questions."
        )

        return jsonify({
            "success": True,
            "interview": interview,
            "questions": saved_questions,
            "target_role": target_role,
            "experience_level": experience_level,
            "interview_type": interview_type,
            "interview_mode": "text",
            "duration_minutes": None
        }), 200

    except ValueError:
        return jsonify({
            "error": "Invalid interview duration or question count."
        }), 400

    except json.JSONDecodeError:
        print("AI returned invalid JSON.")

        return jsonify({
            "error": "AI returned invalid interview questions."
        }), 502

    except Exception as e:

        print(
            "Start interview error:",
            str(e)
        )

        return jsonify({
            "error": "Unable to start the interview.",
            "details": str(e)
        }), 500
    
@app.route("/api/interview/cancel", methods=["POST"])
def cancel_interview():
    try:
        data = request.get_json() or {}

        user_id = data.get("user_id")
        interview_id = data.get("interview_id")

        if not user_id:
            return jsonify({"error": "User ID is required."}), 400

        if not interview_id:
            return jsonify({"error": "Interview ID is required."}), 400

        mutation = """
        mutation CancelInterview(
            $id: uuid!,
            $userId: uuid!,
            $status: String!
        ) {
            update_interviews(
                where: {
                    id: {_eq: $id},
                    user_id: {_eq: $userId},
                    status: {_eq: "in_progress"}
                },
                _set: {
                    status: $status
                }
            ) {
                affected_rows
                returning {
                    id
                    status
                }
            }
        }
        """

        response = requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={
                "query": mutation,
                "variables": {
                    "id": interview_id,
                    "userId": user_id,
                    "status": "cancelled"
                }
            }
        )

        result = response.json()

        if "errors" in result:
            print("Cancel interview error:", result["errors"])
            return jsonify({"error": result["errors"][0]["message"]}), 500

        cancelled = result["data"]["update_interviews"]

        if cancelled["affected_rows"] == 0:
            return jsonify({
                "error": "Interview cannot be cancelled."
            }), 400

        return jsonify({
            "success": True,
            "interview_id": interview_id,
            "status": "cancelled"
        }), 200

    except Exception as e:
        print("Cancel interview error:", str(e))
        return jsonify({
            "error": "Unable to cancel the interview.",
            "details": str(e)
        }), 500

@app.route("/api/interview/submit", methods=["POST"])
def submit_interview():
    try:
        data = request.get_json() or {}
        user_id = data.get("user_id")
        interview_id = data.get("interview_id")
        answers = data.get("answers") or []

        if not user_id or not interview_id:
            return jsonify({"error": "User ID and interview ID are required."}), 400

        interview_query = """
        query GetInterview($id: uuid!) {
            interviews_by_pk(id: $id) {
                id
                user_id
                started_at
                status
            }
        }
        """

        interview_response = requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={
                "query": interview_query,
                "variables": {
                    "id": interview_id
                }
            }
        )

        interview_result = interview_response.json()

        if "errors" in interview_result:
            return jsonify({"error": "Could not load interview."}), 500

        interview = interview_result["data"].get("interviews_by_pk")

        if not interview:
            return jsonify({"error": "Interview not found."}), 404

        if interview["user_id"] != user_id:
            return jsonify({"error": "You are not authorized to submit this interview."}), 403

        if interview["status"] != "in_progress":
            return jsonify({"error": "This interview has already been completed or cancelled."}), 400

        questions_query = """
        query GetInterviewQuestions($interviewId: uuid!) {
            interview_questions(
                where: {interview_id: {_eq: $interviewId}}
                order_by: {question_number: asc}
            ) {
                id
                question_number
                question          
            }
        }
        """

        questions_response = requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={
                "query": questions_query,
                "variables": {
                    "interviewId": interview_id
                }
            }
        )

        questions_result = questions_response.json()

        if "errors" in questions_result:
            print("Question fetch error:", questions_result["errors"])
            return jsonify({"error": "Could not load interview questions."}), 500

        questions = questions_result["data"].get("interview_questions") or []

        if not questions:
            return jsonify({"error": "No interview questions found."}), 400

        answer_map = {}

        for item in answers:
            try:
                question_number = int(item.get("question_number"))
                answer_map[question_number] = item.get("answer", "").strip()
            except (TypeError, ValueError):
                continue

        evaluation_prompt = f"""
You are an expert interview evaluator.

Evaluate the candidate's answers to the interview questions below.

INTERVIEW QUESTIONS AND ANSWERS:
{json.dumps([
    {
        "question_number": q["question_number"],
        "question": q["question"],
        "category": q.get("category", ""),
        "difficulty": q.get("difficulty", ""),
        "answer": answer_map.get(q["question_number"], "")
    }
    for q in questions
], indent=2)}

Scoring:
0 = no answer or completely incorrect
1-2 = very weak
3-4 = below average
5-6 = acceptable
7-8 = good
9 = excellent
10 = exceptional

Consider:
- Correctness
- Relevance
- Technical understanding
- Clarity
- Completeness
- Practical reasoning
- Communication quality

For behavioral questions, consider:
- Situation/context
- Candidate's actions
- Reasoning
- Result
- Reflection

For technical questions, consider:
- Accuracy
- Understanding of concepts
- Appropriate technical terminology
- Problem-solving approach

IMPORTANT:
1. Evaluate every question.
2. Do not invent information about the candidate.
3. Judge only the answer that was actually provided.
4. A short answer may receive a lower score if it lacks necessary explanation.
5. Do not punish concise answers when they correctly answer the question.
6. Give specific and useful feedback.
7. Do not provide a model answer.
8. Do not calculate the overall score. The application will calculate it from the individual question scores.
9. Rating must be an integer from 1 to 5.
10. Generate four separate competency scores from the candidate's actual answers.
11. Communication must measure clarity, explanation quality, articulation and ability to communicate ideas.
12. Confidence must measure how confidently and decisively the candidate presents their answers based only on the evidence in their responses.
13. Technical skills must measure technical correctness, depth, understanding and problem-solving ability where applicable.
14. Answer structure must measure organization, logical flow, completeness and how clearly the answer is structured.
15. Each competency score must be an integer from 0 to 100.
16. Do not simply copy the question score average into all four competency scores.
17. The four competency scores should reflect the candidate's actual performance across the complete interview.
18. For answers that are correct, relevant, complete and well explained, use 9 or 10 where appropriate.
19. Return only the requested JSON.

The summary should briefly explain the candidate's overall performance and the most important improvement area.
"""

        print(f"Evaluating interview {interview_id}...")

        ai_response = gemini_client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=evaluation_prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": INTERVIEW_EVALUATION_SCHEMA,
            },
        )

        if not ai_response.text:
            return jsonify({"error": "AI returned an empty evaluation."}), 502

        evaluation_data = json.loads(ai_response.text)

        evaluations = evaluation_data.get("evaluations") or []

        if len(evaluations) != len(questions):
            return jsonify({"error": "AI did not evaluate all interview questions."}), 502

        question_scores = []

        for evaluation in evaluations:
            score = max(0, min(10, int(evaluation.get("score", 0))))
            question_scores.append(score)

        if not question_scores:
            return jsonify({"error": "No question scores were generated."}), 502

        overall_score = round((sum(question_scores) / len(question_scores)) * 10)

        rating = max(1, min(5, int(evaluation_data.get("rating", 1))))

        communication = max(0, min(100, int(evaluation_data.get("communication", 0))))
        confidence = max(0, min(100, int(evaluation_data.get("confidence", 0))))
        technical_skills = max(0, min(100, int(evaluation_data.get("technical_skills", 0))))
        answer_structure = max(0, min(100, int(evaluation_data.get("answer_structure", 0))))

        summary = evaluation_data.get("summary", "")

        evaluation_map = {
            int(item["question_number"]): item
            for item in evaluations
        }

        for question in questions:
            question_number = question["question_number"]
            evaluation = evaluation_map.get(question_number)

            if not evaluation:
                continue

            answer = answer_map.get(question_number, "")
            score = max(0, min(10, int(evaluation.get("score", 0))))

            update_question_mutation = """
            mutation UpdateInterviewQuestion(
                $id: uuid!,
                $answer: String!,
                $score: numeric!,
                $feedback: String!
            ) {
                update_interview_questions_by_pk(
                    pk_columns: {id: $id},
                    _set: {
                        answer: $answer,
                        score: $score,
                        feedback: $feedback
                    }
                ) {
                    id
                    question_number
                    answer
                    score
                    feedback
                }
            }
            """

            update_response = requests.post(
                HASURA_URL,
                headers=HEADERS,
                json={
                    "query": update_question_mutation,
                    "variables": {
                        "id": question["id"],
                        "answer": answer,
                        "score": score,
                        "feedback": evaluation.get("feedback", "")
                    }
                }
            )

            update_result = update_response.json()

            if "errors" in update_result:
                print("Question update error:", update_result["errors"])
                return jsonify({"error": "Could not save interview evaluation."}), 500

        from datetime import datetime, timezone

        completed_datetime = datetime.now(timezone.utc)
        completed_at = completed_datetime.isoformat()

        started_datetime = datetime.fromisoformat(
            interview["started_at"].replace("Z", "+00:00")
        )

        elapsed_seconds = max(
            0,
            int((completed_datetime - started_datetime).total_seconds())
        )

        duration_minutes = max(1, round(elapsed_seconds / 60))

        update_interview_mutation = """
        mutation CompleteInterview(
            $id: uuid!,
            $overallScore: numeric!,
            $rating: Int!,
            $completedAt: timestamptz!,
            $durationMinutes: Int!,
            $status: String!
        ) {
            update_interviews_by_pk(
                pk_columns: {id: $id},
                _set: {
                    overall_score: $overallScore,
                    rating: $rating,
                    completed_at: $completedAt,
                    duration_minutes: $durationMinutes,
                    status: $status
                }
            ) {
                id
                overall_score
                rating
                completed_at
                duration_minutes
                status
            }
        }
        """

        update_interview_response = requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={
                "query": update_interview_mutation,
                "variables": {
                    "id": interview_id,
                    "overallScore": overall_score,
                    "rating": rating,
                    "completedAt": completed_at,
                    "durationMinutes": duration_minutes,
                    "status": "completed"
                }
            }
        )

        update_interview_result = update_interview_response.json()

        if "errors" in update_interview_result:
            print("Interview completion error:", update_interview_result["errors"])
            return jsonify({"error": "Could not complete the interview."}), 500

        scores_mutation = """
        mutation SaveInterviewScores(
            $interviewId: uuid!,
            $communication: numeric!,
            $confidence: numeric!,
            $technicalSkills: numeric!,
            $answerStructure: numeric!
        ) {
            insert_interview_scores_one(
                object: {
                    interview_id: $interviewId
                    communication: $communication
                    confidence: $confidence
                    technical_skills: $technicalSkills
                    answer_structure: $answerStructure
                }
            ) {
                id
                interview_id
                communication
                confidence
                technical_skills
                answer_structure
                created_at
            }
        }
        """

        scores_response = requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={
                "query": scores_mutation,
                "variables": {
                    "interviewId": interview_id,
                    "communication": communication,
                    "confidence": confidence,
                    "technicalSkills": technical_skills,
                    "answerStructure": answer_structure
                }
            }
        )

        scores_result = scores_response.json()

        if "errors" in scores_result:
            print("Interview scores error:", scores_result["errors"])
            return jsonify({"error": "Could not save competency scores."}), 500

        competency_scores = scores_result["data"]["insert_interview_scores_one"]

        print(
            f"Interview {interview_id} evaluated. "
            f"Overall score: {overall_score}, "
            f"Rating: {rating}, "
            f"Duration: {duration_minutes} minutes"
        )

        return jsonify({
            "success": True,
            "interview_id": interview_id,
            "overall_score": overall_score,
            "rating": rating,
            "summary": summary,
            "evaluations": evaluations,
            "communication": communication,
            "confidence": confidence,
            "technical_skills": technical_skills,
            "answer_structure": answer_structure,
            "competency_scores": competency_scores,
            "completed_at": completed_at,
            "duration_minutes": duration_minutes
        }), 200

    except json.JSONDecodeError:
        print("AI returned invalid evaluation JSON.")
        return jsonify({"error": "AI returned an invalid evaluation."}), 502

    except Exception as e:
        import traceback
        traceback.print_exc()
        print("Submit interview error:", str(e))
        return jsonify({
            "error": "Unable to evaluate the interview.",
            "details": str(e)
        }), 500

@sock.route("/ws/voice-interview/<interview_id>")
def voice_interview_socket(ws, interview_id):
    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        print("VOICE ERROR: GEMINI_API_KEY is missing")
        ws.send(json.dumps({
            "type": "error",
            "message": "Gemini API key is not configured."
        }))
        return

    gemini_url = (
        "wss://generativelanguage.googleapis.com/"
        "ws/google.ai.generativelanguage.v1beta.GenerativeService."
        f"BidiGenerateContent?key={api_key}"
    )

    print(f"VOICE: Connecting to Gemini for interview {interview_id}")

    try:
        gemini_ws = websocket.create_connection(
            gemini_url,
            timeout=30
        )

        print("VOICE: Gemini WebSocket connected")

    except Exception as error:
        print("VOICE ERROR: Gemini connection failed:", str(error))

        ws.send(json.dumps({
            "type": "error",
            "message": "Could not connect to Gemini Live."
        }))

        return

    setup_message = {
        "setup": {
            "model": "models/gemini-3.1-flash-live-preview",
            "generationConfig": {
                "responseModalities": ["AUDIO"]
            },
            "systemInstruction": {
                "parts": [
                    {
                        "text": """
You are Intervia's AI interviewer.

Conduct a realistic professional job interview.

Ask one question at a time.
Wait for the candidate to finish speaking.
Respond naturally using voice.
Ask relevant follow-up questions when appropriate.
Use the candidate's target role, experience level and interview type.
Do not give answers or coaching during the interview.

The interview should feel like a real human interview.

Evaluate the candidate based on:
- Answer quality
- Technical knowledge
- Communication
- Confidence in delivery
- Fluency
- Answer structure
- Professionalism

Do not tell the candidate their scores during the interview.
"""
                    }
                ]
            },
            "inputAudioTranscription": {},
            "outputAudioTranscription": {}
        }
    }

    try:
        gemini_ws.send(json.dumps(setup_message))

        print("VOICE: Gemini setup sent")

    except Exception as error:
        print("VOICE ERROR: Gemini setup failed:", str(error))

        ws.send(json.dumps({
            "type": "error",
            "message": "Gemini Live setup failed."
        }))

        gemini_ws.close()
        return

    def browser_to_gemini():
        try:
            while True:
                message = ws.receive()

                if message is None:
                    print("VOICE: Browser disconnected")
                    break

                if isinstance(message, bytes):
                    message = message.decode("utf-8")

                gemini_ws.send(message)

        except Exception as error:
            print("VOICE ERROR: Browser to Gemini:", str(error))

        finally:
            try:
                gemini_ws.close()
            except Exception:
                pass

    def gemini_to_browser():
        try:
            while True:
                message = gemini_ws.recv()

                if message is None:
                    break

                try:
                    parsed = json.loads(message)

                    if "error" in parsed:
                        print(
                            "VOICE ERROR: Gemini returned:",
                            json.dumps(parsed, indent=2)
                        )

                except Exception:
                    pass

                ws.send(message)

        except Exception as error:
            print("VOICE ERROR: Gemini to browser:", str(error))

    browser_thread = threading.Thread(
        target=browser_to_gemini,
        daemon=True
    )

    gemini_thread = threading.Thread(
        target=gemini_to_browser,
        daemon=True
    )

    browser_thread.start()
    gemini_thread.start()

    browser_thread.join()

    try:
        gemini_ws.close()
    except Exception:
        pass

@app.route("/api/voice-interview/complete", methods=["POST"])
def complete_voice_interview():
    try:
        data = request.get_json() or {}

        interview_id = data.get("interview_id")
        user_id = data.get("user_id")
        transcript = data.get("transcript") or []
        duration_seconds = int(data.get("duration_seconds") or 0)

        if not interview_id:
            return jsonify({
                "error": "Interview ID is required."
            }), 400

        if not user_id:
            return jsonify({
                "error": "User ID is required."
            }), 400

        transcript_text = "\n".join(
            f"{item.get('role', item.get('speaker', 'unknown')).upper()}: {item.get('text', '')}"
            for item in transcript
            if item.get("text")
        )

        if not transcript_text.strip():
            transcript_text = "No spoken response was captured."

        query = """
        query GetInterview($id: uuid!) {
            interviews_by_pk(id: $id) {
                id
                user_id
                interview_type
                interview_mode
                questions_asked
                duration_minutes
                started_at
                status
            }
        }
        """

        result = requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={
                "query": query,
                "variables": {
                    "id": interview_id
                }
            }
        ).json()

        if result.get("errors"):
            print(
                "VOICE INTERVIEW LOOKUP ERROR:",
                result["errors"]
            )

            return jsonify({
                "error": result["errors"][0]["message"]
            }), 500

        interview = (
            result.get("data", {})
            .get("interviews_by_pk")
        )

        if not interview:
            return jsonify({
                "error": "Interview not found."
            }), 404

        if str(interview.get("user_id")) != str(user_id):
            return jsonify({
                "error": "Unauthorized interview."
            }), 403

        if interview.get("status") != "in_progress":
            return jsonify({
                "error":
                    "This interview has already been completed or cancelled."
            }), 400

        evaluation_prompt = f"""
You are Intervia's expert voice interview evaluator.

Evaluate the candidate's completed live voice interview.

INTERVIEW TYPE:
{interview.get("interview_type")}

TRANSCRIPT:
{transcript_text}

Evaluate the candidate based only on what they actually said.

Consider:

- Answer quality
- Technical knowledge
- Communication
- Confidence in delivery
- Fluency
- Answer structure
- Professionalism
- Relevance
- Problem-solving ability where applicable

Confidence means how confidently and decisively the candidate communicates based only on observable evidence in their spoken responses.

The interview used dynamically generated questions, so there is no fixed question list and no question numbering.

Return ONLY valid JSON using exactly this structure:

{{
    "overall_score": 0,
    "rating": 0,
    "communication": 0,
    "confidence": 0,
    "technical_skills": 0,
    "answer_structure": 0,
    "summary": "",
    "feedback": ""
}}

Rules:

- overall_score must be an integer from 0 to 100.
- communication must be an integer from 0 to 100.
- confidence must be an integer from 0 to 100.
- technical_skills must be an integer from 0 to 100.
- answer_structure must be an integer from 0 to 100.
- rating must be an integer from 1 to 5.
- Judge only the candidate's actual spoken responses.
- Do not invent skills, experience or achievements.
- Do not assume something is true if the candidate did not say it.
- Be fair and realistic.
- Consider the complete interview.
- Give a useful overall summary.
- Give specific improvement feedback.
"""

        print(
            f"Evaluating voice interview {interview_id}..."
        )

        try:
            evaluation_response = gemini_client.models.generate_content(
                model="gemini-3.5-flash-lite",
                contents=evaluation_prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                )
            )

            if not evaluation_response.text:
                return jsonify({
                    "error": "AI returned an empty evaluation."
                }), 502

            evaluation = json.loads(
                evaluation_response.text
            )

        except Exception as error:
            print(
                "VOICE EVALUATION ERROR:",
                str(error)
            )

            return jsonify({
                "error": "Unable to evaluate the voice interview.",
                "details": str(error)
            }), 500

        overall_score = max(
            0,
            min(
                100,
                int(
                    float(
                        evaluation.get(
                            "overall_score",
                            0
                        )
                    )
                )
            )
        )

        rating = max(
            1,
            min(
                5,
                int(
                    evaluation.get(
                        "rating",
                        1
                    )
                )
            )
        )

        communication = max(
            0,
            min(
                100,
                int(
                    float(
                        evaluation.get(
                            "communication",
                            0
                        )
                    )
                )
            )
        )

        confidence = max(
            0,
            min(
                100,
                int(
                    float(
                        evaluation.get(
                            "confidence",
                            0
                        )
                    )
                )
            )
        )

        technical_skills = max(
            0,
            min(
                100,
                int(
                    float(
                        evaluation.get(
                            "technical_skills",
                            0
                        )
                    )
                )
            )
        )

        answer_structure = max(
            0,
            min(
                100,
                int(
                    float(
                        evaluation.get(
                            "answer_structure",
                            0
                        )
                    )
                )
            )
        )

        duration_minutes = max(
            1,
            round(duration_seconds / 60)
        )

        completed_at = datetime.now(
            timezone.utc
        ).isoformat()

        complete_mutation = """
        mutation CompleteVoiceInterview(
            $id: uuid!,
            $duration: Int!,
            $overall: numeric!,
            $rating: Int!,
            $completedAt: timestamptz!
        ) {
            update_interviews_by_pk(
                pk_columns: {
                    id: $id
                },
                _set: {
                    status: "completed",
                    duration_minutes: $duration,
                    overall_score: $overall,
                    rating: $rating,
                    completed_at: $completedAt
                }
            ) {
                id
                status
                duration_minutes
                overall_score
                rating
                completed_at
            }
        }
        """

        update_result = requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={
                "query": complete_mutation,
                "variables": {
                    "id": interview_id,
                    "duration": duration_minutes,
                    "overall": overall_score,
                    "rating": rating,
                    "completedAt": completed_at
                }
            }
        ).json()

        if update_result.get("errors"):
            print(
                "VOICE COMPLETE ERROR:",
                update_result["errors"]
            )

            return jsonify({
                "error":
                    update_result["errors"][0]["message"]
            }), 500

        score_mutation = """
        mutation SaveVoiceScores(
            $interviewId: uuid!,
            $communication: numeric!,
            $confidence: numeric!,
            $technical: numeric!,
            $structure: numeric!
        ) {
            insert_interview_scores_one(
                object: {
                    interview_id: $interviewId
                    communication: $communication
                    confidence: $confidence
                    technical_skills: $technical
                    answer_structure: $structure
                },
                on_conflict: {
                    constraint: interview_scores_interview_id_key
                    update_columns: [
                        communication
                        confidence
                        technical_skills
                        answer_structure
                    ]
                }
            ) {
                id
                interview_id
                communication
                confidence
                technical_skills
                answer_structure
            }
        }
        """

        score_result = requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={
                "query": score_mutation,
                "variables": {
                    "interviewId": interview_id,
                    "communication": communication,
                    "confidence": confidence,
                    "technical": technical_skills,
                    "structure": answer_structure
                }
            }
        ).json()

        if score_result.get("errors"):
            print(
                "VOICE SCORE ERROR:",
                score_result["errors"]
            )

            return jsonify({
                "error":
                    score_result["errors"][0]["message"]
            }), 500

        print(
            f"Voice interview {interview_id} completed. "
            f"Score: {overall_score}, "
            f"Rating: {rating}, "
            f"Duration: {duration_minutes} minutes"
        )

        return jsonify({
            "success": True,
            "interview_id": interview_id,
            "interview_mode": "voice",
            "overall_score": overall_score,
            "rating": rating,
            "communication": communication,
            "confidence": confidence,
            "technical_skills": technical_skills,
            "answer_structure": answer_structure,
            "summary": evaluation.get("summary", ""),
            "feedback": evaluation.get("feedback", ""),
            "duration_minutes": duration_minutes,
            "completed_at": completed_at,
            "transcript": transcript
        }), 200

    except Exception as error:
        import traceback

        traceback.print_exc()

        print(
            "VOICE COMPLETION ERROR:",
            str(error)
        )

        return jsonify({
            "error":
                "Unable to complete the voice interview.",
            "details": str(error)
        }), 500 
    
if __name__ == "__main__":
    app.run(debug=True, port=5000)
