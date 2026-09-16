import pytest
from app.core.marker_engine import (
    parse_marking_scheme_structure,
    get_effective_max_marks,
    align_extracted_questions_with_scheme
)
from app.core import db

SAMPLE_CELLS_MARKING_SCHEME = """=== MARKING SCHEME & RUBRIC (TOTAL MARKS: 34) ===

Assignment: Chapter 6 Cells (Tiered Worksheets 1 & 2)
Level: Secondary 1 G2/G3 Lower Secondary Science
Pages 1–3: Animal Cells | Pages 4–6: Plant Cells

--- PAGE 1: WS1 – ANIMAL CELLS (LEVEL 1) ---
Q1 (6 marks): Label 6 animal cell organelles (Mitochondrion, Vacuole, Cytoplasm, Cell membrane, Nucleus, DNA/Chromosome). 1 mark each. Reject chloroplast/cell wall.
Q2 (1 mark): MCQ – Red blood cell vs typical animal cell. Answer: C (no hereditary materials).

--- PAGE 2: WS1 – ANIMAL CELLS (LEVEL 2 & 3) ---
Q3 (1 mark): MCQ – Organelle absent in animal cell. Answer: B (cell wall).
Q4 (1 mark): MCQ – Cells with large vacuoles. Answer: B (ferns).
Q5 (1 mark): MCQ – Red blood cell structure/function. Answer: C (no nucleus | carry oxygen).
Q6 (1 mark): MCQ – Unicellular organism. Answer: A (amoeba).

--- PAGE 3: WS1 – ANIMAL CELLS (LEVEL 3) ---
Q7(a) (1 mark): Define cells as basic building blocks of life.
Q7(b) (3 marks): State any 3 structural differences (prokaryotic vs eukaryotic). 1 mark each.
Q7(c) (1 mark): DNA location contrast (nucleus vs free in cytoplasm). 0.5 + 0.5.

--- PAGE 4: WS2 – PLANT CELLS (LEVEL 1) ---
Q8 (6 marks): Label 6 plant cell organelles (Chloroplast, Nucleus, Mitochondrion, Cell wall, Cell membrane, Cytoplasm/Vacuole). 1 mark each.
Q9 (1 mark): MCQ – Function of vacuole. Answer: C (store dissolved nutrients/cell sap).

--- PAGE 5: WS2 – PLANT CELLS (LEVEL 2) ---
Q10 (1 mark): MCQ – Structures absent in animal cell. Answer: A (U & V = Cell Wall & Chloroplast).
Q11(a) (4 marks): Label P (Nucleus), Q (Cytoplasm), R (Cell wall), S (Chloroplast). 1 mark each.
Q11(b)(i) (1 mark): Name organelle absent in root hair cells. Answer: Chloroplast.
Q11(b)(ii) (1 mark): Explain absence (no light underground → no photosynthesis needed). 0.5 + 0.5.

--- PAGE 6: WS2 – PLANT CELLS (LEVEL 3) ---
Q12 (1 mark): MCQ – Cell membrane analogy. Answer: A (cell membrane).
Q13(a) (1 mark): State one shared structure (bacterial vs plant cell).
Q13(b) (2 marks): State any 2 structural differences (bacterial vs plant cell). 1 mark each.
"""

def test_parse_marking_scheme_structure_page_coding():
    catalog = parse_marking_scheme_structure(SAMPLE_CELLS_MARKING_SCHEME)
    assert len(catalog) == 18, f"Expected 18 questions, got {len(catalog)}"

    p1 = [q["question_no"] for q in catalog if q.get("page_number") == 1]
    assert p1 == ["1", "2"]

    p2 = [q["question_no"] for q in catalog if q.get("page_number") == 2]
    assert p2 == ["3", "4", "5", "6"]

    p3 = [q["question_no"] for q in catalog if q.get("page_number") == 3]
    assert p3 == ["7(a)", "7(b)", "7(c)"]

    p4 = [q["question_no"] for q in catalog if q.get("page_number") == 4]
    assert p4 == ["8", "9"]

    p5 = [q["question_no"] for q in catalog if q.get("page_number") == 5]
    assert p5 == ["10", "11(a)", "11(b)(i)", "11(b)(ii)"]

    p6 = [q["question_no"] for q in catalog if q.get("page_number") == 6]
    assert p6 == ["12", "13(a)", "13(b)"]

def test_get_effective_max_marks_dynamic():
    total = get_effective_max_marks(SAMPLE_CELLS_MARKING_SCHEME)
    assert total == 34.0, f"Expected 34.0 total marks, got {total}"

    test_qs = [{"max_marks": 5.0}, {"max_marks": 10.0}]
    assert get_effective_max_marks(questions=test_qs) == 15.0

def test_page_coding_alignment_prevents_collisions():
    raw_qs = [
        {"question_no": "1", "page_number": 1, "extracted_answer": "mitochondria; vacuole; cytoplasm; cell membrane; nucleus; DNA"},
        {"question_no": "2", "page_number": 1, "extracted_answer": "B"},
        {"question_no": "1", "page_number": 2, "extracted_answer": "B"},
        {"question_no": "2", "page_number": 2, "extracted_answer": "C"},
        {"question_no": "3", "page_number": 2, "extracted_answer": "C"},
        {"question_no": "1", "page_number": 2, "extracted_answer": "A"},
        {"question_no": "(a)", "page_number": 3, "extracted_answer": "cells are in living thing"},
        {"question_no": "(b)", "page_number": 3, "extracted_answer": "cell wall flagellum elongate cell"},
    ]

    aligned = align_extracted_questions_with_scheme(
        extracted_qs=raw_qs,
        marking_scheme_text=SAMPLE_CELLS_MARKING_SCHEME
    )

    p1_aligned = [q for q in aligned if q["page_number"] == 1]
    assert len(p1_aligned) == 2
    assert p1_aligned[0]["question_no"] == "1" and p1_aligned[0]["max_marks"] == 6.0
    assert p1_aligned[1]["question_no"] == "2" and p1_aligned[1]["max_marks"] == 1.0

    p2_aligned = [q for q in aligned if q["page_number"] == 2]
    assert len(p2_aligned) == 4
    p2_nos = [q["question_no"] for q in p2_aligned]
    assert p2_nos == ["3", "4", "5", "6"], f"Expected ['3', '4', '5', '6'], got {p2_nos}"
    assert p2_aligned[0]["extracted_answer"] == "B"
    assert p2_aligned[1]["extracted_answer"] == "C"
    assert p2_aligned[2]["extracted_answer"] == "C"
    assert p2_aligned[3]["extracted_answer"] == "A"

    p3_aligned = [q for q in aligned if q["page_number"] == 3]
    assert len(p3_aligned) == 3
    assert p3_aligned[0]["question_no"] == "7(a)" and p3_aligned[0]["extracted_answer"] == "cells are in living thing"
    assert p3_aligned[1]["question_no"] == "7(b)" and p3_aligned[1]["extracted_answer"] == "cell wall flagellum elongate cell"
    assert p3_aligned[2]["question_no"] == "7(c)" and "[Blank" in p3_aligned[2]["extracted_answer"]

    p4_aligned = [q for q in aligned if q["page_number"] == 4]
    assert [q["question_no"] for q in p4_aligned] == ["8", "9"]

    p5_aligned = [q for q in aligned if q["page_number"] == 5]
    assert [q["question_no"] for q in p5_aligned] == ["10", "11(a)", "11(b)(i)", "11(b)(ii)"]

    p6_aligned = [q for q in aligned if q["page_number"] == 6]
    assert [q["question_no"] for q in p6_aligned] == ["12", "13(a)", "13(b)"]

    assert len(aligned) == 18
    total_marks = sum(q["max_marks"] for q in aligned)
    assert total_marks == 34.0

def test_dynamic_fuzzy_student_matching():
    conn = db.get_db_connection()
    conn.execute("DELETE FROM students WHERE student_id = 'TEST-FUZZY-01'")
    conn.execute("INSERT INTO students (student_id, name, class_name) VALUES ('TEST-FUZZY-01', 'Arshan Patel', '1G3 EIH')")
    conn.commit()
    conn.close()

    try:
        matched = db.find_matching_student(name="Aishan Patel", class_name="1G3 EIH")
        assert matched is not None, "Fuzzy match failed for 'Aishan Patel' -> 'Arshan Patel'"
        assert matched["name"] == "Arshan Patel"
        assert matched["student_id"] == "TEST-FUZZY-01"
    finally:
        conn = db.get_db_connection()
        conn.execute("DELETE FROM students WHERE student_id = 'TEST-FUZZY-01'")
        conn.commit()
        conn.close()
