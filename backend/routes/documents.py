from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
from bson.objectid import ObjectId
from bson.errors import InvalidId
import uuid
import io
import PyPDF2
from docx import Document

documents_bp = Blueprint('documents', __name__)

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

@documents_bp.route('', methods=['GET'])
@jwt_required()
def get_documents():
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
    
    # Get documents with pagination
    documents = list(db.documents.find(query)
                   .sort('created_at', -1)
                   .skip((page - 1) * limit)
                   .limit(limit))
    
    # Convert ObjectId to string and ensure id field exists
    for document in documents:
        document['_id'] = str(document['_id'])
        if 'id' not in document:
            document['id'] = document['_id']
        
    total = db.documents.count_documents(query)
    
    return jsonify({
        'documents': documents,
        'total': total,
        'page': page,
        'pages': (total + limit - 1) // limit
    })

@documents_bp.route('/<document_id>', methods=['GET'])
@jwt_required()
def get_document(document_id):
    user_id = get_jwt_identity()
    db = get_mongo()
    
    # Build query based on whether document_id is ObjectId or custom ID
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
    
    document['_id'] = str(document['_id'])
    
    # Ensure consistent datetime handling
    def format_datetime(dt):
        if dt is None:
            return None
        if isinstance(dt, datetime):
            return dt.isoformat() + 'Z'  # Add Z for UTC timezone
        elif isinstance(dt, str):
            # Already formatted
            return dt
        else:
            # Try to convert to datetime first
            try:
                return datetime.fromisoformat(str(dt)).isoformat() + 'Z'
            except:
                return str(dt)
    
    # Format datetime fields
    for field in ['created_at', 'updated_at', 'started_at', 'ended_at']:
        if field in document:
            document[field] = format_datetime(document[field])
    
    return jsonify(document)

@documents_bp.route('', methods=['POST'])
@jwt_required()
def create_document():
    user_id = get_jwt_identity()
    db = get_mongo()
    data = request.json
    
    if not data or not data.get('title'):
        return jsonify({'error': 'Title is required'}), 400
    
    # Generate unique ID
    document_id = str(uuid.uuid4())
    
    document_data = {
        'id': document_id,
        'title': data['title'],
        'description': data.get('description', ''),
        'content': data.get('content', ''),  # For uploaded document text
        'file_name': data.get('file_name', ''),  # Original file name
        'file_type': data.get('file_type', ''),  # pdf, txt, docx, etc.
        'folder_id': data.get('folder_id', 'recent'),
        'user_id': user_id,
        'created_at': datetime.utcnow(),
        'updated_at': datetime.utcnow(),
        'status': 'processed'  # or 'processing' if async
    }
    
    result = db.documents.insert_one(document_data)
    document_data['_id'] = str(result.inserted_id)
    
    # Also save the extracted text as a transcript
    if data.get('content', '').strip():
        transcript_data = {
            'document_id': document_id,
            'transcript': data['content'].strip(),
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow(),
            'user_id': user_id
        }
        
        db.transcriptions.update_one(
            {'document_id': document_id},
            {'$set': transcript_data},
            upsert=True
        )
    
    return jsonify(document_data), 201

@documents_bp.route('/<document_id>', methods=['PUT'])
@jwt_required()
def update_document(document_id):
    user_id = get_jwt_identity()
    db = get_mongo()
    data = request.json
    
    # Build query based on whether document_id is ObjectId or custom ID
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
    
    # Update fields
    update_data = {}
    allowed_fields = ['title', 'description', 'content', 'folder_id', 'status']
    for field in allowed_fields:
        if field in data:
            update_data[field] = data[field]
    
    update_data['updated_at'] = datetime.utcnow()
    
    db.documents.update_one({'_id': document['_id']}, {'$set': update_data})
    
    # Return updated document
    updated_document = db.documents.find_one({'_id': document['_id']})
    updated_document['_id'] = str(updated_document['_id'])
    
    return jsonify(updated_document)

@documents_bp.route('/<document_id>', methods=['DELETE'])
@jwt_required()
def delete_document(document_id):
    user_id = get_jwt_identity()
    db = get_mongo()
    
    # Build query based on whether document_id is ObjectId or custom ID
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
    
    # Delete related data
    search_id = document.get('id', str(document['_id']))
    db.transcriptions.delete_many({'document_id': search_id})
    db.summaries.delete_many({'document_id': search_id})
    db.knowledge_graphs.delete_many({'document_id': search_id})
    
    # Delete the document
    db.documents.delete_one({'_id': document['_id']})
    
    return jsonify({'message': 'Document deleted successfully'})

@documents_bp.route('/upload', methods=['POST'])
@jwt_required()
def upload_document():
    user_id = get_jwt_identity()
    db = get_mongo()
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    # Check file type
    allowed_extensions = {'txt', 'pdf', 'docx', 'doc'}
    if not file.filename.lower().endswith(tuple('.' + ext for ext in allowed_extensions)):
        return jsonify({'error': 'Unsupported file type. Allowed: txt, pdf, docx, doc'}), 400
    
    # Read file content
    file_content = file.read()
    
    # Extract text based on file type
    text_content = ""
    try:
        if file.filename.lower().endswith('.txt'):
            text_content = file_content.decode('utf-8')
        elif file.filename.lower().endswith('.pdf'):
            # Extract text from PDF
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_content))
            for page in pdf_reader.pages:
                text_content += page.extract_text() + "\n"
        elif file.filename.lower().endswith('.docx'):
            # Extract text from DOCX
            doc = Document(io.BytesIO(file_content))
            for paragraph in doc.paragraphs:
                text_content += paragraph.text + "\n"
        elif file.filename.lower().endswith('.doc'):
            # For .doc files, we'll store a placeholder for now
            # as python-docx doesn't handle .doc files
            text_content = f"Document file uploaded: {file.filename} (.doc format requires additional processing)"
    except Exception as e:
        return jsonify({'error': f'Failed to process file: {str(e)}'}), 400
    
    # Create document
    document_id = str(uuid.uuid4())
    document_data = {
        'id': document_id,
        'title': request.form.get('title', file.filename),
        'description': request.form.get('description', f'Uploaded document: {file.filename}'),
        'content': text_content,
        'file_name': file.filename,
        'file_type': file.filename.split('.')[-1].lower(),
        'folder_id': request.form.get('folder_id', 'recent'),
        'user_id': user_id,
        'created_at': datetime.utcnow(),
        'updated_at': datetime.utcnow(),
        'status': 'processed'
    }
    
    result = db.documents.insert_one(document_data)
    document_data['_id'] = str(result.inserted_id)
    
    # Also save the extracted text as a transcript
    if text_content.strip():
        transcript_data = {
            'document_id': document_id,
            'transcript': text_content.strip(),
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow(),
            'user_id': user_id
        }
        
        db.transcriptions.update_one(
            {'document_id': document_id},
            {'$set': transcript_data},
            upsert=True
        )
    
    return jsonify(document_data), 201

@documents_bp.route('/folders', methods=['GET'])
@jwt_required()
def get_folders():
    user_id = get_jwt_identity()
    db = get_mongo()
    
    user = db.users.find_one({'_id': ObjectId(user_id)})
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    folders = user.get('folders', [])
    
    return jsonify({'folders': folders})

@documents_bp.route('/folders', methods=['POST'])
@jwt_required()
def create_folder():
    user_id = get_jwt_identity()
    db = get_mongo()
    data = request.json
    
    if not data or not data.get('name'):
        return jsonify({'error': 'Folder name is required'}), 400
    
    new_folder = {
        'id': str(uuid.uuid4()),
        'name': data['name'],
        'color': data.get('color', '#3B82F6'),
        'created_at': datetime.utcnow()
    }
    
    db.users.update_one(
        {'_id': ObjectId(user_id)},
        {'$push': {'folders': new_folder}}
    )
    
    return jsonify(new_folder), 201

@documents_bp.route('/folders/<folder_id>', methods=['PUT'])
@jwt_required()
def update_folder(folder_id):
    user_id = get_jwt_identity()
    db = get_mongo()
    data = request.json
    
    update_data = {}
    if 'name' in data:
        update_data['folders.$.name'] = data['name']
    if 'color' in data:
        update_data['folders.$.color'] = data['color']
    
    if not update_data:
        return jsonify({'error': 'No valid fields to update'}), 400
    
    result = db.users.update_one(
        {'_id': ObjectId(user_id), 'folders.id': folder_id},
        {'$set': update_data}
    )
    
    if result.matched_count == 0:
        return jsonify({'error': 'Folder not found'}), 404
    
    return jsonify({'message': 'Folder updated'})

@documents_bp.route('/folders/<folder_id>', methods=['DELETE'])
@jwt_required()
def delete_folder(folder_id):
    user_id = get_jwt_identity()
    db = get_mongo()
    
    # Don't allow deleting default folders
    default_folders = ['recent', 'work', 'personal']
    if folder_id in default_folders:
        return jsonify({'error': 'Cannot delete default folders'}), 400
    
    result = db.users.update_one(
        {'_id': ObjectId(user_id)},
        {'$pull': {'folders': {'id': folder_id}}}
    )
    
    if result.modified_count == 0:
        return jsonify({'error': 'Folder not found'}), 404
    
    return jsonify({'message': 'Folder deleted'})