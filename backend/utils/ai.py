import os
import json
import google.generativeai as genai
from dotenv import load_dotenv
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from typing import List

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=GEMINI_API_KEY)

# Initialize embeddings
embeddings = GoogleGenerativeAIEmbeddings(model="models/embedding-001", google_api_key=GEMINI_API_KEY)

# Constants
MAX_CONTEXT_SIZE = 30000  # Gemini's context limit
CHUNK_SIZE = 4096
CHUNK_OVERLAP = 512

def should_chunk_transcript(text):
    """Determine if transcript needs chunking based on size"""
    return len(text) > MAX_CONTEXT_SIZE

def chunk_transcript(text, chunk_size=CHUNK_SIZE, overlap=CHUNK_OVERLAP):
    """Only chunk if text is too large"""
    if not should_chunk_transcript(text):
        return [text]  # Return as single chunk
        
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=overlap,
        separators=["\n\n", "\n", ". ", " ", ""]
    )
    return splitter.split_text(text)

def create_vector_store(document_id: str, transcript: str):
    """Create vector store for document content"""
    try:
        chunks = chunk_transcript(transcript)
        
        # Create directory if it doesn't exist
        os.makedirs("vector_stores", exist_ok=True)
        
        # Create FAISS vector store
        vector_store = FAISS.from_texts(
            chunks,
            embeddings,
            metadatas=[{"document_id": document_id, "chunk_id": i} for i in range(len(chunks))]
        )
        
        # Save vector store
        vector_store.save_local(f"vector_stores/{document_id}")
        print(f"[AI] Vector store created and saved for document {document_id}")
        return vector_store
    except Exception as e:
        print(f"[AI] Error creating vector store: {e}")
        raise e

def load_vector_store(document_id: str):
    """Load existing vector store"""
    try:
        vector_store = FAISS.load_local(f"vector_stores/{document_id}", embeddings, allow_dangerous_deserialization=True)
        print(f"[AI] Vector store loaded for document {document_id}")
        return vector_store
    except Exception as e:
        print(f"[AI] Could not load vector store for document {document_id}: {e}")
        return None

def generate_simple_chat_response(question, transcript):
    """Generate a simple chat response using Gemini for smaller transcripts"""
    try:
        model = genai.GenerativeModel("gemini-1.5-flash")
        
        prompt = f"""You are an AI assistant helping users understand their document content. 

Document Content:
{transcript}

User Question: {question}

Instructions:
- Answer based only on the provided document content
- Be specific and helpful
- If the answer isn't in the document, say so clearly
- Keep responses concise but informative
- Use a friendly, professional tone

Answer:"""
        
        response = model.generate_content(prompt)
        return response.text
        
    except Exception as e:
        print(f"[AI] Simple chat response error: {str(e)}")
        return "I'm having trouble processing your question right now. Please try again."

def generate_summary(transcript):
    """Generate document summary - only chunk if necessary"""
    if not should_chunk_transcript(transcript):
        # Process as single document
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(
            f"""Analyze this document and provide a comprehensive summary:

Document: {transcript}

Provide:
1. **Executive Summary** (2-3 sentences)
2. **Key Points** (bullet points)
3. **Main Topics** (categorized)
4. **Key Findings** (if applicable)
5. **Recommendations** (if any)
6. **Important Quotes** (if any stand out)

Format the response clearly with headers and bullet points."""
        )
        return response.text
    
    # Handle large transcripts with chunking
    chunks = chunk_transcript(transcript)
    summaries = []
    
    for i, chunk in enumerate(chunks):
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(
            f"""Analyze this document chunk ({i+1}/{len(chunks)}) and provide:
            1. Key points discussed
            2. Main topics covered
            3. Important findings
            4. Key entities mentioned
            
            Document chunk: {chunk}"""
        )
        summaries.append(response.text)
    
    # Combine chunk summaries
    final_model = genai.GenerativeModel("gemini-1.5-flash")
    final_summary = final_model.generate_content(
        f"""Create a comprehensive document summary from these chunk summaries:
        
        {chr(10).join(summaries)}
        
        Provide:
        1. **Executive Summary** (2-3 sentences)
        2. **Key Points** (consolidated bullet points)
        3. **Main Topics** (consolidated and categorized)
        4. **Key Findings** (consolidated)
        5. **Recommendations** (consolidated)
        6. **Important Quotes** (best ones from all chunks)
        
        Format clearly with headers and remove any duplicates."""
    )
    return final_summary.text

def chatbot_answer(document_id: str, question: str):
    """Answer questions using vector similarity search for large documents"""
    try:
        vector_store = load_vector_store(document_id)
        
        if not vector_store:
            return "Vector store not found. Please process the document first."
        
        # Find relevant chunks
        relevant_docs = vector_store.similarity_search(question, k=5)
        context = "\n".join([doc.page_content for doc in relevant_docs])
        
        model = genai.GenerativeModel("gemini-1.5-flash")
        prompt = f"""You are an AI document assistant. Based on the following document context, answer the user's question accurately and concisely.

Context from document:
{context}

Question: {question}

Instructions:
- Answer based only on the provided context
- If the answer is not in the context, say "I don't have enough information in the document to answer that question."
- Be specific and cite relevant parts of the document
- Keep answers concise but informative"""

        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        print(f"[AI] Chatbot answer error: {e}")
        return "I'm having trouble processing your question right now. Please try again."

def identify_speakers(transcript_segments):
    """Identify different speakers in transcript segments"""
    # This is a simplified version - in production, use proper speaker diarization
    speakers = {}
    current_speaker = "Speaker_1"
    speaker_count = 1
    
    for segment in transcript_segments:
        # Simple speaker change detection based on pauses or audio characteristics
        # In real implementation, use libraries like pyannote.audio
        if segment.get('speaker_change', False) or len(speakers) == 0:
            current_speaker = f"Speaker_{speaker_count}"
            speaker_count += 1
            
        speakers[segment['timestamp']] = current_speaker
        
    return speakers

def generate_knowledge_graph(transcript):
    """Generate knowledge graph from document content"""
    # Only chunk if necessary for knowledge graph extraction
    if should_chunk_transcript(transcript):
        # For large transcripts, extract entities from chunks then combine
        chunks = chunk_transcript(transcript)
        all_entities = []
        all_relationships = []
        
        for chunk in chunks:
            chunk_graph = _extract_entities_from_chunk(chunk)
            if chunk_graph and 'nodes' in chunk_graph:
                all_entities.extend(chunk_graph['nodes'])
            if chunk_graph and 'edges' in chunk_graph:
                all_relationships.extend(chunk_graph['edges'])
        
        # Deduplicate and combine
        unique_entities = _deduplicate_entities(all_entities)
        unique_relationships = _deduplicate_relationships(all_relationships)
        
        return {
            "nodes": unique_entities,
            "edges": unique_relationships,
            "topics": _extract_topics_from_entities(unique_entities),
            "action_items": _extract_action_items(transcript)
        }
    else:
        # Process as single document
        return _extract_entities_from_chunk(transcript)

def _extract_entities_from_chunk(text):
    """Extract entities from a single chunk"""
    model = genai.GenerativeModel("gemini-1.5-flash")
    
    prompt = f"""Analyze this document and extract a knowledge graph in JSON format.

Text: {text}

Extract entities and relationships to create a knowledge graph. Focus on:
1. People mentioned (authors, stakeholders, experts)
2. Projects, products, or initiatives discussed
3. Companies, organizations, or departments
4. Key concepts, topics, or technologies
5. Important findings or conclusions
6. References to other documents or sources

Return ONLY valid JSON in this exact format:
{{
    "nodes": [
        {{"id": "person_john_doe", "label": "John Doe", "type": "person", "properties": {{"role": "author", "expertise": "AI"}}}},
        {{"id": "project_alpha", "label": "Project Alpha", "type": "project", "properties": {{"status": "active", "domain": "research"}}}},
        {{"id": "topic_budget", "label": "Budget Planning", "type": "topic", "properties": {{"category": "finance"}}}},
        {{"id": "finding_key", "label": "Key Finding", "type": "finding", "properties": {{"importance": "high", "validated": "true"}}}}
    ],
    "edges": [
        {{"source": "person_john_doe", "target": "project_alpha", "relationship": "leads", "weight": 1.0}},
        {{"source": "project_alpha", "target": "topic_budget", "relationship": "requires", "weight": 0.8}},
        {{"source": "person_john_doe", "target": "finding_key", "relationship": "discovered", "weight": 1.0}}
    ],
    "topics": ["research methodology", "data analysis", "findings validation", "future work"],
    "action_items": [
        {{"task": "Validate key findings with additional data", "assignee": "John Doe", "due_date": "next quarter", "priority": "high"}}
    ]
}}

Make sure to:
- Use meaningful IDs (no spaces, use underscores)
- Include diverse entity types (person, project, topic, finding, company, technology)
- Create logical relationships between entities
- Extract realistic action items with assignees when possible
- Include relevant properties for each entity"""
    
    try:
        response = model.generate_content(prompt)
        
        # Clean the response to extract JSON
        json_text = response.text.strip()
        
        # Remove markdown code block markers
        if json_text.startswith('```json'):
            json_text = json_text[7:]
        elif json_text.startswith('```'):
            json_text = json_text[3:]
        
        if json_text.endswith('```'):
            json_text = json_text[:-3]
        
        # Parse JSON
        result = json.loads(json_text)
        
        # Validate and fix the structure
        if not isinstance(result, dict):
            return _create_fallback_graph(text)
        
        # Ensure all required keys exist
        result.setdefault('nodes', [])
        result.setdefault('edges', [])
        result.setdefault('topics', [])
        result.setdefault('action_items', [])
        
        return result
        
    except Exception as e:
        print(f"[AI] Knowledge graph extraction error: {e}")
        return _create_fallback_graph(text)

def _create_fallback_graph(text):
    """Create a simple fallback graph when parsing fails"""
    # Extract basic information
    words = text.split()
    people_indicators = ['said', 'mentioned', 'asked', 'replied', 'stated', 'Speaker']
    projects_indicators = ['project', 'initiative', 'product', 'system', 'platform']
    
    nodes = []
    edges = []
    topics = []
    
    # Create generic nodes
    if any(indicator in text.lower() for indicator in people_indicators):
        nodes.append({
            "id": "generic_participant",
            "label": "Document Author",
            "type": "person",
            "properties": {"role": "participant"}
        })
    
    if any(indicator in text.lower() for indicator in projects_indicators):
        nodes.append({
            "id": "generic_project",
            "label": "Discussed Project",
            "type": "project",
            "properties": {"status": "mentioned"}
        })
    
    # Extract topics from common words
    common_topics = ['research', 'analysis', 'findings', 'methodology', 'conclusion', 'recommendation']
    for topic in common_topics:
        if topic in text.lower():
            topics.append(topic)
    
    return {
        "nodes": nodes,
        "edges": edges,
        "topics": topics[:5],
        "action_items": []
    }

def _deduplicate_entities(entities):
    """Remove duplicate entities based on label similarity"""
    if not entities:
        return []
    
    unique_entities = []
    seen_labels = set()
    
    for entity in entities:
        label_lower = entity.get('label', '').lower()
        if label_lower not in seen_labels:
            unique_entities.append(entity)
            seen_labels.add(label_lower)
    
    return unique_entities

def _deduplicate_relationships(relationships):
    """Remove duplicate relationships"""
    if not relationships:
        return []
    
    unique_relationships = []
    seen_relationships = set()
    
    for rel in relationships:
        rel_key = (rel.get('source'), rel.get('target'), rel.get('relationship'))
        if rel_key not in seen_relationships:
            unique_relationships.append(rel)
            seen_relationships.add(rel_key)
    
    return unique_relationships

def _extract_topics_from_entities(entities):
    """Extract topics from entity list"""
    topics = []
    for entity in entities:
        if entity.get('type') == 'topic':
            topics.append(entity.get('label', '').lower())
    return list(set(topics))[:10]  # Return max 10 unique topics

def _extract_action_items(transcript):
    """Extract action items from transcript"""
    # Simple action item extraction
    action_keywords = ['action item', 'todo', 'follow up', 'assign', 'due', 'deadline']
    lines = transcript.split('\n')
    
    action_items = []
    for line in lines:
        if any(keyword in line.lower() for keyword in action_keywords):
            action_items.append({
                "task": line.strip(),
                "assignee": "TBD",
                "due_date": "TBD",
                "priority": "medium"
            })
    
    return action_items[:5]  # Return max 5 action items

def translate_transcript(transcript, target_language):
    """Translate document content to target language"""
    if should_chunk_transcript(transcript):
        chunks = chunk_transcript(transcript)
        translated_chunks = []
        
        for chunk in chunks:
            model = genai.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content(
                f"Translate this document to {target_language}:\n\n{chunk}"
            )
            translated_chunks.append(response.text)
        
        return '\n\n'.join(translated_chunks)
    else:
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(
            f"Translate this document to {target_language}:\n\n{transcript}"
        )
        return response.text

def generate_document_insights(transcript):
    """Generate additional insights about the document"""
    model = genai.GenerativeModel("gemini-1.5-flash")
    
    prompt = f"""Analyze this document and provide insights:

{transcript}

Provide:
1. **Document Quality Score** (1-10 with reasoning)
2. **Content Analysis** (main themes, writing style, structure)
3. **Key Insights** (most important findings or conclusions)
4. **Recommendations** (suggested improvements or applications)
5. **Document Metrics** (length, complexity, readability, etc.)

Format as structured text with clear sections."""
    
    response = model.generate_content(prompt)
    return response.text