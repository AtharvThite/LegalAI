import os
from dotenv import load_dotenv
import google.generativeai as genai
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_google_genai import GoogleGenerativeAIEmbeddings
import numpy as np
from typing import List
import json

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

def create_vector_store(meeting_id: str, transcript: str):
    """Create vector store for meeting transcript"""
    chunks = chunk_transcript(transcript)
    
    # Create directory if it doesn't exist
    os.makedirs("vector_stores", exist_ok=True)
    
    # Create FAISS vector store
    vector_store = FAISS.from_texts(
        chunks,
        embeddings,
        metadatas=[{"meeting_id": meeting_id, "chunk_id": i} for i in range(len(chunks))]
    )
    
    # Save vector store
    vector_store.save_local(f"vector_stores/{meeting_id}")
    return vector_store

def load_vector_store(meeting_id: str):
    """Load existing vector store"""
    try:
        return FAISS.load_local(f"vector_stores/{meeting_id}", embeddings, allow_dangerous_deserialization=True)
    except:
        return None

def generate_summary(transcript):
    """Generate meeting summary - only chunk if necessary"""
    if not should_chunk_transcript(transcript):
        # Process as single document
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(
            f"""Analyze this meeting transcript and provide a comprehensive summary:

Transcript: {transcript}

Provide:
1. **Executive Summary** (2-3 sentences)
2. **Key Discussion Points** (bullet points)
3. **Decisions Made** (if any)
4. **Action Items** (with owners if mentioned)
5. **Next Steps** (if discussed)
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
            f"""Analyze this meeting transcript chunk ({i+1}/{len(chunks)}) and provide:
            1. Key discussion points
            2. Decisions made
            3. Action items
            4. Important participants mentioned
            
            Transcript chunk: {chunk}"""
        )
        summaries.append(response.text)
    
    # Combine chunk summaries
    final_model = genai.GenerativeModel("gemini-1.5-flash")
    final_summary = final_model.generate_content(
        f"""Create a comprehensive meeting summary from these chunk summaries:
        
        {chr(10).join(summaries)}
        
        Provide:
        1. **Executive Summary** (2-3 sentences)
        2. **Key Discussion Points** (consolidated bullet points)
        3. **Decisions Made** (consolidated)
        4. **Action Items** (with owners, consolidated)
        5. **Next Steps** (consolidated)
        6. **Important Quotes** (best ones from all chunks)
        
        Format clearly with headers and remove any duplicates."""
    )
    return final_summary.text

def chatbot_answer(meeting_id: str, question: str):
    """Answer questions using vector similarity search"""
    vector_store = load_vector_store(meeting_id)
    
    if not vector_store:
        return "Vector store not found. Please process the meeting first."
    
    # Find relevant chunks
    relevant_docs = vector_store.similarity_search(question, k=5)
    context = "\n".join([doc.page_content for doc in relevant_docs])
    
    model = genai.GenerativeModel("gemini-1.5-flash")
    prompt = f"""You are an AI meeting assistant. Based on the following meeting context, answer the user's question accurately and concisely.

Context from meeting:
{context}

Question: {question}

Instructions:
- Answer based only on the provided context
- If the answer is not in the context, say "I don't have enough information in the meeting transcript to answer that question."
- Be specific and cite relevant parts of the meeting
- Include timestamps or speaker information if available
- Keep answers concise but informative"""

    response = model.generate_content(prompt)
    return response.text

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
            speaker_count += 1
            current_speaker = f"Speaker_{min(speaker_count, 4)}"  # Max 4 speakers
            
        speakers[segment['timestamp']] = current_speaker
        
    return speakers

def generate_knowledge_graph(transcript):
    """Generate knowledge graph from meeting transcript"""
    # Only chunk if necessary for knowledge graph extraction
    if should_chunk_transcript(transcript):
        # For large transcripts, extract entities from chunks then combine
        chunks = chunk_transcript(transcript)
        all_entities = []
        all_relationships = []
        
        for chunk in chunks:
            chunk_result = _extract_entities_from_chunk(chunk)
            all_entities.extend(chunk_result.get('nodes', []))
            all_relationships.extend(chunk_result.get('edges', []))
        
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
    
    prompt = f"""Analyze this meeting transcript and extract a knowledge graph in JSON format:

Text: {text}

Extract:
1. Entities (people, projects, companies, concepts, technologies)
2. Relationships between entities
3. Key topics discussed
4. Action items and their assignments

Return ONLY valid JSON in this exact format:
{{
    "nodes": [
        {{"id": "person_john", "label": "John Smith", "type": "person", "properties": {{"role": "manager"}}}},
        {{"id": "project_alpha", "label": "Project Alpha", "type": "project", "properties": {{"status": "active"}}}}
    ],
    "edges": [
        {{"source": "person_john", "target": "project_alpha", "relationship": "manages", "weight": 1.0}}
    ],
    "topics": ["project planning", "budget discussion"],
    "action_items": [
        {{"task": "Review budget proposal", "assignee": "John Smith", "due_date": "next week"}}
    ]
}}"""
    
    response = model.generate_content(prompt)
    
    try:
        # Clean the response to extract JSON
        json_text = response.text.strip()
        if json_text.startswith('```json'):
            json_text = json_text[7:]
        if json_text.endswith('```'):
            json_text = json_text[:-3]
        
        return json.loads(json_text)
    except Exception as e:
        print(f"Error parsing knowledge graph: {e}")
        return {"nodes": [], "edges": [], "topics": [], "action_items": []}

def _deduplicate_entities(entities):
    """Remove duplicate entities based on ID"""
    seen = set()
    unique = []
    for entity in entities:
        if entity['id'] not in seen:
            seen.add(entity['id'])
            unique.append(entity)
    return unique

def _deduplicate_relationships(relationships):
    """Remove duplicate relationships"""
    seen = set()
    unique = []
    for rel in relationships:
        key = (rel['source'], rel['target'], rel['relationship'])
        if key not in seen:
            seen.add(key)
            unique.append(rel)
    return unique

def _extract_topics_from_entities(entities):
    """Extract topics from entity list"""
    topics = []
    for entity in entities:
        if entity.get('type') == 'topic':
            topics.append(entity['label'])
    return topics

def _extract_action_items(transcript):
    """Extract action items from transcript"""
    model = genai.GenerativeModel("gemini-1.5-flash")
    
    response = model.generate_content(
        f"""Extract action items from this meeting transcript. Return as JSON array:

{transcript}

Format: [{{"task": "description", "assignee": "person", "due_date": "when", "priority": "high/medium/low"}}]"""
    )
    
    try:
        json_text = response.text.strip()
        if json_text.startswith('```json'):
            json_text = json_text[7:]
        if json_text.endswith('```'):
            json_text = json_text[:-3]
        return json.loads(json_text)
    except:
        return []

def translate_transcript(transcript, target_language):
    """Translate transcript to target language"""
    if should_chunk_transcript(transcript):
        # Translate in chunks for large transcripts
        chunks = chunk_transcript(transcript)
        translated_chunks = []
        
        for chunk in chunks:
            model = genai.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content(
                f"Translate this text to {target_language}, maintaining speaker identification and structure:\n\n{chunk}"
            )
            translated_chunks.append(response.text)
        
        return "\n\n".join(translated_chunks)
    else:
        # Translate as single document
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(
            f"Translate this meeting transcript to {target_language}, maintaining the structure and speaker identification:\n\n{transcript}"
        )
        return response.text

def generate_meeting_insights(transcript):
    """Generate additional insights about the meeting"""
    model = genai.GenerativeModel("gemini-1.5-flash")
    
    prompt = f"""Analyze this meeting transcript and provide insights:

{transcript}

Provide:
1. **Meeting Effectiveness Score** (1-10 with reasoning)
2. **Participation Analysis** (who spoke most, engagement levels)
3. **Sentiment Analysis** (overall tone, any conflicts/agreements)
4. **Follow-up Recommendations** (what should happen next)
5. **Key Metrics** (duration insights, decision velocity, etc.)

Format as structured text with clear sections."""
    
    response = model.generate_content(prompt)
    return response.text