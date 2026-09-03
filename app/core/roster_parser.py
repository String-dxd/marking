import io
import csv
import re
from typing import List, Dict, Any, Tuple

try:
    import openpyxl
except ImportError:
    openpyxl = None


def normalize_header(header: str) -> str:
    """Normalizes header string for fuzzy matching (lowercase, alphanumeric only)."""
    if not header:
        return ""
    return re.sub(r"[^a-z0-9]", "", str(header).lower().strip())


def map_column_headers(headers: List[str]) -> Dict[str, int]:
    """
    Identifies column indices for name, class_name, subject, and email.
    """
    col_map = {}
    
    name_patterns = ["name", "studentname", "fullname", "student", "pupilname", "studentfullname"]
    class_patterns = ["class", "classname", "grade", "gradelevel", "cohort", "section", "group", "classroom", "form"]
    subject_patterns = ["subject", "subjectname", "course", "coursename", "topic", "discipline"]
    email_patterns = ["email", "emailaddress", "studentemail", "mail"]

    for idx, raw_h in enumerate(headers):
        norm_h = normalize_header(raw_h)
        if not norm_h:
            continue
            
        if "name" not in col_map and any(p == norm_h or norm_h.startswith(p) or norm_h.endswith(p) for p in name_patterns):
            col_map["name"] = idx
        elif "class_name" not in col_map and any(p == norm_h or norm_h.startswith(p) or norm_h.endswith(p) for p in class_patterns):
            col_map["class_name"] = idx
        elif "subject" not in col_map and any(p == norm_h or norm_h.startswith(p) or norm_h.endswith(p) for p in subject_patterns):
            col_map["subject"] = idx
        elif "email" not in col_map and any(p == norm_h or norm_h.startswith(p) or norm_h.endswith(p) for p in email_patterns):
            col_map["email"] = idx

    # If name wasn't matched explicitly, check for column 0 or header containing 'name'
    if "name" not in col_map and len(headers) > 0:
        for idx, raw_h in enumerate(headers):
            if "name" in str(raw_h).lower():
                col_map["name"] = idx
                break
        if "name" not in col_map:
            col_map["name"] = 0  # Default first column as name

    # If class wasn't matched, check if there is a 2nd column
    if "class_name" not in col_map and len(headers) > 1 and col_map.get("name") != 1:
        col_map["class_name"] = 1

    # If subject wasn't matched, check if there is a 3rd column
    if "subject" not in col_map and len(headers) > 2 and col_map.get("name") != 2 and col_map.get("class_name") != 2:
        col_map["subject"] = 2

    return col_map


def parse_csv_roster(file_bytes: bytes) -> List[Dict[str, str]]:
    """Parses CSV bytes with multiple encoding fallbacks and delimiter sniffing."""
    text = None
    for enc in ["utf-8-sig", "utf-8", "latin1", "cp1252"]:
        try:
            text = file_bytes.decode(enc)
            break
        except UnicodeDecodeError:
            continue
            
    if text is None:
        text = file_bytes.decode("utf-8", errors="replace")

    lines = [line for line in text.splitlines() if line.strip()]
    if not lines:
        return []

    sample = "\n".join(lines[:10])
    delimiter = ","
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",\t;|")
        delimiter = dialect.delimiter
    except Exception:
        if "\t" in lines[0]:
            delimiter = "\t"
        elif ";" in lines[0]:
            delimiter = ";"

    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    all_rows = [row for row in reader if any(cell.strip() for cell in row)]
    if not all_rows:
        return []

    headers = [str(c).strip() for c in all_rows[0]]
    col_map = map_column_headers(headers)

    students = []
    is_first_row_header = any(normalize_header(h) in ["name", "studentname", "class", "subject", "email", "grade"] for h in headers)
    data_rows = all_rows[1:] if is_first_row_header else all_rows

    for row in data_rows:
        name_idx = col_map.get("name", 0)
        class_idx = col_map.get("class_name", 1)
        subj_idx = col_map.get("subject", 2)
        email_idx = col_map.get("email", 3)

        name = row[name_idx].strip() if name_idx < len(row) else ""
        if not name or name.lower() in ["name", "student name", "student"]:
            continue

        class_name = row[class_idx].strip() if class_idx < len(row) else ""
        if not class_name or class_name.lower() in ["class", "class name", "grade"]:
            class_name = "General"

        subject = row[subj_idx].strip() if subj_idx < len(row) else ""
        if subject.lower() in ["subject", "course", "subject name"]:
            subject = ""

        email = row[email_idx].strip() if email_idx < len(row) else ""
        if email.lower() in ["email", "e-mail"]:
            email = ""

        students.append({
            "name": name,
            "class_name": class_name,
            "subject": subject,
            "email": email
        })

    return students


def parse_excel_roster(file_bytes: bytes) -> List[Dict[str, str]]:
    """Parses Excel (.xlsx) file bytes using openpyxl."""
    if openpyxl is None:
        raise ValueError("openpyxl library is required to parse Excel (.xlsx) files.")

    wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    sheet = wb.active
    
    rows = []
    for r in sheet.iter_rows(values_only=True):
        if r and any(cell is not None and str(cell).strip() for cell in r):
            rows.append([str(c).strip() if c is not None else "" for c in r])

    if not rows:
        return []

    headers = rows[0]
    col_map = map_column_headers(headers)

    is_first_row_header = any(normalize_header(h) in ["name", "studentname", "class", "subject", "email", "grade"] for h in headers)
    data_rows = rows[1:] if is_first_row_header else rows

    students = []
    for row in data_rows:
        name_idx = col_map.get("name", 0)
        class_idx = col_map.get("class_name", 1)
        subj_idx = col_map.get("subject", 2)
        email_idx = col_map.get("email", 3)

        name = row[name_idx].strip() if name_idx < len(row) else ""
        if not name or name.lower() in ["name", "student name", "student"]:
            continue

        class_name = row[class_idx].strip() if class_idx < len(row) else ""
        if not class_name or class_name.lower() in ["class", "class name", "grade"]:
            class_name = "General"

        subject = row[subj_idx].strip() if subj_idx < len(row) else ""
        if subject.lower() in ["subject", "course", "subject name"]:
            subject = ""

        email = row[email_idx].strip() if email_idx < len(row) else ""
        if email.lower() in ["email", "e-mail"]:
            email = ""

        students.append({
            "name": name,
            "class_name": class_name,
            "subject": subject,
            "email": email
        })

    return students


def parse_roster_file(file_bytes: bytes, filename: str) -> List[Dict[str, str]]:
    """
    Dispatches file to CSV or Excel parser based on filename and magic bytes.
    """
    fn = filename.lower()
    if fn.endswith(".xlsx") or fn.endswith(".xlsm") or fn.endswith(".xltx"):
        return parse_excel_roster(file_bytes)
    elif fn.endswith(".csv") or fn.endswith(".txt") or fn.endswith(".tsv"):
        return parse_csv_roster(file_bytes)
    else:
        # Try Excel first (ZIP magic bytes PK\x03\x04), then CSV fallback
        if file_bytes.startswith(b"PK\x03\x04"):
            try:
                return parse_excel_roster(file_bytes)
            except Exception:
                pass
        return parse_csv_roster(file_bytes)
