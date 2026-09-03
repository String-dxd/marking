# 🎓 Tallus: AI Marker & Student Feedback System

A 100% offline, privacy-first local workflow for AI-assisted marking, personalized feedback drafting, teacher review & approval, printable report generation, and student performance tracking.

---

## 🌟 Key Features

1. **🔒 100% Local & Private (Zero Cloud Dependencies)**:
   - Integrates directly with your local **Ollama** server (`http://localhost:11434`).
   - Uses `qwen2.5vl:7b` for multimodal vision/OCR grading and handwriting inspection.
   - All student scans, scores, and personal records remain strictly on your local machine.

2. **📄 Scanned Papers & Reverse-Order Handling**:
   - Supports multi-page PDFs and high-resolution images.
   - **One-Click "Reverse Page Order"** toggle for scans that come out backwards from automatic document feeders.
   - Per-page rotation (90°, 180°, 270°), zoom, and custom sequencing.

3. **⚖️ Multi-Criteria AI Marking Engine**:
   - Evaluates student handwriting against custom marking schemes and rubrics.
   - Provides awarded marks, maximum marks, extracted student working as evidence, diagnostic notes, and personalized constructive feedback.

4. **🧑‍🏫 Human-in-the-Loop Review & Approval Station**:
   - Split-screen workspace: Student's scanned paper on the left, AI rubric scoring & drafted feedback on the right.
   - Adjust marks, edit comments, regenerate specific sections, and approve when satisfied.

5. **🖨️ Printable Personal Student Reports**:
   - Generates publication-ready A4 PDF reports (and printable web views) with score badges, personalized feedback, mastered skills, focus areas, and question-by-question breakdowns.

6. **📈 Longitudinal Student Database & Performance Tracking**:
   - SQLite persistent database tracking student cohorts.
   - Visual performance trajectories and score progression charts across assignments.

---

## 🔮 Future Roadmap (Subsequent Phase)

In the upcoming phases, Tallus will expand its capabilities to include deep student analytics and automated resource generation:

- **🔬 Granular Skill & Topic Monitoring**: Go beyond assignment-level scores to track student competency at a micro-level. The system will map individual questions to specific learning objectives, topics, and skills, providing a high-resolution view of each student's academic progress.
- **📝 Personalized Revision Worksheets**: Leverage the granular monitoring data to automatically generate custom-tailored revision materials. The AI will structure bespoke worksheets for each student, dynamically focusing on their unique areas of weakness and reinforcing foundational competencies based on their historical performance.

---

## 🚀 Quick Start

### 1. Prerequisites
Ensure Ollama is installed and running with `qwen3.8:latest`:
```bash
ollama run qwen3.8:latest
```

### 2. Launch the Application
- **Standard Local/LAN Mode**: Run `python run.py` or double-click `start.bat`.
- **Mobile HTTPS Mode (Cloudflare Tunnel + QR Code)**: Run `python run.py --tunnel` or double-click `start_mobile_https.bat`.
  - Automatically provisions a trusted `https://*.trycloudflare.com` URL.
  - Displays a scannable ASCII QR code in the terminal for instant mobile phone access and camera uploads.

---

## 🔄 End-to-End Workflow

```
+------------------------------------+
| 1. Create Assignment & Rubric      | -> Define title, max marks, upload/paste marking scheme
+------------------------------------+
                  |
                  v
+------------------------------------+
| 2. Ingest Scanned Student Papers   | -> Upload PDF/Images (toggle 'Reverse Page Order' if needed)
+------------------------------------+
                  |
                  v
+------------------------------------+
| 3. Local AI Vision Marking         | -> Model inspects handwriting & scores question-by-question
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
```

---

## 🧪 Running Automated Tests

Run the test suite to verify database operations, reverse page ordering, PDF report generation, and API routes:
```bash
python tests/test_marker_system.py
python tests/test_api_endpoints.py
```

---

## 📂 Project Architecture

```
Tallus/
├── app/
│   ├── core/
│   │   ├── config.py            # Environment & paths configuration
│   │   ├── db.py                # SQLite database operations & schemas
│   │   ├── ollama_client.py     # Local Ollama client (multimodal & chat)
│   │   ├── pdf_processor.py     # High-res PDF rendering & page ordering
│   │   ├── marker_engine.py     # Rubric parsing & AI grading prompt engine
│   │   └── report_generator.py  # ReportLab A4 PDF report builder
│   ├── api/
│   │   ├── assignments.py       # Assignment & marking scheme management
│   │   ├── students.py          # Student roster & performance analytics
│   │   ├── submissions.py       # Scan upload & AI marking triggers
│   │   ├── grading.py           # Human-in-the-loop review & approval
│   │   └── reports.py           # Printable PDF & HTML reports
│   ├── static/
│   │   ├── index.html           # Modern Single-Page App dashboard
│   │   ├── css/style.css        # Dashboard styling & transitions
│   │   └── js/app.js            # Interactive logic & Chart.js visualizations
│   └── main.py                  # FastAPI application entrypoint
├── tests/
│   ├── test_marker_system.py    # Unit tests for core components
│   └── test_api_endpoints.py    # Integration tests for API routes
├── run.py                       # Python launch script with auto-browser opening
├── start.bat                    # One-click Windows launcher
└── requirements.txt             # Python dependencies
```
