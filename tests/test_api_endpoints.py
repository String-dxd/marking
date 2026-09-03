import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from app.main import app

def test_api_endpoints():
    print("Testing FastAPI endpoints...")
    client = TestClient(app)
    
    # 1. Health check
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "ollama" in data
    print("Health check endpoint passed!")
    
    # 2. Create Assignment
    assign_resp = client.post("/api/assignments", json={
        "title": "Calculus Exam 1",
        "subject": "Mathematics",
        "class_name": "Grade 12",
        "max_marks": 100.0,
        "marking_scheme_text": "Q1: Derivatives. Award 5 marks for power rule."
    })
    assert assign_resp.status_code == 200
    a_id = assign_resp.json()["assignment_id"]
    assert a_id > 0
    print("Create assignment endpoint passed! Assignment ID:", a_id)

    # 3. Edit Assignment
    edit_resp = client.put(f"/api/assignments/{a_id}", json={
        "title": "Calculus Exam 1 (Updated)",
        "subject": "Mathematics",
        "class_name": "Grade 12",
        "max_marks": 100.0,
        "marking_scheme_text": "Q1: Derivatives. Updated."
    })
    assert edit_resp.status_code == 200
    assert edit_resp.json()["assignment"]["title"] == "Calculus Exam 1 (Updated)"
    print("Edit assignment endpoint passed!")
    
    # 4. List Students
    students_resp = client.get("/api/students")
    assert students_resp.status_code == 200
    assert isinstance(students_resp.json(), list)
    print("List students endpoint passed!")
    
    # 5. Test Submission Deletion Endpoint
    from app.core import db
    s_stu_id = db.get_or_create_student("TEMP_STU_DEL", "Temp Student To Delete", "Grade 12")
    sub_id = db.create_submission(a_id, s_stu_id, "dummy.pdf", "[]")
    assert sub_id > 0
    del_sub_resp = client.delete(f"/api/submissions/{sub_id}")
    assert del_sub_resp.status_code == 200
    assert del_sub_resp.json()["success"] is True
    # Clean up temp student
    db.delete_student(s_stu_id)
    print("Delete submission endpoint passed!")

    # 6. Root serve
    root_resp = client.get("/")
    assert root_resp.status_code == 200
    print("Frontend index serving passed!")

    # 7. Clean up test assignment so no test assignment persists
    del_resp = client.delete(f"/api/assignments/{a_id}")
    assert del_resp.status_code == 200
    print("Cleaned up test assignment successfully!")

if __name__ == "__main__":
    test_api_endpoints()
    print("\nAPI Integration tests completed successfully!")
