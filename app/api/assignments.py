import json
import re
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
import pymupdf
from app.core.config import UPLOADS_DIR
from app.core import db
from app.core.fallback_tracker import FallbackContext

router = APIRouter(prefix="/api/assignments", tags=["assignments"])

class AssignmentCreate(BaseModel):
    title: str
    subject: str
    class_name: str
    max_marks: float = 100.0
    marking_scheme_text: str = ""
    rubric_json: Optional[str] = "[]"
    marker_type: Optional[str] = "auto"

class AssignmentUpdate(BaseModel):
    title: str
    subject: str
    class_name: str
    max_marks: float = 100.0
    marking_scheme_text: str = ""
    rubric_json: Optional[str] = "[]"
    marker_type: Optional[str] = "auto"

@router.get("/markers")
def list_available_markers():
    from app.markers.registry import list_markers
    return list_markers()

def _enrich_rubric_json_pages(rubric_json_str: str, marking_scheme_text: str) -> str:
    if not rubric_json_str or rubric_json_str.strip() in ("", "[]"):
        return rubric_json_str or "[]"
    try:
        catalog = json.loads(rubric_json_str)
        if not isinstance(catalog, list) or not catalog:
            return rubric_json_str
        has_pages = any(c.get("page_number") is not None for c in catalog if isinstance(c, dict))
        if not has_pages and marking_scheme_text:
            from app.core.marker_engine import parse_marking_scheme_structure
            text_catalog = parse_marking_scheme_structure(marking_scheme_text)
            text_page_map = {
                re.sub(r"[\(\)\s]", "", str(t.get("question_no", ""))).lower(): t.get("page_number")
                for t in text_catalog if t.get("page_number") is not None
            }
            enriched = False
            for c in catalog:
                if isinstance(c, dict):
                    clean_c = re.sub(r"[\(\)\s]", "", str(c.get("question_no", ""))).lower()
                    if clean_c in text_page_map:
                        c["page_number"] = text_page_map[clean_c]
                        enriched = True
            if enriched:
                return json.dumps(catalog)
    except Exception:
        pass
    return rubric_json_str

@router.get("")
def list_assignments():
    return db.get_all_assignments()

@router.post("")
def create_assignment_endpoint(data: AssignmentCreate):
    eff_rubric = _enrich_rubric_json_pages(data.rubric_json or "[]", data.marking_scheme_text or "")
    a_id = db.create_assignment(
        title=data.title,
        subject=data.subject,
        class_name=data.class_name,
        max_marks=data.max_marks,
        marking_scheme_text=data.marking_scheme_text,
        rubric_json=eff_rubric,
        marker_type=data.marker_type or "auto"
    )
    return {"success": True, "assignment_id": a_id}

class BulkDeleteAssignmentsRequest(BaseModel):
    assignment_ids: List[int]

@router.post("/bulk-delete")
@router.delete("/bulk-delete")
def bulk_delete_assignments_endpoint(data: BulkDeleteAssignmentsRequest):
    count = db.bulk_delete_assignments(data.assignment_ids)
    return {"success": True, "deleted_count": count, "message": f"Successfully deleted {count} assignment(s)."}

class ParseRubricRequest(BaseModel):
    text: str
    subject: Optional[str] = ""
    title: Optional[str] = ""

@router.post("/parse-rubric")
def parse_rubric_endpoint(data: ParseRubricRequest):
    """
    Parses pasted or edited marking scheme text on-demand into structured rubric questions and criteria.
    """
    from app.core.doc_parser import parse_rubric_structure
    with FallbackContext() as fb_ctx:
        result = parse_rubric_structure(data.text, subject=data.subject, title=data.title)
        return {
            "success": True,
            **result,
            "fallback_triggered": fb_ctx.triggered,
            "fallbacks": fb_ctx.fallbacks
        }

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
    with FallbackContext() as fb_ctx:
        extracted_data = extract_relevant_marking_scheme(raw_text)
        
        return {
            "success": True,
            "filename": filename,
            "file_path": str(save_path),
            "raw_text": raw_text,
            "clean_marking_scheme": extracted_data.get("clean_marking_scheme") or raw_text,
            "rubric_json": extracted_data.get("rubric_json", []),
            "suggested_title": extracted_data.get("suggested_title", ""),
            "suggested_subject": extracted_data.get("suggested_subject", ""),
            "suggested_max_marks": extracted_data.get("suggested_max_marks", 100.0),
            "suggested_marker_type": extracted_data.get("suggested_marker_type", "auto"),
            "fallback_triggered": fb_ctx.triggered,
            "fallbacks": fb_ctx.fallbacks
        }

@router.get("/{assignment_id}")
def get_assignment_detail(assignment_id: int):
    assignment = db.get_assignment_by_id(assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment

@router.put("/{assignment_id}")
def update_assignment_endpoint(assignment_id: int, data: AssignmentUpdate):
    eff_rubric = _enrich_rubric_json_pages(data.rubric_json or "[]", data.marking_scheme_text or "")
    updated = db.update_assignment(
        assignment_id=assignment_id,
        title=data.title,
        subject=data.subject,
        class_name=data.class_name,
        max_marks=data.max_marks,
        marking_scheme_text=data.marking_scheme_text,
        rubric_json=eff_rubric,
        marker_type=data.marker_type or "auto"
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

class AssignmentRerunPipelineRequest(BaseModel):
    force_steps: Optional[List[str]] = ["step2", "step3"]
    include_approved: Optional[bool] = True
    submission_ids: Optional[List[int]] = None
    vision_model: Optional[str] = "qwen3.8:latest"
    reasoning_model: Optional[str] = "qwen3.8:latest"
    marker_type: Optional[str] = None

@router.post("/{assignment_id}/rerun-pipeline")
def rerun_assignment_pipeline_endpoint(
    assignment_id: int,
    req: Optional[AssignmentRerunPipelineRequest] = None
):
    """
    Reruns specified pipeline steps (defaulting to Steps 2 & 3: Mark & Comment, and Direct Visual Marking)
    for submissions in an assignment. This preserves verbatim extracted student responses (Step 1)
    and re-scores & re-annotates them against the latest assignment marking scheme and rubrics.
    """
    assignment = db.get_assignment_by_id(assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
        
    subs = db.get_submissions_by_assignment(assignment_id)
    if not subs:
        return {
            "success": True,
            "assignment_id": assignment_id,
            "total": 0,
            "message": "No submissions found for this assignment.",
            "results": []
        }

    from app.api.submissions import run_batch_pipeline_endpoint, BatchPipelineRequest
    
    force_steps = (req.force_steps if req and req.force_steps else ["step2", "step3"])
    include_approved = (req.include_approved if req and req.include_approved is not None else True)
    
    target_ids = req.submission_ids if req and req.submission_ids else None
    if not target_ids:
        if include_approved:
            target_ids = [s["id"] for s in subs]
        else:
            target_ids = [s["id"] for s in subs if s.get("status") != "approved"]

    batch_req = BatchPipelineRequest(
        assignment_id=assignment_id,
        submission_ids=target_ids,
        force_steps=force_steps,
        include_approved=include_approved,
        vision_model=req.vision_model if req and req.vision_model else "qwen3.8:latest",
        reasoning_model=req.reasoning_model if req and req.reasoning_model else "qwen3.8:latest",
        marker_type=req.marker_type if req and req.marker_type else assignment.get("marker_type", "auto")
    )
    
    batch_res = run_batch_pipeline_endpoint(batch_req)
    return {
        "success": batch_res.get("success", True),
        "assignment_id": assignment_id,
        "assignment_title": assignment.get("title"),
        "total": batch_res.get("total", len(target_ids)),
        "steps_forced": force_steps,
        "results": batch_res.get("results", [])
    }

