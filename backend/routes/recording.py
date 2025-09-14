from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
import uuid
import base64

recording_bp = Blueprint('recording', __name__)

@recording_bp.route('/start', methods=['POST'])
@jwt_required()
def start_recording():
    user_id = get_jwt_identity()
    data = request.json
    
    meeting_id = str(uuid.uuid4())
    meeting_data = {
        'id': meeting_id,
        'user_id': user_id,
        'title': data.get('title'),
        'language': data.get('language', 'en'),
        'status': 'recording',
        'created_at': datetime.utcnow(),
        'participants': [],
        'transcript': '',
        'speakers': {}
    }
    
    current_app.mongo.db.meetings.insert_one(meeting_data)
    return jsonify({'meeting_id': meeting_id, 'status': 'started'})

@recording_bp.route('/process-text', methods=['POST'])
@jwt_required()
def process_transcribed_text():
    """Process text that was transcribed on the frontend"""
    user_id = get_jwt_identity()
    data = request.json
    meeting_id = data.get('meeting_id')
    transcript_text = data.get('text')
    speaker = data.get('speaker', 'Speaker A')
    confidence = data.get('confidence', 1.0)
    
    if not transcript_text:
        return jsonify({'error': 'No text provided'}), 400
    
    # Update meeting with new transcript
    current_app.mongo.db.meetings.update_one(
        {'id': meeting_id},
        {'$push': {'transcript': {
            'text': transcript_text, 
            'speaker': speaker,
            'timestamp': datetime.utcnow(),
            'confidence': confidence
        }}}
    )
    
    return jsonify({'status': 'processed', 'text': transcript_text})

@recording_bp.route('/stop/<meeting_id>', methods=['POST'])
@jwt_required()
def stop_recording(meeting_id):
    user_id = get_jwt_identity()
    
    meeting = current_app.mongo.db.meetings.find_one({
        'id': meeting_id, 
        'user_id': user_id
    })
    
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404
    
    current_time = datetime.utcnow()
    
    result = current_app.mongo.db.meetings.update_one(
        {'id': meeting_id, 'user_id': user_id},
        {'$set': {
            'status': 'completed', 
            'ended_at': current_time,
            'updated_at': current_time
        }}
    )
    
    if result.modified_count > 0:
        start_time = meeting.get('created_at')
        if start_time:
            duration_seconds = (current_time - start_time).total_seconds()
            print(f"Meeting {meeting_id} duration: {duration_seconds/60:.1f} minutes")
    
    return jsonify({
        'status': 'stopped',
        'ended_at': current_time.isoformat()
    })