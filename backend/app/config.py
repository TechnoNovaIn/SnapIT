import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    try:
        return int(raw) if raw else default
    except ValueError:
        return default


def _resolve_database_url() -> str:
    raw = os.getenv("DATABASE_URL", "").strip()
    if not raw or raw in ("sqlite:///./smartbill.db", "sqlite:///smartbill.db"):
        # Absolute path so the DB is the same no matter which directory uvicorn is started from.
        db_path = str(BASE_DIR / "smartbill.db").replace("\\", "/")
        return "sqlite:///" + db_path
    if raw.startswith("postgres://"):
        return raw.replace("postgres://", "postgresql://", 1)
    return raw


class Settings:
    PROJECT_NAME: str = "SnapIT"
    VERSION: str = "1.1.0"
    API_V1_STR: str = "/api"

    # Storage
    BASE_DIR: Path = BASE_DIR
    UPLOAD_DIR: Path = Path(os.getenv("SNAPIT_UPLOAD_DIR", "").strip() or (BASE_DIR / "uploads"))

    # Database: SQLite default, or PostgreSQL if DATABASE_URL provided
    DATABASE_URL: str = _resolve_database_url()

    # AI / OCR
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "").strip()
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview").strip() or "gemini-3-flash-preview"
    DEFAULT_CURRENCY: str = os.getenv("DEFAULT_CURRENCY", "INR").strip() or "INR"

    # CORS: comma separated list of origins, "*" allows every origin (default for local/dev use)
    CORS_ORIGINS: list = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()] or ["*"]

    # File restrictions
    MAX_FILE_SIZE_MB: int = _env_int("MAX_FILE_SIZE_MB", 25)
    ALLOWED_EXTENSIONS: set = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}


settings = Settings()
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
