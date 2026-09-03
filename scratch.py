import json
import os
from app.core.marker_engine import step1a_extract_student_responses_verbatim

pages = [{"image_path": r"C:\Users\hejia\Documents\Antigravity\AI Marker\data\processed\sub_7\page_4.jpg"}]
assignment_info = {"title": "Test", "subject": "Test", "max_marks": 100}
student_info = {"name": "Arya", "student_id": "STU-9637"}

res = step1a_extract_student_responses_verbatim(assignment_info, student_info, pages)
print(json.dumps(res, indent=2))
