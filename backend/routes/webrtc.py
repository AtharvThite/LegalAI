from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
import uuid
from bson.objectid import ObjectId
import json

webrtc_bp = Blueprint('webrtc', __name__)

def get_mongo():
    """Helper function to get mongo instance"""
    return current_app.mongo.db

@webrtc_bp.route('/create-room', methods=['POST'])
@jwt_required()
def create_room():
    user_id = get_jwt_identity()
    db = get_mongo()
    data = request.json
    
    room_id = str(uuid.uuid4())[:8].upper()  # Short room ID for easy sharing
    meeting_uuid = str(uuid.uuid4())  # Full UUID for the meeting
    
    # Get user info for host details
    user = db.users.find_one({'_id': ObjectId(user_id)})
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    meeting_data = {
        'id': meeting_uuid,  # Use full UUID as the meeting ID
        'room_id': room_id,  # Short room ID for joining
        'host_id': user_id,
        'host_name': user.get('name', 'Unknown Host'),
        'user_id': user_id,  # For consistency with recorded meetings
        'title': data.get('title', f'Meeting Room {room_id}'),
        'description': data.get('description', ''),
        'folder_id': data.get('folder_id', 'recent'),
        'language': data.get('language', 'en-US'),
        'meeting_type': 'webrtc',  # Important: Mark as WebRTC meeting
        'status': 'waiting',
        'created_at': datetime.utcnow(),
        'started_at': None,
        'ended_at': None,
        'participants': [
            {
                'user_id': user_id,
                'name': user.get('name', 'Unknown Host'),
                'email': user.get('email', ''),
                'role': 'host',
                'joined_at': None,
                'left_at': None,
                'is_online': False
            }
        ],
        'max_participants': data.get('max_participants', 10),
        'settings': {
            'allow_recording': data.get('allow_recording', True),
            'auto_transcription': data.get('auto_transcription', True),
            'participant_limit': data.get('max_participants', 10),
            'require_approval': data.get('require_approval', False),
            'mute_on_join': data.get('mute_on_join', True),
            'video_on_join': data.get('video_on_join', True)
        }
    }
    
    result = db.meetings.insert_one(meeting_data)
    meeting_data['_id'] = str(result.inserted_id)
    
    # Format datetime for JSON response
    meeting_data['created_at'] = meeting_data['created_at'].isoformat() + 'Z'
    
    return jsonify({
        'meeting': meeting_data,
        'room_id': room_id,
        'meeting_id': meeting_uuid,  # Return the full meeting ID
        'join_url': f'/join/{room_id}'
    }), 201

@webrtc_bp.route('/join/<room_id>', methods=['POST'])
@jwt_required()
def join_room(room_id):
    user_id = get_jwt_identity()
    db = get_mongo()
    data = request.json or {}
    
    # Find meeting by room_id
    meeting = db.meetings.find_one({'room_id': room_id.upper()})
    if not meeting:
        return jsonify({'error': 'Room not found'}), 404
    
    # Check if meeting is still active
    if meeting.get('status') == 'ended':
        return jsonify({'error': 'Meeting has ended'}), 400
    
    # Get user info
    user = db.users.find_one({'_id': ObjectId(user_id)})
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    # Check if user is already in the meeting
    existing_participant = None
    for participant in meeting.get('participants', []):
        if participant['user_id'] == user_id:
            existing_participant = participant
            break
    
    participant_data = {
        'user_id': user_id,
        'name': data.get('display_name') or user.get('name', 'Anonymous'),
        'email': user.get('email', ''),
        'role': 'host' if user_id == meeting['host_id'] else 'participant',
        'joined_at': datetime.utcnow(),
        'left_at': None,
        'is_online': True
    }
    
    # Update participant list
    if existing_participant:
        # Update existing participant
        db.meetings.update_one(
            {'room_id': room_id.upper(), 'participants.user_id': user_id},
            {'$set': {
                'participants.$.joined_at': datetime.utcnow(),
                'participants.$.is_online': True,
                'participants.$.name': participant_data['name']
            }}
        )
    else:
        # Add new participant
        db.meetings.update_one(
            {'room_id': room_id.upper()},
            {'$push': {'participants': participant_data}}
        )
    
    # Start meeting if it's the first person joining
    if meeting.get('status') == 'waiting':
        db.meetings.update_one(
            {'room_id': room_id.upper()},
            {'$set': {
                'status': 'active',
                'started_at': datetime.utcnow()
            }}
        )
    
    # Get updated meeting
    updated_meeting = db.meetings.find_one({'room_id': room_id.upper()})
    updated_meeting['_id'] = str(updated_meeting['_id'])
    
    # Format datetime fields
    for field in ['created_at', 'started_at', 'ended_at']:
        if updated_meeting.get(field):
            updated_meeting[field] = updated_meeting[field].isoformat() + 'Z'
    
    return jsonify({
        'meeting': updated_meeting,
        'participant': participant_data,
        'is_host': user_id == meeting['host_id']
    })

@webrtc_bp.route('/room/<room_id>/transcript', methods=['POST'])
@jwt_required()
def save_room_transcript(room_id):
    user_id = get_jwt_identity()
    db = get_mongo()
    data = request.json
    
    # Find meeting by room_id
    meeting = db.meetings.find_one({'room_id': room_id.upper()})
    if not meeting:
        return jsonify({'error': 'Room not found'}), 404
    
    # Check if user is in the meeting
    user_in_meeting = any(p['user_id'] == user_id for p in meeting.get('participants', []))
    if not user_in_meeting:
        return jsonify({'error': 'Not authorized'}), 403
    
    # Save transcript segment using the meeting's UUID (not room_id)
    meeting_uuid = meeting.get('id')  # Use the full UUID
    
    transcript_entry = {
        'meeting_id': meeting_uuid,  # Use meeting UUID, not room_id
        'room_id': room_id.upper(),
        'user_id': user_id,
        'speaker_name': data.get('speaker_name'),
        'text': data.get('text'),
        'timestamp': datetime.utcnow(),
        'confidence': data.get('confidence', 1.0)
    }
    
    db.transcript_segments.insert_one(transcript_entry)
    
    return jsonify({'status': 'saved'}), 201

@webrtc_bp.route('/room/<room_id>/transcript', methods=['GET'])
@jwt_required()
def get_room_transcript(room_id):
    user_id = get_jwt_identity()
    db = get_mongo()
    
    # Find meeting by room_id
    meeting = db.meetings.find_one({'room_id': room_id.upper()})
    if not meeting:
        return jsonify({'error': 'Room not found'}), 404
    
    meeting_uuid = meeting.get('id')
    
    # Get transcript segments using meeting UUID
    segments = list(db.transcript_segments.find({
        'meeting_id': meeting_uuid
    }).sort('timestamp', 1))
    
    # Convert ObjectId to string and format timestamps
    for segment in segments:
        segment['_id'] = str(segment['_id'])
        segment['timestamp'] = segment['timestamp'].isoformat() + 'Z'
    
    # Build full transcript text
    full_transcript = '\n\n'.join([
        f"{segment['speaker_name']} ({segment['timestamp']}): {segment['text']}"
        for segment in segments
    ])
    
    return jsonify({
        'segments': segments,
        'full_transcript': full_transcript,
        'total_segments': len(segments)
    })

@webrtc_bp.route('/room/<room_id>/finalize', methods=['POST'])
@jwt_required()
def finalize_room_transcript(room_id):
    """Save final consolidated transcript when meeting ends"""
    user_id = get_jwt_identity()
    db = get_mongo()
    data = request.json
    
    # Find meeting by room_id
    meeting = db.meetings.find_one({'room_id': room_id.upper()})
    if not meeting:
        return jsonify({'error': 'Room not found'}), 404
    
    # Check if user is host or participant
    user_in_meeting = any(p['user_id'] == user_id for p in meeting.get('participants', []))
    if not user_in_meeting:
        return jsonify({'error': 'Not authorized'}), 403
    
    meeting_uuid = meeting.get('id')
    transcript_text = data.get('transcript', '')
    
    if transcript_text:
        # Save consolidated transcript
        transcript_data = {
            'meeting_id': meeting_uuid,
            'transcript': transcript_text,
            'speakers': data.get('speakers', []),
            'language': meeting.get('language', 'en-US'),
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        
        # Update or insert transcript
        db.transcriptions.update_one(
            {'meeting_id': meeting_uuid},
            {'$set': transcript_data},
            upsert=True
        )
        
        # Update meeting status to completed
        db.meetings.update_one(
            {'room_id': room_id.upper()},
            {'$set': {
                'status': 'completed',
                'ended_at': datetime.utcnow()
            }}
        )
        
        return jsonify({
            'status': 'transcript_saved',
            'meeting_id': meeting_uuid
        })
    
    return jsonify({'error': 'No transcript provided'}), 400

@webrtc_bp.route('/room/<room_id>/leave', methods=['POST'])
@jwt_required()
def leave_room(room_id):
    user_id = get_jwt_identity()
    db = get_mongo()
    
    # Update participant status
    result = db.meetings.update_one(
        {'room_id': room_id.upper(), 'participants.user_id': user_id},
        {'$set': {
            'participants.$.left_at': datetime.utcnow(),
            'participants.$.is_online': False
        }}
    )
    
    if result.matched_count == 0:
        return jsonify({'error': 'Room or participant not found'}), 404
    
    return jsonify({'message': 'Left room successfully'})

@webrtc_bp.route('/room/<room_id>/end', methods=['POST'])
@jwt_required()
def end_room(room_id):
    user_id = get_jwt_identity()
    db = get_mongo()
    
    meeting = db.meetings.find_one({'room_id': room_id.upper()})
    if not meeting:
        return jsonify({'error': 'Room not found'}), 404
    
    # Only host can end the meeting
    if meeting.get('host_id') != user_id:
        return jsonify({'error': 'Only host can end the meeting'}), 403
    
    # Get final transcript before ending
    meeting_uuid = meeting.get('id')
    transcript_segments = list(db.transcript_segments.find({
        'meeting_id': meeting_uuid
    }).sort('timestamp', 1))
    
    # Build consolidated transcript
    full_transcript = '\n\n'.join([
        f"{segment['speaker_name']} ({segment['timestamp']}): {segment['text']}"
        for segment in transcript_segments
    ])
    
    # End meeting
    end_time = datetime.utcnow()
    db.meetings.update_one(
        {'room_id': room_id.upper()},
        {'$set': {
            'status': 'completed',
            'ended_at': end_time
        }}
    )
    
    # Save transcript for the main meeting record
    if full_transcript:
        db.transcriptions.update_one(
            {'meeting_id': meeting_uuid},
            {'$set': {
                'meeting_id': meeting_uuid,
                'transcript': full_transcript,
                'speakers': list(set([s['speaker_name'] for s in transcript_segments])),
                'language': meeting.get('language', 'en-US'),
                'created_at': datetime.utcnow(),
                'updated_at': datetime.utcnow()
            }},
            upsert=True
        )
    
    # Create individual meeting records for all participants
    participants = meeting.get('participants', [])
    saved_meeting_ids = []
    
    for participant in participants:
        if participant['user_id'] != user_id:  # Skip host, they already have the meeting
            # Create individual meeting record for participant
            participant_meeting_id = str(uuid.uuid4())
            participant_meeting = {
                'id': participant_meeting_id,
                'user_id': participant['user_id'],
                'title': meeting.get('title', f'Meeting Room {room_id}'),
                'description': meeting.get('description', ''),
                'folder_id': 'recent',  # Save to recent folder for participants
                'language': meeting.get('language', 'en-US'),
                'meeting_type': 'webrtc_participant',  # Mark as participant copy
                'original_meeting_id': meeting_uuid,  # Reference to original
                'room_id': room_id.upper(),
                'host_name': meeting.get('host_name', ''),
                'status': 'completed',
                'created_at': meeting.get('created_at'),
                'started_at': meeting.get('started_at'),
                'ended_at': end_time,
                'participants': participants,  # Keep all participants info
                'settings': meeting.get('settings', {})
            }
            
            result = db.meetings.insert_one(participant_meeting)
            saved_meeting_ids.append(participant_meeting_id)
            
            # Copy transcript for participant
            if full_transcript:
                db.transcriptions.update_one(
                    {'meeting_id': participant_meeting_id},
                    {'$set': {
                        'meeting_id': participant_meeting_id,
                        'transcript': full_transcript,
                        'speakers': list(set([s['speaker_name'] for s in transcript_segments])),
                        'language': meeting.get('language', 'en-US'),
                        'created_at': datetime.utcnow(),
                        'updated_at': datetime.utcnow()
                    }},
                    upsert=True
                )
    
    # Mark all participants as offline
    db.meetings.update_one(
        {'room_id': room_id.upper()},
        {'$set': {
            'participants.$[].is_online': False,
            'participants.$[elem].left_at': end_time
        }},
        array_filters=[{'elem.left_at': None}]
    )
    
    return jsonify({
        'message': 'Meeting ended successfully',
        'ended_at': end_time.isoformat() + 'Z',
        'meeting_id': meeting_uuid,
        'participant_meetings_created': len(saved_meeting_ids),
        'full_transcript': full_transcript[:200] + '...' if len(full_transcript) > 200 else full_transcript
    })

# Add new endpoint for host to control transcription
@webrtc_bp.route('/room/<room_id>/transcription', methods=['POST'])
@jwt_required()
def toggle_room_transcription(room_id):
    user_id = get_jwt_identity()
    db = get_mongo()
    data = request.json
    
    meeting = db.meetings.find_one({'room_id': room_id.upper()})
    if not meeting:
        return jsonify({'error': 'Room not found'}), 404
    
    # Only host can control transcription
    if meeting.get('host_id') != user_id:
        return jsonify({'error': 'Only host can control transcription'}), 403
    
    transcription_enabled = data.get('enabled', False)
    
    # Update meeting settings
    db.meetings.update_one(
        {'room_id': room_id.upper()},
        {'$set': {
            'settings.auto_transcription': transcription_enabled
        }}
    )
    
    return jsonify({
        'transcription_enabled': transcription_enabled,
        'message': f'Transcription {"enabled" if transcription_enabled else "disabled"}'
    })

@webrtc_bp.route('/room/<room_id>/info', methods=['GET'])
def get_room_info(room_id):
    """Get basic room info (doesn't require authentication for joining)"""
    db = get_mongo()
    
    meeting = db.meetings.find_one({'room_id': room_id.upper()})
    if not meeting:
        return jsonify({'error': 'Room not found'}), 404
    
    return jsonify({
        'room_id': meeting['room_id'],
        'meeting_id': meeting.get('id'),
        'title': meeting.get('title', ''),
        'host_name': meeting.get('host_name', ''),
        'status': meeting.get('status', ''),
        'participant_count': len([p for p in meeting.get('participants', []) if p.get('is_online', False)]),
        'max_participants': meeting.get('settings', {}).get('participant_limit', 10),
        'created_at': meeting['created_at'].isoformat() + 'Z' if meeting.get('created_at') else None
    })