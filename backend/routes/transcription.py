from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from bson.objectid import ObjectId
from bson.errors import InvalidId

transcription_bp = Blueprint('transcription', __name__)

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

@transcription_bp.route('/<document_id>', methods=['POST'])
@jwt_required()
def save_transcription(document_id):
    user_id = get_jwt_identity()
    db = get_mongo()
    data = request.json
    
    print(f"[DEBUG] Saving transcription for document_id: {document_id}")
    
    # Verify document ownership first
    if is_valid_objectid(document_id):
        query = {
            '$or': [{'id': document_id}, {'_id': ObjectId(document_id)}],
            'user_id': user_id
        }
    else:
        query = {'id': document_id, 'user_id': user_id}
    
    document = db.documents.find_one(query)
    if not document:
        print(f"[DEBUG] Document not found for transcription save")
        return jsonify({'error': 'Document not found'}), 404
    
    # Use the document's custom ID if available, otherwise use the document_id parameter
    storage_id = document.get('id', document_id)
    print(f"[DEBUG] Storing transcription with document_id: {storage_id}")
    
    transcription_data = {
        'document_id': storage_id,  # Use consistent ID
        'transcript': data.get('transcript'),
        'speakers': data.get('speakers'),
        'language': data.get('language'),
        'created_at': data.get('created_at'),
        'updated_at': data.get('updated_at')
    }
    
    # Update existing or insert new
    result = db.transcriptions.update_one(
        {'document_id': storage_id},
        {'$set': transcription_data},
        upsert=True
    )
    
    print(f"[DEBUG] Transcription saved. Matched: {result.matched_count}, Modified: {result.modified_count}, Upserted: {result.upserted_id}")
    
    return jsonify({'status': 'saved'}), 201

@transcription_bp.route('/<document_id>', methods=['GET'])
@jwt_required()
def get_transcription(document_id):
    user_id = get_jwt_identity()
    db = get_mongo()
    
    # Verify document ownership first
    if is_valid_objectid(document_id):
        query = {
            '$or': [{'id': document_id}, {'_id': ObjectId(document_id)}],
            'user_id': user_id
        }
    else:
        query = {'id': document_id, 'user_id': user_id}
    
    document = db.documents.find_one(query)
    if not document:
        return jsonify({'error': 'Document not found'}), 404
    
    # Try multiple ways to find the transcript
    search_ids = [
        document.get('id', str(document['_id'])),
        str(document['_id']),
        document_id
    ]
    
    doc = None
    for search_id in search_ids:
        doc = db.transcriptions.find_one({'document_id': search_id})
        if doc:
            break
    
    if doc:
        doc['_id'] = str(doc['_id'])
        return jsonify(doc)
    
    # If transcription not found, return the document data as a fallback
    document['_id'] = str(document['_id'])
    return jsonify(document)