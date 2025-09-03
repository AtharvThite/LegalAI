from flask import Blueprint, send_file, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
from bson.objectid import ObjectId
import io
import json
import csv
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors

report_bp = Blueprint('report', __name__)

@report_bp.route('/<meeting_id>/<format_type>', methods=['GET'])
@jwt_required()
def download_report(meeting_id, format_type):
    user_id = get_jwt_identity()
    
    # Verify meeting ownership
    meeting = current_app.mongo.db.meetings.find_one({
        '$or': [{'id': meeting_id}, {'_id': ObjectId(meeting_id)}],
        'user_id': user_id
    })
    
    if not meeting:
        return jsonify({'error': 'Meeting not found'}), 404
    
    # Get all meeting data
    transcript_doc = current_app.mongo.db.transcriptions.find_one({'meeting_id': meeting_id})
    summary_doc = current_app.mongo.db.summaries.find_one({'meeting_id': meeting_id})
    knowledge_graph_doc = current_app.mongo.db.knowledge_graphs.find_one({'meeting_id': meeting_id})
    
    transcript = transcript_doc.get('transcript', '') if transcript_doc else 'No transcript available'
    summary = summary_doc.get('summary', '') if summary_doc else 'No summary available'
    knowledge_graph = knowledge_graph_doc.get('graph', {}) if knowledge_graph_doc else {}
    
    if format_type.lower() == 'pdf':
        return generate_pdf_report(meeting, transcript, summary, knowledge_graph)
    elif format_type.lower() == 'json':
        return generate_json_report(meeting, transcript, summary, knowledge_graph)
    elif format_type.lower() == 'csv':
        return generate_csv_report(meeting, transcript, summary, knowledge_graph)
    elif format_type.lower() == 'txt':
        return generate_txt_report(meeting, transcript, summary, knowledge_graph)
    else:
        return jsonify({'error': 'Unsupported format. Use pdf, json, csv, or txt'}), 400

def generate_pdf_report(meeting, transcript, summary, knowledge_graph):
    """Generate PDF report using ReportLab"""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    story = []
    
    # Title
    title_style = ParagraphStyle(
        'Title',
        parent=styles['Title'],
        fontSize=24,
        spaceAfter=30,
        textColor=colors.HexColor('#2563EB')
    )
    story.append(Paragraph(f"Meeting Report: {meeting.get('title', 'Untitled')}", title_style))
    story.append(Spacer(1, 20))
    
    # Meeting Info Table
    meeting_info = [
        ['Meeting ID:', meeting.get('id', 'N/A')],
        ['Date:', meeting.get('created_at', datetime.now()).strftime('%Y-%m-%d %H:%M')],
        ['Language:', meeting.get('language', 'N/A')],
        ['Status:', meeting.get('status', 'N/A')],
        ['Duration:', _calculate_duration(meeting)]
    ]
    
    info_table = Table(meeting_info, colWidths=[2*inch, 4*inch])
    info_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#F3F4F6')),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 12),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ('GRID', (0, 0), (-1, -1), 1, colors.black)
    ]))
    story.append(info_table)
    story.append(Spacer(1, 30))
    
    # Summary Section
    if summary:
        story.append(Paragraph("Meeting Summary", styles['Heading1']))
        story.append(Spacer(1, 12))
        story.append(Paragraph(summary, styles['Normal']))
        story.append(Spacer(1, 20))
    
    # Knowledge Graph Section
    if knowledge_graph and knowledge_graph.get('action_items'):
        story.append(Paragraph("Action Items", styles['Heading1']))
        story.append(Spacer(1, 12))
        
        for i, action in enumerate(knowledge_graph['action_items'], 1):
            action_text = f"{i}. {action.get('task', 'N/A')}"
            if action.get('assignee'):
                action_text += f" (Assigned to: {action['assignee']})"
            if action.get('due_date'):
                action_text += f" (Due: {action['due_date']})"
            
            story.append(Paragraph(action_text, styles['Normal']))
            story.append(Spacer(1, 6))
        
        story.append(Spacer(1, 20))
    
    # Transcript Section (truncated for PDF)
    if transcript:
        story.append(Paragraph("Transcript (Preview)", styles['Heading1']))
        story.append(Spacer(1, 12))
        preview = transcript[:2000] + "..." if len(transcript) > 2000 else transcript
        story.append(Paragraph(preview, styles['Normal']))
    
    # Build PDF
    doc.build(story)
    buffer.seek(0)
    
    return send_file(
        buffer,
        mimetype='application/pdf',
        as_attachment=True,
        download_name=f"meeting_{meeting.get('id', 'report')}.pdf"
    )

def generate_json_report(meeting, transcript, summary, knowledge_graph):
    """Generate JSON report"""
    report_data = {
        'meeting_info': {
            'id': meeting.get('id'),
            'title': meeting.get('title'),
            'created_at': meeting.get('created_at').isoformat() if meeting.get('created_at') else None,
            'language': meeting.get('language'),
            'status': meeting.get('status'),
            'participants': meeting.get('participants', [])
        },
        'transcript': transcript,
        'summary': summary,
        'knowledge_graph': knowledge_graph,
        'generated_at': datetime.utcnow().isoformat()
    }
    
    json_str = json.dumps(report_data, indent=2, ensure_ascii=False)
    buffer = io.BytesIO(json_str.encode('utf-8'))
    
    return send_file(
        buffer,
        mimetype='application/json',
        as_attachment=True,
        download_name=f"meeting_{meeting.get('id', 'report')}.json"
    )

def generate_csv_report(meeting, transcript, summary, knowledge_graph):
    """Generate CSV report with action items and key data"""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    
    # Meeting info
    writer.writerow(['Meeting Report'])
    writer.writerow(['Title', meeting.get('title', 'N/A')])
    writer.writerow(['ID', meeting.get('id', 'N/A')])
    writer.writerow(['Date', meeting.get('created_at', '').strftime('%Y-%m-%d %H:%M') if meeting.get('created_at') else 'N/A'])
    writer.writerow(['Language', meeting.get('language', 'N/A')])
    writer.writerow([])
    
    # Action items
    if knowledge_graph and knowledge_graph.get('action_items'):
        writer.writerow(['Action Items'])
        writer.writerow(['Task', 'Assignee', 'Due Date', 'Priority'])
        for action in knowledge_graph['action_items']:
            writer.writerow([
                action.get('task', ''),
                action.get('assignee', ''),
                action.get('due_date', ''),
                action.get('priority', '')
            ])
        writer.writerow([])
    
    # Topics
    if knowledge_graph and knowledge_graph.get('topics'):
        writer.writerow(['Topics Discussed'])
        for topic in knowledge_graph['topics']:
            writer.writerow([topic])
        writer.writerow([])
    
    # Summary
    writer.writerow(['Summary'])
    writer.writerow([summary])
    
    buffer.seek(0)
    return send_file(
        io.BytesIO(buffer.getvalue().encode('utf-8')),
        mimetype='text/csv',
        as_attachment=True,
        download_name=f"meeting_{meeting.get('id', 'report')}.csv"
    )

def generate_txt_report(meeting, transcript, summary, knowledge_graph):
    """Generate plain text report"""
    report_lines = [
        f"MEETING REPORT",
        f"=" * 50,
        f"",
        f"Title: {meeting.get('title', 'N/A')}",
        f"Meeting ID: {meeting.get('id', 'N/A')}",
        f"Date: {meeting.get('created_at').strftime('%Y-%m-%d %H:%M') if meeting.get('created_at') else 'N/A'}",
        f"Language: {meeting.get('language', 'N/A')}",
        f"Status: {meeting.get('status', 'N/A')}",
        f"",
        f"SUMMARY",
        f"-" * 20,
        summary,
        f"",
    ]
    
    # Action items
    if knowledge_graph and knowledge_graph.get('action_items'):
        report_lines.extend([
            f"ACTION ITEMS",
            f"-" * 20
        ])
        for i, action in enumerate(knowledge_graph['action_items'], 1):
            line = f"{i}. {action.get('task', 'N/A')}"
            if action.get('assignee'):
                line += f" (Assigned: {action['assignee']})"
            if action.get('due_date'):
                line += f" (Due: {action['due_date']})"
            report_lines.append(line)
        report_lines.append("")
    
    # Topics
    if knowledge_graph and knowledge_graph.get('topics'):
        report_lines.extend([
            f"TOPICS DISCUSSED",
            f"-" * 20
        ])
        for topic in knowledge_graph['topics']:
            report_lines.append(f"• {topic}")
        report_lines.append("")
    
    # Full transcript
    report_lines.extend([
        f"FULL TRANSCRIPT",
        f"-" * 20,
        transcript
    ])
    
    report_text = "\n".join(report_lines)
    buffer = io.BytesIO(report_text.encode('utf-8'))
    
    return send_file(
        buffer,
        mimetype='text/plain',
        as_attachment=True,
        download_name=f"meeting_{meeting.get('id', 'report')}.txt"
    )

def _calculate_duration(meeting):
    """Calculate meeting duration"""
    created = meeting.get('created_at')
    ended = meeting.get('ended_at')
    
    if created and ended:
        duration = ended - created
        minutes = int(duration.total_seconds() / 60)
        return f"{minutes} minutes"
    
    return "N/A"

@report_bp.route('/bulk-export', methods=['POST'])
@jwt_required()
def bulk_export():
    """Export multiple meetings at once"""
    user_id = get_jwt_identity()
    data = request.json
    meeting_ids = data.get('meeting_ids', [])
    format_type = data.get('format', 'json')
    
    if not meeting_ids:
        return jsonify({'error': 'No meeting IDs provided'}), 400
    
    # For now, return JSON with all meetings
    meetings_data = []
    
    for meeting_id in meeting_ids:
        meeting = current_app.mongo.db.meetings.find_one({
            '$or': [{'id': meeting_id}, {'_id': ObjectId(meeting_id)}],
            'user_id': user_id
        })
        
        if meeting:
            # Get associated data
            transcript_doc = current_app.mongo.db.transcriptions.find_one({'meeting_id': meeting_id})
            summary_doc = current_app.mongo.db.summaries.find_one({'meeting_id': meeting_id})
            
            meeting_data = {
                'meeting': meeting,
                'transcript': transcript_doc.get('transcript', '') if transcript_doc else '',
                'summary': summary_doc.get('summary', '') if summary_doc else ''
            }
            
            # Convert ObjectId to string
            meeting_data['meeting']['_id'] = str(meeting_data['meeting']['_id'])
            meetings_data.append(meeting_data)
    
    # Create ZIP file with all reports
    import zipfile
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for meeting_data in meetings_data:
            meeting = meeting_data['meeting']
            filename = f"meeting_{meeting.get('id', 'unknown')}.json"
            
            content = json.dumps(meeting_data, indent=2, ensure_ascii=False, default=str)
            zip_file.writestr(filename, content)
    
    zip_buffer.seek(0)
    
    return send_file(
        zip_buffer,
        mimetype='application/zip',
        as_attachment=True,
        download_name=f"meetings_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    )