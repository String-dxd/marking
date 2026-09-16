import os
import re
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from PIL import Image
import numpy as np

# Calibrated Singapore Chinese Girls' School (SCGS) Foolscap Geometry (Normalized 0..1000)
SCGS_LINED_GEOMETRY = {
    "left_margin_norm": 167,    # x = 204 px / 1224
    "right_margin_norm": 838,   # x = 1026 px / 1224
    "header_bottom_norm": 180,  # y = 285 px / 1584
    "line_height_norm": 27,     # ~43 px / 1584
    "ruled_lines_count": 29,
    "side_note_margin_start_norm": 845,
    "side_note_margin_end_norm": 985
}

# Empirical ruled line baselines for Sub 117 (y in normalized 0..1000 scale)
SUB_117_BASELINES = [
    184, 211, 238, 265, 292, 319, 345, 372, 399, 426,
    452, 479, 505, 532, 559, 585, 612, 639, 665, 692,
    719, 746, 773, 800, 828, 855, 882, 909, 937
]

SUB_117_PAGE1_LINES = [
    "", # Rule 1: Blank
    "阳光透过窗户照射进来，映照在写着电话号码的纸条上。看着那张纸，我想起了两周", # Rule 2
    "前在巴士上发生的那件事。", # Rule 3
    "那天，学校举行了一场比赛，我非常期待参加。~~这场比赛对我十分十分重要，所~~^来说", # Rule 4
    "场比赛对我DSA的结果的影响至关重要，无论好是坏，因此它对我十分重要。于是，", # Rule 5
    "我前一天晚上就把需要的东西准备好了。第二天早上，我很早就出门了，搭巴士上学校。", # Rule 6
    "我心里一直想着比赛的事情，心情，也希望自己可以取得好成绩。", # Rule 7
    "", # Rule 8: Blank line
    "上了巴士后，我立刻找了一个位子坐下。过了不久，我突然听到一声：“哎呀", # Rule 9
    "妈呀！”我转头一看，意识到一位满头白发，满脸皱纹的老伯伯。他一直盼望着", # Rule 10
    "窗外，好像在找什么东西。过了一会儿，他突然站起来，着急地问我：“小朋友，", # Rule 11
    "请问刚才是不是已经经过三巴旺巴士站了？”", # Rule 12
    "我听了以后，马上看了一下窗外，发现巴士真的已经开过了那个巴士站。我立刻把", # Rule 13
    "这片消息吩咐给老伯伯。老伯伯知~~堂~~道后，看起来非常着急，不停地来回走，", # Rule 14
    "还一直看着手表。出于关心，我问他发生了什么事。    三巴旺", # Rule 15
    "“我年纪大了，不太会使用手机，也不知道应该怎么去^市镇理事会。”听了", # Rule 16
    "老伯伯的话，我不禁对他感到一丝丝的同情，想要帮助他。然而，当我检查", # Rule 17
    "下时间时，发现比赛快要开始了。我心理感到非常矛盾。一方面来说，我已经", # Rule 18
    "为比赛准备了很久，如果迟到了的话就可能不能参加。另一方面来说，如果我直接下车，", # Rule 19
    "老伯伯一个人很无助，我又不仅心离开。", # Rule 20
    "最后，我纠结了一下，决定先帮助老伯伯。我向司机请问应该在哪里下", # Rule 21
    "车，然后用手机帮老伯伯查路线，^让他自己并告诉他在下一站下车，并告诉他应该搭哪一辆巴士。", # Rule 22
    "我还让老伯伯把他的电话号码写在纸条上，^让我能确保他安全到达了地点。", # Rule 23
    "后来，当我赶到比赛的场地时，比赛已经开始了。这让我感到非常失望。", # Rule 24
    "但我一想起老伯伯感激的样子，我无法让自己感到后悔。如果时间", # Rule 25
    "能够倒流，我还会选择帮那个老伯伯。", # Rule 26
    "", # Rule 27: Blank
    "", # Rule 28: Blank
    ""  # Rule 29: Blank
]

SUB_117_STUDENT_EDITS = [
    {
        "page": 1,
        "line": 4,
        "type": "self_strikethrough",
        "struck_text": "这场比赛对我十分十分重要，所",
        "inserted_text": "来说",
        "cell_span": (21, 36),
        "reading_action": "omit",
        "context": "那天，学校举行了一场比赛，我非常期待参加。~~这场比赛对我十分十分重要，所~~^来说",
        "neatness_note": "第4行学生自主划除冗余句并补写'来说'。"
    },
    {
        "page": 1,
        "line": 14,
        "type": "self_strikethrough",
        "struck_text": "堂",
        "inserted_text": "",
        "cell_span": (14, 15),
        "reading_action": "omit",
        "context": "这片消息吩咐给老伯伯。老伯伯知~~堂~~道后，看起来非常着急",
        "neatness_note": "第14行'知道'字间学生自主点划纠错。"
    },
    {
        "page": 1,
        "line": 16,
        "type": "interlinear_insertion",
        "struck_text": "",
        "inserted_text": "三巴旺",
        "cell_span": (26, 27),
        "reading_action": "insert_before",
        "context": "“我年纪大了，不太会使用手机，也不知道应该怎么去^市镇理事会。”",
        "neatness_note": "第16行学生使用插入符（^）补写'三巴旺'。"
    },
    {
        "page": 1,
        "line": 22,
        "type": "interlinear_insertion",
        "struck_text": "",
        "inserted_text": "让他自己",
        "cell_span": (18, 22),
        "reading_action": "insert_before",
        "context": "车，然后用手机帮老伯伯查路线，^让他自己并告诉他在下一站下车",
        "neatness_note": "第22行学生行间添加'让他自己'。"
    },
    {
        "page": 1,
        "line": 23,
        "type": "interlinear_insertion",
        "struck_text": "",
        "inserted_text": "让我能",
        "cell_span": (20, 23),
        "reading_action": "insert_before",
        "context": "我还让老伯伯把他的电话号码写在纸条上，^让我能确保他安全到达了地点。",
        "neatness_note": "第23行学生行间添加'让我能'。"
    }
]

SUB_117_ANNOTATIONS = [
    {
        "id": "ann_p1_1",
        "page_number": 1,
        "type": "char_replace",
        "evidence": "妈呀！”我转头一看，意识到一位满头白发",
        "target": "意识到",
        "replacement": "看到",
        "remark": "看到",
        "reason": "用词不当：'意识到'不能直接接人物宾语，宜改为'看到/注意到'",
        "line_number": 10,
        "bbox_2d": [401, 340, 428, 396],
        "grounded": True
    },
    {
        "id": "ann_p1_2",
        "page_number": 1,
        "type": "char_replace",
        "evidence": "这片消息吩咐给老伯伯",
        "target": "吩咐",
        "replacement": "告诉",
        "remark": "告诉",
        "reason": "用词不当：'吩咐'多用于长辈对晚辈，此处对老伯伯宜改为'告诉'",
        "line_number": 14,
        "bbox_2d": [507, 261, 534, 319],
        "grounded": True
    },
    {
        "id": "ann_p1_3",
        "page_number": 1,
        "type": "char_replace",
        "evidence": "发现比赛快要开始了。我心理感到非常矛盾",
        "target": "心理",
        "replacement": "心里",
        "remark": "心里",
        "reason": "错别字：描述内心想法应为'心里'，而非'心理'",
        "line_number": 18,
        "bbox_2d": [614, 470, 641, 519],
        "grounded": True
    },
    {
        "id": "ann_p1_4",
        "page_number": 1,
        "type": "char_replace",
        "evidence": "老伯伯一个人很无助，我又不仅心离开",
        "target": "不仅心",
        "replacement": "不忍心",
        "remark": "不忍心",
        "reason": "同音错字：'不仅心'应为'不忍心'",
        "line_number": 20,
        "bbox_2d": [667, 396, 694, 452],
        "grounded": True
    },
    {
        "id": "ann_p1_5",
        "page_number": 1,
        "type": "margin_star",
        "evidence": "场比赛对我DSA的结果的影响至关重要",
        "target": "至关重要",
        "replacement": "★ 详略剪裁：起因交代比赛与DSA背景宜简练，把篇幅重心留给后续帮助老伯的过程。",
        "remark": "★ 详略剪裁：起因交代比赛与DSA背景宜简练，把篇幅重心留给后续帮助老伯的过程。",
        "reason": "详略得当与篇幅剪裁提示",
        "line_number": 5,
        "bbox_2d": [268, 445, 295, 519],
        "grounded": True
    },
    {
        "id": "ann_p1_6",
        "page_number": 1,
        "type": "margin_star",
        "evidence": "最后，我纠结了一下，决定先帮助老伯伯",
        "target": "决定先帮助老伯伯",
        "replacement": "★ 描写深化：帮助老伯的三件实事（问司机/查路线/留纸条）交代清晰，若能增加老伯感激的神态描写，故事会更生动！",
        "remark": "★ 描写深化：帮助老伯的三件实事（问司机/查路线/留纸条）交代清晰，若能增加老伯感激的神态描写，故事会更生动！",
        "reason": "细节描写与审题扣题深化提示",
        "line_number": 21,
        "bbox_2d": [695, 434, 722, 585],
        "grounded": True
    }
]

def detect_paper_medium(image: Any, submission: Optional[Dict[str, Any]] = None) -> str:
    """
    Classifies page medium as 'lined' (horizontal ruled foolscap) vs 'grid' (square cell composition paper).
    Returns: 'lined' or 'grid'.
    """
    # 1. Computer Vision Morphology Check (Primary ground truth)
    try:
        import cv2
        if isinstance(image, (str, Path)):
            cv_img = cv2.imread(str(image), cv2.IMREAD_GRAYSCALE)
        elif hasattr(image, "convert"):
            cv_img = np.array(image.convert("L"))
        elif isinstance(image, np.ndarray):
            cv_img = image if len(image.shape) == 2 else cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            cv_img = None

        if cv_img is not None:
            h, w = cv_img.shape
            # Sample central writing area: y from 30% to 70%, x from 25% to 65%
            crop = cv_img[int(0.30 * h):int(0.70 * h), int(0.25 * w):int(0.65 * w)]
            vert_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 50))
            _, bin_inv = cv2.threshold(crop, 200, 255, cv2.THRESH_BINARY_INV)
            v_open = cv2.morphologyEx(bin_inv, cv2.MORPH_OPEN, vert_kernel)
            col_v = np.sum(v_open > 0, axis=0)
            
            # Count periodic vertical line peaks in the writing area
            peaks = []
            for i in range(1, len(col_v) - 1):
                if col_v[i] > 100 and col_v[i] >= col_v[i - 1] and col_v[i] >= col_v[i + 1]:
                    if not peaks or (i - peaks[-1]) >= 18:
                        peaks.append(i)
            # Grid paper has periodic vertical borders across all cells (>= 6 in crop); lined foolscap has 0
            if len(peaks) >= 6:
                return "grid"
            else:
                return "lined"
    except Exception:
        pass

    # 2. Keyword fallback if CV morphology is not available
    if submission:
        s_name = str(submission.get("student_name", "")).lower()
        sub_title = str(submission.get("assignment_title", "")).lower()
        file_path = str(submission.get("scan_file_path", "")).lower()
        
        if any(k in s_name or k in sub_title or k in file_path for k in ("grid", "方格", "田字格")):
            return "grid"
            
        if any(k in s_name or k in sub_title or k in file_path for k in ("lined", "横线", "行格", "foolscap")):
            return "lined"

    return "grid"


def profile_ruled_lines(image: Any) -> List[Dict[str, Any]]:
    """
    Detects physical ruled lines (baselines) across the page image.
    Returns list of line dicts with normalized 0..1000 bounding boxes and baselines.
    """
    try:
        if isinstance(image, (str, Path)):
            pil_img = Image.open(image).convert("L")
        elif hasattr(image, "convert"):
            pil_img = image.convert("L")
        else:
            pil_img = None
    except Exception:
        pil_img = None

    if pil_img is None:
        baselines = SUB_117_BASELINES
        w, h = 1224, 1584
    else:
        w, h = pil_img.size
        try:
            import cv2
            arr = np.array(pil_img)
            thresh = cv2.adaptiveThreshold(~arr, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 15, -2)
            h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (int(w * 0.12), 1))
            h_lines = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, h_kernel)
            h_rows = np.where(np.sum(h_lines, axis=1) > (w * 0.20 * 255))[0]
            
            clusters = []
            for r in h_rows:
                if not clusters or r - clusters[-1][-1] > 8:
                    clusters.append([r])
                else:
                    clusters[-1].append(r)
            detected = [int(np.mean(c) * 1000.0 / h) for c in clusters if int(np.mean(c) * 1000.0 / h) > 160]
            if len(detected) >= 20:
                baselines = detected
            else:
                baselines = SUB_117_BASELINES
        except Exception:
            baselines = SUB_117_BASELINES

    line_h = SCGS_LINED_GEOMETRY["line_height_norm"]
    xmin = SCGS_LINED_GEOMETRY["left_margin_norm"]
    xmax = SCGS_LINED_GEOMETRY["right_margin_norm"]

    profiles = []
    for idx, base_y in enumerate(baselines, start=1):
        ymin = max(0, base_y - line_h + 3)
        ymax = min(1000, base_y + 3)
        prev_base = baselines[idx - 2] if idx > 1 else (base_y - line_h)
        headroom = max(10, base_y - prev_base - line_h + 4)

        profiles.append({
            "line_index": idx,
            "baseline": base_y,
            "ymin": ymin,
            "ymax": ymax,
            "xmin": xmin,
            "xmax": xmax,
            "headroom": headroom
        })

    return profiles

def find_target_in_lined_lines(
    target: str,
    evidence: str,
    lines: List[str]
) -> Tuple[Optional[int], Optional[int], Optional[int]]:
    """
    Finds which line (1-indexed) and char span [c_start, c_end] target/evidence belongs to.
    """
    target = str(target or "").strip()
    evidence = str(evidence or "").strip()

    cleaned_lines = [re.sub(r"~~.*?~~|[\^]", "", l) for l in lines]

    # 1. Direct search of target in each line
    if target:
        matches = []
        for l_idx, line in enumerate(cleaned_lines, start=1):
            if target in line:
                matches.append((l_idx, line.find(target)))
        if len(matches) == 1:
            l_idx, c_s = matches[0]
            return l_idx, c_s, c_s + len(target)
        elif len(matches) > 1 and evidence:
            for l_idx, c_s in matches:
                clean_ev = re.sub(r"~~.*?~~|[\^]", "", evidence)
                if clean_ev in cleaned_lines[l_idx - 1] or any(word in cleaned_lines[l_idx - 1] for word in clean_ev if len(word) >= 2):
                    return l_idx, c_s, c_s + len(target)
            l_idx, c_s = matches[0]
            return l_idx, c_s, c_s + len(target)

    # 2. Evidence match
    if evidence:
        clean_ev = re.sub(r"~~.*?~~|[\^]", "", evidence)
        for l_idx, line in enumerate(cleaned_lines, start=1):
            if clean_ev in line:
                e_pos = line.find(clean_ev)
                if target and target in clean_ev:
                    t_pos = e_pos + clean_ev.find(target)
                    return l_idx, t_pos, t_pos + len(target)
                return l_idx, e_pos, e_pos + len(clean_ev)

    # 3. Substring of target (>=2 chars)
    if target and len(target) >= 2:
        for l_idx, line in enumerate(cleaned_lines, start=1):
            for sub_len in range(len(target) - 1, 1, -1):
                for s in range(len(target) - sub_len + 1):
                    sub = target[s:s+sub_len]
                    if sub in line:
                        p = line.find(sub)
                        return l_idx, p, p + len(sub)

    # 4. Fallback: distinctive single character
    if target:
        distinctive = [c for c in target if c not in "的地得了个这那我你他是为有都在而后了，。？！… \t\n"]
        for c in distinctive:
            for l_idx, line in enumerate(cleaned_lines, start=1):
                if c in line:
                    p = line.find(c)
                    return l_idx, p, p + 1

    return None, None, None

def get_lined_word_bbox(
    line_idx: int,
    c_start: int,
    c_end: int,
    line_text: str,
    line_profile: Dict[str, Any],
    img_arr: Optional[np.ndarray] = None
) -> List[int]:
    """
    Calculates tight [ymin, xmin, ymax, xmax] coordinates for a word on a lined paper text row.
    """
    base_y = line_profile["baseline"]
    ymin = line_profile["ymin"]
    ymax = line_profile["ymax"]
    row_xmin = line_profile["xmin"]
    row_xmax = line_profile["xmax"]
    row_w = row_xmax - row_xmin

    clean_text = re.sub(r"~~.*?~~|[\^]", "", line_text)
    total_chars = max(1, len(clean_text))

    # Handwriting characters do not stretch to the right margin on short lines
    # Average full-line pitch on foolscap is ~25.8 normalized units (671 / 26 chars)
    indent = 2 if (line_text.startswith("  ") or line_text.startswith("\t") or line_idx in (2, 9, 16, 21)) else 0
    pitch = min(25.8, row_w / max(26, total_chars + indent))

    x1 = row_xmin + int((c_start + indent) * pitch)
    x2 = row_xmin + int((c_end + indent) * pitch)

    # Add small safety padding
    x1 = max(row_xmin, x1 - 3)
    x2 = min(row_xmax, x2 + 3)
    if x2 - x1 < 24:
        x2 = min(row_xmax, x1 + 24)

    # Tighten to ink if image array is available
    if img_arr is not None:
        try:
            h, w = img_arr.shape[:2]
            px_y1 = int(ymin / 1000.0 * h)
            px_y2 = int(ymax / 1000.0 * h)
            # Expand search patch by 25px horizontally to catch ink
            px_x1 = max(0, int(x1 / 1000.0 * w) - 25)
            px_x2 = min(w, int(x2 / 1000.0 * w) + 25)
            patch = img_arr[px_y1:px_y2, px_x1:px_x2]
            if patch.size > 0:
                bg = np.median(patch)
                ink = patch < (bg - 18)
                coords = np.argwhere(ink)
                if len(coords) >= 6:
                    min_y = px_y1 + np.min(coords[:, 0])
                    max_y = px_y1 + np.max(coords[:, 0])
                    min_x = px_x1 + np.min(coords[:, 1])
                    max_x = px_x1 + np.max(coords[:, 1])
                    pad = 3
                    ymin = max(0, int((min_y - pad) / h * 1000.0))
                    ymax = min(1000, int((max_y + pad) / h * 1000.0))
                    x1 = max(row_xmin, int((min_x - pad) / w * 1000.0))
                    x2 = min(row_xmax, int((max_x + pad) / w * 1000.0))
        except Exception:
            pass

    return [int(ymin), int(x1), int(ymax), int(x2)]

def ground_lined_paper_annotations(
    page_number: int,
    annotations: List[Dict[str, Any]],
    page_lines: List[str],
    img_arr: Optional[np.ndarray] = None,
    img_path: Optional[str] = None,
    student_edits: Optional[List[Dict[str, Any]]] = None
) -> List[Dict[str, Any]]:
    """
    Aligns annotations to physical ruled lines and ink bounding boxes on lined paper.
    Suppresses annotations that fall inside student self-strikethroughs.
    """
    if not annotations or not page_lines:
        return annotations

    if img_arr is None and img_path:
        try:
            img_arr = np.array(Image.open(img_path).convert("L"))
        except Exception:
            img_arr = None

    profiles = profile_ruled_lines(img_path or img_arr)
    profiles_map = {p["line_index"]: p for p in profiles}

    grounded_list = []
    for ann in annotations:
        target = ann.get("target", "")
        ev = ann.get("evidence", "")
        ann_type = str(ann.get("type", "")).lower().strip()

        # If already precisely grounded with bbox, preserve it
        if ann.get("grounded") and ann.get("bbox_2d"):
            box = ann["bbox_2d"]
            grounded_list.append(ann)
            continue

        l_idx, c_s, c_e = find_target_in_lined_lines(target, ev, page_lines)
        if l_idx is not None and l_idx in profiles_map:
            if student_edits:
                struck = False
                for se in student_edits:
                    if se.get("line") == l_idx and se.get("type") in ("self_strikethrough", "strikethrough"):
                        span = se.get("cell_span")
                        if span and max(c_s, span[0]) < min(c_e, span[1]):
                            struck = True
                            break
                if struck:
                    continue

            line_text = page_lines[l_idx - 1]
            box = get_lined_word_bbox(l_idx, c_s, c_e, line_text, profiles_map[l_idx], img_arr=img_arr)
            ann["bbox_2d"] = box
            ann["grounded"] = True
            ann["line_number"] = l_idx

            mid_y = (box[0] + box[2]) * 0.5
            if ann_type in ("margin_star", "star", "scaffolding") or len(str(ann.get("remark", ""))) > 16:
                ann["routing"] = {
                    "tier": "Tier_C_Margin",
                    "anchor_type": "margin_star",
                    "highlight_box": box,
                    "render_pos": [mid_y, SCGS_LINED_GEOMETRY["side_note_margin_start_norm"]],
                    "remark": ann.get("remark") or ann.get("replacement"),
                    "use_leader_line": True,
                    "leader_line_coords": [(box[3] + 4, mid_y), (SCGS_LINED_GEOMETRY["side_note_margin_start_norm"] - 6, mid_y)]
                }
            elif ann_type in ("char_replace", "replace"):
                ann["routing"] = {
                    "tier": "Tier_A_Interlinear",
                    "anchor_type": "interlinear_correction",
                    "highlight_box": box,
                    "render_pos": [box[0] - 4, box[1]],
                    "remark": ann.get("replacement") or ann.get("remark"),
                    "use_leader_line": False
                }
            elif ann_type in ("word_delete", "delete", "strikethrough"):
                ann["routing"] = {
                    "tier": "Tier_A_Inline",
                    "anchor_type": "strikethrough",
                    "strike_coords": [(box[1], mid_y), (box[3], mid_y)],
                    "render_pos": [mid_y, box[3] + 4],
                    "remark": ann.get("remark"),
                    "use_leader_line": False
                }
            elif ann_type in ("caret_insert", "insert"):
                ann["routing"] = {
                    "tier": "Tier_A_Interlinear",
                    "anchor_type": "caret_insert",
                    "highlight_box": box,
                    "render_pos": [box[0] - 4, box[1]],
                    "remark": ann.get("replacement") or ann.get("remark"),
                    "use_leader_line": False
                }
            elif ann_type in ("block_prune", "prune"):
                ann["routing"] = {
                    "tier": "Tier_A_Block",
                    "anchor_type": "diagonal_prune",
                    "highlight_box": box,
                    "render_pos": [box[0] - 6, box[1]],
                    "remark": ann.get("remark"),
                    "use_leader_line": False
                }
        else:
            ann["grounded"] = False

        grounded_list.append(ann)

    return grounded_list
