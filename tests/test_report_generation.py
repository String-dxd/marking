import sys
import os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
import pymupdf
from fastapi.testclient import TestClient
from app.main import app
from app.core import db
from app.core.report_generator import generate_pdf_report, escape_xml

client = TestClient(app)

def test_escape_xml():
    raw = "Formula: x < 5 & y > 10\nNext line"
    escaped = escape_xml(raw)
    assert "&lt;" in escaped
    assert "&gt;" in escaped
    assert "&amp;" in escaped
    assert "<br/>" in escaped
    assert escape_xml(None) == ""

def test_generate_pdf_basic(tmp_path):
    submission_data = {
        "id": 991,
        "student_name": "Hermione Granger",
        "student_code": "HG-001",
        "class_name": "Gryffindor 5A",
        "assignment_title": "Advanced Arithmancy & Potions",
        "assignment_subject": "Magical Theory",
        "total_score": 48.5,
        "assignment_max_marks": 50.0,
        "percentage": 97.0,
        "grade_letter": "A*",
        "overall_feedback": "Outstanding analytical rigor and impeccable execution throughout the examination.",
        "strengths_feedback": "Flawless algebra & formula manipulation.\nExtremely clear structured working.",
        "improvement_feedback": "Review precision in unit labels for final question.",
        "question_grades": [
            {
                "question_no": "1",
                "question_title": "Kinematics & Acceleration",
                "awarded_marks": 10.0,
                "max_marks": 10.0,
                "feedback_comment": "Perfect derivation of velocity and constant acceleration.",
                "extracted_answer": "v = u + at => 20 + (9.8)(3.5) = 54.3 m/s",
                "criteria": [
                    {"criterion": "Formula stated", "awarded": 2, "max": 2},
                    {"criterion": "Correct substitution", "awarded": 4, "max": 4},
                    {"criterion": "Accurate final value", "awarded": 4, "max": 4}
                ]
            },
            {
                "question_no": "2",
                "question_title": "Energy Conservation",
                "awarded_marks": 8.5,
                "max_marks": 10.0,
                "feedback_comment": "Minor rounding slip in intermediate calculation, but method is sound.",
                "extracted_answer": "Ek = 0.5 * m * v^2 = 0.5 * 1200 * (15)^2 = 135 kJ",
                "criteria": [
                    {"criterion": "Conservation principle applied", "awarded": 5, "max": 5},
                    {"criterion": "Final precision", "awarded": 3.5, "max": 5}
                ]
            }
        ]
    }
    
    out_pdf = str(tmp_path / "test_report_basic.pdf")
    generated_path = generate_pdf_report(submission_data, output_path=out_pdf)
    
    assert os.path.exists(generated_path)
    assert os.path.getsize(generated_path) > 1000
    
    doc = pymupdf.open(generated_path)
    assert len(doc) >= 1
    page1_text = doc[0].get_text("text")
    assert "Hermione Granger" in page1_text
    assert "Advanced Arithmancy & Potions" in page1_text
    assert "48.5" in page1_text
    assert "97.0%" in page1_text
    assert "A*" in page1_text
    assert "Flawless algebra" in page1_text
    assert "Kinematics & Acceleration" in page1_text
    doc.close()

def test_generate_pdf_special_characters_and_edge_cases(tmp_path):
    submission_data = {
        "id": 992,
        "student_name": "Tom & Jerry <Special Characters> 'Quotes' \"Double\"",
        "student_code": "SP-002",
        "class_name": "Science <Class B>",
        "assignment_title": "Maths: Inequalities (x < 10 & y > 20)",
        "assignment_subject": "Math & Logic",
        "total_score": 15.0,
        "assignment_max_marks": 30.0,
        "percentage": 50.0,
        "grade_letter": "C",
        "overall_feedback": "Ensure x < 10 is tested against all bounds & constraints.",
        "strengths_feedback": "Good attempt at handling & resolving signs.",
        "improvement_feedback": "Do not mix < with <= in inequalities.",
        "question_grades": [
            {
                "question_no": "1",
                "question_title": "Domain & Range (x < 0)",
                "awarded_marks": 5.0,
                "max_marks": 10.0,
                "feedback_comment": "Deduction: -5.0 for missing interval where a < x < b.",
                "extracted_answer": "x < 3 and x > -2. Proof: f(x) = (x & y) -> 0",
            }
        ]
    }
    
    out_pdf = str(tmp_path / "test_report_special.pdf")
    generated_path = generate_pdf_report(submission_data, output_path=out_pdf)
    
    assert os.path.exists(generated_path)
    doc = pymupdf.open(generated_path)
    page1_text = doc[0].get_text("text")
    assert "Tom" in page1_text
    assert "Jerry" in page1_text
    assert "Inequalities" in page1_text
    doc.close()

def test_generate_pdf_multipage(tmp_path):
    questions = []
    for i in range(1, 15):
        questions.append({
            "question_no": str(i),
            "question_title": f"Question Topic {i} - In-Depth Analysis",
            "awarded_marks": 8.0,
            "max_marks": 10.0,
            "feedback_comment": f"Detailed feedback for question {i}. Clear reasoning provided with good step-by-step working.",
            "extracted_answer": f"Student step-by-step solution for question {i} demonstrating complete understanding of the core concept."
        })
        
    submission_data = {
        "id": 993,
        "student_name": "Alex MultiPage",
        "student_code": "MP-003",
        "class_name": "Year 12",
        "assignment_title": "Comprehensive Final Exam",
        "assignment_subject": "Physics",
        "total_score": 112.0,
        "assignment_max_marks": 140.0,
        "percentage": 80.0,
        "grade_letter": "A",
        "overall_feedback": "Well-balanced performance across all sections.",
        "strengths_feedback": "Strong conceptual foundation.",
        "improvement_feedback": "Time management on later questions.",
        "question_grades": questions
    }
    
    out_pdf = str(tmp_path / "test_report_multipage.pdf")
    generated_path = generate_pdf_report(submission_data, output_path=out_pdf)
    
    assert os.path.exists(generated_path)
    doc = pymupdf.open(generated_path)
    assert len(doc) >= 2
    last_page_text = doc[-1].get_text("text")
    assert f"Page {len(doc)} of {len(doc)}" in last_page_text
    doc.close()

def test_api_report_endpoints():
    assign_id = db.create_assignment(
        title="Test Report API Assignment",
        subject="Biology",
        class_name="Class 10B",
        max_marks=50.0,
        marking_scheme_text="Q1: Cell structure"
    )
    
    student_id = db.get_or_create_student(
        name="Diana Prince",
        class_name="Class 10B",
        student_id_code="DP-007"
    )
    
    sub_id = db.create_submission(
        assignment_id=assign_id,
        student_id=student_id,
        scan_file_path="data/test.pdf",
        pages_json='[{"page_number": 1, "image_path": "data/test.png"}]'
    )
    
    db.approve_submission(
        submission_id=sub_id,
        total_score=45.0,
        percentage=90.0,
        grade_letter="A*",
        overall_feedback="Excellent biology analysis and diagrams.",
        strengths_feedback="Accurate anatomical labels.",
        improvement_feedback="Review chloroplast details.",
        questions=[
            {
                "question_no": "1",
                "question_title": "Cell Biology",
                "awarded_marks": 45.0,
                "max_marks": 50.0,
                "feedback_comment": "Superb work on organelles.",
                "extracted_answer": "Mitochondria is the powerhouse of the cell."
            }
        ]
    )
    
    resp_gen = client.post(f"/api/reports/{sub_id}/generate")
    assert resp_gen.status_code == 200
    data_gen = resp_gen.json()
    assert data_gen["success"] is True
    assert "/api/reports/" in data_gen["pdf_url"]
    
    resp_pdf = client.get(f"/api/reports/{sub_id}/pdf")
    assert resp_pdf.status_code == 200
    assert resp_pdf.headers["content-type"] == "application/pdf"
    assert len(resp_pdf.content) > 1000
    
    resp_html = client.get(f"/api/reports/{sub_id}/html")
    assert resp_html.status_code == 200
    assert "Diana Prince" in resp_html.text
    assert "Cell Biology" in resp_html.text
