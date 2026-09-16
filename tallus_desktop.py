"""
Tallus Desktop Application Wrapper
Runs FastAPI server & background tasks silently, embedding the UI in a native WebView2 desktop window.
"""

import os
import sys
import time
import socket
import threading
import ctypes
import urllib.request
from pathlib import Path

# Ensure AppUserModelID is set so Windows Taskbar uses the Tallus icon and groups windows properly
if sys.platform == "win32":
    try:
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("Tallus.AIMarker.App")
    except Exception:
        pass

    # Ensure console window is hidden if one was allocated
    try:
        hwnd = ctypes.windll.kernel32.GetConsoleWindow()
        if hwnd:
            ctypes.windll.user32.ShowWindow(hwnd, 0)  # SW_HIDE
    except Exception:
        pass

# Ensure logs go to data/desktop.log and optionally to console
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

class LogTee:
    def __init__(self, stream, log_path: Path):
        self.stream = stream
        try:
            self.file = open(log_path, "a", encoding="utf-8", errors="replace")
        except Exception:
            self.file = None

    def write(self, data):
        if self.stream:
            try:
                self.stream.write(data)
                self.stream.flush()
            except Exception:
                pass
        if self.file:
            try:
                self.file.write(data)
                self.file.flush()
            except Exception:
                pass

    def flush(self):
        if self.stream:
            try:
                self.stream.flush()
            except Exception:
                pass
        if self.file:
            try:
                self.file.flush()
            except Exception:
                pass

    def isatty(self):
        if self.stream and hasattr(self.stream, "isatty"):
            try:
                return self.stream.isatty()
            except Exception:
                return False
        return False

    def __getattr__(self, name):
        if self.stream and hasattr(self.stream, name):
            return getattr(self.stream, name)
        raise AttributeError(f"'LogTee' object has no attribute '{name}'")

desktop_log_path = DATA_DIR / "desktop.log"
sys.stdout = LogTee(sys.stdout, desktop_log_path)
sys.stderr = LogTee(sys.stderr, desktop_log_path)

import webview
import uvicorn
from app.core.config import HOST, PORT
from app.core.ollama_client import ollama_client
from tunnel_launcher import start_cloudflare_tunnel
import subprocess


def is_server_running(port: int) -> bool:
    """Check if a healthy Tallus server is already running on the given port."""
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/api/health")
        with urllib.request.urlopen(req, timeout=0.8) as resp:
            return resp.status == 200
    except Exception:
        return False


def wait_for_server(host_ip: str, port: int, timeout: float = 12.0) -> bool:
    """Poll the server port until it becomes responsive or timeout expires."""
    target_host = "127.0.0.1" if host_ip in ("0.0.0.0", "localhost") else host_ip
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            with socket.create_connection((target_host, port), timeout=0.3):
                return True
        except OSError:
            time.sleep(0.1)
    return False


def focus_existing_window() -> bool:
    """If an existing Tallus desktop window is already open, bring it to the front and return True."""
    if sys.platform != "win32":
        return False
    try:
        hwnd = ctypes.windll.user32.FindWindowW(None, "Tallus - Local AI Marking & Feedback")
        if hwnd:
            ctypes.windll.user32.ShowWindow(hwnd, 9)  # 9 = SW_RESTORE
            ctypes.windll.user32.SetForegroundWindow(hwnd)
            return True
    except Exception:
        pass
    return False


def cleanup_zombie_webview_processes():
    """Terminate orphaned msedgewebview2 processes that hold locks on the Tallus webview cache."""
    if sys.platform != "win32":
        return
    try:
        cmd = (
            "Get-CimInstance Win32_Process -Filter \"Name = 'msedgewebview2.exe'\" | "
            "Where-Object { $_.CommandLine -like '*webview_cache*' } | "
            "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
        )
        subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", cmd],
            capture_output=True,
            timeout=4
        )
    except Exception:
        pass


def get_usable_cache_dir() -> str:
    """Ensure webview cache is clean and writable, returning a safe cache folder."""
    primary = DATA_DIR / "webview_cache"
    primary.mkdir(parents=True, exist_ok=True)
    cleanup_zombie_webview_processes()
    time.sleep(0.2)
    
    # Test file lockability
    test_file = primary / f".lock_check_{os.getpid()}"
    try:
        test_file.write_text("ok", encoding="utf-8")
        if test_file.exists():
            test_file.unlink()
        return str(primary)
    except Exception:
        fallback = DATA_DIR / f"webview_cache_session_{os.getpid()}"
        fallback.mkdir(parents=True, exist_ok=True)
        return str(fallback)


def main():
    # 0. Check if an existing Tallus window is already running
    if focus_existing_window():
        print("[Desktop] Existing Tallus window detected. Restored to foreground.")
        return

    # Handle headless server-only mode
    if "--server-only" in sys.argv or "--no-gui" in sys.argv or "--headless" in sys.argv:
        print(f"[Server] Running Tallus server on http://127.0.0.1:{PORT} without desktop UI...")
        if not is_server_running(PORT):
            uvicorn.run("app.main:app", host=HOST, port=PORT, log_level="warning")
        else:
            print(f"[Server] Tallus server already active on port {PORT}.")
        return

    enable_tunnel = (
        "--tunnel" in sys.argv
        or "-t" in sys.argv
        or os.environ.get("ENABLE_TUNNEL") == "1"
    )

    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"\n[{timestamp}] ============================================================")
    print("       TALLUS - NATIVE DESKTOP APPLICATION WRAPPER           ")
    print("============================================================")

    # 1. Check local Ollama health in the background
    def check_ollama_bg():
        try:
            health = ollama_client.check_health()
            if health.get("online"):
                print(f"[Ollama] ONLINE! Found {len(health.get('models', []))} local models.")
            else:
                print("[Ollama] Warning: Ollama not reachable on http://localhost:11434")
        except Exception as e:
            print(f"[Ollama] Check error: {e}")

    threading.Thread(target=check_ollama_bg, daemon=True).start()

    # 2. Check if a server is already active or spawn our own
    server = None
    started_our_own_server = False

    if is_server_running(PORT):
        print(f"[Server] Existing Tallus server detected on port {PORT}. Attaching UI...")
    else:
        print(f"[Server] Starting background Uvicorn server on http://127.0.0.1:{PORT}...")
        server_config = uvicorn.Config(
            "app.main:app",
            host=HOST,
            port=PORT,
            log_level="warning",
            access_log=False,
        )
        server = uvicorn.Server(server_config)
        server_thread = threading.Thread(target=server.run, daemon=True)
        server_thread.start()
        started_our_own_server = True

        # Wait until the local server is listening
        ready = wait_for_server("127.0.0.1", PORT, timeout=10.0)
        if not ready:
            print("[Server] WARNING: Server took longer than expected to bind.")

    # 3. Optional Cloudflare mobile tunnel
    tunnel_proc = None
    if enable_tunnel:
        print("[Cloudflare] Launching mobile tunnel...")
        tunnel_proc = start_cloudflare_tunnel(PORT)

    # 4. Determine application icon path and cache directory
    icon_path = BASE_DIR / "tallus.ico"
    str_icon_path = str(icon_path) if icon_path.exists() else None
    cache_dir = get_usable_cache_dir()

    # 5. Create native WebView2 desktop window
    app_url = f"http://127.0.0.1:{PORT}"
    window = webview.create_window(
        title="Tallus - Local AI Marking & Feedback",
        url=app_url,
        width=1366,
        height=860,
        min_size=(1000, 650),
        text_select=True,
        zoomable=True,
        confirm_close=False,
        background_color="#0b0f19"
    )

    def on_closed():
        """Clean shutdown handler triggered when the user closes the window."""
        print("[Desktop] Window closed by user. Cleaning up background servers...")
        if started_our_own_server and server:
            server.should_exit = True
        if tunnel_proc:
            try:
                tunnel_proc.terminate()
            except Exception:
                pass
        cleanup_zombie_webview_processes()

    def on_shown():
        """Ensure the native window has the Tallus icon and taskbar properties applied."""
        if sys.platform != "win32":
            return
        try:
            native_form = window.native
            if native_form and hasattr(native_form, "Handle") and str_icon_path:
                hwnd = native_form.Handle.ToInt64()
                user32 = ctypes.windll.user32
                WM_SETICON = 0x0080
                ICON_SMALL = 0
                ICON_BIG = 1
                IMAGE_ICON = 1
                LR_LOADFROMFILE = 0x0010

                hicon_big = user32.LoadImageW(None, str_icon_path, IMAGE_ICON, 48, 48, LR_LOADFROMFILE)
                hicon_small = user32.LoadImageW(None, str_icon_path, IMAGE_ICON, 16, 16, LR_LOADFROMFILE)
                if hicon_big:
                    user32.SendMessageW(hwnd, WM_SETICON, ICON_BIG, hicon_big)
                if hicon_small:
                    user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, hicon_small)
        except Exception as e:
            print(f"[Desktop] on_shown icon setup error: {e}")

    window.events.closed += on_closed
    window.events.shown += on_shown

    # 6. Start desktop window (blocks until window is closed)
    try:
        webview.start(
            icon=str_icon_path,
            gui="edgechromium",
            storage_path=cache_dir,
            private_mode=False,
            debug=False
        )
    except Exception as e:
        print(f"[Desktop] WebView start error: {e}")
    finally:
        # Final cleanup
        print("[Desktop] Exiting application and shutting down server...")
        if started_our_own_server and server:
            server.should_exit = True
        if tunnel_proc:
            try:
                tunnel_proc.terminate()
            except Exception:
                pass
        cleanup_zombie_webview_processes()
        time.sleep(0.2)
        os._exit(0)


if __name__ == "__main__":
    main()
