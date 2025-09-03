from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity

transcription_bp = Blueprint('transcription', __name__)

def get_mongo():
    """Helper function to get mongo instance"""
    return current_app.mongo.db

@transcription_bp.route('/<meeting_id>', methods=['POST'])
@jwt_required()
def save_transcription(meeting_id):
    db = get_mongo()
    data = request.json
    
    transcription_data = {
        'meeting_id': meeting_id,
        'transcript': data.get('transcript'),
        'speakers': data.get('speakers'),
        'language': data.get('language'),
        'created_at': data.get('created_at'),
        'updated_at': data.get('updated_at')
    }
    
    # Update existing or insert new
    db.transcriptions.update_one(
        {'meeting_id': meeting_id},
        {'$set': transcription_data},
        upsert=True
    )
    
    return jsonify({'status': 'saved'}), 201

@transcription_bp.route('/<meeting_id>', methods=['GET'])
@jwt_required()
def get_transcription(meeting_id):
    db = get_mongo()
    doc = db.transcriptions.find_one({'meeting_id': meeting_id})
    if doc:
        doc['_id'] = str(doc['_id'])
        return jsonify(doc)
    return jsonify({'error': 'Not found'}), 404