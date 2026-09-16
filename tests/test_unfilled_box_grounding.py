import pytest
from pathlib import Path
from PIL import Image
from app.core.direct_marker import (
    compute_criteria_bounding_boxes,
    ground_question_grades_to_annotations,
    burn_annotations_to_image,
)

def test_compute_criteria_bounding_boxes_partially_unfilled():
    """
    When a student only fills in some boxes (e.g. Charlotte on Page 1 filled 2 of 6),
    OCR only returns ink coordinates for the filled right side.
    The detector must search the full diagram width and detect all 6 boxes across columns.
    """
    img_path = Path("data/processed/sub_538/page_1.jpg")
    if not img_path.exists():
        pytest.skip("Test image sub_538/page_1.jpg not found")

    criteria = [
        {"criterion": "Mitochondria", "awarded": 0.0, "max": 1.0},
        {"criterion": "Vacuole", "awarded": 0.0, "max": 1.0},
        {"criterion": "Cytoplasm", "awarded": 0.0, "max": 1.0},
        {"criterion": "Cell membrane", "awarded": 1.0, "max": 1.0},
        {"criterion": "Nucleus", "awarded": 1.0, "max": 1.0},
        {"criterion": "DNA", "awarded": 0.0, "max": 1.0},
    ]

    # q_box narrowed to right-hand filled answers only
    narrow_q_box = [335, 650, 430, 790]
    boxes = compute_criteria_bounding_boxes(criteria, narrow_q_box, page_image_path=str(img_path))

    assert len(boxes) == 6, f"Expected 6 boxes, got {len(boxes)}"

    left_boxes = [b for b in boxes if b[1] < 500]
    right_boxes = [b for b in boxes if b[1] >= 500]

    assert len(left_boxes) == 3, f"Expected 3 left-column boxes, got {len(left_boxes)}"
    assert len(right_boxes) == 3, f"Expected 3 right-column boxes, got {len(right_boxes)}"

    # Check that boxes do not overlap each other
    for i in range(len(boxes)):
        for j in range(i + 1, len(boxes)):
            b1 = boxes[i]
            b2 = boxes[j]
            # Verify they are distinct
            assert not (abs(b1[0] - b2[0]) < 10 and abs(b1[1] - b2[1]) < 10)


def test_compute_criteria_bounding_boxes_completely_unfilled():
    """
    When all boxes are blank/unfilled (e.g. Charlotte on Page 4 left all 6 boxes blank),
    the detector must detect the unfilled box contours and separate left and right columns cleanly.
    """
    img_path = Path("data/processed/sub_538/page_4.jpg")
    if not img_path.exists():
        pytest.skip("Test image sub_538/page_4.jpg not found")

    criteria = [
        {"criterion": "Chloroplast", "awarded": 0.0, "max": 1.0},
        {"criterion": "Nucleus", "awarded": 0.0, "max": 1.0},
        {"criterion": "Mitochondrion", "awarded": 0.0, "max": 1.0},
        {"criterion": "Cell wall", "awarded": 0.0, "max": 1.0},
        {"criterion": "Cell membrane", "awarded": 0.0, "max": 1.0},
        {"criterion": "Cytoplasm / Vacuole", "awarded": 0.0, "max": 1.0},
    ]

    q_box = [330, 160, 560, 810]
    boxes = compute_criteria_bounding_boxes(criteria, q_box, page_image_path=str(img_path))

    assert len(boxes) == 6, f"Expected 6 boxes, got {len(boxes)}"

    left_boxes = [b for b in boxes if b[1] < 500]
    right_boxes = [b for b in boxes if b[1] >= 500]

    assert len(left_boxes) == 3, f"Expected 3 left-column boxes, got {len(left_boxes)}"
    assert len(right_boxes) == 3, f"Expected 3 right-column boxes, got {len(right_boxes)}"


def test_compute_criteria_bounding_boxes_fallback():
    """Verify fallback grid partitioning when no image is provided."""
    criteria = [
        {"criterion": "A", "awarded": 1.0, "max": 1.0},
        {"criterion": "B", "awarded": 1.0, "max": 1.0},
        {"criterion": "C", "awarded": 1.0, "max": 1.0},
        {"criterion": "D", "awarded": 1.0, "max": 1.0},
    ]
    q_box = [300, 100, 600, 900]
    boxes = compute_criteria_bounding_boxes(criteria, q_box, page_image_path=None)
    assert len(boxes) == 4
    left = [b for b in boxes if b[1] < 500]
    right = [b for b in boxes if b[1] >= 500]
    assert len(left) == 2
    assert len(right) == 2


def test_ground_question_grades_header_pushdown():
    """
    If a question bounding box is placed inside the page header region (y < 220),
    it must be sanitized/pushed down to y >= 240 so annotations don't mark over the header.
    """
    q_grades = [
        {
            "question_no": "1",
            "page_number": 1,
            "awarded_marks": 0.0,
            "max_marks": 1.0,
            "bbox_2d": [120, 600, 180, 850],  # Header area
            "feedback_comment": "Omitted",
            "criteria": [],
        }
    ]
    pages = [{"page_number": 1, "image_path": None}]
    anns = ground_question_grades_to_annotations(q_grades, pages, show_comments=False)

    assert len(anns) == 1
    ann = anns[0]
    bbox = ann.get("bbox_2d")
    assert bbox is not None
    assert bbox[0] >= 240, f"Expected ymin >= 240, but got {bbox[0]}"


def test_burn_annotations_unfilled_and_mcq(tmp_path):
    """
    Verify rendering burned annotations with both criteria boxes and an MCQ bracket offset.
    """
    img_path = tmp_path / "test_sheet.png"
    Image.new("RGB", (1000, 1400), color=(255, 255, 255)).save(str(img_path))

    anns = [
        {
            "id": "ann_grounded_1_c1",
            "page_number": 1,
            "question_no": "1",
            "type": "cross",
            "bbox_2d": [359, 200, 386, 355],
            "score": "0/1",
            "is_criterion": True,
            "grounded": True,
        },
        {
            "id": "ann_grounded_2",
            "page_number": 1,
            "question_no": "2",
            "type": "tick",
            "bbox_2d": [660, 780, 690, 830],
            "score": "1/1",
            "grounded": True,
        },
    ]

    burned = burn_annotations_to_image(str(img_path), anns, page_number=1)
    assert burned is not None
    assert burned.size == (1000, 1400)


def test_compute_criteria_bounding_boxes_7_criteria_plant_cell():
    """
    Verifies that for a 7-criteria plant cell question (3 left, 4 right):
    1. Contour detection correctly identifies 3 left boxes and 4 right boxes without picking
       up internal diagram organelles.
    2. Fallback partitioning cleanly separates 3 left boxes and 4 right boxes without single-column collapsing.
    """
    criteria = [
        {"criterion": "Top Left: Chloroplast", "awarded": 0.0, "max": 1.0},
        {"criterion": "Middle Left: Nucleus", "awarded": 1.0, "max": 1.0},
        {"criterion": "Bottom Left: Mitochondrion", "awarded": 0.0, "max": 1.0},
        {"criterion": "Top Right: Cell wall", "awarded": 1.0, "max": 1.0},
        {"criterion": "Middle-Upper Right: Cell membrane", "awarded": 1.0, "max": 1.0},
        {"criterion": "Middle-Lower Right: Cytoplasm", "awarded": 1.0, "max": 1.0},
        {"criterion": "Bottom Right: Vacuole", "awarded": 0.0, "max": 1.0},
    ]
    q_box = [335, 165, 450, 812]

    # Test Fallback (image=None)
    fallback_boxes = compute_criteria_bounding_boxes(criteria, q_box, page_image_path=None)
    assert len(fallback_boxes) == 7
    fb_left = [b for b in fallback_boxes if b[1] < 500]
    fb_right = [b for b in fallback_boxes if b[1] >= 500]
    assert len(fb_left) == 3, f"Expected 3 left fallback boxes, got {len(fb_left)}"
    assert len(fb_right) == 4, f"Expected 4 right fallback boxes, got {len(fb_right)}"

    # Test with sub_535/page_4.jpg if present
    img_p = Path("data/processed/sub_535/page_4.jpg")
    if img_p.exists():
        detected = compute_criteria_bounding_boxes(criteria, q_box, page_image_path=str(img_p))
        assert len(detected) == 7
        det_left = [b for b in detected if (b[1] + b[3]) / 2.0 < 450]
        det_right = [b for b in detected if (b[1] + b[3]) / 2.0 > 550]
        assert len(det_left) == 3, f"Expected 3 left boxes, got {len(det_left)}"
        assert len(det_right) == 4, f"Expected 4 right boxes, got {len(det_right)}"
        # Verify no box is inside the central cell diagram (380..620)
        for b in detected:
            center_x = (b[1] + b[3]) / 2.0
            assert center_x < 380 or center_x > 620, f"Box {b} is inside central diagram!"

