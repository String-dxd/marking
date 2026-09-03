import json
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
from app.core.ollama_client import ollama_client
from app.core.pdf_processor import get_page_base64
from app.core.config import DEFAULT_VISION_MODEL, DEFAULT_TEXT_MODEL, DEFAULT_OCR_NUM_CTX, DEFAULT_GRADING_NUM_CTX

def clean_and_parse_json(raw_text: str) -> Optional[Any]:
    """Robustly extracts and parses JSON (dict or list) from model responses."""
    if not raw_text or not isinstance(raw_text, str):
        return None
    
    cleaned = raw_text.strip()
    # 1. Strip <think>...</think> reasoning blocks from reasoning models
    cleaned = re.sub(r"<think>.*?</think>", "", cleaned, flags=re.DOTALL).strip()
    
    # 2. Direct json load attempt
    try:
        res = json.loads(cleaned)
        if isinstance(res, list):
            return {"questions": res}
        return res
    except Exception:
        pass
    
    # 3. Extract from markdown code fences ```json ... ``` or ``` ... ```
    fence_matches = re.findall(r"```(?:json)?\s*(.*?)\s*```", cleaned, re.DOTALL)
    for block in fence_matches:
        block_s = block.strip()
        try:
            res = json.loads(block_s)
            if isinstance(res, list):
                return {"questions": res}
            return res
        except Exception:
            b_clean = re.sub(r",\s*([\]}])", r"\1", block_s)
            try:
                res = json.loads(b_clean)
                if isinstance(res, list):
                    return {"questions": res}
                return res
            except Exception:
                pass
            
    # 4. Try finding outer curly braces { ... }
    first_brace = cleaned.find("{")
    last_brace = cleaned.rfind("}")
    if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
        candidate = cleaned[first_brace:last_brace+1]
        try:
            return json.loads(candidate)
        except Exception:
            candidate_cleaned = re.sub(r",\s*([\]}])", r"\1", candidate)
            try:
                return json.loads(candidate_cleaned)
            except Exception:
                pass

    # 5. Try finding outer square brackets [ ... ] (when model returns top-level list)
    first_bracket = cleaned.find("[")
    last_bracket = cleaned.rfind("]")
    if first_bracket != -1 and last_bracket != -1 and last_bracket > first_bracket:
        candidate = cleaned[first_bracket:last_bracket+1]
        try:
            res = json.loads(candidate)
            if isinstance(res, list):
                return {"questions": res}
            return res
        except Exception:
            candidate_cleaned = re.sub(r",\s*([\]}])", r"\1", candidate)
            try:
                res = json.loads(candidate_cleaned)
                if isinstance(res, list):
                    return {"questions": res}
                return res
            except Exception:
                pass
                
    # 6. Repair unclosed trailing JSON and strings
    if first_brace != -1:
        candidate = cleaned[first_brace:]
        quote_count = candidate.count('"') - candidate.count(r'\"')
        prefix_fix = '"' if (quote_count % 2 != 0) else ''
        for suffix in [prefix_fix + '"}]}', prefix_fix + '}]}', prefix_fix + ']}', prefix_fix + '}', '"}', '"}]}', '}]}', ']}', '}']:
            try:
                res = json.loads(candidate + suffix)
                if isinstance(res, list):
                    return {"questions": res}
                return res
            except Exception:
                pass

    return None

def parse_marked_questions_fallback(raw_content: str, original_questions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Fallback parser when standard JSON parsing fails on model output.
    Extracts question grades, awarded marks, criteria, and feedback comments using regex.
    """
    if not raw_content or not original_questions:
        return [dict(q) for q in (original_questions or [])]

    # 1. Try finding individual JSON object blocks { ... "question_no" ... }
    extracted_items = []
    obj_matches = re.finditer(r"\{[^{}]*\"question_no\"\s*:\s*\"([^\"]+)\"[^{}]*\}", raw_content, re.DOTALL)
    for m in obj_matches:
        try:
            item = json.loads(m.group(0))
            extracted_items.append(item)
        except Exception:
            pass

    if extracted_items:
        item_map = {str(item.get("question_no", "")).strip().lower(): item for item in extracted_items}
        res = []
        for orig in original_questions:
            q_num = str(orig.get("question_no", "")).strip().lower()
            if q_num in item_map:
                matched = item_map[q_num]
                res.append({
                    "question_no": orig.get("question_no"),
                    "question_title": matched.get("question_title") or orig.get("question_title", f"Question {orig.get('question_no')}"),
                    "max_marks": float(matched.get("max_marks", orig.get("max_marks", 1.0))),
                    "awarded_marks": float(matched.get("awarded_marks", 0.0)),
                    "extracted_answer": matched.get("extracted_answer") or orig.get("extracted_answer", ""),
                    "criteria": matched.get("criteria", []),
                    "feedback_comment": matched.get("feedback_comment", "Evaluated by AI.")
                })
            else:
                res.append(dict(orig))
        return res

    # 2. Heuristic section matching
    res = []
    for orig in original_questions:
        q_num = str(orig.get("question_no", "")).strip()
        q_pattern = re.compile(
            rf"(?:Question|Q|Part)?\s*{re.escape(q_num)}[\s\:\.\-]+.*?(?=(?:(?:Question|Q|Part)\s*[0-9]+)|$)",
            re.IGNORECASE | re.DOTALL
        )
        sec_match = q_pattern.search(raw_content)
        awarded = 0.0
        feedback = "Evaluated by AI."
        q_max = float(orig.get("max_marks", 1.0))

        if sec_match:
            sec_text = sec_match.group(0)
            marks_match = (
                re.search(r"(?:awarded_marks|awarded|score|scored|marks|mark)\s*[\:\=]?\s*([0-9]+(?:\.[0-9]+)?)", sec_text, re.IGNORECASE) or
                re.search(r"([0-9]+(?:\.[0-9]+)?)\s*(?:\/|\s*out of)\s*[0-9]+", sec_text, re.IGNORECASE) or
                re.search(r"([0-9]+(?:\.[0-9]+)?)\s*(?:marks?|pts?|points?)", sec_text, re.IGNORECASE)
            )
            if marks_match:
                try:
                    awarded = min(float(marks_match.group(1)), q_max)
                except Exception:
                    pass
            fb_match = re.search(r"(?:feedback_comment|feedback|comment|notes)\s*[\:\=]?\s*\"?([^\n\"]+)", sec_text, re.IGNORECASE)
            if fb_match:
                feedback = fb_match.group(1).strip()

        res.append({
            "question_no": orig.get("question_no"),
            "question_title": orig.get("question_title", f"Question {q_num}"),
            "max_marks": q_max,
            "awarded_marks": awarded,
            "extracted_answer": orig.get("extracted_answer", ""),
            "criteria": orig.get("criteria", []),
            "feedback_comment": feedback
        })

    return res

def compute_grade_letter(percentage: float) -> str:
    if percentage >= 90:
        return "A*"
    elif percentage >= 80:
        return "A"
    elif percentage >= 70:
        return "B"
    elif percentage >= 60:
        return "C"
    elif percentage >= 50:
        return "D"
    elif percentage >= 40:
        return "E"
    else:
        return "U"

GRAPH_EVALUATION_GUIDANCE = """
TABULAR DATA & GRAPH EVALUATION PROTOCOLS:

1. TABULAR DATA EVALUATION PROTOCOL:
   - Structured Parse Format:
     [Table: Header=["<Col 1>", "<Col 2>", ...], Rows=[["<Row1Val1>", "<Row1Val2>", ...], ["<Row2Val1>", ...]]]
   - Marking Scheme Matching Rules:
     * Evaluate row-by-row and cell-by-cell against the expected answer table.
     * Allow reasonable scientific rounding / standard significant figures unless exact decimal places are specified.
     * If a cell value is missing, incorrect, or mismatched, state the exact location:
       "✗ Error: Row <N> (<Column Name>) written as '<StudentVal>'. Expected: '<ExpectedVal>'."

2. GRAPH & PLOT EVALUATION PROTOCOL:
   - Structured Parse Format:
     [Graph: X-axis="<Label & Unit>" (Scale: <Range>), Y-axis="<Label & Unit>" (Scale: <Range>), Plotted Points: [(x1, y1), (x2, y2), ...] (Total N points), Line: "<Detailed description: CAREFULLY TRACE the line between each point. If the slope changes (dot-to-dot), state 'straight line segments connecting subsequent points'. Otherwise state if it's a best fit line, ONE straight line through all points, or a smooth curve. Explicitly note if drawn with a ruler, if smooth, if branched/hairy (sketched), and if it passes through origin (0,0)>", Gradient: "<Triangle coordinates & slope calculation>"]
   - Marking Scheme Alignment (Standard 4 Criteria):
     1. Axes & Scale: Correct quantity labels, units, and uniform linear scale covering >=50% of grid.
     2. Plotting Accuracy: Point-by-point coordinate comparison with ±0.5 small square allowable tolerance.
     3. Line/Curve Quality: Must explicitly evaluate if it matches the required type (e.g., best fit line, ONE straight line through all points, straight line segments connecting subsequent points, or a smooth curve). Note if straight lines were drawn with a ruler, if curves are smooth, if lines are branched/"hairy" (sketched), and if the line passes through origin (0,0).
     4. Gradient / Intercept Calculation: Correct coordinate substitution from drawn line, large triangle (>50%), correct units.
   - If a graph error occurs, state the exact component:
     "✗ Error: Plotted point at x=<X> is (<X>, <Y_Student>) instead of (<X>, <Y_Expected>). Expected: (<X>, <Y_Expected>)."
     "✗ Error: Non-linear axis scale between <A> and <B>. Expected: Uniform linear interval."
"""

HANDWRITING_PARSING_RULES = """
CRITICAL EXTRACTION & SPATIAL BOUNDING RULES:
1. DISREGARD PRE-PRINTED TEXT: The document contains typeset printed exam questions, descriptions, and blank lines. Transcribe ONLY handwritten entries.
2. TABULAR DATA EXTRACTION:
   - For student-completed tables, extract filled-in cells row-by-row into:
     [Table: Header=["<Col 1>", "<Col 2>", ...], Rows=[["<Val 1>", "<Val 2>", ...], ...]]
   - Preserve headers, units, and all filled row entries.
3. GRAPH WORK EXTRACTION:
   - Read actual handwritten axis numbers directly from the grid (DO NOT copy printed prompt tables).
   - Transcribe:
     [Graph: X-axis="<Label & Unit>" (Scale: <Range>), Y-axis="<Label & Unit>" (Scale: <Range>), Plotted Points: [(x1, y1), (x2, y2), ...] (Total N points), Line: "<Detailed description: CAREFULLY TRACE the line between each point. If the slope changes (dot-to-dot), state 'straight line segments connecting subsequent points'. Otherwise state if it's a best fit line, ONE straight line through all points, or a smooth curve. Explicitly note if drawn with a ruler, if smooth, if branched/hairy (sketched), and if it passes through origin (0,0)>", Gradient: "<Triangle coordinates & calculation>"]
4. FILL-IN-THE-BLANKS & MEASUREMENTS:
   - Transcribe the exact handwritten value and unit written in answer spaces.
5. DIAGRAMS & CALLOUT TRACEBACK:
   - Transcribe student labels, drawn arrows, ray paths, and circuit connections on figures.
6. BLANK RESPONSES:
   - If no student writing exists for a question, output "[Blank / No response]".
"""

def parse_questions_from_ocr_text(content: str, page_num: int = 1) -> List[Dict[str, Any]]:
    """Robustly parses question items from JSON, markdown lines, bullet points, or unstructured text."""
    if not content or not content.strip():
        return []
        
    def _clean_ans(ans_str: str) -> str:
        s = str(ans_str).strip()
        low = s.lower().replace("[", "").replace("]", "").strip()
        if low in ("student handwritten answer", "student handwritten answer / diagram markings", "student handwriting", "transcribe exact handwritten answer here", "student answer"):
            return "[Blank / No response]"
        return s

    def _clean_q_num(s: str) -> str:
        s = s.strip("*#:.- \t")
        if s.count("(") > s.count(")"):
            s = s + ")"
        return s
        
    # 1. Try JSON parsing
    parsed = clean_and_parse_json(content)
    if parsed and isinstance(parsed, dict) and "questions" in parsed and isinstance(parsed["questions"], list):
        res = []
        for q in parsed["questions"]:
            q["extracted_answer"] = _clean_ans(str(q.get("extracted_answer", "")))
            res.append(q)
        if res:
            return res
        
    # 2. Universal line matching (supports markdown bolding, bullets, hashes, etc.)
    # Matches: **Question 2(a)**:, - Question 1(b):, 3a. 15 s, ### Q4:, (a) Blue, etc.
    q_header_pattern = re.compile(
        r"^(?:[\*\#\-\•\>\s]*)(?:(?:Question|Q|Part)\s*)?([0-9]+[a-z]?(?:\([a-z0-9ivx]+\))*|\([a-z0-9ivx]+\)|[0-9]+)\s*(?:[\*\:\：\.\-\)]+)\s*(.*)",
        re.IGNORECASE
    )
    
    questions = []
    lines = content.strip().split("\n")
    cur_q = None
    
    for raw_line in lines:
        line_s = raw_line.strip()
        if not line_s or line_s.startswith("---") or line_s.startswith("==="):
            continue
            
        m = q_header_pattern.match(line_s)
        if m:
            if cur_q:
                cur_q["extracted_answer"] = _clean_ans(cur_q["extracted_answer"])
                questions.append(cur_q)
            raw_q_num = m.group(1)
            ans = m.group(2).strip()
            # Remove any trailing bold asterisks from answer text
            ans = re.sub(r"^\*+\s*", "", ans).strip()
            q_num = _clean_q_num(raw_q_num)
            cur_q = {
                "question_no": q_num,
                "question_title": f"Question {q_num}",
                "extracted_answer": ans
            }
        elif cur_q:
            cur_q["extracted_answer"] += " " + line_s
            
    if cur_q:
        cur_q["extracted_answer"] = _clean_ans(cur_q["extracted_answer"])
        questions.append(cur_q)
        
    # 3. Fallback: If page has content but no question pattern matched (e.g. standalone graph, table, or calculation)
    if not questions and content.strip():
        questions.append({
            "question_no": f"Page {page_num}",
            "question_title": f"Page {page_num} Workings & Responses",
            "extracted_answer": _clean_ans(content.strip())
        })
        
    return questions

def parse_marking_scheme_structure(text: str) -> List[Dict[str, Any]]:
    """
    Parses full question structure, sub-parts, titles, and exact max marks from marking scheme text.
    """
    if not text or not isinstance(text, str):
        return []
        
    questions = []
    pattern = re.compile(
        r"(?:(?:Question|Q|Part)\s*)?([0-9]+[a-z]?(?:\([a-z0-9ivx]+\))*|\([a-z0-9ivx]+\)|[0-9]+)\s*(?:\(([0-9.]+)\s*marks?\)|:\s*([0-9.]+)\s*marks?)\s*(?:\[([^\]]+)\])?",
        re.IGNORECASE
    )
    
    lines = text.split("\n")
    for line in lines:
        line_s = line.strip()
        if not line_s or line_s.startswith("===") or line_s.startswith("---") or line_s.lower().startswith("topic"):
            continue
            
        m = pattern.search(line_s)
        if m:
            q_num = m.group(1).strip()
            max_m = float(m.group(2) or m.group(3))
            focus = m.group(4).strip() if m.group(4) else ""
            title = f"Question {q_num}" + (f" ({focus})" if focus else "")
            
            if not any(q['question_no'].lower() == q_num.lower() for q in questions):
                questions.append({
                    "question_no": q_num,
                    "question_title": title,
                    "max_marks": max_m
                })
                
    return questions

def align_extracted_questions_with_scheme(
    extracted_qs: List[Dict[str, Any]],
    marking_scheme_text: str,
    default_max_marks: float = 1.0
) -> List[Dict[str, Any]]:
    """
    Aligns raw extracted questions with the official marking scheme questions catalog.
    Enforces exact max marks from the marking scheme and resolves sub-part numbering (e.g. (a) -> 1(a) or 5(a)).
    """
    catalog = parse_marking_scheme_structure(marking_scheme_text)
    if not catalog:
        for q in extracted_qs:
            if "max_marks" not in q or q["max_marks"] == 5.0:
                q["max_marks"] = default_max_marks
        return extracted_qs
        
    scheme_dict = {q['question_no'].lower(): q for q in catalog}
    aligned = []
    
    for idx, raw_q in enumerate(extracted_qs):
        q_no = str(raw_q.get("question_no", "")).strip()
        raw_clean = q_no.lower()
        matched = None
        
        # 1. Exact match in catalog
        if raw_clean in scheme_dict:
            matched = scheme_dict[raw_clean]
        else:
            # 2. Strip prefix variations
            stripped = re.sub(r"^(?:question|q|part)\s*", "", raw_clean).strip()
            if stripped in scheme_dict:
                matched = scheme_dict[stripped]
            elif stripped.startswith("(") and stripped.endswith(")"):
                # Sub-part like (a), (b), (c) -> pick candidate closest to current position ratio
                candidates = [c for c in catalog if c['question_no'].lower().endswith(stripped)]
                if len(candidates) == 1:
                    matched = candidates[0]
                elif len(candidates) > 1:
                    pos_ratio = idx / max(1, len(extracted_qs))
                    cand_idx = int(pos_ratio * len(catalog))
                    cand_idx = max(0, min(len(catalog) - 1, cand_idx))
                    best_cand = min(candidates, key=lambda c: abs(catalog.index(c) - cand_idx))
                    matched = best_cand
            else:
                # 3. Fuzzy search in catalog
                for cand in catalog:
                    if cand['question_no'].lower() == stripped or stripped in cand['question_no'].lower():
                        matched = cand
                        break

        if matched:
            final_q_no = matched["question_no"]
            final_title = matched["question_title"]
            final_max = float(matched["max_marks"])
        else:
            final_q_no = q_no or f"Q{idx+1}"
            final_title = raw_q.get("question_title", f"Question {final_q_no}")
            final_max = float(raw_q.get("max_marks", default_max_marks))
            if final_max == 5.0 and default_max_marks != 5.0:
                final_max = default_max_marks
                
        aligned.append({
            **raw_q,
            "question_no": final_q_no,
            "question_title": final_title,
            "max_marks": final_max,
            "awarded_marks": float(raw_q.get("awarded_marks", 0.0)),
            "extracted_answer": raw_q.get("extracted_answer", ""),
            "criteria": raw_q.get("criteria", []),
            "feedback_comment": raw_q.get("feedback_comment", "")
        })
        
    return aligned

def extract_handwriting_transcripts(
    pages: List[Dict[str, Any]],
    vision_model: str = DEFAULT_VISION_MODEL
) -> str:

    """
    Uses the vision model page-by-page to accurately transcribe handwritten student work,
    diagram labels, ticks/circles, connections, equations, and graphs from monochrome / black-and-white scans.
    """
    page_transcripts = []
    
    for p_idx, p in enumerate(pages, 1):
        img_path = p.get("image_path")
        if not img_path:
            continue
            
        b64 = get_page_base64(img_path)
        prompt = f"""Extract student handwriting from Page {p_idx}. Ignore printed text.
For each question, output: Question <No>: <Handwritten Answer>
For graphs: list all plotted point coordinates. If blank: [Blank / No response].
"""
        res = ollama_client.generate_chat(
            model=vision_model,
            messages=[{"role": "user", "content": prompt, "images": [b64]}],
            format_json=False,
            temperature=0.0,
            timeout=90,
            num_ctx=DEFAULT_OCR_NUM_CTX,
            reasoning_effort="low"
        )
        if res.get("success") and res.get("content"):
            page_transcripts.append(res.get("content").strip())
            
    return "\n\n".join(page_transcripts)

def step1a_extract_student_responses_verbatim(
    assignment_info: Dict[str, Any],
    student_info: Dict[str, Any],
    pages: List[Dict[str, Any]],
    vision_model: str = DEFAULT_VISION_MODEL
) -> Dict[str, Any]:
    """
    Step 1A: Vision AI extracts and transcribes the student's handwritten responses page-by-page
    verbatim question by question and part by part, using relaxed spatial bounding between question anchors,
    caret insertions, numbers/measurements, and diagram traceback, without grading yet.
    """
    assignment_title = assignment_info.get("title", "Assignment")
    subject = assignment_info.get("subject", "General")
    max_marks = float(assignment_info.get("max_marks", 100.0))
    student_name = student_info.get("name", "Student")
    student_id = student_info.get("student_id", "")
    
    if not pages:
        return {"success": False, "error": "No page images available for extraction."}
        
    all_extracted_questions = []
    
    for p_idx, p in enumerate(pages, 1):
        img_path = p.get("image_path")
        if not img_path:
            continue
            
        b64 = get_page_base64(img_path)
        prompt = f"""Extract student handwriting from Page {p_idx} of {len(pages)}.

CRITICAL RULES:
1. ONLY transcribe HANDWRITTEN student answers. Ignore all pre-printed question text.
2. STRICT GRID FIDELITY FOR GRAPHS (NEVER COPY FROM PRINTED DATA TABLES):
   - Look directly at the student's physical handwritten axis numbers on the grid.
     * If the student wrote '1, 2, 3, 4, 5' on the vertical axis instead of tens, transcribe Y-axis scale as '1, 2, 3, 4, 5'.
   - Read the EXACT visual coordinates where each hand-drawn cross 'x' or dot was physically marked on the grid.
     * Do NOT copy the table's expected numbers (e.g. 24, 30, 36). Transcribe the actual grid intersections marked (e.g. (1, 2), (2, 3), (3, 3.6)...).
     * If the student omitted a data point (e.g. t=0) or started the line from origin (0,0), explicitly note it.
   - Transcribe graph format strictly as:
     Question <No>: [Graph: X-axis="<Label & Unit>" (Scale: <Handwritten Scale>), Y-axis="<Label & Unit>" (Scale: <Handwritten Scale>), Plotted Points: [(x1, y1), (x2, y2)...] (Total N points), Line: "<Detailed description: CAREFULLY TRACE the line between each point. If the slope changes (dot-to-dot), state 'straight line segments connecting subsequent points'. Otherwise state if it's a best fit line, ONE straight line through all points, or a smooth curve. Explicitly note if drawn with a ruler, if smooth, if branched/hairy (sketched), and if it passes through origin (0,0)>"]
3. TABULAR DATA:
   - Transcribe student filled-in cells row-by-row into:
     Question <No>: [Table: Header=["<Col1>", "<Col2>", ...], Rows=[["<Val1>", "<Val2>", ...], ...]]
4. FILL-IN-THE-BLANKS & MEASUREMENTS:
   - Extract the exact handwritten value and unit.
5. If blank, write: Question <No>: [Blank / No response]

Output format strictly:
Question <No>: <Answer>
"""

        res = ollama_client.generate_chat(
            model=vision_model,
            messages=[{"role": "user", "content": prompt, "images": [b64]}],
            format_json=False,
            temperature=0.0,
            timeout=90,
            num_ctx=DEFAULT_OCR_NUM_CTX,
            reasoning_effort="low"
        )
        
        p_qs = []
        if res.get("success"):
            p_qs = parse_questions_from_ocr_text(res.get("content", ""), page_num=p_idx)
            
        if not p_qs:
            # Fallback for this page so it is NEVER silently dropped
            page_content = res.get("content", "").strip() if res.get("success") else "[Page extraction error / timeout]"
            p_qs = [{
                "question_no": f"Page {p_idx}",
                "question_title": f"Page {p_idx} Workings & Responses",
                "extracted_answer": page_content or "[Blank / No handwriting detected]"
            }]
            
        for q in p_qs:
            ans = q.get("extracted_answer", "")
            if isinstance(ans, (dict, list)):
                ans = json.dumps(ans)
            all_extracted_questions.append({
                "question_no": str(q.get("question_no", f"Q{len(all_extracted_questions)+1}")),
                "question_title": q.get("question_title", f"Question {q.get('question_no', '')}"),
                "max_marks": float(q.get("max_marks", 5.0)),
                "awarded_marks": 0.0,
                "extracted_answer": str(ans),
                "criteria": [],
                "feedback_comment": "",
                "page_number": p_idx
            })

    if not all_extracted_questions:
        # Fallback question item if none detected
        all_extracted_questions = [{
            "question_no": "1",
            "question_title": "Student Submission",
            "max_marks": max_marks,
            "awarded_marks": 0.0,
            "extracted_answer": "[Blank / No handwriting detected]",
            "criteria": [],
            "feedback_comment": ""
        }]
        
    return {
        "success": True,
        "step": "1A",
        "questions": all_extracted_questions,
        "total_score": 0.0,
        "max_marks": sum(float(q.get("max_marks", 0)) for q in all_extracted_questions) or max_marks,
        "percentage": 0.0,
        "grade_letter": "--",
        "ai_model_used": vision_model
    }

def mark_single_question(
    q: Dict[str, Any],
    assignment_info: Dict[str, Any],
    student_info: Dict[str, Any],
    reasoning_model: str = DEFAULT_TEXT_MODEL
) -> Dict[str, Any]:
    """
    Evaluates a single student question against the marking scheme in a focused,
    high-precision prompt with zero context overflow.
    """
    q_no = str(q.get("question_no", "1")).strip()
    q_title = str(q.get("question_title", f"Question {q_no}")).strip()
    q_max = float(q.get("max_marks", 5.0))
    extracted = str(q.get("extracted_answer", "")).strip()
    
    assignment_title = assignment_info.get("title", "Assignment")
    subject = assignment_info.get("subject", "General")
    marking_scheme = assignment_info.get("marking_scheme_text", "")
    rubric_json = assignment_info.get("rubric_json", "[]")
    
    # If the response is marked as blank or empty
    if not extracted or extracted.lower() in ("[blank / no handwriting detected]", "[blank]", "blank", "none", "no response"):
        return {
            **q,
            "question_no": q_no,
            "question_title": q_title,
            "max_marks": q_max,
            "awarded_marks": 0.0,
            "extracted_answer": extracted or "[Blank / No response]",
            "criteria": [{"criterion": "Response provided", "max": q_max, "awarded": 0.0, "comment": "No answer written"}],
            "feedback_comment": f"No marks awarded (0/{q_max}). Question left blank."
        }

    # Resolve question label aliases for matching (e.g. (a) -> Question 1(a))
    q_aliases = [q_no]
    if q_no.startswith("(") and q_no.endswith(")"):
        q_aliases.append(f"1{q_no}")
        q_aliases.append(f"Question 1{q_no}")
        q_aliases.append(f"Q1{q_no}")
    else:
        q_aliases.append(f"Question {q_no}")
        q_aliases.append(f"Q{q_no}")

    # Auto-detect true max marks from marking scheme text if available
    for alias in q_aliases:
        m = re.search(rf"(?:Question|Q|Part)?\s*{re.escape(alias)}\s*\(([0-9]+(?:\.[0-9]+)?)\s*marks?\)", marking_scheme, re.IGNORECASE)
        if m:
            try:
                q_max = float(m.group(1))
                break
            except Exception:
                pass
    
    prompt = f"""You are an expert examiner grading Question {q_no}.

Subject: {subject}
Assignment: {assignment_title}
Question: {q_no} - {q_title}
Maximum Marks: {q_max}

OFFICIAL MARKING SCHEME & RUBRIC:
----------------------------------------
{marking_scheme}
----------------------------------------

{GRAPH_EVALUATION_GUIDANCE}

STUDENT EXTRACTED ANSWER / WORKING FOR QUESTION {q_no}:
----------------------------------------
{extracted}
----------------------------------------

GRADING & FEEDBACK INSTRUCTIONS:
1. Evaluate every rubric criterion for Question {q_no} and determine exact awarded_marks (0.0 to {q_max}).
2. Populate the 'criteria' array with an object for each criterion containing:
   - "criterion": Name / description of criterion
   - "max": Maximum marks for this criterion
   - "awarded": Marks awarded (0.0 to max)
   - "comment": Specific diagnostic feedback for this criterion (e.g. "✓ Correct..." or "✗ Error: [specific mistake]. Expected: [expected answer]")
3. 'feedback_comment':
   - For 1-mark questions: Provide 1 concise sentence ("✓ Correct. [reason]" or "✗ Error: [mistake]. Expected: [expected]").
   - For multi-mark / graph / table questions: Provide a comprehensive diagnostic summary stating the specific errors identified across all criteria (e.g. axes, scales, exact plotted point mismatches, omitted points, and line/curve shape) and the expected correct values.
4. Return STRICTLY valid JSON.

JSON FORMAT:
{{
  "awarded_marks": {q_max},
  "criteria": [
    {{"criterion": "Axes & Labels", "max": 1.0, "awarded": 1.0, "comment": "✓ Quantity and units labelled correctly."}},
    {{"criterion": "Linear Scales", "max": 1.0, "awarded": 0.0, "comment": "✗ Error: Y-axis scale numbered 1-5 instead of 0-60 °C. Expected: Linear scale 0-60 °C."}}
  ],
  "feedback_comment": "✗ Error: Y-axis scale numbered 1-5 instead of 0-60 °C; point (0, 24) omitted. Expected: Linear scale 0-60 °C with points (0,24), (1,30)..."
}}
"""

    result = ollama_client.generate_chat(
        model=reasoning_model,
        messages=[{"role": "user", "content": prompt}],
        format_json=True,
        temperature=0.1,
        timeout=120,
        num_ctx=DEFAULT_GRADING_NUM_CTX,
        num_predict=3000,
        reasoning_effort="none"
    )

    awarded = 0.0
    criteria = []
    comment = ""

    if result.get("success"):
        content = result.get("content", "")
        thinking = result.get("thinking", "")
        
        # 1. Try parse JSON from content
        parsed = clean_and_parse_json(content)
        # 2. If not found, try parse JSON from thinking
        if not parsed and thinking:
            parsed = clean_and_parse_json(thinking)

        if parsed and isinstance(parsed, dict):
            if "questions" in parsed and isinstance(parsed["questions"], list) and len(parsed["questions"]) > 0:
                q_data = parsed["questions"][0]
            else:
                q_data = parsed

            if "awarded_marks" in q_data:
                try:
                    awarded = min(float(q_data["awarded_marks"]), q_max)
                except Exception:
                    pass
            elif "score" in q_data:
                try:
                    awarded = min(float(q_data["score"]), q_max)
                except Exception:
                    pass

            if "criteria" in q_data and isinstance(q_data["criteria"], list):
                criteria = q_data["criteria"]

            if "feedback_comment" in q_data:
                comment = str(q_data["feedback_comment"]).strip()

        # 3. Fallback regex extraction across both content and thinking
        combined_text = f"{content}\n{thinking}"
        if combined_text.strip():
            # Extract criteria objects via regex if not parsed
            if not criteria:
                crit_matches = re.finditer(
                    r"\{\s*\"criterion\"\s*:\s*\"([^\"]+)\"\s*,\s*\"max\"\s*:\s*([0-9.]+)\s*,\s*\"awarded\"\s*:\s*([0-9.]+)(?:\s*,\s*\"comment\"\s*:\s*\"([^\"]*)\")?\s*\}",
                    combined_text
                )
                for cm in crit_matches:
                    try:
                        criteria.append({
                            "criterion": cm.group(1),
                            "max": float(cm.group(2)),
                            "awarded": float(cm.group(3)),
                            "comment": cm.group(4) or ""
                        })
                    except Exception:
                        pass

            # Extract feedback comment via regex if not parsed
            if not comment:
                fb_match = re.search(r"\"feedback_comment\"\s*:\s*\"([^\"]+)\"", combined_text)
                if fb_match:
                    comment = fb_match.group(1).strip()
                else:
                    fb_match2 = re.search(r"(?:feedback|comment|reason|rationale)\s*[:=]\s*([^\n\r]+)", combined_text, re.IGNORECASE)
                    if fb_match2:
                        comment = fb_match2.group(1).strip()

            # Check for JSON awarded_marks in text
            if awarded == 0.0:
                json_marks = re.search(r"\"awarded_marks\"\s*:\s*([0-9]+(?:\.[0-9]+)?)", combined_text, re.IGNORECASE)
                if json_marks:
                    try:
                        awarded = min(float(json_marks.group(1)), q_max)
                    except Exception:
                        pass
                
                if awarded == 0.0:
                    award_patterns = [
                        r"Total[^\n]*?=\s*([0-9]+(?:\.[0-9]+)?)\s*(?:marks?)?",
                        r"(?:award|awarded|score|scored)\s*(?:a\s+total\s+of\s+)?([0-9]+(?:\.[0-9]+)?)\s*(?:marks?|pts?|points?)?",
                        r"([0-9]+(?:\.[0-9]+)?)\s*(?:\/|\s*out of)\s*([0-9]+(?:\.[0-9]+)?)",
                        r"([0-9]+(?:\.[0-9]+)?)\s*(?:marks?|pts?|points?)\s*(?:for\s+this|awarded)"
                    ]
                    for pat in award_patterns:
                        match = re.search(pat, combined_text, re.IGNORECASE)
                        if match:
                            try:
                                score_val = float(match.group(1))
                                if 0.0 < score_val <= q_max:
                                    awarded = score_val
                                    break
                            except Exception:
                                pass

        # 4. Extract structured criteria and feedback from thinking buffer if still empty
        if thinking and (not criteria or awarded == 0.0):
            blocks = re.split(r"\n(?=\s*(?:\*\*[^*]+\*\*|\b[0-9]+\.\s*\*\*))", thinking)
            extracted_crits = []
            for block in blocks:
                b_s = block.strip()
                title_m = re.search(r"\*\*([^*]+)\*\*", b_s)
                if not title_m:
                    continue
                title = title_m.group(1).strip(" :")
                if title.lower().startswith("total"):
                    continue
                mark_m = re.search(r"(?:→|award|awarded|score|gives?)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:marks?|pts?|points?)?", b_s, re.IGNORECASE)
                mark_val = float(mark_m.group(1)) if mark_m else (1.0 if "✓" in b_s and "0 marks" not in b_s and "not awarded" not in b_s else 0.0)
                if mark_val == 0.0:
                    err_m = re.search(r"([^.\n]+(?:omitted|wrong|incorrect|doesn't match|missing|inappropriate|not in the range)[^.\n]*)", b_s, re.IGNORECASE)
                    comment_text = f"✗ Error: {err_m.group(1).strip()}." if err_m else "✗ Error: Criteria not met."
                else:
                    comment_text = f"✓ {title} criteria met."
                extracted_crits.append({
                    "criterion": title,
                    "max": 1.0,
                    "awarded": min(mark_val, 1.0),
                    "comment": comment_text
                })
            if extracted_crits and not criteria:
                criteria = extracted_crits
                if awarded == 0.0:
                    awarded = min(sum(c['awarded'] for c in criteria), q_max)

    # If criteria is present, ensure awarded_marks matches sum of criteria if awarded was 0
    if criteria and awarded == 0.0:
        sum_c = sum(float(c.get("awarded", 0.0)) for c in criteria)
        if sum_c > 0.0:
            awarded = min(sum_c, q_max)

    # Intelligent comment fallback: Synthesize detailed remark from criteria if comment is empty or generic
    if not comment or comment.lower() in ("evaluated by ai.", "criteria not met.", "matches marking scheme."):
        if criteria:
            failed_crits = [c for c in criteria if float(c.get("awarded", 0)) < float(c.get("max", 1.0))]
            passed_crits = [c for c in criteria if float(c.get("awarded", 0)) >= float(c.get("max", 1.0))]
            
            if not failed_crits:
                crit_summaries = ", ".join(c.get("criterion", "") for c in passed_crits[:3])
                comment = f"✓ Correct ({awarded}/{q_max} marks). All criteria met: {crit_summaries}."
            else:
                err_details = []
                for c in failed_crits:
                    c_name = c.get("criterion", "Criterion")
                    c_comm = c.get("comment", "")
                    if c_comm and not c_comm.lower().startswith("criterion feedback") and "criteria not met" not in c_comm.lower():
                        clean_c = re.sub(r"^[✗✓\s\:\-]+", "", c_comm).strip()
                        err_details.append(f"{c_name}: {clean_c}")
                    else:
                        err_details.append(f"{c_name}: requirement not met")
                comment = f"✗ Partial credit ({awarded}/{q_max} marks). " + "; ".join(err_details)
        else:
            if awarded >= q_max:
                comment = f"✓ Correct ({awarded}/{q_max} marks). Matches marking scheme."
            elif awarded > 0:
                comment = f"✗ Partial credit ({awarded}/{q_max} marks). Incomplete method or missing step."
            else:
                comment = f"✗ Error (0/{q_max} marks). Incomplete or incorrect answer."

    return {
        **q,
        "question_no": q_no,
        "question_title": q_title,
        "max_marks": q_max,
        "awarded_marks": round(awarded, 1),
        "extracted_answer": extracted,
        "criteria": criteria,
        "feedback_comment": comment
    }

def step1b_mark_extracted_questions(
    assignment_info: Dict[str, Any],
    student_info: Dict[str, Any],
    questions: List[Dict[str, Any]],
    reasoning_model: str = DEFAULT_TEXT_MODEL
) -> Dict[str, Any]:
    """
    Step 1B: Evaluates questions question-by-question against the marking scheme.
    Uses concurrent thread pooling for rapid multi-question marking.
    """
    import concurrent.futures

    max_marks = float(assignment_info.get("max_marks", 100.0))
    if not questions:
        return {"success": False, "error": "No questions to mark."}

    # Parallel evaluation across questions (max 3 workers to prevent resource contention)
    num_workers = min(len(questions), 3)
    scored_dict = {}

    if num_workers <= 1:
        marked_questions = [
            mark_single_question(
                q=q,
                assignment_info=assignment_info,
                student_info=student_info,
                reasoning_model=reasoning_model
            )
            for q in questions
        ]
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=num_workers) as executor:
            future_to_idx = {
                executor.submit(
                    mark_single_question,
                    q=q,
                    assignment_info=assignment_info,
                    student_info=student_info,
                    reasoning_model=reasoning_model
                ): idx
                for idx, q in enumerate(questions)
            }
            for future in concurrent.futures.as_completed(future_to_idx):
                idx = future_to_idx[future]
                try:
                    scored_dict[idx] = future.result()
                except Exception as e:
                    orig_q = questions[idx]
                    scored_dict[idx] = {
                        **orig_q,
                        "awarded_marks": 0.0,
                        "feedback_comment": f"Evaluation error: {str(e)}"
                    }
        marked_questions = [scored_dict[i] for i in range(len(questions))]

    computed_awarded = sum(float(q.get("awarded_marks", 0.0)) for q in marked_questions)
    computed_max = sum(float(q.get("max_marks", 0.0)) for q in marked_questions) or max_marks
    pct = round((computed_awarded / computed_max * 100.0), 1) if computed_max > 0 else 0.0
    grade = compute_grade_letter(pct)

    return {
        "success": True,
        "step": "1B",
        "questions": marked_questions,
        "total_score": round(computed_awarded, 1),
        "max_marks": computed_max,
        "percentage": pct,
        "grade_letter": grade,
        "ai_model_used": reasoning_model
    }

def step1_mark_questions_by_parts(
    assignment_info: Dict[str, Any],
    student_info: Dict[str, Any],
    pages: List[Dict[str, Any]],
    vision_model: str = DEFAULT_VISION_MODEL,
    reasoning_model: Optional[str] = DEFAULT_TEXT_MODEL,
    use_two_stage: bool = True
) -> Dict[str, Any]:
    """
    Combined Step 1: Extracts verbatim responses (1A) and immediately marks them (1B).
    """
    extract_res = step1a_extract_student_responses_verbatim(
        assignment_info=assignment_info,
        student_info=student_info,
        pages=pages,
        vision_model=vision_model
    )
    if not extract_res.get("success"):
        return extract_res
        
    effective_reasoning = reasoning_model or DEFAULT_TEXT_MODEL
    mark_res = step1b_mark_extracted_questions(
        assignment_info=assignment_info,
        student_info=student_info,
        questions=extract_res["questions"],
        reasoning_model=effective_reasoning
    )
    return mark_res

def step2_evaluate_and_comment(
    assignment_info: Dict[str, Any],
    student_info: Dict[str, Any],
    questions: List[Dict[str, Any]],
    reasoning_model: str = DEFAULT_TEXT_MODEL
) -> Dict[str, Any]:
    """
    Step 2 of AI Marking: Synthesizes personalized overall remarks, key strengths,
    and actionable improvement areas based on the verified question-by-question marks.
    """
    assignment_title = assignment_info.get("title", "Assignment")
    subject = assignment_info.get("subject", "General")
    student_name = student_info.get("name", "Student")
    
    computed_awarded = sum(float(q.get("awarded_marks", 0.0)) for q in questions)
    computed_max = sum(float(q.get("max_marks", 0.0)) for q in questions) or 100.0
    pct = round((computed_awarded / computed_max * 100.0), 1) if computed_max > 0 else 0.0
    grade = compute_grade_letter(pct)
    
    questions_summary = []
    for q in questions:
        q_num = q.get("question_no", "")
        title = q.get("question_title", "")
        awarded = q.get("awarded_marks", 0)
        q_max = q.get("max_marks", 0)
        comment = q.get("feedback_comment", "")
        questions_summary.append(f"- Q{q_num} ({title}): {awarded}/{q_max} marks. Notes: {comment}")
        
    summary_text = "\n".join(questions_summary)
    
    prompt = f"""You are an encouraging master teacher writing concise feedback for {student_name}'s assignment.

Subject: {subject}
Assignment: {assignment_title}
Overall Result: {computed_awarded} / {computed_max} marks ({pct}%) - Grade {grade}

QUESTION-BY-QUESTION SUMMARY:
----------------------------------------
{summary_text}
----------------------------------------

RULES FOR CONCISE SUMMARY (STRICT):
1. 'overall_feedback': Direct and brief (MAX 2-3 sentences).
2. 'strengths': 2 short bullet points highlighting what went well (under 8 words each).
3. 'areas_for_improvement': 2 short bullet points stating exact question and error to fix (under 12 words each).
4. Return STRICTLY JSON.

JSON FORMAT:
{{
  "overall_feedback": "Dear {student_name}, solid effort scoring {computed_awarded}/{computed_max} ({pct}%). Review the specific errors highlighted below to master key concepts.",
  "strengths": [
    "Accurate calculation methods",
    "Clear handwriting and presentation"
  ],
  "areas_for_improvement": [
    "Review Question 2(a): close air-hole before opening gas",
    "Review Question 1(e): state concrete lab precautions"
  ]
}}
"""

    result = ollama_client.generate_chat(
        model=reasoning_model,
        messages=[{"role": "user", "content": prompt}],
        format_json=True,
        temperature=0.1,
        timeout=90,
        num_ctx=DEFAULT_GRADING_NUM_CTX,
        num_predict=1500,
        reasoning_effort="none"
    )
    
    overall = ""
    strengths_text = ""
    improvements_text = ""
    
    if result.get("success"):
        content = result.get("content", "")
        thinking = result.get("thinking", "")
        parsed_json = clean_and_parse_json(content)
        if not parsed_json and thinking:
            parsed_json = clean_and_parse_json(thinking)

        if parsed_json and isinstance(parsed_json, dict):
            overall = str(parsed_json.get("overall_feedback", "")).strip()
            
            strengths = parsed_json.get("strengths", [])
            if isinstance(strengths, list) and strengths:
                strengths_text = "\n".join(f"• {s}" for s in strengths if s)
            elif isinstance(strengths, str) and strengths.strip():
                strengths_text = strengths.strip()
                
            improvements = parsed_json.get("areas_for_improvement", [])
            if isinstance(improvements, list) and improvements:
                improvements_text = "\n".join(f"• {s}" for s in improvements if s)
            elif isinstance(improvements, str) and improvements.strip():
                improvements_text = improvements.strip()

    # Smart default fallback if LLM response was incomplete or empty
    if not overall:
        overall = f"Dear {student_name},\n\nYou scored {computed_awarded} / {computed_max} marks ({pct}%, Grade {grade}) on {assignment_title}. Review the question-level remarks and criteria to consolidate your learning."

    if not strengths_text:
        top_qs = [q for q in questions if float(q.get("awarded_marks", 0)) > 0]
        if top_qs:
            strengths_text = "\n".join([f"• Solid performance on Question {q.get('question_no')}" for q in top_qs[:2]] + ["• Clear handwriting and systematic working"])
        else:
            strengths_text = "• Good foundational effort attempted\n• Structured response format"

    if not improvements_text:
        lost_qs = [q for q in questions if float(q.get("awarded_marks", 0)) < float(q.get("max_marks", 0))]
        if lost_qs:
            improvements_text = "\n".join([f"• Review deduction criteria on Question {q.get('question_no')}" for q in lost_qs[:2]] + ["• Ensure all formula substitutions and units are clearly stated"])
        else:
            improvements_text = "• Maintain high precision and consistent presentation across all sections"

    return {
        "success": True,
        "overall_feedback": overall,
        "strengths_feedback": strengths_text,
        "improvement_feedback": improvements_text,
        "total_score": round(computed_awarded, 1),
        "max_marks": computed_max,
        "percentage": pct,
        "grade_letter": grade
    }

def step2_mark_and_comment(
    assignment_info: Dict[str, Any],
    student_info: Dict[str, Any],
    questions: List[Dict[str, Any]],
    reasoning_model: str = DEFAULT_TEXT_MODEL
) -> Dict[str, Any]:
    """
    Step 2: Reasoning model evaluates the verified student handwriting question-by-question,
    awards criteria marks, AND synthesizes personalized overall remarks, strengths, and improvements.
    """
    # 1. Score questions
    mark_res = step1b_mark_extracted_questions(
        assignment_info=assignment_info,
        student_info=student_info,
        questions=questions,
        reasoning_model=reasoning_model
    )
    if not mark_res.get("success"):
        return mark_res
        
    scored_questions = mark_res.get("questions", questions)
    
    # 2. Synthesize comments and feedback
    eval_res = step2_evaluate_and_comment(
        assignment_info=assignment_info,
        student_info=student_info,
        questions=scored_questions,
        reasoning_model=reasoning_model
    )
    
    return {
        "success": True,
        "step": 2,
        "questions": scored_questions,
        "total_score": mark_res["total_score"],
        "max_marks": mark_res["max_marks"],
        "percentage": mark_res["percentage"],
        "grade_letter": mark_res["grade_letter"],
        "overall_feedback": eval_res.get("overall_feedback", ""),
        "strengths_feedback": eval_res.get("strengths_feedback", ""),
        "improvement_feedback": eval_res.get("improvement_feedback", ""),
        "ai_model_used": reasoning_model
    }

def grade_student_submission(
    assignment_info: Dict[str, Any],
    student_info: Dict[str, Any],
    pages: List[Dict[str, Any]],
    vision_model: str = DEFAULT_VISION_MODEL,
    reasoning_model: Optional[str] = DEFAULT_TEXT_MODEL,
    use_two_stage: bool = True
) -> Dict[str, Any]:
    """
    Do All (Full Auto Pipeline): Step 1 (Extract) -> Step 2 (Mark & Comment).
    """
    effective_reasoning = reasoning_model or DEFAULT_TEXT_MODEL
    
    # Step 1: Extract Text
    extract_res = step1a_extract_student_responses_verbatim(
        assignment_info=assignment_info,
        student_info=student_info,
        pages=pages,
        vision_model=vision_model
    )
    if not extract_res.get("success"):
        return extract_res
        
    # Step 2: Mark & Comment
    step2_res = step2_mark_and_comment(
        assignment_info=assignment_info,
        student_info=student_info,
        questions=extract_res["questions"],
        reasoning_model=effective_reasoning
    )
    if not step2_res.get("success"):
        return step2_res
        
    step2_res["ai_model_used"] = f"{vision_model} + {effective_reasoning}"
    return step2_res

def extract_student_identity_from_scan(
    pages: List[Dict[str, Any]],
    filename: str = "",
    default_class: str = "",
    vision_model: str = DEFAULT_VISION_MODEL,
    fast_only: bool = False
) -> Dict[str, str]:
    """
    Extracts student name, student ID / candidate number, and class name from the scanned pages.
    1. Checks digital text patterns from page 1 (instant).
    2. If not fast_only and name not found, calls local multimodal Vision LLM on Page 1 image with zero reasoning.
    3. Falls back to clean filename derivation.
    """
    inferred_name = ""
    inferred_id = ""
    inferred_class = default_class

    # 1. Heuristic from filename: e.g. "Sarah_Connor_Physics.pdf" -> "Sarah Connor"
    if filename:
        clean_name = Path(filename).stem
        clean_name = re.sub(r"^(scan_[\d_]+|assignment_[\d_]+|batch_[\d_]+|combined_[\d_]+)", "", clean_name, flags=re.IGNORECASE)
        clean_name = re.sub(r"[_.-]+", " ", clean_name).strip()
        ignored_words = {"exam", "quiz", "test", "submission", "scan", "paper", "script", "pdf", "page", "pages", "term", "midterm", "final", "assignment", "homework", "task"}
        clean_words = [w for w in clean_name.split() if w.lower() not in ignored_words]
        if clean_words:
            inferred_name = " ".join(clean_words).title()

    # 2. Inspect first page
    if pages:
        first_page = pages[0]
        img_path = first_page.get("image_path")
        extracted_text = first_page.get("extracted_text", "")

        # Fast regex on extracted digital text
        if extracted_text:
            name_match = re.search(r"(?:Name|Student\s*Name|Candidate\s*Name)\s*[:：\-]\s*([A-Za-z\s'\-]+)", extracted_text, re.IGNORECASE)
            if name_match:
                val = name_match.group(1).strip().split("\n")[0]
                if len(val) > 1:
                    inferred_name = val
            id_match = re.search(r"(?:Student\s*ID|ID|Index|Candidate\s*No|Roll\s*No)\s*[:：\-]\s*([A-Za-z0-9\-]+)", extracted_text, re.IGNORECASE)
            if id_match:
                inferred_id = id_match.group(1).strip().split("\n")[0]
            class_match = re.search(r"(?:Class|Grade|Cohort|Section)\s*[:：\-]\s*([A-Za-z0-9\s\-]+)", extracted_text, re.IGNORECASE)
            if class_match:
                inferred_class = class_match.group(1).strip().split("\n")[0]

        # 3. Call local Vision LLM on first page image if not fast_only and needed
        if not fast_only and img_path and (not inferred_name or inferred_name.startswith("Student ")):
            try:
                b64 = get_page_base64(img_path)
                prompt = (
                    "Look at this student answer script or exam cover page. "
                    "Locate and transcribe the HANDWRITTEN student full name, handwritten student ID / candidate number, and class/grade name. "
                    "Disregard printed teacher names, school headers, or printed worksheet instructions. "
                    "Return ONLY JSON: {\"name\": \"...\", \"student_id\": \"...\", \"class_name\": \"...\"}. "
                    "If a field is not found, return empty string for that field."
                )
                res = ollama_client.generate_chat(
                    model=vision_model,
                    messages=[
                        {"role": "user", "content": prompt, "images": [b64]}
                    ],
                    format_json=True,
                    temperature=0.0,
                    timeout=20,
                    num_ctx=DEFAULT_OCR_NUM_CTX,
                    reasoning_effort="none"
                )
                if res.get("success"):
                    parsed = clean_and_parse_json(res.get("content", ""))
                    if parsed and isinstance(parsed, dict):
                        if parsed.get("name") and len(parsed["name"].strip()) > 1:
                            inferred_name = parsed["name"].strip()
                        if parsed.get("student_id") and parsed["student_id"].strip():
                            inferred_id = parsed["student_id"].strip()
                        if parsed.get("class_name") and parsed["class_name"].strip():
                            inferred_class = parsed["class_name"].strip()
            except Exception:
                pass

    if not inferred_name:
        inferred_name = "Student " + (inferred_id if inferred_id else "Script")
    if not inferred_id:
        import time
        inferred_id = f"STU-{int(time.time()*1000) % 10000:04d}"

    return {
        "name": inferred_name,
        "student_id": inferred_id,
        "class_name": inferred_class or default_class or "General"
    }

