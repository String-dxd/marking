import io
import csv
import unittest
from fastapi.testclient import TestClient
import openpyxl

from app.main import app
from app.core import db
from app.core.roster_parser import parse_csv_roster, parse_excel_roster, parse_roster_file, normalize_header, map_column_headers
from app.core.report_generator import generate_pdf_report

class TestRosterUpload(unittest.TestCase):
    def setUp(self):
        db.init_db()
        self.client = TestClient(app)

    def test_normalize_header_and_mapping(self):
        self.assertEqual(normalize_header("Student Name"), "studentname")
        self.assertEqual(normalize_header("Class / Grade"), "classgrade")
        
        headers = ["Student Name", "Class", "Subject", "Email"]
        col_map = map_column_headers(headers)
        self.assertEqual(col_map["name"], 0)
        self.assertEqual(col_map["class_name"], 1)
        self.assertEqual(col_map["subject"], 2)
        self.assertEqual(col_map["email"], 3)

    def test_parse_csv_roster(self):
        csv_text = "Student Name,Class,Subject\nAlice Wonder,Class 10A,Physics\nBob Builder,Class 10A,Mathematics\n"
        records = parse_csv_roster(csv_text.encode("utf-8"))
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]["name"], "Alice Wonder")
        self.assertEqual(records[0]["class_name"], "Class 10A")
        self.assertEqual(records[0]["subject"], "Physics")
        self.assertEqual(records[1]["name"], "Bob Builder")

    def test_parse_excel_roster(self):
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["Name", "Grade", "Subject"])
        ws.append(["Emma Watson", "Grade 11", "Literature"])
        ws.append(["Harry Potter", "Grade 11", "Chemistry"])
        
        buf = io.BytesIO()
        wb.save(buf)
        excel_bytes = buf.getvalue()
        
        records = parse_excel_roster(excel_bytes)
        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]["name"], "Emma Watson")
        self.assertEqual(records[0]["class_name"], "Grade 11")
        self.assertEqual(records[0]["subject"], "Literature")

    def test_bulk_import_roster(self):
        students_data = [
            {"name": "Test Roster Student A", "class_name": "Class 9Z", "subject": "Biology"},
            {"name": "Test Roster Student B", "class_name": "Class 9Z", "subject": "History"}
        ]
        res = db.bulk_import_roster(students_data)
        self.assertEqual(res["total"], 2)
        self.assertGreaterEqual(res["created"], 0)
        
        # Verify in DB
        all_stus = db.get_all_students()
        names = [s["name"] for s in all_stus]
        self.assertIn("Test Roster Student A", names)
        self.assertIn("Test Roster Student B", names)
        
        # Verify unique student IDs were assigned
        stu_a = next(s for s in all_stus if s["name"] == "Test Roster Student A")
        self.assertTrue(stu_a["student_id"].startswith("STU-"))
        self.assertEqual(stu_a["subject"], "Biology")

    def test_api_upload_roster_csv(self):
        csv_content = b"Student Name,Class,Subject\nJohn Test Doe,Class 8A,English\nJane Test Doe,Class 8A,English\n"
        response = self.client.post(
            "/api/students/upload-roster",
            files={"file": ("test_roster.csv", csv_content, "text/csv")}
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertIn("Successfully imported", data["message"])

    def test_api_roster_template_download(self):
        response = self.client.get("/api/students/roster-template")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response.headers.get("content-type", ""))
        self.assertIn("Student Name,Class,Subject", response.text)

    def test_api_add_student_manually(self):
        payload = {
            "name": "Manual Student Test",
            "class_name": "Class 12C",
            "subject": "Advanced Chemistry",
            "email": "manual.test@school.edu",
            "notes": "Top student in chemistry"
        }
        response = self.client.post("/api/students", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertIn("student_id", data)
        self.assertIn("student", data)
    def test_delete_student_api(self):
        # Create student first
        create_resp = self.client.post("/api/students", json={
            "name": "Student To Delete",
            "class_name": "Class 9Temp",
            "subject": "Art"
        })
        self.assertEqual(create_resp.status_code, 200)
        s_id = create_resp.json()["student_id"]
        
        # Delete student
        del_resp = self.client.delete(f"/api/students/{s_id}")
        self.assertEqual(del_resp.status_code, 200)
        self.assertTrue(del_resp.json()["success"])
        
        # Verify student no longer exists
        self.assertIsNone(db.get_student_by_id(s_id))
        
        # Deleting non-existent student returns 404
        del_again = self.client.delete(f"/api/students/{s_id}")
        self.assertEqual(del_again.status_code, 404)

    def test_edit_student_api(self):
        # Create student
        create_resp = self.client.post("/api/students", json={
            "name": "Original Name",
            "class_name": "Class 10Original",
            "subject": "Math",
            "notes": "Original notes"
        })
        self.assertEqual(create_resp.status_code, 200)
        s_id = create_resp.json()["student_id"]
        
        # Update student
        update_resp = self.client.put(f"/api/students/{s_id}", json={
            "name": "Updated Name",
            "class_name": "Class 10Updated",
            "subject": "Physics",
            "email": "updated@school.edu",
            "notes": "Updated notes"
        })
        self.assertEqual(update_resp.status_code, 200)
        data = update_resp.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["student"]["name"], "Updated Name")
        self.assertEqual(data["student"]["class_name"], "Class 10Updated")
        self.assertEqual(data["student"]["subject"], "Physics")
        self.assertEqual(data["student"]["email"], "updated@school.edu")
        self.assertEqual(data["student"]["notes"], "Updated notes")
        
        # Verify in DB
        db_student = db.get_student_by_id(s_id)
        self.assertEqual(db_student["name"], "Updated Name")
        self.assertEqual(db_student["subject"], "Physics")

if __name__ == "__main__":
    unittest.main()
