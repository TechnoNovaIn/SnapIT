"""Helpers shared by the document, sync and export routers."""
import re
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..models import Document
from ..schemas import DocumentResponse

# Document ids are used to build file names on disk, so they must be plain tokens.
_SAFE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")


def is_safe_id(value: Optional[str]) -> bool:
    return bool(value) and bool(_SAFE_ID_RE.match(value))


def safe_float(value, default: float = 0.0) -> float:
    """Coerces numbers that may arrive as strings like '1,250.00' or '₹ 550/-'."""
    if value is None or isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = re.sub(r"[^\d.\-]", "", str(value))
    if cleaned in ("", "-", ".", "-."):
        return default
    try:
        return float(cleaned)
    except ValueError:
        return default


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def build_user_condition(user_id: str, user_name: Optional[str] = None):
    """
    Builds a flexible filter condition to match a user's documents across Web & Mobile devices.
    Matches exact user_id, phone digits, user name, or unassigned documents.
    NOTE: identity is asserted by the client (X-User-Id header); there is no authentication.
    """
    conditions = [Document.owner_id.is_(None)]
    clean_id = (user_id or "").strip()
    if clean_id:
        conditions.append(Document.owner_id == clean_id)
        conditions.append(Document.customer_name == clean_id)

        # Phone numbers: 9009009000 matches "+91 9009009000"
        digits = re.sub(r"\D", "", clean_id)
        if len(digits) >= 10:
            last10 = digits[-10:]
            conditions.append(Document.owner_id.like(f"%{last10}%"))
            conditions.append(Document.customer_name.like(f"%{last10}%"))

    clean_name = (user_name or "").strip()
    if clean_name and clean_name.lower() not in ("guest", "user"):
        conditions.append(Document.owner_id == _escape_like(clean_name))
        conditions.append(Document.customer_name == clean_name)

    return or_(*conditions)


def get_accessible_document(
    db: Session,
    doc_id: str,
    x_user_id: Optional[str],
    x_user_name: Optional[str],
    query_user_id: Optional[str] = None,
) -> Document:
    """
    Loads a document by id. When the client identifies itself (X-User-Id header, or the
    user_id query parameter for plain download links), documents that belong to a different
    user are reported as not found, mirroring the list endpoint's scoping.
    """
    user_id = (x_user_id or query_user_id or "").strip()
    query = db.query(Document).filter(Document.id == doc_id)
    if user_id:
        query = query.filter(build_user_condition(user_id, x_user_name))
    doc = query.first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


def to_document_response(doc: Document) -> DocumentResponse:
    thumb_url = f"/api/documents/{doc.id}/thumbnail" if doc.thumbnail_path else None
    file_url = f"/api/documents/{doc.id}/file" if doc.storage_path else ""
    return DocumentResponse(
        id=doc.id,
        filename=doc.filename,
        file_size=doc.file_size or 0,
        mime_type=doc.mime_type,
        thumbnail_url=thumb_url,
        file_url=file_url,
        document_type=doc.document_type or "Receipt",
        merchant_name=doc.merchant_name,
        merchant_address=doc.merchant_address,
        customer_name=doc.customer_name,
        invoice_number=doc.invoice_number,
        invoice_date=doc.invoice_date,
        due_date=doc.due_date,
        tax_id=doc.tax_id,
        currency=doc.currency or "INR",
        subtotal=doc.subtotal,
        discount=doc.discount or 0.0,
        tax_amount=doc.tax_amount,
        total_amount=doc.total_amount,
        payment_status=doc.payment_status,
        review_status=doc.review_status or "ready_for_review",
        processing_status=doc.processing_status or "pending",
        error_message=doc.error_message,
        confidence_score=doc.confidence_score if doc.confidence_score is not None else 0.9,
        tags=doc.tags,
        uncertain_fields=doc.uncertain_fields,
        line_items=doc.line_items,
        share_token=doc.share_token,
        created_at=doc.created_at,
        updated_at=doc.updated_at
    )
