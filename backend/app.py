from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_pymongo import PyMongo
from flask_jwt_extended import JWTManager, jwt_required, create_access_token, get_jwt_identity
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv
from bson.objectid import ObjectId
import uuid

load_dotenv()

app = Flask(__name__)

# Configure CORS
CORS(app, 
     origins=['http://localhost:3000'], 
     supports_credentials=True,
     allow_headers=['Content-Type', 'Authorization'],
     methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])

# Initialize Socket.IO with proper CORS
socketio = SocketIO(app, 
                   cors_allowed_origins="http://localhost:3000",
                   logger=False,  # Disable excessive logging
                   engineio_logger=False,
                   transports=['websocket', 'polling'])

app.config["MONGO_URI"] = os.getenv("MONGODB_URI", "mongodb://localhost:27017/huddle")
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-this")
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(days=7)

# Initialize MongoDB
mongo = PyMongo(app)
app.mongo = mongo

jwt = JWTManager(app)

# Store active room connections
active_rooms = {}

# JWT Error handlers
@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return jsonify({'error': 'Token has expired'}), 401

# Socket.IO events for WebRTC signaling
@socketio.on('connect')
def on_connect():
    print(f'Client connected: {request.sid}')

@socketio.on('disconnect')
def on_disconnect():
    print(f'Client disconnected: {request.sid}')
    # Clean up user from all rooms
    for room_id in list(active_rooms.keys()):
        if request.sid in active_rooms[room_id]:
            user_info = active_rooms[room_id][request.sid]
            del active_rooms[room_id][request.sid]
            
            emit('user-left', {
                'socket_id': request.sid,
                'user_id': user_info['user_id']
            }, room=room_id)
            
            print(f'Removed user {user_info["user_name"]} from room {room_id}')

@socketio.on('join-room')
def on_join_room(data):
    room_id = data.get('room_id')
    user_id = data.get('user_id') 
    user_name = data.get('user_name')
    
    print(f'User {user_name} joining room {room_id}')
    
    if not room_id:
        emit('error', {'message': 'Room ID required'})
        return
    
    join_room(room_id)
    
    # Initialize room if not exists
    if room_id not in active_rooms:
        active_rooms[room_id] = {}
        print(f'Created new room: {room_id}')
    
    # Add user to room
    active_rooms[room_id][request.sid] = {
        'user_id': user_id,
        'user_name': user_name
    }
    
    print(f'Room {room_id} now has {len(active_rooms[room_id])} participants')
    
    # Get existing users in room (excluding the new user)
    existing_users = []
    for sid, user_info in active_rooms[room_id].items():
        if sid != request.sid:
            existing_users.append({
                'socket_id': sid,
                'user_id': user_info['user_id'],
                'user_name': user_info['user_name']
            })
    
    print(f'Sending {len(existing_users)} existing users to new participant')
    
    # Send existing users to the new user
    emit('existing-users', existing_users)
    
    # Notify existing users about the new participant
    emit('user-joined', {
        'user_id': user_id,
        'user_name': user_name,
        'socket_id': request.sid
    }, room=room_id, include_self=False)

@socketio.on('offer')
def on_offer(data):
    target_id = data.get('target')
    offer = data.get('offer')
    caller_id = request.sid
    
    print(f'Relaying offer from {caller_id} to {target_id}')
    
    emit('offer', {
        'offer': offer,
        'caller': caller_id
    }, room=target_id)

@socketio.on('answer')
def on_answer(data):
    target_id = data.get('target')
    answer = data.get('answer')
    caller_id = request.sid
    
    print(f'Relaying answer from {caller_id} to {target_id}')
    
    emit('answer', {
        'answer': answer,
        'caller': caller_id
    }, room=target_id)

@socketio.on('ice-candidate')
def on_ice_candidate(data):
    target_id = data.get('target')
    candidate = data.get('candidate')
    caller_id = request.sid
    
    emit('ice-candidate', {
        'candidate': candidate,
        'caller': caller_id
    }, room=target_id)

@socketio.on('transcript-update')
def on_transcript_update(data):
    room_id = data.get('room_id')
    transcript_data = data.get('transcript')
    
    # Broadcast transcript to all users in room (excluding sender)
    emit('transcript-update', transcript_data, room=room_id, include_self=False)

@socketio.on('leave-room')
def on_leave_room(data):
    room_id = data.get('room_id')
    
    if room_id and request.sid in active_rooms.get(room_id, {}):
        user_info = active_rooms[room_id][request.sid]
        del active_rooms[room_id][request.sid]
        
        leave_room(room_id)
        
        # Notify others
        emit('user-left', {
            'socket_id': request.sid,
            'user_id': user_info['user_id']
        }, room=room_id)
        
        print(f'User {user_info["user_name"]} left room {room_id}')

@socketio.on('meeting-ended')
def on_meeting_ended(data):
    room_id = data.get('room_id')
    host_name = data.get('host_name', 'Host')
    meeting_data = data.get('meeting_data', {})
    
    print(f'Meeting {room_id} ended by host')
    
    # Notify all participants in the room
    emit('meeting-ended', {
        'room_id': room_id,
        'host_name': host_name,
        'ended_at': datetime.utcnow().isoformat() + 'Z',
        'message': f'Meeting ended by {host_name}',
        'meeting_data': meeting_data
    }, room=room_id, include_self=False)
    
    # Clean up room
    if room_id in active_rooms:
        del active_rooms[room_id]
        print(f'Cleaned up room: {room_id}')

@socketio.on('transcription-toggled')
def on_transcription_toggled(data):
    room_id = data.get('room_id')
    enabled = data.get('enabled', False)
    host_name = data.get('host_name', 'Host')
    
    print(f'Transcription {"enabled" if enabled else "disabled"} in room {room_id}')
    
    # Notify all participants about transcription status
    emit('transcription-status-changed', {
        'enabled': enabled,
        'message': f'Transcription {"enabled" if enabled else "disabled"} by {host_name}'
    }, room=room_id, include_self=False)

# Authentication routes
@app.route('/api/auth/register', methods=['POST'])
def register():
    try:
        data = request.json
        
        if not data or not all(k in data for k in ('name', 'email', 'password')):
            return jsonify({'error': 'Missing required fields'}), 400
        
        existing_user = mongo.db.users.find_one({'email': data['email']})
        if existing_user:
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
        
        result = mongo.db.users.insert_one(user_data)
        user_id = str(result.inserted_id)
        
        access_token = create_access_token(identity=user_id)
        
        return jsonify({
            'access_token': access_token,
            'user': {'id': user_id, 'name': data['name'], 'email': data['email']}
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
        
        user = mongo.db.users.find_one({'email': data['email']})
        if not user or not check_password_hash(user['password'], data['password']):
            return jsonify({'error': 'Invalid credentials'}), 401
        
        access_token = create_access_token(identity=str(user['_id']))
        
        return jsonify({
            'access_token': access_token,
            'user': {'id': str(user['_id']), 'name': user['name'], 'email': user['email']}
        })
    except Exception as e:
        print(f"Login error: {e}")
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
        return jsonify({'error': 'Failed to get user'}), 500

# Import and register blueprints
try:
    from routes.meetings import meetings_bp
    from routes.recording import recording_bp  
    from routes.transcription import transcription_bp
    from routes.summary import summary_bp
    from routes.knowledge_graph import knowledge_graph_bp
    from routes.chatbot import chatbot_bp
    from routes.report import report_bp
    from routes.webrtc import webrtc_bp
    
    app.register_blueprint(meetings_bp, url_prefix='/api/meetings')
    app.register_blueprint(recording_bp, url_prefix='/api/recording')
    app.register_blueprint(transcription_bp, url_prefix='/api/transcription')
    app.register_blueprint(summary_bp, url_prefix='/api/summary')
    app.register_blueprint(knowledge_graph_bp, url_prefix='/api/knowledge-graph')
    app.register_blueprint(chatbot_bp, url_prefix='/api/chatbot')
    app.register_blueprint(report_bp, url_prefix='/api/report')
    app.register_blueprint(webrtc_bp, url_prefix='/api/webrtc')
    
except ImportError as e:
    print(f"Warning: Could not import some routes: {e}")

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'timestamp': datetime.utcnow().isoformat()})

if __name__ == "__main__":
    print("Starting Huddle backend with Socket.IO support...")
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)