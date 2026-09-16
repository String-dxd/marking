import unittest
from unittest.mock import patch, MagicMock
import requests

from app.core.config import DEFAULT_GRADING_NUM_CTX, OLLAMA_GRADING_WORKERS
from app.core.marker_engine import extract_question_rubric_slice
from app.core.ollama_client import OllamaClient
from app.markers.lower_sec_science import LowerSecScienceMarker
from app.markers.general import GeneralMarker
from app.markers.base import BaseSubjectMarker

SAMPLE_RUBRIC_TEXT = """=== MARKING SCHEME & RUBRIC (TOTAL MARKS: 50) ===

Topic 1: Laboratory Measurements and Procedures

Question 1(a) (1 mark) [Focus: Lab safety]
- Suggested Answer: Heating without safety goggles OR pointing the mouth of the test tube towards another student.
- Criteria: 1 mark for stating either unsafe action.

Question 1(b) (1 mark) [Focus: Lab safety]
- Suggested Answer: Wear safety goggles OR point the mouth of the test tube away from everyone / towards an open area.
- Criteria: 1 mark for stating a correct corrective safety action.

Question 1(c) (1 mark) [Focus: Importance of safety guidelines]
- Suggested Answer: To prevent accidents/injuries, manage hazards, and keep oneself and others safe.
- Criteria: 1 mark for explaining why safety guidelines must be followed.

Question 2(a) (2 marks) [Focus: Volume measurement]
- Suggested Answer: Read at the bottom of the meniscus at eye level.
- Criteria: 1 mark for bottom of meniscus, 1 mark for eye level.
"""

SAMPLE_RUBRIC_JSON = [
    {
        "question_no": "1",
        "question_title": "Animal Cell Organelle Labelling",
        "max_marks": 2,
        "criteria": [
            {"criterion": "Mitochondrion", "max": 1, "description": "Powerhouse of cell"},
            {"criterion": "Nucleus", "max": 1, "description": "Contains genetic material"}
        ]
    },
    {
        "question_no": "2",
        "question_title": "Plant Cell Wall Function",
        "max_marks": 1,
        "criteria": [
            {"criterion": "Cell Wall", "max": 1, "description": "Provides structural support"}
        ]
    }
]

class TestBatchPipelineResilience(unittest.TestCase):

    def test_config_defaults(self):
        """Verify optimized context window and sequential worker defaults."""
        self.assertEqual(DEFAULT_GRADING_NUM_CTX, 4096)
        self.assertEqual(OLLAMA_GRADING_WORKERS, 1)

    def test_extract_question_rubric_slice_from_text(self):
        """Verify that extract_question_rubric_slice cleanly extracts only the target question's rubric."""
        slice_1a = extract_question_rubric_slice(SAMPLE_RUBRIC_TEXT, "1(a)")
        self.assertIsNotNone(slice_1a)
        self.assertIn("Question 1(a)", slice_1a)
        self.assertIn("Heating without safety goggles", slice_1a)
        self.assertNotIn("Question 1(b)", slice_1a)
        self.assertNotIn("Question 2(a)", slice_1a)

        slice_1b = extract_question_rubric_slice(SAMPLE_RUBRIC_TEXT, "1(b)")
        self.assertIsNotNone(slice_1b)
        self.assertIn("Question 1(b)", slice_1b)
        self.assertIn("Wear safety goggles", slice_1b)
        self.assertNotIn("Question 1(a)", slice_1b)

        slice_2a = extract_question_rubric_slice(SAMPLE_RUBRIC_TEXT, "2(a)")
        self.assertIsNotNone(slice_2a)
        self.assertIn("meniscus", slice_2a)

    def test_extract_question_rubric_slice_from_json(self):
        """Verify that extract_question_rubric_slice pulls targeted criteria from rubric_json."""
        slice_q1 = extract_question_rubric_slice("", "1", rubric_json=SAMPLE_RUBRIC_JSON)
        self.assertIsNotNone(slice_q1)
        self.assertIn("Animal Cell Organelle Labelling", slice_q1)
        self.assertIn("Mitochondrion", slice_q1)
        self.assertIn("Nucleus", slice_q1)
        self.assertNotIn("Plant Cell Wall Function", slice_q1)

    @patch("time.sleep")
    @patch("requests.post")
    def test_ollama_client_exponential_backoff_on_timeout(self, mock_post, mock_sleep):
        """Verify that OllamaClient retries with exponential backoff on ReadTimeout."""
        # Fail first 2 attempts with ReadTimeout, succeed on 3rd
        mock_post.side_effect = [
            requests.exceptions.ReadTimeout("Socket timed out"),
            requests.exceptions.ReadTimeout("Socket timed out"),
            MagicMock(status_code=200, json=lambda: {"message": {"content": "{\"awarded_marks\": 1.0}"}})
        ]

        client = OllamaClient()
        resp = client.generate_chat(
            model="qwen3.8:latest",
            messages=[{"role": "user", "content": "Grade this"}],
            max_retries=3,
            timeout=10
        )

        self.assertTrue(resp["success"])
        self.assertEqual(mock_post.call_count, 3)
        self.assertEqual(mock_sleep.call_count, 2)
        mock_sleep.assert_any_call(2.0)
        mock_sleep.assert_any_call(4.0)

    @patch("app.core.ollama_client.ollama_client.generate_chat")
    def test_lower_sec_science_marker_flags_evaluation_error(self, mock_chat):
        """Verify that when Ollama fails, science marker flags evaluation_error without silent zero score."""
        mock_chat.return_value = {
            "success": False,
            "error": "HTTPConnectionPool Read timed out (read timeout=120)"
        }

        marker = LowerSecScienceMarker()
        q = {
            "question_no": "1(a)",
            "question_title": "Question 1(a)",
            "max_marks": 2.0,
            "extracted_answer": "Heating with goggles"
        }
        res = marker.mark_single_question(
            q=q,
            assignment_info={"title": "Revision", "subject": "Science", "marking_scheme_text": SAMPLE_RUBRIC_TEXT},
            student_info={"name": "Alice"},
            reasoning_model="qwen3.8:latest"
        )

        self.assertTrue(res.get("evaluation_error"))
        self.assertIn("Read timed out", res.get("evaluation_error_message", ""))
        self.assertIn("Evaluation incomplete", res.get("feedback_comment", ""))
        self.assertNotIn("Incomplete or incorrect answer", res.get("feedback_comment", ""))

    @patch("app.core.ollama_client.ollama_client.generate_chat")
    def test_general_marker_flags_evaluation_error(self, mock_chat):
        """Verify that when Ollama fails, general marker flags evaluation_error without silent zero score."""
        mock_chat.return_value = {
            "success": False,
            "error": "Failed to reach Ollama: Connection refused"
        }

        marker = GeneralMarker()
        q = {
            "question_no": "1",
            "question_title": "Question 1",
            "max_marks": 5.0,
            "extracted_answer": "Sample answer"
        }
        res = marker.mark_single_question(
            q=q,
            assignment_info={"title": "Quiz", "subject": "General", "marking_scheme_text": "Q1: 5 marks"},
            student_info={"name": "Bob"},
            reasoning_model="qwen3.8:latest"
        )

        self.assertTrue(res.get("evaluation_error"))
        self.assertIn("Connection refused", res.get("evaluation_error_message", ""))
        self.assertIn("Evaluation incomplete", res.get("feedback_comment", ""))

    @patch.object(LowerSecScienceMarker, "mark_single_question")
    def test_base_marker_aborts_step1b_if_all_questions_fail(self, mock_mark):
        """Verify that if model evaluation fails on all questions, step1b returns success=False."""
        mock_mark.return_value = {
            "question_no": "1",
            "max_marks": 1.0,
            "awarded_marks": 0.0,
            "evaluation_error": True,
            "evaluation_error_message": "Read timed out"
        }

        marker = LowerSecScienceMarker()
        res = marker.mark_questions(
            assignment_info={"marking_scheme_text": "Q1 (1 mark)"},
            student_info={"name": "Alice"},
            questions=[{"question_no": "1", "max_marks": 1.0, "extracted_answer": "ans"}],
            reasoning_model="qwen3.8:latest"
        )

        self.assertFalse(res["success"])
        self.assertIn("Evaluation failed for all", res.get("error", ""))


if __name__ == "__main__":
    unittest.main()
