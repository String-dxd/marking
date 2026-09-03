import os
import json
import time
from pathlib import Path
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Query
from pydantic import BaseModel
from app.core.config import UPLOADS_DIR, DEFAULT_VISION_MODEL, DEFAULT_TEXT_MODEL
from app.core import db
from app.core.pdf_processor import process_scanned_document, reverse_pages_list, rotate_page_image, reorder_pages
from app.core.marker_engine import grade_student_submission, extract_student_identity_from_scan
from app.core.direct_marker import generate_direct_marking_annotations

router = APIRouter(prefix="/api/submissions", tags=["submissions"])

class ReorderRequest(BaseModel):
    new_order: List[int] # List of 0-based indices

class RotateRequest(BaseModel):
    page_index: int
    angle: int = 90

class GradeRequest(BaseModel):
    vision_model: Optional[str] = DEFAULT_VISION_MODEL
    reasoning_model: Optional[str] = DEFAULT_TEXT_MODEL
    text_model: Optional[str] = None
    use_two_stage: Optional[bool] = True

class StudentInfoUpdate(BaseModel):
    name: str
    student_code: str
    class_name: Optional[str] = "General"

@router.post("/upload")
async def upload_submission(
    assignment_id: int = Form(...),
    student_id: Optional[int] = Form(None),
    student_code: Optional[str] = Form(None),
    student_name: Optional[str] = Form(None),
    class_name: Optional[str] = Form(None),
    reverse_order: bool = Form(False),
    file: UploadFile = File(...)
):
    assignment = db.get_assignment_by_id(assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
        
    temp_timestamp = int(time.time() * 1000)
    filename = f"scan_{assignment_id}_{temp_timestamp}_{file.filename}"
    save_path = UPLOADS_DIR / filename
    
    contents = await file.read()
    with open(save_path, "wb") as f:
        f.write(contents)
        
    # Temporary placeholder student
    initial_name = student_name or ""
    initial_code = student_code or f"STU-{temp_timestamp % 10000:04d}"
    initial_class = class_name or assignment.get("class_name") or "General"
    
    s_id = student_id or db.get_or_create_student(initial_code, initial_name or f"Script ({file.filename})", initial_class)
    
    sub_id = db.create_submission(
        assignment_id=assignment_id,
        student_id=s_id,
        scan_file_path=str(save_path),
        pages_json="[]"
    )
    
    # Process PDF / images into high-res pages & thumbnails
    pages = process_scanned_document(str(save_path), submission_id=sub_id, reverse_order=reverse_order)
    
    # If student_name was not explicitly given, automatically parse student name/ID from the scan!
    if not student_name:
        identity = extract_student_identity_from_scan(pages, filename=file.filename, default_class=initial_class)
        db.update_submission_student_info(
            submission_id=sub_id,
            name=identity["name"],
            student_code=identity["student_id"],
            class_name=identity["class_name"]
        )
    
    # Update DB with pages JSON
    conn = db.get_db_connection()
    conn.execute("UPDATE submissions SET pages_json = ? WHERE id = ?", (json.dumps(pages), sub_id))
    conn.commit()
    conn.close()
    
    return {
        "success": True,
        "submission_id": sub_id,
        "page_count": len(pages),
        "reverse_order_applied": reverse_order,
        "pages": pages
    }

@router.post("/split-combined-scan")
async def split_and_ingest_combined_scan(
    assignment_id: int = Form(...),
    pages_per_student: int = Form(1),
    reverse_pages_per_student: bool = Form(False),
    reverse_entire_scan: bool = Form(False),
    default_class: Optional[str] = Form(None),
    file: UploadFile = File(...)
):
    """
    Truncates a single combined multi-student PDF file into separate student submissions.
    Auto-extracts student names and checks if student is in the existing database.
    """
    from app.core.pdf_processor import split_combined_pdf_into_student_docs, render_and_save_student_pages
    
    assignment = db.get_assignment_by_id(assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
        
    temp_timestamp = int(time.time() * 1000)
    filename = f"combined_{assignment_id}_{temp_timestamp}_{file.filename}"
    save_path = UPLOADS_DIR / filename
    
    contents = await file.read()
    with open(save_path, "wb") as f:
        f.write(contents)
        
    try:
        chunks = split_combined_pdf_into_student_docs(
            combined_pdf_path=str(save_path),
            pages_per_student=max(1, pages_per_student),
            reverse_pages_per_student=reverse_pages_per_student,
            reverse_entire_scan=reverse_entire_scan
        )
        
        created_submissions = []
        assign_class = default_class or assignment.get("class_name") or "General"
        
        for chunk in chunks:
            stu_idx = chunk["student_index"]
            temp_code = f"STU-{temp_timestamp % 10000:04d}-{stu_idx:02d}"
            
            s_id = db.get_or_create_student(temp_code, f"Student {stu_idx}", assign_class)
            
            sub_id = db.create_submission(
                assignment_id=assignment_id,
                student_id=s_id,
                scan_file_path=str(save_path),
                pages_json="[]"
            )
            
            pages = render_and_save_student_pages(
                combined_pdf_path=str(save_path),
                page_indices=chunk["page_indices"],
                submission_id=sub_id
            )
            
            # Extract handwritten student name & ID from Page 1 of this split
            identity = extract_student_identity_from_scan(pages, filename="", default_class=assign_class, fast_only=False)
            
            # Check against existing students in database (only if recognized real name)
            match = db.find_matching_student(identity["name"], identity["student_id"])
            
            if match:
                target_student_id = match["id"]
                db_conn = db.get_db_connection()
                db_conn.execute("UPDATE submissions SET student_id = ? WHERE id = ?", (target_student_id, sub_id))
                db_conn.commit()
                db_conn.close()
                identity["name"] = match["name"]
                identity["student_id"] = match["student_id"]
                identity["class_name"] = match["class_name"]
            else:
                db.update_submission_student_info(
                    submission_id=sub_id,
                    name=identity["name"],
                    student_code=identity["student_id"],
                    class_name=identity["class_name"]
                )
                
            db_conn = db.get_db_connection()
            db_conn.execute("UPDATE submissions SET pages_json = ? WHERE id = ?", (json.dumps(pages), sub_id))
            db_conn.commit()
            db_conn.close()
            
            created_submissions.append({
                "submission_id": sub_id,
                "student_name": identity["name"],
                "student_code": identity["student_id"],
                "page_count": len(pages),
                "is_new_student": is_new_student
            })
            
        return {
            "success": True,
            "total_split": len(created_submissions),
            "submissions": created_submissions
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Split failed: {str(e)}")

@router.post("/{submission_id}/auto-detect-name")
def auto_detect_submission_name(submission_id: int):
    """
    Uses local Vision LLM to re-read and transcribe handwritten student name/ID on page 1.
    """
    submission = db.get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    pages = json.loads(submission.get("pages_json") or "[]")
    if not pages:
        raise HTTPException(status_code=400, detail="No pages available")
        
    identity = extract_student_identity_from_scan(
        pages=pages,
        filename="",
        default_class=submission.get("class_name", "General"),
        fast_only=False
    )
    
    updated = db.update_submission_student_info(
        submission_id=submission_id,
        name=identity["name"],
        student_code=identity["student_id"],
        class_name=identity["class_name"]
    )
    
    return {"success": True, "student": updated}

@router.delete("/{submission_id}")
def delete_submission_endpoint(submission_id: int):
    """
    Deletes a student submission / work to be reviewed and its question grades.
    """
    submission = db.get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    db.delete_submission(submission_id)
    return {"success": True, "message": f"Submission {submission_id} deleted successfully."}

@router.post("/batch-upload")
async def batch_upload_submissions(
    assignment_id: int = Form(...),
    reverse_order: bool = Form(False),
    default_class: Optional[str] = Form(None),
    files: List[UploadFile] = File(...)
):
    """
    Batch uploads multiple student script files at once.
    Automatically parses student names, student IDs, and checks database match.
    """
    assignment = db.get_assignment_by_id(assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
        
    created_submissions = []
    assign_class = default_class or assignment.get("class_name") or "General"
    
    for file in files:
        temp_timestamp = int(time.time() * 1000)
        filename = f"batch_{assignment_id}_{temp_timestamp}_{file.filename}"
        save_path = UPLOADS_DIR / filename
        
        contents = await file.read()
        with open(save_path, "wb") as f:
            f.write(contents)
            
        temp_code = f"STU-{temp_timestamp % 10000:04d}"
        s_id = db.get_or_create_student(temp_code, f"Script ({file.filename})", assign_class)
        
        sub_id = db.create_submission(
            assignment_id=assignment_id,
            student_id=s_id,
            scan_file_path=str(save_path),
            pages_json="[]"
        )
        
        pages = process_scanned_document(str(save_path), submission_id=sub_id, reverse_order=reverse_order)
        identity = extract_student_identity_from_scan(pages, filename=file.filename, default_class=assign_class)
        
        match = db.find_matching_student(identity["name"], identity["student_id"])
        is_new_student = True
        
        if match:
            target_student_id = match["id"]
            db_conn = db.get_db_connection()
            db_conn.execute("UPDATE submissions SET student_id = ? WHERE id = ?", (target_student_id, sub_id))
            db_conn.commit()
            db_conn.close()
            identity["name"] = match["name"]
            identity["student_id"] = match["student_id"]
            identity["class_name"] = match["class_name"]
            is_new_student = False
        else:
            db.update_submission_student_info(
                submission_id=sub_id,
                name=identity["name"],
                student_code=identity["student_id"],
                class_name=identity["class_name"]
            )
        
        db_conn = db.get_db_connection()
        db_conn.execute("UPDATE submissions SET pages_json = ? WHERE id = ?", (json.dumps(pages), sub_id))
        db_conn.commit()
        db_conn.close()
        
        created_submissions.append({
            "submission_id": sub_id,
            "filename": file.filename,
            "student_name": identity["name"],
            "student_code": identity["student_id"],
            "page_count": len(pages),
            "is_new_student": is_new_student
        })
        
    return {
        "success": True,
        "total_uploaded": len(created_submissions),
        "submissions": created_submissions
    }

@router.put("/{submission_id}/student-info")
def update_submission_student(submission_id: int, data: StudentInfoUpdate):
    submission = db.get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    updated = db.update_submission_student_info(
        submission_id=submission_id,
        name=data.name,
        student_code=data.student_code,
        class_name=data.class_name or "General"
    )
    return {"success": True, "student": updated}

@router.get("/{submission_id}")
def get_submission(submission_id: int):
    submission = db.get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    try:
        submission["pages"] = json.loads(submission.get("pages_json") or "[]")
    except Exception:
        submission["pages"] = []
        
    return submission

@router.post("/{submission_id}/reverse-pages")
def reverse_submission_pages(submission_id: int):
    submission = db.get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    pages = json.loads(submission.get("pages_json") or "[]")
    if not pages:
        raise HTTPException(status_code=400, detail="No pages to reverse")
        
    reversed_pages = reverse_pages_list(pages)
    
    conn = db.get_db_connection()
    conn.execute("UPDATE submissions SET pages_json = ? WHERE id = ?", (json.dumps(reversed_pages), submission_id))
    conn.commit()
    conn.close()
    
    return {"success": True, "pages": reversed_pages}

@router.post("/{submission_id}/rotate-page")
def rotate_page(submission_id: int, req: RotateRequest):
    submission = db.get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    pages = json.loads(submission.get("pages_json") or "[]")
    if req.page_index < 0 or req.page_index >= len(pages):
        raise HTTPException(status_code=400, detail="Invalid page index")
        
    page = pages[req.page_index]
    img_path = page.get("image_path")
    thumb_path = page.get("thumbnail_path")
    
    if img_path:
        rotate_page_image(img_path, req.angle)
    if thumb_path:
        rotate_page_image(thumb_path, req.angle)
        
    page["rotation"] = (page.get("rotation", 0) + req.angle) % 360
    
    conn = db.get_db_connection()
    conn.execute("UPDATE submissions SET pages_json = ? WHERE id = ?", (json.dumps(pages), submission_id))
    conn.commit()
    conn.close()
    
    return {"success": True, "page": page}

from app.core.marker_engine import (
    grade_student_submission,
    extract_student_identity_from_scan,
    step1_mark_questions_by_parts,
    step1a_extract_student_responses_verbatim,
    step1b_mark_extracted_questions,
    step2_evaluate_and_comment,
    step2_mark_and_comment
)

class Step1BRequest(BaseModel):
    reasoning_model: Optional[str] = "qwen3.6:latest"
    questions: Optional[List[Dict[str, Any]]] = None

class Step2Request(BaseModel):
    reasoning_model: Optional[str] = "qwen3.6:latest"
    questions: Optional[List[Dict[str, Any]]] = None

def _ensure_student_name_verified(submission_id: int, submission: Dict[str, Any], pages: List[Dict[str, Any]]):
    """Ensures student name is parsed from scan before generating remarks."""
    cur_name = submission.get("student_name", "")
    if not cur_name or cur_name.strip() in ("Student Script", "Student", "Script") or cur_name.startswith("Student Script"):
        if pages:
            identity = extract_student_identity_from_scan(
                pages=pages,
                filename="",
                default_class=submission.get("class_name", "General"),
                fast_only=False
            )
            if identity.get("name") and not identity["name"].startswith("Student Script"):
                db.update_submission_student_info(
                    submission_id=submission_id,
                    name=identity["name"],
                    student_code=identity["student_id"],
                    class_name=identity["class_name"]
                )
                submission["student_name"] = identity["name"]
                submission["student_code"] = identity["student_id"]

@router.post("/{submission_id}/extract")
@router.post("/{submission_id}/grade-step1a")
def run_grade_step1a_extraction(submission_id: int, req: GradeRequest):
    """
    Step 1: Vision AI extracts student's handwritten responses, diagram labels, ticks, and graphs
    verbatim question by question, allowing the teacher to review and edit before marking.
    """
    submission = db.get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    pages = json.loads(submission.get("pages_json") or "[]")
    if not pages:
        raise HTTPException(status_code=400, detail="Submission has no scanned pages.")
        
    _ensure_student_name_verified(submission_id, submission, pages)
    
    assignment_info = {
        "title": submission.get("assignment_title"),
        "subject": submission.get("assignment_subject"),
        "max_marks": submission.get("assignment_max_marks"),
        "marking_scheme_text": submission.get("marking_scheme_text"),
        "rubric_json": submission.get("assignment_rubric_json")
    }
    student_info = {
        "name": submission.get("student_name"),
        "student_id": submission.get("student_code")
    }
    
    db.update_submission_status(submission_id, "marking")
    
    result = step1a_extract_student_responses_verbatim(
        assignment_info=assignment_info,
        student_info=student_info,
        pages=pages,
        vision_model=req.vision_model or DEFAULT_VISION_MODEL
    )
    
    if not result.get("success"):
        db.update_submission_status(submission_id, "pending")
        raise HTTPException(status_code=500, detail=result.get("error", "Extraction failed"))
        
    # Save extracted questions (with awarded_marks=0) into DB
    db.save_marking_results(
        submission_id=submission_id,
        total_score=0.0,
        percentage=0.0,
        grade_letter="--",
        overall_feedback=submission.get("overall_feedback", ""),
        strengths_feedback=submission.get("strengths_feedback", ""),
        improvement_feedback=submission.get("improvement_feedback", ""),
        ai_model=result["ai_model_used"],
        questions=result["questions"],
        auto_status="review_ready"
    )
    
    return {
        "success": True,
        "step": "1A",
        "message": f"Step 1A Complete: {len(result['questions'])} student responses extracted verbatim. Review the text, then click Step 1B to mark.",
        "results": result
    }

@router.post("/{submission_id}/grade-step1b")
def run_grade_step1b_marking(submission_id: int, req: Step1BRequest):
    """
    Step 1B: Reasoning LLM evaluates the verified / teacher-edited verbatim student answers
    question by question against the marking scheme and awards marks.
    """
    submission = db.get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    pages = json.loads(submission.get("pages_json") or "[]")
    _ensure_student_name_verified(submission_id, submission, pages)
    
    questions = req.questions or submission.get("question_grades", [])
    if not questions:
        raise HTTPException(status_code=400, detail="No student responses found. Please run Step 1A first.")
        
    assignment_info = {
        "title": submission.get("assignment_title"),
        "subject": submission.get("assignment_subject"),
        "max_marks": submission.get("assignment_max_marks"),
        "marking_scheme_text": submission.get("marking_scheme_text"),
        "rubric_json": submission.get("assignment_rubric_json")
    }
    student_info = {
        "name": submission.get("student_name"),
        "student_id": submission.get("student_code")
    }
    
    db.update_submission_status(submission_id, "marking")
    
    result = step1b_mark_extracted_questions(
        assignment_info=assignment_info,
        student_info=student_info,
        questions=questions,
        reasoning_model=req.reasoning_model or DEFAULT_TEXT_MODEL
    )
    
    if not result.get("success"):
        db.update_submission_status(submission_id, "pending")
        raise HTTPException(status_code=500, detail=result.get("error", "Question marking failed"))
        
    eval_res = step2_evaluate_and_comment(
        assignment_info=assignment_info,
        student_info=student_info,
        questions=result["questions"],
        reasoning_model=req.reasoning_model or DEFAULT_TEXT_MODEL
    )
    
    db.save_marking_results(
        submission_id=submission_id,
        total_score=result["total_score"],
        percentage=result["percentage"],
        grade_letter=result["grade_letter"],
        overall_feedback=eval_res.get("overall_feedback", ""),
        strengths_feedback=eval_res.get("strengths_feedback", ""),
        improvement_feedback=eval_res.get("improvement_feedback", ""),
        ai_model=result["ai_model_used"],
        questions=result["questions"],
        auto_status="review_ready"
    )
    
    return {
        "success": True,
        "step": "1B",
        "message": f"Step 1B Complete: Questions marked ({result['total_score']} / {result['max_marks']}) and feedback generated.",
        "results": {
            **result,
            "overall_feedback": eval_res.get("overall_feedback", ""),
            "strengths_feedback": eval_res.get("strengths_feedback", ""),
            "improvement_feedback": eval_res.get("improvement_feedback", "")
        }
    }

@router.post("/{submission_id}/mark-and-comment")
def run_mark_and_comment(submission_id: int, req: Step1BRequest):
    """
    Step 2: AI Question Marking & Comment Synthesis.
    Evaluates verified student handwriting/markings question-by-question, awards criteria marks,
    AND generates overall feedback, strengths, and improvement areas.
    """
    submission = db.get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    pages = json.loads(submission.get("pages_json") or "[]")
    _ensure_student_name_verified(submission_id, submission, pages)
    
    questions = req.questions or submission.get("question_grades", [])
    if not questions:
        raise HTTPException(status_code=400, detail="No extracted student responses found. Please run Step 1 (Extract) first.")
        
    assignment_info = {
        "title": submission.get("assignment_title"),
        "subject": submission.get("assignment_subject"),
        "max_marks": submission.get("assignment_max_marks"),
        "marking_scheme_text": submission.get("marking_scheme_text"),
        "rubric_json": submission.get("assignment_rubric_json")
    }
    student_info = {
        "name": submission.get("student_name"),
        "student_id": submission.get("student_code")
    }
    
    db.update_submission_status(submission_id, "marking")
    
    result = step2_mark_and_comment(
        assignment_info=assignment_info,
        student_info=student_info,
        questions=questions,
        reasoning_model=req.reasoning_model or DEFAULT_TEXT_MODEL
    )
    
    if not result.get("success"):
        db.update_submission_status(submission_id, "pending")
        raise HTTPException(status_code=500, detail=result.get("error", "Marking and comment synthesis failed"))
        
    db.save_marking_results(
        submission_id=submission_id,
        total_score=result["total_score"],
        percentage=result["percentage"],
        grade_letter=result["grade_letter"],
        overall_feedback=result["overall_feedback"],
        strengths_feedback=result["strengths_feedback"],
        improvement_feedback=result["improvement_feedback"],
        ai_model=result["ai_model_used"],
        questions=result["questions"],
        auto_status="review_ready"
    )
    
    return {
        "success": True,
        "step": 2,
        "message": f"Step 2 Complete: Questions marked ({result['total_score']} / {result['max_marks']}) and personalized remarks generated.",
        "results": result
    }

@router.post("/{submission_id}/grade-step1")
def run_grade_step1(submission_id: int, req: GradeRequest):
    """
    Step 1 (Combined 1A + 1B): AI Question-by-Question Extraction & Marking.
    """
    submission = db.get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    pages = json.loads(submission.get("pages_json") or "[]")
    if not pages:
        raise HTTPException(status_code=400, detail="Submission has no scanned pages.")
        
    _ensure_student_name_verified(submission_id, submission, pages)
    
    assignment_info = {
        "title": submission.get("assignment_title"),
        "subject": submission.get("assignment_subject"),
        "max_marks": submission.get("assignment_max_marks"),
        "marking_scheme_text": submission.get("marking_scheme_text"),
        "rubric_json": submission.get("assignment_rubric_json")
    }
    student_info = {
        "name": submission.get("student_name"),
        "student_id": submission.get("student_code")
    }
    
    db.update_submission_status(submission_id, "marking")
    
    result = step1_mark_questions_by_parts(
        assignment_info=assignment_info,
        student_info=student_info,
        pages=pages,
        vision_model=req.vision_model or DEFAULT_VISION_MODEL,
        reasoning_model=req.reasoning_model or req.text_model or DEFAULT_TEXT_MODEL,
        use_two_stage=req.use_two_stage if req.use_two_stage is not None else True
    )
    
    if not result.get("success"):
        db.update_submission_status(submission_id, "pending")
        raise HTTPException(status_code=500, detail=result.get("error", "Question marking failed"))
        
    eval_res = step2_evaluate_and_comment(
        assignment_info=assignment_info,
        student_info=student_info,
        questions=result["questions"],
        reasoning_model=req.reasoning_model or req.text_model or DEFAULT_TEXT_MODEL
    )
    
    db.save_marking_results(
        submission_id=submission_id,
        total_score=result["total_score"],
        percentage=result["percentage"],
        grade_letter=result["grade_letter"],
        overall_feedback=eval_res.get("overall_feedback", ""),
        strengths_feedback=eval_res.get("strengths_feedback", ""),
        improvement_feedback=eval_res.get("improvement_feedback", ""),
        ai_model=result["ai_model_used"],
        questions=result["questions"],
        auto_status="review_ready"
    )
    
    return {
        "success": True,
        "step": 1,
        "message": f"Step 1 Complete: {len(result['questions'])} questions marked and feedback generated.",
        "results": {
            **result,
            "overall_feedback": eval_res.get("overall_feedback", ""),
            "strengths_feedback": eval_res.get("strengths_feedback", ""),
            "improvement_feedback": eval_res.get("improvement_feedback", "")
        }
    }

@router.post("/{submission_id}/grade-step2")
def run_grade_step2(submission_id: int, req: Step2Request):
    """
    Step 2: AI Overall Evaluation & Remarks Synthesis.
    Generates personalized feedback, strengths, and areas for improvement based on verified question marks.
    """
    submission = db.get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    pages = json.loads(submission.get("pages_json") or "[]")
    _ensure_student_name_verified(submission_id, submission, pages)
    
    questions = req.questions or submission.get("question_grades", [])
    if not questions:
        raise HTTPException(status_code=400, detail="No question marks found. Please run Step 1 first.")
        
    assignment_info = {
        "title": submission.get("assignment_title"),
        "subject": submission.get("assignment_subject"),
        "max_marks": submission.get("assignment_max_marks")
    }
    student_info = {
        "name": submission.get("student_name"),
        "student_id": submission.get("student_code")
    }
    
    result = step2_evaluate_and_comment(
        assignment_info=assignment_info,
        student_info=student_info,
        questions=questions,
        reasoning_model=req.reasoning_model or DEFAULT_TEXT_MODEL
    )
    
    # Update DB with feedback and latest question scores
    db.save_marking_results(
        submission_id=submission_id,
        total_score=result["total_score"],
        percentage=result["percentage"],
        grade_letter=result["grade_letter"],
        overall_feedback=result["overall_feedback"],
        strengths_feedback=result["strengths_feedback"],
        improvement_feedback=result["improvement_feedback"],
        ai_model=submission.get("ai_model_used", ""),
        questions=questions,
        auto_status="review_ready"
    )
    
    return {
        "success": True,
        "step": 2,
        "message": "Step 2 Complete: Personalized remarks and evaluation synthesized.",
        "results": result
    }

@router.post("/{submission_id}/grade")
def run_ai_grading(submission_id: int, req: GradeRequest):
    """Full 2-Step Automated Marking Pipeline."""
    submission = db.get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    pages = json.loads(submission.get("pages_json") or "[]")
    if not pages:
        raise HTTPException(status_code=400, detail="Submission has no scanned pages.")
        
    # Ensure student name is parsed before remarks
    _ensure_student_name_verified(submission_id, submission, pages)
        
    assignment_info = {
        "title": submission.get("assignment_title"),
        "subject": submission.get("assignment_subject"),
        "max_marks": submission.get("assignment_max_marks"),
        "marking_scheme_text": submission.get("marking_scheme_text"),
        "rubric_json": submission.get("assignment_rubric_json")
    }
    
    student_info = {
        "name": submission.get("student_name"),
        "student_id": submission.get("student_code")
    }
    
    db.update_submission_status(submission_id, "marking")
    
    result = grade_student_submission(
        assignment_info=assignment_info,
        student_info=student_info,
        pages=pages,
        vision_model=req.vision_model or DEFAULT_VISION_MODEL,
        reasoning_model=req.reasoning_model or req.text_model or DEFAULT_TEXT_MODEL,
        use_two_stage=req.use_two_stage if req.use_two_stage is not None else True
    )
    
    if not result.get("success"):
        db.update_submission_status(submission_id, "pending")
        raise HTTPException(status_code=500, detail=result.get("error", "AI marking failed"))
        
    db.save_marking_results(
        submission_id=submission_id,
        total_score=result["total_score"],
        percentage=result["percentage"],
        grade_letter=result["grade_letter"],
        overall_feedback=result["overall_feedback"],
        strengths_feedback=result["strengths_feedback"],
        improvement_feedback=result["improvement_feedback"],
        ai_model=result["ai_model_used"],
        questions=result["questions"],
        auto_status="review_ready"
    )
    
    return {
        "success": True,
        "message": "AI grading completed. Ready for teacher review & approval.",
        "results": result
    }

@router.get("/assignment/{assignment_id}")
def get_assignment_submissions(assignment_id: int):
    return db.get_submissions_by_assignment(assignment_id)

class AnnotationsUpdateRequest(BaseModel):
    annotations: List[Dict[str, Any]]

@router.get("/{submission_id}/annotations")
def get_submission_annotations_endpoint(submission_id: int):
    submission = db.get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    annotations = submission.get("annotations") or db.get_submission_annotations(submission_id)
    return {"success": True, "submission_id": submission_id, "annotations": annotations}

@router.put("/{submission_id}/annotations")
def update_submission_annotations_endpoint(submission_id: int, req: AnnotationsUpdateRequest):
    submission = db.get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    db.update_submission_annotations(submission_id, req.annotations)
    return {"success": True, "message": "Annotations updated successfully.", "annotations": req.annotations}

@router.delete("/{submission_id}/annotations")
def clear_submission_annotations_endpoint(submission_id: int):
    submission = db.get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    db.update_submission_annotations(submission_id, [])
    return {"success": True, "message": "Direct markings cleared successfully.", "annotations": []}

@router.post("/{submission_id}/direct-mark")
def run_direct_marking_endpoint(submission_id: int, vision_model: Optional[str] = DEFAULT_VISION_MODEL):
    submission = db.get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    pages = json.loads(submission.get("pages_json") or "[]")
    if not pages:
        raise HTTPException(status_code=400, detail="Submission has no scanned pages.")
    
    annotations = generate_direct_marking_annotations(
        submission=submission,
        pages=pages,
        model=vision_model or DEFAULT_VISION_MODEL
    )
    return {
        "success": True,
        "submission_id": submission_id,
        "message": f"Direct marking complete ({len(annotations)} annotations generated).",
        "annotations": annotations,
        "direct_marking_pdf_url": f"/api/reports/{submission_id}/direct-marking-pdf"
    }

