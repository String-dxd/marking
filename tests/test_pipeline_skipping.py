import json
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
from app.main import app
from app.core import db

client = TestClient(app)

@pytest.fixture
def sample_assignment_and_sub(tmp_path):
    conn = db.get_db_connection()
    c = conn.cursor()
    c.execute("INSERT INTO students (student_id, name, class_name) VALUES (?, ?, ?)", ("STU-TEST-PIPE", "Pipeline Tester", "Class 1A"))
    student_id = c.lastrowid

    c.execute("""
        INSERT INTO assignments (title, subject, class_name, max_marks, marking_scheme_text, rubric_json, marker_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, ("Pipeline Test Assignment", "Science", "Class 1A", 20.0, "Rubric test", json.dumps([
        {"question_no": "1", "max_marks": 10, "criteria": [{"marks": 10, "description": "Correct"}]},
        {"question_no": "2", "max_marks": 10, "criteria": [{"marks": 10, "description": "Correct"}]}
    ]), "auto"))
    assignment_id = c.lastrowid

    dummy_pages = [{"page_number": 1, "image_path": str(tmp_path / "page_1.jpg"), "text": "Page 1"}]
    c.execute("""
        INSERT INTO submissions (assignment_id, student_id, pages_json, status, total_score, grade_letter, overall_feedback)
        VALUES (?, ?, ?, 'pending', 0.0, '--', '')
    """, (assignment_id, student_id, json.dumps(dummy_pages)))
    submission_id = c.lastrowid
    conn.commit()
    conn.close()

    yield {
        "assignment_id": assignment_id,
        "student_id": student_id,
        "submission_id": submission_id,
        "pages": dummy_pages
    }

    conn = db.get_db_connection()
    conn.execute("DELETE FROM question_grades WHERE submission_id = ?", (submission_id,))
    conn.execute("DELETE FROM submissions WHERE id = ?", (submission_id,))
    conn.execute("DELETE FROM assignments WHERE id = ?", (assignment_id,))
    conn.execute("DELETE FROM students WHERE id = ?", (student_id,))
    conn.commit()
    conn.close()

def test_pipeline_skips_when_steps_completed(sample_assignment_and_sub):
    sub_id = sample_assignment_and_sub["submission_id"]
    conn = db.get_db_connection()
    c = conn.cursor()
    c.execute("""
        INSERT INTO question_grades (submission_id, question_no, max_marks, awarded_marks, extracted_answer, feedback_comment)
        VALUES (?, '1', 10, 8, 'Extracted student handwriting answer', 'Good attempt')
    """, (sub_id,))
    c.execute("""
        UPDATE submissions
        SET overall_feedback = 'Great job!', grade_letter = 'A',
            annotations_json = '[{"type": "tick", "page_number": 1, "score": 8}]',
            status = 'review_ready'
        WHERE id = ?
    """, (sub_id,))
    conn.commit()
    conn.close()

    resp = client.post(f"/api/submissions/{sub_id}/run-pipeline", json={})
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert "step1" in data["steps_skipped"]
    assert "step2" in data["steps_skipped"]
    assert "step3" in data["steps_skipped"]
    assert data["steps_executed"] == []

def test_pipeline_executes_only_missing_step3(sample_assignment_and_sub):
    sub_id = sample_assignment_and_sub["submission_id"]
    conn = db.get_db_connection()
    c = conn.cursor()
    c.execute("""
        INSERT INTO question_grades (submission_id, question_no, max_marks, awarded_marks, extracted_answer, feedback_comment)
        VALUES (?, '1', 10, 8, 'Extracted student answer', 'Well done')
    """, (sub_id,))
    c.execute("""
        UPDATE submissions
        SET overall_feedback = 'Overall solid performance.', grade_letter = 'B',
            annotations_json = '[]',
            status = 'review_ready'
        WHERE id = ?
    """, (sub_id,))
    conn.commit()
    conn.close()

    mock_annotations = [{"type": "tick", "page_number": 1, "score": 8}]

    with patch("app.api.submissions.generate_direct_marking_annotations", return_value=mock_annotations) as mock_direct:
        resp = client.post(f"/api/submissions/{sub_id}/run-pipeline", json={})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "step1" in data["steps_skipped"]
        assert "step2" in data["steps_skipped"]
        assert "step3" in data["steps_executed"]
        assert mock_direct.called

def test_pipeline_executes_all_missing_steps(sample_assignment_and_sub):
    sub_id = sample_assignment_and_sub["submission_id"]
    mock_extract_res = {
        "success": True,
        "questions": [{"question_no": "1", "max_marks": 10, "extracted_answer": "Student handwriting"}],
        "ai_model_used": "mock_vision"
    }
    mock_mark_res = {
        "success": True,
        "total_score": 9.0,
        "percentage": 90.0,
        "grade_letter": "A",
        "overall_feedback": "Excellent work",
        "strengths_feedback": "Clear explanation",
        "improvement_feedback": "None",
        "questions": [{"question_no": "1", "max_marks": 10, "awarded_marks": 9.0, "extracted_answer": "Student handwriting"}]
    }
    mock_annotations = [{"type": "tick", "page_number": 1}]

    with patch("app.api.submissions.step1a_extract_student_responses_verbatim", return_value=mock_extract_res) as mock_ext, \
         patch("app.api.submissions.step2_mark_and_comment", return_value=mock_mark_res) as mock_mark, \
         patch("app.api.submissions.generate_direct_marking_annotations", return_value=mock_annotations) as mock_dm:

        resp = client.post(f"/api/submissions/{sub_id}/run-pipeline", json={})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["steps_skipped"] == []
        assert data["steps_executed"] == ["step1", "step2", "step3"]
        assert mock_ext.called
        assert mock_mark.called
        assert mock_dm.called

def test_batch_pipeline(sample_assignment_and_sub):
    sub_id = sample_assignment_and_sub["submission_id"]
    assign_id = sample_assignment_and_sub["assignment_id"]

    mock_extract_res = {
        "success": True,
        "questions": [{"question_no": "1", "max_marks": 10, "extracted_answer": "Batch handwriting"}],
        "ai_model_used": "mock_vision"
    }
    mock_mark_res = {
        "success": True,
        "total_score": 8.0,
        "percentage": 80.0,
        "grade_letter": "B",
        "overall_feedback": "Solid work",
        "strengths_feedback": "Good",
        "improvement_feedback": "None",
        "questions": [{"question_no": "1", "max_marks": 10, "awarded_marks": 8.0, "extracted_answer": "Batch handwriting"}]
    }
    mock_annotations = [{"type": "tick", "page_number": 1}]

    with patch("app.api.submissions.step1a_extract_student_responses_verbatim", return_value=mock_extract_res), \
         patch("app.api.submissions.step2_mark_and_comment", return_value=mock_mark_res), \
         patch("app.api.submissions.generate_direct_marking_annotations", return_value=mock_annotations):

        resp = client.post("/api/submissions/batch-pipeline", json={"assignment_id": assign_id})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["total"] == 1
        assert data["results"][0]["submission_id"] == sub_id
        assert data["results"][0]["steps_executed"] == ["step1", "step2", "step3"]

