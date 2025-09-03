from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.ai import chatbot_answer, create_vector_store, load_vector_store
from datetime import datetime
from bson.objectid import ObjectId

chatbot_bp = Blueprint('chatbot', __name__)

@chatbot_bp.route('/<meeting_id>/chat', methods=['POST'])
@jwt_required()
def ask_question(meeting_id):
    user_id = get_jwt_identity()
    data = request.json
    question = data.get('question')
    
    if not question:
        return jsonify({'error': 'Question is required'}), 400
    
    # Verify meeting ownership
    meeting = current_app.mongo.db.meetings.find_one({
        '$or': [{'id': meeting_id}, {'_id': ObjectId(meeting_id)}],
        'user_id': user_id
    })
    
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404
    
    # Get or create vector store
    vector_store = load_vector_store(meeting_id)
    if not vector_store:
        # Create vector store from transcript
        transcript_doc = current_app.mongo.db.transcriptions.find_one({'meeting_id': meeting_id})
        if not transcript_doc:
            return jsonify({'error': 'No transcript available for this meeting'}), 404
        
        transcript = transcript_doc.get('transcript', '')
        if not transcript:
            return jsonify({'error': 'Empty transcript'}), 404
        
        vector_store = create_vector_store(meeting_id, transcript)
    
    # Get answer from AI
    answer = chatbot_answer(meeting_id, question)
    
    # Save conversation to database
    conversation_entry = {
        'meeting_id': meeting_id,
        'user_id': user_id,
        'question': question,
        'answer': answer,
        'timestamp': datetime.utcnow()
    }
    
    current_app.mongo.db.conversations.insert_one(conversation_entry)
    
    return jsonify({
        'question': question,
        'answer': answer,
        'timestamp': conversation_entry['timestamp']
    })

@chatbot_bp.route('/<meeting_id>/history', methods=['GET'])
@jwt_required()
def get_chat_history(meeting_id):
    user_id = get_jwt_identity()
    
    # Verify meeting ownership
    meeting = current_app.mongo.db.meetings.find_one({
        '$or': [{'id': meeting_id}, {'_id': ObjectId(meeting_id)}],
        'user_id': user_id
    })
    
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404
    
    # Get conversation history
    conversations = list(current_app.mongo.db.conversations.find({
        'meeting_id': meeting_id,
        'user_id': user_id
    }).sort('timestamp', 1))
    
    # Convert ObjectId to string
    for conv in conversations:
        conv['_id'] = str(conv['_id'])
    
    return jsonify(conversations)

@chatbot_bp.route('/<meeting_id>/suggestions', methods=['GET'])
@jwt_required()
def get_question_suggestions(meeting_id):
    user_id = get_jwt_identity()
    
    # Get transcript to generate suggestions
    transcript_doc = current_app.mongo.db.transcriptions.find_one({'meeting_id': meeting_id})
    if not transcript_doc:
        return jsonify({'suggestions': []})
    
    # Generate smart question suggestions based on content
    import google.generativeai as genai
    model = genai.GenerativeModel("gemini-1.5-flash")
    
    transcript = transcript_doc.get('transcript', '')[:2000]  # First 2000 chars for speed
    
    response = model.generate_content(
        f"""Based on this meeting transcript, suggest 5 relevant questions someone might ask:

{transcript}

Return as JSON array of strings: ["Question 1?", "Question 2?", ...]"""
    )
    
    try:
        import json
        suggestions = json.loads(response.text.strip().replace('```json', '').replace('```', ''))
        return jsonify({'suggestions': suggestions})
    except:
        default_suggestions = [
            "What were the main decisions made in this meeting?",
            "What action items were assigned?",
            "Who were the key participants?",
            "What topics were discussed the most?",
            "What are the next steps?"
        ]
        return jsonify({'suggestions': default_suggestions})