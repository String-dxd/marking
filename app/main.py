import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import BASE_DIR, PROCESSED_DIR, UPLOADS_DIR, REPORTS_DIR
from app.core.db import init_db
from app.core.ollama_client import ollama_client
from app.api import assignments, students, submissions, grading, reports

app = FastAPI(
    title="Tallus - Assessment & Analytics",
    version="1.0.0",
    description="Privacy-First Local AI Marking & Feedback Workflow"
)

# Enable CORS for local testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API Routers
app.include_router(assignments.router)
app.include_router(students.router)
app.include_router(submissions.router)
app.include_router(grading.router)
app.include_router(reports.router)

# Mount static asset directories
static_dir = Path(__file__).resolve().parent / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
app.mount("/data/processed", StaticFiles(directory=str(PROCESSED_DIR)), name="processed_data")

@app.on_event("startup")
def startup_event():
    init_db()

@app.get("/api/health")
def health_check():
    ollama_status = ollama_client.check_health()
    return {
        "status": "online",
        "ollama": ollama_status
    }

@app.get("/api/health/workload")
def workload_check():
    workload = ollama_client.get_workload_status()
    return workload

@app.get("/")
def serve_index():
    index_file = static_dir / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "Tallus API is running."}

@app.get("/favicon.ico", include_in_schema=False)
def serve_favicon():
    favicon_file = static_dir / "favicon.ico"
    if favicon_file.exists():
        return FileResponse(favicon_file, headers={"Cache-Control": "no-cache, must-revalidate"})
    return FileResponse(static_dir / "logo.png")


