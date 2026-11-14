"""
SnapIT - Application Launcher
Starts the FastAPI backend (port 8000) and the Vite frontend (port 5173), optionally opens a
Cloudflare quick tunnel for phones on mobile data, and opens the app in your browser.
"""

import os
import re
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"


def lan_ip() -> str:
    """Best-effort LAN address of this machine (no packets are sent)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def watch_tunnel_output(proc: subprocess.Popen) -> None:
    """Prints the public URL once cloudflared announces it."""
    url_re = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")
    for line in iter(proc.stderr.readline, b""):
        m = url_re.search(line.decode("utf-8", "ignore"))
        if m:
            print(f"       -> Cloud Sync:    {m.group(0)}  (enter this as the Backend API URL in the Android app)")
            break


def main():
    print("=" * 60)
    print("   SnapIT - Smart Document & Receipt Clipper (AI Powered)   ")
    print("=" * 60)

    port = os.getenv("PORT", "8000")
    host = os.getenv("HOST", "0.0.0.0")

    print(f"\n[1/3] Starting Backend API (Uvicorn on {host}:{port})...")
    backend_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", host, "--port", port],
        cwd=str(BACKEND_DIR)
    )

    tunnel_proc = None
    cloudflared_bin = BACKEND_DIR / "tools" / "cloudflared.exe"
    if cloudflared_bin.exists() and os.getenv("SNAPIT_TUNNEL", "1") != "0":
        print("[2/3] Starting Cloudflare quick tunnel for mobile sync (set SNAPIT_TUNNEL=0 to skip)...")
        tunnel_proc = subprocess.Popen(
            [str(cloudflared_bin), "tunnel", "--url", f"http://127.0.0.1:{port}"],
            cwd=str(BACKEND_DIR),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
        )
        threading.Thread(target=watch_tunnel_output, args=(tunnel_proc,), daemon=True).start()
    else:
        print("[2/3] Tunnel skipped (backend/tools/cloudflared.exe not found or SNAPIT_TUNNEL=0)")

    print("[3/3] Starting Frontend UI (Vite on port 5173)...")
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    frontend_proc = subprocess.Popen(
        [npm_cmd, "run", "dev"],
        cwd=str(FRONTEND_DIR),
        shell=(os.name == "nt")
    )

    time.sleep(2.5)
    app_url = "http://localhost:5173"
    print("\nApplication ready!")
    print(f"       -> Web App:       {app_url}")
    print(f"       -> Local Network: http://{lan_ip()}:{port}  (Android on the same Wi-Fi: use this as the Backend API URL)")
    print(f"       -> Backend Docs:  http://127.0.0.1:{port}/docs")
    print("\nPress Ctrl+C to shut down all servers.\n")

    try:
        webbrowser.open(app_url)
        while True:
            time.sleep(1)
            if backend_proc.poll() is not None:
                print("Backend server stopped.")
                break
            if frontend_proc.poll() is not None:
                print("Frontend server stopped.")
                break
    except KeyboardInterrupt:
        print("\nShutting down SnapIT...")
    finally:
        for proc in (tunnel_proc, backend_proc, frontend_proc):
            if proc is None:
                continue
            try:
                proc.terminate()
            except Exception:
                pass
        print("Servers stopped cleanly.")


if __name__ == "__main__":
    main()
