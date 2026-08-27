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

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
gemini_client = genai.Client(api_key=GEMINI_API_KEY)

app = Flask(__name__)
CORS(app)

HASURA_URL = os.getenv("HASURA_URL")
HASURA_ADMIN_SECRET = os.getenv("HASURA_ADMIN_SECRET")

HEADERS = {
    "Content-Type": "application/json",
    "x-hasura-admin-secret": HASURA_ADMIN_SECRET
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
                "github": {"type": "string"}
            },
            "required": ["name", "email", "phone", "location", "linkedin", "github"]
        },
        "professional_summary": {
            "type": "string"
        },
        "experience_level": {
            "type": "string"
        },
        "skills": {
            "type": "array",
            "items": {"type": "string"}
        },
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
                    "description": {"type": "string"}
                },
                "required": ["job_title", "company", "location", "start_date", "end_date", "description"]
            }
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
                    "end_date": {"type": "string"}
                },
                "required": ["degree", "institution", "location", "start_date", "end_date"]
            }
        },
        "projects": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "technologies": {
                        "type": "array",
                        "items": {"type": "string"}
                    }
                },
                "required": ["name", "description", "technologies"]
            }
        },
        "certifications": {
            "type": "array",
            "items": {"type": "string"}
        },
        "languages": {
            "type": "array",
            "items": {"type": "string"}
        }
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
        "languages"
    ]
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
    paragraphs = [p.text.strip() for p in document.paragraphs if p.text.strip()]
    return "\n".join(paragraphs)

@app.route("/api/resume/parse",methods=["POST"])
def parse_resume():
    file=request.files.get("resume")
    user_id=request.form.get("user_id")

    if not file:
        return jsonify({"error":"Please select a resume file."}),400

    if not user_id:
        return jsonify({"error":"User ID is required."}),400

    if not file.filename:
        return jsonify({"error":"Invalid resume file."}),400

    extension=os.path.splitext(file.filename)[1].lower()

    if extension not in [".pdf",".docx"]:
        return jsonify({"error":"Only PDF and DOCX files are supported."}),400

    file_data=file.read()

    if len(file_data)>10*1024*1024:
        return jsonify({"error":"Resume must be smaller than 10 MB."}),400

    try:
        if extension==".pdf":
            resume_content=types.Part.from_bytes(
                data=file_data,
                mime_type="application/pdf"
            )
            contents=[RESUME_PROMPT,resume_content]
        else:
            from io import BytesIO
            resume_text=extract_docx_text(BytesIO(file_data))

            if not resume_text.strip():
                return jsonify({
                    "error":"Could not extract text from the DOCX resume."
                }),400

            contents=[
                RESUME_PROMPT+
                "\n\nRESUME TEXT:\n"+
                resume_text
            ]

        response=gemini_client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=contents,
            config={
                "response_mime_type":"application/json",
                "response_schema":RESUME_SCHEMA
            }
        )

        if not response.text:
            return jsonify({
                "error":"Gemini returned an empty response."
            }),502

        resume_data=json.loads(response.text)

        deactivate_mutation="""
        mutation DeactivateResumes($userId:uuid!){
            update_resumes(
                where:{user_id:{_eq:$userId},is_active:{_eq:true}}
                _set:{is_active:false}
            ){
                affected_rows
            }
        }
        """

        deactivate_response=requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={
                "query":deactivate_mutation,
                "variables":{
                    "userId":user_id
                }
            }
        )

        deactivate_result=deactivate_response.json()

        if "errors" in deactivate_result:
            print("Deactivate resume error:",deactivate_result["errors"])
            return jsonify({
                "error":"Could not update the previous resume."
            }),500

        insert_mutation="""
        mutation SaveResume(
            $userId:uuid!,
            $fileName:String!,
            $parsedData:jsonb!
        ){
            insert_resumes_one(
                object:{
                    user_id:$userId
                    file_name:$fileName
                    file_url:""
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

        insert_response=requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={
                "query":insert_mutation,
                "variables":{
                    "userId":user_id,
                    "fileName":file.filename,
                    "parsedData":resume_data
                }
            }
        )

        insert_result=insert_response.json()

        if "errors" in insert_result:
            print("Save resume error:",insert_result["errors"])
            return jsonify({
                "error":insert_result["errors"][0]["message"]
            }),500

        saved_resume=insert_result["data"]["insert_resumes_one"]

        print("Resume analysis completed and saved.")
        print(json.dumps(resume_data,indent=2))

        return jsonify({
            "success":True,
            "resume":resume_data,
            "saved_resume":saved_resume
        }),200

    except json.JSONDecodeError:
        print(
            "Gemini returned invalid JSON:",
            response.text if "response" in locals() else ""
        )
        return jsonify({
            "error":"Gemini returned an invalid resume analysis."
        }),502

    except Exception as e:
        print("Resume analysis error:",str(e))
        return jsonify({
            "error":"Unable to analyze and save the resume.",
            "details":str(e)
        }),500

@app.route("/api/test-gemini", methods=["GET"])
def test_gemini():
    try:
        response = gemini_client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents="Reply with exactly: Gemini connection successful"
        )
        return jsonify({"message": response.text})
    except Exception as e:
        print("Gemini error:", str(e))
        return jsonify({"error": str(e)}), 500

@app.route("/")
def home():
    return jsonify({
        "success": True,
        "message": "Intervia Backend Running"
    })

@app.route("/register", methods=["POST"])
def register():
    try:
        data = request.get_json()

        full_name = data.get("full_name")
        email = data.get("email")
        password = data.get("password")

        if not full_name or not email or not password:
            return jsonify({
                "success": False,
                "error": "All fields are required."
            }), 400

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
                    "password_hash": password_hash
                }
            }
        )

        result = response.json()

        if "errors" in result:
            return jsonify({
                "success": False,
                "error": result["errors"][0]["message"]
            }), 400

        return jsonify({
            "success": True,
            "user": result["data"]["insert_users_one"]
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@app.route("/login", methods=["POST"])
def login():
    try:
        data = request.get_json()

        email = data.get("email")
        password = data.get("password")

        if not email or not password:
            return jsonify({
                "success": False,
                "message": "Email and password are required."
            }), 400

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
            json={
                "query": query,
                "variables": {
                    "email": email
                }
            }
        )

        result = response.json()

        if "errors" in result:
            return jsonify({
                "success": False,
                "message": result["errors"][0]["message"]
            }), 400

        users = result["data"]["users"]

        if not users:
            return jsonify({
                "success": False,
                "message": "Email not found."
            })

        user = users[0]

        if not check_password_hash(user["password_hash"], password):
            return jsonify({
                "success": False,
                "message": "Incorrect password."
            })

        del user["password_hash"]

        return jsonify({
            "success": True,
            "user": user
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "message": "Server error."
        }), 500

@app.route("/api/dashboard",methods=["POST"])
def dashboard_data():
    try:
        data=request.get_json()
        user_id=data.get("user_id")

        if not user_id:
            return jsonify({"error":"User ID is required."}),400

        query="""
        query DashboardData($userId:uuid!){
            user:users_by_pk(id:$userId){
                id
                full_name
                email
                profile_image
                target_role
            }
            resume:resumes(
                where:{user_id:{_eq:$userId},is_active:{_eq:true}}
                order_by:{uploaded_at:desc}
                limit:1
            ){
                id
                file_name
                file_url
                uploaded_at
            }
            interviews:interviews(
                where:{user_id:{_eq:$userId}}
                order_by:{completed_at:desc}
                limit:10
            ){
                id
                interview_type
                duration_minutes
                questions_asked
                overall_score
                rating
                started_at
                completed_at
                created_at
            }
        }
        """

        response=requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={
                "query":query,
                "variables":{"userId":user_id}
            }
        )

        result=response.json()

        if "errors" in result:
            print("Hasura dashboard error:",result["errors"])
            return jsonify({
                "error":result["errors"][0]["message"]
            }),500

        dashboard=result["data"]
        interviews=dashboard.get("interviews") or []

        scores=[]

        if interviews:
            ids=[item["id"] for item in interviews]

            score_query="""
            query InterviewScores($ids:[uuid!]!){
                interview_scores(
                    where:{interview_id:{_in:$ids}}
                ){
                    id
                    interview_id
                    communication
                    confidence
                    technical_skills
                    answer_structure
                }
            }
            """

            score_response=requests.post(
                HASURA_URL,
                headers=HEADERS,
                json={
                    "query":score_query,
                    "variables":{"ids":ids}
                }
            )

            score_result=score_response.json()

            if "errors" in score_result:
                print("Hasura score error:",score_result["errors"])
                return jsonify({
                    "error":score_result["errors"][0]["message"]
                }),500

            scores=score_result["data"].get("interview_scores") or []

        return jsonify({
            "success":True,
            "user":dashboard.get("user"),
            "resume":(dashboard.get("resume") or [None])[0],
            "interviews":interviews,
            "scores":scores
        })

    except Exception as e:
        print("Dashboard API error:",str(e))
        return jsonify({
            "error":str(e)
        }),500

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
                    "difficulty": {"type": "string"}
                },
                "required": ["question", "category", "difficulty"]
            }
        }
    },
    "required": ["questions"]
}

@app.route("/api/interview/start", methods=["POST"])
def start_interview():
    try:
        data = request.get_json() or {}

        user_id = data.get("user_id")
        target_role = data.get("target_role")
        experience_level = data.get("experience_level")
        interview_type = data.get("interview_type")
        question_count = int(data.get("question_count", 15))

        if not user_id:
            return jsonify({"error": "User ID is required."}), 400

        if not target_role:
            return jsonify({"error": "Target role is required."}), 400

        if not experience_level:
            return jsonify({"error": "Experience level is required."}), 400

        if interview_type not in ["technical", "behavioral", "full"]:
            return jsonify({"error": "Invalid interview type."}), 400

        if question_count not in [5, 10, 15, 20]:
            return jsonify({"error": "Invalid question count."}), 400

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
            print("Resume lookup error:", resume_result["errors"])
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

        if interview_type == "technical":
            interview_focus = """
Focus mainly on technical knowledge, programming concepts,
technologies, projects, architecture, debugging and problem solving.
"""
        elif interview_type == "behavioral":
            interview_focus = """
Focus mainly on behavioral questions, communication,
teamwork, leadership, conflict handling and real experience.
"""
        else:
            interview_focus = """
Create a balanced interview containing technical,
project-based and behavioral questions.
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

IMPORTANT RULES:

1. Generate exactly {question_count} questions.
2. Questions must be based on the candidate's actual resume.
3. Do not invent technologies, companies, projects or experience.
4. Use the target role to decide what skills should be tested.
5. Start with easier questions and gradually increase difficulty.
6. Include resume-specific questions.
7. Include project questions when projects exist.
8. Avoid repeating the same question.
9. Questions should sound like realistic human interview questions.
10. Do not provide answers.
11. Do not provide explanations.
12. Return only the requested JSON.

Each question must contain:
- question
- category
- difficulty

Allowed categories:
technical, project, behavioral, problem-solving, resume

Allowed difficulty values:
easy, medium, hard
"""

        print("Generating interview questions...")

        ai_response = gemini_client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=interview_prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": INTERVIEW_QUESTIONS_SCHEMA
            }
        )

        if not ai_response.text:
            return jsonify({
                "error": "AI returned an empty response."
            }), 502

        generated_data = json.loads(ai_response.text)
        questions = generated_data.get("questions") or []

        if len(questions) != question_count:
            print(
                f"Expected {question_count} questions, "
                f"but AI returned {len(questions)}."
            )
            return jsonify({
                "error": "AI did not generate the required number of questions."
            }), 502

        interview_mutation = """
        mutation CreateInterview(
            $userId: uuid!,
            $interviewType: String!,
            $durationMinutes: Int,
            $questionsAsked: Int!,
            $startedAt: timestamptz!
        ) {
            insert_interviews_one(
                object: {
                    user_id: $userId
                    interview_type: $interviewType
                    duration_minutes: $durationMinutes
                    questions_asked: $questionsAsked
                    overall_score: 0
                    rating: 0
                    started_at: $startedAt
                }
            ) {
                id
                user_id
                interview_type
                duration_minutes
                questions_asked
                overall_score
                rating
                started_at
                created_at
            }
        }
        """

        from datetime import datetime, timezone

        started_at = datetime.now(timezone.utc).isoformat()

        interview_response = requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={
                "query": interview_mutation,
                "variables": {
                    "userId": user_id,
                    "interviewType": interview_type,
                    "durationMinutes": None,
                    "questionsAsked": question_count,
                    "startedAt": started_at
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
                "error": interview_result["errors"][0]["message"]
            }), 500

        interview = interview_result["data"]["insert_interviews_one"]
        interview_id = interview["id"]

        question_objects = []

        for index, item in enumerate(questions, start=1):
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

        questions_result = questions_response.json()

        if "errors" in questions_result:
            print(
                "Save questions error:",
                questions_result["errors"]
            )
            return jsonify({
                "error": questions_result["errors"][0]["message"]
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
            "interview_type": interview_type
        }), 200

    except json.JSONDecodeError:
        print("AI returned invalid JSON.")
        return jsonify({
            "error": "AI returned invalid interview questions."
        }), 502

    except Exception as e:
        print("Start interview error:", str(e))
        return jsonify({
            "error": "Unable to start the interview.",
            "details": str(e)
        }), 500

    
if __name__ == "__main__":
    app.run(debug=True, port=5000)