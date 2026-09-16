import sys
import os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core import db
from app.core.pdf_processor import split_combined_pdf_into_student_docs
import pymupdf

def test_combined_pdf_split():
    print("Testing Multi-Student PDF Splitting...")
    
    # Create a mock 6-page PDF representing 3 students with 2 pages each
    test_pdf_path = Path("tests/mock_combined_class.pdf")
    doc = pymupdf.open()
    for i in range(6):
        page = doc.new_page(width=595, height=842)
        # Student 1 on pages 0,1; Student 2 on pages 2,3; Student 3 on pages 4,5
        stu_num = (i // 2) + 1
        page_num = (i % 2) + 1
        page.insert_text((50, 100), f"Student Name: Student {stu_num}\nPage: {page_num} of 2", fontsize=16)
    doc.save(str(test_pdf_path))
    doc.close()
    
    # Test splitting by 2 pages per student
    chunks = split_combined_pdf_into_student_docs(
        combined_pdf_path=str(test_pdf_path),
        pages_per_student=2,
        reverse_pages_per_student=False
    )
    
    assert len(chunks) == 3, f"Expected 3 student chunks, got {len(chunks)}"
    assert chunks[0]["page_indices"] == [0, 1]
    assert chunks[1]["page_indices"] == [2, 3]
    assert chunks[2]["page_indices"] == [4, 5]
    print("Multi-Student PDF Splitting passed! Created 3 distinct student chunks.")
    
    # Test with reverse order per student (e.g. 1,0; 3,2; 5,4)
    chunks_rev = split_combined_pdf_into_student_docs(
        combined_pdf_path=str(test_pdf_path),
        pages_per_student=2,
        reverse_pages_per_student=True
    )
    assert chunks_rev[0]["page_indices"] == [1, 0]
    assert chunks_rev[1]["page_indices"] == [3, 2]
    assert chunks_rev[2]["page_indices"] == [5, 4]
    print("Per-student reverse page ordering passed!")
    
    # Clean up test file
    if test_pdf_path.exists():
        test_pdf_path.unlink()

def test_pdf_split_with_trimming():
    print("Testing PDF Splitting with Page Trimming...")
    # Create mock 12-page PDF: 3 students, 4 pages each (where page 4 is blank)
    test_pdf_path = Path("tests/mock_combined_trim.pdf")
    doc = pymupdf.open()
    for i in range(12):
        page = doc.new_page(width=595, height=842)
        stu_num = (i // 4) + 1
        page_num = (i % 4) + 1
        if page_num == 4:
            page.insert_text((50, 100), "BLANK PAGE - INTENTIONALLY LEFT BLANK", fontsize=14)
        else:
            page.insert_text((50, 100), f"Student Name: Student {stu_num}\nPage: {page_num} of 4", fontsize=16)
    doc.save(str(test_pdf_path))
    doc.close()

    # 1. Test trimming last page
    chunks_trim_last = split_combined_pdf_into_student_docs(
        combined_pdf_path=str(test_pdf_path),
        pages_per_student=4,
        trim_last_page=True
    )
    assert len(chunks_trim_last) == 3
    assert chunks_trim_last[0]["page_indices"] == [0, 1, 2]
    assert chunks_trim_last[0]["total_pages"] == 3
    assert chunks_trim_last[0]["trimmed_pages_count"] == 1
    assert chunks_trim_last[1]["page_indices"] == [4, 5, 6]
    assert chunks_trim_last[2]["page_indices"] == [8, 9, 10]
    print("Trimming last page passed! Each student doc trimmed from 4 to 3 pages.")

    # 2. Test trimming selected pages (e.g. page 2 and page 4)
    chunks_trim_sel = split_combined_pdf_into_student_docs(
        combined_pdf_path=str(test_pdf_path),
        pages_per_student=4,
        trim_pages="2, 4"
    )
    assert len(chunks_trim_sel) == 3
    assert chunks_trim_sel[0]["page_indices"] == [0, 2]
    assert chunks_trim_sel[0]["total_pages"] == 2
    assert chunks_trim_sel[0]["trimmed_pages_count"] == 2
    assert chunks_trim_sel[1]["page_indices"] == [4, 6]
    assert chunks_trim_sel[2]["page_indices"] == [8, 10]
    print("Trimming selected pages (2, 4) passed!")

    # 3. Test trimming with reverse_pages_per_student
    chunks_trim_rev = split_combined_pdf_into_student_docs(
        combined_pdf_path=str(test_pdf_path),
        pages_per_student=4,
        reverse_pages_per_student=True,
        trim_last_page=True
    )
    assert len(chunks_trim_rev) == 3
    # Student 1 chunk [0, 1, 2, 3] reversed -> [3, 2, 1, 0]; last page trimmed -> [3, 2, 1]
    assert chunks_trim_rev[0]["page_indices"] == [3, 2, 1]
    assert chunks_trim_rev[0]["total_pages"] == 3
    print("Trimming with reverse ordering passed!")

    # Clean up test file
    if test_pdf_path.exists():
        test_pdf_path.unlink()

def test_database_matching():
    print("Testing Student Database Matching...")
    db.init_db()
    
    # Add a known student
    s_id = db.get_or_create_student("STU-100", "Luke Skywalker", "Jedi Academy")
    
    # 1. Matching existing student by name
    match1 = db.find_matching_student("luke skywalker")
    assert match1 is not None
    assert match1["id"] == s_id
    print("Matching existing student by name passed!")
    
    # 2. Matching existing student by ID
    match2 = db.find_matching_student("random name", "stu-100")
    assert match2 is not None
    assert match2["id"] == s_id
    print("Matching existing student by ID passed!")
    
    # 3. New student not in database
    match3 = db.find_matching_student("Unknown Student", "STU-999")
    assert match3 is None
    print("Unmatched new student check passed!")

if __name__ == "__main__":
    test_combined_pdf_split()
    test_pdf_split_with_trimming()
    test_database_matching()
    print("\nAll splitting & matching tests completed successfully!")
