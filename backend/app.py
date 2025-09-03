from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_pymongo import PyMongo
from flask_jwt_extended import JWTManager, jwt_required, create_access_token, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv
from bson.objectid import ObjectId

load_dotenv()

app = Flask(__name__)

# Configure CORS properly - allow all headers and methods
CORS(app, 
     origins=['http://localhost:3000'], 
     supports_credentials=True,
     allow_headers=['Content-Type', 'Authorization'],
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])

app.config["MONGO_URI"] = os.getenv("MONGODB_URI", "mongodb://localhost:27017/huddle")
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-this")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(days=7)

# Initialize MongoDB
mongo = PyMongo(app)
# Attach mongo to app for blueprints to access
app.mongo = mongo

jwt = JWTManager(app)

# Authentication routes
@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    name = data.get('name')
    
    if mongo.db.users.find_one({'email': email}):
        return jsonify({'error': 'Email already exists'}), 400
    
    hashed_password = generate_password_hash(password)
    user_id = mongo.db.users.insert_one({
        'email': email,
        'password': hashed_password,
        'name': name,
        'created_at': datetime.utcnow(),
        'folders': [
            {
                'id': 'recent', 
                'name': 'Recent Meetings', 
                'color': '#3B82F6',
                'created_at': datetime.utcnow()
            },
            {
                'id': 'work', 
                'name': 'Work Meetings', 
                'color': '#10B981',
                'created_at': datetime.utcnow()
            }
        ]
    }).inserted_id
    
    token = create_access_token(identity=str(user_id))
    return jsonify({'token': token, 'user': {'id': str(user_id), 'email': email, 'name': name}})

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    
    user = mongo.db.users.find_one({'email': email})
    if user and check_password_hash(user['password'], password):
        token = create_access_token(identity=str(user['_id']))
        return jsonify({
            'token': token, 
            'user': {
                'id': str(user['_id']), 
                'email': user['email'], 
                'name': user['name']
            }
        })
    
    return jsonify({'error': 'Invalid credentials'}), 401

@app.route('/api/auth/me', methods=['GET'])
@jwt_required()
def get_current_user():
    user_id = get_jwt_identity()
    try:
        user = mongo.db.users.find_one({'_id': ObjectId(user_id)})
        if user:
            return jsonify({
                'id': str(user['_id']),
                'email': user['email'],
                'name': user['name']
            })
    except Exception as e:
        print(f"Error finding user: {e}")
    
    return jsonify({'error': 'User not found'}), 404

@app.route('/api/auth/update-profile', methods=['PUT'])
@jwt_required()
def update_profile():
    user_id = get_jwt_identity()
    data = request.json
    
    try:
        user = mongo.db.users.find_one({'_id': ObjectId(user_id)})
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        # Prepare update data
        update_data = {}
        
        # Update name if provided
        if 'name' in data and data['name'].strip():
            update_data['name'] = data['name'].strip()
        
        # Update email if provided and different
        if 'email' in data and data['email'].strip():
            new_email = data['email'].strip()
            if new_email != user['email']:
                # Check if email already exists
                existing_user = mongo.db.users.find_one({'email': new_email, '_id': {'$ne': ObjectId(user_id)}})
                if existing_user:
                    return jsonify({'error': 'Email already exists'}), 400
                update_data['email'] = new_email
        
        # Handle password change if provided
        if 'newPassword' in data and data['newPassword']:
            current_password = data.get('currentPassword')
            new_password = data.get('newPassword')
            
            if not current_password:
                return jsonify({'error': 'Current password is required'}), 400
            
            # Verify current password
            if not check_password_hash(user['password'], current_password):
                return jsonify({'error': 'Current password is incorrect'}), 400
            
            # Validate new password
            if len(new_password) < 6:
                return jsonify({'error': 'New password must be at least 6 characters'}), 400
            
            # Hash and update password
            update_data['password'] = generate_password_hash(new_password)
        
        # Add updated timestamp
        update_data['updated_at'] = datetime.utcnow()
        
        # Update user in database
        if update_data:
            result = mongo.db.users.update_one(
                {'_id': ObjectId(user_id)},
                {'$set': update_data}
            )
            
            if result.modified_count > 0:
                # Get updated user data
                updated_user = mongo.db.users.find_one({'_id': ObjectId(user_id)})
                return jsonify({
                    'message': 'Profile updated successfully',
                    'user': {
                        'id': str(updated_user['_id']),
                        'email': updated_user['email'],
                        'name': updated_user['name']
                    }
                })
            else:
                return jsonify({'error': 'No changes made'}), 400
        else:
            return jsonify({'error': 'No valid fields to update'}), 400
            
    except Exception as e:
        print(f"Error updating profile: {e}")
        return jsonify({'error': 'Internal server error'}), 500

# Global CORS handler for OPTIONS requests
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', 'http://localhost:3000')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    response.headers.add('Access-Control-Allow-Credentials', 'true')
    return response

# Import and register blueprints after app is configured
try:
    from routes.meetings import meetings_bp
    from routes.transcription import transcription_bp
    from routes.summary import summary_bp
    from routes.knowledge_graph import knowledge_graph_bp
    from routes.chatbot import chatbot_bp
    from routes.report import report_bp
    from routes.recording import recording_bp

    app.register_blueprint(meetings_bp, url_prefix='/api/meetings')
    app.register_blueprint(transcription_bp, url_prefix='/api/transcription')
    app.register_blueprint(summary_bp, url_prefix='/api/summary')
    app.register_blueprint(knowledge_graph_bp, url_prefix='/api/knowledge-graph')
    app.register_blueprint(chatbot_bp, url_prefix='/api/chatbot')
    app.register_blueprint(report_bp, url_prefix='/api/report')
    app.register_blueprint(recording_bp, url_prefix='/api/recording')
    
    print("All blueprints registered successfully")
except ImportError as e:
    print(f"Warning: Could not import blueprint: {e}")

if __name__ == "__main__":
    print("Starting Flask app...")
    print(f"MongoDB URI: {app.config['MONGO_URI']}")
    app.run(debug=True, host='0.0.0.0', port=5000)