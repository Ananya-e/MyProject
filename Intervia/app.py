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
            }

            interviews: interviews(
                where: {
                    user_id: {_eq: $userId},
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
                created_at
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
            return jsonify({
                "error": result["errors"][0]["message"]
            }), 500

        dashboard = result["data"]

        return jsonify({
            "success": True,
            "user": dashboard.get("user"),
            "resume": (dashboard.get("resume") or [None])[0],
            "interviews": dashboard.get("interviews") or []
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
                    "difficulty": {"type": "string"}
                },
                "required": ["question", "category", "difficulty"]
            }
        }
    },
    "required": ["questions"]
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
                    "feedback": {"type": "string"}
                },
                "required": [
                    "question_number",
                    "score",
                    "feedback"
                ]
            }
        },
        "overall_score": {"type": "integer"},
        "rating": {"type": "integer"},
        "summary": {"type": "string"}
    },
    "required": [
        "evaluations",
        "overall_score",
        "rating",
        "summary"
    ]
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

        previous_interviews_result = previous_interviews_response.json()

        if "errors" in previous_interviews_result:
            print(
                "Previous interviews lookup error:",
                previous_interviews_result["errors"]
            )
            return jsonify({
                "error": "Could not load previous interview history."
            }), 500

        previous_interviews = (
            previous_interviews_result["data"].get("interviews") or []
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
                    where: {interview_id: {_in: $interviewIds}},
                    order_by: {created_at: desc}
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
                        "interviewIds": previous_interview_ids
                    }
                }
            )

            previous_questions_result = previous_questions_response.json()

            if "errors" in previous_questions_result:
                print(
                    "Previous questions lookup error:",
                    previous_questions_result["errors"]
                )
                return jsonify({
                    "error": "Could not load previous interview questions."
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
            previous_questions_text = "No previous interview questions. This is the candidate's first interview."

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
        print(f"Previous questions available: {len(previous_questions)}")

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


@app.route("/api/interview/submit", methods=["POST"])
def submit_interview():
    try:
        data = request.get_json() or {}

        user_id = data.get("user_id")
        interview_id = data.get("interview_id")
        answers = data.get("answers") or []

        if not user_id:
            return jsonify({"error": "User ID is required."}), 400

        if not interview_id:
            return jsonify({"error": "Interview ID is required."}), 400

        if not answers:
            return jsonify({"error": "Interview answers are required."}), 400

        interview_query = """
        query GetInterview($interviewId: uuid!, $userId: uuid!) {
            interviews(
                where: {
                    id: {_eq: $interviewId},
                    user_id: {_eq: $userId}
                },
                limit: 1
            ) {
                id
                interview_type
                questions_asked
                started_at
            }
        }
        """

        interview_response = requests.post(
            HASURA_URL,
            headers=HEADERS,
            json={
                "query": interview_query,
                "variables": {
                    "interviewId": interview_id,
                    "userId": user_id
                }
            }
        )

        interview_result = interview_response.json()

        if "errors" in interview_result:
            print("Interview lookup error:", interview_result["errors"])
            return jsonify({
                "error": "Could not load the interview."
            }), 500

        interviews = interview_result["data"].get("interviews") or []

        if not interviews:
            return jsonify({
                "error": "Interview not found."
            }), 404

        interview = interviews[0]

        questions_query = """
        query GetInterviewQuestions($interviewId: uuid!) {
            interview_questions(
                where: {interview_id: {_eq: $interviewId}},
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
            print("Questions lookup error:", questions_result["errors"])
            return jsonify({
                "error": "Could not load interview questions."
            }), 500

        questions = questions_result["data"].get("interview_questions") or []

        if len(questions) != len(answers):
            return jsonify({
                "error": "The number of answers does not match the interview questions."
            }), 400

        answer_map = {
            int(item.get("question_number")): str(
                item.get("answer", "")
            ).strip()
            for item in answers
        }

        evaluation_input = []

        for question in questions:
            question_number = question["question_number"]

            evaluation_input.append({
                "question_number": question_number,
                "question": question["question"],
                "answer": answer_map.get(question_number, "")
            })

        evaluation_json = json.dumps(
            evaluation_input,
            ensure_ascii=False,
            indent=2
        )

        evaluation_prompt = f"""
You are Intervia's AI interview evaluator.

Evaluate the candidate's answers for a mock interview.

INTERVIEW TYPE:
{interview["interview_type"]}

QUESTIONS AND ANSWERS:
{evaluation_json}

Evaluate every answer independently.

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
8. Calculate the overall score from all question scores.
9. Rating must be an integer from 1 to 5.
10. Return only the requested JSON.

The summary should briefly explain the candidate's overall performance and the most important improvement area.
"""

        print(f"Evaluating interview {interview_id}...")

        ai_response = gemini_client.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=evaluation_prompt,
            config={
                "response_mime_type": "application/json",
                "response_schema": INTERVIEW_EVALUATION_SCHEMA
            }
        )

        if not ai_response.text:
            return jsonify({
                "error": "AI returned an empty evaluation."
            }), 502

        evaluation_data = json.loads(ai_response.text)

        evaluations = evaluation_data.get("evaluations") or []

        if len(evaluations) != len(questions):
            return jsonify({
                "error": "AI did not evaluate all interview questions."
            }), 502

        overall_score = max(
            0,
            min(100, int(evaluation_data.get("overall_score", 0)))
        )

        rating = max(
            1,
            min(5, int(evaluation_data.get("rating", 1)))
        )

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

            score = max(
                0,
                min(10, int(evaluation.get("score", 0)))
            )

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
                print(
                    "Question update error:",
                    update_result["errors"]
                )
                return jsonify({
                    "error": "Could not save interview evaluation."
                }), 500

        from datetime import datetime, timezone

        completed_datetime = datetime.now(timezone.utc)
        completed_at = completed_datetime.isoformat()

        started_datetime = datetime.fromisoformat(
            interview["started_at"].replace("Z", "+00:00")
        )

        elapsed_seconds = max(
            0,
            int(
                (
                    completed_datetime - started_datetime
                ).total_seconds()
            )
        )

        duration_minutes = max(
            1,
            round(elapsed_seconds / 60)
        )

        update_interview_mutation = """
        mutation CompleteInterview(
            $id: uuid!,
            $overallScore: numeric!,
            $rating: Int!,
            $completedAt: timestamptz!,
            $durationMinutes: Int!
        ) {
            update_interviews_by_pk(
                pk_columns: {id: $id},
                _set: {
                    overall_score: $overallScore,
                    rating: $rating,
                    completed_at: $completedAt,
                    duration_minutes: $durationMinutes
                }
            ) {
                id
                overall_score
                rating
                completed_at
                duration_minutes
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
                    "durationMinutes": duration_minutes
                }
            }
        )

        update_interview_result = update_interview_response.json()

        if "errors" in update_interview_result:
            print(
                "Interview completion error:",
                update_interview_result["errors"]
            )
            return jsonify({
                "error": "Could not complete the interview."
            }), 500

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
            "completed_at": completed_at,
            "duration_minutes": duration_minutes
        }), 200

    except json.JSONDecodeError:
        print("AI returned invalid evaluation JSON.")
        return jsonify({
            "error": "AI returned an invalid evaluation."
        }), 502

    except Exception as e:
        print("Submit interview error:", str(e))
        return jsonify({
            "error": "Unable to evaluate the interview.",
            "details": str(e)
        }), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)