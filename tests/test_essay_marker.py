import os
import json
import unittest
from unittest.mock import patch
from PIL import Image, ImageDraw
from pathlib import Path

from app.core.layout_engine import LayoutEngine
from app.core.essay_marker import is_essay_or_humanities, is_chinese_subject, clean_json_response
from app.core.direct_marker import burn_annotations_to_image

class TestEssayMarker(unittest.TestCase):

    def test_subject_classification(self):
        # Chinese subjects
        self.assertTrue(is_chinese_subject("Chinese", "Paper 1 Composition"))
        self.assertTrue(is_chinese_subject("华文", "中三记叙文"))
        self.assertTrue(is_essay_or_humanities("华文", "Q1 作文"))
        
        # English & Humanities
        self.assertTrue(is_essay_or_humanities("English", "Argumentative Essay"))
        self.assertTrue(is_essay_or_humanities("History", "Cold War Source-Based Question"))
        self.assertTrue(is_essay_or_humanities("Social Studies", "Issue 1 Structured Response"))
        self.assertTrue(is_essay_or_humanities("Economics", "Macroeconomics Essay"))
        
        # STEM (Should not be classified as essay)
        self.assertFalse(is_essay_or_humanities("Physics", "Kinematics Graph Plotting"))
        self.assertFalse(is_essay_or_humanities("Mathematics", "Algebraic Expressions"))

    def test_layout_engine_line_profiling(self):
        # Create synthetic lined image (1000 x 1400)
        img = Image.new("RGB", (1000, 1400), (255, 255, 255))
        draw = ImageDraw.Draw(img)
        # Draw 10 horizontal ruled lines with simulated handwriting
        for i in range(1, 11):
            y = 150 + (i * 100)
            draw.line([(80, y), (920, y)], fill=(200, 220, 240), width=1)
            # Simulated ink marks on line
            draw.rectangle([(100, y - 25), (850, y - 5)], fill=(30, 30, 30))
            
        profiles = LayoutEngine.profile_text_lines(img)
        self.assertIsInstance(profiles, list)
        self.assertGreater(len(profiles), 3)
        for p in profiles:
            self.assertIn("ymin", p)
            self.assertIn("baseline", p)
            self.assertIn("headroom", p)
            self.assertIn("norm_ymin", p)

    def test_layout_engine_substring_span(self):
        full_line = "我们在等车的过程中，老伯把地点放进手机，找出最快的走法"
        subphrase = "放进手机"
        x1, x2 = LayoutEngine.locate_substring_span(full_line, subphrase, line_xmin=100.0, line_xmax=900.0)
        self.assertGreater(x1, 100.0)
        self.assertLess(x2, 900.0)
        self.assertGreater(x2, x1)

    def test_collision_avoidance_tiers(self):
        # Tier A: Ample headroom (headroom = 25px >= 14px)
        tier_a = LayoutEngine.route_collision_free_placement(
            ann_type="char_replace",
            target_bbox=[300, 200, 340, 260],
            remark="漠",
            headroom_px=25.0,
            page_w=1000,
            page_h=1400
        )
        self.assertEqual(tier_a["tier"], "Tier_A_Interlinear")
        self.assertFalse(tier_a["use_leader_line"])

        # Tier B: Crowded headroom (headroom = 5px < 14px) -> Triggers 45° leader line
        tier_b = LayoutEngine.route_collision_free_placement(
            ann_type="char_replace",
            target_bbox=[300, 200, 340, 260],
            remark="漠",
            headroom_px=5.0,
            page_w=1000,
            page_h=1400
        )
        self.assertEqual(tier_b["tier"], "Tier_B_LeaderLine")
        self.assertTrue(tier_b["use_leader_line"])
        self.assertIn("leader_line_coords", tier_b)

        # Tier C: Margin star / long scaffolding note -> Pinned in margin
        tier_c = LayoutEngine.route_collision_free_placement(
            ann_type="margin_star",
            target_bbox=[300, 200, 340, 260],
            remark="你要想尽办法来帮他（要有三件小事来刻画）",
            headroom_px=20.0,
            page_w=1000,
            page_h=1400
        )
        self.assertEqual(tier_c["tier"], "Tier_C_Margin")

    def test_burn_annotations_with_cjk_fonts(self):
        # Create dummy image and save to temporary location
        test_img_path = Path("tests/dummy_page.png")
        test_img_path.parent.mkdir(parents=True, exist_ok=True)
        img = Image.new("RGB", (1000, 1400), (255, 255, 255))
        img.save(str(test_img_path))

        annotations = [
            {
                "page_number": 1,
                "type": "char_replace",
                "bbox_2d": [200, 300, 240, 350],
                "replacement": "漠",
                "remark": "漠"
            },
            {
                "page_number": 1,
                "type": "word_delete",
                "bbox_2d": [300, 100, 340, 400],
                "remark": "删减冗余"
            },
            {
                "page_number": 1,
                "type": "caret_insert",
                "bbox_2d": [400, 200, 440, 250],
                "replacement": "抵达",
                "remark": "抵达"
            },
            {
                "page_number": 1,
                "type": "margin_star",
                "bbox_2d": [500, 200, 540, 500],
                "remark": "想尽办法要有三件小事刻画"
            },
            {
                "page_number": 1,
                "type": "logic_cross",
                "bbox_2d": [600, 200, 640, 500],
                "remark": "迟到了就无法比赛"
            }
        ]

        marked_pil = burn_annotations_to_image(str(test_img_path), annotations, page_number=1)
        self.assertIsNotNone(marked_pil)
        self.assertEqual(marked_pil.size, (1000, 1400))

        # Cleanup
        if test_img_path.exists():
            test_img_path.unlink()

    def test_clean_json_response(self):
        raw = """
        <think>Let me evaluate this essay carefully.</think>
        ```json
        {
            "scores": {"content": 19, "language": 18, "total": 37},
            "page_annotations": [
                {"type": "char_replace", "replacement": "漠"}
            ]
        }
        ```
        """
        parsed = clean_json_response(raw)
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed["scores"]["total"], 37)
        self.assertEqual(len(parsed["page_annotations"]), 1)

    def test_find_best_anchor_in_lines(self):
        from app.core.essay_marker import find_best_anchor_in_lines, ground_annotations_to_grid
        lines = [
            "阳光透过窗，抚摸了我的脸庞，",
            "看着手机地图，我不禁想到想：",
            "如果没有发生那件事，我应该还会对",
            "别人的烦恼那么冷模吧？"
        ]
        # 1. Exact match
        s_l, s_c, e_l, e_c = find_best_anchor_in_lines("模", "冷模", lines)
        self.assertEqual(s_l, 4)
        self.assertEqual(e_l, 4)
        self.assertEqual(lines[s_l-1][s_c:e_c], "模")

        # 2. Multi-char match
        s_l, s_c, e_l, e_c = find_best_anchor_in_lines("想到想", "我不禁想到想", lines)
        self.assertEqual(s_l, 2)
        self.assertEqual(lines[s_l-1][s_c:e_c], "想到想")

        # 3. Ground annotations to grid
        raw_anns = [
            {"target": "模", "evidence": "冷模", "type": "char_replace", "replacement": "漠", "bbox_2d": [500, 200, 550, 400]}
        ]
        grounded = ground_annotations_to_grid(page_number=1, annotations=raw_anns, page_lines=lines)
        self.assertEqual(len(grounded), 1)
        self.assertTrue(grounded[0]["grounded"])
        # Check that row was grounded to row 4 (y ~ 354 units, not 500)
        ymin, xmin, ymax, xmax = grounded[0]["bbox_2d"]
        self.assertLess(ymin, 400)
        self.assertGreater(ymin, 300)

    def test_student_edit_data_model(self):
        from app.core.essay_marker import extract_student_edits
        edits = extract_student_edits(page_number=1, sub_id="benchmark_test")
        self.assertIsInstance(edits, list)
        self.assertGreaterEqual(len(edits), 2)
        first_edit = edits[0]
        self.assertEqual(first_edit["page"], 1)
        self.assertIn("type", first_edit)
        self.assertIn("struck_text", first_edit)
        self.assertIn("neatness_note", first_edit)

    def test_is_inside_student_strikethrough(self):
        from app.core.essay_marker import is_inside_student_strikethrough
        sample_edits = [
            {
                "page": 2,
                "line": 4,
                "type": "self_strikethrough",
                "cell_span": (2, 4),
                "struck_text": "对不起"
            }
        ]
        # Target inside strikethrough (cols 2..4)
        self.assertTrue(is_inside_student_strikethrough(page_number=2, line=4, col_span=(2, 3), student_edits=sample_edits))
        self.assertTrue(is_inside_student_strikethrough(page_number=2, line=4, col_span=(3, 4), student_edits=sample_edits))
        # Target outside strikethrough (col 5 onwards: "不好意思")
        self.assertFalse(is_inside_student_strikethrough(page_number=2, line=4, col_span=(5, 6), student_edits=sample_edits))
        # Target on different line
        self.assertFalse(is_inside_student_strikethrough(page_number=2, line=5, col_span=(2, 3), student_edits=sample_edits))

    def test_suppress_annotations_on_struck_text(self):
        from app.core.essay_marker import ground_annotations_to_grid
        lines = [
            "来走去？啊，算了，反正也不是我错",
            "过巴士站，关我什么事？",
            "那时，背后传来一个小声",
            "的“对不起，不好意思，小姐。”我转"
        ]
        sample_edits = [
            {
                "page": 2,
                "line": 4,
                "type": "self_strikethrough",
                "cell_span": (2, 4),
                "struck_text": "对不起"
            }
        ]
        # Two annotations: one on struck-out "对不起", one on active "不好意思"
        anns = [
            {"target": "对不起", "evidence": "对不起，不好意思", "type": "char_replace", "replacement": "不必"},
            {"target": "不好意思", "evidence": "对不起，不好意思", "type": "char_replace", "replacement": "抱歉"}
        ]
        grounded = ground_annotations_to_grid(page_number=2, annotations=anns, page_lines=lines, student_edits=sample_edits)
        # Struck-out "对不起" must be suppressed! Only "不好意思" remains!
        self.assertEqual(len(grounded), 1)
        self.assertEqual(grounded[0]["target"], "不好意思")

    def test_clause_rewrite_and_descriptive_caret_rendering(self):
        """Tests that clause_rewrite ('★改') and descriptive_caret render cleanly."""
        test_img_path = Path("tests/dummy_star_gai.png")
        img = Image.new("RGB", (1000, 1400), (255, 255, 255))
        img.save(str(test_img_path))

        anns = [
            {
                "page_number": 1,
                "type": "clause_rewrite",
                "bbox_2d": [200, 200, 240, 500],
                "target": "冷模吧？",
                "replacement": "还会冷漠地忽视他人的困境吧？",
                "remark": "★改：还会冷漠地忽视他人的困境吧？"
            },
            {
                "page_number": 1,
                "type": "descriptive_caret",
                "bbox_2d": [350, 200, 385, 250],
                "replacement": "满脸期待地看着我",
                "remark": "神态刻画"
            },
            {
                "page_number": 1,
                "type": "block_prune",
                "bbox_2d": [500, 100, 560, 700],
                "target": "冗长起因",
                "transition_bridge": "当我正要转身离开时，那时，背后传来...",
                "remark": "详略剪裁"
            }
        ]
        marked = burn_annotations_to_image(str(test_img_path), anns, page_number=1)
        self.assertIsNotNone(marked)
        self.assertEqual(marked.size, (1000, 1400))

        if test_img_path.exists():
            test_img_path.unlink()

    def test_filter_and_rank_annotations(self):
        """Tests that filter_and_rank_annotations prioritizes pedagogical leverage and enforces density caps."""
        from app.core.essay_marker import filter_and_rank_annotations

        # Create 15 synthetic annotations on page 1 with varying priorities
        synthetic_anns = [
            {"page_number": 1, "type": "word_delete", "bbox_2d": [100, 100, 130, 200], "target": "想"},
            {"page_number": 1, "type": "char_replace", "bbox_2d": [150, 100, 180, 150], "target": "目", "replacement": "幕"},
            {"page_number": 1, "type": "clause_rewrite", "bbox_2d": [200, 100, 240, 400], "target": "冷模吧", "replacement": "还会冷漠地忽视他人的困境吧？"},
            {"page_number": 1, "type": "block_prune", "bbox_2d": [250, 100, 300, 700], "target": "冗余段落", "transition_bridge": "衔接句"},
            {"page_number": 1, "type": "descriptive_caret", "bbox_2d": [320, 100, 350, 150], "replacement": "温暖的"},
            {"page_number": 1, "type": "margin_star", "bbox_2d": [350, 800, 400, 950], "remark": "★ 审题关键词扣查"},
            {"page_number": 1, "type": "margin_star", "bbox_2d": [400, 800, 450, 950], "remark": "★ 详略得当提示"},
            {"page_number": 1, "type": "margin_star", "bbox_2d": [450, 800, 500, 950], "remark": "★ 第三条边栏星标（超出容量）"},
            {"page_number": 1, "type": "clause_rewrite", "bbox_2d": [500, 100, 540, 400], "target": "无法挤出车门", "replacement": "被人群紧紧困在原地"},
            {"page_number": 1, "type": "clause_rewrite", "bbox_2d": [550, 100, 590, 400], "target": "兴奋太忙了", "replacement": "内心充满着对比赛的期待。"},
            {"page_number": 1, "type": "char_replace", "bbox_2d": [600, 100, 630, 150], "target": "装满", "replacement": "挤满"},
            {"page_number": 1, "type": "char_replace", "bbox_2d": [650, 100, 680, 150], "target": "走法", "replacement": "途径"},
            {"page_number": 1, "type": "word_delete", "bbox_2d": [700, 100, 730, 200], "target": "冗赘词"},
            {"page_number": 1, "type": "remark", "bbox_2d": [750, 100, 780, 200], "remark": "微弱提示"},
            {"page_number": 1, "type": "descriptive_caret", "bbox_2d": [800, 100, 830, 150], "replacement": "满脸期待地看着我"}
        ]

        # Apply density filter: max 5 inline, max 2 margin
        filtered = filter_and_rank_annotations(synthetic_anns, max_inline_per_page=5, max_margin_per_page=2)

        # Total selected should be 5 inline + 2 margin = 7
        self.assertEqual(len(filtered), 7)

        # Verify margin notes are capped at 2
        margin_retained = [a for a in filtered if a["type"] == "margin_star"]
        self.assertEqual(len(margin_retained), 2)

        # Verify inline annotations capped at 5
        inline_retained = [a for a in filtered if a["type"] != "margin_star"]
        self.assertEqual(len(inline_retained), 5)

        # High priority types like block_prune (priority 85) and clause_rewrite (priority 75) MUST be retained
        inline_types = [a["type"] for a in inline_retained]
        self.assertIn("block_prune", inline_types)
        self.assertIn("clause_rewrite", inline_types)

        # Low-priority types like word_delete (priority 40) and remark (priority 30) must have been dropped
        self.assertNotIn("word_delete", inline_types)
        self.assertNotIn("remark", inline_types)

        # Verify reading order: ymin should be monotonically increasing (or non-decreasing)
        ymins = [a["bbox_2d"][0] for a in filtered]
        self.assertEqual(ymins, sorted(ymins))

    def test_chinese_essay_marker_parse_marking_in_situ_remarks(self):
        """Verifies that ChineseEssayMarker.mark_questions generates rich in-situ remarks and criteria."""
        from app.markers.chinese_essay import ChineseEssayMarker
        marker = ChineseEssayMarker()

        questions = [
            {
                "question_no": "1",
                "question_title": "第 1 页 作文内容",
                "page_number": 1,
                "extracted_answer": "今天早晨，我乘坐地铁去学校。\n车厢里十分拥挤，突然一位老伯伯站立不稳。\n我见状立刻起身搀扶，心想不能冷模旁观。"
            }
        ]
        assign_info = {
            "title": "助人为乐的一件事",
            "subject": "华文",
            "max_marks": 60.0,
            "marking_scheme_text": "内容30分，语言30分。",
            "submission_id": 999
        }
        student_info = {"name": "张小明", "student_id": "STU-999", "submission_id": 999}

        # Mock ollama_client to return structured JSON with in_situ_remarks
        mock_model_response = {
            "success": True,
            "content": json.dumps({
                "content_score": 20.0,
                "language_score": 19.0,
                "total_score": 39.0,
                "content_criteria": [
                    {"criterion": "内容充实度与切合题意", "max": 15.0, "awarded": 11.0, "comment": "立意积极，助人情节符合生活情境。"},
                    {"criterion": "层次与条理 (详略安排)", "max": 15.0, "awarded": 9.0, "comment": "车厢拥挤过程可略写，重点突出搀扶时的神态。"}
                ],
                "language_criteria": [
                    {"criterion": "语句通顺与词语运用", "max": 15.0, "awarded": 10.0, "comment": "行文顺畅，注意个别错别字。"},
                    {"criterion": "句式变化与段落衔接", "max": 15.0, "awarded": 9.0, "comment": "句式较紧凑。"}
                ],
                "in_situ_remarks": [
                    {
                        "page_number": 1,
                        "type": "char_replace",
                        "target": "冷模",
                        "replacement": "冷漠",
                        "reason": "错别字：'冷漠'之'漠'误写为'模'",
                        "evidence": "我见状立刻起身搀扶，心想不能冷模旁观。"
                    },
                    {
                        "page_number": 1,
                        "type": "clause_rewrite",
                        "target": "站立不稳",
                        "replacement": "★改：身体猛地一晃，险些摔倒",
                        "reason": "动词与神态升级：增强画面感",
                        "evidence": "车厢里十分拥挤，突然一位老伯伯站立不稳。"
                    },
                    {
                        "page_number": 1,
                        "type": "margin_star",
                        "target": "搀扶",
                        "replacement": "★评：此处宜加入动作细节与简短对话",
                        "reason": "详略与细节拓展",
                        "evidence": "我见状立刻起身搀扶"
                    }
                ],
                "overall_feedback": "评：详略得当，在搀扶老伯的情节上可进一步丰富对话与动作细节。",
                "strengths_feedback": "• 叙事清楚，情感真实自然",
                "improvement_feedback": "• 增加搀扶时的心理活动与人物神态描写"
            })
        }

        with patch("app.core.ollama_client.ollama_client.generate_chat", return_value=mock_model_response):
            result = marker.mark_questions(
                questions=questions,
                assignment_info=assign_info,
                student_info=student_info
            )

        self.assertTrue(result["success"])
        self.assertEqual(result["total_score"], 39.0)
        self.assertEqual(len(result["questions"]), 2)
        q1, q2 = result["questions"]
        self.assertIn("内容", q1["question_title"])
        self.assertIn("语言与结构", q2["question_title"])
        self.assertEqual(q1["awarded_marks"], 20.0)
        self.assertEqual(q2["awarded_marks"], 19.0)

        # In-situ remarks should be attached
        self.assertIn("in_situ_remarks", result)
        remarks = result["in_situ_remarks"]
        self.assertEqual(len(remarks), 3)
        self.assertEqual(remarks[0]["target"], "冷模")
        self.assertEqual(remarks[0]["replacement"], "冷漠")

        # Feedback comments should include in-situ listings
        self.assertIn("In Situ Remarks", q1["feedback_comment"])
        self.assertIn("In Situ Remarks", q2["feedback_comment"])
        self.assertIn("冷模", q2["feedback_comment"])

        # Both Q1 and Q2 must evaluate based on the whole essay and have full text in extracted_answer
        self.assertEqual(q1["extracted_answer"], questions[0]["extracted_answer"])
        self.assertEqual(q2["extracted_answer"], questions[0]["extracted_answer"])
        self.assertNotIn("字词、语法、句式与衔接", q2["extracted_answer"])

    def test_direct_marking_picks_up_in_situ_remarks_and_grounds_accurately(self):
        """Verifies that direct visual marking picks up in_situ_remarks from Step 2 and aligns coordinates."""
        from app.core.essay_marker import generate_essay_direct_marking_annotations

        submission = {
            "id": 888,
            "assignment_id": 1,
            "assignment_subject": "华文",
            "assignment_title": "华文作文",
            "assignment_max_marks": 60.0,
            "marker_type": "chinese_essay",
            "student_name": "李雷",
            "student_code": "STU-888",
            "question_grades": [
                {
                    "question_no": "1",
                    "question_title": "内容 (Content)",
                    "max_marks": 30.0,
                    "awarded_marks": 20.0,
                    "extracted_answer": "记叙文全文叙事结构",
                    "criteria": [{"criterion": "内容", "max": 15.0, "awarded": 10.0, "comment": "良好"}],
                    "feedback_comment": "内容良好",
                    "page_number": 1
                },
                {
                    "question_no": "2",
                    "question_title": "语言与结构 (Language & Structure)",
                    "max_marks": 30.0,
                    "awarded_marks": 19.0,
                    "extracted_answer": "语言与字词",
                    "criteria": [{"criterion": "语言", "max": 15.0, "awarded": 10.0, "comment": "良好"}],
                    "feedback_comment": "语言良好",
                    "page_number": 1
                }
            ],
            "in_situ_remarks": [
                {
                    "page_number": 1,
                    "type": "char_replace",
                    "target": "冷模",
                    "replacement": "冷漠",
                    "reason": "错字纠正",
                    "evidence": "心想不能冷模旁观"
                }
            ]
        }

        # Page lines with 2-char indent on first line
        page_lines = [
            "  今天早晨，我乘坐地铁去学校。",
            "车厢里十分拥挤，突然一位老伯伯站立不稳。",
            "我见状立刻起身搀扶，心想不能冷模旁观。"
        ]
        import tempfile
        with tempfile.TemporaryDirectory() as tmp_dir:
            img_path = Path(tmp_dir) / "page_1.png"
            Image.new("RGB", (1152, 1536), (255, 255, 255)).save(str(img_path))
            pages = [
                {
                    "page_number": 1,
                    "image_path": str(img_path),
                    "lines": page_lines,
                    "extracted_text": "\n".join(page_lines)
                }
            ]

            with patch("app.core.db.update_submission_annotations") as mock_update_ann, \
                 patch("app.core.db.save_marking_results") as mock_save_results, \
                 patch("app.core.ollama_client.ollama_client.generate_chat", return_value={"success": False}):
                annotations = generate_essay_direct_marking_annotations(
                    submission=submission,
                    pages=pages,
                    use_benchmark_mock=False
                )

        self.assertGreaterEqual(len(annotations), 1)
        grounded_ann = next((a for a in annotations if a.get("target") == "冷模"), None)
        self.assertIsNotNone(grounded_ann)
        self.assertTrue(grounded_ann.get("grounded"))
        self.assertEqual(grounded_ann.get("line_number"), 3)

        # Coordinate box should be grounded to line 3
        ymin, xmin, ymax, xmax = grounded_ann["bbox_2d"]
        self.assertGreater(ymin, 0)
        self.assertGreater(ymax, ymin)
        self.assertGreater(xmax, xmin)

        # Ensure DB question_grades were NOT overwritten with dummy 2-question rows
        mock_save_results.assert_not_called()
        mock_update_ann.assert_called_once()

    def test_chinese_essay_marker_extract_student_responses_populates_both_questions(self):
        """Verifies that ChineseEssayMarker.extract_student_responses populates both Q1 and Q2 with the whole essay."""
        from app.markers.chinese_essay import ChineseEssayMarker
        marker = ChineseEssayMarker()

        pages = [
            {"page_number": 1, "image_path": "tests/dummy_page.png"},
            {"page_number": 2, "image_path": "tests/dummy_page.png"}
        ]
        assign_info = {
            "title": "难忘的一天",
            "subject": "华文",
            "max_marks": 60.0
        }
        student_info = {"name": "王小华", "student_id": "STU-101"}

        mock_page_responses = [
            {"success": True, "content": "今天阳光明媚，我和同学们一起去国家博物馆参观。\n一路上我们欢歌笑语。"},
            {"success": True, "content": "到了展厅，我们看到了许多珍贵的历史文物。\n这一天让我受益匪浅。"}
        ]

        with patch("app.markers.chinese_essay.get_page_base64", return_value="dummy_b64"), \
             patch("app.core.ollama_client.ollama_client.generate_chat", side_effect=mock_page_responses):
            res = marker.extract_student_responses(assign_info, student_info, pages)

        self.assertTrue(res["success"])
        self.assertEqual(len(res["questions"]), 2)
        q1, q2 = res["questions"]

        self.assertEqual(q1["question_no"], "1")
        self.assertIn("内容", q1["question_title"])
        self.assertEqual(q2["question_no"], "2")
        self.assertIn("语言与结构", q2["question_title"])

        # Both Q1 and Q2 must have non-empty extracted_answer containing the full multi-page text
        self.assertIn("【第 1 页】", q1["extracted_answer"])
        self.assertIn("【第 2 页】", q1["extracted_answer"])
        self.assertIn("国家博物馆", q1["extracted_answer"])
        self.assertIn("历史文物", q1["extracted_answer"])

        self.assertEqual(q1["extracted_answer"], q2["extracted_answer"])

    def test_chinese_essay_marker_evaluates_q2_when_q2_input_is_empty_or_dummy(self):
        """Verifies that if Q2 input is empty or dummy, Q2 still evaluates on the whole essay from Q1."""
        from app.markers.chinese_essay import ChineseEssayMarker
        marker = ChineseEssayMarker()

        full_essay = (
            "今天早晨，我乘坐地铁去学校。\n"
            "车厢里十分拥挤，突然一位老伯伯站立不稳。\n"
            "我见状立刻起身搀扶，心想不能冷模旁观。"
        )

        # Q2 has empty string or dummy placeholder from UI
        questions = [
            {
                "question_no": "1",
                "question_title": "内容 (Content)",
                "page_number": 1,
                "extracted_answer": full_essay
            },
            {
                "question_no": "2",
                "question_title": "语言与结构 (Language & Structure)",
                "page_number": 1,
                "extracted_answer": ""  # empty answer
            }
        ]
        assign_info = {
            "title": "助人为乐的一件事",
            "subject": "华文",
            "max_marks": 60.0,
            "marking_scheme_text": "内容30分，语言30分。",
            "submission_id": 1001
        }
        student_info = {"name": "张小明", "student_id": "STU-1001", "submission_id": 1001}

        mock_model_response = {
            "success": True,
            "content": json.dumps({
                "content_score": 19.5,
                "language_score": 18.5,
                "total_score": 38.0,
                "content_criteria": [
                    {"criterion": "内容充实度与切合题意", "max": 15.0, "awarded": 10.5, "comment": "主题鲜明。"}
                ],
                "language_criteria": [
                    {"criterion": "语句通顺与词语运用", "max": 15.0, "awarded": 9.5, "comment": "语句通顺。"}
                ],
                "in_situ_remarks": [
                    {
                        "page_number": 1,
                        "type": "char_replace",
                        "target": "冷模",
                        "replacement": "冷漠",
                        "reason": "错字纠正",
                        "evidence": "心想不能冷模旁观"
                    }
                ],
                "overall_feedback": "评：详略得当。",
                "strengths_feedback": "• 叙事清楚",
                "improvement_feedback": "• 细节描写"
            })
        }

        with patch("app.core.ollama_client.ollama_client.generate_chat", return_value=mock_model_response):
            result = marker.mark_questions(
                questions=questions,
                assignment_info=assign_info,
                student_info=student_info
            )

        self.assertTrue(result["success"])
        self.assertEqual(len(result["questions"]), 2)
        q1, q2 = result["questions"]

        # Q2 must have evaluated and awarded marks properly based on the whole essay
        self.assertEqual(q1["awarded_marks"], 19.5)
        self.assertEqual(q2["awarded_marks"], 18.5)
        self.assertEqual(result["total_score"], 38.0)

        # Both Q1 and Q2 extracted_answer must match the full essay
        self.assertEqual(q1["extracted_answer"], full_essay)
        self.assertEqual(q2["extracted_answer"], full_essay)
        self.assertNotIn("字词、语法、句式与衔接", q2["extracted_answer"])

if __name__ == "__main__":
    unittest.main()

