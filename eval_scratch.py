import json
import sqlite3
from app.core.db import get_db_connection
from app.core.marker_engine import step1b_mark_extracted_questions

# Get submission and assignment details
conn = get_db_connection()
sub = conn.execute("SELECT s.* FROM submissions s JOIN students st ON s.student_id = st.id WHERE st.name = 'Arya'").fetchone()

if not sub:
    print("Could not find Arya's submission")
    exit()

assignment_id = sub['assignment_id']
assignment = conn.execute("SELECT * FROM assignments WHERE id = ?", (assignment_id,)).fetchone()
conn.close()

marking_scheme_text = assignment['marking_scheme_text']

# Our parse result from the previous step
parse_result = {
  "success": True,
  "step": "1A",
  "questions": [
    {
      "question_no": "5(a)",
      "question_title": "Question 5(a)",
      "max_marks": 5.0,
      "awarded_marks": 0.0,
      "extracted_answer": "[Graph: X-axis=\"time/ min\" (Scale: 1, 2, 3, 4, 5), Y-axis=\"temperature/ °C\" (Scale: 1, 2, 3, 4, 5), Plotted Points: [(0,0), (1,2.4), (2,3), (3,3.6), (4,4.2), (5,4.8)] (Total 6 points), Line: \"Straight line segments connecting subsequent points, drawn with a ruler; line begins at the origin (0,0) rather than at the (0,24) data point, then rises through the remaining points with a slightly changing slope\"]",
      "criteria": [],
      "feedback_comment": "",
      "page_number": 1
    }
  ]
}

assignment_info = {
    "title": assignment["title"],
    "subject": assignment["subject"],
    "max_marks": assignment["max_marks"],
    "marking_scheme_text": marking_scheme_text
}
student_info = {"name": "Arya", "student_id": "STU-9637"}

# Run the grading AI
marked_result = step1b_mark_extracted_questions(assignment_info, student_info, parse_result["questions"])

with open("result.json", "w") as f:
    json.dump({
        "parse_result": parse_result,
        "marking_scheme": marking_scheme_text,
        "marked_result": marked_result
    }, f, indent=2)

print("Done")
