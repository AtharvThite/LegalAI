from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_pymongo import PyMongo
from flask_jwt_extended import JWTManager, jwt_required, create_access_token, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
from dotenv import load_dotenv
from bson.objectid import ObjectId
import os
import uuid
import traceback

load_dotenv()

app = Flask(__name__)

# Production/Development environment detection
IS_PRODUCTION = os.getenv('FLASK_ENV') == 'production' or os.getenv('RENDER') is not None

print(f"[DEBUG] IS_PRODUCTION: {IS_PRODUCTION}")
print(f"[DEBUG] FLASK_ENV: {os.getenv('FLASK_ENV')}")
print(f"[DEBUG] RENDER env var: {os.getenv('RENDER')}")

# Configure CORS for production and development
if IS_PRODUCTION:
    allowed_origins = [
        'https://legalai-doc-intelligence.netlify.app',
        'https://legalai-doc-intelligence.netlify.app/ ',
        'https://legalai-k4uh.onrender.com',
        'https://legalai-k4uh.onrender.com/'
    ]
else:
    allowed_origins = ['http://localhost:3000']

print(f"[DEBUG] Allowed origins: {allowed_origins}")

CORS(app, 
     origins=allowed_origins, 
     supports_credentials=True,
     allow_headers=['Content-Type', 'Authorization'],
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])

# MongoDB connection debugging
mongo_uri = os.getenv("MONGODB_URI") if IS_PRODUCTION else "mongodb://localhost:27017/legalai"
print(f"[DEBUG] Raw MONGODB_URI from env: {os.getenv('MONGODB_URI')}")
print(f"[DEBUG] Final MongoDB URI: {mongo_uri}")
print(f"[DEBUG] MongoDB URI type: {type(mongo_uri)}")
print(f"[DEBUG] MongoDB URI length: {len(mongo_uri) if mongo_uri else 'None'}")

app.config["MONGO_URI"] = mongo_uri
print(f"[DEBUG] Flask app MONGO_URI config: {app.config['MONGO_URI']}")

app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET", "your-secret-key-change-this")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(days=7)

# Initialize MongoDB with extensive debugging
print(f"[DEBUG] Starting MongoDB initialization...")
try:
    mongo = PyMongo(app)
    print(f"[DEBUG] PyMongo instance created: {mongo}")
    print(f"[DEBUG] PyMongo client: {mongo.cx}")
    print(f"[DEBUG] PyMongo db: {mongo.db}")
    
    # Test the connection
    if mongo.db is not None:
        print(f"[DEBUG] Database object exists, attempting connection test...")
        try:
            # Try to access server info
            server_info = mongo.cx.server_info()
            print(f"[DEBUG] MongoDB server info: {server_info}")
            
            # Try to list collections
            collections = mongo.db.list_collection_names()
            print(f"[DEBUG] Available collections: {collections}")
            
            # Try a simple operation
            test_result = mongo.db.users.count_documents({})
            print(f"[DEBUG] User collection count: {test_result}")
            
            print(f"[DEBUG] ✅ MongoDB connection successful!")
            
        except Exception as e:
            print(f"[DEBUG] ❌ MongoDB connection test failed: {e}")
            print(f"[DEBUG] Connection error type: {type(e)}")
            print(f"[DEBUG] Connection error details:")
            traceback.print_exc()
    else:
        print(f"[DEBUG] ❌ mongo.db is None - connection failed during initialization")
        
except Exception as e:
    print(f"[DEBUG] ❌ Failed to create PyMongo instance: {e}")
    print(f"[DEBUG] PyMongo creation error type: {type(e)}")
    print(f"[DEBUG] PyMongo creation error details:")
    traceback.print_exc()
    mongo = None

# Set app.mongo for routes
app.mongo = mongo

# Additional debugging for PyMongo state
if mongo:
    print(f"[DEBUG] mongo.cx type: {type(mongo.cx)}")
    print(f"[DEBUG] mongo.db type: {type(mongo.db)}")
    try:
        print(f"[DEBUG] Database name: {mongo.db.name}")
    except Exception as e:
        print(f"[DEBUG] Could not get database name: {e}")
else:
    print(f"[DEBUG] ❌ mongo is None - all database operations will fail")

jwt = JWTManager(app)

@app.route('/api/auth/register', methods=['POST'])
def register():
    print(f"[DEBUG] Registration attempt started")
    print(f"[DEBUG] mongo object: {mongo}")
    print(f"[DEBUG] mongo.db: {mongo.db if mongo else 'None'}")
    
    try:
        data = request.json
        print(f"[DEBUG] Registration data received: {data.keys() if data else 'None'}")
        
        if not data or not all(k in data for k in ('name', 'email', 'password')):
            print(f"[DEBUG] Missing required fields")
            return jsonify({'error': 'Missing required fields'}), 400
        
        print(f"[DEBUG] Attempting to check existing user...")
        if mongo is None or mongo.db is None:
            print(f"[DEBUG] ❌ No MongoDB connection available")
            return jsonify({'error': 'Database connection unavailable'}), 500
            
        existing_user = mongo.db.users.find_one({'email': data['email']})
        print(f"[DEBUG] Existing user check result: {existing_user is not None}")
        
        if existing_user:
            print(f"[DEBUG] User already exists")
            return jsonify({'error': 'User already exists'}), 400
        
        default_folders = [
            {'id': 'recent', 'name': 'Recent', 'color': '#3B82F6', 'created_at': datetime.utcnow()},
            {'id': 'work', 'name': 'Work', 'color': '#10B981', 'created_at': datetime.utcnow()},
            {'id': 'personal', 'name': 'Personal', 'color': '#F59E0B', 'created_at': datetime.utcnow()}
        ]
        
        user_data = {
            'name': data['name'],
            'email': data['email'],
            'password': generate_password_hash(data['password']),
            'created_at': datetime.utcnow(),
            'folders': default_folders
        }
        
        print(f"[DEBUG] Attempting to insert user...")
        result = mongo.db.users.insert_one(user_data)
        user_id = str(result.inserted_id)
        print(f"[DEBUG] User created with ID: {user_id}")
        
        access_token = create_access_token(identity=user_id)
        
        return jsonify({
            'access_token': access_token,
            'user': {'id': user_id, 'name': data['name'], 'email': data['email']}
        })
    except Exception as e:
        print(f"[DEBUG] ❌ Registration error: {e}")
        print(f"[DEBUG] Registration error type: {type(e)}")
        print(f"[DEBUG] Registration error details:")
        traceback.print_exc()
        return jsonify({'error': 'Registration failed'}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    print(f"[DEBUG] Login attempt started")
    print(f"[DEBUG] mongo object: {mongo}")
    print(f"[DEBUG] mongo.db: {mongo.db if mongo else 'None'}")
    
    try:
        data = request.json
        print(f"[DEBUG] Login data received: {data.keys() if data else 'None'}")
        
        if not data or not all(k in data for k in ('email', 'password')):
            print(f"[DEBUG] Missing required fields")
            return jsonify({'error': 'Missing required fields'}), 400
        
        print(f"[DEBUG] Attempting to find user...")
        if mongo is None or mongo.db is None:
            print(f"[DEBUG] ❌ No MongoDB connection available")
            return jsonify({'error': 'Database connection unavailable'}), 500
            
        user = mongo.db.users.find_one({'email': data['email']})
        print(f"[DEBUG] User found: {user is not None}")
        
        if not user or not check_password_hash(user['password'], data['password']):
            print(f"[DEBUG] Invalid credentials")
            return jsonify({'error': 'Invalid credentials'}), 401
        
        access_token = create_access_token(identity=str(user['_id']))
        print(f"[DEBUG] Login successful for user: {user['_id']}")
        
        return jsonify({
            'access_token': access_token,
            'user': {'id': str(user['_id']), 'name': user['name'], 'email': user['email']}
        })
    except Exception as e:
        print(f"[DEBUG] ❌ Login error: {e}")
        print(f"[DEBUG] Login error type: {type(e)}")
        print(f"[DEBUG] Login error details:")
        traceback.print_exc()
        return jsonify({'error': 'Login failed'}), 500

@app.route('/api/auth/me', methods=['GET'])
@jwt_required()
def get_current_user():
    try:
        user_id = get_jwt_identity()
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
        import traceback
        traceback.print_exc()
        return jsonify({'error': 'Failed to get user'}), 500

# Import and register blueprints
try:
    from routes.documents import documents_bp
    from routes.transcription import transcription_bp
    from routes.summary import summary_bp
    from routes.knowledge_graph import knowledge_graph_bp
    from routes.chatbot import chatbot_bp
    from routes.report import report_bp
    
    app.register_blueprint(documents_bp, url_prefix='/api/documents')
    app.register_blueprint(transcription_bp, url_prefix='/api/transcription')
    app.register_blueprint(summary_bp, url_prefix='/api/summary')
    app.register_blueprint(knowledge_graph_bp, url_prefix='/api/knowledge-graph')
    app.register_blueprint(chatbot_bp, url_prefix='/api/chatbot')
    app.register_blueprint(report_bp, url_prefix='/api/report')
    
    print(f"[DEBUG] ✅ All blueprints registered successfully")
    
except ImportError as e:
    print(f"[DEBUG] ⚠️ Warning: Could not import some routes: {e}")
    traceback.print_exc()

@app.route('/api/health', methods=['GET'])
def health_check():
    health_status = {
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'mongo_connected': bool(mongo and mongo.db),
        'environment': 'production' if IS_PRODUCTION else 'development'
    }
    
    if mongo and mongo.db:
        try:
            # Test database connection
            mongo.cx.server_info()
            health_status['database'] = 'connected'
        except Exception as e:
            health_status['database'] = f'error: {str(e)}'
    else:
        health_status['database'] = 'not_initialized'
    
    return jsonify(health_status)

@app.route('/', methods=['GET'])
def root():
    return jsonify({
        'message': 'LegalAI API is running', 
        'status': 'healthy',
        'mongo_status': 'connected' if (mongo and mongo.db) else 'disconnected'
    })

if __name__ == "__main__":
    print("Starting LegalAI backend...")
    print(f"[DEBUG] Final startup check - mongo: {mongo}, mongo.db: {mongo.db if mongo else 'None'}")
    
    port = int(os.getenv('PORT', 5000))
    
    if IS_PRODUCTION:
        print(f"[DEBUG] Starting in PRODUCTION mode on port {port}")
        # Production configuration
        app.run(
            host='0.0.0.0', 
            port=port,
            debug=False
        )
    else:
        print(f"[DEBUG] Starting in DEVELOPMENT mode on port {port}")
        # Development configuration
        app.run(
            debug=True, 
            host='0.0.0.0', 
            port=port
        )