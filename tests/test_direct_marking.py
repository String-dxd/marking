import sys
import os
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from PIL import Image
import pymupdf
from fastapi.testclient import TestClient

from app.main import app
from app.core import db
from app.core.direct_marker import (
    burn_annotations_to_image,
    generate_direct_marking_pdf_report,
    normalize_bbox,
    clean_json_response
)

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db(tmp_path, monkeypatch):
    test_db = tmp_path / "test_marker.db"
    monkeypatch.setattr("app.core.config.DB_PATH", test_db)
    monkeypatch.setattr("app.core.db.DB_PATH", test_db)
    db.init_db()

def test_normalize_bbox():
    assert normalize_bbox([100, 200, 300, 400]) == [100, 200, 300, 400]
    assert normalize_bbox([100, 200, 100, 200]) == [100, 200, 150, 280]
    assert normalize_bbox(None) is None
    assert normalize_bbox([10, 20]) is None

def test_clean_json_response():
    raw_fence = "```json\n{\"page_annotations\": [{\"type\": \"tick\"}]}\n```"
    parsed = clean_json_response(raw_fence)
    assert parsed is not None
    assert "page_annotations" in parsed

    raw_think = "<think>evaluating</think>{\"page_annotations\": [{\"type\": \"cross\"}]}"
    parsed_think = clean_json_response(raw_think)
    assert parsed_think is not None
    assert parsed_think["page_annotations"][0]["type"] == "cross"

def test_burn_annotations_to_image(tmp_path):
    # Create sample blank image
    img_path = str(tmp_path / "sample_scan.jpg")
    img = Image.new("RGB", (1000, 1400), color=(250, 250, 250))
    img.save(img_path)

    sample_annotations = [
        {
            "id": "ann_1",
            "page_number": 1,
            "question_no": "1(a)",
            "type": "tick",
            "bbox_2d": [200, 150, 240, 600],
            "remark": "✓ Correct formula and working"
        },
        {
            "id": "ann_2",
            "page_number": 1,
            "question_no": "1(b)",
            "type": "circle",
            "bbox_2d": [350, 200, 380, 290],
            "remark": "⭕ Arithmetic error in denominator (-1)"
        },
        {
            "id": "ann_3",
            "page_number": 1,
            "question_no": "1(c)",
            "type": "cross",
            "bbox_2d": [500, 150, 540, 550],
            "remark": "✗ Missing final unit"
        }
    ]

    marked_img = burn_annotations_to_image(img_path, sample_annotations, page_number=1)
    assert marked_img is not None
    assert marked_img.size == (1000, 1400)
    assert marked_img.mode == "RGB"

def test_generate_direct_marking_pdf_report(tmp_path):
    img_path = str(tmp_path / "page_1.jpg")
    img = Image.new("RGB", (800, 1100), color=(255, 255, 255))
    img.save(img_path)

    submission_data = {
        "id": 101,
        "student_name": "Harry Potter",
        "student_code": "HP-007",
        "assignment_title": "Defense Against the Dark Arts Exam",
        "assignment_subject": "Spells & Potions",
        "total_score": 18.0,
        "assignment_max_marks": 20.0,
        "percentage": 90.0,
        "grade_letter": "A*",
        "pages_json": json.dumps([
            {
                "page_number": 1,
                "image_path": img_path,
                "width": 800,
                "height": 1100
            }
        ]),
        "annotations": [
            {
                "page_number": 1,
                "question_no": "1",
                "type": "tick",
                "bbox_2d": [200, 100, 250, 600],
                "remark": "✓ Perfect incantation formulation"
            }
        ]
    }

    out_pdf = str(tmp_path / "DirectMarked_Test.pdf")
    generated_path = generate_direct_marking_pdf_report(submission_data, output_path=out_pdf)

    assert os.path.exists(generated_path)
    doc = pymupdf.open(generated_path)
    assert len(doc) == 1
    doc.close()

def test_api_direct_marking_endpoints(tmp_path):
    # 1. Create student and assignment
    s_id = db.get_or_create_student(student_id_code="STU-001", name="Hermione Granger", class_name="General")
    conn = db.get_db_connection()
    c = conn.cursor()
    c.execute("INSERT INTO assignments (title, subject, class_name, max_marks, marking_scheme_text) VALUES (?, ?, ?, ?, ?)",
              ("Physics Final", "Physics", "General", 50.0, "Q1: 5 marks\nQ2: 5 marks"))
    a_id = c.lastrowid
    conn.commit()
    conn.close()

    img_path = str(tmp_path / "p1.jpg")
    img = Image.new("RGB", (600, 800), color=(255, 255, 255))
    img.save(img_path)

    pages = [{"page_number": 1, "image_path": img_path}]
    sub_id = db.create_submission(a_id, s_id, img_path, json.dumps(pages))

    # 2. Test updating and getting annotations via API
    test_anns = [
        {"page_number": 1, "question_no": "Q1", "type": "tick", "bbox_2d": [100, 100, 150, 300], "remark": "✓ Good"}
    ]
    put_resp = client.put(f"/api/submissions/{sub_id}/annotations", json={"annotations": test_anns})
    assert put_resp.status_code == 200
    assert put_resp.json()["success"] is True

    get_resp = client.get(f"/api/submissions/{sub_id}/annotations")
    assert get_resp.status_code == 200
    assert len(get_resp.json()["annotations"]) == 1
    assert get_resp.json()["annotations"][0]["remark"] == "✓ Good"

    # 3. Test deleting / clearing annotations via API
    del_resp = client.delete(f"/api/submissions/{sub_id}/annotations")
    assert del_resp.status_code == 200
    assert del_resp.json()["success"] is True
    assert del_resp.json()["annotations"] == []

    get_cleared_resp = client.get(f"/api/submissions/{sub_id}/annotations")
    assert get_cleared_resp.status_code == 200
    assert get_cleared_resp.json()["annotations"] == []

    # 4. Test PDF generation endpoint
    pdf_resp = client.get(f"/api/reports/{sub_id}/direct-marking-pdf")
    assert pdf_resp.status_code == 200
    assert pdf_resp.headers["content-type"] == "application/pdf"
    assert len(pdf_resp.content) > 1000

def test_generate_direct_marking_pdf_with_auto_synthesize(tmp_path):
    img_path = str(tmp_path / "page_auto.jpg")
    img = Image.new("RGB", (800, 1100), color=(255, 255, 255))
    img.save(img_path)

    # Submission has question grades but NO explicit annotations list
    submission_data = {
        "id": 202,
        "student_name": "Ron Weasley",
        "student_code": "RW-002",
        "assignment_title": "Transfiguration Exam",
        "assignment_subject": "Magic",
        "total_score": 15.0,
        "assignment_max_marks": 20.0,
        "percentage": 75.0,
        "grade_letter": "B",
        "pages_json": json.dumps([
            {"page_number": 1, "image_path": img_path, "width": 800, "height": 1100}
        ]),
        "question_grades": [
            {
                "question_no": "1",
                "question_title": "Matchstick to needle",
                "awarded_marks": 5.0,
                "max_marks": 5.0,
                "feedback_comment": "✓ Perfect incantation."
            },
            {
                "question_no": "2",
                "question_title": "Avifors spell",
                "awarded_marks": 3.0,
                "max_marks": 5.0,
                "feedback_comment": "Minor hand gesture flaw (-2)."
            }
        ]
    }

    out_pdf = str(tmp_path / "DirectMarked_Auto_Test.pdf")
    # Generate without passing annotations - should auto-synthesize
    generated_path = generate_direct_marking_pdf_report(submission_data, output_path=out_pdf)

    assert os.path.exists(generated_path)
    doc = pymupdf.open(generated_path)
    assert len(doc) == 1
    doc.close()

