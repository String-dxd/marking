# Tallus v0.1: Assessment & Analytics

A 100% offline, privacy-first local workflow for AI-assisted marking, personalized feedback drafting, teacher review & approval, printable report generation, and student performance tracking.

---

## 🚀 Key Features

1. **🔒 100% Local & Private (Zero Cloud Dependencies)**:
   - Integrates directly with your local **Ollama** instance (`http://localhost:11434`).
   - Uses local multimodal vision models (e.g., `qwen2.5-vl` / `qwen3.8`) for handwriting OCR, visual layout analysis, and rubric evaluation.
   - All student scans, extracted handwriting, scores, and personal records remain strictly on your local machine with zero external telemetry.

2. **🧩 Pluggable Subject Marker Architecture & Registry**:
   - **Central Marker Registry (`app/markers/registry.py`)**: Extensible registry mapping assignments to specialized subject markers via the `BaseMarker` lifecycle interface.
   - **Lower Secondary Science Marker (`app/markers/lower_sec_science.py`)**:
     - Handles multi-part questions (e.g., Q1(a), Q1(b)(i)), experimental setups, data tables, and apparatus diagrams.
     - Advanced criteria grounding across horizontal and vertical marking rubrics.
     - Detects partially unfilled or empty student answer boxes by scanning the entire diagram width.
     - Cross-page question stitching for multi-page science problems.
   - **Chinese Composition / Essay Marker (`app/markers/chinese_essay.py`)**:
     - Purpose-built for standard 20×20 composition grid paper (田字格 / 方格纸).
     - Automated character counting, paragraph indent validation, and punctuation placement verification.
     - Dual-criterion assessment: 内容 (Content, 20 marks) and 表达 (Language & Expression, 20 marks).
     - Paragraph-by-paragraph feedback, vocabulary highlights, and sentence refinement suggestions.
   - **General Subject Marker (`app/markers/general.py`)**: Fallback engine for standard question-and-answer worksheets and exams.

3. **📐 Advanced Layout Analysis & Paper Engines**:
   - **Layout Boundary Engine (`app/core/layout_engine.py`)**: Computer vision delineation for question blocks, student answer zones, tables, and bounding boxes.
   - **Lined Paper Engine (`app/core/lined_paper_engine.py`)**: Baseline finding, ruling line detection, and paragraph line grouping on lined exam sheets.
   - **Grid Paper Transcriptions (`app/core/grid_paper_transcriptions.py`)**: Maps OCR character tokens into precise 20×20 grid cell coordinates for Chinese essays.
   - **Direct Visual Marker (`app/core/direct_marker.py`)**: Burns criteria checklists, ticks, crosses, and callout annotations directly onto the scanned student papers at ink-grounded coordinates.
   - **Resilient Fallback Tracking (`app/core/fallback_tracker.py`)**: Tracks heuristic or LLM fallbacks during OCR and layout parsing, recording diagnostic notices for teachers.

4. **🏫 Google Classroom 2-Way Synchronization**:
   - **Course & Roster Sync**: Seamless OAuth2 integration to import classes, active coursework, and enrolled student rosters directly into Tallus.
   - **Submission Ingestion**: Sync student submission attachments (PDFs and image scans) straight into the local marking pipeline.
   - **Grade & Feedback Return**: Push evaluated marks, rubric breakdowns, and generated PDF reports back to Google Classroom as assignment grades and private teacher comments.

5. **✂️ Bulk Ingestion, Auto-Splitting & Incremental Pipeline**:
   - Ingest multi-page scanned class PDFs; auto-splits into individual student documents and extracts student names via OCR.
   - Support for reverse-order page scanning and per-page rotation (90°, 180°, 270°).
   - **Incremental Step Re-running**: Re-run grading and visual annotation burning (Steps 2 & 3) without repeating the expensive OCR step (Step 1).
   - **Bulk Cleanup**: Cascade deletion of assignments and submissions with automatic removal of local files, processed images, and database records.

6. **🧑‍🏫 Assignment-Level Review Station & Human-in-the-Loop Approval**:
   - **Queue Navigation**: Continuous review workflow ("Submission X of Y") allowing teachers to grade an entire class batch without returning to the main dashboard.
   - **Split-Screen Workspace**: High-resolution scanned script on the left with zoom and pan; AI rubric scoring, editable marks, and drafted feedback on the right.
   - **Quick Approvals & Hotkeys**: One-click score overrides, quick status transitions (Pending Review, Approved, Flagged), and immediate next-submission jumps.

7. **📄 Printable Personal Student Reports**:
   - Generates publication-ready A4 PDF reports (and printable web views) with score badges, personalized feedback, mastered skills, focus areas, and question-by-question breakdowns.

8. **📈 Longitudinal Student Database & Batch Editing**:
   - SQLite persistent database tracking student cohorts across assignments and terms.
   - Batch-edit capabilities (update classes and subjects in bulk).
   - Visual performance trajectories and score progression charts across assignments.

---

## 🗺️ Future Roadmap (Subsequent Phase)

In the upcoming phases, Tallus will expand its capabilities to include deep student analytics and automated resource generation:

- **📊 Granular Skill & Topic Monitoring**: Go beyond assignment-level scores to track student competency at a micro-level. The system will map individual questions to specific learning objectives, topics, and skills.
- **📝 Personalized Revision Worksheets**: Leverage the granular monitoring data to automatically generate custom-tailored revision materials.

---

## ⚡ Quick Start

### 1. Prerequisites
Ensure Ollama is installed and running with a compatible vision model (e.g., `qwen3.8:latest` or `qwen2.5-vl`):
```bash
ollama run qwen3.8:latest
```

### 2. Launch the Application
Tallus operates locally on port **8250** by default.

- **Native Desktop Mode (Recommended — Zero-Console Clean Window)**:
  - Double-click **`Tallus.lnk`** (located on your Desktop or project folder) or run `tallus.bat`.
  - Or execute: `python tallus_desktop.py` (or `python run.py --desktop`).
  - Runs FastAPI silently in the background with zero command prompt window.
  - Opens in a dedicated, native desktop window powered by Microsoft Edge WebView2.
  - Bound to the **Windows Taskbar** and Start Menu with the monochrome Tallus icon (`AppUserModelID: Tallus.AIMarker.App`).
  - Automatically and cleanly terminates background servers when the window is closed.
- **Classic Browser / Terminal Mode**:
  - Run `python run.py`.
  - Access `http://localhost:8250` in your web browser.
- **Mobile HTTPS Mode (Cloudflare Tunnel + QR Code)**:
  - Run `start_mobile_https.bat` (or `python run.py --tunnel`).
  - Automatically provisions a trusted `https://*.trycloudflare.com` URL.
  - Displays a scannable ASCII QR code in the terminal for instant mobile phone access and camera uploads.
- **Local Network / Wi-Fi Access**:
  - Run `allow_firewall_port_8250.bat` as Administrator if accessing Tallus from tablets or other computers on the school network.

---

## 🔄 End-to-End Workflow

```
+-------------------------------------------------------------+
| 1. Ingestion & Setup                                        |
|    - Import student roster (CSV/Excel) OR Google Classroom  |
|    - Select specialized marker: Science, Chinese Essay, etc.|
|    - Upload marking scheme (DOCX/PDF/Text)                  |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| 2. Document Processing & Auto-Splitting                     |
|    - Upload multi-page class PDF                            |
|    - Auto-split into individual student scripts via OCR     |
|    - Layout engine detects lined/grid paper & answer zones  |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| 3. Local AI Spatial Marking & Grounding                     |
|    - Dispatches to specialized marker (Science/Essay/etc.)  |
|    - Evaluates student handwriting against rubrics          |
|    - Burns ink-grounded ticks, crosses & callouts directly  |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| 4. Assignment-Level Review Station                          |
|    - Side-by-side verification: Scanned script vs. rubric   |
|    - Continuous queue navigation ("Submission X of Y")      |
|    - Adjust marks, edit drafted feedback, and approve       |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| 5. Publication, Reports & Grade Return                      |
|    - Generate publication-ready A4 PDF reports              |
|    - Sync grades & feedback comments to Google Classroom    |
|    - Update longitudinal performance analytics              |
+-------------------------------------------------------------+
```

---

## 🧪 Running Automated Tests

Tallus includes a comprehensive suite of 24 specialized test modules covering API routes, document splitting, layout detection, subject markers, and pipeline resilience:

```bash
# Run entire test suite using virtual environment
.venv\Scripts\pytest tests/

# Or run specific test suites
.venv\Scripts\pytest tests/test_essay_marker.py
.venv\Scripts\pytest tests/test_marker_registry.py
.venv\Scripts\pytest tests/test_google_classroom.py
.venv\Scripts\pytest tests/test_batch_pipeline_resilience.py
```

---

## 🏗️ Project Architecture

```
Tallus/
├── app/
│   ├── api/
│   │   ├── assignments.py              # Assignment & rubric management endpoints
│   │   ├── google_classroom.py         # Google Classroom OAuth2 & sync endpoints
│   │   ├── grading.py                  # Review station, grade overrides & approval
│   │   ├── reports.py                  # Printable PDF & HTML report endpoints
│   │   ├── students.py                 # Student roster, cohort trends & bulk edits
│   │   └── submissions.py              # PDF upload, auto-split & pipeline triggers
│   ├── core/
│   │   ├── config.py                   # App configuration, directories & port 8250
│   │   ├── db.py                       # SQLite database operations, schemas & queries
│   │   ├── direct_marker.py            # Visual annotation overlay engine (ticks, crosses)
│   │   ├── doc_parser.py               # Combined PDF splitter & DOCX/PDF rubric parser
│   │   ├── essay_marker.py             # Dedicated essay evaluation & rubric scoring engine
│   │   ├── fallback_tracker.py         # Diagnostic logging for parsing/grounding fallbacks
│   │   ├── google_classroom.py         # Google Classroom API client & sync service
│   │   ├── grid_paper_transcriptions.py # 20x20 composition grid mapping & alignment
│   │   ├── layout_engine.py            # Vision layout analysis (question blocks, diagrams)
│   │   ├── lined_paper_engine.py       # Lined paper baseline detection & line grouping
│   │   ├── marker_engine.py            # General rubric prompt engine & scoring logic
│   │   ├── ollama_client.py            # Local Ollama client with retry & error handling
│   │   ├── pdf_processor.py            # High-res PDF rendering, page rotation & deskew
│   │   ├── report_generator.py         # ReportLab A4 printable report builder
│   │   └── roster_parser.py            # CSV/Excel roster import processing
│   ├── markers/
│   │   ├── __init__.py                 # Marker package initialization
│   │   ├── base.py                     # Abstract BaseMarker lifecycle interface
│   │   ├── chinese_essay.py            # Specialized Chinese composition marker
│   │   ├── general.py                  # Standard multi-question general marker
│   │   ├── lower_sec_science.py        # Lower Secondary Science marker
│   │   └── registry.py                 # Marker registry & dynamic subject dispatching
│   ├── static/
│   │   ├── css/
│   │   │   └── style.css               # Dashboard, review drawer & responsive layouts
│   │   ├── js/
│   │   │   └── app.js                  # Frontend SPA controller, review queue & Chart.js
│   │   ├── apple-touch-icon.png        # Mobile touch icon
│   │   ├── favicon-16x16.png           # 16px favicon
│   │   ├── favicon-32x32.png           # 32px favicon
│   │   ├── favicon.ico                 # Multi-resolution favicon
│   │   ├── index.html                  # Single-page app dashboard & review station
│   │   ├── logo.png                    # Tallus monochrome logo
│   │   ├── logo_white.png              # White variant logo
│   │   └── tallus.ico                  # Win32 taskbar application icon
│   └── main.py                         # FastAPI application entrypoint & lifespan events
├── Markers/
│   ├── chinese_essay_marker.md         # Prompt specification for Chinese composition marking
│   └── lower_sec_science_marker.md     # Prompt specification for Lower Sec Science marking
├── tests/                              # Comprehensive test suite (24 test modules)
│   ├── test_api_endpoints.py           # API endpoint integration tests
│   ├── test_auto_extraction.py         # OCR name extraction tests
│   ├── test_batch_pipeline_resilience.py # Fault-tolerant batch processing tests
│   ├── test_bulk_delete.py             # Bulk deletion & cascade cleanup tests
│   ├── test_concise_direct_marking.py  # Concise visual feedback overlay tests
│   ├── test_criteria_grounding_horizontal.py # Horizontal criteria table detection tests
│   ├── test_cross_page_science_questions.py # Multi-page question stitching tests
│   ├── test_direct_marking.py          # Direct visual marking tests
│   ├── test_docx_parser.py             # DOCX marking scheme parsing tests
│   ├── test_essay_marker.py            # Essay scoring, character count & grid tests
│   ├── test_fallback_notices.py        # Pipeline fallback notice tests
│   ├── test_google_classroom.py        # Google Classroom client & OAuth mock tests
│   ├── test_grounded_pipeline.py       # Grounded end-to-end marking pipeline tests
│   ├── test_marker_registry.py         # Marker registration & dispatch tests
│   ├── test_marker_system.py           # Core marker system integration tests
│   ├── test_page_coding.py             # Page numbering, barcodes & reverse scan tests
│   ├── test_pdf_split.py               # PDF splitting & student boundary tests
│   ├── test_pipeline_skipping.py       # Incremental step re-running tests
│   ├── test_real_sample_rendering.py   # High-fidelity visual annotation rendering tests
│   ├── test_report_generation.py       # ReportLab PDF report generation tests
│   ├── test_rerun_pipeline_steps2_3.py # Step 2/3 re-run tests
│   ├── test_roster_upload.py           # Student roster CSV/XLSX import tests
│   ├── test_rubric_parser.py           # Structured rubric parser tests
│   └── test_unfilled_box_grounding.py  # Unfilled answer box discovery tests
├── allow_firewall_port_8250.bat        # Windows firewall rule configuration script for port 8250
├── create_shortcut.py                  # C# .NET compiler utility for windowless Tallus.lnk
├── format_artifact.py                  # Helper utility script
├── requirements.txt                    # Python dependencies
├── run.py                              # Unified CLI launcher (--desktop & --tunnel)
├── start_mobile_https.bat              # Quick mobile HTTPS Cloudflare tunnel launcher
├── tallus.bat                          # One-click Windows desktop launcher
├── tallus.exe                          # Native compiled GUI launcher executable
├── tallus.ico                          # Multi-resolution monochrome application icon
├── Tallus.lnk                          # Configured Windows shortcut with AppUserModelID
├── tallus_desktop.py                   # Microsoft Edge WebView2 native window wrapper
├── test_ollama.py                      # Local Ollama connection verification script
├── tunnel_launcher.py                  # Cloudflare quick tunnel & ASCII QR code generator
└── update_ui.py                        # UI styling sync script
```
