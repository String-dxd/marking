import unittest
from app.core.fallback_tracker import (
    record_fallback,
    get_current_fallbacks,
    clear_fallbacks,
    FallbackContext
)
from app.core.grid_paper_transcriptions import is_benchmark_grid_composition
from app.core.lined_paper_engine import detect_paper_medium

class TestFallbackNotices(unittest.TestCase):
    def setUp(self):
        clear_fallbacks()

    def tearDown(self):
        clear_fallbacks()

    def test_fallback_tracker_basic(self):
        self.assertEqual(len(get_current_fallbacks()), 0)
        record_fallback(
            source="JSON Parser",
            trigger="Invalid JSON in LLM response",
            action="Applied regex parser",
            details="Parsed 3 items"
        )
        fallbacks = get_current_fallbacks()
        self.assertEqual(len(fallbacks), 1)
        self.assertEqual(fallbacks[0]["source"], "JSON Parser")
        self.assertEqual(fallbacks[0]["trigger"], "Invalid JSON in LLM response")
        self.assertEqual(fallbacks[0]["action"], "Applied regex parser")
        self.assertEqual(fallbacks[0]["details"], "Parsed 3 items")

    def test_fallback_context_manager(self):
        with FallbackContext() as fb_ctx:
            self.assertFalse(fb_ctx.triggered)
            self.assertEqual(len(fb_ctx.fallbacks), 0)
            
            record_fallback("Score Bounds Clamping", "Score 29 out of bounds", "Clamped to 19.0")
            
            self.assertTrue(fb_ctx.triggered)
            self.assertEqual(len(fb_ctx.fallbacks), 1)
            self.assertEqual(fb_ctx.fallbacks[0]["source"], "Score Bounds Clamping")

    def test_multiple_fallbacks_accumulate(self):
        with FallbackContext() as fb_ctx:
            record_fallback("OCR Extraction", "No headers found", "Merged page")
            record_fallback("Direct Marking", "Vision model returned 0 annotations", "Fallback score box")
            
            self.assertTrue(fb_ctx.triggered)
            self.assertEqual(len(fb_ctx.fallbacks), 2)
            sources = [fb["source"] for fb in fb_ctx.fallbacks]
            self.assertIn("OCR Extraction", sources)
            self.assertIn("Direct Marking", sources)

    def test_submission_57_and_128_not_hardcoded(self):
        """Verify submissions 57 and 128 are NOT intercepted as benchmark mock compositions."""
        self.assertFalse(is_benchmark_grid_composition(57))
        self.assertFalse(is_benchmark_grid_composition("57"))
        self.assertFalse(is_benchmark_grid_composition(128))
        self.assertFalse(is_benchmark_grid_composition("128"))
        self.assertFalse(is_benchmark_grid_composition(sub_id=128, submission={"name": "Sample 2"}))
        
        # Only explicit benchmark tests are recognized
        self.assertTrue(is_benchmark_grid_composition("benchmark_test"))
        self.assertTrue(is_benchmark_grid_composition(submission={"is_benchmark_test": True}))

    def test_marker_engine_fallback_records(self):
        from app.core.marker_engine import parse_marked_questions_fallback
        with FallbackContext() as fb_ctx:
            qs = [{"question_no": "1", "question_title": "Q1", "max_marks": 5.0}]
            res = parse_marked_questions_fallback("Question 1: scored 4 marks. Well done.", qs)
            self.assertTrue(fb_ctx.triggered)
            self.assertEqual(fb_ctx.fallbacks[0]["source"], "JSON Parser")
            self.assertEqual(len(res), 1)
            self.assertEqual(res[0]["awarded_marks"], 4.0)

if __name__ == "__main__":
    unittest.main()
