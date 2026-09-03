import io
import csv
from typing import Optional, List
from fastapi import APIRouter, HTTPException, UploadFile, File, Response
from pydantic import BaseModel
from app.core import db
from app.core.roster_parser import parse_roster_file

router = APIRouter(prefix="/api/students", tags=["students"])

class StudentCreate(BaseModel):
    name: str
    class_name: str = "General"
    subject: Optional[str] = ""
    email: Optional[str] = ""
    notes: Optional[str] = ""
    student_id: Optional[str] = None

class StudentUpdate(BaseModel):
    name: str
    class_name: str = "General"
    subject: Optional[str] = ""
    email: Optional[str] = ""
    notes: Optional[str] = ""

@router.get("")
def list_students():
    return db.get_all_students()

@router.post("")
def add_student(data: StudentCreate):
    s_id = db.get_or_create_student(
        student_id_code=data.student_id,
        name=data.name,
        class_name=data.class_name,
        email=data.email or "",
        subject=data.subject or "",
        notes=data.notes or ""
    )
    student = db.get_student_by_id(s_id)
    return {"success": True, "student_id": s_id, "student": student}

@router.post("/upload-roster")
async def upload_student_roster(file: UploadFile = File(...)):
    """
    Ingests an Excel (.xlsx) or CSV (.csv) roster file.
    Extracts student name, class, and subject, and assigns unique backend student IDs.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
        
    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
            
        parsed_students = parse_roster_file(content, file.filename)
        if not parsed_students:
            raise HTTPException(
                status_code=400,
                detail="Could not extract student records from file. Please ensure columns include 'Student Name', 'Class', and 'Subject'."
            )
            
        result = db.bulk_import_roster(parsed_students)
        return {
            "success": True,
            "message": f"Successfully imported {result['total']} students ({result['created']} new, {result['updated']} updated).",
            "stats": result
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process roster file: {str(e)}")

@router.get("/roster-template")
def download_roster_template():
    """Generates and downloads a sample CSV roster template."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Student Name", "Class", "Subject"])
    writer.writerow(["Alice Smith", "Class 10A", "Mathematics"])
    writer.writerow(["Bob Jones", "Class 10A", "Mathematics"])
    writer.writerow(["Charlie Brown", "Class 10B", "Physics"])
    writer.writerow(["Diana Prince", "Class 10B", "Physics"])
    
    csv_bytes = output.getvalue().encode("utf-8-sig")
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="student_roster_template.csv"'}
    )

@router.get("/cohort/analytics")
def get_cohort_analytics(class_name: Optional[str] = None):
    return db.get_class_analytics(class_name)

class BulkDeleteStudentsRequest(BaseModel):
    student_ids: List[int]

@router.post("/bulk-delete")
@router.delete("/bulk-delete")
def bulk_delete_students_endpoint(data: BulkDeleteStudentsRequest):
    count = db.bulk_delete_students(data.student_ids)
    return {"success": True, "deleted_count": count, "message": f"Successfully deleted {count} student profile(s)."}

@router.get("/{student_id}/performance")
def get_student_performance(student_id: int):
    data = db.get_student_performance_history(student_id)
    if not data or not data.get("student"):
        raise HTTPException(status_code=404, detail="Student not found")
        
    history = data.get("history", [])
    total_assignments = len(history)
    avg_percentage = 0.0
    trend_data = []
    
    if total_assignments > 0:
        avg_percentage = round(sum(h.get("percentage", 0.0) for h in history) / total_assignments, 1)
        for h in history:
            trend_data.append({
                "assignment_id": h.get("assignment_id"),
                "assignment_title": h.get("assignment_title"),
                "subject": h.get("subject"),
                "percentage": h.get("percentage"),
                "grade_letter": h.get("grade_letter"),
                "date": (h.get("approved_at") or h.get("created_at") or "")[:10]
            })
            
    return {
        "student": data["student"],
        "total_assignments_completed": total_assignments,
        "average_percentage": avg_percentage,
        "trend_data": trend_data,
        "recent_submissions": history,
        "question_grades": data.get("question_grades", [])
    }

@router.put("/{student_id}")
def edit_student(student_id: int, data: StudentUpdate):
    updated = db.update_student(
        student_id=student_id,
        name=data.name,
        class_name=data.class_name,
        subject=data.subject or "",
        email=data.email or "",
        notes=data.notes or ""
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Student not found")
    return {"success": True, "student": updated}

@router.delete("/{student_id}")
def delete_student(student_id: int):
    success = db.delete_student(student_id)
    if not success:
        raise HTTPException(status_code=404, detail="Student not found")
    return {"success": True, "message": "Student profile deleted successfully"}
