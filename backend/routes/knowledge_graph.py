from flask import Blueprint, request, jsonify, current_app
# from utils.google_api import generate_knowledge_graph  # You'd implement this

knowledge_graph_bp = Blueprint('knowledge_graph', __name__)

@knowledge_graph_bp.route('/<meeting_id>', methods=['POST'])
def generate_graph(meeting_id):
    # transcript = request.json.get('transcript')
    # graph = generate_knowledge_graph(transcript)  # Google API call
    graph = {"nodes": [], "edges": []}  # Placeholder
    current_app.mongo.db.knowledge_graphs.insert_one({
        'meeting_id': meeting_id,
        'graph': graph
    })
    return jsonify({'graph': graph})

@knowledge_graph_bp.route('/<meeting_id>', methods=['GET'])
def get_graph(meeting_id):
    doc = current_app.mongo.db.knowledge_graphs.find_one({'meeting_id': meeting_id})
    if doc:
        doc['_id'] = str(doc['_id'])
        return jsonify(doc)
    return jsonify({'error': 'Not found'}), 404