from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import AppSetting
from ..schemas import SettingsSchema
from ..config import settings
from ..services.ocr_service import OCRService

router = APIRouter(prefix="/settings", tags=["settings"])

@router.get("", response_model=SettingsSchema)
def get_settings(db: Session = Depends(get_db)):
    db_key = db.query(AppSetting).filter(AppSetting.key == "gemini_api_key").first()
    db_model = db.query(AppSetting).filter(AppSetting.key == "gemini_model").first()
    db_curr = db.query(AppSetting).filter(AppSetting.key == "default_currency").first()

    raw_key = (db_key.value if db_key and db_key.value else settings.GEMINI_API_KEY) or ""
    # Mask key for privacy
    masked_key = f"{raw_key[:4]}...{raw_key[-4:]}" if len(raw_key) > 8 else ("***" if raw_key else "")

    return SettingsSchema(
        gemini_api_key=masked_key,
        gemini_model=db_model.value if db_model and db_model.value else settings.GEMINI_MODEL,
        default_currency=db_curr.value if db_curr and db_curr.value else settings.DEFAULT_CURRENCY,
        has_api_key=bool(raw_key)
    )

@router.post("", response_model=SettingsSchema)
def save_settings(payload: SettingsSchema, db: Session = Depends(get_db)):
    if payload.gemini_api_key and not payload.gemini_api_key.startswith("***") and not "..." in payload.gemini_api_key:
        db_key = db.query(AppSetting).filter(AppSetting.key == "gemini_api_key").first()
        if not db_key:
            db_key = AppSetting(key="gemini_api_key", value=payload.gemini_api_key.strip())
            db.add(db_key)
        else:
            db_key.value = payload.gemini_api_key.strip()

    if payload.gemini_model:
        db_model = db.query(AppSetting).filter(AppSetting.key == "gemini_model").first()
        if not db_model:
            db_model = AppSetting(key="gemini_model", value=payload.gemini_model.strip())
            db.add(db_model)
        else:
            db_model.value = payload.gemini_model.strip()

    if payload.default_currency:
        db_curr = db.query(AppSetting).filter(AppSetting.key == "default_currency").first()
        if not db_curr:
            db_curr = AppSetting(key="default_currency", value=payload.default_currency.strip())
            db.add(db_curr)
        else:
            db_curr.value = payload.default_currency.strip()

    db.commit()
    return get_settings(db)
