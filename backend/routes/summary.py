from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.ai import generate_summary
from datetime import datetime

summary_bp = Blueprint('summary', __name__)

def get_mongo():
    """Helper function to get mongo instance"""
    return current_app.mongo.db

@summary_bp.route('/<meeting_id>', methods=['POST'])
@jwt_required()
def generate_meeting_summary(meeting_id):
    db = get_mongo()
    transcript = request.json.get('transcript')
    
    if not transcript:
        # Fetch transcript from DB
        doc = db.transcriptions.find_one({'meeting_id': meeting_id})
        if not doc:
            return jsonify({'error': 'Transcript not found'}), 404
        transcript = doc.get('transcript', '')
    
    try:
        summary = generate_summary(transcript)
        db.summaries.update_one(
            {'meeting_id': meeting_id},
            {'$set': {
                'meeting_id': meeting_id,
                'summary': summary,
                'created_at': datetime.utcnow()
            }},
            upsert=True
        )
        return jsonify({'summary': summary})
    except Exception as e:
        return jsonify({'error': f'Failed to generate summary: {str(e)}'}), 500

@summary_bp.route('/<meeting_id>', methods=['GET'])
@jwt_required()
def get_meeting_summary(meeting_id):
    db = get_mongo()
    doc = db.summaries.find_one({'meeting_id': meeting_id})
    if doc:
        doc['_id'] = str(doc['_id'])
        return jsonify(doc)
    return jsonify({'error': 'Not found'}), 404