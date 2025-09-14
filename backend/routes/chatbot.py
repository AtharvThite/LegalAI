from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.ai import chatbot_answer, create_vector_store, load_vector_store
from datetime import datetime
from bson.objectid import ObjectId
from bson.errors import InvalidId
import os
import traceback

chatbot_bp = Blueprint('chatbot', __name__)

def get_mongo():
    """Helper function to get mongo instance"""
    return current_app.mongo.db

def is_valid_objectid(id_string):
    """Check if string is a valid ObjectId"""
    try:
        ObjectId(id_string)
        return True
    except (InvalidId, TypeError):
        return False

@chatbot_bp.route('/<meeting_id>/chat', methods=['POST'])
@jwt_required()
def chat_with_meeting(meeting_id):
    """Chat with AI about a specific meeting"""
    try:
        user_id = get_jwt_identity()
        db = get_mongo()
        data = request.get_json()
        
        if not data or 'message' not in data:
            return jsonify({'error': 'Message is required'}), 400
        
        user_message = data['message']
        
        print(f"[CHATBOT] Received message for meeting {meeting_id}: {user_message}")
        
        # Handle both ObjectId and UUID formats
        if is_valid_objectid(meeting_id):
            # MongoDB ObjectId format
            meeting = db.meetings.find_one({'_id': ObjectId(meeting_id)})
        else:
            # UUID format (for WebRTC meetings)
            meeting = db.meetings.find_one({'id': meeting_id})
            if not meeting:
                # Also try room_id for WebRTC meetings
                meeting = db.meetings.find_one({'room_id': meeting_id.upper()})
        
        if not meeting:
            print(f"[CHATBOT] Meeting not found: {meeting_id}")
            return jsonify({'error': 'Meeting not found'}), 404
        
        # Check if user has access to this meeting
        user_has_access = False
        
        # Check if user is host
        if meeting.get('host_id') == user_id or meeting.get('user_id') == user_id:
            user_has_access = True
        
        # Check if user is participant
        participants = meeting.get('participants', [])
        for participant in participants:
            if participant.get('user_id') == user_id:
                user_has_access = True
                break
        
        if not user_has_access:
            print(f"[CHATBOT] User {user_id} does not have access to meeting {meeting_id}")
            return jsonify({'error': 'Access denied'}), 403
        
        # Get meeting transcript
        transcript_text = ""
        meeting_uuid = meeting.get('id', meeting_id)  # Use UUID if available, fallback to meeting_id
        
        print(f"[CHATBOT] Looking for transcript with meeting_id: {meeting_uuid}")
        
        # Try to get transcript from transcript_segments collection
        transcript_segments = list(db.transcript_segments.find({
            'meeting_id': meeting_uuid
        }).sort('timestamp', 1))
        
        if transcript_segments:
            transcript_text = '\n'.join([
                f"{segment.get('speaker_name', 'Unknown')}: {segment.get('text', '')}"
                for segment in transcript_segments
            ])
            print(f"[CHATBOT] Found {len(transcript_segments)} transcript segments")
        else:
            # Fallback to meeting transcript field
            transcript_text = meeting.get('transcript', '')
            print(f"[CHATBOT] Using meeting transcript field, length: {len(transcript_text)}")
        
        if not transcript_text.strip():
            print("[CHATBOT] No transcript found for meeting")
            return jsonify({
                'response': "I don't have access to the transcript for this meeting yet. Please make sure the meeting has been recorded and transcribed.",
                'suggestions': [
                    "What was discussed in this meeting?",
                    "Can you summarize the key points?",
                    "What were the action items?"
                ]
            })
        
        # Get or create vector store for this meeting
        try:
            print("[CHATBOT] Loading/creating vector store...")
            vector_store = load_vector_store(meeting_uuid)
            
            if vector_store is None:
                print("[CHATBOT] Creating new vector store...")
                vector_store = create_vector_store(transcript_text, meeting_uuid)
                
                if vector_store is None:
                    raise Exception("Failed to create vector store")
            
            print("[CHATBOT] Vector store ready")
        except Exception as e:
            print(f"[CHATBOT] Vector store error: {str(e)}")
            # Fallback to simple text-based response
            try:
                from utils.ai import generate_simple_response
                response = generate_simple_response(user_message, transcript_text)
                return jsonify({
                    'response': response,
                    'suggestions': [
                        "What were the main topics discussed?",
                        "Can you summarize this meeting?",
                        "What were the key decisions made?"
                    ]
                })
            except Exception as fallback_error:
                print(f"[CHATBOT] Fallback error: {str(fallback_error)}")
                return jsonify({'error': 'AI service temporarily unavailable'}), 503
        
        # Generate response using AI
        try:
            print("[CHATBOT] Generating AI response...")
            ai_response = chatbot_answer(user_message, vector_store)
            
            if not ai_response:
                ai_response = "I couldn't generate a response. Please try rephrasing your question."
            
            print(f"[CHATBOT] Generated response: {ai_response[:100]}...")
            
            # Save chat history
            chat_entry = {
                'meeting_id': meeting_uuid,
                'user_id': user_id,
                'message': user_message,
                'response': ai_response,
                'timestamp': datetime.utcnow()
            }
            
            try:
                db.chat_history.insert_one(chat_entry)
                print("[CHATBOT] Saved chat history")
            except Exception as save_error:
                print(f"[CHATBOT] Failed to save chat history: {str(save_error)}")
                # Don't fail the request if chat history saving fails
            
            # Generate suggestions based on the meeting content
            suggestions = [
                "What were the key decisions made?",
                "Can you summarize the action items?",
                "Who were the main speakers?",
                "What topics were discussed the most?"
            ]
            
            return jsonify({
                'response': ai_response,
                'suggestions': suggestions
            })
            
        except Exception as ai_error:
            print(f"[CHATBOT] AI response error: {str(ai_error)}")
            print(f"[CHATBOT] AI error traceback: {traceback.format_exc()}")
            return jsonify({'error': 'Failed to generate AI response'}), 500
        
    except Exception as e:
        print(f"[CHATBOT] Unexpected error: {str(e)}")
        print(f"[CHATBOT] Traceback: {traceback.format_exc()}")
        return jsonify({'error': 'Internal server error'}), 500

@chatbot_bp.route('/<meeting_id>/history', methods=['GET'])
@jwt_required()
def get_chat_history(meeting_id):
    """Get chat history for a meeting"""
    try:
        user_id = get_jwt_identity()
        db = get_mongo()
        
        # Handle both ObjectId and UUID formats
        if is_valid_objectid(meeting_id):
            meeting = db.meetings.find_one({'_id': ObjectId(meeting_id)})
        else:
            meeting = db.meetings.find_one({'id': meeting_id})
            if not meeting:
                meeting = db.meetings.find_one({'room_id': meeting_id.upper()})
        
        if not meeting:
            return jsonify({'error': 'Meeting not found'}), 404
        
        # Check access (same logic as chat endpoint)
        user_has_access = False
        
        if meeting.get('host_id') == user_id or meeting.get('user_id') == user_id:
            user_has_access = True
        
        participants = meeting.get('participants', [])
        for participant in participants:
            if participant.get('user_id') == user_id:
                user_has_access = True
                break
        
        if not user_has_access:
            return jsonify({'error': 'Access denied'}), 403
        
        meeting_uuid = meeting.get('id', meeting_id)
        
        # Get chat history
        chat_history = list(db.chat_history.find({
            'meeting_id': meeting_uuid,
            'user_id': user_id
        }).sort('timestamp', 1))
        
        # Convert ObjectId to string and format timestamps
        for chat in chat_history:
            chat['_id'] = str(chat['_id'])
            if 'timestamp' in chat and chat['timestamp']:
                chat['timestamp'] = chat['timestamp'].isoformat() + 'Z'
        
        return jsonify({'history': chat_history})
        
    except Exception as e:
        print(f"[CHATBOT] History error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@chatbot_bp.route('/<meeting_id>/suggestions', methods=['GET'])
@jwt_required()
def get_suggestions(meeting_id):
    """Get suggested questions for a meeting"""
    try:
        user_id = get_jwt_identity()
        db = get_mongo()
        
        # Handle both ObjectId and UUID formats
        if is_valid_objectid(meeting_id):
            meeting = db.meetings.find_one({'_id': ObjectId(meeting_id)})
        else:
            meeting = db.meetings.find_one({'id': meeting_id})
            if not meeting:
                meeting = db.meetings.find_one({'room_id': meeting_id.upper()})
        
        if not meeting:
            return jsonify({'error': 'Meeting not found'}), 404
        
        # Check access
        user_has_access = False
        
        if meeting.get('host_id') == user_id or meeting.get('user_id') == user_id:
            user_has_access = True
        
        participants = meeting.get('participants', [])
        for participant in participants:
            if participant.get('user_id') == user_id:
                user_has_access = True
                break
        
        if not user_has_access:
            return jsonify({'error': 'Access denied'}), 403
        
        # Generate suggestions based on meeting type and content
        meeting_type = meeting.get('meeting_type', 'regular')
        suggestions = []
        
        if meeting_type == 'webrtc':
            suggestions = [
                "What were the main discussion points?",
                "Can you summarize this meeting?",
                "Who participated the most in the discussion?",
                "What decisions were made?",
                "Were there any action items mentioned?",
                "What questions were asked during the meeting?"
            ]
        else:
            suggestions = [
                "What was the main topic of this meeting?",
                "Can you provide a summary?",
                "What were the key takeaways?",
                "Were there any important decisions made?",
                "What action items were discussed?",
                "Who were the main speakers?"
            ]
        
        return jsonify({'suggestions': suggestions})
        
    except Exception as e:
        print(f"[CHATBOT] Suggestions error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500