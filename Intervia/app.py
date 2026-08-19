from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
import requests
import os

load_dotenv()

app = Flask(__name__)
CORS(app)

HASURA_URL = os.getenv("HASURA_URL")
HASURA_ADMIN_SECRET = os.getenv("HASURA_ADMIN_SECRET")

HEADERS = {
    "Content-Type": "application/json",
    "x-hasura-admin-secret": HASURA_ADMIN_SECRET
}

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

if __name__ == "__main__":
    app.run(debug=True, port=5000)