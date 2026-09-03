import os
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import FileResponse, HTMLResponse
from app.core import db
from app.core.config import REPORTS_DIR
from app.core.report_generator import generate_pdf_report
from app.core.direct_marker import generate_direct_marking_pdf_report

router = APIRouter(prefix="/api/reports", tags=["reports"])

@router.get("/{submission_id}/pdf")
def get_pdf_report(submission_id: int):
    submission = db.get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    pdf_path = generate_pdf_report(submission)
    filename = Path(pdf_path).name
    
    return FileResponse(
        path=pdf_path,
        filename=filename,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'}
    )

@router.get("/{submission_id}/direct-marking-pdf")
def get_direct_marking_pdf(submission_id: int):
    submission = db.get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    pdf_path = generate_direct_marking_pdf_report(submission)
    filename = Path(pdf_path).name
    
    return FileResponse(
        path=pdf_path,
        filename=filename,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'}
    )

@router.post("/{submission_id}/generate")
def generate_report_endpoint(submission_id: int):
    submission = db.get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    pdf_path = generate_pdf_report(submission)
    filename = Path(pdf_path).name
    
    return {
        "success": True,
        "submission_id": submission_id,
        "filename": filename,
        "pdf_url": f"/api/reports/{submission_id}/pdf",
        "direct_marking_pdf_url": f"/api/reports/{submission_id}/direct-marking-pdf",
        "html_url": f"/api/reports/{submission_id}/html"
    }

@router.get("/{submission_id}/html", response_class=HTMLResponse)
def get_html_report(submission_id: int):
    submission = db.get_submission_by_id(submission_id)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
        
    student_name = submission.get("student_name", "Student")
    student_code = submission.get("student_code", "")
    class_name = submission.get("class_name", "")
    assignment_title = submission.get("assignment_title", "Assignment Feedback")
    subject = submission.get("assignment_subject", "General")
    total_score = submission.get("total_score", 0.0)
    max_marks = submission.get("assignment_max_marks", 100.0)
    percentage = submission.get("percentage", 0.0)
    grade_letter = submission.get("grade_letter", "N/A")
    overall_fb = submission.get("overall_feedback", "No feedback recorded.").replace("\n", "<br>")
    strengths_fb = submission.get("strengths_feedback", "")
    improvement_fb = submission.get("improvement_feedback", "")
    questions = submission.get("question_grades", [])
    approved_at = (submission.get("approved_at") or "")[:10]
    
    strengths_html = "".join(f"<li>{s.lstrip('•- ')}</li>" for s in strengths_fb.split("\n") if s.strip())
    if not strengths_html:
        strengths_html = "<li>Demonstrated good effort and engagement.</li>"
        
    improvements_html = "".join(f"<li>{i.lstrip('•- ')}</li>" for i in improvement_fb.split("\n") if i.strip())
    if not improvements_html:
        improvements_html = "<li>Review detailed question notes to prevent minor slips.</li>"
        
    q_rows_html = ""
    for q in questions:
        q_no = q.get("question_no", "")
        q_title = q.get("question_title", "")
        q_awarded = q.get("awarded_marks", 0.0)
        q_max = q.get("max_marks", 0.0)
        q_comment = q.get("feedback_comment", "")
        q_ans = q.get("extracted_answer", "")
        
        ans_html = f"<div class='student-work'><em>Student work:</em> {q_ans[:200]}</div>" if q_ans else ""
        
        q_rows_html += f"""
        <tr>
            <td class="q-num">{q_no}</td>
            <td>
                <strong>{q_title}</strong>
                <div class="q-comment">{q_comment}</div>
                {ans_html}
            </td>
            <td class="text-center font-bold">{q_awarded}</td>
            <td class="text-center text-muted">{q_max}</td>
        </tr>
        """
        
    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>{student_name} - {assignment_title} Report</title>
        <style>
            @page {{
                size: A4;
                margin: 1.5cm;
            }}
            body {{
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                color: #1e293b;
                line-height: 1.5;
                margin: 0;
                padding: 20px;
                background-color: #f8fafc;
            }}
            .report-card {{
                max-width: 800px;
                margin: 0 auto;
                background: white;
                padding: 35px;
                border-radius: 8px;
                box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
            }}
            .header-flex {{
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                border-bottom: 2px solid #e2e8f0;
                padding-bottom: 15px;
                margin-bottom: 15px;
            }}
            .title-area h1 {{
                margin: 0 0 5px 0;
                font-size: 24px;
                color: #0f172a;
            }}
            .badge-area {{
                text-align: right;
            }}
            .grade-badge {{
                font-size: 28px;
                font-weight: 800;
                color: #2563eb;
            }}
            .info-grid {{
                display: grid;
                grid-template-columns: 1fr 1fr 1fr;
                gap: 10px;
                background: #f1f5f9;
                padding: 12px 16px;
                border-radius: 6px;
                font-size: 14px;
                margin-bottom: 20px;
            }}
            h2 {{
                font-size: 16px;
                color: #0f172a;
                border-bottom: 1px solid #cbd5e1;
                padding-bottom: 5px;
                margin-top: 20px;
                margin-bottom: 10px;
            }}
            .two-boxes {{
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 15px;
                margin-bottom: 20px;
            }}
            .box-green {{
                background: #f0fdf4;
                border: 1px solid #bbf7d0;
                border-radius: 6px;
                padding: 14px;
            }}
            .box-orange {{
                background: #fff7ed;
                border: 1px solid #fed7aa;
                border-radius: 6px;
                padding: 14px;
            }}
            .box-title {{
                font-weight: 700;
                font-size: 13px;
                margin-bottom: 8px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }}
            .box-green .box-title {{ color: #166534; }}
            .box-orange .box-title {{ color: #9a3412; }}
            ul {{
                margin: 0;
                padding-left: 18px;
                font-size: 13.5px;
            }}
            li {{ margin-bottom: 4px; }}
            table {{
                width: 100%;
                border-collapse: collapse;
                font-size: 13.5px;
                margin-top: 10px;
            }}
            th {{
                background: #1e293b;
                color: white;
                padding: 8px 10px;
                text-align: left;
                font-size: 12px;
                text-transform: uppercase;
            }}
            td {{
                padding: 9px 10px;
                border-bottom: 1px solid #e2e8f0;
                vertical-align: top;
            }}
            tr:nth-child(even) {{
                background-color: #f8fafc;
            }}
            .q-num {{
                font-weight: 700;
                text-align: center;
                width: 35px;
            }}
            .text-center {{ text-align: center; }}
            .text-muted {{ color: #64748b; }}
            .font-bold {{ font-weight: 700; }}
            .q-comment {{ color: #334155; margin-top: 3px; }}
            .student-work {{
                font-size: 11.5px;
                color: #64748b;
                margin-top: 4px;
                background: #f8fafc;
                padding: 4px 6px;
                border-left: 2px solid #cbd5e1;
            }}
            .no-print-bar {{
                max-width: 800px;
                margin: 0 auto 15px auto;
                display: flex;
                justify-content: flex-end;
                gap: 10px;
            }}
            .btn {{
                background: #2563eb;
                color: white;
                padding: 8px 16px;
                border-radius: 6px;
                text-decoration: none;
                font-weight: 600;
                font-size: 14px;
                border: none;
                cursor: pointer;
            }}
            .btn-secondary {{
                background: #64748b;
            }}
            @media print {{
                body {{
                    background: white;
                    padding: 0;
                }}
                .no-print-bar {{
                    display: none;
                }}
                .report-card {{
                    box-shadow: none;
                    padding: 0;
                    max-width: 100%;
                }}
            }}
        </style>
    </head>
    <body>
        <div class="no-print-bar">
            <button onclick="window.print()" class="btn">🖨️ Print / Save as PDF</button>
            <a href="/api/reports/{submission_id}/pdf" class="btn btn-secondary">📥 Download PDF File</a>
        </div>
        
        <div class="report-card">
            <div class="header-flex">
                <div class="title-area">
                    <h1>{assignment_title}</h1>
                    <div style="color: #64748b; font-size: 14px;">Subject: <b>{subject}</b> | Date: {approved_at}</div>
                </div>
                <div class="badge-area">
                    <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Overall Grade</div>
                    <div class="grade-badge">{grade_letter} <span style="font-size: 18px; color: #1e293b;">({percentage}%)</span></div>
                    <div style="font-size: 12px; color: #64748b;">Marks: <b>{total_score} / {max_marks}</b></div>
                </div>
            </div>
            
            <div class="info-grid">
                <div><strong>Student:</strong> {student_name}</div>
                <div><strong>Class:</strong> {class_name}</div>
                <div><strong>Subject:</strong> {subject}</div>
            </div>
            
            <h2>Personalized Teacher Feedback</h2>
            <div style="font-size: 14px; color: #334155; line-height: 1.6; margin-bottom: 15px;">
                {overall_fb}
            </div>
            
            <div class="two-boxes">
                <div class="box-green">
                    <div class="box-title">Key Strengths & Mastery</div>
                    <ul>
                        {strengths_html}
                    </ul>
                </div>
                <div class="box-orange">
                    <div class="box-title">Actionable Focus Areas</div>
                    <ul>
                        {improvements_html}
                    </ul>
                </div>
            </div>
            
            <h2>Question-by-Question Breakdown</h2>
            <table>
                <thead>
                    <tr>
                        <th style="width: 35px; text-align: center;">Q#</th>
                        <th>Question & Constructive Feedback</th>
                        <th style="width: 60px; text-align: center;">Score</th>
                        <th style="width: 60px; text-align: center;">Max</th>
                    </tr>
                </thead>
                <tbody>
                    {q_rows_html}
                </tbody>
            </table>
            
            <div style="text-align: center; margin-top: 30px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px;">
                Personal Student Report • Generated Locally • Teacher Approved
            </div>
        </div>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)
