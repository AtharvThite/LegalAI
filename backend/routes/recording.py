from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
import speech_recognition as sr
import io
import wave
from datetime import datetime
import uuid

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

@recording_bp.route('/process-audio', methods=['POST'])
@jwt_required()
def process_audio():
    user_id = get_jwt_identity()
    meeting_id = request.form.get('meeting_id')
    
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file'}), 400
    
    audio_file = request.files['audio']
    
    # Convert audio to text using speech recognition
    r = sr.Recognizer()
    
    try:
        # Read audio data
        audio_data = audio_file.read()
        audio_file_like = io.BytesIO(audio_data)
        
        with sr.AudioFile(audio_file_like) as source:
            audio = r.record(source)
            
        # Get language setting from meeting
        meeting = current_app.mongo.db.meetings.find_one({'id': meeting_id})
        language = meeting.get('language', 'en-US')
        
        # Recognize speech
        text = r.recognize_google(audio, language=language)
        
        # Update meeting with new transcript
        current_app.mongo.db.meetings.update_one(
            {'id': meeting_id},
            {'$push': {'transcript': {'text': text, 'timestamp': datetime.utcnow()}}}
        )
        
        return jsonify({'transcript': text, 'status': 'processed'})
        
    except sr.UnknownValueError:
        return jsonify({'error': 'Could not understand audio'}), 400
    except sr.RequestError as e:
        return jsonify({'error': f'Recognition service error: {e}'}), 500

@recording_bp.route('/stop/<meeting_id>', methods=['POST'])
@jwt_required()
def stop_recording(meeting_id):
    user_id = get_jwt_identity()
    
    # Get the meeting first to check when it started
    meeting = current_app.mongo.db.meetings.find_one({
        'id': meeting_id, 
        'user_id': user_id
    })
    
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404
    
    current_time = datetime.utcnow()
    
    # Set the ended_at timestamp when stopping recording
    result = current_app.mongo.db.meetings.update_one(
        {'id': meeting_id, 'user_id': user_id},
        {'$set': {
            'status': 'completed', 
            'ended_at': current_time,
            'updated_at': current_time
        }}
    )
    
    if result.modified_count > 0:
        # Calculate actual duration for logging
        start_time = meeting.get('created_at')
        if start_time:
            duration_seconds = (current_time - start_time).total_seconds()
            print(f"Meeting {meeting_id} duration: {duration_seconds/60:.1f} minutes")
    
    return jsonify({
        'status': 'stopped',
        'ended_at': current_time.isoformat()
    })