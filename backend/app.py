from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_pymongo import PyMongo
from flask_jwt_extended import JWTManager, jwt_required, create_access_token, get_jwt_identity, verify_jwt_in_request, get_jwt
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv
from bson.objectid import ObjectId

load_dotenv()

app = Flask(__name__)

# Configure CORS with proper file download support
CORS(app, 
     origins=['http://localhost:3000'], 
     supports_credentials=True,
     allow_headers=['Content-Type', 'Authorization'],
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
     expose_headers=['Content-Disposition', 'Content-Type', 'Content-Length'])

app.config["MONGO_URI"] = os.getenv("MONGODB_URI", "mongodb://localhost:27017/huddle")
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-this")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(days=7)

# Initialize MongoDB
mongo = PyMongo(app)
app.mongo = mongo

jwt = JWTManager(app)

# JWT Error handlers
@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return jsonify({'error': 'Token has expired'}), 401

@jwt.invalid_token_loader
def invalid_token_callback(error):
    return jsonify({'error': 'Invalid token'}), 401

@jwt.unauthorized_loader
def missing_token_callback(error):
    return jsonify({'error': 'Authorization token is required'}), 401

# Authentication routes
@app.route('/api/auth/register', methods=['POST'])
def register():
    try:
        data = request.json
        
        if not data or not all(k in data for k in ('name', 'email', 'password')):
            return jsonify({'error': 'Missing required fields'}), 400
        
        # Check if user already exists
        existing_user = mongo.db.users.find_one({'email': data['email']})
        if existing_user:
            return jsonify({'error': 'User already exists'}), 400
        
        # Create default folders
        default_folders = [
            {
                'id': 'recent',
                'name': 'Recent',
                'color': '#3B82F6',
                'created_at': datetime.utcnow(),
                'is_default': True
            },
            {
                'id': 'work',
                'name': 'Work',
                'color': '#10B981',
                'created_at': datetime.utcnow(),
                'is_default': True
            },
            {
                'id': 'personal',
                'name': 'Personal',
                'color': '#F59E0B',
                'created_at': datetime.utcnow(),
                'is_default': True
            }
        ]
        
        # Create new user with default folders
        user_data = {
            'name': data['name'],
            'email': data['email'],
            'password': generate_password_hash(data['password']),
            'created_at': datetime.utcnow(),
            'folders': default_folders
        }
        
        result = mongo.db.users.insert_one(user_data)
        user_id = str(result.inserted_id)
        
        # Create access token
        access_token = create_access_token(identity=user_id)
        
        return jsonify({
            'access_token': access_token,
            'user': {
                'id': user_id,
                'name': data['name'],
                'email': data['email']
            }
        })
    except Exception as e:
        print(f"Registration error: {e}")
        return jsonify({'error': 'Registration failed'}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    try:
        data = request.json
        
        if not data or not all(k in data for k in ('email', 'password')):
            return jsonify({'error': 'Email and password are required'}), 400
        
        # Find user
        user = mongo.db.users.find_one({'email': data['email']})
        if not user or not check_password_hash(user['password'], data['password']):
            return jsonify({'error': 'Invalid credentials'}), 401
        
        # Create access token
        access_token = create_access_token(identity=str(user['_id']))
        
        return jsonify({
            'access_token': access_token,
            'user': {
                'id': str(user['_id']),
                'name': user['name'],
                'email': user['email']
            }
        })
    except Exception as e:
        print(f"Login error: {e}")
        return jsonify({'error': 'Login failed'}), 500

@app.route('/api/auth/me', methods=['GET'])
@jwt_required()
def get_current_user():
    try:
        user_id = get_jwt_identity()
        
        if not user_id:
            return jsonify({'error': 'Invalid token'}), 401
        
        user = mongo.db.users.find_one({'_id': ObjectId(user_id)})
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({
            'id': str(user['_id']),
            'name': user['name'],
            'email': user['email']
        })
    except Exception as e:
        print(f"Get current user error: {e}")
        return jsonify({'error': 'Failed to get user'}), 500

@app.route('/api/auth/update-profile', methods=['PUT'])
@jwt_required()
def update_profile():
    try:
        user_id = get_jwt_identity()
        data = request.json
        
        update_data = {}
        
        # Update name and email
        if 'name' in data:
            update_data['name'] = data['name']
        if 'email' in data:
            # Check if email is already taken
            existing_user = mongo.db.users.find_one({
                'email': data['email'],
                '_id': {'$ne': ObjectId(user_id)}
            })
            if existing_user:
                return jsonify({'error': 'Email already in use'}), 400
            update_data['email'] = data['email']
        
        # Update password if provided
        if data.get('newPassword') and data.get('currentPassword'):
            user = mongo.db.users.find_one({'_id': ObjectId(user_id)})
            if not check_password_hash(user['password'], data['currentPassword']):
                return jsonify({'error': 'Current password is incorrect'}), 400
            
            if data['newPassword'] != data['confirmPassword']:
                return jsonify({'error': 'Passwords do not match'}), 400
            
            update_data['password'] = generate_password_hash(data['newPassword'])
        
        if update_data:
            mongo.db.users.update_one(
                {'_id': ObjectId(user_id)},
                {'$set': update_data}
            )
        
        # Return updated user
        updated_user = mongo.db.users.find_one({'_id': ObjectId(user_id)})
        return jsonify({
            'id': str(updated_user['_id']),
            'name': updated_user['name'],
            'email': updated_user['email']
        })
    except Exception as e:
        print(f"Update profile error: {e}")
        return jsonify({'error': 'Failed to update profile'}), 500

# Import and register blueprints after app is configured
try:
    from routes.meetings import meetings_bp
    from routes.recording import recording_bp
    from routes.transcription import transcription_bp
    from routes.summary import summary_bp
    from routes.knowledge_graph import knowledge_graph_bp
    from routes.chatbot import chatbot_bp
    from routes.report import report_bp
    
    app.register_blueprint(meetings_bp, url_prefix='/api/meetings')
    app.register_blueprint(recording_bp, url_prefix='/api/recording')
    app.register_blueprint(transcription_bp, url_prefix='/api/transcription')
    app.register_blueprint(summary_bp, url_prefix='/api/summary')
    app.register_blueprint(knowledge_graph_bp, url_prefix='/api/knowledge-graph')
    app.register_blueprint(chatbot_bp, url_prefix='/api/chatbot')
    app.register_blueprint(report_bp, url_prefix='/api/report')
    
except ImportError as e:
    print(f"Warning: Could not import some routes: {e}")

# Health check endpoint
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'timestamp': datetime.utcnow().isoformat()})

# Add error handler for 500 errors
@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0', port=5000)