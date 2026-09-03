import os
import json
import re
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from PIL import Image, ImageDraw, ImageFont
import pymupdf

from app.core.config import REPORTS_DIR, PROCESSED_DIR, DEFAULT_VISION_MODEL, DEFAULT_OCR_NUM_CTX
from app.core.ollama_client import ollama_client
from app.core.pdf_processor import get_page_base64
from app.core import db

# Traditional Teacher Red-Pen Visual Styling Constants (All markings in Red)
COLOR_RED_PEN = (220, 38, 38, 255)        # Classic Teacher Red #dc2626
COLOR_TICK = (220, 38, 38, 255)           # Red Tick ✓ for correct idea / meeting marking scheme
COLOR_CROSS = (220, 38, 38, 255)          # Red Cross ✗ for wrong idea / not meeting marking scheme
COLOR_CIRCLE = (220, 38, 38, 245)         # Red Circle ⭕ to highlight the specific mistake
COLOR_BADGE_BG = (15, 23, 42, 230)        # Slate-900 translucent header badge
COLOR_BADGE_TEXT = (255, 255, 255, 255)
COLOR_REMARK_BG = (254, 242, 242, 245)    # Crisp Red-50 note container
COLOR_REMARK_BORDER = (239, 68, 68, 255)  # Red-500 border
COLOR_REMARK_TEXT = (185, 28, 28, 255)    # Red-700 readable teacher text

DIRECT_MARKING_VISION_PROMPT = """You are a teacher marking a student's scanned handwritten script using a RED PEN.

Subject: {subject}
Assignment: {assignment_title}
Total Marks: {max_marks}

MARKING SCHEME:
----------------------------------------
{marking_scheme}
----------------------------------------

MARKING RULES — follow exactly:

TICKS ("tick"):
  - Draw a tick IMMEDIATELY after the correct word, phrase, or working step.
  - bbox_2d must tightly surround ONLY that correct word or expression (not the whole line).
  - "score" field: write the marks awarded for that point, e.g. "1" or "2/3" (leave blank if not applicable).
  - "remark": leave blank for ticks (EXCEPT when creating a graph checklist).

CROSSES ("cross"):
  - Draw a cross IMMEDIATELY after the wrong word, phrase, or step.
  - bbox_2d must tightly surround ONLY that wrong word or expression.
  - "score": marks lost or zero, e.g. "0".
  - "remark": leave blank (EXCEPT when creating a graph checklist).

CIRCLES ("circle"):
  - Circle the SPECIFIC erroneous word, number, unit, or symbol.
  - bbox_2d must be as tight as possible around ONLY that element.
  - "remark": write a very short teacher note (≤8 words) directly describing the mistake, e.g. "wrong unit", "sign error", "missing denominator". No question numbers. No prefix labels.

GRAPHS:
  - If marking a graph or drawing, do NOT scatter individual ticks or crosses over the image.
  - Create a vertical checklist in an empty white space near the top or side of the graph.
  - For each grading criterion, generate an individual annotation of type "tick" (if met) or "cross" (if not met).
  - Use the "remark" field to state the criterion name (e.g., "Axes labelled", "Correct scale").
  - Stack their bbox_2d coordinates vertically so they form a neat list.
  - IN ADDITION to the checklist, if there are any WRONGLY plotted points, create an annotation of type "circle" tightly around each wrongly plotted point (use very tight coordinate tolerance).

BLANK ANSWERS:
  - If a question or answer space is left completely blank, place a SINGLE "cross" centered in the empty space.
  - "score": "0".
  - "remark": "".

SCORING at the margin:
  - For any tick or cross where marks are awarded/deducted, populate the "score" field.
  - Do NOT embed the score inside the remark text.

IMPORTANT: 
- bbox_2d = [ymin, xmin, ymax, xmax] on an absolute 0..1000 scale for the current page.
- Do NOT guess or increment coordinates sequentially. Treat every bounding box independently based purely on visual location.
- Bounding boxes must NOT span the full line width. Tightly surround the specific word or symbol.
- Populate the "evidence" field with the exact text snippet from the image you are pointing to (this helps prevent coordinate drift).

Return STRICTLY this JSON:
{{
  "page_annotations": [
    {{
      "evidence": "3 - 1 = 2",
      "type": "tick",
      "bbox_2d": [320, 142, 345, 198],
      "score": "1",
      "remark": ""
    }},
    {{
      "evidence": "32 °C",
      "type": "circle",
      "bbox_2d": [410, 260, 432, 310],
      "score": "",
      "remark": "wrong unit"
    }},
    {{
      "evidence": "graph grid",
      "type": "tick",
      "bbox_2d": [550, 700, 580, 950],
      "score": "1",
      "remark": "Axes labelled"
    }},
    {{
      "evidence": "graph grid",
      "type": "cross",
      "bbox_2d": [580, 700, 610, 950],
      "score": "0",
      "remark": "Correct scale"
    }}
  ]
}}
"""

def clean_json_response(raw_text: str) -> Optional[Dict[str, Any]]:
    """Extracts and parses JSON safely from model response."""
    if not raw_text:
        return None
    cleaned = re.sub(r"<think>.*?</think>", "", raw_text, flags=re.DOTALL).strip()
    
    # 1. Direct parse
    try:
        res = json.loads(cleaned)
        if isinstance(res, dict):
            return res
        if isinstance(res, list):
            return {"page_annotations": res}
    except Exception:
        pass
        
    # 2. Markdown fence parse
    fence_matches = re.findall(r"```(?:json)?\s*(.*?)\s*```", cleaned, re.DOTALL)
    for block in fence_matches:
        try:
            res = json.loads(block.strip())
            if isinstance(res, dict):
                return res
            if isinstance(res, list):
                return {"page_annotations": res}
        except Exception:
            pass
            
    # 3. Outer brace search
    first_b = cleaned.find("{")
    last_b = cleaned.rfind("}")
    if first_b != -1 and last_b != -1 and last_b > first_b:
        try:
            return json.loads(cleaned[first_b:last_b+1])
        except Exception:
            pass
            
    return None

def normalize_bbox(raw_box: Any) -> Optional[List[int]]:
    """Ensures bounding box is a valid [ymin, xmin, ymax, xmax] list in range 0..1000."""
    if not raw_box or not isinstance(raw_box, (list, tuple)) or len(raw_box) != 4:
        return None
    try:
        nums = [max(0, min(1000, int(float(v)))) for v in raw_box]
        ymin, xmin, ymax, xmax = nums
        if ymax <= ymin:
            ymax = min(1000, ymin + 50)
        if xmax <= xmin:
            xmax = min(1000, xmin + 80)
        return [ymin, xmin, ymax, xmax]
    except Exception:
        return None

def generate_direct_marking_annotations(
    submission: Dict[str, Any],
    pages: Optional[List[Dict[str, Any]]] = None,
    model: str = DEFAULT_VISION_MODEL
) -> List[Dict[str, Any]]:
    """
    Calls qwen3.8:latest page-by-page to inspect student handwritten script
    and generate grounded visual annotations (ticks, crosses, circles, remarks).
    """
    sub_id = submission.get("id")
    assignment_title = submission.get("assignment_title", "Assignment")
    subject = submission.get("assignment_subject", "General")
    max_marks = float(submission.get("assignment_max_marks", 100.0) or 100.0)
    marking_scheme = submission.get("marking_scheme_text", "")
    
    if not pages:
        raw_pages = submission.get("pages_json")
        if isinstance(raw_pages, str):
            try:
                pages = json.loads(raw_pages)
            except Exception:
                pages = []
        elif isinstance(raw_pages, list):
            pages = raw_pages
        else:
            pages = []
            
    if not pages:
        return []

    all_annotations: List[Dict[str, Any]] = []

    for p_idx, page in enumerate(pages, start=1):
        img_path = page.get("image_path")
        if not img_path or not Path(img_path).exists():
            continue

        b64 = get_page_base64(img_path)
        prompt = DIRECT_MARKING_VISION_PROMPT.format(
            subject=subject,
            assignment_title=assignment_title,
            max_marks=max_marks,
            marking_scheme=marking_scheme
        )

        res = ollama_client.generate_chat(
            model=model,
            messages=[{"role": "user", "content": prompt, "images": [b64]}],
            format_json=True,
            temperature=0.1,
            timeout=120,
            num_ctx=DEFAULT_OCR_NUM_CTX,
            reasoning_effort="low"
        )

        page_ann_list: List[Dict[str, Any]] = []
        parsed = None
        if res.get("success"):
            parsed = clean_json_response(res.get("content", ""))
            if not parsed and res.get("thinking"):
                parsed = clean_json_response(res.get("thinking", ""))

            raw_list = []
            if parsed:
                if "page_annotations" in parsed and isinstance(parsed["page_annotations"], list):
                    raw_list = parsed["page_annotations"]
                elif "annotations" in parsed and isinstance(parsed["annotations"], list):
                    raw_list = parsed["annotations"]
                elif isinstance(parsed.get("questions"), list):
                    # In case model nested inside questions
                    for q in parsed["questions"]:
                        q_num = q.get("question_no", "")
                        for a in q.get("annotations", []):
                            a["question_no"] = a.get("question_no") or q_num
                            raw_list.append(a)

            for item in raw_list:
                ann_type = str(item.get("type", "tick")).lower().strip()
                if ann_type not in ("tick", "cross", "circle", "remark", "badge"):
                    ann_type = "tick" if "correct" in str(item).lower() else "cross"
                
                bbox = normalize_bbox(item.get("bbox_2d") or item.get("bbox") or item.get("box_2d"))
                if not bbox:
                    # Default coordinate heuristic on page if missing
                    base_y = 200 + (len(page_ann_list) * 80) % 700
                    bbox = [base_y, 150, base_y + 40, 500]

                remark = str(item.get("remark") or item.get("comment") or "").strip()
                score  = str(item.get("score") or "").strip()

                page_ann_list.append({
                    "id": f"ann_p{p_idx}_{len(page_ann_list)+1}",
                    "page_number": p_idx,
                    "type": ann_type,
                    "bbox_2d": bbox,
                    "remark": remark,
                    "score": score
                })

        # If model failed or returned completely invalid JSON, fall back to DB question grades
        parsed_failed = not res.get("success") or parsed is None
        if parsed_failed and submission.get("question_grades"):
            all_qs = submission["question_grades"]
            num_pages_total = len(pages)
            qs_per_page = max(1, (len(all_qs) + num_pages_total - 1) // num_pages_total)

            # Detect whether stored page_number values are real or all-default (1)
            all_pnums = [int(q.get("page_number", 1) or 1) for q in all_qs]
            has_real = num_pages_total == 1 or any(p > 1 for p in all_pnums)

            if has_real:
                qs_for_this_page = [q for q in all_qs if int(q.get("page_number", 1) or 1) == p_idx]
            else:
                # All questions defaulted to page 1 — slice by index for this page
                start_idx = (p_idx - 1) * qs_per_page
                end_idx = min(len(all_qs), start_idx + qs_per_page)
                qs_for_this_page = all_qs[start_idx:end_idx]

            for q_idx_on_page, q in enumerate(qs_for_this_page):
                awarded = float(q.get("awarded_marks", 0.0))
                q_max = float(q.get("max_marks", 1.0))
                q_no = q.get("question_no", f"{q_idx_on_page+1}")
                is_full = awarded >= q_max
                y_pos = 180 + (q_idx_on_page * 140) % 750
                page_ann_list.append({
                    "id": f"ann_p{p_idx}_fallback_{q_idx_on_page+1}",
                    "page_number": p_idx,
                    "type": "tick" if is_full else ("cross" if awarded == 0 else "circle"),
                    "bbox_2d": [y_pos, 150, y_pos + 40, 500],
                    "remark": f"{'✓' if is_full else '•'} Q{q_no}: {awarded:g}/{q_max:g} marks",
                    "score": f"{awarded:g}/{q_max:g}"
                })

        all_annotations.extend(page_ann_list)

    # Save to database
    if sub_id:
        db.update_submission_annotations(sub_id, all_annotations)

    return all_annotations


def draw_tick(draw: ImageDraw.ImageDraw, x: float, y: float, size: float = 32, color=COLOR_TICK, width: int = 5):
    """Draws a stylish, anti-aliased green checkmark ✓."""
    p1 = (x, y + size * 0.5)
    p2 = (x + size * 0.35, y + size * 0.9)
    p3 = (x + size, y)
    draw.line([p1, p2], fill=color, width=width)
    draw.line([p2, p3], fill=color, width=width)
    draw.ellipse([p2[0]-width//2, p2[1]-width//2, p2[0]+width//2, p2[1]+width//2], fill=color)

def draw_cross(draw: ImageDraw.ImageDraw, x: float, y: float, size: float = 28, color=COLOR_CROSS, width: int = 5):
    """Draws a bold red cross ✗."""
    p1 = (x, y)
    p2 = (x + size, y + size)
    p3 = (x + size, y)
    p4 = (x, y + size)
    draw.line([p1, p2], fill=color, width=width)
    draw.line([p3, p4], fill=color, width=width)

def draw_circle(draw: ImageDraw.ImageDraw, x1: float, y1: float, x2: float, y2: float, color=COLOR_CIRCLE, width: int = 4):
    """Draws an ellipse outline around the highlighted region."""
    pad = 6
    draw.ellipse([x1 - pad, y1 - pad, x2 + pad, y2 + pad], outline=color, width=width)

def burn_annotations_to_image(
    page_image_path: str,
    annotations: List[Dict[str, Any]],
    page_number: int = 1
) -> Image.Image:
    """
    Renders high-res visual markings (ticks, crosses, error circles, remark callouts)
    onto a copy of the scanned page image.
    """
    img = Image.open(page_image_path).convert("RGBA")
    overlay = Image.new("RGBA", img.size, (255, 255, 255, 0))
    draw = ImageDraw.Draw(overlay)
    w, h = img.size

    # Filter annotations for this page
    page_anns = [a for a in annotations if int(a.get("page_number", 1)) == page_number]

    # Try loading default font or PIL fallback
    try:
        font_main = ImageFont.truetype("arial.ttf", max(14, int(w * 0.015)))
        font_bold = ImageFont.truetype("arialbd.ttf", max(15, int(w * 0.016)))
    except Exception:
        font_main = ImageFont.load_default()
        font_bold = ImageFont.load_default()

    for ann in page_anns:
        bbox = ann.get("bbox_2d") or [100, 100, 150, 400]
        ymin, xmin, ymax, xmax = bbox

        # Convert 0..1000 normalized to pixel coordinates
        x1 = (xmin / 1000.0) * w
        y1 = (ymin / 1000.0) * h
        x2 = (xmax / 1000.0) * w
        y2 = (ymax / 1000.0) * h

        ann_type = str(ann.get("type", "tick")).lower()
        remark = str(ann.get("remark", "")).strip()

        # Standard fixed sizes for symbols and fonts
        sym_size = 20
        stroke_w = 3
        mid_y = y1 + (y2 - y1) * 0.5

        if ann_type == "tick":
            # Estimate text width in pixels (roughly 8px per char for Arial 15)
            est_text_width = len(remark) * 8 if remark else 0
            # Leave margin for score and text
            max_sx = w - int(w * 0.1) - est_text_width if remark else w - int(w * 0.1)
            # Place tick immediately after the word, or at x1 for checklist items
            sx = min(max_sx, x1) if remark else min(max_sx, x2 + 4)
            sy = mid_y - sym_size * 0.5
            draw_tick(draw, sx, sy, size=sym_size, width=stroke_w)

            # Score badge at right margin, same vertical position
            score = str(ann.get("score", "")).strip()
            if score:
                margin_x = w - int(w * 0.07)
                draw.text((margin_x, mid_y - sym_size * 0.5), score,
                          fill=COLOR_RED_PEN, font=font_bold)
            if remark:
                draw.text((sx + sym_size + 8, mid_y - sym_size * 0.5), remark, fill=COLOR_RED_PEN, font=font_main)

        elif ann_type == "cross":
            est_text_width = len(remark) * 8 if remark else 0
            max_sx = w - int(w * 0.1) - est_text_width if remark else w - int(w * 0.1)
            # Place cross immediately after the word, or at x1 for checklist items
            sx = min(max_sx, x1) if remark else min(max_sx, x2 + 4)
            sy = mid_y - sym_size * 0.5
            draw_cross(draw, sx, sy, size=sym_size, width=stroke_w)

            # Score badge at right margin
            score = str(ann.get("score", "")).strip()
            if score:
                margin_x = w - int(w * 0.07)
                draw.text((margin_x, mid_y - sym_size * 0.5), score, fill=COLOR_RED_PEN, font=font_bold)
            if remark:
                draw.text((sx + sym_size + 8, mid_y - sym_size * 0.5), remark, fill=COLOR_RED_PEN, font=font_main)

        elif ann_type == "circle":
            # Tight ellipse around exactly the error word/phrase
            draw_circle(draw, x1, y1, x2, y2, width=stroke_w)

            # Plain inline comment just below the circle (no box, no callout)
            if remark:
                tx = max(4, x1)
                ty = min(h - 16, y2 + 4)
                draw.text((tx, ty), remark, fill=COLOR_RED_PEN, font=font_main)

        elif ann_type == "remark":
            # Plain text comment: just above the bbox centre (no box)
            if remark:
                tx = max(4, x1)
                ty = max(2, y1 - int(font_main.size if hasattr(font_main, "size") else 14) - 4)
                draw.text((tx, ty), remark, fill=COLOR_RED_PEN, font=font_main)

    # Composite overlay onto base image
    marked_img = Image.alpha_composite(img, overlay).convert("RGB")
    return marked_img

def synthesize_annotations_from_question_grades(
    q_grades: List[Dict[str, Any]],
    pages: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Synthesizes rich visual annotations (ticks, crosses, error circles, remarks)
    across document pages from evaluated question grades so that scripts ALWAYS
    have grounded visual feedback on their respective pages.
    """
    num_pages = max(1, len(pages))
    annotations = []
    total_q = len(q_grades)
    qs_per_page = max(1, (total_q + num_pages - 1) // num_pages)
    # Detect whether page_number info is real or just defaults.
    # If every question has page_number=1 and there are multiple pages,
    # the stored values are DB defaults — distribute by index instead.
    all_page_nums = [int(q.get("page_number", 1) or 1) for q in q_grades]
    has_real_page_info = num_pages == 1 or any(p > 1 for p in all_page_nums)

    for idx, q in enumerate(q_grades):
        explicit_p = q.get("page_number")
        if has_real_page_info and explicit_p and 1 <= int(explicit_p) <= num_pages:
            p_num = int(explicit_p)
        else:
            # Evenly distribute across pages by sequential index
            p_num = min(num_pages, (idx // qs_per_page) + 1)

        q_idx_on_page = page_q_counts.get(p_num, 0)
        page_q_counts[p_num] = q_idx_on_page + 1
        
        awarded = float(q.get("awarded_marks", 0.0) or 0.0)
        q_max = float(q.get("max_marks", 1.0) or 1.0)
        q_no = str(q.get("question_no", f"{idx+1}")).strip()
        comment = str(q.get("feedback_comment", "")).strip()
        is_full = awarded >= q_max
        is_zero = awarded == 0.0
        
        # Vertical coordinate distributed cleanly along the page (18% to 88%)
        slot_height = min(220, max(100, int(680 / max(1, qs_per_page))))
        base_y = min(880, 180 + (q_idx_on_page * slot_height))
        
        ann_type = "tick" if is_full else ("cross" if is_zero else "circle")
        
        if comment and not comment.lower().startswith("evaluated"):
            remark_text = f"Q{q_no} [{awarded:g}/{q_max:g}]: {comment}"
        else:
            status_tag = "✓ Correct" if is_full else ("✗ Incorrect" if is_zero else "Partial Credit")
            remark_text = f"Q{q_no} [{status_tag}]: {awarded:g} / {q_max:g} marks"
            
        annotations.append({
            "id": f"ann_auto_{idx+1}",
            "page_number": p_num,
            "question_no": q_no,
            "type": ann_type,
            "bbox_2d": [base_y, 100, min(950, base_y + 45), 750],
            "remark": remark_text
        })
        
        # Add criteria sub-marks if criteria breakdown exists
        criteria = q.get("criteria", [])
        if isinstance(criteria, list) and len(criteria) > 1:
            for c_idx, crit in enumerate(criteria):
                c_name = crit.get("criterion", f"Step {c_idx+1}")
                c_awarded = float(crit.get("awarded", 0.0) or 0.0)
                c_max = float(crit.get("max", 1.0) or 1.0)
                c_comment = crit.get("comment", "")
                c_type = "tick" if c_awarded >= c_max else "cross"
                sub_y = base_y + 50 + (c_idx * 30)
                if sub_y + 20 < 960:
                    annotations.append({
                        "id": f"ann_auto_{idx+1}_c{c_idx+1}",
                        "page_number": p_num,
                        "question_no": q_no,
                        "type": c_type,
                        "bbox_2d": [sub_y, 140, sub_y + 25, 720],
                        "remark": f"• {c_name}: {c_awarded:g}/{c_max:g} {c_comment}".strip()
                    })
                
    return annotations


def generate_direct_marking_pdf_report(
    submission: Dict[str, Any],
    output_path: Optional[str] = None,
    annotations: Optional[List[Dict[str, Any]]] = None
) -> str:
    """
    Generates a complete multi-page Direct Marked Script PDF document
    with burned-in annotations (ticks, crosses, circles, remarks) and
    an official top summary header.
    """
    sub_id = submission.get("id", "0")
    student_name = submission.get("student_name", "Student")
    student_code = submission.get("student_code", "")
    assignment_title = submission.get("assignment_title", "Assignment Feedback")
    subject = submission.get("assignment_subject", "General")
    total_score = float(submission.get("total_score", 0.0) or 0.0)
    max_marks = float(submission.get("assignment_max_marks", 100.0) or 100.0)
    percentage = float(submission.get("percentage", 0.0) or 0.0)
    grade_letter = submission.get("grade_letter", "N/A")
    date_str = (submission.get("approved_at") or datetime.now().isoformat())[:10]

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)

    if not output_path:
        safe_code = "".join(c for c in str(student_code) if c.isalnum() or c in ('-', '_'))
        safe_name = "".join(c for c in str(student_name) if c.isalnum() or c in ('-', '_', ' ')).replace(" ", "_")
        filename = f"DirectMarked_{safe_name}_{safe_code}_{sub_id}.pdf" if safe_code else f"DirectMarked_{safe_name}_{sub_id}.pdf"
        output_path = str(REPORTS_DIR / filename)

    # Resolve pages
    raw_pages = submission.get("pages_json")
    if isinstance(raw_pages, str):
        try:
            pages = json.loads(raw_pages)
        except Exception:
            pages = []
    elif isinstance(raw_pages, list):
        pages = raw_pages
    else:
        pages = []

    # Resolve annotations: ensure we NEVER produce an empty marking script
    if annotations is None or len(annotations) == 0:
        annotations = submission.get("annotations") or db.get_submission_annotations(int(sub_id)) if sub_id else []

    if not annotations and sub_id:
        full_sub = db.get_submission_by_id(int(sub_id))
        if full_sub:
            if not pages:
                raw_p = full_sub.get("pages_json")
                pages = json.loads(raw_p) if isinstance(raw_p, str) else (raw_p or [])
            q_grades = full_sub.get("question_grades", [])
            if q_grades and pages:
                annotations = synthesize_annotations_from_question_grades(q_grades, pages)
                db.update_submission_annotations(int(sub_id), annotations)

    doc = pymupdf.open()

    for p_idx, page in enumerate(pages, start=1):
        img_path = page.get("image_path")
        if not img_path or not Path(img_path).exists():
            continue

        annotated_pil = burn_annotations_to_image(img_path, annotations, page_number=p_idx)

        # On Page 1, draw the top summary banner
        if p_idx == 1:
            w, h = annotated_pil.size
            banner_h = max(80, int(h * 0.08))
            banner_img = Image.new("RGB", (w, h + banner_h), (255, 255, 255))
            
            draw_b = ImageDraw.Draw(banner_img)
            draw_b.rectangle([0, 0, w, banner_h], fill=(15, 23, 42)) # Slate 900
            
            try:
                title_font = ImageFont.truetype("arialbd.ttf", max(18, int(w * 0.022)))
                sub_font = ImageFont.truetype("arial.ttf", max(13, int(w * 0.014)))
                score_font = ImageFont.truetype("arialbd.ttf", max(22, int(w * 0.026)))
            except Exception:
                title_font = ImageFont.load_default()
                sub_font = ImageFont.load_default()
                score_font = ImageFont.load_default()

            draw_b.text((25, 12), f"{assignment_title} • Direct Marked Script", fill=(241, 245, 249), font=title_font)
            draw_b.text((25, 45), f"Student: {student_name} ({student_code or 'General'}) | Subject: {subject} | Date: {date_str}", fill=(148, 163, 184), font=sub_font)

            score_text = f"{total_score:g} / {max_marks:g}  ({percentage:.1f}%)"
            badge_text = f"Grade: {grade_letter}"
            bbox_st = draw_b.textbbox((0, 0), score_text, font=score_font)
            st_w = bbox_st[2] - bbox_st[0]
            
            draw_b.text((w - st_w - 30, 10), score_text, fill=(56, 189, 248), font=score_font)
            draw_b.text((w - st_w - 30, 45), badge_text, fill=(203, 213, 225), font=sub_font)

            banner_img.paste(annotated_pil, (0, banner_h))
            annotated_pil = banner_img

        import io
        img_byte_arr = io.BytesIO()
        annotated_pil.save(img_byte_arr, format='JPEG', quality=95)
        img_bytes = img_byte_arr.getvalue()

        img_doc = pymupdf.open("jpeg", img_bytes)
        pdf_bytes = img_doc.convert_to_pdf()
        img_doc.close()

        page_pdf = pymupdf.open("pdf", pdf_bytes)
        doc.insert_pdf(page_pdf)
        page_pdf.close()

    if len(doc) == 0:
        p = doc.new_page(width=595, height=842)
        p.insert_text((50, 100), f"Direct Marked Report - No scan pages found for submission #{sub_id}.")

    doc.save(output_path)
    doc.close()
    return output_path
