from flask import Blueprint, request, jsonify, current_app
from utils.ai import generate_summary

summary_bp = Blueprint('summary', __name__)

@summary_bp.route('/<meeting_id>', methods=['POST'])
def generate_meeting_summary(meeting_id):
    transcript = request.json.get('transcript')
    if not transcript:
        # Optionally fetch transcript from DB
        doc = current_app.mongo.db.transcriptions.find_one({'meeting_id': meeting_id})
        if not doc:
            return jsonify({'error': 'Transcript not found'}), 404
        transcript = doc.get('transcript', '')
    summary = generate_summary(transcript)
    current_app.mongo.db.summaries.insert_one({
        'meeting_id': meeting_id,
        'summary': summary
    })
    return jsonify({'summary': summary})

@summary_bp.route('/<meeting_id>', methods=['GET'])
def get_meeting_summary(meeting_id):
    doc = current_app.mongo.db.summaries.find_one({'meeting_id': meeting_id})
    if doc:
        doc['_id'] = str(doc['_id'])
        return jsonify(doc)
    return jsonify({'error': 'Not found'}), 404