from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
from bson.objectid import ObjectId
from bson.errors import InvalidId
import uuid

meetings_bp = Blueprint('meetings', __name__)

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

@meetings_bp.route('', methods=['GET'])
@jwt_required()
def get_meetings():
    user_id = get_jwt_identity()
    db = get_mongo()
    
    # Get query parameters
    folder_id = request.args.get('folder_id')
    search = request.args.get('search', '')
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 10))
    
    # Build query
    query = {'user_id': user_id}
    if folder_id and folder_id != 'all':
        query['folder_id'] = folder_id
    if search:
        query['$or'] = [
            {'title': {'$regex': search, '$options': 'i'}},
            {'description': {'$regex': search, '$options': 'i'}}
        ]
    
    # Get meetings with pagination
    meetings = list(db.meetings.find(query)
                   .sort('created_at', -1)
                   .skip((page - 1) * limit)
                   .limit(limit))
    
    # Convert ObjectId to string
    for meeting in meetings:
        meeting['_id'] = str(meeting['_id'])
        
    total = db.meetings.count_documents(query)
    
    return jsonify({
        'meetings': meetings,
        'total': total,
        'page': page,
        'pages': (total + limit - 1) // limit
    })

@meetings_bp.route('/<meeting_id>', methods=['GET'])
@jwt_required()
def get_meeting(meeting_id):
    user_id = get_jwt_identity()
    db = get_mongo()
    
    # Build query based on whether meeting_id is ObjectId or custom ID
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
    
    meeting['_id'] = str(meeting['_id'])
    
    # Get additional data - use the custom ID if available, otherwise use ObjectId
    search_id = meeting.get('id', str(meeting['_id']))
    transcript = db.transcriptions.find_one({'meeting_id': search_id})
    summary = db.summaries.find_one({'meeting_id': search_id})
    knowledge_graph = db.knowledge_graphs.find_one({'meeting_id': search_id})
    
    meeting['transcript'] = transcript.get('transcript', '') if transcript else ''
    meeting['summary'] = summary.get('summary', '') if summary else ''
    meeting['knowledge_graph'] = knowledge_graph.get('graph', {}) if knowledge_graph else {}
    
    return jsonify(meeting)

@meetings_bp.route('', methods=['POST'])
@jwt_required()
def create_meeting():
    user_id = get_jwt_identity()
    db = get_mongo()
    data = request.json
    
    meeting_data = {
        'id': str(uuid.uuid4()),
        'user_id': user_id,
        'title': data.get('title'),
        'description': data.get('description', ''),
        'folder_id': data.get('folder_id', 'recent'),
        'language': data.get('language', 'en-US'),
        'status': data.get('status', 'draft'),
        'created_at': datetime.utcnow(),
        'updated_at': datetime.utcnow(),
        'participants': data.get('participants', []),
        'tags': data.get('tags', [])
    }
    
    result = db.meetings.insert_one(meeting_data)
    meeting_data['_id'] = str(result.inserted_id)
    
    return jsonify(meeting_data), 201

@meetings_bp.route('/<meeting_id>', methods=['PUT'])
@jwt_required()
def update_meeting(meeting_id):
    user_id = get_jwt_identity()
    db = get_mongo()
    data = request.json
    
    update_data = {
        'updated_at': datetime.utcnow()
    }
    
    # Update allowed fields
    allowed_fields = ['title', 'description', 'folder_id', 'tags', 'participants', 'status', 'ended_at']
    for field in allowed_fields:
        if field in data:
            update_data[field] = data[field]
    
    # Build query based on whether meeting_id is ObjectId or custom ID
    if is_valid_objectid(meeting_id):
        query = {
            '$or': [{'id': meeting_id}, {'_id': ObjectId(meeting_id)}],
            'user_id': user_id
        }
    else:
        query = {'id': meeting_id, 'user_id': user_id}
    
    result = db.meetings.update_one(query, {'$set': update_data})
    
    if result.matched_count == 0:
        return jsonify({'error': 'Meeting not found'}), 404
    
    return jsonify({'message': 'Meeting updated successfully'})

@meetings_bp.route('/<meeting_id>', methods=['DELETE'])
@jwt_required()
def delete_meeting(meeting_id):
    user_id = get_jwt_identity()
    db = get_mongo()
    
    # Build query based on whether meeting_id is ObjectId or custom ID
    if is_valid_objectid(meeting_id):
        query = {
            '$or': [{'id': meeting_id}, {'_id': ObjectId(meeting_id)}],
            'user_id': user_id
        }
    else:
        query = {'id': meeting_id, 'user_id': user_id}
    
    # Get the meeting first to find the correct ID for cleanup
    meeting = db.meetings.find_one(query)
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404
    
    # Use the custom ID for cleanup if available
    cleanup_id = meeting.get('id', str(meeting['_id']))
    
    # Delete meeting
    result = db.meetings.delete_one(query)
    
    if result.deleted_count == 0:
        return jsonify({'error': 'Meeting not found'}), 404
    
    # Clean up related data using the correct ID
    db.transcriptions.delete_many({'meeting_id': cleanup_id})
    db.summaries.delete_many({'meeting_id': cleanup_id})
    db.knowledge_graphs.delete_many({'meeting_id': cleanup_id})
    db.conversations.delete_many({'meeting_id': cleanup_id})
    
    # Clean up vector store
    import shutil
    import os
    vector_store_path = f"vector_stores/{cleanup_id}"
    if os.path.exists(vector_store_path):
        shutil.rmtree(vector_store_path)
    
    return jsonify({'message': 'Meeting deleted successfully'})

# Folder management routes
@meetings_bp.route('/folders', methods=['GET'])
@jwt_required()
def get_folders():
    user_id = get_jwt_identity()
    db = get_mongo()
    
    try:
        user = db.users.find_one({'_id': ObjectId(user_id)})
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        folders = user.get('folders', [])
        
        # Add meeting counts to folders
        for folder in folders:
            count = db.meetings.count_documents({
                'user_id': user_id,
                'folder_id': folder['id']
            })
            folder['meeting_count'] = count
        
        return jsonify(folders)
    except Exception as e:
        print(f"Error in get_folders: {e}")
        return jsonify({'error': 'Internal server error'}), 500

@meetings_bp.route('/folders', methods=['POST'])
@jwt_required()
def create_folder():
    user_id = get_jwt_identity()
    db = get_mongo()
    data = request.json
    
    if not data or not data.get('name'):
        return jsonify({'error': 'Folder name is required'}), 400
    
    folder = {
        'id': str(uuid.uuid4()),
        'name': data.get('name'),
        'color': data.get('color', '#3B82F6'),
        'created_at': datetime.utcnow()
    }
    
    try:
        result = db.users.update_one(
            {'_id': ObjectId(user_id)},
            {'$push': {'folders': folder}}
        )
        
        if result.matched_count == 0:
            return jsonify({'error': 'User not found'}), 404
        
        folder['meeting_count'] = 0
        return jsonify(folder), 201
    except Exception as e:
        print(f"Error creating folder: {e}")
        return jsonify({'error': 'Failed to create folder'}), 500

@meetings_bp.route('/folders/<folder_id>', methods=['PUT'])
@jwt_required()
def update_folder(folder_id):
    user_id = get_jwt_identity()
    db = get_mongo()
    data = request.json
    
    update_fields = {}
    if 'name' in data:
        update_fields['folders.$.name'] = data['name']
    if 'color' in data:
        update_fields['folders.$.color'] = data['color']
    
    if not update_fields:
        return jsonify({'error': 'No valid fields to update'}), 400
    
    try:
        result = db.users.update_one(
            {'_id': ObjectId(user_id), 'folders.id': folder_id},
            {'$set': update_fields}
        )
        
        if result.matched_count == 0:
            return jsonify({'error': 'Folder not found'}), 404
        
        return jsonify({'message': 'Folder updated successfully'})
    except Exception as e:
        print(f"Error updating folder: {e}")
        return jsonify({'error': 'Failed to update folder'}), 500

@meetings_bp.route('/folders/<folder_id>', methods=['DELETE'])
@jwt_required()
def delete_folder(folder_id):
    user_id = get_jwt_identity()
    db = get_mongo()
    
    # Don't allow deleting default folders
    if folder_id in ['recent', 'work']:
        return jsonify({'error': 'Cannot delete default folders'}), 400
    
    try:
        # Move meetings to 'recent' folder
        db.meetings.update_many(
            {'user_id': user_id, 'folder_id': folder_id},
            {'$set': {'folder_id': 'recent'}}
        )
        
        # Delete folder
        result = db.users.update_one(
            {'_id': ObjectId(user_id)},
            {'$pull': {'folders': {'id': folder_id}}}
        )
        
        if result.matched_count == 0:
            return jsonify({'error': 'Folder not found'}), 404
        
        return jsonify({'message': 'Folder deleted successfully'})
    except Exception as e:
        print(f"Error deleting folder: {e}")
        return jsonify({'error': 'Failed to delete folder'}), 500