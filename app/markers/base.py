from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional

class BaseSubjectMarker(ABC):
    """
    Abstract base class for subject-specific markers.
    Each marker defines its own prompt templates, rubric evaluation logic,
    and direct marking visual annotations, guaranteeing that iterations
    within one marker do not affect others and that context sizes are kept minimal.
    """
    marker_id: str = "base"
    name: str = "Base Marker"
    description: str = "Base marker definition"
    supports_direct_marking: bool = True
    supports_parsed_marking: bool = True

    @abstractmethod
    def extract_student_responses(
        self,
        assignment_info: Dict[str, Any],
        student_info: Dict[str, Any],
        pages: List[Dict[str, Any]],
        vision_model: str
    ) -> Dict[str, Any]:
        """
        Step 1A: Transcribes student handwritten work verbatim from scan images.
        """
        pass

    @abstractmethod
    def mark_single_question(
        self,
        q: Dict[str, Any],
        assignment_info: Dict[str, Any],
        student_info: Dict[str, Any],
        reasoning_model: str
    ) -> Dict[str, Any]:
        """
        Evaluates a single question against the subject-specific rubric.
        """
        pass

    def mark_questions(
        self,
        questions: List[Dict[str, Any]],
        assignment_info: Dict[str, Any],
        student_info: Dict[str, Any],
        reasoning_model: str
    ) -> Dict[str, Any]:
        """
        Step 1B: Evaluates extracted questions against the rubric.
        Default implementation evaluates questions concurrently or sequentially.
        """
        import concurrent.futures
        from app.core.marker_engine import align_extracted_questions_with_scheme, get_effective_max_marks

        max_marks = float(assignment_info.get("max_marks", 100.0) or 100.0)
        if not questions:
            return {"success": False, "error": "No questions to mark."}

        effective_max = get_effective_max_marks(
            marking_scheme_text=assignment_info.get("marking_scheme_text", ""),
            rubric_json=assignment_info.get("rubric_json"),
            default_max=max_marks
        )

        questions = align_extracted_questions_with_scheme(
            extracted_qs=questions,
            marking_scheme_text=assignment_info.get("marking_scheme_text", ""),
            rubric_json=assignment_info.get("rubric_json"),
            default_max_marks=effective_max / max(len(questions), 1)
        )

        from app.core.config import OLLAMA_GRADING_WORKERS
        max_workers_allowed = max(1, OLLAMA_GRADING_WORKERS)
        num_workers = min(len(questions), max_workers_allowed)
        scored_dict = {}

        if num_workers <= 1:
            marked_questions = []
            for q in questions:
                try:
                    res_q = self.mark_single_question(
                        q=q,
                        assignment_info=assignment_info,
                        student_info=student_info,
                        reasoning_model=reasoning_model
                    )
                    marked_questions.append(res_q)
                except Exception as e:
                    marked_questions.append({
                        **q,
                        "awarded_marks": 0.0,
                        "evaluation_error": True,
                        "evaluation_error_message": str(e),
                        "feedback_comment": f"⚠️ Evaluation error: {str(e)}"
                    })
        else:
            with concurrent.futures.ThreadPoolExecutor(max_workers=num_workers) as executor:
                future_to_idx = {
                    executor.submit(
                        self.mark_single_question,
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
                            "evaluation_error": True,
                            "evaluation_error_message": str(e),
                            "feedback_comment": f"⚠️ Evaluation error: {str(e)}"
                        }
            marked_questions = [scored_dict[i] for i in range(len(questions))]

        # Check if evaluation suffered fatal failure across all questions
        failed_qs = [q for q in marked_questions if q.get("evaluation_error")]
        if failed_qs and len(failed_qs) == len(marked_questions):
            return {
                "success": False,
                "step": "1B",
                "error": f"Evaluation failed for all {len(failed_qs)} questions due to model errors: {failed_qs[0].get('evaluation_error_message')}",
                "questions": marked_questions
            }

        from app.core.marker_engine import compute_grade_letter
        computed_awarded = sum(float(q.get("awarded_marks", 0.0)) for q in marked_questions)
        computed_max = sum(float(q.get("max_marks", 0.0)) for q in marked_questions) or effective_max
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
            "ai_model_used": reasoning_model,
            "marker_used": self.marker_id,
            "failed_questions_count": len(failed_qs)
        }

    @abstractmethod
    def synthesize_feedback(
        self,
        questions: List[Dict[str, Any]],
        assignment_info: Dict[str, Any],
        student_info: Dict[str, Any],
        reasoning_model: str
    ) -> Dict[str, Any]:
        """
        Step 2: Synthesizes personalized overall remarks, strengths, and areas for improvement.
        """
        pass

    def grade_submission(
        self,
        assignment_info: Dict[str, Any],
        student_info: Dict[str, Any],
        pages: List[Dict[str, Any]],
        vision_model: str,
        reasoning_model: str,
        use_two_stage: bool = True
    ) -> Dict[str, Any]:
        """
        Complete Full-Auto pipeline: Step 1 (Extract) -> Step 2 (Mark & Comment).
        Can be overridden by specialized markers (e.g. holistic essay grading).
        """
        extract_res = self.extract_student_responses(
            assignment_info=assignment_info,
            student_info=student_info,
            pages=pages,
            vision_model=vision_model
        )
        if not extract_res.get("success"):
            return extract_res

        mark_res = self.mark_questions(
            questions=extract_res.get("questions", []),
            assignment_info=assignment_info,
            student_info=student_info,
            reasoning_model=reasoning_model
        )
        if not mark_res.get("success"):
            return mark_res

        scored_questions = mark_res.get("questions", [])
        eval_res = self.synthesize_feedback(
            questions=scored_questions,
            assignment_info=assignment_info,
            student_info=student_info,
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
            "ai_model_used": f"{vision_model} + {reasoning_model}",
            "marker_used": self.marker_id
        }

    @abstractmethod
    def generate_direct_annotations(
        self,
        submission: Dict[str, Any],
        pages: List[Dict[str, Any]],
        model: str,
        use_benchmark_mock: bool = False,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Direct Marking: Generates on-script visual red-pen annotations (ticks, crosses, remarks).
        """
        pass
