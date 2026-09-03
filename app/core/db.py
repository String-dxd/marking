import sqlite3
import json
import secrets
from datetime import datetime
from typing import List, Dict, Any, Optional
from app.core.config import DB_PATH

def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Students Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        email TEXT,
        class_name TEXT NOT NULL,
        subject TEXT DEFAULT '',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Check if subject column exists for existing database
    cursor.execute("PRAGMA table_info(students)")
    student_cols = [row["name"] for row in cursor.fetchall()]
    if "subject" not in student_cols:
        cursor.execute("ALTER TABLE students ADD COLUMN subject TEXT DEFAULT ''")
    
    # Assignments Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS assignments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        subject TEXT NOT NULL,
        class_name TEXT NOT NULL,
        max_marks REAL NOT NULL DEFAULT 100.0,
        marking_scheme_text TEXT,
        marking_scheme_file TEXT,
        rubric_json TEXT, -- JSON structure of questions and criteria
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # Submissions Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        assignment_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending', -- pending, marking, review_ready, approved
        scan_file_path TEXT,
        pages_json TEXT, -- JSON array of page image paths and metadata
        total_score REAL DEFAULT 0.0,
        percentage REAL DEFAULT 0.0,
        grade_letter TEXT DEFAULT '',
        overall_feedback TEXT DEFAULT '',
        strengths_feedback TEXT DEFAULT '',
        improvement_feedback TEXT DEFAULT '',
        ai_model_used TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        approved_at TIMESTAMP,
        FOREIGN KEY (assignment_id) REFERENCES assignments (id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES students (id) ON DELETE CASCADE
    )
    """)
    
    # QuestionGrades Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS question_grades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        submission_id INTEGER NOT NULL,
        question_no TEXT NOT NULL,
        question_title TEXT,
        max_marks REAL NOT NULL,
        awarded_marks REAL NOT NULL DEFAULT 0.0,
        extracted_answer TEXT,
        criteria_breakdown_json TEXT,
        feedback_comment TEXT,
        annotations_json TEXT DEFAULT '[]',
        page_number INTEGER DEFAULT 1,
        FOREIGN KEY (submission_id) REFERENCES submissions (id) ON DELETE CASCADE
    )
    """)

    # Check and migrate columns for existing database
    cursor.execute("PRAGMA table_info(submissions)")
    sub_cols = [row["name"] for row in cursor.fetchall()]
    if "annotations_json" not in sub_cols:
        cursor.execute("ALTER TABLE submissions ADD COLUMN annotations_json TEXT DEFAULT '[]'")

    cursor.execute("PRAGMA table_info(question_grades)")
    qg_cols = [row["name"] for row in cursor.fetchall()]
    if "annotations_json" not in qg_cols:
        cursor.execute("ALTER TABLE question_grades ADD COLUMN annotations_json TEXT DEFAULT '[]'")
    if "page_number" not in qg_cols:
        cursor.execute("ALTER TABLE question_grades ADD COLUMN page_number INTEGER DEFAULT 1")
    
    conn.commit()
    conn.close()

# Helper DAO functions

def generate_unique_student_id(prefix: str = "STU", cursor: Optional[sqlite3.Cursor] = None) -> str:
    """Generates a guaranteed unique student ID code like STU-A7F29B41."""
    if cursor:
        while True:
            candidate_code = f"{prefix}-{secrets.token_hex(4).upper()}"
            row = cursor.execute("SELECT id FROM students WHERE student_id = ?", (candidate_code,)).fetchone()
            if not row:
                return candidate_code
    else:
        conn = get_db_connection()
        c = conn.cursor()
        while True:
            candidate_code = f"{prefix}-{secrets.token_hex(4).upper()}"
            row = c.execute("SELECT id FROM students WHERE student_id = ?", (candidate_code,)).fetchone()
            if not row:
                conn.close()
                return candidate_code

def get_all_students() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    rows = conn.execute("SELECT * FROM students ORDER BY name ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_student_by_id(student_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def delete_student(student_id: int) -> bool:
    """Deletes a student along with their submissions and question grades."""
    return bulk_delete_students([student_id]) > 0

def bulk_delete_students(student_ids: List[int]) -> int:
    """Deletes multiple students along with their submissions and question grades."""
    valid_ids = [int(sid) for sid in student_ids if sid]
    if not valid_ids:
        return 0
    conn = get_db_connection()
    cursor = conn.cursor()
    placeholders = ",".join("?" for _ in valid_ids)
    
    sub_rows = cursor.execute(f"SELECT id FROM submissions WHERE student_id IN ({placeholders})", valid_ids).fetchall()
    sub_ids = [r["id"] for r in sub_rows]
    
    if sub_ids:
        sub_placeholders = ",".join("?" for _ in sub_ids)
        cursor.execute(f"DELETE FROM question_grades WHERE submission_id IN ({sub_placeholders})", sub_ids)
        cursor.execute(f"DELETE FROM submissions WHERE id IN ({sub_placeholders})", sub_ids)
        
    cursor.execute(f"DELETE FROM students WHERE id IN ({placeholders})", valid_ids)
    deleted_count = cursor.rowcount
    conn.commit()
    conn.close()
    return deleted_count

def update_student(student_id: int, name: str, class_name: str, subject: str = "", email: str = "", notes: str = "") -> Optional[Dict[str, Any]]:
    """Updates an existing student profile."""
    conn = get_db_connection()
    cursor = conn.cursor()
    row = cursor.execute("SELECT id FROM students WHERE id = ?", (student_id,)).fetchone()
    if not row:
        conn.close()
        return None
        
    cursor.execute("""
        UPDATE students
        SET name = ?, class_name = ?, subject = ?, email = ?, notes = ?
        WHERE id = ?
    """, (name.strip(), class_name.strip(), subject.strip(), email.strip(), notes.strip(), student_id))
    conn.commit()
    
    updated = cursor.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
    conn.close()
    return dict(updated) if updated else None

def get_or_create_student(student_id_code: Optional[str] = None, name: str = "", class_name: str = "General", email: str = "", subject: str = "", notes: str = "") -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    row = None
    if student_id_code and student_id_code.strip():
        row = cursor.execute("SELECT id FROM students WHERE student_id = ?", (student_id_code.strip(),)).fetchone()
        
    if not row and name and name.strip():
        row = cursor.execute(
            "SELECT id FROM students WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND LOWER(TRIM(class_name)) = LOWER(TRIM(?))",
            (name.strip(), class_name.strip())
        ).fetchone()
        
    if row:
        s_id = row["id"]
        updates = []
        params = []
        if subject and subject.strip():
            updates.append("subject = ?")
            params.append(subject.strip())
        if email and email.strip():
            updates.append("email = ?")
            params.append(email.strip())
        if notes and notes.strip():
            updates.append("notes = ?")
            params.append(notes.strip())
        if updates:
            params.append(s_id)
            cursor.execute(f"UPDATE students SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()
    else:
        if not student_id_code or not student_id_code.strip():
            student_id_code = generate_unique_student_id(cursor=cursor)
        cursor.execute(
            "INSERT INTO students (student_id, name, class_name, email, subject, notes) VALUES (?, ?, ?, ?, ?, ?)",
            (student_id_code.strip(), name.strip(), class_name.strip(), email.strip(), subject.strip(), notes.strip())
        )
        conn.commit()
        s_id = cursor.lastrowid
    conn.close()
    return s_id

def bulk_import_roster(students_data: List[Dict[str, str]]) -> Dict[str, Any]:
    """
    Imports a list of student records: [{'name': ..., 'class_name': ..., 'subject': ..., 'email': ...}]
    Assigns unique student IDs automatically in the backend. Updates existing students if name + class matches.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    created_count = 0
    updated_count = 0
    imported_students = []

    for item in students_data:
        name = (item.get("name") or "").strip()
        if not name:
            continue
        class_name = (item.get("class_name") or "General").strip()
        subject = (item.get("subject") or "").strip()
        email = (item.get("email") or "").strip()
        
        # Check if student exists by name and class
        row = cursor.execute(
            "SELECT id, student_id, name, class_name, subject, email FROM students WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND LOWER(TRIM(class_name)) = LOWER(TRIM(?))",
            (name, class_name)
        ).fetchone()
        
        if row:
            s_id = row["id"]
            cur_subj = row["subject"] or ""
            cur_email = row["email"] or ""
            new_subj = subject if subject else cur_subj
            new_email = email if email else cur_email
            
            updated = False
            if new_subj != cur_subj or new_email != cur_email:
                cursor.execute("UPDATE students SET subject = ?, email = ? WHERE id = ?", (new_subj, new_email, s_id))
                updated = True
                updated_count += 1
                
            imported_students.append({
                "id": s_id,
                "name": name,
                "class_name": class_name,
                "subject": new_subj,
                "status": "updated" if updated else "existing"
            })
        else:
            # Generate unique student ID
            new_stu_id = f"STU-{secrets.token_hex(4).upper()}"
            while cursor.execute("SELECT id FROM students WHERE student_id = ?", (new_stu_id,)).fetchone():
                new_stu_id = f"STU-{secrets.token_hex(4).upper()}"
                
            cursor.execute(
                "INSERT INTO students (student_id, name, class_name, email, subject) VALUES (?, ?, ?, ?, ?)",
                (new_stu_id, name, class_name, email, subject)
            )
            created_count += 1
            imported_students.append({
                "id": cursor.lastrowid,
                "name": name,
                "class_name": class_name,
                "subject": subject,
                "status": "created"
            })
            
    conn.commit()
    conn.close()
    
    return {
        "total": len(imported_students),
        "created": created_count,
        "updated": updated_count,
        "students": imported_students
    }

def create_assignment(title: str, subject: str, class_name: str, max_marks: float, marking_scheme_text: str, marking_scheme_file: str = "", rubric_json: str = "[]") -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO assignments (title, subject, class_name, max_marks, marking_scheme_text, marking_scheme_file, rubric_json)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (title, subject, class_name, max_marks, marking_scheme_text, marking_scheme_file, rubric_json)
    )
    conn.commit()
    a_id = cursor.lastrowid
    conn.close()
    return a_id

def get_all_assignments() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    rows = conn.execute("""
        SELECT a.*, 
               (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id) as submission_count,
               (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id AND s.status = 'approved') as approved_count
        FROM assignments a 
        ORDER BY a.created_at DESC
    """).fetchall()
    conn.close()
    return [dict(r) for r in rows]

def get_assignment_by_id(assignment_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    row = conn.execute("SELECT * FROM assignments WHERE id = ?", (assignment_id,)).fetchone()
    conn.close()
    return dict(row) if row else None

def update_assignment(
    assignment_id: int,
    title: str,
    subject: str,
    class_name: str,
    max_marks: float,
    marking_scheme_text: str,
    rubric_json: str = "[]"
) -> Optional[Dict[str, Any]]:
    """Updates an existing assignment details and marking scheme."""
    conn = get_db_connection()
    cursor = conn.cursor()
    row = cursor.execute("SELECT id FROM assignments WHERE id = ?", (assignment_id,)).fetchone()
    if not row:
        conn.close()
        return None
    cursor.execute("""
        UPDATE assignments
        SET title = ?, subject = ?, class_name = ?, max_marks = ?, marking_scheme_text = ?, rubric_json = ?
        WHERE id = ?
    """, (title.strip(), subject.strip(), class_name.strip(), float(max_marks), marking_scheme_text.strip(), rubric_json.strip() if rubric_json else "[]", assignment_id))
    conn.commit()
    updated = cursor.execute("SELECT * FROM assignments WHERE id = ?", (assignment_id,)).fetchone()
    conn.close()
    return dict(updated) if updated else None

def delete_assignment(assignment_id: int) -> bool:
    """Deletes an assignment along with its submissions and question grades."""
    return bulk_delete_assignments([assignment_id]) > 0

def bulk_delete_assignments(assignment_ids: List[int]) -> int:
    """Deletes multiple assignments along with their submissions and question grades."""
    valid_ids = [int(aid) for aid in assignment_ids if aid]
    if not valid_ids:
        return 0
    conn = get_db_connection()
    cursor = conn.cursor()
    placeholders = ",".join("?" for _ in valid_ids)
    
    sub_rows = cursor.execute(f"SELECT id FROM submissions WHERE assignment_id IN ({placeholders})", valid_ids).fetchall()
    sub_ids = [r["id"] for r in sub_rows]
    
    if sub_ids:
        sub_placeholders = ",".join("?" for _ in sub_ids)
        cursor.execute(f"DELETE FROM question_grades WHERE submission_id IN ({sub_placeholders})", sub_ids)
        cursor.execute(f"DELETE FROM submissions WHERE id IN ({sub_placeholders})", sub_ids)
        
    cursor.execute(f"DELETE FROM assignments WHERE id IN ({placeholders})", valid_ids)
    deleted_count = cursor.rowcount
    conn.commit()
    conn.close()
    return deleted_count

def create_submission(assignment_id: int, student_id: int, scan_file_path: str, pages_json: str) -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO submissions (assignment_id, student_id, scan_file_path, pages_json, status)
           VALUES (?, ?, ?, ?, 'pending')""",
        (assignment_id, student_id, scan_file_path, pages_json)
    )
    conn.commit()
    sub_id = cursor.lastrowid
    conn.close()
    return sub_id

def find_matching_student(name: str, student_code: str = "") -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    clean_name = name.strip().lower() if name else ""
    clean_code = student_code.strip().lower() if student_code else ""
    
    row = None
    if clean_code:
        row = conn.execute("SELECT * FROM students WHERE LOWER(student_id) = ?", (clean_code,)).fetchone()
        
    # Disregard generic placeholder names
    generic_names = {"", "student", "student script", "script", "unknown", "student submission"}
    if not row and clean_name and clean_name not in generic_names and not clean_name.startswith("student script") and not clean_name.startswith("student "):
        row = conn.execute("SELECT * FROM students WHERE LOWER(name) = ?", (clean_name,)).fetchone()
        
    conn.close()
    return dict(row) if row else None

def get_submission_by_id(submission_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    row = conn.execute("""
        SELECT s.*, st.name as student_name, st.student_id as student_code, st.class_name,
               a.title as assignment_title, a.subject as assignment_subject, a.max_marks as assignment_max_marks,
               a.rubric_json as assignment_rubric_json, a.marking_scheme_text,
               (SELECT COUNT(*) FROM submissions sub WHERE sub.student_id = st.id AND sub.id != s.id) as previous_submissions_count
        FROM submissions s
        JOIN students st ON s.student_id = st.id
        JOIN assignments a ON s.assignment_id = a.id
        WHERE s.id = ?
    """, (submission_id,)).fetchone()
    conn.close()
    if not row:
        return None
    res = dict(row)
    
    # Determine if known/existing student
    res["is_existing_student"] = (res.get("previous_submissions_count", 0) > 0) or (not res.get("student_name", "").startswith("Script") and not res.get("student_name", "").startswith("Student Script"))
    
    # Parse annotations list
    try:
        raw_ann = res.get("annotations_json")
        res["annotations"] = json.loads(raw_ann) if raw_ann else []
    except Exception:
        res["annotations"] = []
    
    # Fetch question grades
    conn = get_db_connection()
    q_rows = conn.execute("SELECT * FROM question_grades WHERE submission_id = ? ORDER BY id ASC", (submission_id,)).fetchall()
    conn.close()
    
    parsed_q_grades = []
    for q in q_rows:
        qd = dict(q)
        try:
            qd["criteria"] = json.loads(qd.get("criteria_breakdown_json") or "[]")
        except Exception:
            qd["criteria"] = []
        try:
            qd["annotations"] = json.loads(qd.get("annotations_json") or "[]")
        except Exception:
            qd["annotations"] = []
        parsed_q_grades.append(qd)
        
    res["question_grades"] = parsed_q_grades
    return res

def update_submission_annotations(submission_id: int, annotations: List[Dict[str, Any]]) -> bool:
    """Updates the direct visual marking annotations for a submission."""
    conn = get_db_connection()
    cursor = conn.cursor()
    ann_json = json.dumps(annotations) if isinstance(annotations, list) else str(annotations)
    cursor.execute("UPDATE submissions SET annotations_json = ? WHERE id = ?", (ann_json, submission_id))
    conn.commit()
    conn.close()
    return True

def get_submission_annotations(submission_id: int) -> List[Dict[str, Any]]:
    """Retrieves direct visual marking annotations for a submission."""
    conn = get_db_connection()
    row = conn.execute("SELECT annotations_json FROM submissions WHERE id = ?", (submission_id,)).fetchone()
    conn.close()
    if not row or not row["annotations_json"]:
        return []
    try:
        return json.loads(row["annotations_json"])
    except Exception:
        return []

def get_submissions_by_assignment(assignment_id: int) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    rows = conn.execute("""
        SELECT s.*, st.name as student_name, st.student_id as student_code, st.class_name,
               (SELECT COUNT(*) FROM submissions sub WHERE sub.student_id = st.id AND sub.id != s.id) as previous_submissions_count
        FROM submissions s
        JOIN students st ON s.student_id = st.id
        WHERE s.assignment_id = ?
        ORDER BY st.name ASC
    """, (assignment_id,)).fetchall()
    conn.close()
    
    result = []
    for r in rows:
        d = dict(r)
        d["is_existing_student"] = (d.get("previous_submissions_count", 0) > 0)
        result.append(d)
    return result

def delete_submission(submission_id: int) -> bool:
    """Deletes a student submission and its corresponding question grades."""
    conn = get_db_connection()
    cursor = conn.cursor()
    row = cursor.execute("SELECT id FROM submissions WHERE id = ?", (submission_id,)).fetchone()
    if not row:
        conn.close()
        return False
    cursor.execute("DELETE FROM question_grades WHERE submission_id = ?", (submission_id,))
    cursor.execute("DELETE FROM submissions WHERE id = ?", (submission_id,))
    conn.commit()
    conn.close()
    return True

def update_submission_status(submission_id: int, status: str):
    conn = get_db_connection()
    conn.execute("UPDATE submissions SET status = ? WHERE id = ?", (status, submission_id))
    conn.commit()
    conn.close()

def update_submission_student_info(submission_id: int, name: str, student_code: Optional[str] = None, class_name: str = "General") -> Dict[str, Any]:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    sub = cursor.execute("SELECT s.student_id as sub_student_id, st.student_id as code FROM submissions s JOIN students st ON s.student_id = st.id WHERE s.id = ?", (submission_id,)).fetchone()
    if not sub:
        conn.close()
        return {}
        
    curr_student_id = sub["sub_student_id"]
    final_code = student_code.strip() if student_code and student_code.strip() else sub["code"]
    
    # Check if a student with final_code already exists
    existing_by_code = None
    if final_code:
        existing_by_code = cursor.execute("SELECT id FROM students WHERE LOWER(student_id) = ?", (final_code.lower(),)).fetchone()
        
    if existing_by_code:
        target_student_id = existing_by_code["id"]
        # Update that student's name/class if provided
        cursor.execute("UPDATE students SET name = ?, class_name = ? WHERE id = ?", (name, class_name, target_student_id))
        cursor.execute("UPDATE submissions SET student_id = ? WHERE id = ?", (target_student_id, submission_id))
    else:
        # Check if other submissions share curr_student_id
        other_subs = cursor.execute("SELECT COUNT(*) as cnt FROM submissions WHERE student_id = ? AND id != ?", (curr_student_id, submission_id)).fetchone()
        other_count = other_subs["cnt"] if other_subs else 0
        
        if other_count > 0:
            new_unique_code = final_code if final_code else generate_unique_student_id(cursor=cursor)
            cursor.execute("INSERT INTO students (student_id, name, class_name) VALUES (?, ?, ?)", (new_unique_code, name, class_name))
            new_student_id = cursor.lastrowid
            cursor.execute("UPDATE submissions SET student_id = ? WHERE id = ?", (new_student_id, submission_id))
            final_code = new_unique_code
        else:
            final_code = final_code or generate_unique_student_id(cursor=cursor)
            cursor.execute("UPDATE students SET name = ?, student_id = ?, class_name = ? WHERE id = ?", (name, final_code, class_name, curr_student_id))
            
    conn.commit()
    conn.close()
    return {"name": name, "student_id": final_code, "class_name": class_name}


def save_marking_results(submission_id: int, total_score: float, percentage: float, grade_letter: str,
                         overall_feedback: str, strengths_feedback: str, improvement_feedback: str,
                         ai_model: str, questions: List[Dict[str, Any]], auto_status: str = 'review_ready'):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE submissions 
        SET total_score = ?, percentage = ?, grade_letter = ?, overall_feedback = ?,
            strengths_feedback = ?, improvement_feedback = ?, ai_model_used = ?, status = ?
        WHERE id = ?
    """, (total_score, percentage, grade_letter, overall_feedback, strengths_feedback, improvement_feedback, ai_model, auto_status, submission_id))
    
    # Remove previous question grades if any
    cursor.execute("DELETE FROM question_grades WHERE submission_id = ?", (submission_id,))
    
    for q in questions:
        criteria_json = json.dumps(q.get("criteria", [])) if isinstance(q.get("criteria"), (list, dict)) else str(q.get("criteria", ""))
        p_num = int(q.get("page_number", 1) or 1)
        cursor.execute("""
            INSERT INTO question_grades (submission_id, question_no, question_title, max_marks, awarded_marks, extracted_answer, criteria_breakdown_json, feedback_comment, page_number)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            submission_id,
            str(q.get("question_no", "")),
            str(q.get("question_title", "")),
            float(q.get("max_marks", 0.0)),
            float(q.get("awarded_marks", 0.0)),
            str(q.get("extracted_answer", "")),
            criteria_json,
            str(q.get("feedback_comment", "")),
            p_num
        ))
    conn.commit()
    conn.close()

def approve_submission(submission_id: int, total_score: float, percentage: float, grade_letter: str,
                       overall_feedback: str, strengths_feedback: str, improvement_feedback: str,
                       questions: List[Dict[str, Any]]):
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.now().isoformat()
    cursor.execute("""
        UPDATE submissions 
        SET total_score = ?, percentage = ?, grade_letter = ?, overall_feedback = ?,
            strengths_feedback = ?, improvement_feedback = ?, status = 'approved', approved_at = ?
        WHERE id = ?
    """, (total_score, percentage, grade_letter, overall_feedback, strengths_feedback, improvement_feedback, now, submission_id))
    
    cursor.execute("DELETE FROM question_grades WHERE submission_id = ?", (submission_id,))
    for q in questions:
        criteria_json = json.dumps(q.get("criteria", [])) if isinstance(q.get("criteria"), (list, dict)) else str(q.get("criteria", ""))
        p_num = int(q.get("page_number", 1) or 1)
        cursor.execute("""
            INSERT INTO question_grades (submission_id, question_no, question_title, max_marks, awarded_marks, extracted_answer, criteria_breakdown_json, feedback_comment, page_number)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            submission_id,
            str(q.get("question_no", "")),
            str(q.get("question_title", "")),
            float(q.get("max_marks", 0.0)),
            float(q.get("awarded_marks", 0.0)),
            str(q.get("extracted_answer", "")),
            criteria_json,
            str(q.get("feedback_comment", "")),
            p_num
        ))
    conn.commit()
    conn.close()

def get_student_performance_history(student_id: int) -> Dict[str, Any]:
    conn = get_db_connection()
    student = conn.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
    if not student:
        conn.close()
        return {}
    
    submissions = conn.execute("""
        SELECT s.*, a.title as assignment_title, a.subject, a.max_marks as assignment_max_marks, a.created_at as assignment_date
        FROM submissions s
        JOIN assignments a ON s.assignment_id = a.id
        WHERE s.student_id = ? AND s.status = 'approved'
        ORDER BY s.created_at ASC
    """, (student_id,)).fetchall()
    
    sub_list = [dict(s) for s in submissions]
    
    # Get all question level grades to analyze strengths and weaknesses by question/skill
    q_grades = conn.execute("""
        SELECT qg.*, a.title as assignment_title, a.subject
        FROM question_grades qg
        JOIN submissions s ON qg.submission_id = s.id
        JOIN assignments a ON s.assignment_id = a.id
        WHERE s.student_id = ? AND s.status = 'approved'
    """, (student_id,)).fetchall()
    
    conn.close()
    
    return {
        "student": dict(student),
        "history": sub_list,
        "question_grades": [dict(q) for q in q_grades]
    }

def get_class_analytics(class_name: Optional[str] = None) -> Dict[str, Any]:
    conn = get_db_connection()
    query = """
        SELECT s.*, st.name as student_name, st.class_name, a.title as assignment_title, a.subject
        FROM submissions s
        JOIN students st ON s.student_id = st.id
        JOIN assignments a ON s.assignment_id = a.id
        WHERE s.status = 'approved'
    """
    params = []
    if class_name:
        query += " AND st.class_name = ?"
        params.append(class_name)
        
    query += " ORDER BY s.created_at DESC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    
    return {
        "approved_submissions": [dict(r) for r in rows]
    }
