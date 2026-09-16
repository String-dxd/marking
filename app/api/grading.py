from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.core import db
from app.core.marker_engine import compute_grade_letter

router = APIRouter(prefix="/api/grading", tags=["grading"])

class QuestionGradeUpdate(BaseModel):
    question_no: str
    question_title: Optional[str] = ""
    max_marks: float
    awarded_marks: float
    extracted_answer: Optional[str] = ""
    feedback_comment: Optional[str] = ""
    criteria: Optional[Any] = []

class GradingReviewUpdate(BaseModel):
    total_score: Optional[float] = None
    overall_feedback: str
    strengths_feedback: str
    improvement_feedback: str
    questions: List[QuestionGradeUpdate]

@router.post("/{submission_id}/save-draft")
def save_grading_draft(submission_id: int, data: GradingReviewUpdate):
    submission = db.get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    questions_dict = [q.model_dump() for q in data.questions]
    computed_awarded = sum(q["awarded_marks"] for q in questions_dict)
    q_max = sum(float(q.get("max_marks", 0.0)) for q in questions_dict if float(q.get("max_marks", 0.0)) > 0)
    max_marks = q_max if q_max > 0 else float(submission.get("assignment_max_marks") or 100.0)
    pct = round((computed_awarded / max_marks * 100.0), 1) if max_marks > 0 else 0.0
    grade = compute_grade_letter(pct)
    
    db.save_marking_results(
        submission_id=submission_id,
        total_score=computed_awarded,
        percentage=pct,
        grade_letter=grade,
        overall_feedback=data.overall_feedback,
        strengths_feedback=data.strengths_feedback,
        improvement_feedback=data.improvement_feedback,
        ai_model=submission.get("ai_model_used", ""),
        questions=questions_dict,
        auto_status="review_ready"
    )
    
    return {"success": True, "message": "Draft saved successfully."}

@router.post("/{submission_id}/approve")
def approve_grading(submission_id: int, data: GradingReviewUpdate):
    submission = db.get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    questions_dict = [q.model_dump() for q in data.questions]
    computed_awarded = sum(q["awarded_marks"] for q in questions_dict)
    q_max = sum(float(q.get("max_marks", 0.0)) for q in questions_dict if float(q.get("max_marks", 0.0)) > 0)
    max_marks = q_max if q_max > 0 else float(submission.get("assignment_max_marks") or 100.0)
    pct = round((computed_awarded / max_marks * 100.0), 1) if max_marks > 0 else 0.0
    grade = compute_grade_letter(pct)
    
    db.approve_submission(
        submission_id=submission_id,
        total_score=computed_awarded,
        percentage=pct,
        grade_letter=grade,
        overall_feedback=data.overall_feedback,
        strengths_feedback=data.strengths_feedback,
        improvement_feedback=data.improvement_feedback,
        questions=questions_dict
    )
    
    return {
        "success": True,
        "message": "Submission approved and recorded into student database.",
        "status": "approved"
    }
