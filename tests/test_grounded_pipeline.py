import sys
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from PIL import Image
from fastapi.testclient import TestClient

from app.main import app
from app.core import db
from app.core.marker_engine import parse_questions_from_ocr_text
from app.core.direct_marker import ground_question_grades_to_annotations, generate_direct_marking_annotations

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_test_db(tmp_path, monkeypatch):
    test_db = tmp_path / "test_grounded.db"
    monkeypatch.setattr("app.core.config.DB_PATH", test_db)
    monkeypatch.setattr("app.core.db.DB_PATH", test_db)
    db.init_db()

def test_stage1_parse_with_spatial_bounding():
    """Stage 1: Tests that parsing extracts or synthesizes physical coordinates [ymin, xmin, ymax, xmax]."""
    # 1. OCR output containing inline bbox
    raw_ocr_with_box = """
    Question 1(a): Force = mass * acceleration = 10 * 2 = 20 N [bbox: 250, 140, 300, 650]
    Question 1(b): 50 m/s [bbox: 420, 140, 460, 380]
    """
    parsed = parse_questions_from_ocr_text(raw_ocr_with_box, page_num=1)
    assert len(parsed) == 2
    assert parsed[0]["question_no"] == "1(a)"
    assert parsed[0]["bbox_2d"] == [250, 140, 300, 650]
    assert "Force = mass" in parsed[0]["extracted_answer"]
    assert "[bbox:" not in parsed[0]["extracted_answer"]
    assert parsed[1]["bbox_2d"] == [420, 140, 460, 380]

    # 2. OCR output without explicit bbox: should receive clean calculated vertical slots
    raw_ocr_plain = """
    Question 2(a): Photosynthesis occurs in chloroplasts.
    Question 2(b): Carbon dioxide and water.
    """
    parsed_plain = parse_questions_from_ocr_text(raw_ocr_plain, page_num=2)
    assert len(parsed_plain) == 2
    assert parsed_plain[0]["bbox_2d"] is not None
    assert len(parsed_plain[0]["bbox_2d"]) == 4
    assert parsed_plain[1]["bbox_2d"] is not None
    # Second question should be vertically below first
    assert parsed_plain[1]["bbox_2d"][0] > parsed_plain[0]["bbox_2d"][0]

def test_db_persistence_of_bbox_2d(tmp_path):
    """Verifies that bbox_2d is saved in question_grades and restored via get_submission_by_id."""
    s_id = db.get_or_create_student("STU-G1", "Grace Hopper", "Science A")
    conn = db.get_db_connection()
    c = conn.cursor()
    c.execute("INSERT INTO assignments (title, subject, class_name, max_marks) VALUES ('Physics Test', 'Physics', 'Science A', 20.0)")
    a_id = c.lastrowid
    conn.commit()
    conn.close()

    img_p = str(tmp_path / "page_g.jpg")
    Image.new("RGB", (800, 1100), (255, 255, 255)).save(img_p)
    pages = [{"page_number": 1, "image_path": img_p}]
    sub_id = db.create_submission(a_id, s_id, img_p, json.dumps(pages))

    questions = [
        {
            "question_no": "1",
            "question_title": "Newton's Second Law",
            "max_marks": 5.0,
            "awarded_marks": 5.0,
            "extracted_answer": "F = ma",
            "criteria": [],
            "feedback_comment": "✓ Correct formula.",
            "page_number": 1,
            "bbox_2d": [220, 150, 270, 500]
        },
        {
            "question_no": "2",
            "question_title": "Units of Force",
            "max_marks": 2.0,
            "awarded_marks": 0.0,
            "extracted_answer": "Joules",
            "criteria": [],
            "feedback_comment": "✗ Incorrect unit: expected Newtons (N).",
            "page_number": 1,
            "bbox_2d": [380, 150, 420, 350]
        }
    ]

    db.save_marking_results(
        submission_id=sub_id,
        total_score=5.0,
        percentage=25.0,
        grade_letter="E",
        overall_feedback="Review standard SI units.",
        strengths_feedback="Good grasp of formulas.",
        improvement_feedback="Revise units.",
        ai_model="test-reasoner",
        questions=questions
    )

    sub = db.get_submission_by_id(sub_id)
    assert sub is not None
    q_grades = sub["question_grades"]
    assert len(q_grades) == 2
    assert q_grades[0]["bbox_2d"] == [220, 150, 270, 500]
    assert q_grades[1]["bbox_2d"] == [380, 150, 420, 350]

def test_stage3_grounding_matches_evaluated_marks():
    """Stage 3: Verifies that visual annotations strictly match the reasoning model's evaluated marks."""
    pages = [{"page_number": 1, "image_path": "fake_page.jpg"}]
    q_grades = [
        {
            "question_no": "1",
            "awarded_marks": 5.0,
            "max_marks": 5.0,
            "feedback_comment": "Excellent derivation.",
            "page_number": 1,
            "bbox_2d": [200, 120, 260, 600]
        },
        {
            "question_no": "2",
            "awarded_marks": 2.5,
            "max_marks": 5.0,
            "feedback_comment": "Calculation error in denominator.",
            "page_number": 1,
            "bbox_2d": [340, 120, 400, 600]
        },
        {
            "question_no": "3",
            "awarded_marks": 0.0,
            "max_marks": 3.0,
            "feedback_comment": "Incorrect definition.",
            "page_number": 1,
            "bbox_2d": [500, 120, 550, 600]
        }
    ]

    annotations = ground_question_grades_to_annotations(q_grades, pages, subject="Science")
    assert len(annotations) == 3

    # Q1: Full marks -> tick
    assert annotations[0]["type"] == "tick"
    assert annotations[0]["score"] == "5/5"
    assert annotations[0]["bbox_2d"] == [200, 120, 260, 600]
    assert "Excellent derivation" in annotations[0]["remark"]

    # Q2: Partial marks -> circle
    assert annotations[1]["type"] == "circle"
    assert annotations[1]["score"] == "2.5/5"
    assert annotations[1]["bbox_2d"] == [340, 120, 400, 600]
    assert "Calculation error" in annotations[1]["remark"]

    # Q3: Zero marks -> cross
    assert annotations[2]["type"] == "cross"
    assert annotations[2]["score"] == "0/3"
    assert annotations[2]["bbox_2d"] == [500, 120, 550, 600]
    assert "Incorrect definition" in annotations[2]["remark"]

def test_teacher_in_the_loop_score_and_remark_propagation(tmp_path):
    """Verifies that teacher overrides in the UI immediately update the grounded visual annotations."""
    s_id = db.get_or_create_student("STU-T1", "Alan Turing", "CompSci")
    conn = db.get_db_connection()
    c = conn.cursor()
    c.execute("INSERT INTO assignments (title, subject, class_name, max_marks, marker_type) VALUES ('Algorithms', 'General', 'CompSci', 10.0, 'general')")
    a_id = c.lastrowid
    conn.commit()
    conn.close()

    img_p = str(tmp_path / "page_t.jpg")
    Image.new("RGB", (800, 1100), (255, 255, 255)).save(img_p)
    pages = [{"page_number": 1, "image_path": img_p}]
    sub_id = db.create_submission(a_id, s_id, img_p, json.dumps(pages))

    # Initial marking: Question 1 failed
    questions = [
        {
            "question_no": "1",
            "question_title": "Binary Search Complexity",
            "max_marks": 5.0,
            "awarded_marks": 0.0,
            "extracted_answer": "O(N)",
            "criteria": [],
            "feedback_comment": "Expected O(log N).",
            "page_number": 1,
            "bbox_2d": [300, 150, 350, 450]
        }
    ]
    db.save_marking_results(sub_id, 0.0, 0.0, "U", "Needs work", "", "", "test", questions)

    # Trigger direct marking
    resp1 = client.post(f"/api/submissions/{sub_id}/direct-mark")
    assert resp1.status_code == 200
    anns1 = resp1.json()["annotations"]
    assert len(anns1) == 1
    assert anns1[0]["type"] == "cross"
    assert anns1[0]["score"] == "0/5"

    # Teacher reviews and overrides in UI: recognizes valid alternative explanation, awards 5.0 marks!
    questions[0]["awarded_marks"] = 5.0
    questions[0]["feedback_comment"] = "Teacher override: Linear search comparison accepted."
    db.save_marking_results(sub_id, 5.0, 50.0, "C", "Acceptable", "", "", "teacher-override", questions)

    # Re-trigger direct marking
    resp2 = client.post(f"/api/submissions/{sub_id}/direct-mark")
    assert resp2.status_code == 200
    anns2 = resp2.json()["annotations"]
    assert len(anns2) == 1
    # Visual mark is now a tick with teacher's remark!
    assert anns2[0]["type"] == "tick"
    assert anns2[0]["score"] == "5/5"
    assert "Teacher override" in anns2[0]["remark"]
    assert anns2[0]["bbox_2d"] == [300, 150, 350, 450]
