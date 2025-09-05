from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.ai import generate_knowledge_graph
from datetime import datetime
from bson.objectid import ObjectId
from bson.errors import InvalidId

knowledge_graph_bp = Blueprint('knowledge_graph', __name__)

def is_valid_objectid(id_string):
    """Check if string is a valid ObjectId"""
    try:
        ObjectId(id_string)
        return True
    except (InvalidId, TypeError):
        return False

@knowledge_graph_bp.route('/<meeting_id>', methods=['POST'])
@jwt_required()
def generate_graph(meeting_id):
    user_id = get_jwt_identity()
    db = current_app.mongo.db
    
    print(f"[DEBUG] Generating knowledge graph for meeting_id: {meeting_id}")
    
    # Verify meeting ownership
    if is_valid_objectid(meeting_id):
        query = {
            '$or': [{'id': meeting_id}, {'_id': ObjectId(meeting_id)}],
            'user_id': user_id
        }
    else:
        query = {'id': meeting_id, 'user_id': user_id}
    
    meeting = db.meetings.find_one(query)
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404
    
    # Get transcript from request or database
    transcript = request.json.get('transcript') if request.json else None
    
    if not transcript:
        # Try to find transcript in database
        search_ids = [
            meeting.get('id', str(meeting['_id'])),
            str(meeting['_id']),
            meeting_id
        ]
        
        doc = None
        for search_id in search_ids:
            doc = db.transcriptions.find_one({'meeting_id': search_id})
            if doc:
                break
        
        if not doc:
            return jsonify({'error': 'Transcript not found'}), 404
        
        transcript = doc.get('transcript', '')
    
    if not transcript or not transcript.strip():
        return jsonify({'error': 'Empty transcript'}), 400
    
    try:
        print(f"[DEBUG] Generating knowledge graph...")
        graph = generate_knowledge_graph(transcript)
        
        # Use consistent ID for storage
        storage_id = meeting.get('id', meeting_id)
        
        # Store knowledge graph
        db.knowledge_graphs.update_one(
            {'meeting_id': storage_id},
            {'$set': {
                'meeting_id': storage_id,
                'graph': graph,
                'created_at': datetime.utcnow()
            }},
            upsert=True
        )
        
        print(f"[DEBUG] Knowledge graph stored successfully")
        return jsonify({'graph': graph})
        
    except Exception as e:
        print(f"Error generating knowledge graph: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to generate knowledge graph: {str(e)}'}), 500

@knowledge_graph_bp.route('/<meeting_id>', methods=['GET'])
@jwt_required()
def get_graph(meeting_id):
    user_id = get_jwt_identity()
    db = current_app.mongo.db
    
    # Verify meeting ownership
    if is_valid_objectid(meeting_id):
        query = {
            '$or': [{'id': meeting_id}, {'_id': ObjectId(meeting_id)}],
            'user_id': user_id
        }
    else:
        query = {'id': meeting_id, 'user_id': user_id}
    
    meeting = db.meetings.find_one(query)
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404
    
    # Try multiple ways to find the knowledge graph
    search_id = meeting.get('id', str(meeting['_id']))
    
    doc = db.knowledge_graphs.find_one({'meeting_id': search_id})
    
    # If not found, try with other IDs
    if not doc and is_valid_objectid(meeting_id):
        doc = db.knowledge_graphs.find_one({'meeting_id': str(meeting['_id'])})
    
    if not doc:
        doc = db.knowledge_graphs.find_one({'meeting_id': meeting_id})
    
    if doc:
        doc['_id'] = str(doc['_id'])
        return jsonify(doc)
    
    return jsonify({'error': 'Knowledge graph not found'}), 404