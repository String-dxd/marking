import math
import re
from typing import List, Dict, Any, Tuple, Optional
from PIL import Image, ImageOps

class LayoutEngine:
    """
    Universal Geometry-Agnostic Layout Engine for Handwritten Scripts.
    Handles manuscript grid paper, single-lined foolscap, and unlined pages without cell anchors.
    Provides line baseline profiling, substring span interpolation, and 3-tier collision avoidance.
    """

    @staticmethod
    def profile_text_lines(image: Image.Image) -> List[Dict[str, Any]]:
        """
        Profiles continuous horizontal text lines using row-wise edge & darkness projection.
        Returns a list of line profiles with bounding boxes, baselines, and headroom clearances.
        """
        w, h = image.size
        # Downsample for ultra-fast profiling (normalize to height 1000)
        scale = 1000.0 / max(1, h)
        thumb_w = max(100, int(w * scale))
        thumb_h = 1000
        
        # Convert to grayscale & compute vertical gradient/darkness
        gray = image.convert("L").resize((thumb_w, thumb_h), Image.Resampling.BILINEAR)
        # Invert so ink = high values
        inverted = ImageOps.invert(gray)
        
        # Horizontal projection (average ink density across central 80% of page)
        left_margin = int(thumb_w * 0.1)
        right_margin = int(thumb_w * 0.9)
        
        pixels = inverted.load()
        row_density = []
        for y in range(thumb_h):
            row_sum = sum(pixels[x, y] for x in range(left_margin, right_margin))
            row_density.append(row_sum / max(1, (right_margin - left_margin)))
            
        # Threshold to identify active text bands
        avg_density = sum(row_density) / len(row_density)
        threshold = max(8.0, avg_density * 0.85)
        
        raw_bands = []
        in_band = False
        start_y = 0
        
        for y, val in enumerate(row_density):
            if val > threshold and not in_band:
                in_band = True
                start_y = y
            elif val <= threshold and in_band:
                in_band = False
                band_h = y - start_y
                if band_h >= 10:  # Minimum line height filter
                    raw_bands.append((start_y, y))
                    
        if in_band and (thumb_h - start_y) >= 10:
            raw_bands.append((start_y, thumb_h))
            
        # Merge bands that are too close (interlinear gap < 6px)
        merged_bands = []
        for b_start, b_end in raw_bands:
            if not merged_bands:
                merged_bands.append([b_start, b_end])
            else:
                prev_start, prev_end = merged_bands[-1]
                if b_start - prev_end < 6:
                    merged_bands[-1][1] = b_end
                else:
                    merged_bands.append([b_start, b_end])
                    
        # If projection profile failed (e.g. very faint scan), generate standard default line slots
        if not merged_bands:
            default_line_h = 35
            gap = 12
            curr_y = 120
            while curr_y + default_line_h < 950:
                merged_bands.append([curr_y, curr_y + default_line_h])
                curr_y += default_line_h + gap

        # Construct line profile records
        line_profiles = []
        for idx, (b_start, b_end) in enumerate(merged_bands, start=1):
            # Scale back to original pixel coordinates
            ymin_orig = int(b_start / scale)
            ymax_orig = int(b_end / scale)
            
            # Estimate baseline: ~75% down the line height
            baseline_orig = ymin_orig + int((ymax_orig - ymin_orig) * 0.75)
            
            # Compute headroom above this line
            if idx == 1:
                headroom = ymin_orig - 0
            else:
                prev_ymax = line_profiles[-1]["ymax"]
                headroom = max(0, ymin_orig - prev_ymax)
                
            line_profiles.append({
                "line_index": idx,
                "ymin": ymin_orig,
                "ymax": ymax_orig,
                "height": ymax_orig - ymin_orig,
                "baseline": baseline_orig,
                "xmin": int(w * 0.08),
                "xmax": int(w * 0.92),
                "headroom": headroom,
                # Normalized 0..1000 scale
                "norm_ymin": int(ymin_orig * 1000.0 / h),
                "norm_ymax": int(ymax_orig * 1000.0 / h),
                "norm_headroom": int(headroom * 1000.0 / h)
            })
            
        return line_profiles

    @staticmethod
    def locate_substring_span(
        full_line_text: str,
        target_subphrase: str,
        line_xmin: float,
        line_xmax: float
    ) -> Tuple[float, float]:
        """
        Locates the horizontal pixel span [x1, x2] of target_subphrase within full_line_text
        using proportional character interpolation with punctuation weighting.
        """
        full_s = str(full_line_text or "").strip()
        sub_s = str(target_subphrase or "").strip()
        
        if not full_s or not sub_s or len(full_s) == 0:
            mid_x = (line_xmin + line_xmax) * 0.5
            return (mid_x - 30, mid_x + 30)
            
        # Find start index in string
        idx = full_s.find(sub_s)
        if idx == -1:
            idx = full_s.lower().find(sub_s.lower())
            
        if idx == -1:
            idx = 0
            sub_len = min(len(sub_s), len(full_s))
        else:
            sub_len = len(sub_s)
            
        total_chars = max(1, len(full_s))
        line_w = max(10, line_xmax - line_xmin)
        
        x1 = line_xmin + (idx / total_chars) * line_w
        x2 = line_xmin + ((idx + sub_len) / total_chars) * line_w
        
        if x2 - x1 < 24:
            x2 = x1 + 24
            
        return (x1, min(line_xmax, x2))

    @staticmethod
    def route_collision_free_placement(
        ann_type: str,
        target_bbox: List[float],  # [ymin, xmin, ymax, xmax]
        remark: str,
        headroom_px: float,
        page_w: int,
        page_h: int
    ) -> Dict[str, Any]:
        """
        Routes the visual placement of an annotation using the 3-Tier Collision Avoidance model:
        - Tier A (Interlinear Float): headroom >= 14px -> placed directly above word.
        - Tier B (45° Leader-Line Callout): crowded headroom -> circle + leader line to whitespace.
        - Tier C (Margin Column Pinning): star notes, scaffolding, long text -> pinned in lateral margin.
        """
        ymin, xmin, ymax, xmax = target_bbox
        ann_type = str(ann_type).lower().strip()
        mid_y = (ymin + ymax) * 0.5
        mid_x = (xmin + xmax) * 0.5
        line_h = max(16.0, ymax - ymin)
        
        # Long commentary, Star notes, LORMS badges -> Tier C (Dedicated Margin Column)
        if ann_type in ("margin_star", "star", "scaffolding", "lorms_badge") or len(remark) > 15:
            right_margin_x = page_w - int(page_w * 0.22)
            if right_margin_x < xmax + 20:
                right_margin_x = min(page_w - 40, xmax + 15)
                
            return {
                "tier": "Tier_C_Margin",
                "anchor_type": "margin_star",
                "highlight_box": [ymin, xmin, ymax, xmax],
                "render_pos": [mid_y, right_margin_x],
                "remark": remark,
                "use_leader_line": True,
                "leader_line_coords": [(xmax + 4, mid_y), (right_margin_x - 6, mid_y)]
            }
            
        # Character Replacement / Error Correction
        if ann_type in ("char_replace", "replace"):
            if headroom_px >= 14.0:
                target_y = ymin - 4
                return {
                    "tier": "Tier_A_Interlinear",
                    "anchor_type": "interlinear_correction",
                    "highlight_box": [ymin, xmin, ymax, xmax],
                    "render_pos": [target_y, xmin],
                    "remark": remark,
                    "use_leader_line": False
                }
            else:
                leader_start = (mid_x, ymin)
                leader_end_x = min(page_w - 40, xmax + 25)
                leader_end_y = max(10, ymin - 16)
                return {
                    "tier": "Tier_B_LeaderLine",
                    "anchor_type": "leader_line_correction",
                    "highlight_box": [ymin, xmin, ymax, xmax],
                    "render_pos": [leader_end_y - 2, leader_end_x + 4],
                    "remark": remark,
                    "use_leader_line": True,
                    "leader_line_coords": [leader_start, (leader_end_x, leader_end_y)]
                }
                
        # Caret Insertion
        if ann_type in ("caret_insert", "insert"):
            target_y = ymin - 4 if headroom_px >= 12.0 else ymin - 18
            return {
                "tier": "Tier_A_Interlinear" if headroom_px >= 12.0 else "Tier_B_LeaderLine",
                "anchor_type": "caret_insert",
                "highlight_box": [ymin, xmin, ymax, xmax],
                "caret_peak": (xmin, ymin),
                "render_pos": [target_y, xmin],
                "remark": remark,
                "use_leader_line": False
            }
            
        # Word / Clause Deletion (Strikethrough)
        if ann_type in ("word_delete", "delete", "strikethrough"):
            return {
                "tier": "Tier_A_Inline",
                "anchor_type": "strikethrough",
                "strike_coords": [(xmin, mid_y), (xmax, mid_y)],
                "render_pos": [mid_y, xmax + 4],
                "remark": remark,
                "use_leader_line": False
            }
            
        # Paragraph / Block Prune (Diagonal Slash)
        if ann_type in ("block_prune", "prune"):
            return {
                "tier": "Tier_A_Block",
                "anchor_type": "diagonal_prune",
                "slash_coords": [(xmin, ymin), (xmax, ymax)],
                "render_pos": [ymin - 6, xmin],
                "remark": remark,
                "use_leader_line": False
            }
            
        # Logic Cross (Contradiction ✗)
        if ann_type in ("logic_cross", "cross"):
            return {
                "tier": "Tier_B_LeaderLine" if headroom_px < 14.0 else "Tier_A_Interlinear",
                "anchor_type": "logic_cross",
                "highlight_box": [ymin, xmin, ymax, xmax],
                "cross_center": (mid_x, mid_y),
                "render_pos": [ymin - 6 if headroom_px >= 14.0 else ymax + 14, xmin],
                "remark": remark,
                "use_leader_line": False
            }

        # Default fallback
        return {
            "tier": "Tier_A_Default",
            "anchor_type": "default",
            "highlight_box": [ymin, xmin, ymax, xmax],
            "render_pos": [mid_y, xmax + 8],
            "remark": remark,
            "use_leader_line": False
        }

    @staticmethod
    def resolve_margin_collisions(
        annotations: List[Dict[str, Any]],
        page_h: int = 1000,
        min_gap: float = 40.0
    ) -> List[Dict[str, Any]]:
        """
        Relaxes vertical positions of Tier_C_Margin annotations on a page so they do not overlap.
        Preserves relative vertical reading order and updates leader line endpoints accordingly.
        """
        if not annotations:
            return annotations

        margin_anns = []
        for ann in annotations:
            routing = ann.get("routing")
            if routing and routing.get("tier") == "Tier_C_Margin":
                margin_anns.append(ann)

        if len(margin_anns) <= 1:
            return annotations

        # Sort margin annotations by their desired y position
        margin_anns.sort(key=lambda a: a["routing"]["render_pos"][0])

        # Push overlapping notes down
        for i in range(1, len(margin_anns)):
            prev_y = margin_anns[i - 1]["routing"]["render_pos"][0]
            curr_y = margin_anns[i]["routing"]["render_pos"][0]
            if curr_y - prev_y < min_gap:
                new_y = prev_y + min_gap
                margin_anns[i]["routing"]["render_pos"][0] = new_y
                # Update leader line endpoint if present
                coords = margin_anns[i]["routing"].get("leader_line_coords")
                if coords and len(coords) >= 2:
                    p1, p2 = coords[0], coords[1]
                    margin_anns[i]["routing"]["leader_line_coords"] = [p1, (p2[0], new_y)]

        # If last element exceeded page_h - 40, push back upwards
        max_allowable = float(page_h - 40)
        if margin_anns[-1]["routing"]["render_pos"][0] > max_allowable:
            margin_anns[-1]["routing"]["render_pos"][0] = max_allowable
            coords = margin_anns[-1]["routing"].get("leader_line_coords")
            if coords and len(coords) >= 2:
                margin_anns[-1]["routing"]["leader_line_coords"] = [coords[0], (coords[1][0], max_allowable)]

            for i in range(len(margin_anns) - 2, -1, -1):
                next_y = margin_anns[i + 1]["routing"]["render_pos"][0]
                curr_y = margin_anns[i]["routing"]["render_pos"][0]
                if next_y - curr_y < min_gap:
                    new_y = max(30.0, next_y - min_gap)
                    margin_anns[i]["routing"]["render_pos"][0] = new_y
                    coords = margin_anns[i]["routing"].get("leader_line_coords")
                    if coords and len(coords) >= 2:
                        margin_anns[i]["routing"]["leader_line_coords"] = [coords[0], (coords[1][0], new_y)]

        return annotations

