from flask import Blueprint, request, jsonify, current_app
from utils.ai import chatbot_answer

chatbot_bp = Blueprint('chatbot', __name__)

@chatbot_bp.route('/<meeting_id>', methods=['POST'])
def ask_question(meeting_id):
    question = request.json.get('question')
    doc = current_app.mongo.db.transcriptions.find_one({'meeting_id': meeting_id})
    if not doc:
        return jsonify({'error': 'Transcript not found'}), 404
    transcript = doc.get('transcript', '')
    answer = chatbot_answer(transcript, question)
    return jsonify({'answer': answer})