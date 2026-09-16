import os
import sys

# Ensure UTF-8 output encoding on Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import re
import time
import subprocess
import threading
import qrcode
import io

def find_cloudflared_path():
    import shutil
    p = shutil.which("cloudflared")
    if p:
        return p
    candidates = [
        r"C:\Program Files (x86)\cloudflared\cloudflared.exe",
        r"C:\Program Files\cloudflared\cloudflared.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe")
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return None

def start_cloudflare_tunnel(port=8250):
    cf_path = find_cloudflared_path()
    if not cf_path:
        print("[Cloudflare] ERROR: cloudflared.exe not found on system.")
        return None

    cmd = [cf_path, "tunnel", "--url", f"http://localhost:{port}"]
    print(f"[Cloudflare] Launching HTTPS tunnel via {cf_path}...")
    
    process = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        encoding="utf-8",
        errors="replace"
    )
    
    tunnel_url = None
    url_pattern = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")
    
    def monitor_output():
        nonlocal tunnel_url
        for line in process.stdout:
            match = url_pattern.search(line)
            if match and not tunnel_url:
                tunnel_url = match.group(0)
                # Also save to data/tunnel_url.txt
                try:
                    os.makedirs("data", exist_ok=True)
                    with open("data/tunnel_url.txt", "w", encoding="utf-8") as f_out:
                        f_out.write(tunnel_url)
                except Exception:
                    pass

                print("\n" + "=" * 64)
                print(f"  [MOBILE HTTPS ACCESS READY]")
                print(f"  Public HTTPS URL: {tunnel_url}")
                print("=" * 64)
                print("\nScan this QR code with your mobile camera to open:\n")
                
                try:
                    qr = qrcode.QRCode()
                    qr.add_data(tunnel_url)
                    f = io.StringIO()
                    qr.print_ascii(out=f, invert=True)
                    print(f.getvalue())
                except Exception as e:
                    print(f"(QR code generation error: {e})")
                    
                print(f"  -> HTTPS URL: {tunnel_url}")
                print(f"  -> Local LAN:  http://192.168.50.10:{port}")
                print("=" * 64 + "\n")

    t = threading.Thread(target=monitor_output, daemon=True)
    t.start()
    return process

if __name__ == "__main__":
    p = start_cloudflare_tunnel(8250)
    if p:
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            p.terminate()
