from flask import Blueprint, send_file, request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from datetime import datetime
from bson.objectid import ObjectId
from bson.errors import InvalidId
from reportlab.lib.pagesizes import letter, A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, ListFlowable, ListItem
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
import io
import json
import csv
import zipfile
import re

report_bp = Blueprint('report', __name__)

def is_valid_objectid(id_string):
    """Check if string is a valid ObjectId"""
    try:
        ObjectId(id_string)
        return True
    except (InvalidId, TypeError):
        return False

def parse_markdown_for_pdf(markdown_text):
    """Parse markdown text and convert to ReportLab flowables"""
    if not markdown_text:
        return []
    
    styles = getSampleStyleSheet()
    
    # Custom styles for different elements
    heading_style = ParagraphStyle(
        'Heading',
        parent=styles['Heading2'],
        fontSize=14,
        spaceAfter=12,
        textColor=colors.HexColor('#1F2937'),
        fontName='Helvetica-Bold'
    )
    
    subheading_style = ParagraphStyle(
        'SubHeading',
        parent=styles['Heading3'],
        fontSize=12,
        spaceAfter=8,
        textColor=colors.HexColor('#374151'),
        fontName='Helvetica-Bold'
    )
    
    normal_style = ParagraphStyle(
        'Normal',
        parent=styles['Normal'],
        fontSize=10,
        spaceAfter=6,
        textColor=colors.HexColor('#4B5563')
    )
    
    flowables = []
    lines = markdown_text.split('\n')
    current_list_items = []
    
    for line in lines:
        line = line.strip()
        if not line:
            if current_list_items:
                # Create bullet list
                list_flowable = ListFlowable(
                    [ListItem(Paragraph(item, normal_style)) for item in current_list_items],
                    bulletType='bullet'
                )
                flowables.append(list_flowable)
                current_list_items = []
            flowables.append(Spacer(1, 6))
            continue
        
        # Headers
        if line.startswith('### '):
            if current_list_items:
                list_flowable = ListFlowable(
                    [ListItem(Paragraph(item, normal_style)) for item in current_list_items],
                    bulletType='bullet'
                )
                flowables.append(list_flowable)
                current_list_items = []
            flowables.append(Paragraph(line[4:], subheading_style))
        elif line.startswith('## '):
            if current_list_items:
                list_flowable = ListFlowable(
                    [ListItem(Paragraph(item, normal_style)) for item in current_list_items],
                    bulletType='bullet'
                )
                flowables.append(list_flowable)
                current_list_items = []
            flowables.append(Paragraph(line[3:], heading_style))
        elif line.startswith('# '):
            if current_list_items:
                list_flowable = ListFlowable(
                    [ListItem(Paragraph(item, normal_style)) for item in current_list_items],
                    bulletType='bullet'
                )
                flowables.append(list_flowable)
                current_list_items = []
            flowables.append(Paragraph(line[2:], heading_style))
        # Bullet points
        elif line.startswith('* ') or line.startswith('- '):
            current_list_items.append(line[2:])
        # Numbered lists
        elif re.match(r'^\d+\. ', line):
            current_list_items.append(re.sub(r'^\d+\. ', '', line))
        else:
            if current_list_items:
                list_flowable = ListFlowable(
                    [ListItem(Paragraph(item, normal_style)) for item in current_list_items],
                    bulletType='bullet'
                )
                flowables.append(list_flowable)
                current_list_items = []
            
            # Process bold text
            processed_line = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', line)
            flowables.append(Paragraph(processed_line, normal_style))
    
    # Handle remaining list items
    if current_list_items:
        list_flowable = ListFlowable(
            [ListItem(Paragraph(item, normal_style)) for item in current_list_items],
            bulletType='bullet'
        )
        flowables.append(list_flowable)
    
    return flowables

@report_bp.route('/<document_id>/<format_type>', methods=['GET'])
@jwt_required()
def download_report(document_id, format_type):
    user_id = get_jwt_identity()
    
    # Verify document ownership
    if is_valid_objectid(document_id):
        query = {
            '$or': [{'id': document_id}, {'_id': ObjectId(document_id)}],
            'user_id': user_id
        }
    else:
        query = {'id': document_id, 'user_id': user_id}
    
    document = current_app.mongo.db.documents.find_one(query)
    
    if not document:
        return jsonify({'error': 'Document not found'}), 404
    
    # Get all document data
    search_id = document.get('id', str(document['_id']))
    transcript_doc = current_app.mongo.db.transcriptions.find_one({'document_id': search_id})
    summary_doc = current_app.mongo.db.summaries.find_one({'document_id': search_id})
    knowledge_graph_doc = current_app.mongo.db.knowledge_graphs.find_one({'document_id': search_id})
    
    transcript = transcript_doc.get('transcript', '') if transcript_doc else 'No transcript available'
    summary = summary_doc.get('summary', '') if summary_doc else 'No summary available'
    knowledge_graph = knowledge_graph_doc.get('graph', {}) if knowledge_graph_doc else {}
    
    try:
        if format_type == 'pdf':
            return generate_pdf_report(document, transcript, summary, knowledge_graph)
        elif format_type == 'json':
            return generate_json_report(document, transcript, summary, knowledge_graph)
        elif format_type == 'csv':
            return generate_csv_report(document, transcript, summary, knowledge_graph)
        elif format_type == 'txt':
            return generate_txt_report(document, transcript, summary, knowledge_graph)
        else:
            return jsonify({'error': 'Invalid format type'}), 400
    except Exception as e:
        print(f"Error generating report: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Failed to generate report: {str(e)}'}), 500

def generate_pdf_report(document, transcript, summary, knowledge_graph):
    """Generate PDF report using ReportLab with markdown parsing"""
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
    story.append(Paragraph(f"Document Report: {document.get('title', 'Untitled')}", title_style))
    story.append(Spacer(1, 20))
    
    # Document Info Table
    document_info = [
        ['Document ID:', document.get('id', 'N/A')],
        ['Date:', _format_datetime_for_display(document.get('created_at'))],
        ['Language:', document.get('language', 'N/A')],
        ['Status:', document.get('status', 'N/A')],
        ['Duration:', _calculate_duration(document)]
    ]
    
    info_table = Table(document_info, colWidths=[2*inch, 4*inch])
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
    
    # Summary Section with markdown parsing
    if summary and summary != 'No summary available':
        summary_heading = ParagraphStyle(
            'SummaryHeading',
            parent=styles['Heading1'],
            fontSize=18,
            spaceAfter=20,
            textColor=colors.HexColor('#1F2937')
        )
        story.append(Paragraph("Document Summary", summary_heading))
        story.append(Spacer(1, 12))
        
        # Parse and add markdown content
        summary_flowables = parse_markdown_for_pdf(summary)
        story.extend(summary_flowables)
        story.append(Spacer(1, 20))
    
    # Knowledge Graph Section
    if knowledge_graph and knowledge_graph.get('action_items'):
        story.append(Paragraph("Action Items", styles['Heading1']))
        story.append(Spacer(1, 12))
        
        for i, action in enumerate(knowledge_graph['action_items'], 1):
            action_text = f"{i}. {action.get('task', 'N/A')} - Assigned to: {action.get('assignee', 'N/A')} - Due: {action.get('due_date', 'N/A')}"
            story.append(Paragraph(action_text, styles['Normal']))
        
        story.append(Spacer(1, 20))
    
    # Transcript Section (truncated for PDF)
    if transcript and transcript != 'No transcript available':
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
        download_name=f"document_{document.get('id', 'report')}.pdf"
    )

def generate_json_report(document, transcript, summary, knowledge_graph):
    """Generate JSON report"""
    report_data = {
        'document_info': {
            'id': document.get('id'),
            'title': document.get('title'),
            'created_at': _format_datetime_for_display(document.get('created_at')),
            'language': document.get('language'),
            'status': document.get('status'),
            'participants': document.get('participants', [])
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
        download_name=f"document_{document.get('id', 'report')}.json"
    )

def generate_csv_report(document, transcript, summary, knowledge_graph):
    """Generate CSV report with action items and key data"""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    
    # Document info
    writer.writerow(['Document Report'])
    writer.writerow(['Title', document.get('title', 'N/A')])
    writer.writerow(['ID', document.get('id', 'N/A')])
    writer.writerow(['Date', _format_datetime_for_display(document.get('created_at'))])
    writer.writerow(['Language', document.get('language', 'N/A')])
    writer.writerow([])
    
    # Action items
    if knowledge_graph and knowledge_graph.get('action_items'):
        writer.writerow(['Action Items'])
        writer.writerow(['Task', 'Assignee', 'Due Date', 'Priority'])
        for action in knowledge_graph['action_items']:
            writer.writerow([
                action.get('task', 'N/A'),
                action.get('assignee', 'N/A'),
                action.get('due_date', 'N/A'),
                action.get('priority', 'N/A')
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
        download_name=f"document_{document.get('id', 'report')}.csv"
    )

def generate_txt_report(document, transcript, summary, knowledge_graph):
    """Generate plain text report"""
    report_lines = [
        f"DOCUMENT REPORT",
        f"=" * 50,
        f"",
        f"Title: {document.get('title', 'N/A')}",
        f"Document ID: {document.get('id', 'N/A')}",
        f"Date: {_format_datetime_for_display(document.get('created_at'))}",
        f"Language: {document.get('language', 'N/A')}",
        f"Status: {document.get('status', 'N/A')}",
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
            report_lines.append(f"{i}. {action.get('task', 'N/A')} - {action.get('assignee', 'N/A')} - {action.get('due_date', 'N/A')}")
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
        download_name=f"document_{document.get('id', 'report')}.txt"
    )

def _calculate_duration(document):
    """Calculate document duration"""
    created = document.get('created_at')
    ended = document.get('ended_at')
    
    if created and ended:
        # Ensure both are datetime objects
        if isinstance(created, str):
            try:
                created = datetime.fromisoformat(created.replace('Z', '+00:00'))
            except:
                return "N/A"
        
        if isinstance(ended, str):
            try:
                ended = datetime.fromisoformat(ended.replace('Z', '+00:00'))
            except:
                return "N/A"
        
        try:
            duration = ended - created
            hours, remainder = divmod(duration.total_seconds(), 3600)
            minutes, _ = divmod(remainder, 60)
            return f"{int(hours)}h {int(minutes)}m"
        except:
            return "N/A"
    
    return "N/A"

def _format_datetime_for_display(dt):
    """Format datetime for display"""
    if not dt:
        return 'N/A'
    
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace('Z', '+00:00'))
        except:
            return dt  # Return as-is if parsing fails
    
    if isinstance(dt, datetime):
        return dt.strftime('%Y-%m-%d %H:%M')
    
    return str(dt)

@report_bp.route('/bulk-export', methods=['POST'])
@jwt_required()
def bulk_export():
    user_id = get_jwt_identity()
    data = request.json
    
    document_ids = data.get('document_ids', [])
    format_type = data.get('format', 'json')
    
    if not document_ids:
        return jsonify({'error': 'No documents selected'}), 400
    
    # Get all documents
    documents_data = []
    for document_id in document_ids:
        if _is_valid_objectid(document_id):
            query = {
                '$or': [{'id': document_id}, {'_id': ObjectId(document_id)}],
                'user_id': user_id
            }
        else:
            query = {'id': document_id, 'user_id': user_id}
        
        document = current_app.mongo.db.documents.find_one(query)
        if document:
            # Get related data
            search_id = document.get('id', str(document['_id']))
            transcript_doc = current_app.mongo.db.transcriptions.find_one({'document_id': search_id})
            summary_doc = current_app.mongo.db.summaries.find_one({'document_id': search_id})
            knowledge_graph_doc = current_app.mongo.db.knowledge_graphs.find_one({'document_id': search_id})
            
            document_data = {
                'document_info': {
                    'id': document.get('id'),
                    'title': document.get('title'),
                    'created_at': _format_datetime_for_display(document.get('created_at')),
                    'language': document.get('language'),
                    'status': document.get('status'),
                    'participants': document.get('participants', [])
                },
                'transcript': transcript_doc.get('transcript', '') if transcript_doc else '',
                'summary': summary_doc.get('summary', '') if summary_doc else '',
                'knowledge_graph': knowledge_graph_doc.get('graph', {}) if knowledge_graph_doc else {}
            }
            documents_data.append(document_data)
    
    try:
        if format_type == 'json':
            return _export_bulk_json(documents_data)
        elif format_type == 'csv':
            return _export_bulk_csv(documents_data)
        elif format_type == 'zip':
            return _export_bulk_zip(documents_data, 'txt')
        else:
            return jsonify({'error': 'Invalid format type'}), 400
    except Exception as e:
        print(f"Error in bulk export: {e}")
        return jsonify({'error': f'Failed to export documents: {str(e)}'}), 500

def _is_valid_objectid(id_string):
    """Check if string is a valid ObjectId"""
    try:
        ObjectId(id_string)
        return True
    except:
        return False

def _export_bulk_json(documents_data):
    """Export all documents as a single JSON file"""
    export_data = {
        'export_info': {
            'generated_at': datetime.utcnow().isoformat(),
            'total_documents': len(documents_data),
            'format': 'json'
        },
        'documents': documents_data
    }
    
    json_str = json.dumps(export_data, indent=2, ensure_ascii=False)
    buffer = io.BytesIO(json_str.encode('utf-8'))
    
    return send_file(
        buffer,
        mimetype='application/json',
        as_attachment=True,
        download_name=f"documents_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    )

def _export_bulk_csv(documents_data):
    """Export all documents as CSV"""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    
    # Headers
    writer.writerow([
        'Document ID', 'Title', 'Date', 'Language', 'Status', 
        'Participants', 'Summary', 'Action Items Count', 'Topics Count'
    ])
    
    # Data rows
    for document_data in documents_data:
        document_info = document_data['document_info']
        kg = document_data.get('knowledge_graph', {})
        
        writer.writerow([
            document_info.get('id', 'N/A'),
            document_info.get('title', 'N/A'),
            document_info.get('created_at', 'N/A'),
            document_info.get('language', 'N/A'),
            document_info.get('status', 'N/A'),
            ', '.join(document_info.get('participants', [])),
            document_data.get('summary', 'N/A')[:100] + '...' if len(document_data.get('summary', '')) > 100 else document_data.get('summary', 'N/A'),
            len(kg.get('action_items', [])),
            len(kg.get('topics', []))
        ])
    
    buffer.seek(0)
    return send_file(
        io.BytesIO(buffer.getvalue().encode('utf-8')),
        mimetype='text/csv',
        as_attachment=True,
        download_name=f"documents_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    )

def _export_bulk_zip(documents_data, format_type):
    """Export documents as ZIP file with individual files"""
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for i, document_data in enumerate(documents_data):
            document_info = document_data['document_info']
            document_id = document_info.get('id', f'document_{i+1}')
            
            if format_type == 'json':
                filename = f"{document_id}.json"
                content = json.dumps(document_data, indent=2, ensure_ascii=False)
                zip_file.writestr(filename, content.encode('utf-8'))
                
            elif format_type == 'txt':
                filename = f"{document_id}.txt"
                content = _create_txt_content(document_data)
                zip_file.writestr(filename, content.encode('utf-8'))
                
            elif format_type == 'csv':
                filename = f"{document_id}.csv"
                csv_buffer = io.StringIO()
                writer = csv.writer(csv_buffer)
                
                # Document info
                writer.writerow(['Document Report'])
                writer.writerow(['Title', document_info.get('title', 'N/A')])
                writer.writerow(['ID', document_info.get('id', 'N/A')])
                writer.writerow(['Date', document_info.get('created_at', 'N/A')])
                writer.writerow(['Language', document_info.get('language', 'N/A')])
                writer.writerow([])
                
                # Action items
                kg = document_data.get('knowledge_graph', {})
                if kg.get('action_items'):
                    writer.writerow(['Action Items'])
                    writer.writerow(['Task', 'Assignee', 'Due Date', 'Priority'])
                    for item in kg['action_items']:
                        writer.writerow([
                            item.get('task', ''),
                            item.get('assignee', ''),
                            item.get('due_date', ''),
                            item.get('priority', '')
                        ])
                    writer.writerow([])
                
                # Topics
                if kg.get('topics'):
                    writer.writerow(['Topics'])
                    for topic in kg['topics']:
                        writer.writerow([topic])
                    writer.writerow([])
                
                # Summary
                writer.writerow(['Summary'])
                writer.writerow([document_data.get('summary', 'No summary available')])
                
                content = csv_buffer.getvalue()
                zip_file.writestr(filename, content.encode('utf-8'))
    
    zip_buffer.seek(0)
    
    return send_file(
        zip_buffer,
        mimetype='application/zip',
        as_attachment=True,
        download_name=f"documents_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    )

def _create_txt_content(document_data):
    """Create text content for a document"""
    document_info = document_data['document_info']
    lines = [
        f"DOCUMENT REPORT",
        f"=" * 50,
        f"",
        f"Title: {document_info.get('title', 'N/A')}",
        f"Document ID: {document_info.get('id', 'N/A')}",
        f"Date: {document_info.get('created_at', 'N/A')}",
        f"Language: {document_info.get('language', 'N/A')}",
        f"Status: {document_info.get('status', 'N/A')}",
        f"Participants: {', '.join(document_info.get('participants', []))}",
        f"",
        f"SUMMARY",
        f"-" * 20,
        document_data.get('summary', 'No summary available'),
        f"",
    ]
    
    # Add action items if available
    kg = document_data.get('knowledge_graph', {})
    if kg.get('action_items'):
        lines.extend([
            f"ACTION ITEMS",
            f"-" * 20
        ])
        for i, action in enumerate(kg['action_items'], 1):
            lines.append(f"{i}. {action.get('task', 'N/A')} - {action.get('assignee', 'N/A')} - {action.get('due_date', 'N/A')}")
        lines.append("")
    
    # Add topics if available
    if kg.get('topics'):
        lines.extend([
            f"TOPICS DISCUSSED",
            f"-" * 20
        ])
        for topic in kg['topics']:
            lines.append(f"• {topic}")
        lines.append("")
    
    # Add transcript
    lines.extend([
        f"FULL TRANSCRIPT",
        f"-" * 20,
        document_data.get('transcript', 'No transcript available')
    ])
    
    return "\n".join(lines)