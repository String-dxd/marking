import unittest
from pathlib import Path
from PIL import Image
from app.core.direct_marker import burn_annotations_to_image

class TestRealSampleRendering(unittest.TestCase):
    def test_render_on_real_student_sample(self):
        sample_path = Path("C:/Users/hejia/.gemini/antigravity/brain/ed7a9ae4-cc4b-46ad-9d48-9f0a16824613/.user_uploaded/media_1788570348081.jpg")
        self.assertTrue(sample_path.exists(), "Sample A2 must exist")

        # Create annotations matching the teacher's red-ink marks
        annotations = [
            {
                "page_number": 1,
                "type": "block_prune",
                "bbox_2d": [120, 100, 180, 750],
                "remark": "删减拖沓起因"
            },
            {
                "page_number": 1,
                "type": "char_replace",
                "bbox_2d": [320, 410, 350, 450],
                "replacement": "漠",
                "remark": "冷漠之'漠'"
            },
            {
                "page_number": 1,
                "type": "caret_insert",
                "bbox_2d": [480, 200, 510, 300],
                "replacement": "输入搜索引擎",
                "remark": "词语搭配"
            },
            {
                "page_number": 1,
                "type": "margin_star",
                "bbox_2d": [560, 200, 600, 600],
                "remark": "你要想尽办法来帮他（要有三件小事来刻画）"
            }
        ]

        marked_img = burn_annotations_to_image(str(sample_path), annotations, page_number=1)
        self.assertIsNotNone(marked_img)
        self.assertIsInstance(marked_img, Image.Image)
        
        # Save output sample to reports dir
        out_dir = Path("data/reports")
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / "Verification_Marked_Sample_A2.jpg"
        marked_img.save(out_path, quality=95)
        self.assertTrue(out_path.exists())
        self.assertGreater(out_path.stat().st_size, 50000)
        print(f"\nRendered real sample marked image: {out_path} ({out_path.stat().st_size} bytes)")

if __name__ == "__main__":
    unittest.main()
