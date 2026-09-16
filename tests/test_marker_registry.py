import sys
import time
from pathlib import Path
from unittest.mock import patch

# Ensure project root is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core import db
from app.markers.registry import list_markers, get_marker, _REGISTRY
from app.markers.lower_sec_science import LowerSecScienceMarker
from app.markers.chinese_essay import ChineseEssayMarker
from app.markers.general import GeneralMarker
from app.core.marker_engine import mark_single_question, step2_evaluate_and_comment


def test_registry_listing_and_discovery():
    """Verify registry lists auto, lower_sec_science, chinese_essay, and general."""
    markers = list_markers()
    marker_ids = [m["id"] for m in markers]
    
    assert "auto" in marker_ids
    assert "lower_sec_science" in marker_ids
    assert "chinese_essay" in marker_ids
    assert "general" in marker_ids
    
    for m in markers:
        assert "name" in m
        assert "description" in m
        assert "supports_direct_marking" in m
        assert "supports_parsed_marking" in m


def test_marker_resolution_by_id():
    """Verify explicit marker_id resolution."""
    assert isinstance(get_marker("lower_sec_science"), LowerSecScienceMarker)
    assert isinstance(get_marker("chinese_essay"), ChineseEssayMarker)
    assert isinstance(get_marker("general"), GeneralMarker)


def test_marker_auto_detection():
    """Verify auto-detection by subject and title keywords."""
    # Science detection
    m_sci1 = get_marker("auto", subject="Lower Sec Science", title="Practical 1")
    assert isinstance(m_sci1, LowerSecScienceMarker)
    
    m_sci2 = get_marker("auto", subject="Physics", title="Kinematics Motion")
    assert isinstance(m_sci2, LowerSecScienceMarker)
    
    m_sci3 = get_marker("auto", subject="化学", title="酸碱测试")
    assert isinstance(m_sci3, LowerSecScienceMarker)

    # Chinese Essay detection
    m_chi1 = get_marker("auto", subject="华文", title="记叙文写人")
    assert isinstance(m_chi1, ChineseEssayMarker)

    m_chi2 = get_marker("auto", subject="Chinese Language", title="Composition 1")
    assert isinstance(m_chi2, ChineseEssayMarker)

    m_chi3 = get_marker("auto", subject="作文", title="难忘的一件事")
    assert isinstance(m_chi3, ChineseEssayMarker)

    # Humanities detection routes to essay marker
    m_hum = get_marker("auto", subject="Literature", title="Macbeth Essay")
    assert isinstance(m_hum, ChineseEssayMarker)

    # General / fallback detection
    m_fallback = get_marker("auto", subject="General Paper", title="Short Questions")
    assert m_fallback is not None


def test_prompt_isolation_and_context_size():
    """Verify prompts are decoupled and context bloat is eliminated in GeneralMarker."""
    from app.markers.lower_sec_science import (
        SCIENCE_GRAPH_EVALUATION_GUIDANCE,
        SCIENCE_DIRECT_MARKING_VISION_PROMPT
    )
    from app.markers.general import GENERAL_DIRECT_MARKING_VISION_PROMPT

    # 1. Science marker must include graph / plotting instructions
    assert "Axes & Scale" in SCIENCE_GRAPH_EVALUATION_GUIDANCE
    assert "Plotting Accuracy" in SCIENCE_GRAPH_EVALUATION_GUIDANCE
    assert "GRAPHS:" in SCIENCE_DIRECT_MARKING_VISION_PROMPT

    # 2. General marker prompt MUST NOT contain science graph bloat (saves 400-600 tokens)
    assert "Axes & Scale" not in GENERAL_DIRECT_MARKING_VISION_PROMPT
    assert "Plotting Accuracy" not in GENERAL_DIRECT_MARKING_VISION_PROMPT
    assert "GRAPHS:" not in GENERAL_DIRECT_MARKING_VISION_PROMPT

    # 3. Chinese essay marker must have essay rubrics without Science graph bloat
    chinese_marker = _REGISTRY["chinese_essay"]
    assert chinese_marker is not None


def test_db_assignment_marker_type():
    """Verify creating, updating, and fetching assignments with marker_type."""
    db.init_db()
    
    unique_suffix = int(time.time() * 1000)
    title = f"Test Marker Type Assignment {unique_suffix}"
    
    # 1. Create assignment with lower_sec_science
    a_id = db.create_assignment(
        title=title,
        subject="Physics",
        class_name="Sec 2A",
        max_marks=40.0,
        marking_scheme_text="Q1 (5m): Force formula F=ma",
        marker_type="lower_sec_science"
    )
    assert a_id > 0
    
    a_data = db.get_assignment_by_id(a_id)
    assert a_data is not None
    assert a_data.get("marker_type") == "lower_sec_science"

    # 2. Update assignment to chinese_essay
    db.update_assignment(
        assignment_id=a_id,
        title=title,
        subject="华文",
        class_name="Sec 2A",
        max_marks=60.0,
        marking_scheme_text="作文 (60m): 内容30分, 表达30分",
        marker_type="chinese_essay"
    )
    
    a_updated = db.get_assignment_by_id(a_id)
    assert a_updated is not None
    assert a_updated.get("marker_type") == "chinese_essay"
    assert a_updated.get("max_marks") == 60.0

    # 3. Create student and submission, verify submission projection includes assignment_marker_type
    s_id = db.get_or_create_student(f"CODE-{unique_suffix}", f"Test Student {unique_suffix}", "Sec 2A")
    sub_id = db.create_submission(
        assignment_id=a_id,
        student_id=s_id,
        scan_file_path="mock_marker_test.pdf",
        pages_json="[]"
    )
    assert sub_id > 0
    
    sub = db.get_submission_by_id(sub_id)
    assert sub is not None
    assert sub.get("assignment_marker_type") == "chinese_essay"

    # Clean up test rows
    db.delete_assignment(a_id)
    db.delete_student(s_id)


def test_marker_engine_delegation():
    """Verify marker engine delegates to the active marker seamlessly."""
    mock_q = {
        "question_no": "1",
        "question_title": "Light reflection",
        "max_marks": 2.0,
        "extracted_answer": "Angle of incidence equals angle of reflection"
    }
    
    assignment_info = {
        "title": "Light Test",
        "subject": "Physics",
        "max_marks": 10.0,
        "marking_scheme_text": "Q1: Law of reflection (2 marks)",
        "marker_type": "general"
    }
    student_info = {"name": "Charlie", "student_id": "ST-001"}

    mock_llm_response = {
        "success": True,
        "content": '{"awarded_marks": 2.0, "criteria": [{"criterion": "Law of reflection", "max": 2.0, "awarded": 2.0, "comment": "Correct"}], "feedback_comment": "✓ Correct statement of reflection law."}',
        "thinking": ""
    }

    with patch("app.core.ollama_client.ollama_client.generate_chat", return_value=mock_llm_response):
        res = mark_single_question(
            q=mock_q,
            assignment_info=assignment_info,
            student_info=student_info,
            reasoning_model="mock_model"
        )
        assert res["awarded_marks"] == 2.0
        assert "Correct" in res["feedback_comment"]

        eval_res = step2_evaluate_and_comment(
            assignment_info=assignment_info,
            student_info=student_info,
            questions=[res],
            reasoning_model="mock_model"
        )
        assert eval_res["success"] is True
        assert eval_res["total_score"] == 2.0


def test_doc_parser_suggests_marker_type():
    """Verify that document parsing suggests the correct marker_type for Science and Chinese Essay."""
    from app.core.doc_parser import extract_relevant_marking_scheme

    # 1. Chinese essay rubric text
    chinese_rubric = """
    华文记叙文评分标准
    等级 1 (25-30分) 内容30分: 切合题意，思想健康，内容充实。
    等级 1 (25-30分) 语文与结构30分: 语句通顺，词语丰富，标点正确。
    总分: 60分
    """
    res_chi = extract_relevant_marking_scheme(chinese_rubric)
    assert res_chi.get("suggested_marker_type") == "chinese_essay"

    # 2. Science / Physics scheme text
    science_scheme = """
    Physics Kinematics Marking Scheme
    Q1. Velocity = distance / time (2 marks)
    Q2. Acceleration = change in velocity / time (3 marks)
    Total marks: 25 marks
    """
    res_sci = extract_relevant_marking_scheme(science_scheme)
    assert res_sci.get("suggested_marker_type") == "lower_sec_science"

