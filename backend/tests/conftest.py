"""
Test configuration: every test run gets its own SQLite database and uploads folder, so the
suite never touches backend/smartbill.db or backend/uploads, and Gemini is never called.
These environment variables must be set before app.config is imported.
"""
import os
import sys
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="snapit_test_"))
os.environ["DATABASE_URL"] = "sqlite:///" + str(_TMP / "test.db").replace("\\", "/")
os.environ["SNAPIT_UPLOAD_DIR"] = str(_TMP / "uploads")
os.environ["GEMINI_API_KEY"] = ""
os.environ["MAX_FILE_SIZE_MB"] = "1"

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
