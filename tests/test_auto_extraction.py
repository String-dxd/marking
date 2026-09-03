import sys
import os
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core import db
from app.core.marker_engine import extract_student_identity_from_scan

def test_student_auto_extraction_and_correction():
    print("Testing Student Auto-Extraction & Teacher Correction...")
    db.init_db()
    
    # 1. Test heuristic identity extraction from filename
    identity1 = extract_student_identity_from_scan(
        pages=[],
        filename="Emma_Watson_Term_Test.pdf",
        default_class="Class 10-A"
    )
    print("Extracted from filename:", identity1)
    assert identity1["name"] == "Emma Watson"
    assert identity1["class_name"] == "Class 10-A"
    
    # 2. Test extraction from page text
    mock_pages = [{
        "image_path": "",
        "extracted_text": "Candidate Name: Harry Potter\nCandidate No: HP-909\nClass: Grade 11 Science"
    }]
    identity2 = extract_student_identity_from_scan(
        pages=mock_pages,
        filename="scan_01.pdf"
    )
    print("Extracted from page text:", identity2)
    assert identity2["name"] == "Harry Potter"
    assert identity2["student_id"] == "HP-909"
    assert identity2["class_name"] == "Grade 11 Science"
    
    # 3. Test teacher correction in DB
    a_id = db.create_assignment("Physics Test", "Physics", "Grade 11", 50.0, "Rubric")
    s_id = db.get_or_create_student("TEMP-1", "Wrong Name", "Grade 11")
    sub_id = db.create_submission(a_id, s_id, "mock.pdf", "[]")
    
    # Teacher corrects name
    corrected = db.update_submission_student_info(sub_id, "Hermione Granger", "HG-001", "Grade 11 A")
    assert corrected["name"] == "Hermione Granger"
    
    sub = db.get_submission_by_id(sub_id)
    assert sub["student_name"] == "Hermione Granger"
    assert sub["student_code"] == "HG-001"
    print("Student Auto-Extraction & Teacher Correction passed!")

if __name__ == "__main__":
    test_student_auto_extraction_and_correction()
