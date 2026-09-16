import pytest
from app.core.direct_marker import (
    compute_criteria_bounding_boxes,
    ground_question_grades_to_annotations,
    burn_annotations_to_image
)
from PIL import Image

def test_compute_criteria_bounding_boxes_multi_column():
    criteria = [
        {"criterion": "Mitochondria", "awarded": 1.0, "max": 1.0},
        {"criterion": "Vacuole", "awarded": 1.0, "max": 1.0},
        {"criterion": "Cytoplasm", "awarded": 1.0, "max": 1.0},
        {"criterion": "Cell membrane", "awarded": 1.0, "max": 1.0},
        {"criterion": "Nucleus", "awarded": 1.0, "max": 1.0},
        {"criterion": "DNA", "awarded": 1.0, "max": 1.0},
    ]
    # Broad question box spanning across two columns (qw = 700)
    q_box = [330, 140, 530, 840]
    boxes = compute_criteria_bounding_boxes(criteria, q_box, page_image_path=None)
    assert len(boxes) == 6
    
    # First 3 should be in left column (xmin < 500)
    for b in boxes[:3]:
        assert b[1] < 500
        assert b[3] <= 550
    # Last 3 should be in right column (xmin >= 500)
    for b in boxes[3:]:
        assert b[1] >= 500
        assert b[3] <= 840

def test_ground_question_grades_suppresses_total_mark_when_criteria_present():
    q_grades = [
        {
            "question_no": "1",
            "page_number": 1,
            "awarded_marks": 6.0,
            "max_marks": 6.0,
            "bbox_2d": [330, 140, 530, 840],
            "feedback_comment": "All organelles identified correctly.",
            "criteria": [
                {"criterion": "Mitochondria", "awarded": 1.0, "max": 1.0},
                {"criterion": "Vacuole", "awarded": 1.0, "max": 1.0},
                {"criterion": "Cytoplasm", "awarded": 1.0, "max": 1.0},
                {"criterion": "Cell membrane", "awarded": 1.0, "max": 1.0},
                {"criterion": "Nucleus", "awarded": 1.0, "max": 1.0},
                {"criterion": "DNA", "awarded": 1.0, "max": 1.0},
            ]
        },
        {
            "question_no": "2",
            "page_number": 1,
            "awarded_marks": 0.0,
            "max_marks": 1.0,
            "bbox_2d": [650, 780, 690, 830],
            "feedback_comment": "Selected B instead of C",
            "criteria": []
        }
    ]
    pages = [{"page_number": 1, "image_path": None}]
    anns = ground_question_grades_to_annotations(q_grades, pages, show_comments=False)
    
    # Q1 should have 6 criteria annotations, but NO overarching ann_grounded_1 total score
    q1_anns = [a for a in anns if a.get("question_no") == "1"]
    assert len(q1_anns) == 6
    assert not any(a["id"] == "ann_grounded_1" for a in q1_anns)
    for a in q1_anns:
        assert a.get("is_criterion") is True
        assert a.get("score") == "1/1"
        assert a.get("type") == "tick"

    # Q2 has no criteria, so it MUST have ann_grounded_2
    q2_anns = [a for a in anns if a.get("question_no") == "2"]
    assert len(q2_anns) == 1
    assert q2_anns[0]["id"] == "ann_grounded_2"
    assert q2_anns[0]["score"] == "0/1"

def test_burn_annotations_with_criterion(tmp_path):
    img_path = tmp_path / "test_page.png"
    Image.new("RGB", (1000, 1400), color=(255, 255, 255)).save(str(img_path))
    anns = [
        {
            "id": "ann_grounded_1_c1",
            "page_number": 1,
            "question_no": "1",
            "type": "tick",
            "bbox_2d": [354, 198, 387, 355],
            "score": "1/1",
            "is_criterion": True
        },
        {
            "id": "ann_grounded_1_c4",
            "page_number": 1,
            "question_no": "1",
            "type": "tick",
            "bbox_2d": [329, 646, 364, 810],
            "score": "1/1",
            "is_criterion": True
        }
    ]
    burned = burn_annotations_to_image(str(img_path), anns, page_number=1)
    assert burned is not None
    assert burned.size == (1000, 1400)
