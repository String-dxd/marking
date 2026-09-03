import os
import html
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from app.core.config import REPORTS_DIR

def escape_xml(text: Any) -> str:
    """
    Safely escape strings for ReportLab Paragraph XML parser.
    Converts &, <, >, " and newlines to XML-safe entities.
    """
    if text is None:
        return ""
    s = str(text)
    s = html.escape(s)
    s = s.replace("\n", "<br/>")
    return s

class NumberedCanvas(canvas.Canvas):
    """
    Two-pass canvas to dynamically compute and draw 'Page X of Y' 
    and header/footer metadata across multi-page PDF documents.
    """
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count: int):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor('#94A3B8'))
        
        # Bottom page number & confidentiality footer
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(A4[0] - 36, 20, page_text)
        self.drawString(36, 20, "AI Marker • Individual Student Feedback Report • Confidential")
        
        # Subtle top header on page 2+
        if self._pageNumber > 1:
            self.drawString(36, A4[1] - 25, "Student Performance Report (Continued)")
            self.drawRightString(A4[0] - 36, A4[1] - 25, datetime.now().strftime("%Y-%m-%d"))
            self.setStrokeColor(colors.HexColor('#E2E8F0'))
            self.setLineWidth(0.5)
            self.line(36, A4[1] - 28, A4[0] - 36, A4[1] - 28)
            
        self.restoreState()

def generate_pdf_report(submission: Dict[str, Any], output_path: Optional[str] = None) -> str:
    """
    Generates a publication-grade personal student feedback report as an A4 PDF.
    Includes:
    - Total mark, maximum marks, percentage, and grade letter
    - Student metadata card (name, ID, cohort, subject, date)
    - Overall teacher feedback, key strengths, and focus areas
    - Question-by-question breakdown table with student work and deduction rationale
    - Sub-criteria evaluation breakdown if available
    """
    sub_id = submission.get("id", "0")
    student_name = submission.get("student_name", "Student")
    student_code = submission.get("student_code", "")
    class_name = submission.get("class_name", "General")
    assignment_title = submission.get("assignment_title", "Assignment Feedback")
    subject = submission.get("assignment_subject", "General")
    total_score = float(submission.get("total_score", 0.0) or 0.0)
    max_marks = float(submission.get("assignment_max_marks", 100.0) or 100.0)
    percentage = float(submission.get("percentage", 0.0) or 0.0)
    grade_letter = submission.get("grade_letter", "N/A")
    overall_fb = submission.get("overall_feedback", "No feedback recorded.")
    strengths_fb = submission.get("strengths_feedback", "")
    improvement_fb = submission.get("improvement_feedback", "")
    questions = submission.get("question_grades", [])
    approved_at = submission.get("approved_at") or datetime.now().strftime("%Y-%m-%d %H:%M")
    
    # Ensure reports directory exists
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    
    if not output_path:
        safe_code = "".join(c for c in str(student_code) if c.isalnum() or c in ('-', '_'))
        safe_name = "".join(c for c in str(student_name) if c.isalnum() or c in ('-', '_', ' ')).replace(" ", "_")
        filename = f"Report_{safe_name}_{safe_code}_{sub_id}.pdf" if safe_code else f"Report_{safe_name}_{sub_id}.pdf"
        output_path = str(REPORTS_DIR / filename)
        
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )
    
    styles = getSampleStyleSheet()
    
    # Custom Typography Styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#0F172A'),
        alignment=TA_LEFT
    )
    
    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#0F172A'),
        spaceBefore=8,
        spaceAfter=4
    )
    
    body_style = ParagraphStyle(
        'ReportBody',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor('#334155'),
        alignment=TA_JUSTIFY
    )
    
    bullet_style = ParagraphStyle(
        'ReportBullet',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=colors.HexColor('#334155'),
        leftIndent=10,
        spaceAfter=2
    )

    story = []
    
    # 1. Header Banner Table (Available width: ~523 pt)
    score_color = '#16A34A' if percentage >= 75 else ('#2563EB' if percentage >= 50 else '#DC2626')
    date_str = approved_at[:10] if approved_at else datetime.now().strftime("%Y-%m-%d")
    
    header_data = [
        [
            Paragraph(f"<b>{escape_xml(assignment_title)}</b><br/><font color='#64748B' size='8.5'>Subject: <b>{escape_xml(subject)}</b> &nbsp;|&nbsp; Date: {escape_xml(date_str)}</font>", title_style),
            Paragraph(
                f"<font size='8' color='#64748B'>INDIVIDUAL PERFORMANCE REPORT</font><br/>"
                f"<b><font size='16' color='{score_color}'>{escape_xml(grade_letter)}</font></b> "
                f"<font size='12' color='#0F172A'><b>({percentage:.1f}%)</b></font><br/>"
                f"<font size='8.5' color='#475569'>Total Score: <b>{total_score:.1f}</b> / {max_marks:.1f}</font>",
                ParagraphStyle('ScoreBadge', alignment=TA_RIGHT, leading=14)
            )
        ]
    ]
    header_table = Table(header_data, colWidths=[350, 173])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(header_table)
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#CBD5E1'), spaceBefore=2, spaceAfter=8))
    
    # 2. Student Info Card
    info_data = [
        [
            Paragraph(f"<b>Student:</b> {escape_xml(student_name)}", body_style),
            Paragraph(f"<b>Student ID:</b> {escape_xml(student_code or 'N/A')}", body_style),
            Paragraph(f"<b>Class / Cohort:</b> {escape_xml(class_name)}", body_style)
        ]
    ]
    info_table = Table(info_data, colWidths=[185, 160, 178])
    info_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8FAFC')),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 8))
    
    # 3. Overall Feedback
    story.append(Paragraph("Overall Teacher Feedback & Observations", section_heading))
    fb_table_data = [[Paragraph(escape_xml(overall_fb), body_style)]]
    fb_table = Table(fb_table_data, colWidths=[523])
    fb_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F8FAFC')),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(fb_table)
    story.append(Spacer(1, 8))
    
    # 4. Strengths and Improvements Side-by-Side Boxes
    strengths_paragraphs = [
        Paragraph("<b>Key Strengths & Mastered Skills:</b>", ParagraphStyle('StrTitle', fontName='Helvetica-Bold', fontSize=9.5, textColor=colors.HexColor('#166534'), spaceAfter=3))
    ]
    if strengths_fb:
        for line in strengths_fb.split("\n"):
            line = line.strip()
            if line:
                strengths_paragraphs.append(Paragraph(f"• {escape_xml(line.lstrip('•- '))}", bullet_style))
    else:
        strengths_paragraphs.append(Paragraph("Demonstrated consistent effort across assessed items.", bullet_style))
        
    imp_paragraphs = [
        Paragraph("<b>Actionable Focus Areas:</b>", ParagraphStyle('ImpTitle', fontName='Helvetica-Bold', fontSize=9.5, textColor=colors.HexColor('#9A3412'), spaceAfter=3))
    ]
    if improvement_fb:
        for line in improvement_fb.split("\n"):
            line = line.strip()
            if line:
                imp_paragraphs.append(Paragraph(f"• {escape_xml(line.lstrip('•- '))}", bullet_style))
    else:
        imp_paragraphs.append(Paragraph("Review detailed question commentary to prevent minor oversights.", bullet_style))
        
    two_col_data = [[strengths_paragraphs, imp_paragraphs]]
    two_col_table = Table(two_col_data, colWidths=[257, 258])
    two_col_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#F0FDF4')), # soft green
        ('BACKGROUND', (1, 0), (1, 0), colors.HexColor('#FFF7ED')), # soft amber
        ('BOX', (0, 0), (0, 0), 0.5, colors.HexColor('#BBF7D0')),
        ('BOX', (1, 0), (1, 0), 0.5, colors.HexColor('#FED7AA')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(two_col_table)
    story.append(Spacer(1, 10))
    
    # 5. Question-by-Question Breakdown Table
    if questions:
        story.append(Paragraph("Question-by-Question Diagnostic Breakdown", section_heading))
        q_table_data = [
            [
                Paragraph("<b>Q#</b>", ParagraphStyle('TH', fontName='Helvetica-Bold', fontSize=8.5, alignment=TA_CENTER, textColor=colors.white)),
                Paragraph("<b>Question, Extracted Work & Constructive Feedback</b>", ParagraphStyle('TH', fontName='Helvetica-Bold', fontSize=8.5, textColor=colors.white)),
                Paragraph("<b>Score</b>", ParagraphStyle('TH', fontName='Helvetica-Bold', fontSize=8.5, alignment=TA_CENTER, textColor=colors.white)),
                Paragraph("<b>Max</b>", ParagraphStyle('TH', fontName='Helvetica-Bold', fontSize=8.5, alignment=TA_CENTER, textColor=colors.white)),
            ]
        ]
        
        for q in questions:
            q_num = str(q.get("question_no", ""))
            q_title = q.get("question_title", "")
            try:
                q_awarded = float(q.get("awarded_marks", 0.0) or 0.0)
            except (ValueError, TypeError):
                q_awarded = 0.0
            try:
                q_max = float(q.get("max_marks", 0.0) or 0.0)
            except (ValueError, TypeError):
                q_max = 0.0
                
            q_comment = q.get("feedback_comment", "")
            q_answer = q.get("extracted_answer", "")
            q_criteria = q.get("criteria", [])
            
            detail_content = []
            if q_title:
                detail_content.append(f"<b><font color='#0F172A'>{escape_xml(q_title)}</font></b>")
            
            if q_comment:
                if q_awarded < q_max:
                    deduction = q_max - q_awarded
                    detail_content.append(f"<font color='#B91C1C'><b>Feedback & Error Analysis (-{deduction:.1f}):</b></font> {escape_xml(q_comment)}")
                else:
                    detail_content.append(f"<font color='#166534'><b>Feedback:</b></font> {escape_xml(q_comment)}")
                    
            if q_answer:
                trimmed_ans = q_answer[:220] + ("..." if len(q_answer) > 220 else "")
                detail_content.append(f"<font color='#64748B' size='8'><i>Student Response: {escape_xml(trimmed_ans)}</i></font>")
                
            if q_criteria and isinstance(q_criteria, list):
                crit_lines = []
                for c in q_criteria:
                    c_name = c.get("criterion", "Criterion")
                    c_awarded = c.get("awarded", 0)
                    c_max = c.get("max", 1)
                    c_icon = "✓" if float(c_awarded) >= float(c_max) else "✗"
                    c_color = "#166534" if float(c_awarded) >= float(c_max) else "#9A3412"
                    crit_lines.append(f"<font color='{c_color}'><b>{c_icon} {escape_xml(c_name)}</b> ({c_awarded}/{c_max})</font>")
                if crit_lines:
                    detail_content.append("<font size='7.5'>" + " &nbsp;|&nbsp; ".join(crit_lines) + "</font>")
                
            q_text = "<br/>".join(detail_content) if detail_content else "-"
            is_full_mark = (q_awarded >= q_max and q_max > 0)
            score_color_q = '#16A34A' if is_full_mark else ('#DC2626' if q_awarded == 0 else '#D97706')
            
            q_table_data.append([
                Paragraph(f"<b>{escape_xml(q_num)}</b>", ParagraphStyle('QNo', fontName='Helvetica-Bold', fontSize=9, alignment=TA_CENTER)),
                Paragraph(q_text, ParagraphStyle('QDetail', fontName='Helvetica', fontSize=8.5, leading=11.5)),
                Paragraph(f"<b><font color='{score_color_q}'>{q_awarded:.1f}</font></b>", ParagraphStyle('QScore', fontName='Helvetica-Bold', fontSize=9, alignment=TA_CENTER)),
                Paragraph(f"<font color='#64748B'>{q_max:.1f}</font>", ParagraphStyle('QMax', fontName='Helvetica', fontSize=9, alignment=TA_CENTER)),
            ])
            
        q_table = Table(q_table_data, colWidths=[32, 373, 59, 59], repeatRows=1)
        q_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')]),
            ('TOPPADDING', (0, 0), (-1, -1), 4.5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4.5),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(q_table)
        
    story.append(Spacer(1, 10))
    story.append(Paragraph("<font size='7.5' color='#94A3B8'>Report generated by AI Marker • Verified by Teacher • Privacy Assured (Local AI)</font>", ParagraphStyle('FooterTag', alignment=TA_CENTER)))
    
    doc.build(story, canvasmaker=NumberedCanvas)
    return output_path
