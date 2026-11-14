from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import AppSetting
from ..schemas import SettingsSchema, SettingsUpdate
from ..config import settings
from ..services.ocr_service import OCRService

router = APIRouter(prefix="/settings", tags=["settings"])


def _get_value(db: Session, key: str) -> str:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    return (row.value or "").strip() if row and row.value else ""


def _set_value(db: Session, key: str, value: str) -> None:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if not row:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value


def _mask(raw_key: str) -> str:
    if not raw_key:
        return ""
    if len(raw_key) > 8:
        return f"{raw_key[:4]}...{raw_key[-4:]}"
    return "***"


@router.get("", response_model=SettingsSchema)
def get_settings(db: Session = Depends(get_db)):
    raw_key = _get_value(db, "gemini_api_key") or settings.GEMINI_API_KEY
    return SettingsSchema(
        gemini_api_key=_mask(raw_key),
        gemini_model=_get_value(db, "gemini_model") or settings.GEMINI_MODEL,
        default_currency=_get_value(db, "default_currency") or settings.DEFAULT_CURRENCY,
        has_api_key=OCRService.looks_like_google_key(raw_key),
        ocr_engine=OCRService.describe_engine(raw_key),
    )


@router.post("", response_model=SettingsSchema)
def save_settings(payload: SettingsUpdate, db: Session = Depends(get_db)):
    key = (payload.gemini_api_key or "").strip()
    # Ignore the masked value the UI echoes back ("AIza...abcd" / "***") so a save never clobbers the real key.
    if key and not key.startswith("***") and "..." not in key:
        _set_value(db, "gemini_api_key", key)

    if payload.gemini_model is not None and payload.gemini_model.strip():
        _set_value(db, "gemini_model", payload.gemini_model.strip())

    if payload.default_currency is not None and payload.default_currency.strip():
        _set_value(db, "default_currency", payload.default_currency.strip().upper()[:10])

    db.commit()
    return get_settings(db)
