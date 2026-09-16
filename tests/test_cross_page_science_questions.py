import pytest
from unittest.mock import patch, MagicMock
from pathlib import Path

from app.core.marker_engine import (
    parse_questions_from_ocr_text,
    resolve_question_continuity_across_pages,
    parse_marking_scheme_structure
)
from app.markers.lower_sec_science import LowerSecScienceMarker

REAL_RUBRIC_PATH = Path(__file__).resolve().parent.parent / "data" / "science_g1_revision_marking_scheme.txt"
REAL_RUBRIC_TEXT = REAL_RUBRIC_PATH.read_text(encoding="utf-8") if REAL_RUBRIC_PATH.exists() else ""


def test_parse_questions_from_ocr_text_with_isolated_subparts():
    """Test that OCR text containing isolated question sub-parts (without parent headers) is parsed correctly."""
    ocr_content = """(c) 39 °C [bbox: 200, 150, 250, 400]
(d) As heating time increases, temperature increases. [bbox: 400, 150, 480, 800]"""
    
    questions = parse_questions_from_ocr_text(ocr_content, page_num=7)
    assert len(questions) == 2, f"Expected 2 parsed questions, got {len(questions)}"
    
    assert questions[0]["question_no"] == "(c)"
    assert "39" in questions[0]["extracted_answer"]
    assert questions[0]["page_number"] == 7
    assert questions[0]["bbox_2d"] == [200, 150, 250, 400]

    assert questions[1]["question_no"] == "(d)"
    assert "increases" in questions[1]["extracted_answer"]
    assert questions[1]["page_number"] == 7
    assert questions[1]["bbox_2d"] == [400, 150, 480, 800]


def test_parse_questions_various_continuation_header_formats():
    """Verify that different subpart formats (c), c), c., c:, Part (c), Question (c), Question c are captured."""
    variations = [
        ("Question (c): 39 °C", "(c)"),
        ("Question c: 39 °C", "(c)"),
        ("Part (c): 39 °C", "(c)"),
        ("Part c: 39 °C", "(c)"),
        ("c) 39 °C", "(c)"),
        ("c. 39 °C", "(c)"),
        ("c: 39 °C", "(c)"),
        ("(c): 39 °C", "(c)"),
        ("(c) 39 °C", "(c)"),
        ("(c)(i) 39 °C", "(c)(i)"),
        ("(i) 4.28 s", "(i)"),
        ("i) 4.28 s", "(i)"),
        ("i. 4.28 s", "(i)"),
    ]

    for line, expected_clean_q in variations:
        qs = parse_questions_from_ocr_text(line, page_num=7)
        assert len(qs) == 1, f"Failed to parse variation: {line!r}"
        assert qs[0]["question_no"] == expected_clean_q, f"For line {line!r}: expected {expected_clean_q}, got {qs[0]['question_no']}"


def test_resolve_question_continuity_across_pages_basic():
    """Verify that Q5 on page 6 with (a) and (b), followed by (c) and (d) on page 7, resolves to 5(c) and 5(d)."""
    raw_extracted = [
        {"question_no": "5(a)", "question_title": "Question 5(a)", "extracted_answer": "[Graph]", "page_number": 6},
        {"question_no": "5(b)", "question_title": "Question 5(b)", "extracted_answer": "Thermometer", "page_number": 6},
        {"question_no": "(c)", "question_title": "Question (c)", "extracted_answer": "39 °C", "page_number": 7},
        {"question_no": "(d)", "question_title": "Question (d)", "extracted_answer": "Temperature increases", "page_number": 7},
    ]

    resolved = resolve_question_continuity_across_pages(raw_extracted)

    assert resolved[0]["question_no"] == "5(a)"
    assert resolved[0]["page_number"] == 6

    assert resolved[1]["question_no"] == "5(b)"
    assert resolved[1]["page_number"] == 6

    assert resolved[2]["question_no"] == "5(c)"
    assert resolved[2]["question_title"] == "Question 5(c)"
    assert resolved[2]["page_number"] == 7

    assert resolved[3]["question_no"] == "5(d)"
    assert resolved[3]["question_title"] == "Question 5(d)"
    assert resolved[3]["page_number"] == 7


def test_resolve_question_continuity_with_rubric_scheme():
    """Verify that resolved questions link to official rubric criteria and max marks from the marking scheme."""
    raw_extracted = [
        {"question_no": "5(a)", "question_title": "Question 5(a)", "max_marks": 5.0, "extracted_answer": "[Graph]", "page_number": 6},
        {"question_no": "5(b)", "question_title": "Question 5(b)", "max_marks": 5.0, "extracted_answer": "Thermometer", "page_number": 6},
        {"question_no": "(c)", "question_title": "Question (c)", "max_marks": 5.0, "extracted_answer": "39 °C", "page_number": 7},
        {"question_no": "(d)", "question_title": "Question (d)", "max_marks": 5.0, "extracted_answer": "Temperature increases with time", "page_number": 7},
    ]

    resolved = resolve_question_continuity_across_pages(raw_extracted, marking_scheme_text=REAL_RUBRIC_TEXT)

    # Question 5(a) in rubric is 4 marks (graph plotting)
    assert resolved[0]["question_no"] == "5(a)"
    assert resolved[0]["max_marks"] == 4.0

    # Question 5(b) in rubric is 1 mark
    assert resolved[1]["question_no"] == "5(b)"
    assert resolved[1]["max_marks"] == 1.0

    # Question 5(c) was resolved and matched rubric (1 mark, Reading graph / interpolation)
    assert resolved[2]["question_no"] == "5(c)"
    assert resolved[2]["max_marks"] == 1.0
    assert "Reading graph" in resolved[2]["question_title"]
    assert resolved[2]["page_number"] == 7

    # Question 5(d) was resolved and matched rubric (1 mark, Relationship between variables)
    assert resolved[3]["question_no"] == "5(d)"
    assert resolved[3]["max_marks"] == 1.0
    assert "Relationship between variables" in resolved[3]["question_title"]
    assert resolved[3]["page_number"] == 7


def test_resolve_question_continuity_roman_numerals():
    """Verify that roman numerals (i), (ii) correctly link to their parent subpart across pages."""
    raw_extracted = [
        {"question_no": "4(a)", "question_title": "Question 4(a)", "page_number": 3},
        {"question_no": "4(b)", "question_title": "Question 4(b)", "page_number": 3},
        {"question_no": "(i)", "question_title": "Question (i)", "page_number": 4},
        {"question_no": "(ii)", "question_title": "Question (ii)", "page_number": 4},
    ]

    resolved = resolve_question_continuity_across_pages(raw_extracted, marking_scheme_text=REAL_RUBRIC_TEXT)

    assert resolved[2]["question_no"] == "4(b)(i)"
    assert resolved[2]["page_number"] == 4
    assert resolved[2]["max_marks"] == 2.0  # From marking scheme

    assert resolved[3]["question_no"] == "4(b)(ii)"
    assert resolved[3]["page_number"] == 4
    assert resolved[3]["max_marks"] == 1.0  # From marking scheme


def test_lower_sec_science_marker_extract_student_responses_cross_page():
    """End-to-end extraction test simulating page 6 and page 7 with Question 5 continuation."""
    marker = LowerSecScienceMarker()

    page6_ocr = """Question 5(a): [Graph: X-axis="time / min", Y-axis="temperature / °C", Plotted Points: [(0,24), (1,30), (2,36), (3,42), (4,48), (5,54)], Line: "straight line of best fit drawn with ruler"] [bbox: 100, 100, 500, 900]
Question 5(b): Thermometer [bbox: 600, 100, 650, 400]"""

    page7_ocr = """(c) 39 °C [bbox: 200, 100, 250, 300]
(d) As heating time increases, temperature increases directly proportionally. [bbox: 350, 100, 420, 800]"""

    pages = [
        {"image_path": "fake_p6.png"},
        {"image_path": "fake_p7.png"}
    ]

    assignment_info = {
        "title": "G1 Science Revision Test",
        "subject": "Science",
        "max_marks": 50.0,
        "marking_scheme_text": REAL_RUBRIC_TEXT
    }
    student_info = {"name": "Alice Tan", "student_id": "S12345"}

    with patch("app.markers.lower_sec_science.get_page_base64", return_value="fake_b64"), \
         patch("app.markers.lower_sec_science.ollama_client.generate_chat") as mock_chat:
        
        mock_chat.side_effect = [
            {"success": True, "content": page6_ocr},
            {"success": True, "content": page7_ocr},
        ]

        result = marker.extract_student_responses(assignment_info, student_info, pages)
        
        assert result["success"] is True
        questions = result["questions"]
        assert len(questions) == 4

        # Page 6
        assert questions[0]["question_no"] == "5(a)"
        assert questions[0]["page_number"] == 1  # 1st passed page
        assert questions[0]["max_marks"] == 4.0

        assert questions[1]["question_no"] == "5(b)"
        assert questions[1]["page_number"] == 1
        assert questions[1]["max_marks"] == 1.0

        # Page 7 continued without Q5 header -> resolved to 5(c) and 5(d)
        assert questions[2]["question_no"] == "5(c)"
        assert questions[2]["page_number"] == 2  # 2nd passed page
        assert questions[2]["max_marks"] == 1.0
        assert "Reading graph" in questions[2]["question_title"]

        assert questions[3]["question_no"] == "5(d)"
        assert questions[3]["page_number"] == 2
        assert questions[3]["max_marks"] == 1.0
        assert "Relationship between variables" in questions[3]["question_title"]


def test_lower_sec_science_marker_mark_single_question_aliases():
    """Verify mark_single_question alias resolution for resolved 5(c) and 5(d)."""
    marker = LowerSecScienceMarker()
    assignment_info = {
        "title": "Science Assignment",
        "subject": "Science",
        "max_marks": 50.0,
        "marking_scheme_text": REAL_RUBRIC_TEXT
    }
    student_info = {"name": "Alice Tan"}

    q_5c = {
        "question_no": "5(c)",
        "question_title": "Question 5(c)",
        "max_marks": 5.0,  # Initially 5.0, mark_single_question should find 1.0 in scheme
        "extracted_answer": "39 °C",
        "page_number": 7
    }

    with patch("app.markers.lower_sec_science.ollama_client.generate_chat") as mock_chat:
        mock_chat.return_value = {
            "success": True,
            "content": '{"awarded_marks": 1.0, "criteria": [{"criterion": "Accurate reading", "max": 1.0, "awarded": 1.0, "comment": "✓ Correct reading of 39 °C."}], "feedback_comment": "✓ Correct (1.0/1.0 marks). Matches marking scheme."}'
        }

        graded = marker.mark_single_question(q_5c, assignment_info, student_info)

        # q_max was resolved from marking scheme for 5(c) to 1.0
        assert graded["max_marks"] == 1.0
        assert graded["awarded_marks"] == 1.0
        assert graded["question_no"] == "5(c)"
