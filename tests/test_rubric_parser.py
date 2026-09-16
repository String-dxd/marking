import unittest
from pathlib import Path
from PIL import Image, ImageDraw
import pymupdf

from app.core.doc_parser import extract_text_from_file, extract_relevant_marking_scheme

class TestRubricParser(unittest.TestCase):

    def test_chinese_rubric_table_heuristics(self):
        rubric_text = """
| 等级 | 1 | 2 | 3 | 4 | 5 |
| 分数 | 25-30 | 19-24 | 13-18 | 7-12 | 1-6 |
| 内容 (30分) | 内容充实，切合题意；内容有层次，说明详尽、有条理 | 内容相当充实，相当切合题意；内容相当有层次 | 内容还算充实，还算切合题意；内容还算有层次 | 内容不太充实，不太切合题意 | 内容不足，不切合题意 |
| 语文与结构 (30分) | 语句通顺，汉字的书写、词语、语法及标点符号的运用绝大多数正确。用词丰富适当，句式正确且多样化 | 语句相当通顺，用词适当 | 语句还算通顺，用词还算适当 | 语句不太通顺，词汇有限 | 语句不通顺，词汇贫乏 |
"""
        extracted = extract_relevant_marking_scheme(rubric_text)
        self.assertIsInstance(extracted, dict)
        self.assertIn("clean_marking_scheme", extracted)
        self.assertIn("suggested_subject", extracted)
        self.assertIn("suggested_max_marks", extracted)
        
        # Verify subject is recognized as Chinese
        self.assertIn("Chinese", extracted["suggested_subject"])
        # Verify max marks calculated as 60.0 (30 Content + 30 Language)
        self.assertEqual(extracted["suggested_max_marks"], 60.0)
        # Verify table structure is fully preserved
        self.assertIn("内容 (30分)", extracted["clean_marking_scheme"])
        self.assertIn("语文与结构 (30分)", extracted["clean_marking_scheme"])
        # Verify rubric_json is structured with questions and criteria
        self.assertIn("rubric_json", extracted)
        self.assertIsInstance(extracted["rubric_json"], list)
        self.assertGreaterEqual(len(extracted["rubric_json"]), 1)
        # Verify first item has question_no, title, max_marks, and criteria list
        first_q = extracted["rubric_json"][0]
        self.assertIn("question_no", first_q)
        self.assertIn("question_title", first_q)
        self.assertIn("max_marks", first_q)
        self.assertIn("criteria", first_q)
        self.assertGreater(len(first_q["criteria"]), 0)
        self.assertIn("criterion", first_q["criteria"][0])
        self.assertIn("max", first_q["criteria"][0])

    def test_structured_science_rubric_parsing(self):
        from app.core.doc_parser import parse_rubric_structure
        science_text = """
Physics Test 1 - Marking Scheme
Q1 (2 marks) [Kinetic Energy]
- 1 mark: State formula KE = 1/2 mv^2
- 1 mark: Correct substitution and units (J)

Q2(a) (1 mark) [Variables]
- 1 mark: Independent variable is temperature

Q2(b) (2 marks) [Graphing]
- 1 mark: Accurate point plotting with +/- 0.5 grid tolerance
- 1 mark: Smooth curve of best fit drawn
"""
        parsed = parse_rubric_structure(science_text)
        self.assertTrue(parsed["success"] if "success" in parsed else True)
        self.assertIn("rubric_json", parsed)
        items = parsed["rubric_json"]
        self.assertEqual(len(items), 3)

        # Q1 checks
        self.assertEqual(items[0]["question_no"], "1")
        self.assertEqual(items[0]["max_marks"], 2.0)
        self.assertGreaterEqual(len(items[0]["criteria"]), 2)
        self.assertEqual(items[0]["criteria"][0]["max"], 1.0)
        self.assertEqual(items[0]["criteria"][1]["max"], 1.0)

        # Q2(a) checks
        self.assertIn("2(a)", items[1]["question_no"])
        self.assertEqual(items[1]["max_marks"], 1.0)

        # Q2(b) checks
        self.assertIn("2(b)", items[2]["question_no"])
        self.assertEqual(items[2]["max_marks"], 2.0)

    def test_parse_rubric_api_endpoint(self):
        from fastapi.testclient import TestClient
        from app.main import app
        client = TestClient(app)

        payload = {
            "text": "Q1 (2 marks) [Formulas]\n- 1 mark: Correct formula\n- 1 mark: Final calculation",
            "subject": "Physics",
            "title": "Kinetic Energy Quiz"
        }
        resp = client.post("/api/assignments/parse-rubric", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["success"])
        self.assertIn("rubric_json", data)
        self.assertIsInstance(data["rubric_json"], list)
        self.assertGreaterEqual(len(data["rubric_json"]), 1)
        self.assertEqual(data["rubric_json"][0]["question_no"], "1")
        self.assertEqual(data["rubric_json"][0]["max_marks"], 2.0)

    def test_scanned_pdf_detection(self):
        # Create a synthetic image-only PDF (no text layer)
        test_img_path = Path("tests/dummy_rubric_scan.png")
        test_pdf_path = Path("tests/dummy_rubric_scan.pdf")
        test_img_path.parent.mkdir(parents=True, exist_ok=True)

        img = Image.new("RGB", (800, 600), (255, 255, 255))
        draw = ImageDraw.Draw(img)
        draw.rectangle([(50, 50), (750, 550)], outline=(0, 0, 0), width=2)
        draw.text((70, 70), "Grade 10 Rubric Table", fill=(0, 0, 0))
        img.save(test_img_path)

        # Convert to PDF
        doc = pymupdf.open()
        img_doc = pymupdf.open(str(test_img_path))
        pdf_bytes = img_doc.convert_to_pdf()
        img_doc.close()
        pdf_page = pymupdf.open("pdf", pdf_bytes)
        doc.insert_pdf(pdf_page)
        pdf_page.close()
        doc.save(str(test_pdf_path))
        doc.close()

        self.assertTrue(test_pdf_path.exists())

        # Test extract_text_from_file on this image-only PDF
        # It should detect zero embedded text and run the vision pipeline without throwing an error
        result_text = extract_text_from_file(str(test_pdf_path))
        self.assertIsInstance(result_text, str)

        # Cleanup
        if test_img_path.exists():
            test_img_path.unlink()
        if test_pdf_path.exists():
            test_pdf_path.unlink()

if __name__ == "__main__":
    unittest.main()
