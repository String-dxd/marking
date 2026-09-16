import json
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
from app.main import app
from app.core import db

client = TestClient(app)

@pytest.fixture
def assignment_with_submissions(tmp_path):
    conn = db.get_db_connection()
    c = conn.cursor()
    c.execute("INSERT INTO students (student_id, name, class_name) VALUES (?, ?, ?)", ("STU-RERUN-1", "Alice Rerun", "Class 2B"))
    student_id_1 = c.lastrowid
    c.execute("INSERT INTO students (student_id, name, class_name) VALUES (?, ?, ?)", ("STU-RERUN-2", "Bob Rerun", "Class 2B"))
    student_id_2 = c.lastrowid

    initial_rubric = [
        {"question_no": "1", "question_title": "Question 1", "max_marks": 5.0, "criteria": [{"criterion": "Original criterion", "max": 5.0, "description": "Accurate"}]}
    ]

    c.execute("""
        INSERT INTO assignments (title, subject, class_name, max_marks, marking_scheme_text, rubric_json, marker_type)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, ("Science Quiz", "Science", "Class 2B", 5.0, "Original scheme text", json.dumps(initial_rubric), "general"))
    assignment_id = c.lastrowid

    dummy_pages = [{"page_number": 1, "image_path": str(tmp_path / "page_1.jpg"), "text": "Student work"}]
    
    # Submission 1: Already has step 1, 2, and 3 completed
    c.execute("""
        INSERT INTO submissions (assignment_id, student_id, pages_json, status, total_score, grade_letter, overall_feedback, annotations_json)
        VALUES (?, ?, ?, 'approved', 5.0, 'A', 'Initial overall remarks', '[{"type": "tick", "page_number": 1, "score": 5.0}]')
    """, (assignment_id, student_id_1, json.dumps(dummy_pages)))
    sub_id_1 = c.lastrowid

    c.execute("""
        INSERT INTO question_grades (submission_id, question_no, question_title, max_marks, awarded_marks, extracted_answer, feedback_comment, page_number)
        VALUES (?, '1', 'Question 1', 5.0, 5.0, 'Extracted handwriting answer text for Alice', 'Full marks awarded', 1)
    """, (sub_id_1,))

    # Submission 2: Only step 1 completed (has extracted answer, but not marked)
    c.execute("""
        INSERT INTO submissions (assignment_id, student_id, pages_json, status, total_score, grade_letter, overall_feedback, annotations_json)
        VALUES (?, ?, ?, 'pending', 0.0, '--', '', '[]')
    """, (assignment_id, student_id_2, json.dumps(dummy_pages)))
    sub_id_2 = c.lastrowid

    c.execute("""
        INSERT INTO question_grades (submission_id, question_no, question_title, max_marks, awarded_marks, extracted_answer, feedback_comment, page_number)
        VALUES (?, '1', 'Question 1', 5.0, 0.0, 'Extracted handwriting answer text for Bob', '', 1)
    """, (sub_id_2,))

    conn.commit()
    conn.close()

    yield {
        "assignment_id": assignment_id,
        "sub_id_1": sub_id_1,
        "sub_id_2": sub_id_2,
        "student_id_1": student_id_1,
        "student_id_2": student_id_2
    }

    conn = db.get_db_connection()
    conn.execute("DELETE FROM question_grades WHERE submission_id IN (?, ?)", (sub_id_1, sub_id_2))
    conn.execute("DELETE FROM submissions WHERE id IN (?, ?)", (sub_id_1, sub_id_2))
    conn.execute("DELETE FROM assignments WHERE id = ?", (assignment_id,))
    conn.execute("DELETE FROM students WHERE id IN (?, ?)", (student_id_1, student_id_2))
    conn.commit()
    conn.close()


def test_rerun_pipeline_endpoint_steps_2_and_3(assignment_with_submissions):
    aid = assignment_with_submissions["assignment_id"]
    sub1 = assignment_with_submissions["sub_id_1"]
    sub2 = assignment_with_submissions["sub_id_2"]

    # 1. Update assignment marking scheme with a new rubric & text
    updated_rubric = [
        {"question_no": "1", "question_title": "Question 1 (Revised)", "max_marks": 10.0, "criteria": [{"criterion": "Revised criterion", "max": 10.0, "description": "Thorough analysis"}]}
    ]
    update_res = client.put(f"/api/assignments/{aid}", json={
        "title": "Science Quiz",
        "subject": "Science",
        "class_name": "Class 2B",
        "max_marks": 10.0,
        "marking_scheme_text": "Updated strict marking scheme",
        "rubric_json": json.dumps(updated_rubric),
        "marker_type": "general"
    })
    assert update_res.status_code == 200
    assert update_res.json()["success"] is True

    # 2. Mock step 2 and step 3 executions
    def mock_mark_func(assignment_info, student_info, questions, reasoning_model):
        q = questions[0] if questions else {}
        return {
            "success": True,
            "total_score": 8.0,
            "max_marks": 10.0,
            "percentage": 80.0,
            "grade_letter": "B",
            "overall_feedback": "Graded with updated marking scheme.",
            "strengths_feedback": "Good vocabulary",
            "improvement_feedback": "Expand reasoning",
            "questions": [
                {
                    "question_no": "1",
                    "question_title": "Question 1 (Revised)",
                    "max_marks": 10.0,
                    "awarded_marks": 8.0,
                    "extracted_answer": q.get("extracted_answer", ""),
                    "feedback_comment": "Met revised rubric criteria."
                }
            ]
        }
    mock_annotations = [{"type": "tick", "page_number": 1, "score": 8.0}]

    with patch("app.api.submissions.step1a_extract_student_responses_verbatim") as mock_extract, \
         patch("app.api.submissions.step2_mark_and_comment", side_effect=mock_mark_func) as mock_mark, \
         patch("app.api.submissions.generate_direct_marking_annotations", return_value=mock_annotations) as mock_direct:

        resp = client.post(f"/api/assignments/{aid}/rerun-pipeline", json={
            "force_steps": ["step2", "step3"],
            "include_approved": True
        })

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["total"] == 2
        assert data["steps_forced"] == ["step2", "step3"]

        # Step 1 should NEVER have been called because both submissions already had extracted text!
        assert not mock_extract.called

        # Step 2 and Step 3 should have been called for both submissions
        assert mock_mark.call_count == 2
        assert mock_direct.call_count == 2

        results = data["results"]
        for r in results:
            assert "step1" in r["steps_skipped"]
            assert "step2" in r["steps_executed"]
            assert "step3" in r["steps_executed"]

    # 3. Verify submission 1 in DB has updated marks from the new scheme
    sub1_db = db.get_submission_by_id(sub1)
    assert sub1_db["total_score"] == 8.0
    assert sub1_db["grade_letter"] == "B"
    assert "updated marking scheme" in sub1_db["overall_feedback"]
    assert len(sub1_db["question_grades"]) == 1
    # Check that extracted text was preserved
    assert sub1_db["question_grades"][0]["extracted_answer"] == "Extracted handwriting answer text for Alice"
    assert sub1_db["question_grades"][0]["max_marks"] == 10.0


def test_batch_pipeline_force_steps(assignment_with_submissions):
    aid = assignment_with_submissions["assignment_id"]
    sub1 = assignment_with_submissions["sub_id_1"]

    mock_mark_res = {
        "success": True,
        "total_score": 7.0,
        "max_marks": 5.0,
        "percentage": 70.0,
        "grade_letter": "B",
        "overall_feedback": "Re-marked via batch endpoint.",
        "strengths_feedback": "Clear",
        "improvement_feedback": "None",
        "questions": [{"question_no": "1", "max_marks": 5.0, "awarded_marks": 3.5, "extracted_answer": "Preserved"}]
    }

    with patch("app.api.submissions.step1a_extract_student_responses_verbatim") as mock_extract, \
         patch("app.api.submissions.step2_mark_and_comment", return_value=mock_mark_res), \
         patch("app.api.submissions.generate_direct_marking_annotations", return_value=[]):

        resp = client.post("/api/submissions/batch-pipeline", json={
            "assignment_id": aid,
            "force_steps": ["step2", "step3"],
            "include_approved": True
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert len(data["results"]) == 2
        # Both submissions ran steps 2 and 3, skipping step 1
        assert not mock_extract.called
        assert all("step1" in r.get("steps_skipped", []) for r in data["results"])
        assert all("step2" in r.get("steps_executed", []) for r in data["results"])


def test_base_marker_realigns_questions_with_updated_scheme():
    from app.markers.general import GeneralMarker
    marker = GeneralMarker()

    # Original questions that were extracted under an old 2-mark scheme
    extracted_questions = [
        {
            "question_no": "1",
            "question_title": "Question 1",
            "max_marks": 2.0,
            "extracted_answer": "Photosynthesis is the process plants use to convert light into chemical energy.",
            "criteria": [{"criterion": "Old Criterion", "max": 2.0, "awarded": 0.0}]
        }
    ]

    # Updated assignment marking scheme: question 1 now has 6 marks and 2 new criteria
    assignment_info = {
        "title": "Plant Biology",
        "subject": "Biology",
        "max_marks": 6.0,
        "marking_scheme_text": "Q1: Photosynthesis definition and energy transformation (6 marks)",
        "rubric_json": [
            {
                "question_no": "1",
                "question_title": "Question 1 (Photosynthesis)",
                "max_marks": 6.0,
                "criteria": [
                    {"criterion": "Light conversion", "max": 3.0, "description": "Mentions sunlight conversion"},
                    {"criterion": "Chemical energy", "max": 3.0, "description": "Mentions glucose/chemical energy"}
                ]
            }
        ]
    }
    student_info = {"name": "Test Student", "student_id": "TS1"}

    # Mock mark_single_question so we can see what questions it receives
    received_q = {}
    def mock_mark_single(q, assignment_info, student_info, reasoning_model):
        received_q.update(q)
        return {
            **q,
            "awarded_marks": 6.0,
            "feedback_comment": "Excellent answer."
        }

    with patch.object(marker, "mark_single_question", side_effect=mock_mark_single):
        result = marker.mark_questions(
            questions=extracted_questions,
            assignment_info=assignment_info,
            student_info=student_info,
            reasoning_model="mock-model"
        )
        assert result["success"] is True
        # Verify the question was aligned with the updated scheme: max marks updated to 6.0 and criteria updated
        assert received_q["max_marks"] == 6.0
        assert received_q["question_title"] == "Question 1 (Photosynthesis)"
        assert len(received_q["criteria"]) == 2
        assert received_q["extracted_answer"] == "Photosynthesis is the process plants use to convert light into chemical energy."
