import uuid
import re
from typing import List, Optional, Any, Dict
from datetime import datetime
from fastapi import APIRouter, Depends, Header, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_

from ..database import get_db
from ..models import Document, LineItem
from ..schemas import DocumentResponse
from .documents import _to_document_response

router = APIRouter(prefix="/sync", tags=["sync"])


def build_user_condition(user_id: str, user_name: Optional[str] = None):
    """
    Builds a flexible filter condition to match a user's documents across Web & Mobile devices.
    Matches exact user_id, phone digits, and user name.
    """
    conditions = []
    clean_id = (user_id or "").strip()
    if clean_id:
        conditions.append(Document.owner_id == clean_id)
        conditions.append(Document.customer_name == clean_id)
        
        # Extract digits for phone numbers (e.g. 9009009000 matches +91 9009009000)
        digits = re.sub(r'\D', '', clean_id)
        if len(digits) >= 10:
            last10 = digits[-10:]
            conditions.append(Document.owner_id.like(f"%{last10}%"))
            conditions.append(Document.customer_name.like(f"%{last10}%"))

    clean_name = (user_name or "").strip()
    if clean_name and clean_name.lower() not in ["guest", "user"]:
        conditions.append(Document.owner_id == clean_name)
        conditions.append(Document.customer_name == clean_name)

    if conditions:
        return or_(*conditions)
    return Document.owner_id == clean_id


@router.get("/status")
def sync_status():
    """
    Lightweight health and sync availability check.
    """
    return {
        "status": "online",
        "service": "SnapIT Cloud Vault Sync",
        "server_time": datetime.utcnow().isoformat()
    }


@router.post("/vault")
def sync_vault(
    payload: Dict[str, Any] = Body(...),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
    db: Session = Depends(get_db)
):
    """
    Bidirectional vault synchronization between Web and Mobile clients.
    Merges local documents from phone/browser into SQLite database,
    and returns the authoritative full list of documents for this user.
    """
    user_id = (payload.get("user_id") or x_user_id or "").strip()
    user_name = (payload.get("user_name") or x_user_name or "User").strip()

    print(f"[SYNC_VAULT] user_id='{user_id}', user_name='{user_name}', incoming_docs_count={len(payload.get('documents', []))}")

    if not user_id:
        raise HTTPException(status_code=400, detail="Missing user identifier for sync")

    incoming_docs = payload.get("documents", [])

    # 1. Upsert incoming documents into SQLite
    for item in incoming_docs:
        doc_id = item.get("id")
        if not doc_id:
            continue

        existing = db.query(Document).filter(Document.id == doc_id).first()
        if existing:
            # Update metadata if needed
            if item.get("merchant_name"):
                existing.merchant_name = item.get("merchant_name")
            if item.get("total_amount") is not None:
                existing.total_amount = float(item.get("total_amount", 0))
            if item.get("invoice_date"):
                existing.invoice_date = item.get("invoice_date")
            if item.get("invoice_number"):
                existing.invoice_number = item.get("invoice_number")
            if item.get("tags"):
                existing.tags = item.get("tags")
            if not existing.owner_id:
                existing.owner_id = user_id
            db.commit()
            continue

        # If incoming doc is a local offline receipt, check if a similar one exists
        merch = (item.get("merchant_name") or "").strip()
        tot = float(item.get("total_amount") or 0)
        inv_date = item.get("invoice_date") or ""

        match = db.query(Document).filter(
            build_user_condition(user_id, user_name),
            Document.merchant_name == merch,
            Document.total_amount == tot,
            Document.invoice_date == inv_date
        ).first()

        if match:
            continue

        # Create new document record in database
        new_doc = Document(
            id=doc_id,
            owner_id=user_id,
            filename=item.get("filename") or f"{merch.lower().replace(' ', '_')}.receipt",
            storage_path="",
            file_size=item.get("file_size") or 1024,
            mime_type=item.get("mime_type") or "image/jpeg",
            thumbnail_path=None,
            document_type=item.get("document_type") or "Receipt",
            merchant_name=merch,
            merchant_address=item.get("merchant_address"),
            customer_name=user_name if user_name != "User" else user_id,
            invoice_number=item.get("invoice_number") or f"INV-{uuid.uuid4().hex[:6].upper()}",
            invoice_date=inv_date or datetime.utcnow().strftime("%Y-%m-%d"),
            currency=item.get("currency") or "INR",
            subtotal=item.get("subtotal") or tot,
            discount=item.get("discount") or 0.0,
            tax_amount=item.get("tax_amount") or 0.0,
            total_amount=tot,
            payment_status=item.get("payment_status") or "PAID",
            review_status=item.get("review_status") or "verified",
            processing_status=item.get("processing_status") or "completed",
            confidence_score=item.get("confidence_score") or 1.0,
            tags=item.get("tags") or [item.get("document_type") or "Receipt"]
        )
        db.add(new_doc)
        db.commit()
        db.refresh(new_doc)

        # Add line items if present
        line_items_data = item.get("line_items") or []
        for li in line_items_data:
            line_item = LineItem(
                id=str(uuid.uuid4()),
                document_id=new_doc.id,
                description=li.get("description") or merch,
                category=li.get("category") or "General",
                quantity=float(li.get("quantity") or 1),
                unit_price=float(li.get("unit_price") or tot),
                tax_amount=float(li.get("tax_amount") or 0),
                total=float(li.get("total") or tot),
                is_suggested_category=False
            )
            db.add(line_item)
        db.commit()

    # 2. Query ALL documents belonging to this user
    user_cond = build_user_condition(user_id, user_name)
    all_docs = db.query(Document).filter(user_cond).order_by(desc(Document.created_at)).all()

    results = [_to_document_response(d) for d in all_docs]
    print(f"[SYNC_VAULT] returning {len(results)} docs for user_id='{user_id}', docs={[d.id for d in all_docs]}")

    return {
        "status": "ok",
        "user_id": user_id,
        "synced_count": len(results),
        "documents": results
    }
