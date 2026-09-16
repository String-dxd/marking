import os
import json
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime

try:
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import Flow
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    from googleapiclient.errors import HttpError
    GOOGLE_AUTH_AVAILABLE = True
except ImportError:
    Credentials = None
    Flow = None
    Request = None
    build = None
    MediaFileUpload = None
    HttpError = Exception
    GOOGLE_AUTH_AVAILABLE = False

from app.core.config import GOOGLE_DIR, GOOGLE_CLIENT_SECRET_PATH, GOOGLE_TOKEN_PATH
from app.core import db
from app.core.report_generator import generate_pdf_report
from app.core.direct_marker import generate_direct_marking_pdf_report

logger = logging.getLogger(__name__)

# Scopes required for Google Classroom and Drive integration
SCOPES = [
    "https://www.googleapis.com/auth/classroom.courses.readonly",
    "https://www.googleapis.com/auth/classroom.rosters.readonly",
    "https://www.googleapis.com/auth/classroom.profile.emails",
    "https://www.googleapis.com/auth/classroom.coursework.students",
    "https://www.googleapis.com/auth/drive.file"
]

def get_client_secret_path() -> Optional[Path]:
    """Returns the path to client_secret.json if it exists."""
    if GOOGLE_CLIENT_SECRET_PATH.exists():
        return GOOGLE_CLIENT_SECRET_PATH
    # Fallback to base data directory
    fallback = GOOGLE_DIR.parent / "client_secret.json"
    if fallback.exists():
        return fallback
    return None

def save_client_secret_json(content: str) -> bool:
    """Saves uploaded client_secret.json content."""
    try:
        data = json.loads(content)
        # Validate format
        if "web" not in data and "installed" not in data:
            raise ValueError("Invalid Google OAuth client secret format. Missing 'web' or 'installed' key.")
        GOOGLE_DIR.mkdir(parents=True, exist_ok=True)
        with open(GOOGLE_CLIENT_SECRET_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return True
    except Exception as e:
        logger.error(f"Failed to save client_secret.json: {e}")
        raise e

def get_credentials() -> Optional[Credentials]:
    """Loads valid user credentials from token.json or refreshes them if expired."""
    if not GOOGLE_TOKEN_PATH.exists():
        return None
        
    try:
        creds = Credentials.from_authorized_user_file(str(GOOGLE_TOKEN_PATH), SCOPES)
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
            # Save refreshed credentials
            with open(GOOGLE_TOKEN_PATH, "w", encoding="utf-8") as token_file:
                token_file.write(creds.to_json())
        return creds if creds and creds.valid else None
    except Exception as e:
        logger.error(f"Error loading Google credentials: {e}")
        return None

def get_auth_status() -> Dict[str, Any]:
    """Checks the current authentication and configuration status."""
    secret_path = get_client_secret_path()
    has_secret = secret_path is not None and secret_path.exists()
    
    creds = get_credentials()
    authenticated = creds is not None and creds.valid
    user_email = ""
    
    if authenticated:
        try:
            service = build("classroom", "v1", credentials=creds)
            profile = service.userProfiles().get(userId="me").execute()
            user_email = profile.get("emailAddress", "")
        except Exception:
            pass
            
    return {
        "client_secret_configured": has_secret,
        "authenticated": authenticated,
        "user_email": user_email
    }

def get_authorization_url(redirect_uri: str) -> str:
    """Generates the OAuth 2.0 authorization URL."""
    secret_path = get_client_secret_path()
    if not secret_path:
        raise ValueError("Google client_secret.json is not configured. Please upload it first.")
        
    if Flow is None:
        return f"https://accounts.google.com/o/oauth2/auth?client_id=placeholder&redirect_uri={redirect_uri}&response_type=code&scope={'%20'.join(SCOPES)}&access_type=offline&prompt=consent"

    flow = Flow.from_client_secrets_file(
        str(secret_path),
        scopes=SCOPES,
        redirect_uri=redirect_uri
    )
    
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent"
    )
    return auth_url

def handle_oauth_callback(code: str, redirect_uri: str) -> Dict[str, Any]:
    """Exchanges an authorization code for credentials and stores them locally."""
    secret_path = get_client_secret_path()
    if not secret_path:
        raise ValueError("Google client_secret.json not found.")
        
    flow = Flow.from_client_secrets_file(
        str(secret_path),
        scopes=SCOPES,
        redirect_uri=redirect_uri
    )
    flow.fetch_token(code=code)
    creds = flow.credentials
    
    GOOGLE_DIR.mkdir(parents=True, exist_ok=True)
    with open(GOOGLE_TOKEN_PATH, "w", encoding="utf-8") as f:
        f.write(creds.to_json())
        
    # Retrieve user email
    user_email = ""
    try:
        service = build("classroom", "v1", credentials=creds)
        profile = service.userProfiles().get(userId="me").execute()
        user_email = profile.get("emailAddress", "")
    except Exception:
        pass
        
    return {
        "success": True,
        "user_email": user_email
    }

def disconnect_google() -> bool:
    """Removes stored token file."""
    if GOOGLE_TOKEN_PATH.exists():
        try:
            os.remove(GOOGLE_TOKEN_PATH)
            return True
        except Exception as e:
            logger.error(f"Error removing token.json: {e}")
            return False
    return True

# ==================== Google Classroom Operations ====================

def list_teacher_courses() -> List[Dict[str, Any]]:
    """Fetches all active courses taught by the authenticated teacher."""
    creds = get_credentials()
    if not creds:
        raise ValueError("Not authenticated with Google Classroom.")
        
    service = build("classroom", "v1", credentials=creds)
    courses_result = service.courses().list(teacherId="me", courseStates=["ACTIVE"]).execute()
    courses = courses_result.get("courses", [])
    
    formatted = []
    for c in courses:
        formatted.append({
            "id": c.get("id"),
            "name": c.get("name"),
            "section": c.get("section", ""),
            "descriptionHeading": c.get("descriptionHeading", ""),
            "room": c.get("room", ""),
            "alternateLink": c.get("alternateLink", "")
        })
    return formatted

def fetch_course_students(course_id: str) -> List[Dict[str, Any]]:
    """Retrieves all students enrolled in a given Google Classroom course."""
    creds = get_credentials()
    if not creds:
        raise ValueError("Not authenticated with Google Classroom.")
        
    service = build("classroom", "v1", credentials=creds)
    students = []
    page_token = None
    
    while True:
        resp = service.courses().students().list(
            courseId=course_id,
            pageToken=page_token,
            pageSize=100
        ).execute()
        
        for s in resp.get("students", []):
            profile = s.get("profile", {})
            name_info = profile.get("name", {})
            full_name = name_info.get("fullName") or f"{name_info.get('givenName', '')} {name_info.get('familyName', '')}".strip()
            students.append({
                "google_user_id": s.get("userId"),
                "name": full_name or "Unknown Student",
                "email": profile.get("emailAddress", ""),
                "photo_url": profile.get("photoUrl", "")
            })
            
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
            
    return students

def import_course_roster(course_id: str, custom_subject: str = "") -> Dict[str, Any]:
    """
    Imports students from a Google Classroom course into Tallus.
    Maps course name to class_name, imports via bulk_import_roster, and links google_user_id.
    """
    creds = get_credentials()
    if not creds:
        raise ValueError("Not authenticated with Google Classroom.")
        
    service = build("classroom", "v1", credentials=creds)
    course = service.courses().get(id=course_id).execute()
    
    c_name = course.get("name", "Classroom")
    c_section = course.get("section", "").strip()
    class_label = f"{c_name} {c_section}".strip() if c_section else c_name
    subject_label = custom_subject.strip() or c_section or c_name
    
    gc_students = fetch_course_students(course_id)
    if not gc_students:
        return {"total": 0, "created": 0, "updated": 0, "students": []}
        
    # Prepare roster data for bulk_import_roster
    roster_data = []
    for s in gc_students:
        roster_data.append({
            "name": s["name"],
            "class_name": class_label,
            "subject": subject_label,
            "email": s["email"]
        })
        
    import_result = db.bulk_import_roster(roster_data)
    
    # Update google_user_id mapping for each student
    for imported_s in import_result.get("students", []):
        s_id = imported_s["id"]
        s_name = imported_s["name"]
        
        # Match with original gc_students
        match = next((g for g in gc_students if g["name"].lower() == s_name.lower()), None)
        if match and match.get("google_user_id"):
            db.update_student_google_id(s_id, match["google_user_id"])
            
    return {
        "course_id": course_id,
        "class_name": class_label,
        "subject": subject_label,
        "total": import_result.get("total", 0),
        "created": import_result.get("created", 0),
        "updated": import_result.get("updated", 0),
        "students": import_result.get("students", [])
    }

def list_coursework(course_id: str) -> List[Dict[str, Any]]:
    """Lists assignments (courseWork) inside a specific course."""
    creds = get_credentials()
    if not creds:
        raise ValueError("Not authenticated with Google Classroom.")
        
    service = build("classroom", "v1", credentials=creds)
    resp = service.courses().courseWork().list(courseId=course_id, courseWorkStates=["PUBLISHED", "DRAFT"]).execute()
    
    course_works = resp.get("courseWork", [])
    result = []
    for cw in course_works:
        result.append({
            "id": cw.get("id"),
            "title": cw.get("title"),
            "description": cw.get("description", ""),
            "maxPoints": cw.get("maxPoints", 100),
            "state": cw.get("state"),
            "alternateLink": cw.get("alternateLink", "")
        })
    return result

def create_coursework(course_id: str, title: str, max_points: float = 100.0, description: str = "") -> Dict[str, Any]:
    """Creates a new assignment (CourseWork) in Google Classroom."""
    creds = get_credentials()
    if not creds:
        raise ValueError("Not authenticated with Google Classroom.")
        
    service = build("classroom", "v1", credentials=creds)
    body = {
        "title": title,
        "description": description or "Assignment managed with Tallus Assessment & Analytics.",
        "maxPoints": float(max_points),
        "workType": "ASSIGNMENT",
        "state": "PUBLISHED"
    }
    
    created = service.courses().courseWork().create(courseId=course_id, body=body).execute()
    return {
        "id": created.get("id"),
        "title": created.get("title"),
        "alternateLink": created.get("alternateLink", ""),
        "maxPoints": created.get("maxPoints", max_points)
    }

# ==================== Google Drive Operations ====================

def get_or_create_drive_folder(drive_service, folder_name: str, parent_id: Optional[str] = None) -> str:
    """Finds or creates a directory in Google Drive."""
    query = f"mimeType='application/vnd.google-apps.folder' and name='{folder_name}' and trashed=false"
    if parent_id:
        query += f" and '{parent_id}' in parents"
        
    resp = drive_service.files().list(q=query, spaces="drive", fields="files(id, name)").execute()
    files = resp.get("files", [])
    if files:
        return files[0]["id"]
        
    meta = {
        "name": folder_name,
        "mimeType": "application/vnd.google-apps.folder"
    }
    if parent_id:
        meta["parents"] = [parent_id]
        
    folder = drive_service.files().create(body=meta, fields="id").execute()
    return folder.get("id")

def upload_pdf_to_drive(drive_service, file_path: str, display_name: str, folder_id: Optional[str] = None) -> Dict[str, Any]:
    """Uploads a PDF to Google Drive and returns its metadata."""
    meta = {"name": display_name}
    if folder_id:
        meta["parents"] = [folder_id]
        
    media = MediaFileUpload(file_path, mimetype="application/pdf", resumable=True)
    uploaded = drive_service.files().create(
        body=meta,
        media_body=media,
        fields="id, name, webViewLink, webContentLink"
    ).execute()
    return uploaded

def share_drive_file_with_student(drive_service, file_id: str, student_email: str):
    """Grants read access to a student for their marked script."""
    if not student_email:
        return
    try:
        drive_service.permissions().create(
            fileId=file_id,
            body={
                "type": "user",
                "role": "reader",
                "emailAddress": student_email.strip()
            },
            fields="id"
        ).execute()
    except Exception as e:
        logger.warning(f"Failed to share Drive file {file_id} with {student_email}: {e}")

# ==================== Release Marked Script & Grades ====================

def release_submission_to_classroom(submission_id: int) -> Dict[str, Any]:
    """
    Releases an approved submission back to Google Classroom:
    1. Validates assignment Google Classroom linkage.
    2. Generates the marked script PDF (annotated paper or report).
    3. Uploads PDF to Google Drive in 'Tallus Marked Scripts / [Course]' folder.
    4. Shares read permissions with the student's email.
    5. Locates student submission in Google Classroom.
    6. Patches the student's grade (assignedGrade / draftGrade).
    7. Attempts to attach the Drive PDF via modifyAttachments (if allowed).
    8. Calls :return to officially notify the student.
    9. Records release metadata in Tallus database.
    """
    sub = db.get_submission_by_id(submission_id)
    if not sub:
        raise ValueError(f"Submission {submission_id} not found.")
        
    course_id = sub.get("google_course_id")
    coursework_id = sub.get("google_coursework_id")
    
    if not course_id or not coursework_id:
        raise ValueError("Assignment is not linked to a Google Classroom course & assignment. Please link it first.")
        
    creds = get_credentials()
    if not creds:
        raise ValueError("Not authenticated with Google Classroom.")
        
    classroom_service = build("classroom", "v1", credentials=creds)
    drive_service = build("drive", "v3", credentials=creds)
    
    # 1. Generate Marked PDF
    pdf_path = None
    has_annotations = bool(sub.get("annotations") or any(q.get("annotations") for q in sub.get("question_grades", [])))
    if has_annotations:
        try:
            pdf_path = generate_direct_marking_pdf_report(sub)
        except Exception as e:
            logger.warning(f"Direct marking PDF generation failed, falling back to standard report: {e}")
            
    if not pdf_path or not Path(pdf_path).exists():
        pdf_path = generate_pdf_report(sub)
        
    # 2. Upload to Google Drive
    root_folder_id = get_or_create_drive_folder(drive_service, "Tallus Marked Scripts")
    course_folder_name = sub.get("class_name") or f"Course {course_id}"
    course_folder_id = get_or_create_drive_folder(drive_service, course_folder_name, parent_id=root_folder_id)
    
    student_name = sub.get("student_name", "Student")
    assign_title = sub.get("assignment_title", "Assignment")
    file_display_name = f"{student_name} - {assign_title} (Marked Script).pdf"
    
    drive_file = upload_pdf_to_drive(drive_service, pdf_path, file_display_name, folder_id=course_folder_id)
    drive_file_id = drive_file.get("id")
    drive_link = drive_file.get("webViewLink", "")
    
    # 3. Share with student email
    student_email = sub.get("student_email", "")
    if student_email:
        share_drive_file_with_student(drive_service, drive_file_id, student_email)
        
    # 4. Locate Student Submission in Google Classroom
    google_user_id = sub.get("student_google_user_id")
    student_sub_id = None
    
    # Query student submissions for this coursework
    sub_list_params = {
        "courseId": course_id,
        "courseWorkId": coursework_id
    }
    if google_user_id:
        sub_list_params["userId"] = google_user_id
        
    subs_resp = classroom_service.courses().courseWork().studentSubmissions().list(**sub_list_params).execute()
    student_submissions = subs_resp.get("studentSubmissions", [])
    
    if student_submissions:
        student_sub_id = student_submissions[0]["id"]
    elif not google_user_id and student_email:
        # Search all submissions to find matching email
        all_subs = classroom_service.courses().courseWork().studentSubmissions().list(
            courseId=course_id,
            courseWorkId=coursework_id
        ).execute().get("studentSubmissions", [])
        
        # Look up student profile by userId to match email
        for g_sub in all_subs:
            u_id = g_sub.get("userId")
            try:
                prof = classroom_service.userProfiles().get(userId=u_id).execute()
                if prof.get("emailAddress", "").lower() == student_email.lower():
                    student_sub_id = g_sub["id"]
                    # Also record their google_user_id for future quick lookups
                    db.update_student_google_id(sub["student_id"], u_id)
                    break
            except Exception:
                continue
                
    if not student_sub_id:
        raise ValueError(
            f"Could not find a Google Classroom submission for student '{student_name}'. "
            "Ensure the student is enrolled in the Google Classroom course and the assignment is assigned to them."
        )
        
    # 5. Patch Grade
    score = float(sub.get("total_score", 0.0))
    patch_body = {
        "draftGrade": score,
        "assignedGrade": score
    }
    classroom_service.courses().courseWork().studentSubmissions().patch(
        courseId=course_id,
        courseWorkId=coursework_id,
        id=student_sub_id,
        updateMask="draftGrade,assignedGrade",
        body=patch_body
    ).execute()
    
    # 6. Try to attach Drive file via modifyAttachments (works if assignment created by Tallus)
    attachment_added = False
    try:
        classroom_service.courses().courseWork().studentSubmissions().modifyAttachments(
            courseId=course_id,
            courseWorkId=coursework_id,
            id=student_sub_id,
            body={
                "addAttachments": [
                    {"driveFile": {"id": drive_file_id}}
                ]
            }
        ).execute()
        attachment_added = True
    except HttpError as err:
        # Expected if coursework was created in Classroom web UI instead of Tallus API
        logger.info(f"Direct attachment skipped (coursework created externally). File shared via Google Drive: {err}")
        
    # 7. Officially Return Submission
    classroom_service.courses().courseWork().studentSubmissions().return_(
        courseId=course_id,
        courseWorkId=coursework_id,
        id=student_sub_id,
        body={}
    ).execute()
    
    # 8. Record release in Tallus DB
    now_iso = datetime.now().isoformat()
    db.update_submission_google_release(submission_id, student_sub_id, now_iso)
    
    return {
        "success": True,
        "submission_id": submission_id,
        "student_name": student_name,
        "score": score,
        "google_submission_id": student_sub_id,
        "drive_file_id": drive_file_id,
        "drive_link": drive_link,
        "attachment_added": attachment_added,
        "released_at": now_iso
    }

def bulk_release_assignment(assignment_id: int) -> Dict[str, Any]:
    """Releases all approved submissions for a specific assignment."""
    assign = db.get_assignment_by_id(assignment_id)
    if not assign:
        raise ValueError(f"Assignment {assignment_id} not found.")
        
    conn = db.get_db_connection()
    subs = conn.execute(
        "SELECT id FROM submissions WHERE assignment_id = ? AND status = 'approved'",
        (assignment_id,)
    ).fetchall()
    conn.close()
    
    total = len(subs)
    released = []
    failed = []
    
    for row in subs:
        sub_id = row["id"]
        try:
            res = release_submission_to_classroom(sub_id)
            released.append(res)
        except Exception as e:
            failed.append({"submission_id": sub_id, "error": str(e)})
            
    return {
        "assignment_id": assignment_id,
        "total_approved": total,
        "released_count": len(released),
        "failed_count": len(failed),
        "released": released,
        "failed": failed
    }
