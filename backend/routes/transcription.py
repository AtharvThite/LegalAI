from flask import Blueprint, request, jsonify, current_app

transcription_bp = Blueprint('transcription', __name__)

@transcription_bp.route('/<meeting_id>', methods=['POST'])
def save_transcription(meeting_id):
    data = request.json
    current_app.mongo.db.transcriptions.insert_one({
        'meeting_id': meeting_id,
        'transcript': data.get('transcript'),
        'speakers': data.get('speakers'),
        'language': data.get('language')
    })
    return jsonify({'status': 'saved'}), 201

@transcription_bp.route('/<meeting_id>', methods=['GET'])
def get_transcription(meeting_id):
    doc = current_app.mongo.db.transcriptions.find_one({'meeting_id': meeting_id})
    if doc:
        doc['_id'] = str(doc['_id'])
        return jsonify(doc)
    return jsonify({'error': 'Not found'}), 404