import logging
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, UploadFile, File, Request, Query, Body
from fastapi.responses import RedirectResponse, HTMLResponse
from pydantic import BaseModel

from app.core import google_classroom
from app.core import db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/google", tags=["google_classroom"])

class LinkCourseWorkPayload(BaseModel):
    course_id: str
    coursework_id: Optional[str] = None
    create_new: bool = False
    title: Optional[str] = None
    max_marks: Optional[float] = None
    description: Optional[str] = None

class ImportCoursePayload(BaseModel):
    subject: Optional[str] = ""

@router.get("/status")
def get_status():
    """Returns the current Google Classroom authentication and setup status."""
    return google_classroom.get_auth_status()

@router.post("/upload-credentials")
async def upload_credentials(file: UploadFile = File(...)):
    """Uploads the client_secret.json from Google Cloud Console."""
    try:
        content_bytes = await file.read()
        content_str = content_bytes.decode("utf-8")
        google_classroom.save_client_secret_json(content_str)
        return {"success": True, "message": "Credentials saved successfully."}
    except Exception as e:
        logger.error(f"Error uploading credentials: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/auth-url")
def get_auth_url(request: Request):
    """Generates the Google OAuth authorization URL."""
    try:
        # Construct redirect URI based on current request host
        base_url = str(request.base_url).rstrip("/")
        redirect_uri = f"{base_url}/api/google/oauth2callback"
        auth_url = google_classroom.get_authorization_url(redirect_uri)
        return {"auth_url": auth_url, "redirect_uri": redirect_uri}
    except Exception as e:
        logger.error(f"Error generating auth url: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/oauth2callback", response_class=HTMLResponse)
def oauth_callback(request: Request, code: Optional[str] = None, error: Optional[str] = None):
    """Handles the OAuth2 callback from Google."""
    if error:
        return HTMLResponse(content=f"""
            <html>
                <body style="font-family:sans-serif; background:#0f172a; color:#f87171; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh;">
                    <h2>Google Authorization Failed</h2>
                    <p>{error}</p>
                    <button onclick="window.close()" style="margin-top:16px; padding:8px 16px; background:#334155; color:white; border:none; border-radius:8px; cursor:pointer;">Close Window</button>
                </body>
            </html>
        """)
        
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code.")
        
    try:
        base_url = str(request.base_url).rstrip("/")
        redirect_uri = f"{base_url}/api/google/oauth2callback"
        result = google_classroom.handle_oauth_callback(code, redirect_uri)
        
        # Friendly popup closure or redirection
        return HTMLResponse(content=f"""
            <html>
                <body style="font-family:sans-serif; background:#0f172a; color:#f8fafc; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh;">
                    <div style="background:#1e293b; padding:32px; border-radius:16px; text-align:center; border:1px solid #334155; max-width:400px;">
                        <h2 style="color:#4ade80; margin-top:0;">Successfully Connected!</h2>
                        <p style="color:#94a3b8; font-size:14px;">Tallus is now connected to Google Classroom ({result.get('user_email', '')}).</p>
                        <script>
                            if (window.opener) {{
                                window.opener.postMessage({{ type: 'GOOGLE_AUTH_SUCCESS', email: '{result.get("user_email", "")}' }}, '*');
                                setTimeout(() => window.close(), 1500);
                            }} else {{
                                setTimeout(() => window.location.href = '/', 1500);
                            }}
                        </script>
                        <button onclick="if(window.opener){{window.close();}}else{{window.location.href='/';}}" style="margin-top:16px; padding:8px 16px; background:#4f46e5; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:600;">Return to Tallus</button>
                    </div>
                </body>
            </html>
        """)
    except Exception as e:
        logger.error(f"Error handling oauth callback: {e}")
        return HTMLResponse(content=f"""
            <html>
                <body style="font-family:sans-serif; background:#0f172a; color:#f87171; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh;">
                    <h2>OAuth Error</h2>
                    <p>{str(e)}</p>
                    <button onclick="window.close()" style="margin-top:16px; padding:8px 16px; background:#334155; color:white; border:none; border-radius:8px; cursor:pointer;">Close</button>
                </body>
            </html>
        """)

@router.post("/disconnect")
def disconnect():
    """Disconnects Google account and clears local token."""
    success = google_classroom.disconnect_google()
    return {"success": success}

@router.get("/courses")
def get_courses():
    """Lists active Google Classroom courses."""
    try:
        return google_classroom.list_teacher_courses()
    except Exception as e:
        logger.error(f"Error listing courses: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/courses/{course_id}/students")
def get_course_students(course_id: str):
    """Retrieves students enrolled in a course."""
    try:
        return google_classroom.fetch_course_students(course_id)
    except Exception as e:
        logger.error(f"Error fetching students: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/courses/{course_id}/import")
def import_course(course_id: str, payload: ImportCoursePayload = Body(default=ImportCoursePayload())):
    """Imports course roster into Tallus database."""
    try:
        return google_classroom.import_course_roster(course_id, custom_subject=payload.subject or "")
    except Exception as e:
        logger.error(f"Error importing course: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/courses/{course_id}/coursework")
def get_coursework(course_id: str):
    """Lists coursework items for a course."""
    try:
        return google_classroom.list_coursework(course_id)
    except Exception as e:
        logger.error(f"Error listing coursework: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/assignments/{assignment_id}/link")
def link_assignment(assignment_id: int, payload: LinkCourseWorkPayload):
    """Links or creates a Google Classroom coursework item for a Tallus assignment."""
    assign = db.get_assignment_by_id(assignment_id)
    if not assign:
        raise HTTPException(status_code=404, detail="Assignment not found.")
        
    try:
        cw_id = payload.coursework_id
        if payload.create_new or not cw_id:
            title = payload.title or assign["title"]
            max_points = payload.max_marks or assign["max_marks"]
            created = google_classroom.create_coursework(
                course_id=payload.course_id,
                title=title,
                max_points=max_points,
                description=payload.description or f"Subject: {assign['subject']}"
            )
            cw_id = created["id"]
            
        db.update_assignment_google_coursework(assignment_id, payload.course_id, cw_id)
        return {
            "success": True,
            "assignment_id": assignment_id,
            "google_course_id": payload.course_id,
            "google_coursework_id": cw_id
        }
    except Exception as e:
        logger.error(f"Error linking coursework: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/submissions/{submission_id}/release")
def release_submission(submission_id: int):
    """Releases a single approved marked submission back to Google Classroom."""
    try:
        result = google_classroom.release_submission_to_classroom(submission_id)
        return result
    except Exception as e:
        logger.error(f"Error releasing submission {submission_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/assignments/{assignment_id}/bulk-release")
def bulk_release(assignment_id: int):
    """Releases all approved submissions for an assignment to Google Classroom."""
    try:
        result = google_classroom.bulk_release_assignment(assignment_id)
        return result
    except Exception as e:
        logger.error(f"Error bulk releasing assignment {assignment_id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
