import os
import io
import json
import base64
from pathlib import Path
from typing import List, Dict, Any, Tuple
from PIL import Image
import pymupdf
from app.core.config import PROCESSED_DIR

def parse_trim_pages(trim_pages: Any = None, trim_last_page: bool = False, chunk_size: int = 1) -> set:
    """
    Parses trim options and returns a set of 1-based page indices to trim.
    Supports comma-separated strings (e.g., '2,4', '4', 'last'), lists, sets, and JSON arrays.
    """
    to_trim = set()
    if trim_last_page and chunk_size > 1:
        to_trim.add(chunk_size)
        
    if trim_pages:
        if isinstance(trim_pages, str):
            raw = trim_pages.strip()
            if raw.startswith("[") and raw.endswith("]"):
                try:
                    parsed = json.loads(raw)
                    for item in parsed:
                        if isinstance(item, int):
                            to_trim.add(item)
                        elif str(item).lower() == "last":
                            to_trim.add(chunk_size)
                except Exception:
                    pass
            else:
                for part in raw.replace(";", ",").split(","):
                    p = part.strip()
                    if not p:
                        continue
                    if p.lower() == "last":
                        to_trim.add(chunk_size)
                    elif p.isdigit():
                        to_trim.add(int(p))
        elif isinstance(trim_pages, (list, tuple, set)):
            for item in trim_pages:
                if isinstance(item, int):
                    to_trim.add(item)
                elif str(item).lower() == "last":
                    to_trim.add(chunk_size)
    return to_trim

def process_scanned_document(
    file_path: str,
    submission_id: int,
    reverse_order: bool = False,
    trim_pages: Optional[Any] = None,
    trim_last_page: bool = False
) -> List[Dict[str, Any]]:
    """
    Takes a PDF or image file, renders each page into a high-res image and thumbnail,
    and returns a structured list of page metadata.
    Supports reverse order for scans that came out backwards from the document feeder.
    Supports trimming blank or selected pages.
    """
    path = Path(file_path)
    output_dir = PROCESSED_DIR / f"sub_{submission_id}"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    pages = []
    
    if path.suffix.lower() == ".pdf":
        doc = pymupdf.open(str(path))
        num_pages = len(doc)
        page_indices = list(range(num_pages))
        if reverse_order:
            page_indices.reverse()
            
        orig_len = len(page_indices)
        pages_to_trim = parse_trim_pages(trim_pages, trim_last_page=trim_last_page, chunk_size=orig_len)
        if pages_to_trim:
            filtered = [idx for pos_1based, idx in enumerate(page_indices, start=1) if pos_1based not in pages_to_trim]
            if filtered:
                page_indices = filtered
            
        for display_idx, orig_page_num in enumerate(page_indices, start=1):
            page = doc.load_page(orig_page_num)
            # High-res rendering: 2x resolution (144 dpi or 200 dpi) for crisp text/handwriting
            zoom = 2.0
            mat = pymupdf.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            
            page_img_filename = f"page_{display_idx}.jpg"
            thumb_filename = f"thumb_{display_idx}.jpg"
            
            page_img_path = output_dir / page_img_filename
            thumb_path = output_dir / thumb_filename
            
            # Save main high-res image
            pix.save(str(page_img_path))
            
            # Generate thumbnail
            pil_img = Image.open(page_img_path)
            pil_img.thumbnail((300, 400), Image.Resampling.LANCZOS)
            pil_img.save(str(thumb_path), "JPEG", quality=85)
            
            # Extract any embedded digital text if available
            extracted_text = page.get_text("text").strip()
            
            pages.append({
                "page_number": display_idx,
                "original_page_index": orig_page_num,
                "image_path": str(page_img_path),
                "thumbnail_path": str(thumb_path),
                "rotation": 0,
                "extracted_text": extracted_text,
                "width": pix.width,
                "height": pix.height
            })
        doc.close()
    else:
        # Single image file (JPG, PNG, etc.)
        pil_img = Image.open(str(path))
        if pil_img.mode in ("RGBA", "P"):
            pil_img = pil_img.convert("RGB")
            
        page_img_filename = "page_1.jpg"
        thumb_filename = "thumb_1.jpg"
        page_img_path = output_dir / page_img_filename
        thumb_path = output_dir / thumb_filename
        
        pil_img.save(str(page_img_path), "JPEG", quality=95)
        
        thumb_img = pil_img.copy()
        thumb_img.thumbnail((300, 400), Image.Resampling.LANCZOS)
        thumb_img.save(str(thumb_path), "JPEG", quality=85)
        
        pages.append({
            "page_number": 1,
            "original_page_index": 0,
            "image_path": str(page_img_path),
            "thumbnail_path": str(thumb_path),
            "rotation": 0,
            "extracted_text": "",
            "width": pil_img.width,
            "height": pil_img.height
        })
        
    return pages

def reorder_pages(pages: List[Dict[str, Any]], new_order_indices: List[int]) -> List[Dict[str, Any]]:
    """Reorders pages based on a list of original indices or new sequence."""
    reordered = []
    for i, idx in enumerate(new_order_indices, start=1):
        if 0 <= idx < len(pages):
            p = dict(pages[idx])
            p["page_number"] = i
            reordered.append(p)
    return reordered

def reverse_pages_list(pages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Reverses the order of pages."""
    reversed_pages = list(reversed(pages))
    for i, p in enumerate(reversed_pages, start=1):
        p["page_number"] = i
    return reversed_pages

def rotate_page_image(page_img_path: str, angle_degrees: int) -> bool:
    """Rotates an existing page image by 90, 180, or 270 degrees in place."""
    try:
        path = Path(page_img_path)
        if not path.exists():
            return False
        with Image.open(str(path)) as img:
            rotated = img.rotate(-angle_degrees, expand=True)
            rotated.save(str(path), quality=95)
        return True
    except Exception:
        return False

def get_page_base64(image_path: str, max_dimension: int = 1600) -> str:
    """
    Encodes an image to a base64 string optimized for vision LLMs.
    Resizes if larger than max_dimension to keep token counts compact
    while preserving full handwritten text and formula readability.
    """
    try:
        with Image.open(image_path) as img:
            img = img.convert("RGB")
            w, h = img.size
            if max(w, h) > max_dimension:
                scale = max_dimension / float(max(w, h))
                new_w = int(w * scale)
                new_h = int(h * scale)
                img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            
            import io
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=85, optimize=True)
            return base64.b64encode(buf.getvalue()).decode("utf-8")
    except Exception:
        with open(image_path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")

def split_combined_pdf_into_student_docs(
    combined_pdf_path: str,
    pages_per_student: int = 1,
    reverse_pages_per_student: bool = False,
    reverse_entire_scan: bool = False,
    trim_pages: Optional[Any] = None,
    trim_last_page: bool = False
) -> List[Dict[str, Any]]:
    """
    Splits a multi-student combined PDF file into individual student chunks.
    Supports reversing order within each student document, as well as reversing the whole batch.
    Supports trimming blank or selected pages (e.g. trimming the last page of each student booklet).
    """
    if not Path(combined_pdf_path).exists():
        raise FileNotFoundError(f"File not found: {combined_pdf_path}")
        
    try:
        doc = pymupdf.open(combined_pdf_path)
    except Exception as e:
        raise ValueError(f"Could not open document. Please ensure it is a valid PDF file: {str(e)}")
        
    total_pages = len(doc)
    doc.close()
    
    if total_pages == 0:
        raise ValueError("The uploaded document contains 0 pages.")
        
    all_page_indices = list(range(total_pages))
    if reverse_entire_scan:
        all_page_indices.reverse()
        
    student_chunks = []
    for i in range(0, total_pages, pages_per_student):
        chunk_indices = all_page_indices[i : i + pages_per_student]
        if reverse_pages_per_student:
            chunk_indices = list(reversed(chunk_indices))
            
        chunk_len = len(chunk_indices)
        pages_to_trim = parse_trim_pages(trim_pages, trim_last_page=trim_last_page, chunk_size=chunk_len)
        
        filtered_indices = [
            idx for pos_1based, idx in enumerate(chunk_indices, start=1)
            if pos_1based not in pages_to_trim
        ]
        
        # Guard: if trimming would remove all pages, retain original chunk
        if not filtered_indices:
            filtered_indices = chunk_indices
            
        student_chunks.append({
            "student_index": len(student_chunks) + 1,
            "page_indices": filtered_indices,
            "total_pages": len(filtered_indices),
            "trimmed_pages_count": chunk_len - len(filtered_indices)
        })
        
    return student_chunks

def render_and_save_student_pages(
    combined_pdf_path: str,
    page_indices: List[int],
    submission_id: int
) -> List[Dict[str, Any]]:
    """
    Extracts a specific student's page indices from a combined PDF and saves
    high-res images & thumbnails for that submission.
    """
    output_dir = PROCESSED_DIR / f"sub_{submission_id}"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    doc = pymupdf.open(combined_pdf_path)
    pages = []
    
    for display_idx, page_idx in enumerate(page_indices, start=1):
        page = doc.load_page(page_idx)
        zoom = 2.0
        mat = pymupdf.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        
        page_img_filename = f"page_{display_idx}.jpg"
        thumb_filename = f"thumb_{display_idx}.jpg"
        
        page_img_path = output_dir / page_img_filename
        thumb_path = output_dir / thumb_filename
        
        pix.save(str(page_img_path))
        
        pil_img = Image.open(page_img_path)
        pil_img.thumbnail((300, 400), Image.Resampling.LANCZOS)
        pil_img.save(str(thumb_path), "JPEG", quality=85)
        
        extracted_text = page.get_text("text").strip()
        
        pages.append({
            "page_number": display_idx,
            "original_page_index": page_idx,
            "image_path": str(page_img_path),
            "thumbnail_path": str(thumb_path),
            "rotation": 0,
            "extracted_text": extracted_text,
            "width": pix.width,
            "height": pix.height
        })
        
    doc.close()
    return pages

