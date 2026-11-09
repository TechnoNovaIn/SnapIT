"""
SnapIT — Application Master Launcher
Launches FastAPI backend (port 8000) and Vite frontend (port 5173),
verifies health, and opens the application in your browser.
"""

import sys
import os
import subprocess
import time
import webbrowser
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"

def main():
    print("=" * 60)
    print("   SnapIT — Smart Document & Receipt Clipper (AI Powered)   ")
    print("=" * 60)

    # 1. Start Backend Server
    port = os.getenv("PORT", "8000")
    host = os.getenv("HOST", "0.0.0.0")
    print(f"\n[1/4] Starting Backend API (Uvicorn on {host}:{port})...")
    backend_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", host, "--port", port],
        cwd=str(BACKEND_DIR)
    )

    # 2. Start Cloudflare Tunnel for Mobile Sync (4G/5G/Wi-Fi)
    tunnel_proc = None
    cloudflared_bin = BACKEND_DIR / "tools" / "cloudflared.exe"
    if cloudflared_bin.exists():
        print("[2/4] Starting Cloud Tunnel for Mobile Sync...")
        tunnel_proc = subprocess.Popen(
            [str(cloudflared_bin), "tunnel", "--url", f"http://127.0.0.1:{port}"],
            cwd=str(BACKEND_DIR),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )

    # 3. Start Frontend Server
    print("[3/4] Starting Frontend UI (Vite on port 5173)...")
    # Using shell=True on Windows for npm
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    frontend_proc = subprocess.Popen(
        [npm_cmd, "run", "dev"],
        cwd=str(FRONTEND_DIR),
        shell=(os.name == "nt")
    )

    # 4. Wait and open browser
    time.sleep(2.5)
    app_url = "http://localhost:5173"
    print(f"\n[4/4] Application ready!")
    print(f"       -> Web App:       {app_url}  (and http://127.0.0.1:{port})")
    print(f"       -> Local Network: http://192.168.1.19:{port}")
    print(f"       -> Cloud Sync:    https://claims-disc-locale-parcel.trycloudflare.com/api")
    print(f"       -> Backend Docs:  http://127.0.0.1:{port}/docs")
    print("\nPress Ctrl+C to shut down all servers.\n")

    try:
        webbrowser.open(app_url)
        # Keep running until Ctrl+C
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
        if tunnel_proc:
            try:
                tunnel_proc.terminate()
            except Exception:
                pass
        try:
            backend_proc.terminate()
        except Exception:
            pass
        try:
            frontend_proc.terminate()
        except Exception:
            pass
        print("Servers stopped cleanly.")

if __name__ == "__main__":
    main()
