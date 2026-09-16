import pytest
from app.core.direct_marker import (
    strip_question_prefixes,
    simplify_remark_heuristic,
    ground_question_grades_to_annotations
)

def test_strip_question_prefixes():
    """Verifies that all variations of question numbers and score tags are stripped."""
    assert strip_question_prefixes("Q(a) [1/1]: ✓ Correct. The student accurately identified the hazard.") == "The student accurately identified the hazard."
    assert strip_question_prefixes("Q1: ✗ Error: Measured 3 cm instead of 3.3 cm.") == "Measured 3 cm instead of 3.3 cm."
    assert strip_question_prefixes("Question 2(a) [0/2]: Missing sequence.") == "Missing sequence."
    assert strip_question_prefixes("(b)(i): Swapped values.") == "Swapped values."
    assert strip_question_prefixes("Page 7 | [0/5]: Left completely blank.") == "Left completely blank."
    assert strip_question_prefixes("• Step 1: 1/1 ✓ Correct. All units present.") == "All units present."

def test_simplify_remark_heuristic():
    """Verifies rule-based simplification to max 7 words focusing on what is wrong."""
    # Full marks: empty or concise praise
    text, ok = simplify_remark_heuristic("Q1 [1/1]: ✓ Correct. Student showed all working.", is_full=True)
    assert ok is True
    assert len(text.split()) <= 7

    # Already concise error (<= 7 words)
    text, ok = simplify_remark_heuristic("Q(b): Swapped lightning and thunder times.", is_full=False)
    assert ok is True
    assert text == "Swapped lightning and thunder times."
    assert len(text.split()) <= 7

    # Blank question
    text, ok = simplify_remark_heuristic("✗ Error: No response was provided for Question 6(a).", is_full=False)
    assert ok is True
    assert text == "No response provided"
    assert len(text.split()) <= 7

    # Complex error that cannot be simplified -> triggers footnote
    text, ok = simplify_remark_heuristic(
        "The student only wrote step 2 without any sequence or ordering of the four required steps because they did not understand the procedure.",
        is_full=False
    )
    assert ok is False

def test_ground_question_grades_no_question_numbers_and_concise():
    """Verifies that grounded annotations have no question numbers, <= 7 words, and footnotes for complex errors."""
    q_grades = [
        {
            "question_no": "(a)",
            "awarded_marks": 1.0,
            "max_marks": 1.0,
            "feedback_comment": "✓ Correct. The student accurately identified the unsafe action.",
            "page_number": 1,
            "bbox_2d": [200, 100, 250, 600]
        },
        {
            "question_no": "(b)",
            "awarded_marks": 0.0,
            "max_marks": 1.0,
            "feedback_comment": "✗ Error: Swapped lightning and thunder times.",
            "page_number": 1,
            "bbox_2d": [300, 100, 350, 600]
        },
        {
            "question_no": "2(a)",
            "awarded_marks": 0.0,
            "max_marks": 2.0,
            "feedback_comment": "The student only wrote step 2 without any sequence or ordering of the four required steps because they misunderstood the prompt.",
            "page_number": 1,
            "bbox_2d": [400, 100, 450, 600]
        }
    ]
    pages = [{"page_number": 1, "image_path": "fake.jpg"}]

    anns = ground_question_grades_to_annotations(
        q_grades, pages, subject="Science", use_llm_rephrase=False, show_comments=True
    )

    # 1. Verify original parsed question_grades input is NOT modified
    assert q_grades[0]["feedback_comment"].startswith("✓ Correct.")
    assert q_grades[1]["feedback_comment"].startswith("✗ Error:")

    # Q(a): Full marks tick -> no question number in remark, remark <= 7 words
    ann_a = next(a for a in anns if a["question_no"] == "(a)" and a["type"] == "tick")
    assert "Q(a)" not in ann_a["remark"]
    assert "Q1" not in ann_a["remark"]
    assert len(ann_a["remark"].split()) <= 7

    # Q(b): Error cross -> no question number in remark, concise <= 7 words focusing on what is wrong
    ann_b = next(a for a in anns if a["question_no"] == "(b)" and a["type"] == "cross")
    assert "Q(b)" not in ann_b["remark"]
    assert len(ann_b["remark"].split()) <= 7
    assert "Swapped lightning and thunder times" in ann_b["remark"]
    assert "original_remark" in ann_b

    # Q2(a): Complex error -> cannot be simplified, gets asterisk and footnote near bottom margin
    ann_2a = next(a for a in anns if a["question_no"] == "2(a)" and a["type"] == "cross")
    assert ann_2a["remark"] == "*"
    assert ann_2a["is_asterisk"] is True

    # Footnote annotation exists near bottom margin
    footnotes = [a for a in anns if a.get("type") == "footnote"]
    assert len(footnotes) >= 1
    fn = footnotes[0]
    assert fn["page_number"] == 1
    assert fn["bbox_2d"][0] >= 920  # Positioned near bottom margin
    assert fn["remark"].startswith("*")
    assert "Q2(a)" not in fn["remark"]


def test_clean_visual_direct_marking_ticks_crosses_scores_and_graph_checklist():
    """Verifies that default mode renders only ticks/crosses with scores, clear graph checklist, and no comment overlap."""
    q_grades = [
        {
            "question_no": "4(a)",
            "awarded_marks": 0.0,
            "max_marks": 1.0,
            "feedback_comment": "✗ Error: Measured 3 cm instead of 3.3 cm.",
            "page_number": 3,
            "bbox_2d": [335, 720, 360, 760]
        },
        {
            "question_no": "4(b)(ii)",
            "awarded_marks": 1.0,
            "max_marks": 1.0,
            "feedback_comment": "✓ Correct. Calculated 09.63 - 04.28 = 05.35 s.",
            "page_number": 3,
            "bbox_2d": [810, 300, 885, 800]
        },
        {
            "question_no": "5(a)",
            "question_title": "Question 5(a)",
            "awarded_marks": 0.0,
            "max_marks": 4.0,
            "extracted_answer": "[Blank / No response] (graph grid empty, no plotted points)",
            "feedback_comment": "✗ Error: The graph grid is completely empty.",
            "page_number": 4,
            "bbox_2d": [370, 270, 690, 650],
            "criteria": [
                {"criterion": "Axes & Labels", "max": 1.0, "awarded": 0.0, "comment": "No axes labelled"},
                {"criterion": "Linear Scales", "max": 1.0, "awarded": 0.0, "comment": "No scales present"},
                {"criterion": "Plotting Accuracy", "max": 1.0, "awarded": 0.0, "comment": "No points plotted"},
                {"criterion": "Line of Best Fit", "max": 1.0, "awarded": 0.0, "comment": "No line drawn"}
            ]
        }
    ]
    pages = [
        {"page_number": 3, "image_path": "page_3.jpg"},
        {"page_number": 4, "image_path": "page_4.jpg"}
    ]

    anns = ground_question_grades_to_annotations(
        q_grades, pages, subject="Science", use_llm_rephrase=False, show_comments=False
    )

    # 1. Regular questions: no remarks beside ticks/crosses, only scores and symbols
    ann_4a = next(a for a in anns if a["question_no"] == "4(a)")
    assert ann_4a["type"] == "cross"
    assert ann_4a["score"] == "0/1"
    assert ann_4a["remark"] == ""
    assert "Measured 3 cm instead of 3.3 cm." in ann_4a["original_remark"]

    ann_4b = next(a for a in anns if a["question_no"] == "4(b)(ii)")
    assert ann_4b["type"] == "tick"
    assert ann_4b["score"] == "1/1"
    assert ann_4b["remark"] == ""

    # 2. No footnotes generated in clean mode
    footnotes = [a for a in anns if a.get("type") == "footnote"]
    assert len(footnotes) == 0

    # 3. Graph question 5(a): Overall score 0/4 at margin, symbol suppressed on grid
    ann_5a = next(a for a in anns if a["question_no"] == "5(a)" and not a.get("is_graph_checklist"))
    assert ann_5a["score"] == "0/4"
    assert ann_5a["suppress_symbol"] is True
    assert ann_5a["remark"] == ""

    # 4. Graph question 5(a): Clear Graph Marking Checklist annotations beside grid
    checklists = [a for a in anns if a.get("is_graph_checklist")]
    assert len(checklists) == 4
    for item in checklists:
        assert item["bbox_2d"][1] >= 670  # Positioned in open space to the right of the grid
        assert item["type"] == "cross"
        assert item["score"] == "0/1"
        assert any(crit in item["remark"] for crit in ["Axes & Labels", "Linear Scales", "Plotting Accuracy", "Line of Best Fit"])

