import re
from pathlib import Path
from typing import Dict, Any, Optional
import docx
import pymupdf
from app.core.ollama_client import ollama_client
from app.core.marker_engine import clean_and_parse_json

def extract_text_and_tables_from_docx(file_path: str) -> str:
    """
    Extracts all text and tables from a .docx file, formatting tables into readable markdown.
    """
    doc = docx.Document(file_path)
    content_blocks = []
    
    for element in doc.element.body:
        # Check if paragraph
        if element.tag.endswith('p'):
            p = docx.text.paragraph.Paragraph(element, doc)
            text = p.text.strip()
            if text:
                content_blocks.append(text)
        # Check if table
        elif element.tag.endswith('tbl'):
            table = docx.table.Table(element, doc)
            table_rows = []
            for row in table.rows:
                row_cells = [cell.text.strip().replace("\n", " ") for cell in row.cells]
                # Filter out adjacent duplicated merged cells
                cleaned_cells = []
                for c in row_cells:
                    if not cleaned_cells or c != cleaned_cells[-1]:
                        cleaned_cells.append(c)
                if any(cleaned_cells):
                    table_rows.append(" | ".join(cleaned_cells))
            if table_rows:
                content_blocks.append("\n[Table / Rubric Grid]\n" + "\n".join(table_rows) + "\n")
                
    return "\n\n".join(content_blocks)

def extract_text_from_file(file_path: str) -> str:
    """
    Extracts text from DOCX, PDF, or plaintext files.
    """
    path = Path(file_path)
    suffix = path.suffix.lower()
    
    if suffix in (".docx", ".doc"):
        try:
            return extract_text_and_tables_from_docx(file_path)
        except Exception as e:
            # Fallback if docx fails
            return f"Error reading Word document: {str(e)}"
    elif suffix == ".pdf":
        try:
            doc = pymupdf.open(file_path)
            pages_text = []
            for i, page in enumerate(doc):
                t = page.get_text("text").strip()
                if t:
                    pages_text.append(f"--- Page {i+1} ---\n" + t)
            doc.close()
            return "\n\n".join(pages_text)
        except Exception as e:
            return f"Error reading PDF: {str(e)}"
    else:
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()
        except Exception as e:
            return f"Error reading file: {str(e)}"

from app.core.config import DEFAULT_VISION_MODEL

def extract_relevant_marking_scheme(
    raw_text: str,
    model: str = DEFAULT_VISION_MODEL
) -> Dict[str, Any]:
    """
    Uses local LLM to isolate and structure ONLY the relevant marking scheme / rubric
    from raw document content, discarding instructions, notices, administrative headers, etc.
    """
    if not raw_text or len(raw_text.strip()) < 10:
        return {
            "clean_marking_scheme": raw_text,
            "suggested_title": "",
            "suggested_subject": "",
            "suggested_max_marks": 100.0
        }
        
    prompt = f"""You are an expert curriculum assistant. Below is the raw text extracted from an exam, test, or marking rubric document.

TASK:
1. Extract ONLY the relevant MARKING SCHEME, question rubrics, answers, criteria points, and marks allocation.
2. Discard all irrelevant administrative text (e.g., student examination instructions, exam rules, time allowed notices, candidate declaration, cover boilerplate, school logo text, etc.).
3. Suggest the inferred subject name, assignment/test title, and total maximum marks.
4. Return your output STRICTLY in JSON format without extra prose.

RAW DOCUMENT CONTENT:
----------------------------------------
{raw_text[:12000]}
----------------------------------------

JSON FORMAT:
{{
  "suggested_title": "Unit 3 Kinematics Test",
  "suggested_subject": "Physics",
  "suggested_max_marks": 50,
  "clean_marking_scheme": "Question 1 (10 marks)...\\n- Formula: 2 marks\\n- Method: 4 marks\\n- Answer: 4 marks\\n\\nQuestion 2 (15 marks)..."
}}
"""

    try:
        res = ollama_client.generate_chat(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            format_json=True,
            temperature=0.1,
            timeout=25,
            num_ctx=8192,
            reasoning_effort="low"
        )
        
        if res.get("success"):
            parsed = clean_and_parse_json(res.get("content", ""))
            if parsed and isinstance(parsed, dict) and parsed.get("clean_marking_scheme"):
                return {
                    "clean_marking_scheme": parsed.get("clean_marking_scheme", "").strip(),
                    "suggested_title": parsed.get("suggested_title", "").strip(),
                    "suggested_subject": parsed.get("suggested_subject", "").strip(),
                    "suggested_max_marks": float(parsed.get("suggested_max_marks") or 100.0)
                }
    except Exception:
        pass
        
    # Heuristic fallback if LLM is offline or model response format varies
    # Try finding lines with questions / marks
    lines = raw_text.split("\n")
    relevant_lines = []
    in_scheme = False
    
    for line in lines:
        l_lower = line.lower()
        if any(keyword in l_lower for keyword in ["marking scheme", "rubric", "answer key", "question 1", "q1", "marks allocation"]):
            in_scheme = True
        if in_scheme or re.search(r"(?:q\d+|question\s*\d+|part\s*[a-z]|\(\d+\s*marks?\)|\[\d+\s*m\])", line, re.IGNORECASE):
            relevant_lines.append(line)
            
    filtered_text = "\n".join(relevant_lines).strip() if relevant_lines else raw_text
    
    return {
        "clean_marking_scheme": filtered_text,
        "suggested_title": "",
        "suggested_subject": "",
        "suggested_max_marks": 100.0
    }
