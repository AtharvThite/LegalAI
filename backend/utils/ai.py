import os
from dotenv import load_dotenv
import google.generativeai as genai
from langchain.text_splitter import RecursiveCharacterTextSplitter

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=GEMINI_API_KEY)

def chunk_transcript(text, chunk_size=4096, overlap=512):
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=overlap,
        separators=["\n\n", "\n", " ", ""]
    )
    return splitter.split_text(text)

def generate_summary(transcript):
    chunks = chunk_transcript(transcript)
    summaries = []
    for chunk in chunks:
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(
            f"Summarize this meeting transcript chunk:\n{chunk}"
        )
        summaries.append(response.text)
    # Combine chunk summaries into a final summary
    final_model = genai.GenerativeModel("gemini-1.5-flash")
    final_summary = final_model.generate_content(
        "Combine these chunk summaries into a concise meeting summary:\n" + "\n".join(summaries)
    )
    return final_summary.text

def chatbot_answer(transcript, question):
    chunks = chunk_transcript(transcript)
    context = ""
    for chunk in chunks:
        context += chunk + "\n"
    model = genai.GenerativeModel("gemini-1.5-flash")
    prompt = f"""You are an AI meeting assistant. Here is the meeting transcript:\n{context}\n\nAnswer the following question based on the meeting:\n{question}"""
    response = model.generate_content(prompt)
    return response.text