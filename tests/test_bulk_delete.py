import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core import db

client = TestClient(app)

def test_bulk_delete_assignments():
    db.init_db()
    a1 = db.create_assignment('Bulk Test 1', 'Math', 'Class 10', 100.0, 'Rubric 1')
    a2 = db.create_assignment('Bulk Test 2', 'Math', 'Class 10', 100.0, 'Rubric 2')
    a3 = db.create_assignment('Bulk Test 3', 'Science', 'Class 10', 100.0, 'Rubric 3')
    
    s_id = db.get_or_create_student('BD-STU-1', 'Bulk Student', 'Class 10')
    sub1 = db.create_submission(a1, s_id, 'mock1.pdf', '[]')
    sub2 = db.create_submission(a2, s_id, 'mock2.pdf', '[]')
    sub3 = db.create_submission(a3, s_id, 'mock3.pdf', '[]')
    
    # DB level delete
    deleted = db.bulk_delete_assignments([a1])
    assert deleted == 1
    assert db.get_assignment_by_id(a1) is None
    
    # POST endpoint
    resp = client.post('/api/assignments/bulk-delete', json={'assignment_ids': [a2]})
    assert resp.status_code == 200
    assert resp.json()['success'] is True
    assert db.get_assignment_by_id(a2) is None
    
    # DELETE endpoint
    resp2 = client.request('DELETE', '/api/assignments/bulk-delete', json={'assignment_ids': [a3]})
    assert resp2.status_code == 200
    assert resp2.json()['success'] is True
    assert db.get_assignment_by_id(a3) is None

def test_bulk_delete_students():
    db.init_db()
    s1 = db.get_or_create_student('STU-BULK-A', 'Student A', 'Class 10')
    s2 = db.get_or_create_student('STU-BULK-B', 'Student B', 'Class 10')
    s3 = db.get_or_create_student('STU-BULK-C', 'Student C', 'Class 10')
    
    a_id = db.create_assignment('Test Student Bulk', 'English', 'Class 10', 50.0, 'Rubric')
    sub1 = db.create_submission(a_id, s1, 'sub1.pdf', '[]')
    sub2 = db.create_submission(a_id, s2, 'sub2.pdf', '[]')
    sub3 = db.create_submission(a_id, s3, 'sub3.pdf', '[]')
    
    # DB level delete
    deleted = db.bulk_delete_students([s1])
    assert deleted == 1
    assert db.get_student_by_id(s1) is None
    
    # POST endpoint
    resp = client.post('/api/students/bulk-delete', json={'student_ids': [s2]})
    assert resp.status_code == 200
    assert resp.json()['success'] is True
    assert db.get_student_by_id(s2) is None
    
    # DELETE endpoint
    resp2 = client.request('DELETE', '/api/students/bulk-delete', json={'student_ids': [s3]})
    assert resp2.status_code == 200
    assert resp2.json()['success'] is True
    assert db.get_student_by_id(s3) is None
