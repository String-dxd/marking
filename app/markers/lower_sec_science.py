import re
import json
from pathlib import Path
from typing import List, Dict, Any, Optional

from app.markers.base import BaseSubjectMarker
from app.core.config import DEFAULT_VISION_MODEL, DEFAULT_TEXT_MODEL, DEFAULT_OCR_NUM_CTX, DEFAULT_GRADING_NUM_CTX
from app.core.ollama_client import ollama_client
from app.core.pdf_processor import get_page_base64
from app.core.marker_engine import (
    clean_and_parse_json,
    parse_questions_from_ocr_text,
    compute_grade_letter,
    resolve_question_continuity_across_pages,
    parse_marking_scheme_structure,
    align_extracted_questions_with_scheme,
    get_effective_max_marks
)
from app.core.fallback_tracker import record_fallback

SCIENCE_GRAPH_EVALUATION_GUIDANCE = """
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

SCIENCE_DIRECT_MARKING_VISION_PROMPT = """You are a teacher marking a student's scanned handwritten script using a RED PEN.

Subject: {subject}
Assignment: {assignment_title}
Total Marks: {max_marks}

MARKING SCHEME:
----------------------------------------
{marking_scheme}
----------------------------------------

MARKING RULES — follow exactly:

TICKS ("tick"):
  - Draw a tick IMMEDIATELY after the correct word, phrase, or working step.
  - bbox_2d must tightly surround ONLY that correct word or expression (not the whole line).
  - "score" field: write the marks awarded for that point, e.g. "1" or "2/3" (leave blank if not applicable).
  - "remark": leave blank for ticks (EXCEPT when creating a graph checklist).

CROSSES ("cross"):
  - Draw a cross IMMEDIATELY after the wrong word, phrase, or step.
  - bbox_2d must tightly surround ONLY that wrong word or expression.
  - "score": marks lost or zero, e.g. "0".
  - "remark": leave blank (EXCEPT when creating a graph checklist).

CIRCLES ("circle"):
  - Circle the SPECIFIC erroneous word, number, unit, or symbol.
  - bbox_2d must be as tight as possible around ONLY that element.
  - "remark": write a very short teacher note (<=8 words) directly describing the mistake, e.g. "wrong unit", "sign error", "missing denominator". No question numbers. No prefix labels.

TABLES & MULTI-COLUMN DATA:
  - When marking a table with multiple fill-in columns (e.g. Column 2 "Suitable instrument" AND Column 3 "Suitable unit"):
    * You MUST evaluate and place annotations (ticks/crosses) on EVERY filled column independently!
    * You MUST place a tick mark on the student's entry in Column 2 (e.g. "Ruler", "Balance", "Thermometer", "Measuring cylinder") AND ALSO place a tick mark on the student's entry in Column 3 ("Suitable unit", e.g. "m", "g", "°c", "mL").
    * Do NOT skip or omit the third column (units column)! Every correct cell across all columns gets its own tick.

GRAPHS:
  - If marking a graph or drawing, do NOT scatter individual ticks or crosses over the image.
  - Create a vertical checklist in an empty white space near the top or side of the graph.
  - For each grading criterion, generate an individual annotation of type "tick" (if met) or "cross" (if not met).
  - Use the "remark" field to state the criterion name (e.g., "Axes labelled", "Correct scale", "Points plotted", "Line of best fit").
  - Stack their bbox_2d coordinates vertically so they form a neat list.
  - CRITICAL RULER REQUIREMENT FOR LINE OF BEST FIT:
    * In science examinations, a "straight line of best fit" STRICTLY REQUIRES a ruler-drawn straight line.
    * Scrutinize the student's drawn line on the grid very carefully: if the line is hand drawn, freehand, wavy, curved, sagging between points, or drawn without a ruler (connecting dot-to-dot), it CANNOT be awarded a mark!
    * For hand-drawn or non-ruler lines: You MUST output a "cross" with score "0" and remark "Line of best fit (hand drawn, no ruler)". Do NOT award a tick.
  - IN ADDITION to the checklist, if there are any WRONGLY plotted points, create an annotation of type "circle" tightly around each wrongly plotted point (use very tight coordinate tolerance).

BLANK ANSWERS:
  - If a question or answer space is left completely blank, place a SINGLE "cross" centered in the empty space.
  - "score": "0".
  - "remark": "".

SCORING at the margin:
  - For any tick or cross where marks are awarded/deducted, populate the "score" field.
  - Do NOT embed the score inside the remark text.

IMPORTANT: 
- bbox_2d = [ymin, xmin, ymax, xmax] on an absolute 0..1000 scale for the current page.
- Do NOT guess or increment coordinates sequentially. Treat every bounding box independently based purely on visual location.
- Bounding boxes must NOT span the full line width. Tightly surround the specific word or symbol.
- Populate the "evidence" field with the exact text snippet from the image you are pointing to.

Return STRICTLY this JSON:
{{
  "page_annotations": [
    {{
      "evidence": "3 - 1 = 2",
      "type": "tick",
      "bbox_2d": [320, 142, 345, 198],
      "score": "1",
      "remark": ""
    }},
    {{
      "evidence": "m",
      "type": "tick",
      "bbox_2d": [515, 720, 535, 750],
      "score": "",
      "remark": ""
    }},
    {{
      "evidence": "graph grid",
      "type": "tick",
      "bbox_2d": [550, 700, 580, 950],
      "score": "1",
      "remark": "Axes labelled"
    }},
    {{
      "evidence": "graph grid",
      "type": "cross",
      "bbox_2d": [580, 700, 610, 950],
      "score": "0",
      "remark": "Line of best fit (hand drawn, no ruler)"
    }}
  ]
}}
"""

class LowerSecScienceMarker(BaseSubjectMarker):
    marker_id = "lower_sec_science"
    name = "Lower Secondary Science Marker"
    description = "Specialized for science structured questions, data tables, graph plotting with coordinate checks, and experimental setups."

    def extract_student_responses(
        self,
        assignment_info: Dict[str, Any],
        student_info: Dict[str, Any],
        pages: List[Dict[str, Any]],
        vision_model: str = DEFAULT_VISION_MODEL
    ) -> Dict[str, Any]:
        assignment_title = assignment_info.get("title", "Assignment")
        subject = assignment_info.get("subject", "Science")
        max_marks = float(assignment_info.get("max_marks", 100.0) or 100.0)
        marking_scheme = assignment_info.get("marking_scheme_text", "")

        known_ms_questions = parse_marking_scheme_structure(marking_scheme) if marking_scheme else []
        ms_outline = ""
        if known_ms_questions:
            q_list_str = ", ".join(q["question_no"] for q in known_ms_questions[:25])
            if len(known_ms_questions) > 25:
                q_list_str += f", ... (total {len(known_ms_questions)} questions)"
            ms_outline = f"\nEXAM QUESTIONS OUTLINE FROM RUBRIC:\n{q_list_str}\n"

        effective_max = get_effective_max_marks(
            marking_scheme_text=marking_scheme,
            rubric_json=assignment_info.get("rubric_json"),
            default_max=max_marks
        )

        if not pages:
            return {"success": False, "error": "No page images available for extraction."}

        all_extracted_questions = []

        for p_idx, p in enumerate(pages, 1):
            img_path = p.get("image_path")
            if not img_path:
                continue

            b64 = get_page_base64(img_path)

            # Page coding: Provide questions specifically expected on this physical page
            p_ms_questions = [q for q in known_ms_questions if q.get("page_number") == p_idx]
            if p_ms_questions:
                q_expected_lines = [f"- {q['question_no']} ({q.get('max_marks', 1)}m): {q.get('question_title', '')}" for q in p_ms_questions]
                page_ms_outline = (
                    f"\nPAGE {p_idx} EXPECTED QUESTIONS FROM RUBRIC:\n"
                    + "\n".join(q_expected_lines) + "\n"
                    + f"NOTE ON NUMBERING: The printed worksheet on this page may reset question numbers "
                    f"(e.g. 1, 2, 3, or (a), (b)). Map them to the expected questions above ({', '.join(q['question_no'] for q in p_ms_questions)}) when outputting Question <No>.\n"
                )
            else:
                page_ms_outline = ms_outline

            # Context from previous pages to maintain question number continuity across page breaks
            prev_context = ""
            if all_extracted_questions and not p_ms_questions:
                last_q_no = all_extracted_questions[-1].get("question_no", "")
                m_parent = re.match(r"^(?:Question|Q|Part)?\s*([0-9]+)", str(last_q_no), re.IGNORECASE)
                parent_num = m_parent.group(1) if m_parent else None
                if parent_num:
                    prev_context = (
                        f"\nCONTEXT FROM PREVIOUS PAGES:\n"
                        f"- The previous page concluded around Question {last_q_no}.\n"
                        f"- CONTINUATION RULE: If this Page {p_idx} continues sub-parts from Question {parent_num} "
                        f"(e.g. parts (c), (d), or Roman numerals (i), (ii)) without a printed 'Question {parent_num}' header, "
                        f"YOU MUST label them with their full question number: 'Question {parent_num}(c)', 'Question {parent_num}(d)'. "
                        f"Do NOT omit the main question number {parent_num}!\n"
                    )

            prompt = f"""Extract student handwriting from Page {p_idx} of {len(pages)}.
{prev_context}{page_ms_outline}
CRITICAL RULES:
1. ONLY transcribe HANDWRITTEN student answers. Ignore all pre-printed question text.
2. STRICT GRID FIDELITY FOR GRAPHS (NEVER COPY FROM PRINTED DATA TABLES):
   - Look directly at the student's physical handwritten axis numbers on the grid.
     * If the student wrote '1, 2, 3, 4, 5' on the vertical axis instead of tens, transcribe Y-axis scale as '1, 2, 3, 4, 5'.
   - Read the EXACT visual coordinates where each hand-drawn cross 'x' or dot was physically marked on the grid.
     * Do NOT copy the table's expected numbers (e.g. 24, 30, 36). Transcribe the actual grid intersections marked (e.g. (1, 2), (2, 3), (3, 3.6)...).
     * If the student omitted a data point (e.g. t=0) or started the line from origin (0,0), explicitly note it.
   - STRICT RULER VS HAND-DRAWN INSPECTION:
     * Zoom in and trace the drawn line between each data point.
     * If the line is wavy, curved, sagging between points, or drawn freehand without a ruler, you MUST explicitly state: 'Hand-drawn freehand line without a ruler (NOT drawn with a ruler); curved/wobbly between points, not a straight line'.
     * ONLY describe as 'drawn with a ruler' if it is a single, mathematically straight ruler-drawn line with zero wobbles or curvature throughout.
   - Transcribe graph format strictly as:
     Question <No>: [Graph: X-axis="<Label & Unit>" (Scale: <Handwritten Scale>), Y-axis="<Label & Unit>" (Scale: <Handwritten Scale>), Plotted Points: [(x1, y1), (x2, y2)...] (Total N points), Line: "<Detailed description: CAREFULLY TRACE the line between each point. Explicitly note if drawn with a ruler or hand-drawn freehand, if straight or curved/wobbly, and if it passes through origin (0,0)>"]
3. TABULAR DATA:
   - Transcribe student filled-in cells row-by-row into:
     Question <No>: [Table: Header=["<Col1>", "<Col2>", ...], Rows=[["<Val1>", "<Val2>", ...], ...]]
4. FILL-IN-THE-BLANKS & MEASUREMENTS:
   - Extract the exact handwritten value and unit.
5. If blank, write: Question <No>: [Blank / No response]
6. SPATIAL BOUNDING BOX (0..1000 coordinate scale):
   - For each question, capture the bounding box of the student's answer or the designated answer space/fill-in box: [bbox: ymin, xmin, ymax, xmax].
   - If the question is blank or unfilled, bound the designated printed answer area or diagram box space (NEVER bound the document header table).

Output format strictly:
Question <No>: <Answer> [bbox: ymin, xmin, ymax, xmax]
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
                page_content = res.get("content", "").strip() if res.get("success") else "[Page extraction error / timeout]"
                p_qs = [{
                    "question_no": f"Page {p_idx}",
                    "question_title": f"Page {p_idx} Workings & Responses",
                    "extracted_answer": page_content or "[Blank / No handwriting detected]",
                    "page_number": p_idx,
                    "bbox_2d": [180, 100, 850, 900]
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
                    "page_number": int(q.get("page_number", p_idx) or p_idx),
                    "bbox_2d": q.get("bbox_2d")
                })

        # Resolve question continuity across pages (e.g. Q5(a), Q5(b) on page 6, (c), (d) on page 7 -> 5(c), 5(d))
        all_extracted_questions = resolve_question_continuity_across_pages(
            all_extracted_questions,
            marking_scheme_text=marking_scheme
        )

        # Align with Page Coding
        all_extracted_questions = align_extracted_questions_with_scheme(
            extracted_qs=all_extracted_questions,
            marking_scheme_text=marking_scheme,
            default_max_marks=effective_max / max(len(all_extracted_questions), 1),
            rubric_json=assignment_info.get("rubric_json")
        )

        if not all_extracted_questions:
            all_extracted_questions = [{
                "question_no": "1",
                "question_title": "Student Submission",
                "max_marks": effective_max,
                "awarded_marks": 0.0,
                "extracted_answer": "[Blank / No handwriting detected]",
                "criteria": [],
                "feedback_comment": "",
                "page_number": 1,
                "bbox_2d": [180, 100, 850, 900]
            }]

        computed_max = sum(float(q.get("max_marks", 0)) for q in all_extracted_questions) or effective_max
        return {
            "success": True,
            "step": "1A",
            "questions": all_extracted_questions,
            "total_score": 0.0,
            "max_marks": computed_max,
            "percentage": 0.0,
            "grade_letter": "--",
            "ai_model_used": vision_model,
            "marker_used": self.marker_id
        }

    def mark_single_question(
        self,
        q: Dict[str, Any],
        assignment_info: Dict[str, Any],
        student_info: Dict[str, Any],
        reasoning_model: str = DEFAULT_TEXT_MODEL
    ) -> Dict[str, Any]:
        q_no = str(q.get("question_no", "1")).strip()
        q_title = str(q.get("question_title", f"Question {q_no}")).strip()
        q_max = float(q.get("max_marks", 5.0))
        extracted = str(q.get("extracted_answer", "")).strip()

        assignment_title = assignment_info.get("title", "Assignment")
        subject = assignment_info.get("subject", "Science")
        marking_scheme = assignment_info.get("marking_scheme_text", "")

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

        q_aliases = [q_no, f"Question {q_no}", f"Q{q_no}"]
        no_parens = re.sub(r"[\(\)]", "", q_no)
        if no_parens != q_no:
            q_aliases.extend([no_parens, f"Question {no_parens}", f"Q{no_parens}"])
        # If an isolated subpart like '(c)' was passed, search for any parent question matching it in marking scheme
        if q_no.startswith("(") and q_no.endswith(")"):
            m_any_parent = re.search(rf"(?:Question|Q|Part)?\s*([0-9]+{re.escape(q_no)})\s*\(([0-9]+(?:\.[0-9]+)?)\s*marks?\)", marking_scheme, re.IGNORECASE)
            if m_any_parent:
                q_aliases.append(m_any_parent.group(1))
                q_aliases.append(f"Question {m_any_parent.group(1)}")
                q_aliases.append(f"Q{m_any_parent.group(1)}")

        for alias in q_aliases:
            m = re.search(rf"(?:Question|Q|Part)?\s*{re.escape(alias)}\s*\(([0-9]+(?:\.[0-9]+)?)\s*marks?\)", marking_scheme, re.IGNORECASE)
            if m:
                try:
                    q_max = float(m.group(1))
                    break
                except Exception:
                    pass

        from app.core.marker_engine import extract_question_rubric_slice
        sliced_rubric = extract_question_rubric_slice(
            marking_scheme_text=marking_scheme,
            question_no=q_no,
            rubric_json=assignment_info.get("rubric_json")
        )
        effective_scheme = sliced_rubric if sliced_rubric else marking_scheme

        # Only inject graph/table guidance if question, rubric, or student answer relates to graphs/tables
        combined_q_text = f"{q_no} {q_title} {extracted} {effective_scheme}".lower()
        graph_keywords = ("graph", "plot", "table", "curve", "axes", "axis", "grid", "chart", "data")
        include_graph_guidance = any(kw in combined_q_text for kw in graph_keywords)
        guidance_text = f"\n{SCIENCE_GRAPH_EVALUATION_GUIDANCE}\n" if include_graph_guidance else ""

        prompt = f"""You are an expert science examiner grading Question {q_no}.

Subject: {subject}
Assignment: {assignment_title}
Question: {q_no} - {q_title}
Maximum Marks: {q_max}

OFFICIAL MARKING SCHEME & RUBRIC:
----------------------------------------
{effective_scheme}
----------------------------------------
{guidance_text}
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
            num_predict=1000,
            reasoning_effort="none"
        )

        awarded = 0.0
        criteria = []
        comment = ""

        if result.get("success"):
            content = result.get("content", "")
            thinking = result.get("thinking", "")
            parsed = clean_and_parse_json(content)
            if not parsed and thinking:
                parsed = clean_and_parse_json(thinking)

            if parsed and isinstance(parsed, dict):
                q_data = parsed["questions"][0] if ("questions" in parsed and isinstance(parsed["questions"], list) and len(parsed["questions"]) > 0) else parsed
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

            combined_text = f"{content}\n{thinking}"
            if combined_text.strip():
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

                if not comment:
                    fb_match = re.search(r"\"feedback_comment\"\s*:\s*\"([^\"]+)\"", combined_text)
                    if fb_match:
                        comment = fb_match.group(1).strip()
                    else:
                        fb_match2 = re.search(r"(?:feedback|comment|reason|rationale)\s*[:=]\s*([^\n\r]+)", combined_text, re.IGNORECASE)
                        if fb_match2:
                            comment = fb_match2.group(1).strip()

                if awarded == 0.0:
                    json_marks = re.search(r"\"awarded_marks\"\s*:\s*([0-9]+(?:\.[0-9]+)?)", combined_text, re.IGNORECASE)
                    if json_marks:
                        try:
                            awarded = min(float(json_marks.group(1)), q_max)
                        except Exception:
                            pass

        if not result.get("success"):
            err_msg = result.get("error", "Unknown model error")
            record_fallback(
                source="Science Question Evaluator",
                trigger=f"Question {q_no} evaluation model failed: {err_msg}",
                action="Marked evaluation error to require retry instead of corrupting score",
                details=f"Question {q_no}"
            )
            return {
                **q,
                "question_no": q_no,
                "question_title": q_title,
                "max_marks": q_max,
                "awarded_marks": 0.0,
                "extracted_answer": extracted,
                "criteria": criteria,
                "evaluation_error": True,
                "evaluation_error_message": err_msg,
                "feedback_comment": f"⚠️ Evaluation incomplete: {err_msg}. Re-run marking required."
            }
        elif not parsed:
            record_fallback(
                source="JSON Parser",
                trigger=f"Question {q_no} evaluation model output was not valid JSON",
                action="Extracted marks & criteria via regex parser fallback",
                details=f"Question {q_no}"
            )

        if criteria and awarded == 0.0:
            sum_c = sum(float(c.get("awarded", 0.0)) for c in criteria)
            if sum_c > 0.0:
                awarded = min(sum_c, q_max)

        if not comment or comment.lower() in ("evaluated by ai.", "criteria not met.", "matches marking scheme."):
            record_fallback(
                source="Feedback Synthesis",
                trigger=f"Question {q_no} lacked descriptive AI feedback",
                action="Synthesized diagnostic remarks from criteria comparison",
                details=f"Question {q_no}: {awarded}/{q_max} marks"
            )
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
                        clean_c = re.sub(r"^[✗✓\s\:\-]+", "", c_comm).strip() if c_comm else "requirement not met"
                        err_details.append(f"{c_name}: {clean_c}")
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

    def synthesize_feedback(
        self,
        questions: List[Dict[str, Any]],
        assignment_info: Dict[str, Any],
        student_info: Dict[str, Any],
        reasoning_model: str = DEFAULT_TEXT_MODEL
    ) -> Dict[str, Any]:
        assignment_title = assignment_info.get("title", "Assignment")
        subject = assignment_info.get("subject", "Science")
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
        prompt = f"""You are an encouraging science teacher writing concise feedback for {student_name}'s science assignment.

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
  "overall_feedback": "Dear {student_name}, solid effort scoring {computed_awarded}/{computed_max} ({pct}%). Review the specific errors highlighted below to master key science concepts.",
  "strengths": [
    "Accurate graph axis scaling",
    "Precise scientific terminology"
  ],
  "areas_for_improvement": [
    "Review Question 2(a): close air-hole before lighting gas",
    "Review Question 1(e): ensure graph line is drawn with ruler"
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
                improvements = parsed_json.get("areas_for_improvement", [])
                if isinstance(improvements, list) and improvements:
                    improvements_text = "\n".join(f"• {s}" for s in improvements if s)

        if not overall:
            record_fallback(
                source="Feedback Synthesis",
                trigger="Model overall remarks synthesis was empty",
                action="Generated template overall remarks",
                details=f"Score: {computed_awarded}/{computed_max}"
            )
            overall = f"Dear {student_name},\n\nYou scored {computed_awarded} / {computed_max} marks ({pct}%, Grade {grade}) on {assignment_title}. Review the question-level remarks and criteria to consolidate your learning."

        if not strengths_text:
            record_fallback(
                source="Feedback Synthesis",
                trigger="Model strengths synthesis was empty",
                action="Derived strengths from top scoring questions"
            )
            top_qs = [q for q in questions if float(q.get("awarded_marks", 0)) > 0]
            if top_qs:
                strengths_text = "\n".join([f"• Solid performance on Question {q.get('question_no')}" for q in top_qs[:2]] + ["• Clear handwriting and systematic working"])
            else:
                strengths_text = "• Good foundational effort attempted\n• Structured response format"

        if not improvements_text:
            record_fallback(
                source="Feedback Synthesis",
                trigger="Model improvement points synthesis was empty",
                action="Derived improvement points from deducted marks"
            )
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

    def generate_direct_annotations(
        self,
        submission: Dict[str, Any],
        pages: List[Dict[str, Any]],
        model: str = DEFAULT_VISION_MODEL,
        use_benchmark_mock: bool = False,
        **kwargs
    ) -> List[Dict[str, Any]]:
        from app.core.direct_marker import ground_question_grades_to_annotations
        from app.core import db

        sub_id = submission.get("id")
        assignment_title = submission.get("assignment_title", "Assignment")
        subject = submission.get("assignment_subject", "Science")
        max_marks = float(submission.get("assignment_max_marks", 100.0) or 100.0)
        marking_scheme = submission.get("marking_scheme_text", "")

        # 1. Check for existing question grades (from Step 1A / Step 1B)
        q_grades = submission.get("question_grades")
        if not q_grades and sub_id:
            full_sub = db.get_submission_by_id(int(sub_id))
            if full_sub:
                q_grades = full_sub.get("question_grades", [])

        # 2. If unparsed/unmarked, run Parse (Stage 1) -> Mark (Stage 2)
        if not q_grades and pages:
            assignment_info = {
                "title": assignment_title,
                "subject": subject,
                "max_marks": max_marks,
                "marking_scheme_text": marking_scheme,
                "marker_type": self.marker_id
            }
            student_info = {
                "name": submission.get("student_name", "Student"),
                "student_id": submission.get("student_code", "")
            }
            grade_res = self.grade_submission(
                assignment_info=assignment_info,
                student_info=student_info,
                pages=pages,
                vision_model=model,
                reasoning_model=DEFAULT_TEXT_MODEL
            )
            if grade_res.get("success") and grade_res.get("questions"):
                q_grades = grade_res["questions"]
                if sub_id:
                    db.save_marking_results(
                        submission_id=int(sub_id),
                        total_score=grade_res.get("total_score", 0.0),
                        percentage=grade_res.get("percentage", 0.0),
                        grade_letter=grade_res.get("grade_letter", "--"),
                        overall_feedback=grade_res.get("overall_feedback", ""),
                        strengths_feedback=grade_res.get("strengths_feedback", ""),
                        improvement_feedback=grade_res.get("improvement_feedback", ""),
                        ai_model=grade_res.get("ai_model_used", model),
                        questions=q_grades
                    )

        # 3. Stage 3: Visual Grounding for Remarks
        if q_grades:
            annotations = ground_question_grades_to_annotations(q_grades, pages, subject=subject, reasoning_model=model)
            if sub_id:
                db.update_submission_annotations(int(sub_id), annotations)
            return annotations

        return []
