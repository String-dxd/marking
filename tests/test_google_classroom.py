import sys
import os
import json
import tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from app.main import app
from app.core import db, google_classroom
from app.core.config import GOOGLE_DIR, GOOGLE_CLIENT_SECRET_PATH, GOOGLE_TOKEN_PATH

client = TestClient(app)

def test_google_status_endpoint():
    """Test the status endpoint returns expected structure."""
    resp = client.get("/api/google/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "client_secret_configured" in data
    assert "authenticated" in data
    assert "user_email" in data

def test_save_client_secret():
    """Test uploading and validating client_secret.json."""
    dummy_secret = {
        "installed": {
            "client_id": "test-client-id.apps.googleusercontent.com",
            "project_id": "test-project",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "client_secret": "test-secret"
        }
    }
    
    # Test via API
    resp = client.post(
        "/api/google/upload-credentials",
        files={"file": ("client_secret.json", json.dumps(dummy_secret).encode("utf-8"), "application/json")}
    )
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    
    # Check status endpoint now reports configured
    status_resp = client.get("/api/google/status")
    assert status_resp.json()["client_secret_configured"] is True

def test_get_auth_url():
    """Test generating Google OAuth authorization URL."""
    resp = client.get("/api/google/auth-url")
    assert resp.status_code == 200
    data = resp.json()
    assert "auth_url" in data
    assert "accounts.google.com" in data["auth_url"]
    assert "redirect_uri" in data

def test_database_google_fields():
    """Test database schema extensions for Google Classroom."""
    # Test student google_user_id
    student_id = db.get_or_create_student(name="Google Test Student", class_name="Class 101", email="gstudent@school.edu")
    db.update_student_google_id(student_id, "gc-user-12345")
    
    student = db.get_student_by_google_id("gc-user-12345")
    assert student is not None
    assert student["name"] == "Google Test Student"
    
    by_email = db.get_student_by_email("gstudent@school.edu")
    assert by_email is not None
    assert by_email["id"] == student_id
    
    # Test assignment google course and coursework
    assign_id = db.create_assignment(
        title="Google Sync Test Assignment",
        subject="Physics",
        class_name="Class 101",
        max_marks=50.0,
        marking_scheme_text="Rubric"
    )
    db.update_assignment_google_coursework(assign_id, "course-999", "coursework-888")
    
    assign = db.get_assignment_by_id(assign_id)
    assert assign["google_course_id"] == "course-999"
    assert assign["google_coursework_id"] == "coursework-888"
    
    # Test submission release update
    sub_id = db.create_submission(assign_id, student_id, "scan.pdf", "[]")
    db.update_submission_google_release(sub_id, "gc-sub-777", "2026-09-09T10:00:00")
    
    sub = db.get_submission_by_id(sub_id)
    assert sub["google_submission_id"] == "gc-sub-777"
    assert sub["google_course_id"] == "course-999"
    assert sub["google_coursework_id"] == "coursework-888"
    assert sub["student_email"] == "gstudent@school.edu"
    assert sub["student_google_user_id"] == "gc-user-12345"
    
    # Cleanup
    db.delete_assignment(assign_id)
    db.delete_student(student_id)

def test_import_course_roster_mocked():
    """Test importing a Google Classroom roster with mocked API responses."""
    mock_students = [
        {"google_user_id": "u-001", "name": "Alice Tan", "email": "alice@school.edu", "photo_url": ""},
        {"google_user_id": "u-002", "name": "Bob Lim", "email": "bob@school.edu", "photo_url": ""}
    ]
    
    mock_course = {
        "id": "c-100",
        "name": "Sec 3 Physics",
        "section": "Class 3A"
    }
    
    with patch("app.core.google_classroom.get_credentials") as mock_creds, \
         patch("app.core.google_classroom.build") as mock_build, \
         patch("app.core.google_classroom.fetch_course_students", return_value=mock_students):
        
        mock_creds.return_value = MagicMock(valid=True)
        mock_service = MagicMock()
        mock_service.courses().get().execute.return_value = mock_course
        mock_build.return_value = mock_service
        
        result = google_classroom.import_course_roster("c-100", custom_subject="Physics")
        assert result["total"] == 2
        assert result["class_name"] == "Sec 3 Physics Class 3A"
        
        # Verify student exists in db with google_user_id
        alice = db.get_student_by_google_id("u-001")
        assert alice is not None
        assert alice["name"] == "Alice Tan"
        assert alice["email"] == "alice@school.edu"
        
        # Clean up
        if alice:
            db.delete_student(alice["id"])
        bob = db.get_student_by_google_id("u-002")
        if bob:
            db.delete_student(bob["id"])

def test_disconnect():
    """Test disconnecting Google account."""
    resp = client.post("/api/google/disconnect")
    assert resp.status_code == 200
    assert resp.json()["success"] is True

if __name__ == "__main__":
    print("Running Google Classroom integration tests...")
    test_google_status_endpoint()
    print("[OK] Status endpoint passed")
    test_save_client_secret()
    print("[OK] Client secret upload passed")
    test_get_auth_url()
    print("[OK] Auth URL generation passed")
    test_database_google_fields()
    print("[OK] Database schema & DAO helpers passed")
    test_import_course_roster_mocked()
    print("[OK] Roster import passed")
    test_disconnect()
    print("[OK] Disconnect endpoint passed")
    print("\nAll Google Classroom integration tests passed successfully!")
