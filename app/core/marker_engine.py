import json
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
from app.core.ollama_client import ollama_client
from app.core.pdf_processor import get_page_base64
from app.core.config import DEFAULT_VISION_MODEL, DEFAULT_TEXT_MODEL, DEFAULT_OCR_NUM_CTX, DEFAULT_GRADING_NUM_CTX
from app.core.fallback_tracker import record_fallback

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
    record_fallback(
        source="JSON Parser",
        trigger="Grading model response was not valid JSON",
        action="Applied regex and heuristic section matching fallback",
        details=f"Extracted grades for {len(original_questions or [])} questions via regex fallback"
    )
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
                    **orig,
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
            **orig,
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
         * STRICT RULER REQUIREMENT: In science exams, a "best fit straight line" STRICTLY REQUIRES a single, ruler-drawn straight line.
         * If the line is hand drawn, freehand, wavy, curved, sagging between points, or drawn without a ruler connecting dot-to-dot, CANNOT BE AWARDED THE LINE MARK (award 0 marks for this criterion)! State: "✗ Error: Line is hand drawn / freehand without a ruler, not a best-fit straight line. Expected: Ruler-drawn straight line of best fit."
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
   - Preserve headers, units, and all filled row entries across all columns.
3. GRAPH WORK EXTRACTION:
   - Read actual handwritten axis numbers directly from the grid (DO NOT copy printed prompt tables).
   - STRICT RULER VS HAND-DRAWN INSPECTION:
     * Zoom in and trace the drawn line between each data point.
     * If the line is wavy, curved, sagging between points, or drawn freehand without a ruler, you MUST explicitly state: 'Hand-drawn freehand line without a ruler (NOT drawn with a ruler); curved/wobbly between points, not a straight line'.
     * ONLY describe as 'drawn with a ruler' if it is a single, mathematically straight ruler-drawn line with zero wobbles or curvature throughout.
   - Transcribe:
     [Graph: X-axis="<Label & Unit>" (Scale: <Range>), Y-axis="<Label & Unit>" (Scale: <Range>), Plotted Points: [(x1, y1), (x2, y2), ...] (Total N points), Line: "<Detailed description: CAREFULLY TRACE the line between each point. Explicitly note if drawn with a ruler or hand-drawn freehand, if straight or curved/wobbly, and if it passes through origin (0,0)>", Gradient: "<Triangle coordinates & calculation>"]
4. FILL-IN-THE-BLANKS & MEASUREMENTS:
   - Transcribe the exact handwritten value and unit written in answer spaces.
5. DIAGRAMS & CALLOUT TRACEBACK:
   - Transcribe student labels, drawn arrows, ray paths, and circuit connections on figures.
6. BLANK RESPONSES:
   - If no student writing exists for a question, output "[Blank / No response]".
"""

def parse_questions_from_ocr_text(content: str, page_num: int = 1) -> List[Dict[str, Any]]:
    """Robustly parses question items from JSON, markdown lines, bullet points, or unstructured text, capturing spatial bbox_2d."""
    from app.core.direct_marker import normalize_bbox

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
        # Standalone letter subpart like 'c', 'c)', 'c.', 'c:' -> '(c)'
        if re.match(r"^[a-z]$", s, re.IGNORECASE):
            return f"({s.lower()})"
        if re.match(r"^[a-z][\)\:\.]$", s, re.IGNORECASE):
            return f"({s[0].lower()})"
        # Roman numeral subparts like 'i)', 'ii)', 'i.', 'i:' -> '(i)'
        if re.match(r"^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)[\)\:\.]$", s, re.IGNORECASE):
            return f"({s[:-1].lower()})"
        if s.count("(") > s.count(")"):
            s = s + ")"
        # Normalize '5a' -> '5(a)'
        m_num_letter = re.match(r"^([0-9]+)([a-z])$", s, re.IGNORECASE)
        if m_num_letter:
            return f"{m_num_letter.group(1)}({m_num_letter.group(2).lower()})"
        return s
        
    # 1. Try JSON parsing
    parsed = clean_and_parse_json(content)
    if parsed and isinstance(parsed, dict) and "questions" in parsed and isinstance(parsed["questions"], list):
        res = []
        for idx, q in enumerate(parsed["questions"]):
            q["extracted_answer"] = _clean_ans(str(q.get("extracted_answer", "")))
            raw_box = q.get("bbox_2d") or q.get("bbox") or q.get("box_2d")
            norm_box = normalize_bbox(raw_box) if raw_box else None
            q["page_number"] = int(q.get("page_number", page_num) or page_num)
            q["bbox_2d"] = norm_box
            q_num_raw = str(q.get("question_no", f"{idx+1}"))
            q["question_no"] = _clean_q_num(q_num_raw)
            if not q.get("question_title"):
                q["question_title"] = f"Question {q['question_no']}"
            res.append(q)
        if res:
            total_q = max(1, len(res))
            slot_h = min(220, max(75, int(680 / total_q)))
            for idx, q in enumerate(res):
                raw_b = q.get("bbox_2d")
                is_header_collide = raw_b and raw_b[0] < 160 and raw_b[2] < 200 and (total_q > 1 or "blank" in str(q.get("extracted_answer", "")).lower())
                if not raw_b or is_header_collide:
                    base_y = min(880, 240 + (idx * slot_h))
                    q["bbox_2d"] = [base_y, 120, min(960, base_y + max(40, int(slot_h * 0.45))), 860]
            return res
        
    # 2. Universal line matching (supports markdown bolding, bullets, hashes, etc.)
    # Matches:
    #   - Prefixed by Question/Q/Part: 'Question 5(a):', 'Question (c):', 'Question c:', 'Part c:', 'Q5'
    #   - Bare question numbers / subparts: '5(a):', '5(a) ...', '5a. ...', '(c) ...', '(c): ...', 'c) ...', 'c. ...', 'c: ...', '(i) ...'
    q_header_pattern = re.compile(
        r"^(?:[\*\#\-\•\>\s]*)(?:"
        r"(?:(?:Question|Q|Part)\s+)([0-9]+[a-z]?(?:\([a-z0-9ivx]+\))*|\([a-z0-9ivx]+\)(?:\([a-z0-9ivx]+\))*|[a-z](?:\([a-z0-9ivx]+\))*|[0-9]+|[a-z])"
        r"|"
        r"([0-9]+[a-z]?(?:\([a-z0-9ivx]+\))+|[0-9]+[a-z]|\([a-z0-9ivx]+\)(?:\([a-z0-9ivx]+\))*|\([a-z0-9ivx]+\)|[a-z]\)|[a-z]\.|[a-z]\:|[0-9]+)"
        r")\s*(?:[\*\:\：\.\-\)]*)\s*(.*)",
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
            raw_q_num = m.group(1) or m.group(2)
            ans = m.group(3).strip()
            # Extract optional inline bbox tag e.g. [bbox: 200, 100, 250, 600]
            extracted_box = None
            m_box = re.search(r"\[(?:bbox|box|coords?|bbox_2d)\s*:\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)\]", ans, re.IGNORECASE)
            if m_box:
                extracted_box = normalize_bbox([int(m_box.group(1)), int(m_box.group(2)), int(m_box.group(3)), int(m_box.group(4))])
                ans = re.sub(r"\[(?:bbox|box|coords?|bbox_2d)\s*:\s*[0-9]+\s*,\s*[0-9]+\s*,\s*[0-9]+\s*,\s*[0-9]+\]", "", ans).strip()
            # Remove any trailing bold asterisks from answer text
            ans = re.sub(r"^\*+\s*", "", ans).strip()
            q_num = _clean_q_num(raw_q_num)
            cur_q = {
                "question_no": q_num,
                "question_title": f"Question {q_num}",
                "extracted_answer": ans,
                "page_number": page_num,
                "bbox_2d": extracted_box
            }
        elif cur_q:
            cur_q["extracted_answer"] += " " + line_s
            if not cur_q.get("bbox_2d"):
                m_box = re.search(r"\[(?:bbox|box|coords?|bbox_2d)\s*:\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)\]", line_s, re.IGNORECASE)
                if m_box:
                    cur_q["bbox_2d"] = normalize_bbox([int(m_box.group(1)), int(m_box.group(2)), int(m_box.group(3)), int(m_box.group(4))])
            
    if cur_q:
        cur_q["extracted_answer"] = _clean_ans(cur_q["extracted_answer"])
        questions.append(cur_q)
        
    # 3. Fallback: If page has content but no question pattern matched (e.g. standalone graph, table, or calculation)
    if not questions and content.strip():
        record_fallback(
            source="OCR Question Extraction",
            trigger=f"No question headers detected on Page {page_num}",
            action=f"Aggregated page handwriting under container 'Page {page_num}'",
            details=f"Text length: {len(content.strip())} chars"
        )
        questions.append({
            "question_no": f"Page {page_num}",
            "question_title": f"Page {page_num} Workings & Responses",
            "extracted_answer": _clean_ans(content.strip()),
            "page_number": page_num,
            "bbox_2d": [180, 100, 850, 900]
        })
        
    # Ensure every question has valid bbox_2d and page_number
    total_q = max(1, len(questions))
    slot_h = min(220, max(75, int(680 / total_q)))
    for idx, q in enumerate(questions):
        q["page_number"] = int(q.get("page_number", page_num) or page_num)
        raw_b = q.get("bbox_2d")
        is_header_collide = raw_b and raw_b[0] < 160 and raw_b[2] < 200 and (total_q > 1 or "blank" in str(q.get("extracted_answer", "")).lower())
        if not raw_b or is_header_collide:
            base_y = min(880, 240 + (idx * slot_h))
            q["bbox_2d"] = [base_y, 120, min(960, base_y + max(40, int(slot_h * 0.45))), 860]

    return questions

def resolve_question_continuity_across_pages(
    questions: List[Dict[str, Any]],
    marking_scheme_text: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Resolves multi-page question flow where question parts continue across pages
    without repeating the question header (e.g., Q5(a) and Q5(b) on page 6, followed
    by (c) and (d) on page 7 without a Q5 header).

    Links isolated subparts '(c)', '(d)', '(i)', etc. to their active parent question
    established on preceding pages ('5' -> '5(c)', '5(d)').

    Also cross-references the rubric marking scheme (if available) to sync official
    question titles and maximum marks.
    """
    if not questions:
        return []

    # 1. Build marking scheme lookup maps if available
    ms_map: Dict[str, Dict[str, Any]] = {}
    if marking_scheme_text:
        ms_list = parse_marking_scheme_structure(marking_scheme_text)
        for msq in ms_list:
            raw_no = str(msq.get("question_no", "")).strip()
            clean_k = re.sub(r"[\(\)\s]", "", raw_no).lower()
            ms_map[clean_k] = msq
            ms_map[raw_no.lower()] = msq

    active_parent_num: Optional[str] = None
    active_subpart: Optional[str] = None

    for q in questions:
        q_no = str(q.get("question_no", "")).strip()

        # Identify isolated subpart patterns:
        # e.g. '(i)', '(ii)', '(iii)' (checked before single letters since 'i', 'v', 'x' are letters)
        is_roman_subpart = re.match(r"^\((?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\)$", q_no, re.IGNORECASE)
        # e.g. '(c)', '(c)(i)', '(d)'
        is_letter_subpart = re.match(r"^\(([a-z])\)(?:\(([a-z0-9ivx]+)\))?$", q_no, re.IGNORECASE)

        if is_roman_subpart:
            # If preceding question was a letter subpart e.g. '4(b)', nest roman numeral e.g. '4(b)(i)'
            if active_subpart and re.search(r"\([a-z]\)$", active_subpart, re.IGNORECASE):
                resolved = f"{active_subpart}{q_no}"
            elif active_subpart and ms_map and re.sub(r"[\(\)\s]", "", f"{active_subpart}{q_no}").lower() in ms_map:
                resolved = f"{active_subpart}{q_no}"
            elif active_parent_num:
                resolved = f"{active_parent_num}{q_no}"
            else:
                resolved = q_no
            q["question_no"] = resolved
            q["question_title"] = f"Question {resolved}"
        elif is_letter_subpart and active_parent_num:
            resolved = f"{active_parent_num}{q_no}"
            q["question_no"] = resolved
            q["question_title"] = f"Question {resolved}"
            active_subpart = resolved
        else:
            # Full question pattern: extract parent question number e.g. '5' from '5(a)', '5b', '5', 'Q5'
            m_parent = re.match(r"^(?:Question|Q|Part)?\s*([0-9]+)", q_no, re.IGNORECASE)
            if m_parent:
                active_parent_num = m_parent.group(1)
                active_subpart = q_no

        # 2. Enrich with marking scheme metadata if matched
        final_q_no = str(q.get("question_no", "")).strip()
        clean_key = re.sub(r"[\(\)\s]", "", final_q_no).lower()
        ms_entry = ms_map.get(final_q_no.lower()) or ms_map.get(clean_key)
        if ms_entry:
            q["max_marks"] = float(ms_entry.get("max_marks", q.get("max_marks", 1.0)))
            if ms_entry.get("question_title"):
                q["question_title"] = ms_entry["question_title"]

    return questions

def parse_marking_scheme_structure(text: str) -> List[Dict[str, Any]]:
    """
    Parses full question structure, sub-parts, titles, exact max marks,
    and PAGE NUMBERS (Page Coding) from marking scheme text.
    """
    if not text or not isinstance(text, str):
        return []
        
    questions = []
    pattern = re.compile(
        r"(?:(?:Question|Q|Part)\s*)?([0-9]+[a-z]?(?:\([a-z0-9ivx]+\))*|\([a-z0-9ivx]+\)|[0-9]+)\s*(?:\(([0-9.]+)\s*marks?\)|:\s*([0-9.]+)\s*marks?)\s*(?:\[([^\]]+)\])?",
        re.IGNORECASE
    )
    page_pattern = re.compile(
        r"(?:---|===|#+)?\s*PAGE\s*([0-9]+)\b",
        re.IGNORECASE
    )

    current_page = None
    lines = text.split("\n")
    for line in lines:
        line_s = line.strip()
        if not line_s:
            continue
            
        m_page = page_pattern.search(line_s)
        if m_page:
            current_page = int(m_page.group(1))
            continue
            
        if line_s.startswith("===") or line_s.startswith("---") or line_s.lower().startswith("topic") or line_s.lower().startswith("assignment:"):
            continue
            
        m = pattern.search(line_s)
        if m:
            q_num = m.group(1).strip()
            max_m = float(m.group(2) or m.group(3))
            focus = m.group(4).strip() if m.group(4) else ""
            
            col_pos = line_s.find(":")
            desc = ""
            if col_pos != -1:
                desc = line_s[col_pos+1:].strip()
                desc = re.sub(r"\.\s*.*$", "", desc).strip()
                if len(desc) > 70:
                    desc = desc[:67] + "..."
            
            title = f"Question {q_num}"
            if desc:
                title += f" ({desc})"
            elif focus:
                title += f" ({focus})"
            
            existing = next((q for q in questions if q['question_no'].lower() == q_num.lower() and q.get('page_number') == current_page), None)
            if not existing:
                q_entry = {
                    "question_no": q_num,
                    "question_title": title,
                    "max_marks": max_m
                }
                if current_page is not None:
                    q_entry["page_number"] = current_page
                questions.append(q_entry)
                
    return questions

def extract_question_rubric_slice(
    marking_scheme_text: Optional[str],
    question_no: str,
    rubric_json: Optional[Any] = None
) -> Optional[str]:
    """
    Extracts only the relevant question rubric section from marking_scheme_text or rubric_json.
    This de-bloats prompts from ~10,000 characters down to ~200 characters per single-question prompt,
    drastically reducing prompt evaluation tokens, inference latency, and VRAM memory footprint.
    """
    if not question_no:
        return None

    # 1. Check if rubric_json has structured criteria for this question
    catalog = None
    if rubric_json:
        if isinstance(rubric_json, str):
            try:
                catalog = json.loads(rubric_json)
            except Exception:
                catalog = None
        elif isinstance(rubric_json, list):
            catalog = rubric_json

    if catalog and isinstance(catalog, list):
        norm_q = re.sub(r"[\(\)\s]", "", str(question_no)).lower()
        for item in catalog:
            item_q = re.sub(r"[\(\)\s]", "", str(item.get("question_no", ""))).lower()
            if item_q == norm_q:
                title = item.get("question_title", f"Question {question_no}")
                max_m = item.get("max_marks", 1.0)
                criteria = item.get("criteria", [])
                lines = [f"Question: {title} (Max: {max_m} marks)"]
                if criteria:
                    lines.append("Criteria:")
                    for c in criteria:
                        c_name = c.get("criterion", "")
                        c_max = c.get("max", 1.0)
                        c_desc = c.get("description", "")
                        desc_str = f" - {c_desc}" if c_desc else ""
                        lines.append(f" - [{c_name}] (max {c_max} marks){desc_str}")
                return "\n".join(lines)

    # 2. Slice from marking_scheme_text using regex pattern matching
    if not marking_scheme_text or not isinstance(marking_scheme_text, str):
        return None

    clean_q = re.escape(str(question_no).strip())
    # Match patterns like: Question 1(a), Q1(a), Part 1(a), 1(a):, Question 1, Q1, Part (c)
    pattern = rf"(?:^|\n)\s*(?:(?:Question|Q|Part)\s+)?{clean_q}(?:[:\.\s\(\[]|$)"
    m = re.search(pattern, marking_scheme_text, re.IGNORECASE)
    if not m:
        # Try stripping parentheses e.g. '(c)' -> 'c' or '1(a)' -> '1a'
        alt_q = re.sub(r"[\(\)]", "", str(question_no)).strip()
        if alt_q and alt_q != str(question_no):
            pattern = rf"(?:^|\n)\s*(?:(?:Question|Q|Part)\s+)?{re.escape(alt_q)}(?:[:\.\s\(\[]|$)"
            m = re.search(pattern, marking_scheme_text, re.IGNORECASE)
        # If question_no is like '(c)', also search for any 'Question <N>(c)'
        if not m and str(question_no).startswith("(") and str(question_no).endswith(")"):
            pattern = rf"(?:^|\n)\s*(?:(?:Question|Q|Part)\s+)?[0-9]+{clean_q}(?:[:\.\s\(\[]|$)"
            m = re.search(pattern, marking_scheme_text, re.IGNORECASE)

    if not m:
        return None

    start_pos = m.start()
    sub = marking_scheme_text[start_pos:].lstrip("\r\n")

    # Find next question boundary or section divider
    next_pattern = re.compile(
        r"\n\s*(?:(?:Question|Q|Part)\s+[0-9]+[a-zA-Z\(\)]*|[0-9]+[a-zA-Z\(\)]*\s*\([0-9.]+\s*marks?\)|Topic\s+[0-9]+|===|---|PAGE\s+[0-9]+)",
        re.IGNORECASE
    )
    first_nl = sub.find("\n")
    if first_nl == -1:
        return sub.strip()

    m_next = next_pattern.search(sub[first_nl:])
    if m_next:
        slice_text = sub[:first_nl + m_next.start()].strip()
    else:
        slice_text = sub.strip()

    if len(slice_text) >= 15:
        return slice_text
    return None

def get_effective_max_marks(
    marking_scheme_text: Optional[str] = None,
    rubric_json: Optional[Any] = None,
    questions: Optional[List[Dict[str, Any]]] = None,
    default_max: float = 100.0
) -> float:
    """
    Computes dynamic maximum marks without any hardcoded constants:
    1. Sum of question criteria / max marks from questions list.
    2. Sum of questions parsed from rubric_json or marking_scheme_text.
    3. Explicit 'TOTAL MARKS: <N>' header in marking_scheme_text.
    4. Fallback to default_max.
    """
    if questions:
        total = sum(float(q.get("max_marks", 0.0)) for q in questions if float(q.get("max_marks", 0.0)) > 0)
        if total > 0:
            return total

    catalog = []
    if rubric_json:
        if isinstance(rubric_json, str):
            try:
                parsed = json.loads(rubric_json)
                if isinstance(parsed, list):
                    catalog = parsed
            except Exception:
                pass
        elif isinstance(rubric_json, list):
            catalog = rubric_json

    if not catalog and marking_scheme_text:
        catalog = parse_marking_scheme_structure(marking_scheme_text)

    if catalog:
        total = sum(float(q.get("max_marks", 0.0)) for q in catalog if float(q.get("max_marks", 0.0)) > 0)
        if total > 0:
            return total

    if marking_scheme_text:
        m = re.search(r"TOTAL\s*MARKS?\s*[\:\=]?\s*\(?([0-9]+(?:\.[0-9]+)?)\)?", marking_scheme_text, re.IGNORECASE)
        if m:
            try:
                return float(m.group(1))
            except Exception:
                pass

    return default_max

def align_extracted_questions_with_scheme(
    extracted_qs: List[Dict[str, Any]],
    marking_scheme_text: str,
    default_max_marks: float = 1.0,
    rubric_json: Optional[Any] = None
) -> List[Dict[str, Any]]:
    """
    Aligns raw extracted questions with the official marking scheme questions catalog.
    Implements Page Coding: Scopes alignment by page_number so that local page numbering
    (e.g., Page 2 Q1..Q4) correctly maps to marking scheme questions for Page 2 (e.g., Q3..Q6),
    resolves sub-parts, and ensures complete coverage without ghost duplicates.
    """
    catalog = []
    if rubric_json:
        if isinstance(rubric_json, str):
            try:
                parsed = json.loads(rubric_json)
                if isinstance(parsed, list):
                    catalog = parsed
            except Exception:
                catalog = []
        elif isinstance(rubric_json, list):
            catalog = rubric_json

    if not catalog and marking_scheme_text:
        catalog = parse_marking_scheme_structure(marking_scheme_text)

    if not catalog:
        for q in extracted_qs:
            if "max_marks" not in q or q["max_marks"] == 5.0:
                q["max_marks"] = default_max_marks
        return extracted_qs

    # Check for Page Coding in the catalog
    catalog_by_page: Dict[int, List[Dict[str, Any]]] = {}
    has_page_coding = False
    for c in catalog:
        p = c.get("page_number")
        if p is not None:
            has_page_coding = True
            catalog_by_page.setdefault(int(p), []).append(c)

    # If rubric_json didn't have page numbers but marking_scheme_text does, enrich catalog
    if not has_page_coding and marking_scheme_text:
        text_catalog = parse_marking_scheme_structure(marking_scheme_text)
        text_page_map = {re.sub(r"[\(\)\s]", "", str(t.get("question_no", ""))).lower(): t.get("page_number") for t in text_catalog if t.get("page_number") is not None}
        for c in catalog:
            clean_c = re.sub(r"[\(\)\s]", "", str(c.get("question_no", ""))).lower()
            if clean_c in text_page_map:
                c["page_number"] = text_page_map[clean_c]
                has_page_coding = True
                catalog_by_page.setdefault(int(c["page_number"]), []).append(c)

    extracted_by_page: Dict[int, List[Dict[str, Any]]] = {}
    for q in extracted_qs:
        p = int(q.get("page_number", 1) or 1)
        extracted_by_page.setdefault(p, []).append(q)

    aligned = []

    if has_page_coding:
        all_pages = sorted(set(list(catalog_by_page.keys()) + list(extracted_by_page.keys())))
        for p in all_pages:
            p_catalog = catalog_by_page.get(p, [])
            p_extracted = extracted_by_page.get(p, [])
            
            if not p_catalog:
                aligned.extend(p_extracted)
                continue

            p_scheme_dict = {str(c.get('question_no', '')).strip().lower(): c for c in p_catalog}
            p_clean_dict = {re.sub(r"[\(\)\s]", "", str(c.get('question_no', ''))).lower(): c for c in p_catalog}
            matched_catalog_indices = set()

            for idx, raw_q in enumerate(p_extracted):
                raw_no = str(raw_q.get("question_no", "")).strip().lower()
                clean_raw = re.sub(r"[\(\)\s]", "", raw_no)
                stripped = re.sub(r"^(?:question|q|part)\s*", "", raw_no).strip()
                clean_stripped = re.sub(r"[\(\)\s]", "", stripped)
                matched = None
                matched_cand_idx = None

                # 1. Exact match in page catalog (only if not already claimed)
                cand = None
                if raw_no in p_scheme_dict and p_catalog.index(p_scheme_dict[raw_no]) not in matched_catalog_indices:
                    cand = p_scheme_dict[raw_no]
                elif clean_raw in p_clean_dict and p_catalog.index(p_clean_dict[clean_raw]) not in matched_catalog_indices:
                    cand = p_clean_dict[clean_raw]
                elif stripped in p_scheme_dict and p_catalog.index(p_scheme_dict[stripped]) not in matched_catalog_indices:
                    cand = p_scheme_dict[stripped]
                elif clean_stripped in p_clean_dict and p_catalog.index(p_clean_dict[clean_stripped]) not in matched_catalog_indices:
                    cand = p_clean_dict[clean_stripped]
                elif stripped.startswith("(") and stripped.endswith(")"):
                    cands = [c for c in p_catalog if str(c.get('question_no', '')).strip().lower().endswith(stripped) and p_catalog.index(c) not in matched_catalog_indices]
                    if cands:
                        cand = cands[0]

                if cand:
                    matched = cand
                    matched_cand_idx = p_catalog.index(cand)

                # 2. Positional match on this page if not directly matched
                if not matched:
                    available = [i for i in range(len(p_catalog)) if i not in matched_catalog_indices]
                    if available:
                        target_idx = idx if idx in available else available[0]
                        matched = p_catalog[target_idx]
                        matched_cand_idx = target_idx

                if matched and matched_cand_idx is not None:
                    matched_catalog_indices.add(matched_cand_idx)
                    final_q_no = str(matched.get("question_no", raw_q.get("question_no")))
                    final_title = matched.get("question_title", f"Question {final_q_no}")
                    final_max = float(matched.get("max_marks", default_max_marks))
                    raw_crits = matched.get("criteria", [])
                    crit_list = [
                        {
                            "criterion": str(c.get("criterion", "Criterion")),
                            "max": float(c.get("max", 1.0)),
                            "awarded": 0.0,
                            "comment": str(c.get("description", ""))
                        }
                        for c in raw_crits if isinstance(c, dict)
                    ] if raw_crits else raw_q.get("criteria", [])

                    aligned.append({
                        **raw_q,
                        "question_no": final_q_no,
                        "question_title": final_title,
                        "max_marks": final_max,
                        "page_number": p,
                        "awarded_marks": float(raw_q.get("awarded_marks", 0.0)),
                        "extracted_answer": raw_q.get("extracted_answer", ""),
                        "criteria": crit_list,
                        "feedback_comment": raw_q.get("feedback_comment", "")
                    })

            # Populate any questions from this page's catalog that were not answered/extracted
            for c_idx, c in enumerate(p_catalog):
                if c_idx not in matched_catalog_indices:
                    final_q_no = str(c.get("question_no"))
                    final_title = c.get("question_title", f"Question {final_q_no}")
                    final_max = float(c.get("max_marks", default_max_marks))
                    raw_crits = c.get("criteria", [])
                    crit_list = [
                        {
                            "criterion": str(cr.get("criterion", "Criterion")),
                            "max": float(cr.get("max", 1.0)),
                            "awarded": 0.0,
                            "comment": str(cr.get("description", ""))
                        }
                        for cr in raw_crits if isinstance(cr, dict)
                    ]
                    slot_h = min(220, max(75, int(680 / max(1, len(p_catalog)))))
                    base_y = min(880, 240 + (c_idx * slot_h))
                    unanswered_bbox = c.get("bbox_2d") or [base_y, 120, min(960, base_y + max(40, int(slot_h * 0.45))), 860]

                    aligned.append({
                        "question_no": final_q_no,
                        "question_title": final_title,
                        "max_marks": final_max,
                        "page_number": p,
                        "awarded_marks": 0.0,
                        "extracted_answer": "[Blank / No response]",
                        "criteria": crit_list,
                        "feedback_comment": f"No marks awarded (0/{final_max}). Question left blank.",
                        "bbox_2d": unanswered_bbox
                    })
        return aligned

    # Fallback to global matching if no page coding in scheme
    scheme_dict = {str(q.get('question_no', '')).strip().lower(): q for q in catalog}
    for idx, raw_q in enumerate(extracted_qs):
        q_no = str(raw_q.get("question_no", "")).strip()
        raw_clean = q_no.lower()
        matched = None
        
        if raw_clean in scheme_dict:
            matched = scheme_dict[raw_clean]
        else:
            stripped = re.sub(r"^(?:question|q|part)\s*", "", raw_clean).strip()
            if stripped in scheme_dict:
                matched = scheme_dict[stripped]
            elif stripped.startswith("(") and stripped.endswith(")"):
                candidates = [c for c in catalog if str(c.get('question_no', '')).strip().lower().endswith(stripped)]
                if len(candidates) == 1:
                    matched = candidates[0]
                elif len(candidates) > 1:
                    pos_ratio = idx / max(1, len(extracted_qs))
                    cand_idx = int(pos_ratio * len(catalog))
                    cand_idx = max(0, min(len(catalog) - 1, cand_idx))
                    best_cand = min(candidates, key=lambda c: abs(catalog.index(c) - cand_idx))
                    matched = best_cand
            else:
                for cand in catalog:
                    c_no = str(cand.get('question_no', '')).strip().lower()
                    if c_no == stripped or stripped in c_no:
                        matched = cand
                        break

        if matched:
            final_q_no = str(matched.get("question_no", q_no))
            final_title = matched.get("question_title", f"Question {final_q_no}")
            final_max = float(matched.get("max_marks", default_max_marks))
            raw_crits = matched.get("criteria", [])
            crit_list = [
                {
                    "criterion": str(c.get("criterion", "Criterion")),
                    "max": float(c.get("max", 1.0)),
                    "awarded": 0.0,
                    "comment": str(c.get("description", ""))
                }
                for c in raw_crits if isinstance(c, dict)
            ] if raw_crits else raw_q.get("criteria", [])
        else:
            final_q_no = q_no or f"Q{idx+1}"
            final_title = raw_q.get("question_title", f"Question {final_q_no}")
            final_max = float(raw_q.get("max_marks", default_max_marks))
            if final_max == 5.0 and default_max_marks != 5.0:
                final_max = default_max_marks
            crit_list = raw_q.get("criteria", [])
            record_fallback(
                source="Question Catalog Alignment",
                trigger=f"Question '{q_no}' not matched in marking scheme catalog",
                action=f"Retained extracted question with default max marks ({final_max})",
                details=f"Assigned title: '{final_title}'"
            )
                
        aligned.append({
            **raw_q,
            "question_no": final_q_no,
            "question_title": final_title,
            "max_marks": final_max,
            "awarded_marks": float(raw_q.get("awarded_marks", 0.0)),
            "extracted_answer": raw_q.get("extracted_answer", ""),
            "criteria": crit_list,
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
    Step 1A: Vision AI extracts and transcribes the student's handwritten responses page-by-page.
    Delegates to the selected/auto-detected subject marker.
    """
    from app.markers.registry import get_marker
    marker_type = assignment_info.get("marker_type")
    marker = get_marker(marker_type, assignment_info.get("subject", ""), assignment_info.get("title", ""))
    return marker.extract_student_responses(
        assignment_info=assignment_info,
        student_info=student_info,
        pages=pages,
        vision_model=vision_model
    )

def mark_single_question(
    q: Dict[str, Any],
    assignment_info: Dict[str, Any],
    student_info: Dict[str, Any],
    reasoning_model: str = DEFAULT_TEXT_MODEL
) -> Dict[str, Any]:
    """
    Evaluates a single student question against the marking scheme using the subject marker.
    """
    from app.markers.registry import get_marker
    marker_type = assignment_info.get("marker_type")
    marker = get_marker(marker_type, assignment_info.get("subject", ""), assignment_info.get("title", ""))
    return marker.mark_single_question(
        q=q,
        assignment_info=assignment_info,
        student_info=student_info,
        reasoning_model=reasoning_model
    )

def step1b_mark_extracted_questions(
    assignment_info: Dict[str, Any],
    student_info: Dict[str, Any],
    questions: List[Dict[str, Any]],
    reasoning_model: str = DEFAULT_TEXT_MODEL
) -> Dict[str, Any]:
    """
    Step 1B: Evaluates questions against the marking scheme using the subject marker.
    """
    from app.markers.registry import get_marker
    marker_type = assignment_info.get("marker_type")
    marker = get_marker(marker_type, assignment_info.get("subject", ""), assignment_info.get("title", ""))
    return marker.mark_questions(
        questions=questions,
        assignment_info=assignment_info,
        student_info=student_info,
        reasoning_model=reasoning_model
    )

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
    Step 2: Synthesizes personalized overall remarks, key strengths,
    and actionable improvement areas using the subject marker.
    """
    from app.markers.registry import get_marker
    marker_type = assignment_info.get("marker_type")
    marker = get_marker(marker_type, assignment_info.get("subject", ""), assignment_info.get("title", ""))
    return marker.synthesize_feedback(
        questions=questions,
        assignment_info=assignment_info,
        student_info=student_info,
        reasoning_model=reasoning_model
    )

def step2_mark_and_comment(
    assignment_info: Dict[str, Any],
    student_info: Dict[str, Any],
    questions: List[Dict[str, Any]],
    reasoning_model: str = DEFAULT_TEXT_MODEL
) -> Dict[str, Any]:
    """
    Step 2: Evaluates questions and synthesizes overall remarks, strengths, and improvements.
    """
    mark_res = step1b_mark_extracted_questions(
        assignment_info=assignment_info,
        student_info=student_info,
        questions=questions,
        reasoning_model=reasoning_model
    )
    if not mark_res.get("success"):
        return mark_res
        
    scored_questions = mark_res.get("questions", questions)
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
        "in_situ_remarks": mark_res.get("in_situ_remarks", []),
        "student_edits": mark_res.get("student_edits", []),
        "total_score": mark_res["total_score"],
        "max_marks": mark_res["max_marks"],
        "percentage": mark_res["percentage"],
        "grade_letter": mark_res["grade_letter"],
        "overall_feedback": eval_res.get("overall_feedback", "") or mark_res.get("overall_feedback", ""),
        "strengths_feedback": eval_res.get("strengths_feedback", "") or mark_res.get("strengths_feedback", ""),
        "improvement_feedback": eval_res.get("improvement_feedback", "") or mark_res.get("improvement_feedback", ""),
        "ai_model_used": reasoning_model
    }

def grade_essay_submission_holistically(
    assignment_info: Dict[str, Any],
    student_info: Dict[str, Any],
    pages: List[Dict[str, Any]],
    vision_model: str = DEFAULT_VISION_MODEL,
    reasoning_model: str = DEFAULT_TEXT_MODEL
) -> Dict[str, Any]:
    from app.markers.chinese_essay import ChineseEssayMarker
    marker = ChineseEssayMarker()
    return marker.grade_submission(
        assignment_info=assignment_info,
        student_info=student_info,
        pages=pages,
        vision_model=vision_model,
        reasoning_model=reasoning_model
    )

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
    Delegates to the configured subject marker.
    """
    effective_reasoning = reasoning_model or DEFAULT_TEXT_MODEL
    from app.markers.registry import get_marker
    marker_type = assignment_info.get("marker_type")
    marker = get_marker(marker_type, assignment_info.get("subject", ""), assignment_info.get("title", ""))
    return marker.grade_submission(
        assignment_info=assignment_info,
        student_info=student_info,
        pages=pages,
        vision_model=vision_model,
        reasoning_model=effective_reasoning,
        use_two_stage=use_two_stage
    )

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
                    "Carefully inspect the handwritten letters for the student name, especially joined or cursive handwriting (e.g., 'r', 's', 'sh', 'u', 'n', 'v'). "
                    "Transcribe the name accurately as written. "
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
        record_fallback(
            source="Identity Extraction",
            trigger="Student name could not be detected from scan or filename",
            action="Generated default placeholder student name",
            details=f"Assigned name: '{inferred_name}'"
        )
    if not inferred_id:
        import time
        inferred_id = f"STU-{int(time.time()*1000) % 10000:04d}"
        record_fallback(
            source="Identity Extraction",
            trigger="Candidate ID not detected on scan cover",
            action="Generated temporary candidate ID",
            details=f"Assigned ID: '{inferred_id}'"
        )

    return {
        "name": inferred_name,
        "student_id": inferred_id,
        "class_name": inferred_class or default_class or "General"
    }

