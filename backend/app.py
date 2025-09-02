from flask import Flask
from flask_cors import CORS
from flask_pymongo import PyMongo

app = Flask(__name__)
CORS(app)
app.config["MONGO_URI"] = "mongodb://localhost:27017/huddle"
mongo = PyMongo(app)

# Import and register blueprints
from routes.meetings import meetings_bp
from routes.transcription import transcription_bp
from routes.summary import summary_bp
from routes.knowledge_graph import knowledge_graph_bp
from routes.chatbot import chatbot_bp
from routes.report import report_bp

app.register_blueprint(meetings_bp, url_prefix='/api/meetings')
app.register_blueprint(transcription_bp, url_prefix='/api/transcription')
app.register_blueprint(summary_bp, url_prefix='/api/summary')
app.register_blueprint(knowledge_graph_bp, url_prefix='/api/knowledge-graph')
app.register_blueprint(chatbot_bp, url_prefix='/api/chatbot')
app.register_blueprint(report_bp, url_prefix='/api/report')

if __name__ == "__main__":
    app.run(debug=True)