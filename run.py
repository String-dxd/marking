import os
import sys

# Ensure UTF-8 output encoding on Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import webbrowser
import threading
import time
import uvicorn
from app.core.config import HOST, PORT
from app.core.ollama_client import ollama_client
from tunnel_launcher import start_cloudflare_tunnel

def open_browser():
    time.sleep(1.2)
    local_host = "localhost" if HOST in ("0.0.0.0", "127.0.0.1") else HOST
    url = f"http://{local_host}:{PORT}"
    print(f"\n[AI Marker] Launching local browser dashboard at {url}...")
    webbrowser.open(url)

def main():
    if "--desktop" in sys.argv or "-d" in sys.argv:
        from tallus_desktop import main as desktop_main
        desktop_main()
        return

    enable_tunnel = "--tunnel" in sys.argv or "-t" in sys.argv or os.environ.get("ENABLE_TUNNEL") == "1"
    
    print("=" * 60)
    print("       ANTIGRAVITY AI MARKER & STUDENT FEEDBACK SYSTEM       ")
    print("=" * 60)
    
    # Check Ollama status
    print("\n[System] Checking local Ollama service...")
    health = ollama_client.check_health()
    if health.get("online"):
        models = health.get("models", [])
        print(f"[Ollama] ONLINE! Found {len(models)} local models.")
        print(f"[Ollama] Default Vision Model: {health.get('default_vision_model')}")
        print(f"[Ollama] Default Text Model:   {health.get('default_text_model')}")
    else:
        print("[Ollama] WARNING: Ollama server not detected on http://localhost:11434.")
        print("[Ollama] Please ensure Ollama is running ('ollama serve') for AI vision grading.")
        print("[Ollama] System will continue in manual review mode.")
        
    print(f"\n[Server] Starting FastAPI server:")
    print(f"  -> Local:   http://localhost:{PORT}")
    print(f"  -> Network: http://192.168.50.10:{PORT} (LAN / Wi-Fi)")
    
    tunnel_proc = None
    if enable_tunnel:
        print(f"  -> Tunnel:  Starting Cloudflare HTTPS tunnel for mobile access...")
        tunnel_proc = start_cloudflare_tunnel(PORT)
    else:
        print(f"  Tip: Run 'python run.py --tunnel' or start 'start_mobile_https.bat' for mobile HTTPS.")

    # Launch browser thread
    threading.Thread(target=open_browser, daemon=True).start()
    
    try:
        # Run Uvicorn with auto-reload enabled
        uvicorn.run("app.main:app", host=HOST, port=PORT, reload=True)
    finally:
        if tunnel_proc:
            try:
                tunnel_proc.terminate()
            except Exception:
                pass

if __name__ == "__main__":
    main()
