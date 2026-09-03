import os
import sys
from pathlib import Path

# Ensure project root is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core import db
from app.core.config import DATA_DIR, REPORTS_DIR
from app.core.pdf_processor import reverse_pages_list, reorder_pages
from app.core.report_generator import generate_pdf_report
from app.core.marker_engine import clean_and_parse_json, compute_grade_letter

def test_db_operations():
    print("Testing Database operations...")
    db.init_db()
    
    import time
    unique_code = f"TEST-{int(time.time()*1000)}"
    student_name = f"Alex Mercer {unique_code}"
    s_id = db.get_or_create_student(unique_code, student_name, "Class 10-A", "alex@example.com")
    assert s_id > 0, "Student creation failed"
    
    # Create assignment
    a_id = db.create_assignment(
        title="Kinematics Test 1",
        subject="Physics",
        class_name="Class 10-A",
        max_marks=50.0,
        marking_scheme_text="Q1 (10m): v = u + at"
    )
    assert a_id > 0, "Assignment creation failed"
    
    # Create submission
    sub_id = db.create_submission(
        assignment_id=a_id,
        student_id=s_id,
        scan_file_path="mock_scan.pdf",
        pages_json="[]"
    )
    assert sub_id > 0, "Submission creation failed"
    
    # Save marking results
    questions = [
        {"question_no": "1", "question_title": "Kinematics Formula", "max_marks": 10.0, "awarded_marks": 9.0, "extracted_answer": "v = 15 m/s", "feedback_comment": "Great working"}
    ]
    db.save_marking_results(
        submission_id=sub_id,
        total_score=9.0,
        percentage=90.0,
        grade_letter="A*",
        overall_feedback="Excellent performance Alex!",
        strengths_feedback="Mastery of formulas",
        improvement_feedback="Minor units precision",
        ai_model="mock_qwen",
        questions=questions
    )
    
    # Approve submission
    db.approve_submission(
        submission_id=sub_id,
        total_score=9.0,
        percentage=90.0,
        grade_letter="A*",
        overall_feedback="Excellent work Alex! Approved by Teacher.",
        strengths_feedback="• Flawless algebraic working",
        improvement_feedback="• Keep showing units",
        questions=questions
    )
    
    # Verify performance history
    perf = db.get_student_performance_history(s_id)
    assert perf["student"]["name"] == student_name
    assert len(perf["history"]) == 1
    assert perf["history"][0]["percentage"] == 90.0
    
    # Clean up test assignment & student to avoid polluting the database
    db.delete_assignment(a_id)
    db.delete_student(s_id)
    print("Database operations passed (cleaned up temporary test assignment)!")

def test_reverse_pages_logic():
    print("Testing Reverse Page Order logic...")
    mock_pages = [
        {"page_number": 1, "image_path": "page_1.jpg"},
        {"page_number": 2, "image_path": "page_2.jpg"},
        {"page_number": 3, "image_path": "page_3.jpg"}
    ]
    
    reversed_p = reverse_pages_list(mock_pages)
    assert len(reversed_p) == 3
    assert reversed_p[0]["image_path"] == "page_3.jpg"
    assert reversed_p[0]["page_number"] == 1
    assert reversed_p[1]["image_path"] == "page_2.jpg"
    assert reversed_p[1]["page_number"] == 2
    assert reversed_p[2]["image_path"] == "page_1.jpg"
    assert reversed_p[2]["page_number"] == 3
    print("Reverse Page Order logic passed!")

def test_report_generation():
    print("Testing PDF Report Generation...")
    mock_submission = {
        "id": 999,
        "student_name": "Sarah Connor",
        "student_code": "STU-555",
        "class_name": "Year 11 Science",
        "assignment_title": "Thermodynamics Midterm",
        "assignment_subject": "Physics",
        "total_score": 42.5,
        "assignment_max_marks": 50.0,
        "percentage": 85.0,
        "grade_letter": "A",
        "overall_feedback": "Sarah demonstrated strong analytical thinking across all heat transfer calculations.",
        "strengths_feedback": "• Precise use of specific heat capacity formulas\n• Clear notation",
        "improvement_feedback": "• Beware of Celsius to Kelvin conversion errors",
        "question_grades": [
            {
                "question_no": "1",
                "question_title": "Heat Transfer Q=mcΔT",
                "awarded_marks": 10.0,
                "max_marks": 10.0,
                "feedback_comment": "Perfect derivation.",
                "extracted_answer": "Q = (2.5)(4184)(30) = 313.8 kJ"
            },
            {
                "question_no": "2",
                "question_title": "Carnot Efficiency",
                "awarded_marks": 8.5,
                "max_marks": 10.0,
                "feedback_comment": "Correct formula, minor rounding slip.",
                "extracted_answer": "Efficiency = 1 - (300/600) = 0.50"
            }
        ]
    }
    
    test_pdf_path = str(REPORTS_DIR / "Test_Report_Sarah.pdf")
    generated_path = generate_pdf_report(mock_submission, output_path=test_pdf_path)
    assert Path(generated_path).exists()
    assert Path(generated_path).stat().st_size > 1000
    print("PDF Report generation passed! Output file size:", Path(generated_path).stat().st_size, "bytes")

def test_json_parsing_and_grading_helper():
    print("Testing Marker Engine JSON sanitization...")
    raw_markdown = """
    Here is the evaluation:
    ```json
    {
      "questions": [
        {"question_no": "1", "max_marks": 5, "awarded_marks": 5}
      ],
      "total_awarded_marks": 5,
      "grade_letter": "A*"
    }
    ```
    """
    parsed = clean_and_parse_json(raw_markdown)
    assert parsed is not None
    assert parsed["grade_letter"] == "A*"
    assert parsed["total_awarded_marks"] == 5

    # Test <think> tag removal
    think_text = """<think>
    I am evaluating question 1...
    The answer is correct.
    </think>
    {
      "questions": [
        {"question_no": "1(a)", "awarded_marks": 4.0, "max_marks": 5.0}
      ]
    }"""
    parsed_think = clean_and_parse_json(think_text)
    assert parsed_think is not None
    assert len(parsed_think["questions"]) == 1

    # Test top-level array output from LLM
    list_text = """[
      {"question_no": "1", "awarded_marks": 3.0, "max_marks": 5.0, "feedback_comment": "Good"},
      {"question_no": "2", "awarded_marks": 5.0, "max_marks": 5.0, "feedback_comment": "Perfect"}
    ]"""
    parsed_list = clean_and_parse_json(list_text)
    assert parsed_list is not None
    assert "questions" in parsed_list
    assert len(parsed_list["questions"]) == 2

    # Test trailing comma repair
    trailing_comma_text = """{
      "questions": [
        {"question_no": "1", "awarded_marks": 3.0, "max_marks": 5.0,},
      ],
    }"""
    parsed_trailing = clean_and_parse_json(trailing_comma_text)
    assert parsed_trailing is not None
    assert len(parsed_trailing["questions"]) == 1

    # Test fallback parser when JSON is completely invalid prose
    from app.core.marker_engine import parse_marked_questions_fallback
    prose_content = """Question 1: The student scored 4.5 marks out of 5. Feedback: Excellent work.
    Question 2: Awarded: 3 marks. Feedback: Minor unit mistake."""
    orig_qs = [
        {"question_no": "1", "question_title": "Q1", "max_marks": 5.0, "extracted_answer": "ans 1"},
        {"question_no": "2", "question_title": "Q2", "max_marks": 4.0, "extracted_answer": "ans 2"}
    ]
    fb_parsed = parse_marked_questions_fallback(prose_content, orig_qs)
    assert len(fb_parsed) == 2
    assert fb_parsed[0]["awarded_marks"] == 4.5
    assert fb_parsed[1]["awarded_marks"] == 3.0
    
    assert compute_grade_letter(92.0) == "A*"
    assert compute_grade_letter(82.0) == "A"
    assert compute_grade_letter(72.0) == "B"
    assert compute_grade_letter(62.0) == "C"
    assert compute_grade_letter(52.0) == "D"
    assert compute_grade_letter(32.0) == "U"

    # Test mark_single_question blank handler
    from app.core.marker_engine import mark_single_question
    blank_q = {
        "question_no": "1",
        "question_title": "Mechanics",
        "max_marks": 5.0,
        "extracted_answer": "[Blank / No handwriting detected]"
    }
    marked_blank = mark_single_question(blank_q, {"title": "Test", "marking_scheme_text": ""}, {"name": "Alex"})
    assert marked_blank["awarded_marks"] == 0.0
    assert "blank" in marked_blank["feedback_comment"].lower()
    print("Marker Engine parsing passed!")

if __name__ == "__main__":
    test_db_operations()
    test_reverse_pages_logic()
    test_report_generation()
    test_json_parsing_and_grading_helper()
    print("\nAll automated tests completed successfully!")
