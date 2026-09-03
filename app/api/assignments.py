import json
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
import pymupdf
from app.core.config import UPLOADS_DIR
from app.core import db

router = APIRouter(prefix="/api/assignments", tags=["assignments"])

class AssignmentCreate(BaseModel):
    title: str
    subject: str
    class_name: str
    max_marks: float = 100.0
    marking_scheme_text: str = ""
    rubric_json: Optional[str] = "[]"

class AssignmentUpdate(BaseModel):
    title: str
    subject: str
    class_name: str
    max_marks: float = 100.0
    marking_scheme_text: str = ""
    rubric_json: Optional[str] = "[]"

@router.get("")
def list_assignments():
    return db.get_all_assignments()

@router.post("")
def create_assignment_endpoint(data: AssignmentCreate):
    a_id = db.create_assignment(
        title=data.title,
        subject=data.subject,
        class_name=data.class_name,
        max_marks=data.max_marks,
        marking_scheme_text=data.marking_scheme_text,
        rubric_json=data.rubric_json or "[]"
    )
    return {"success": True, "assignment_id": a_id}

class BulkDeleteAssignmentsRequest(BaseModel):
    assignment_ids: List[int]

@router.post("/bulk-delete")
@router.delete("/bulk-delete")
def bulk_delete_assignments_endpoint(data: BulkDeleteAssignmentsRequest):
    count = db.bulk_delete_assignments(data.assignment_ids)
    return {"success": True, "deleted_count": count, "message": f"Successfully deleted {count} assignment(s)."}

@router.post("/upload-scheme")
async def upload_marking_scheme_file(file: UploadFile = File(...)):
    """
    Uploads a marking scheme file (Word .docx/.doc, PDF, or text)
    and extracts ONLY the relevant marking scheme and rubric criteria.
    """
    from app.core.doc_parser import extract_text_from_file, extract_relevant_marking_scheme
    
    filename = f"scheme_{file.filename}"
    save_path = UPLOADS_DIR / filename
    
    contents = await file.read()
    with open(save_path, "wb") as f:
        f.write(contents)
        
    raw_text = extract_text_from_file(str(save_path))
    
    # Extract only the relevant marking scheme / rubrics portion
    extracted_data = extract_relevant_marking_scheme(raw_text)
    
    return {
        "success": True,
        "filename": filename,
        "file_path": str(save_path),
        "raw_text": raw_text,
        "clean_marking_scheme": extracted_data.get("clean_marking_scheme") or raw_text,
        "suggested_title": extracted_data.get("suggested_title", ""),
        "suggested_subject": extracted_data.get("suggested_subject", ""),
        "suggested_max_marks": extracted_data.get("suggested_max_marks", 100.0)
    }

@router.get("/{assignment_id}")
def get_assignment_detail(assignment_id: int):
    assignment = db.get_assignment_by_id(assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment

@router.put("/{assignment_id}")
def update_assignment_endpoint(assignment_id: int, data: AssignmentUpdate):
    updated = db.update_assignment(
        assignment_id=assignment_id,
        title=data.title,
        subject=data.subject,
        class_name=data.class_name,
        max_marks=data.max_marks,
        marking_scheme_text=data.marking_scheme_text,
        rubric_json=data.rubric_json or "[]"
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return {"success": True, "assignment": updated}

@router.delete("/{assignment_id}")
def delete_assignment(assignment_id: int):
    assignment = db.get_assignment_by_id(assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    db.delete_assignment(assignment_id)
    return {"success": True, "message": f"Assignment {assignment_id} deleted successfully."}

