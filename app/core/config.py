import os
from pathlib import Path

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
PROCESSED_DIR = DATA_DIR / "processed"
REPORTS_DIR = DATA_DIR / "reports"
GOOGLE_DIR = DATA_DIR / "google"
GOOGLE_CLIENT_SECRET_PATH = GOOGLE_DIR / "client_secret.json"
GOOGLE_TOKEN_PATH = GOOGLE_DIR / "token.json"
DB_PATH = DATA_DIR / "marker.db"

# Ensure runtime directories exist
for directory in [DATA_DIR, UPLOADS_DIR, PROCESSED_DIR, REPORTS_DIR, GOOGLE_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

# Ollama Local Configuration
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
DEFAULT_VISION_MODEL = os.getenv("OLLAMA_VISION_MODEL", "qwen3.8:latest")
DEFAULT_TEXT_MODEL = os.getenv("OLLAMA_TEXT_MODEL", "qwen3.8:latest")

# Context Window Settings (Optimized for fast inference & zero VRAM overflow)
DEFAULT_OCR_NUM_CTX = int(os.getenv("OLLAMA_OCR_NUM_CTX", "8192"))
DEFAULT_GRADING_NUM_CTX = int(os.getenv("OLLAMA_GRADING_NUM_CTX", "4096"))
OLLAMA_GRADING_WORKERS = int(os.getenv("OLLAMA_GRADING_WORKERS", "1"))

# Server Config
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8250"))
