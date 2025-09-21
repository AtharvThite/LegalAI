from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.ai import chatbot_answer, create_vector_store, load_vector_store, generate_simple_chat_response
from datetime import datetime
from bson.objectid import ObjectId
from bson.errors import InvalidId
import traceback

chatbot_bp = Blueprint('chatbot', __name__)

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

@chatbot_bp.route('/<document_id>/chat', methods=['POST'])
@jwt_required()
def chat_with_document(document_id):
    """Chat with AI about a specific document"""
    try:
        user_id = get_jwt_identity()
        db = get_mongo()
        data = request.get_json()
        
        # Fix: Check for both 'message' and 'question' in the request
        user_message = data.get('message') or data.get('question') if data else None
        
        if not user_message or not user_message.strip():
            return jsonify({'error': 'Message is required'}), 400
        
        print(f"[CHATBOT] Received message for document {document_id}: {user_message}")
        
        # Handle both ObjectId and UUID formats
        if is_valid_objectid(document_id):
            document = db.documents.find_one({'_id': ObjectId(document_id)})
        else:
            document = db.documents.find_one({'id': document_id})
            if not document:
                document = db.documents.find_one({'room_id': document_id.upper()})
        
        if not document:
            print(f"[CHATBOT] Document not found: {document_id}")
            return jsonify({'error': 'Document not found'}), 404
        
        # Check if user has access to this document
        user_has_access = False
        
        if document.get('host_id') == user_id or document.get('user_id') == user_id:
            user_has_access = True
        
        participants = document.get('participants', [])
        for participant in participants:
            if participant.get('user_id') == user_id:
                user_has_access = True
                break
        
        if not user_has_access:
            print(f"[CHATBOT] User {user_id} does not have access to document {document_id}")
            return jsonify({'error': 'Access denied'}), 403
        
        # Get document content
        document_text = document.get('content', '')
        
        if not document_text.strip():
            print("[CHATBOT] No content found for document")
            return jsonify({
                'response': "I don't have access to the content of this document yet. Please make sure the document has been shared with me.",
                'suggestions': [
                    "What is the main topic of this document?",
                    "Can you summarize the key points?",
                    "What are the action items?"
                ]
            })
        
        # Generate response using AI - use vector store for large documents, simple response for small ones
        try:
            print("[CHATBOT] Generating AI response...")
            
            # Check if we should use vector store (for large documents) or simple response
            MAX_SIMPLE_RESPONSE_LENGTH = 30000  # Same as MAX_CONTEXT_SIZE in ai.py
            
            if len(document_text) > MAX_SIMPLE_RESPONSE_LENGTH:
                print(f"[CHATBOT] Large document ({len(document_text)} chars), using vector store")
                
                # Try to load existing vector store
                vector_store = load_vector_store(document_id)
                
                if not vector_store:
                    print("[CHATBOT] No vector store found, creating one...")
                    try:
                        vector_store = create_vector_store(document_id, document_text)
                        print("[CHATBOT] Vector store created successfully")
                    except Exception as vs_error:
                        print(f"[CHATBOT] Failed to create vector store: {vs_error}")
                        # Fall back to simple response
                        ai_response = generate_simple_chat_response(user_message, document_text[:MAX_SIMPLE_RESPONSE_LENGTH] + "...")
                
                if vector_store:
                    # Use vector store for accurate responses
                    ai_response = chatbot_answer(document_id, user_message)
                    print(f"[CHATBOT] Used vector store for response")
            else:
                print(f"[CHATBOT] Small document ({len(document_text)} chars), using simple response")
                # Use simple response for smaller documents
                ai_response = generate_simple_chat_response(user_message, document_text)
            
            if not ai_response:
                ai_response = "I couldn't generate a response. Please try rephrasing your question."
            
            print(f"[CHATBOT] Generated response: {ai_response[:100]}...")
            
            # Save chat history
            chat_entry = {
                'document_id': document_id,
                'user_id': user_id,
                'message': user_message,
                'response': ai_response,
                'timestamp': datetime.utcnow()
            }
            
            try:
                db.chat_history.insert_one(chat_entry)
                print("[CHATBOT] Saved chat history")
            except Exception as save_error:
                print(f"[CHATBOT] Failed to save chat history: {str(save_error)}")
            
            suggestions = [
                "What were the key decisions made?",
                "Can you summarize the action items?",
                "Who were the main speakers?",
                "What topics were discussed the most?"
            ]
            
            return jsonify({
                'response': ai_response,
                'suggestions': suggestions
            })
            
        except Exception as ai_error:
            print(f"[CHATBOT] AI response error: {str(ai_error)}")
            traceback.print_exc()
            return jsonify({'error': 'Failed to generate AI response'}), 500
        
    except Exception as e:
        print(f"[CHATBOT] Unexpected error: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': 'Internal server error'}), 500

@chatbot_bp.route('/<document_id>/history', methods=['GET'])
@jwt_required()
def get_chat_history(document_id):
    """Get chat history for a document"""
    try:
        user_id = get_jwt_identity()
        db = get_mongo()
        
        # Handle both ObjectId and UUID formats
        if is_valid_objectid(document_id):
            document = db.documents.find_one({'_id': ObjectId(document_id)})
        else:
            document = db.documents.find_one({'id': document_id})
            if not document:
                document = db.documents.find_one({'room_id': document_id.upper()})
        
        if not document:
            return jsonify({'error': 'Document not found'}), 404
        
        # Check access (same logic as chat endpoint)
        user_has_access = False
        
        if document.get('host_id') == user_id or document.get('user_id') == user_id:
            user_has_access = True
        
        participants = document.get('participants', [])
        for participant in participants:
            if participant.get('user_id') == user_id:
                user_has_access = True
                break
        
        if not user_has_access:
            return jsonify({'error': 'Access denied'}), 403
        
        document_id = document.get('id', document_id)
        
        # Get chat history
        chat_history = list(db.chat_history.find({
            'document_id': document_id,
            'user_id': user_id
        }).sort('timestamp', 1))
        
        # Convert ObjectId to string and format timestamps
        for chat in chat_history:
            chat['_id'] = str(chat['_id'])
            if 'timestamp' in chat and chat['timestamp']:
                chat['timestamp'] = chat['timestamp'].isoformat() + 'Z'
        
        return jsonify({'history': chat_history})
        
    except Exception as e:
        print(f"[CHATBOT] History error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

@chatbot_bp.route('/<document_id>/suggestions', methods=['GET'])
@jwt_required()
def get_suggestions(document_id):
    """Get suggested questions for a document"""
    try:
        user_id = get_jwt_identity()
        db = get_mongo()
        
        # Handle both ObjectId and UUID formats
        if is_valid_objectid(document_id):
            document = db.documents.find_one({'_id': ObjectId(document_id)})
        else:
            document = db.documents.find_one({'id': document_id})
            if not document:
                document = db.documents.find_one({'room_id': document_id.upper()})
        
        if not document:
            return jsonify({'error': 'Document not found'}), 404
        
        # Check access
        user_has_access = False
        
        if document.get('host_id') == user_id or document.get('user_id') == user_id:
            user_has_access = True
        
        participants = document.get('participants', [])
        for participant in participants:
            if participant.get('user_id') == user_id:
                user_has_access = True
                break
        
        if not user_has_access:
            return jsonify({'error': 'Access denied'}), 403
        
        # Generate suggestions based on document type and content
        document_type = document.get('document_type', 'regular')
        suggestions = []
        
        if document_type == 'webrtc':
            suggestions = [
                "What were the main discussion points?",
                "Can you summarize this document?",
                "Who participated the most in the discussion?",
                "What decisions were made?",
                "Were there any action items mentioned?",
                "What questions were asked during the document?"
            ]
        else:
            suggestions = [
                "What was the main topic of this document?",
                "Can you provide a summary?",
                "What were the key takeaways?",
                "Were there any important decisions made?",
                "What action items were discussed?",
                "Who were the main speakers?"
            ]
        
        return jsonify({'suggestions': suggestions})
        
    except Exception as e:
        print(f"[CHATBOT] Suggestions error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500