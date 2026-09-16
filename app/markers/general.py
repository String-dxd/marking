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
    resolve_question_continuity_across_pages
)
from app.core.fallback_tracker import record_fallback

GENERAL_DIRECT_MARKING_VISION_PROMPT = """You are a teacher marking a student's scanned handwritten script using a RED PEN.

Subject: {subject}
Assignment: {assignment_title}
Total Marks: {max_marks}

MARKING SCHEME:
----------------------------------------
{marking_scheme}
----------------------------------------

MARKING RULES:
1. TICKS ("tick"):
   - Draw a tick IMMEDIATELY after each correct answer, phrase, or working step.
   - bbox_2d tightly surrounds ONLY that correct word or expression.
   - "score": points awarded, e.g. "1".
2. CROSSES ("cross"):
   - Draw a cross IMMEDIATELY after each wrong answer or step.
   - bbox_2d tightly surrounds the wrong phrase.
   - "score": "0".
3. CIRCLES ("circle"):
   - Circle specific erroneous words, numbers, or units.
   - "remark": very short teacher note (<=6 words), e.g. "calculation error", "missing step".
4. BLANK ANSWERS:
   - Place a single cross centered in blank answer space with score "0".

IMPORTANT:
- bbox_2d = [ymin, xmin, ymax, xmax] on an absolute 0..1000 scale.
- Populate "evidence" with the exact snippet from the image.

Return STRICTLY this JSON:
{{
  "page_annotations": [
    {{
      "evidence": "answer snippet",
      "type": "tick",
      "bbox_2d": [320, 140, 350, 200],
      "score": "1",
      "remark": ""
    }}
  ]
}}
"""

class GeneralMarker(BaseSubjectMarker):
    marker_id = "general"
    name = "General / Standard Marker"
    description = "Lightweight marker with minimal context size for standard assignments, worksheets, and general question-and-answer papers."

    def extract_student_responses(
        self,
        assignment_info: Dict[str, Any],
        student_info: Dict[str, Any],
        pages: List[Dict[str, Any]],
        vision_model: str = DEFAULT_VISION_MODEL
    ) -> Dict[str, Any]:
        max_marks = float(assignment_info.get("max_marks", 100.0) or 100.0)
        if not pages:
            return {"success": False, "error": "No page images available for extraction."}

        all_extracted_questions = []

        for p_idx, p in enumerate(pages, 1):
            img_path = p.get("image_path")
            if not img_path:
                continue

            b64 = get_page_base64(img_path)
            prompt = f"""Extract student handwriting from Page {p_idx} of {len(pages)}. Ignore pre-printed text.
For each question, output:
Question <No>: <Handwritten Answer> [bbox: ymin, xmin, ymax, xmax]
If blank, write: Question <No>: [Blank / No response]
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
                    "max_marks": float(q.get("max_marks", 1.0)),
                    "awarded_marks": 0.0,
                    "extracted_answer": str(ans),
                    "criteria": [],
                    "feedback_comment": "",
                    "page_number": int(q.get("page_number", p_idx) or p_idx),
                    "bbox_2d": q.get("bbox_2d")
                })

        # Resolve cross-page continuity for questions flowing across page breaks
        marking_scheme = assignment_info.get("marking_scheme_text", "")
        all_extracted_questions = resolve_question_continuity_across_pages(
            all_extracted_questions,
            marking_scheme_text=marking_scheme
        )

        if not all_extracted_questions:
            all_extracted_questions = [{
                "question_no": "1",
                "question_title": "Student Submission",
                "max_marks": max_marks,
                "awarded_marks": 0.0,
                "extracted_answer": "[Blank / No handwriting detected]",
                "criteria": [],
                "feedback_comment": "",
                "page_number": 1,
                "bbox_2d": [180, 100, 850, 900]
            }]

        return {
            "success": True,
            "step": "1A",
            "questions": all_extracted_questions,
            "total_score": 0.0,
            "max_marks": sum(float(q.get("max_marks", 0)) for q in all_extracted_questions) or max_marks,
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
        q_max = float(q.get("max_marks", 1.0))
        extracted = str(q.get("extracted_answer", "")).strip()

        assignment_title = assignment_info.get("title", "Assignment")
        subject = assignment_info.get("subject", "General")
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

        from app.core.marker_engine import extract_question_rubric_slice
        sliced_rubric = extract_question_rubric_slice(
            marking_scheme_text=marking_scheme,
            question_no=q_no,
            rubric_json=assignment_info.get("rubric_json")
        )
        effective_scheme = sliced_rubric if sliced_rubric else marking_scheme

        # Lean question prompt with zero graph/domain bloat
        prompt = f"""You are a teacher evaluating Question {q_no}.

Subject: {subject}
Assignment: {assignment_title}
Question: {q_no} - {q_title}
Maximum Marks: {q_max}

OFFICIAL MARKING SCHEME & RUBRIC:
----------------------------------------
{effective_scheme}
----------------------------------------

STUDENT EXTRACTED ANSWER FOR QUESTION {q_no}:
----------------------------------------
{extracted}
----------------------------------------

GRADING INSTRUCTIONS:
1. Determine exact awarded_marks (0.0 to {q_max}) based on the marking scheme.
2. Provide a concise feedback comment ("✓ Correct. [reason]" or "✗ Error: [mistake]. Expected: [expected]").
3. Return STRICTLY valid JSON.

JSON FORMAT:
{{
  "awarded_marks": {q_max},
  "criteria": [
    {{"criterion": "Accuracy", "max": {q_max}, "awarded": {q_max}, "comment": "✓ Matches marking scheme."}}
  ],
  "feedback_comment": "✓ Correct. Matches expected answer."
}}
"""
        result = ollama_client.generate_chat(
            model=reasoning_model,
            messages=[{"role": "user", "content": prompt}],
            format_json=True,
            temperature=0.1,
            timeout=90,
            num_ctx=DEFAULT_GRADING_NUM_CTX,
            num_predict=1000,
            reasoning_effort="none"
        )

        awarded = 0.0
        criteria = []
        comment = ""

        if not result.get("success"):
            err_msg = result.get("error", "Unknown model error")
            record_fallback(
                source="General Question Evaluator",
                trigger=f"Question {q_no} evaluation model failed: {err_msg}",
                action="Flagged question evaluation error for retry",
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
            if "criteria" in q_data and isinstance(q_data["criteria"], list):
                criteria = q_data["criteria"]
            if "feedback_comment" in q_data:
                comment = str(q_data["feedback_comment"]).strip()

        if criteria and awarded == 0.0:
            sum_c = sum(float(c.get("awarded", 0.0)) for c in criteria)
            if sum_c > 0.0:
                awarded = min(sum_c, q_max)

        if not comment:
            if awarded >= q_max:
                comment = f"✓ Correct ({awarded}/{q_max} marks). Matches marking scheme."
            elif awarded > 0:
                comment = f"✗ Partial credit ({awarded}/{q_max} marks)."
            else:
                comment = f"✗ Incorrect (0/{q_max} marks)."

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
        student_name = student_info.get("name", "Student")
        computed_awarded = sum(float(q.get("awarded_marks", 0.0)) for q in questions)
        computed_max = sum(float(q.get("max_marks", 0.0)) for q in questions) or 100.0
        pct = round((computed_awarded / computed_max * 100.0), 1) if computed_max > 0 else 0.0
        grade = compute_grade_letter(pct)

        overall = f"Dear {student_name}, you scored {computed_awarded}/{computed_max} marks ({pct}%, Grade {grade}) on {assignment_title}. Review the question-level remarks to consolidate your learning."
        strengths = "• Clear handwriting and presentation\n• Solid effort across questions"
        improvements = "• Review questions with marks deducted to understand expected steps\n• Double check working before submission"
        record_fallback(
            source="Feedback Synthesis",
            trigger="General marker generated standardized feedback",
            action="Applied structured feedback template",
            details=f"Score: {computed_awarded}/{computed_max}"
        )

        return {
            "success": True,
            "overall_feedback": overall,
            "strengths_feedback": strengths,
            "improvement_feedback": improvements,
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
        subject = submission.get("assignment_subject", "General")
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
