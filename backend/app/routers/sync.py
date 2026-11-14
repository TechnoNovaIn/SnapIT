import base64
import binascii
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import desc

from ..database import get_db
from ..models import Document, LineItem
from ..config import settings
from ._common import build_user_condition, is_safe_id, safe_float, to_document_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sync", tags=["sync"])

_MAX_SYNC_ASSET_BYTES = 15 * 1024 * 1024
_DATA_URL_RE = re.compile(r"^data:(image/(?:jpeg|jpg|png|webp)|application/pdf);base64,(.+)$", re.DOTALL)
_EXT_FOR_MIME = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}


@router.get("/status")
def sync_status():
    """
    Lightweight health and sync availability check.
    """
    return {
        "status": "online",
        "service": "SnapIT Cloud Vault Sync",
        "server_time": datetime.now(timezone.utc).isoformat()
    }


def _save_data_url(data_url: str, basename: str, allowed_mimes) -> Optional[tuple[str, str, int]]:
    """
    Writes a base64 data URL to the uploads folder.
    Returns (relative_path, mime_type, size) or None when the payload is not acceptable.
    The basename must already be validated (see is_safe_id) because it becomes a file name.
    """
    if not data_url or not isinstance(data_url, str):
        return None
    m = _DATA_URL_RE.match(data_url.strip())
    if not m:
        return None
    mime, raw = m.group(1), m.group(2)
    if mime not in allowed_mimes:
        return None
    # Rough size check before decoding (base64 inflates by 4/3).
    if len(raw) * 3 // 4 > _MAX_SYNC_ASSET_BYTES:
        logger.warning("Rejected synced asset for %s: too large", basename)
        return None
    try:
        data = base64.b64decode(raw, validate=False)
    except (binascii.Error, ValueError) as e:
        logger.warning("Error decoding synced base64 asset: %s", e)
        return None
    if not data:
        return None
    target = settings.UPLOAD_DIR / f"{basename}{_EXT_FOR_MIME[mime]}"
    try:
        with open(target, "wb") as f:
            f.write(data)
    except OSError as e:
        logger.warning("Error saving synced asset: %s", e)
        return None
    try:
        rel = str(target.relative_to(settings.BASE_DIR))
    except ValueError:
        rel = str(target)
    return rel, ("image/jpeg" if mime == "image/jpg" else mime), len(data)


@router.post("/vault")
def sync_vault(
    payload: Dict[str, Any] = Body(...),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
    db: Session = Depends(get_db)
):
    """
    Bidirectional vault synchronization between Web and Mobile clients.
    Merges local documents from phone/browser into the database and returns the
    authoritative full list of documents for this user.
    """
    user_id = str(payload.get("user_id") or x_user_id or "").strip()[:255]
    user_name = str(payload.get("user_name") or x_user_name or "User").strip()[:255]

    if not user_id:
        raise HTTPException(status_code=400, detail="Missing user identifier for sync")

    incoming_docs = payload.get("documents") or []
    if not isinstance(incoming_docs, list):
        raise HTTPException(status_code=400, detail="'documents' must be a list")

    logger.info("[sync] user=%s incoming=%d", user_id, len(incoming_docs))
    user_cond = build_user_condition(user_id, user_name)
    skipped = 0

    # 1. Upsert incoming documents
    for item in incoming_docs:
        if not isinstance(item, dict):
            skipped += 1
            continue
        doc_id = str(item.get("id") or "").strip()
        if not is_safe_id(doc_id):
            skipped += 1
            continue

        thumb_data = item.get("thumbnail_url") or ""
        file_data = item.get("file_url") or ""

        existing = db.query(Document).filter(Document.id == doc_id).first()
        if existing:
            # Never let one client overwrite another user's record.
            is_owner = db.query(Document.id).filter(Document.id == doc_id, user_cond).first() is not None
            if not is_owner:
                skipped += 1
                continue

            # Only update with real, non-placeholder values
            incoming_merchant = str(item.get("merchant_name") or "").strip()
            if incoming_merchant and not any(p in incoming_merchant for p in ("Analyzing", "Needs Review", "Scanning", "Unverified", "Unreadable")):
                existing.merchant_name = incoming_merchant[:255]
            incoming_tot = safe_float(item.get("total_amount"), 0.0)
            if incoming_tot > 0:
                existing.total_amount = incoming_tot
            if item.get("invoice_date"):
                existing.invoice_date = str(item.get("invoice_date"))[:50]
            inv_no = str(item.get("invoice_number") or "").strip()
            if inv_no and not inv_no.startswith("INV-"):
                existing.invoice_number = inv_no[:100]
            if isinstance(item.get("tags"), list) and item.get("tags"):
                existing.tags = [str(t)[:50] for t in item["tags"] if t][:10]
            if not existing.owner_id:
                existing.owner_id = user_id
            if not existing.thumbnail_path and thumb_data:
                saved = _save_data_url(thumb_data, f"{doc_id}_thumb", {"image/jpeg", "image/jpg", "image/png", "image/webp"})
                if saved:
                    existing.thumbnail_path = saved[0]
            if not existing.storage_path and file_data:
                saved = _save_data_url(file_data, doc_id, set(_EXT_FOR_MIME))
                if saved:
                    existing.storage_path, existing.mime_type, existing.file_size = saved
            db.commit()
            continue

        # New record: skip if an identical receipt already exists for this user
        merch = str(item.get("merchant_name") or "").strip()[:255]
        tot = safe_float(item.get("total_amount"), 0.0)
        inv_date = str(item.get("invoice_date") or "").strip()[:50]

        match = db.query(Document.id).filter(
            user_cond,
            Document.merchant_name == merch,
            Document.total_amount == tot,
            Document.invoice_date == inv_date
        ).first()
        if match:
            continue

        saved_thumb = _save_data_url(thumb_data, f"{doc_id}_thumb", {"image/jpeg", "image/jpg", "image/png", "image/webp"}) if thumb_data else None
        saved_file = _save_data_url(file_data, doc_id, set(_EXT_FOR_MIME)) if file_data else None

        review_status = item.get("review_status") if item.get("review_status") in ("ready_for_review", "needs_review", "verified") else None
        processing_status = item.get("processing_status") if item.get("processing_status") in ("pending", "processing", "completed", "failed") else None

        new_doc = Document(
            id=doc_id,
            owner_id=user_id,
            filename=str(item.get("filename") or f"{(merch or 'receipt').lower().replace(' ', '_')}.receipt")[:255],
            storage_path=saved_file[0] if saved_file else "",
            file_size=saved_file[2] if saved_file else int(safe_float(item.get("file_size"), 0.0)),
            mime_type=saved_file[1] if saved_file else str(item.get("mime_type") or "image/jpeg")[:100],
            thumbnail_path=saved_thumb[0] if saved_thumb else None,
            document_type=str(item.get("document_type") or "Receipt")[:50],
            merchant_name=merch or None,
            merchant_address=item.get("merchant_address"),
            customer_name=user_name if user_name != "User" else user_id,
            invoice_number=(str(item.get("invoice_number"))[:100] if item.get("invoice_number") else None),
            invoice_date=inv_date or None,
            currency=str(item.get("currency") or "INR").upper()[:10],
            subtotal=safe_float(item.get("subtotal"), tot),
            discount=safe_float(item.get("discount"), 0.0),
            tax_amount=safe_float(item.get("tax_amount"), 0.0),
            total_amount=tot,
            payment_status=(str(item.get("payment_status"))[:50] if item.get("payment_status") else None),
            review_status=review_status or ("needs_review" if tot <= 0 else "ready_for_review"),
            processing_status=processing_status or "completed",
            confidence_score=min(max(safe_float(item.get("confidence_score"), 0.5), 0.0), 1.0),
            tags=[str(t)[:50] for t in (item.get("tags") or []) if t][:10] if isinstance(item.get("tags"), list) else [],
            uncertain_fields=[str(f) for f in (item.get("uncertain_fields") or []) if f] if isinstance(item.get("uncertain_fields"), list) else [],
        )
        db.add(new_doc)

        for li in item.get("line_items") or []:
            if not isinstance(li, dict):
                continue
            db.add(LineItem(
                id=str(uuid.uuid4()),
                document_id=new_doc.id,
                description=str(li.get("description") or merch or "Item")[:255],
                category=str(li.get("category") or "General")[:100],
                quantity=safe_float(li.get("quantity"), 1.0),
                unit_price=safe_float(li.get("unit_price"), tot),
                tax_amount=safe_float(li.get("tax_amount"), 0.0),
                total=safe_float(li.get("total"), tot),
                is_suggested_category=bool(li.get("is_suggested_category", False))
            ))
        db.commit()

    # 2. Return every document belonging to this user
    all_docs = db.query(Document).filter(user_cond).order_by(desc(Document.created_at)).all()
    results = [to_document_response(d) for d in all_docs]
    logger.info("[sync] user=%s returning=%d skipped=%d", user_id, len(results), skipped)

    return {
        "status": "ok",
        "user_id": user_id,
        "synced_count": len(results),
        "skipped": skipped,
        "documents": results
    }
