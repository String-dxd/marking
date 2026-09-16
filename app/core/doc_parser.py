import base64
import re
from pathlib import Path
from typing import Dict, Any, Optional
import docx
import pymupdf
from app.core.config import DEFAULT_VISION_MODEL, DEFAULT_OCR_NUM_CTX
from app.core.ollama_client import ollama_client
from app.core.marker_engine import clean_and_parse_json
from app.core.fallback_tracker import record_fallback

def transcribe_image_with_vision(image_bytes: bytes, prompt: Optional[str] = None) -> str:
    """
    Calls the local multimodal vision model to transcribe rubric tables, criteria descriptions,
    levels/bands, and mark allocations from an image or scanned page into clean Markdown.
    """
    if not image_bytes:
        return ""
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    vision_prompt = prompt or """You are an expert curriculum assistant and examiner.
Transcribe and extract the complete marking scheme, grading rubric table, criteria descriptions, levels/bands, and mark allocations from this image into clean, readable Markdown format.
- Format all rubric grids as clean Markdown tables with headers (e.g. | 等级 | 1 (25-30分) | 2 (19-24分) | ... |).
- Include all band descriptions, score ranges (e.g. 25-30, 19-24, 13-18, 7-12, 1-6), and criteria text accurately.
- Accurately preserve all rows (e.g. 内容 30分, 语文与结构 30分) and columns.
- Do not omit any text, criteria, or mark details."""

    try:
        res = ollama_client.generate_chat(
            model=DEFAULT_VISION_MODEL,
            messages=[{"role": "user", "content": vision_prompt, "images": [b64]}],
            format_json=False,
            temperature=0.0,
            timeout=90,
            num_ctx=DEFAULT_OCR_NUM_CTX,
            reasoning_effort="low"
        )
        if res.get("success") and res.get("content"):
            cleaned = re.sub(r"<think>.*?</think>", "", res.get("content", ""), flags=re.DOTALL).strip()
            return cleaned
    except Exception as e:
        print(f"[DocParser] Vision OCR error: {e}")
    return ""

def extract_text_and_tables_from_docx(file_path: str) -> str:
    """
    Extracts all text and tables from a .docx file, formatting tables into readable markdown.
    """
    doc = docx.Document(file_path)
    content_blocks = []
    
    for element in doc.element.body:
        if element.tag.endswith('p'):
            p = docx.text.paragraph.Paragraph(element, doc)
            text = p.text.strip()
            if text:
                content_blocks.append(text)
        elif element.tag.endswith('tbl'):
            table = docx.table.Table(element, doc)
            table_rows = []
            for row in table.rows:
                row_cells = [cell.text.strip().replace("\n", " ") for cell in row.cells]
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
    Extracts text from DOCX, PDF, image (.png, .jpg, .jpeg, .webp), or plaintext files.
    Automatically applies multimodal Vision OCR for scanned/image-based PDFs or image files.
    """
    path = Path(file_path)
    suffix = path.suffix.lower()
    
    if suffix in (".docx", ".doc"):
        try:
            return extract_text_and_tables_from_docx(file_path)
        except Exception as e:
            return f"Error reading Word document: {str(e)}"

    elif suffix == ".pdf":
        try:
            doc = pymupdf.open(file_path)
            pages_text = []
            total_chars = 0
            
            # First pass: check if PDF contains embedded text
            for i, page in enumerate(doc):
                t = page.get_text("text").strip()
                if t:
                    pages_text.append(f"--- Page {i+1} ---\n" + t)
                    total_chars += len(t)
                    
            # If PDF has no embedded text (< 50 chars total), it's a scanned/screenshot PDF!
            # Automatically apply Vision OCR page-by-page.
            if total_chars < 50:
                print(f"[DocParser] PDF '{path.name}' has no embedded text ({total_chars} chars). Running Vision OCR...")
                pages_text = []
                max_pages = min(5, len(doc))
                for i in range(max_pages):
                    page = doc[i]
                    # Render high-res page image (150 DPI)
                    pix = page.get_pixmap(dpi=150)
                    img_bytes = pix.tobytes("jpeg")
                    transcription = transcribe_image_with_vision(img_bytes)
                    if transcription:
                        pages_text.append(f"--- Page {i+1} (Vision Rubric OCR) ---\n" + transcription)
                        
            doc.close()
            return "\n\n".join(pages_text) if pages_text else "No text or readable rubric could be extracted from PDF."
        except Exception as e:
            return f"Error reading PDF: {str(e)}"

    elif suffix in (".png", ".jpg", ".jpeg", ".webp", ".bmp"):
        try:
            print(f"[DocParser] Image rubric '{path.name}' detected. Running Vision OCR...")
            with open(file_path, "rb") as f:
                img_bytes = f.read()
            transcription = transcribe_image_with_vision(img_bytes)
            return transcription or "No text or readable rubric found in image."
        except Exception as e:
            return f"Error reading image: {str(e)}"

    else:
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                return f.read()
        except Exception as e:
            return f"Error reading file: {str(e)}"

def fallback_parse_rubric_items(text: str, is_chinese: bool, suggested_max_marks: float) -> List[Dict[str, Any]]:
    """
    Deterministic rule-based parser that converts text or markdown tables into structured rubric questions & criteria.
    """
    if not text or not text.strip():
        return []

    # 1. Check for Chinese essay rubric tables / structure
    if is_chinese or ("内容" in text and "语文" in text):
        items = []
        has_content = "内容" in text
        has_language = "语文" in text or "表达" in text or "结构" in text
        
        c_max = 30.0 if (has_content and has_language) else (suggested_max_marks / 2.0 if has_content else 30.0)
        l_max = 30.0 if (has_content and has_language) else (suggested_max_marks / 2.0 if has_language else 30.0)
        
        if has_content:
            items.append({
                "question_no": "1",
                "question_title": "内容 (Content)",
                "max_marks": c_max,
                "criteria": [
                    {"criterion": "切合题意，中心明确 (Topic Relevance & Theme)", "max": round(c_max * 0.35, 1), "description": "切题，立意明确，思想健康"},
                    {"criterion": "内容充实，条理清楚 (Content Depth & Organisation)", "max": round(c_max * 0.35, 1), "description": "详略得当，情节连贯有逻辑"},
                    {"criterion": "感情真挚，描写生动 (Authenticity & Vivid Description)", "max": round(c_max * 0.3, 1), "description": "细节真实，生动感人"}
                ]
            })
        if has_language:
            items.append({
                "question_no": "2" if has_content else "1",
                "question_title": "语文与结构 (Language & Structure)",
                "max_marks": l_max,
                "criteria": [
                    {"criterion": "文句通顺，用词贴切 (Fluency & Vocabulary)", "max": round(l_max * 0.4, 1), "description": "语句流畅，词汇丰富准确"},
                    {"criterion": "结构完整，段落分明 (Structure & Paragraphing)", "max": round(l_max * 0.3, 1), "description": "层次清晰，首尾呼应"},
                    {"criterion": "标点符号准确，字体端正 (Punctuation & Penmanship)", "max": round(l_max * 0.3, 1), "description": "错别字少，标点规范"}
                ]
            })
        if items:
            return items

    # 2. Check for question patterns (e.g. Q1, Question 1, 1(a), Part A)
    q_pattern = re.compile(
        r"(?:^|\n)(?:(?:Question|Q|Part)\s*)?([0-9]+[a-z]?(?:\([a-z0-9ivx]+\))*|\([a-z0-9ivx]+\)|[0-9]+)\s*(?:[:.\-–]\s*|\s+)?(?:\(?([0-9.]+)\s*marks?\)|\(?([0-9.]+)\s*m\)|:\s*([0-9.]+)\s*marks?|\[([0-9.]+)\s*m\])?\s*(?:\[([^\]]+)\])?([^\n]*)",
        re.IGNORECASE
    )
    
    lines = text.split("\n")
    current_q = None
    questions = []
    
    for line in lines:
        line_s = line.strip()
        if not line_s:
            continue
            
        m = q_pattern.match(line_s)
        is_q_header = False
        if m:
            has_explicit_marks = bool(m.group(2) or m.group(3) or m.group(4) or m.group(5))
            if has_explicit_marks or line_s.lower().startswith(("question", "q", "part")) or re.match(r"^[0-9]+[.)]\s+", line_s):
                is_q_header = True
                
        if is_q_header and m:
            if current_q:
                questions.append(current_q)
            q_num = m.group(1).strip()
            marks_val = float(m.group(2) or m.group(3) or m.group(4) or m.group(5) or 1.0)
            tag = m.group(6).strip() if m.group(6) else ""
            desc = m.group(7).strip() if m.group(7) else ""
            title = f"Question {q_num}"
            if tag:
                title += f" ({tag})"
            elif desc:
                clean_desc = desc.split(".")[0].strip()
                if len(clean_desc) > 40:
                    clean_desc = clean_desc[:37] + "..."
                if clean_desc:
                    title += f": {clean_desc}"
                    
            current_q = {
                "question_no": q_num,
                "question_title": title,
                "max_marks": marks_val,
                "criteria": []
            }
        elif current_q:
            sub_m = re.search(r"(?:\[([0-9.]+)\s*m\]|\(?([0-9.]+)\s*marks?\))\s*[:\-–]?\s*(.*)", line_s, re.IGNORECASE)
            bullet_m = re.match(r"^[-*•]\s*(.*)", line_s)
            if sub_m:
                crit_marks = float(sub_m.group(1) or sub_m.group(2) or 1.0)
                crit_desc = sub_m.group(3).strip()
                current_q["criteria"].append({
                    "criterion": crit_desc[:60] if crit_desc else f"Criterion {len(current_q['criteria'])+1}",
                    "max": crit_marks,
                    "description": crit_desc
                })
            elif bullet_m and len(current_q["criteria"]) < 5:
                crit_text = bullet_m.group(1).strip()
                if crit_text and not crit_text.startswith("==="):
                    current_q["criteria"].append({
                        "criterion": crit_text[:60],
                        "max": 1.0,
                        "description": crit_text
                    })
                    
    if current_q:
        questions.append(current_q)
        
    for q in questions:
        if not q["criteria"]:
            q["criteria"] = [{
                "criterion": f"Answer and working for {q['question_no']}",
                "max": q["max_marks"],
                "description": "Expected answer matching marking scheme"
            }]
        else:
            crit_sum = sum(float(c.get("max", 0)) for c in q["criteria"])
            if crit_sum > 0 and q["max_marks"] <= 1.0 and crit_sum > 1.0:
                q["max_marks"] = crit_sum

    if questions:
        return questions

    return [{
        "question_no": "1",
        "question_title": "Assessment Criteria & Answer Key",
        "max_marks": suggested_max_marks,
        "criteria": [{
            "criterion": "Accuracy and completeness matching rubric",
            "max": suggested_max_marks,
            "description": "Answers must satisfy official marking scheme requirements"
        }]
    }]

def parse_rubric_structure(
    raw_text: str,
    model: str = DEFAULT_VISION_MODEL,
    subject: Optional[str] = None,
    title: Optional[str] = None
) -> Dict[str, Any]:
    """
    Uses local LLM with robust heuristic fallback to isolate and parse marking schemes
    into structured questions and review-style criteria.
    """
    if not raw_text or len(raw_text.strip()) < 5:
        return {
            "clean_marking_scheme": raw_text or "",
            "rubric_json": [],
            "suggested_title": title or "",
            "suggested_subject": subject or "",
            "suggested_max_marks": 100.0,
            "suggested_marker_type": "auto"
        }

    # Heuristic analysis
    chinese_keywords = ["评分标准", "等级", "分数", "内容", "语文", "表达", "结构", "切合题意", "语句通顺", "词语", "标点", "段落", "修辞", "详略"]
    english_keywords = ["marking scheme", "rubric", "answer key", "question 1", "q1", "marks allocation", "band", "level", "criteria"]
    
    is_chinese = any(k in raw_text for k in chinese_keywords)
    is_table = "|" in raw_text or "---" in raw_text or "等级" in raw_text
    
    suggested_max_marks = 100.0
    suggested_subject = subject or ""
    suggested_title = title or ""
    
    if is_chinese:
        if not suggested_subject:
            suggested_subject = "Chinese (华文)"
        if not suggested_title:
            suggested_title = "华文作文评分标准"
        if "30" in raw_text and ("内容" in raw_text or "语文" in raw_text):
            suggested_max_marks = 60.0
        elif "25-30" in raw_text:
            suggested_max_marks = 60.0 if "语文" in raw_text or "结构" in raw_text else 30.0
    else:
        lower_raw = raw_text.lower()
        if not suggested_subject:
            if any(w in lower_raw for w in ["physics", "velocity", "acceleration", "force"]):
                suggested_subject = "Physics"
            elif any(w in lower_raw for w in ["math", "calculus", "algebra", "derivative"]):
                suggested_subject = "Mathematics"
            elif any(w in lower_raw for w in ["english", "literature", "essay", "comprehension"]):
                suggested_subject = "English"
            elif any(w in lower_raw for w in ["history", "treaty", "source"]):
                suggested_subject = "History"
            elif any(w in lower_raw for w in ["biology", "cell", "photosynthesis", "osmosis"]):
                suggested_subject = "Biology"
            elif any(w in lower_raw for w in ["chemistry", "acid", "reaction", "mole"]):
                suggested_subject = "Chemistry"
            elif any(w in lower_raw for w in ["science"]):
                suggested_subject = "Lower Secondary Science"
                
        if not suggested_title:
            if suggested_subject:
                suggested_title = f"{suggested_subject} Marking Scheme"
            else:
                suggested_title = "Assessment Marking Scheme"
            
        m_marks = re.search(r"(?:total|max|maximum)\s*(?:marks?|score)?\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)", raw_text, re.IGNORECASE)
        if m_marks:
            try:
                suggested_max_marks = float(m_marks.group(1))
            except Exception:
                pass

    if is_table or is_chinese:
        filtered_text = raw_text.strip()
    else:
        lines = raw_text.split("\n")
        relevant_lines = []
        in_scheme = False
        for line in lines:
            l_lower = line.lower()
            if any(keyword in l_lower for keyword in english_keywords + ["q1", "q2", "question"]):
                in_scheme = True
            if in_scheme or re.search(r"(?:q\d+|question\s*\d+|part\s*[a-z]|\(\d+\s*marks?\)|\[\d+\s*m\])", line, re.IGNORECASE):
                relevant_lines.append(line)
        filtered_text = "\n".join(relevant_lines).strip() if relevant_lines else raw_text

    from app.markers.registry import get_marker
    m = get_marker("auto", subject=suggested_subject, title=suggested_title)
    
    fallback_items = fallback_parse_rubric_items(filtered_text, is_chinese=is_chinese, suggested_max_marks=suggested_max_marks)
    if fallback_items:
        computed_fallback_marks = sum(float(item.get("max_marks", 0.0)) for item in fallback_items)
        if computed_fallback_marks > 0 and (suggested_max_marks == 100.0 or suggested_max_marks < computed_fallback_marks):
            suggested_max_marks = computed_fallback_marks

    # LLM extraction attempt
    prompt = f"""You are an expert curriculum assistant and examiner.
Analyze the following marking scheme, exam rubric, or grading criteria document.

TASK:
1. Extract all questions, assessment dimensions, or parts into a structured rubric breakdown.
2. For each question or dimension:
   - "question_no": e.g. "1", "2(a)", "3", "内容", "语文与结构"
   - "question_title": topic or title (e.g. "Kinetic Energy Calculation", "内容 (Content)")
   - "max_marks": numeric maximum marks for this question (float)
   - "criteria": array of specific marking criteria points:
     - "criterion": concise title of criterion requirement (e.g. "State formula F = ma")
     - "max": numeric marks for this criterion (float)
     - "description": guidance notes or expected answer
3. Suggest inferred subject name, assignment title, total max marks, and return a clean Markdown version in "clean_marking_scheme".
4. Output STRICTLY valid JSON with no extraneous prose.

DOCUMENT CONTENT:
----------------------------------------
{raw_text[:12000]}
----------------------------------------

JSON FORMAT:
{{
  "suggested_title": "{suggested_title}",
  "suggested_subject": "{suggested_subject}",
  "suggested_max_marks": {suggested_max_marks},
  "clean_marking_scheme": "{filtered_text[:200].replace(chr(10), ' ')}...",
  "rubric_items": [
    {{
      "question_no": "1",
      "question_title": "Question 1",
      "max_marks": 2.0,
      "criteria": [
        {{
          "criterion": "Formula stated correctly",
          "max": 1.0,
          "description": "F = ma"
        }}
      ]
    }}
  ]
}}
"""

    try:
        res = ollama_client.generate_chat(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            format_json=True,
            temperature=0.1,
            timeout=60,
            num_ctx=DEFAULT_OCR_NUM_CTX,
            reasoning_effort="low"
        )
        if res.get("success"):
            parsed = clean_and_parse_json(res.get("content", ""))
            if parsed and isinstance(parsed, dict):
                clean_scheme = parsed.get("clean_marking_scheme") or filtered_text
                s_subj = (parsed.get("suggested_subject") or suggested_subject).strip()
                s_title = (parsed.get("suggested_title") or suggested_title).strip()
                s_max = float(parsed.get("suggested_max_marks") or suggested_max_marks)
                m_eff = get_marker("auto", subject=s_subj, title=s_title)
                
                raw_items = parsed.get("rubric_items")
                cleaned_items = []
                if isinstance(raw_items, list) and len(raw_items) > 0:
                    for idx, itm in enumerate(raw_items):
                        if not isinstance(itm, dict):
                            continue
                        q_no = str(itm.get("question_no") or (idx + 1)).strip()
                        q_title = str(itm.get("question_title") or f"Question {q_no}").strip()
                        q_max = float(itm.get("max_marks") or 1.0)
                        raw_crits = itm.get("criteria", [])
                        cleaned_crits = []
                        if isinstance(raw_crits, list) and len(raw_crits) > 0:
                            for c_idx, c in enumerate(raw_crits):
                                if isinstance(c, dict):
                                    cleaned_crits.append({
                                        "criterion": str(c.get("criterion") or f"Criterion {c_idx+1}").strip(),
                                        "max": float(c.get("max") or 1.0),
                                        "description": str(c.get("description") or "").strip()
                                    })
                        if not cleaned_crits:
                            cleaned_crits.append({
                                "criterion": f"Criteria for {q_title}",
                                "max": q_max,
                                "description": ""
                            })
                        cleaned_items.append({
                            "question_no": q_no,
                            "question_title": q_title,
                            "max_marks": q_max,
                            "criteria": cleaned_crits
                        })
                        
                if cleaned_items and fallback_items:
                    fallback_page_map = {
                        re.sub(r"[\(\)\s]", "", str(fb.get("question_no", ""))).lower(): fb.get("page_number")
                        for fb in fallback_items if fb.get("page_number") is not None
                    }
                    for item in cleaned_items:
                        clean_q = re.sub(r"[\(\)\s]", "", str(item.get("question_no", ""))).lower()
                        if clean_q in fallback_page_map:
                            item["page_number"] = fallback_page_map[clean_q]
                        elif item.get("page_number") is None and len(cleaned_items) == len(fallback_items):
                            idx = cleaned_items.index(item)
                            item["page_number"] = fallback_items[idx].get("page_number")

                if not cleaned_items and fallback_items:
                    record_fallback(
                        source="Rubric Parser",
                        trigger="LLM response did not contain structured rubric questions",
                        action="Applied rule-based rubric items parser fallback",
                        details=f"Extracted {len(fallback_items)} questions via regex structure"
                    )

                final_items = cleaned_items if cleaned_items else fallback_items
                calc_total = sum(float(it.get("max_marks", 0)) for it in final_items)
                if calc_total > 0 and (s_max == 100.0 or s_max < calc_total):
                    s_max = calc_total

                return {
                    "clean_marking_scheme": clean_scheme.strip(),
                    "rubric_json": final_items,
                    "suggested_title": s_title,
                    "suggested_subject": s_subj,
                    "suggested_max_marks": s_max,
                    "suggested_marker_type": m_eff.marker_id
                }
    except Exception as e:
        print(f"[DocParser] LLM extraction error: {e}")

    record_fallback(
        source="Rubric Parser",
        trigger="LLM rubric parsing failed or timed out",
        action="Applied rule-based rubric items parser fallback",
        details=f"Extracted {len(fallback_items)} questions via regex structure"
    )

    return {
        "clean_marking_scheme": filtered_text,
        "rubric_json": fallback_items,
        "suggested_title": suggested_title,
        "suggested_subject": suggested_subject,
        "suggested_max_marks": suggested_max_marks,
        "suggested_marker_type": m.marker_id
    }

def extract_relevant_marking_scheme(
    raw_text: str,
    model: str = DEFAULT_VISION_MODEL
) -> Dict[str, Any]:
    """
    Backwards-compatible wrapper that delegates to parse_rubric_structure.
    """
    return parse_rubric_structure(raw_text=raw_text, model=model)
