from flask import Blueprint, request, jsonify, current_app

meetings_bp = Blueprint('meetings', __name__)

@meetings_bp.route('/', methods=['GET'])
def get_meetings():
    meetings = list(current_app.mongo.db.meetings.find())
    for m in meetings:
        m['_id'] = str(m['_id'])
    return jsonify(meetings)

@meetings_bp.route('/', methods=['POST'])
def create_meeting():
    data = request.json
    result = current_app.mongo.db.meetings.insert_one(data)
    return jsonify({'_id': str(result.inserted_id)}), 201