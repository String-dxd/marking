# Tallus v0.1: Assessment & Analytics

A 100% offline, privacy-first local workflow for AI-assisted marking, personalized feedback drafting, teacher review & approval, printable report generation, and student performance tracking.

---

## 🚀 Key Features

1. **🔒 100% Local & Private (Zero Cloud Dependencies)**:
   - Integrates directly with your local **Ollama** server (http://localhost:11434).
   - Uses local multimodal vision models (e.g., qwen2.5-vl / qwen3.8) for OCR grading and handwriting inspection.
   - All student scans, scores, and personal records remain strictly on your local machine.

2. **✂️ Bulk Roster Upload & Auto-Splitting**:
   - Ingest CSV/Excel rosters to build your student database.
   - Upload combined multi-page class PDFs; the system auto-splits them into individual student documents and extracts student names.
   - Support for reverse-order page handling and per-page rotation (90°, 180°, 270°).

3. **🎯 Spatial Graph Marking & Visual Feedback**:
   - The AI vision model accurately recognizes graph evaluation criteria (axes, labels, plotting accuracy).
   - Generates a direct overlay with a vertical criteria checklist (Ticks & Crosses) and explicitly circles erroneously plotted points on the paper itself without scattering marks randomly.

4. **🧑‍🏫 Human-in-the-Loop Review & Approval Station**:
   - Split-screen workspace: Student's scanned paper on the left, AI rubric scoring & drafted feedback on the right.
   - Adjust marks, edit comments, regenerate specific sections, and approve when satisfied.

5. **📄 Printable Personal Student Reports**:
   - Generates publication-ready A4 PDF reports (and printable web views) with score badges, personalized feedback, mastered skills, focus areas, and question-by-question breakdowns.

6. **📈 Longitudinal Student Database & Batch Editing**:
   - SQLite persistent database tracking student cohorts.
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
Ensure Ollama is installed and running with a compatible vision model (e.g., qwen3.8:latest):
\\\ash
ollama run qwen3.8:latest
\\\

### 2. Launch the Application
- **Native Desktop Mode (Recommended - Browserless & Clean)**:
  - Double-click **`Tallus.lnk`** (located on your Desktop or project folder) or run `tallus.bat`.
  - Or run: `python tallus_desktop.py` (or `python run.py --desktop`).
  - Runs FastAPI silently in the background with zero command prompt window.
  - Opens in a dedicated, native desktop window (powered by Microsoft Edge WebView2).
  - Can be pinned directly to your **Windows Taskbar** or Start Menu with the monochrome Tallus icon.
  - Automatically and cleanly terminates background servers when the window is closed.
- **Classic Browser / Terminal Mode**: Run `python run.py`.
- **Mobile HTTPS Mode (Cloudflare Tunnel + QR Code)**: Run `python run.py --tunnel` (or `python tallus_desktop.py --tunnel`).
  - Automatically provisions a trusted `https://*.trycloudflare.com` URL.
  - Displays a scannable ASCII QR code in the terminal for instant mobile phone access and camera uploads.

---

## 🔄 End-to-End Workflow

\\\
+------------------------------------+
| 1. Setup Data & Rubrics            | -> Import student roster, create assignment, upload marking scheme
+------------------------------------+
                  |
                  v
+------------------------------------+
| 2. Auto-Split & Ingest Scans       | -> Upload class PDF (splits into individual docs & matches names)
+------------------------------------+
                  |
                  v
+------------------------------------+
| 3. Local AI Spatial Marking        | -> Model inspects handwriting & places ticks/crosses directly on graphs
+------------------------------------+
                  |
                  v
+------------------------------------+
| 4. Teacher Review & Approval       | -> Side-by-side verification, edit comments & approve
+------------------------------------+
                  |
                  v
+------------------------------------+
| 5. Printable Reports & Analytics   | -> Generate A4 PDF reports & track student growth trends
+------------------------------------+
\\\

---

## 🧪 Running Automated Tests

Run the test suite to verify database operations, reverse page ordering, PDF report generation, and API routes:
\\\ash
python tests/test_marker_system.py
python tests/test_api_endpoints.py
\\\

---

## 🏗️ Project Architecture

\\\
Tallus/
├── app/
│   ├── core/
│   │   ├── config.py            # Environment & paths configuration
│   │   ├── db.py                # SQLite database operations & schemas
│   │   ├── direct_marker.py     # Ticks/crosses overlay engine
│   │   ├── doc_parser.py        # Splitting logic for combined scans
│   │   ├── marker_engine.py     # Rubric parsing & AI grading prompt engine
│   │   ├── ollama_client.py     # Local Ollama client (multimodal & chat)
│   │   ├── pdf_processor.py     # High-res PDF rendering & page ordering
│   │   ├── report_generator.py  # ReportLab A4 PDF report builder
│   │   └── roster_parser.py     # CSV/Excel roster import processing
│   ├── api/
│   │   ├── assignments.py       # Assignment & marking scheme management
│   │   ├── grading.py           # Human-in-the-loop review & approval
│   │   ├── reports.py           # Printable PDF & HTML reports
│   │   ├── students.py          # Student roster, bulk edits & analytics
│   │   └── submissions.py       # Scan upload & AI marking triggers
│   ├── static/
│   │   ├── index.html           # Tallus Single-Page App dashboard
│   │   ├── logo_white.png       # Tallus brand logo
│   │   ├── css/style.css        # Dashboard styling & transitions
│   │   └── js/app.js            # Interactive logic & Chart.js visualizations
│   └── main.py                  # FastAPI application entrypoint
├── tests/                       # Unit & integration tests
├── tallus_desktop.py            # Native desktop WebView2 application wrapper
├── create_shortcut.py           # Utility to generate windowless Tallus.lnk shortcuts
├── run.py                       # CLI / terminal launcher (supports --desktop & --tunnel)
├── tallus.bat                   # One-click Windows desktop launcher
├── Tallus.lnk                   # Direct windowless desktop shortcut
└── requirements.txt             # Python dependencies
\\\
