import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

class Settings:
    PROJECT_NAME: str = "SnapIT"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    
    # Storage
    BASE_DIR: Path = BASE_DIR
    UPLOAD_DIR: Path = BASE_DIR / "uploads"
    STATIC_DIR: Path = BASE_DIR / "static"
    
    # Database: SQLite default, or PostgreSQL if DATABASE_URL provided
    _raw_db = os.getenv("DATABASE_URL", "").strip()
    if not _raw_db or _raw_db == "sqlite:///./smartbill.db" or _raw_db == "sqlite:///smartbill.db":
        DATABASE_URL: str = f"sqlite:///{str(BASE_DIR / 'smartbill.db').replace('\\', '/')}"
    elif _raw_db.startswith("postgres://"):
        DATABASE_URL: str = _raw_db.replace("postgres://", "postgresql://", 1)
    else:
        DATABASE_URL: str = _raw_db
    
    # AI / OCR
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    DEFAULT_CURRENCY: str = os.getenv("DEFAULT_CURRENCY", "INR")
    
    # File restrictions
    MAX_FILE_SIZE_MB: int = 25
    ALLOWED_EXTENSIONS: set = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}

settings = Settings()
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
