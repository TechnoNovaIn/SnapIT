import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Header
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc

from ..database import get_db
from ..config import settings
from ..models import Document, LineItem, AppSetting
from ..schemas import DocumentResponse, DocumentListItem, DocumentUpdate, ManualExpenseCreate
from ..services.storage_service import StorageService, FileTooLargeError, InvalidFileContentError
from ..services.ocr_service import OCRService
from ._common import (
    build_user_condition,
    get_accessible_document,
    safe_float,
    to_document_response,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])

# Kept for the sync router and tests that import the old private name.
_to_document_response = to_document_response

_MIME_FOR_EXT = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
}

PLACEHOLDER_MERCHANT = "Unreadable Merchant (Needs Review)"


def _default_currency(db: Session) -> str:
    row = db.query(AppSetting).filter(AppSetting.key == "default_currency").first()
    return (row.value.strip().upper() if row and row.value else settings.DEFAULT_CURRENCY) or "INR"


@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    file: UploadFile = File(...),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
    db: Session = Depends(get_db)
):
    """
    Uploads a document securely without starting processing until user clicks 'Read Document'.
    """
    original_name = (file.filename or "").strip()
    if not original_name:
        raise HTTPException(status_code=400, detail="Uploaded file has no filename")
    # Keep only the final path component; browsers may send a full path on some platforms.
    original_name = Path(original_name.replace("\\", "/")).name[:255]

    ext = Path(original_name).suffix.lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext or 'none'}'. Supported formats: JPG, JPEG, PNG, WebP, PDF"
        )

    doc_id = str(uuid.uuid4())
    try:
        storage_path, file_size, thumb_path = StorageService.save_upload_file(file.file, original_name, doc_id)
    except FileTooLargeError as exc:
        raise HTTPException(status_code=413, detail=str(exc))
    except InvalidFileContentError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    doc = Document(
        id=doc_id,
        owner_id=(x_user_id or x_user_name or "").strip() or None,
        filename=original_name,
        storage_path=storage_path,
        file_size=file_size,
        mime_type=_MIME_FOR_EXT.get(ext, file.content_type or "application/octet-stream"),
        thumbnail_path=thumb_path,
        customer_name=(x_user_name or x_user_id or "").strip() or None,
        processing_status="pending",
        review_status="ready_for_review",
        currency=_default_currency(db)
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    return to_document_response(doc)


@router.post("/manual", response_model=DocumentResponse)
def create_manual_expense(
    data: ManualExpenseCreate,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
    db: Session = Depends(get_db)
):
    """
    Creates a manual expense receipt directly without file upload.
    """
    doc_id = str(uuid.uuid4())
    today_str = datetime.now().strftime("%Y-%m-%d")
    # Manual entries have no source document, so a reference number is generated and clearly prefixed.
    inv_num = (data.invoice_number or "").strip() or f"EXP-{uuid.uuid4().hex[:6].upper()}"
    merchant = data.merchant_name.strip()
    category = (data.category or "Others").strip() or "Others"

    doc = Document(
        id=doc_id,
        owner_id=(x_user_id or x_user_name or "").strip() or None,
        filename=f"{merchant}.manual",
        storage_path="",
        file_size=0,
        mime_type="text/plain",
        document_type="Receipt",
        merchant_name=merchant,
        customer_name=(x_user_name or x_user_id or "").strip() or None,
        invoice_number=inv_num,
        invoice_date=(data.invoice_date or "").strip() or today_str,
        currency=_default_currency(db),
        total_amount=data.total_amount,
        subtotal=data.total_amount,
        tax_amount=0.0,
        discount=0.0,
        payment_status="Paid",
        processing_status="completed",
        review_status="verified",
        confidence_score=1.0,
        tags=[category, "Manual Entry"],
        uncertain_fields=[]
    )
    db.add(doc)

    item = LineItem(
        id=str(uuid.uuid4()),
        document_id=doc.id,
        description=f"{category} Expense",
        category=category,
        quantity=1.0,
        unit_price=data.total_amount,
        tax_amount=0.0,
        total=data.total_amount,
        is_suggested_category=False
    )
    db.add(item)
    db.commit()
    db.refresh(doc)
    return to_document_response(doc)


# Sync endpoint on purpose: OCR / Gemini calls are blocking, so FastAPI runs this in its
# threadpool instead of stalling the event loop for every other request while a document is read.
@router.post("/{doc_id}/process", response_model=DocumentResponse)
def process_document(
    doc_id: str,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
    db: Session = Depends(get_db)
):
    """
    Processes the uploaded document: runs OCR / Gemini AI extraction, validates data, and saves.
    """
    doc = get_accessible_document(db, doc_id, x_user_id, x_user_name)

    if not doc.storage_path:
        raise HTTPException(status_code=400, detail="This entry has no source document to process")

    abs_path = StorageService.get_absolute_path(doc.storage_path)
    if not abs_path.is_file():
        doc.processing_status = "failed"
        doc.error_message = "Document file not found on disk"
        db.commit()
        raise HTTPException(status_code=404, detail="Original document file not found")

    try:
        doc.processing_status = "processing"
        doc.error_message = None
        db.commit()

        # Perform AI Extraction
        extraction = OCRService.extract_document(abs_path, doc.mime_type, original_filename=doc.filename)

        # Update document fields
        doc.document_type = (extraction.get("document_type") or "Receipt")[:50]
        merchant = (extraction.get("merchant_name") or "").strip()
        doc.merchant_name = merchant[:255] if merchant else PLACEHOLDER_MERCHANT
        doc.merchant_address = extraction.get("merchant_address")
        if extraction.get("customer_name"):
            doc.customer_name = str(extraction.get("customer_name"))[:255]
        doc.invoice_number = (str(extraction.get("invoice_number"))[:100] if extraction.get("invoice_number") else None)
        doc.invoice_date = (str(extraction.get("invoice_date"))[:50] if extraction.get("invoice_date") else None)
        doc.due_date = (str(extraction.get("due_date"))[:50] if extraction.get("due_date") else None)
        doc.tax_id = (str(extraction.get("tax_id"))[:100] if extraction.get("tax_id") else None)
        doc.currency = (str(extraction.get("currency") or _default_currency(db)).upper())[:10]
        doc.subtotal = extraction.get("subtotal")
        doc.discount = extraction.get("discount") or 0.0
        doc.tax_amount = extraction.get("tax_amount")
        doc.total_amount = extraction.get("total_amount")
        doc.payment_status = (str(extraction.get("payment_status"))[:50] if extraction.get("payment_status") else "Pending")
        confidence = safe_float(extraction.get("confidence_score"), 0.85)
        doc.confidence_score = min(max(confidence, 0.0), 1.0)
        doc.raw_text = extraction.get("raw_text")
        doc.tags = [str(t)[:50] for t in (extraction.get("tags") or []) if t][:10]
        uncertain = [str(f) for f in (extraction.get("uncertain_fields") or []) if f]
        if not merchant and "merchant_name" not in uncertain:
            uncertain.append("merchant_name")
        doc.uncertain_fields = uncertain

        # Remove previous line items if re-processing
        db.query(LineItem).filter(LineItem.document_id == doc.id).delete(synchronize_session=False)

        # Add new line items
        for item_data in extraction.get("line_items") or []:
            if not isinstance(item_data, dict):
                continue
            description = str(item_data.get("description") or "Item").strip()[:255] or "Item"
            item = LineItem(
                id=str(uuid.uuid4()),
                document_id=doc.id,
                description=description,
                category=str(item_data.get("category") or "General")[:100],
                quantity=safe_float(item_data.get("quantity"), 1.0),
                unit_price=safe_float(item_data.get("unit_price"), 0.0),
                tax_amount=safe_float(item_data.get("tax_amount"), 0.0),
                total=safe_float(item_data.get("total"), 0.0),
                is_suggested_category=bool(item_data.get("is_suggested_category", True))
            )
            db.add(item)

        doc.processing_status = "completed"
        needs_review = bool(doc.uncertain_fields) or not doc.total_amount or not merchant
        doc.review_status = "needs_review" if needs_review else "ready_for_review"
        doc.error_message = None
        db.commit()
        db.refresh(doc)
        return to_document_response(doc)

    except Exception as e:
        logger.exception("Extraction failed for document %s", doc_id)
        db.rollback()
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if doc:
            doc.processing_status = "failed"
            doc.error_message = f"Extraction error: {e}"
            db.commit()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process document: {e}"
        )


@router.get("", response_model=List[DocumentListItem])
def list_documents(
    search: Optional[str] = Query(None, max_length=200),
    document_type: Optional[str] = Query(None, max_length=50),
    status: Optional[str] = Query(None, max_length=50),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
    db: Session = Depends(get_db)
):
    query = db.query(Document).order_by(desc(Document.created_at))

    if x_user_id and x_user_id.strip():
        query = query.filter(build_user_condition(x_user_id, x_user_name))

    if search and search.strip():
        s = f"%{search.strip()}%"
        query = query.filter((Document.merchant_name.ilike(s)) | (Document.invoice_number.ilike(s)) | (Document.filename.ilike(s)))
    if document_type and document_type != "All":
        query = query.filter(Document.document_type == document_type)
    if status and status != "All":
        query = query.filter((Document.review_status == status) | (Document.processing_status == status))

    docs = query.all()
    results = []
    for d in docs:
        thumb_url = f"/api/documents/{d.id}/thumbnail" if d.thumbnail_path else None
        results.append(DocumentListItem(
            id=d.id,
            filename=d.filename,
            file_size=d.file_size or 0,
            mime_type=d.mime_type,
            thumbnail_url=thumb_url,
            document_type=d.document_type or "Receipt",
            merchant_name=d.merchant_name,
            invoice_number=d.invoice_number,
            invoice_date=d.invoice_date,
            currency=d.currency or "INR",
            total_amount=d.total_amount,
            line_items_count=len(d.line_items),
            processing_status=d.processing_status or "pending",
            review_status=d.review_status or "ready_for_review",
            created_at=d.created_at
        ))
    return results


@router.get("/shared/{token}", response_model=DocumentResponse)
def get_shared_document(token: str, db: Session = Depends(get_db)):
    """Read-only access to a document through its share token (no user scoping on purpose)."""
    doc = db.query(Document).filter(Document.share_token == token).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Invalid share token or document access expired")
    return to_document_response(doc)


@router.delete("/all")
def delete_all_documents(
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
    db: Session = Depends(get_db)
):
    """
    Deletes the calling user's documents for a fresh start. Refuses to run without a user id
    so a stray request cannot wipe every user's data.
    """
    if not x_user_id or not x_user_id.strip():
        raise HTTPException(status_code=400, detail="X-User-Id header is required to erase a vault")

    docs = db.query(Document).filter(build_user_condition(x_user_id, x_user_name)).all()
    for doc in docs:
        StorageService.delete_file(doc.storage_path)
        StorageService.delete_file(doc.thumbnail_path)
        db.delete(doc)
    db.commit()
    return {"message": "All documents deleted, fresh start ready", "deleted": len(docs)}


@router.get("/{doc_id}", response_model=DocumentResponse)
def get_document(
    doc_id: str,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
    db: Session = Depends(get_db)
):
    doc = get_accessible_document(db, doc_id, x_user_id, x_user_name)
    return to_document_response(doc)


@router.put("/{doc_id}", response_model=DocumentResponse)
def update_document(
    doc_id: str,
    update_data: DocumentUpdate,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
    db: Session = Depends(get_db)
):
    doc = get_accessible_document(db, doc_id, x_user_id, x_user_name)

    # Update metadata fields if provided
    fields = [
        "document_type", "merchant_name", "merchant_address", "customer_name",
        "invoice_number", "invoice_date", "due_date", "tax_id", "currency",
        "subtotal", "discount", "tax_amount", "total_amount", "payment_status", "review_status"
    ]
    for field in update_data.model_fields_set & set(fields):
        val = getattr(update_data, field)
        if field == "currency" and val:
            val = val.strip().upper()
        setattr(doc, field, val)

    if update_data.tags is not None:
        doc.tags = [t.strip()[:50] for t in update_data.tags if t and t.strip()]
    if update_data.uncertain_fields is not None:
        doc.uncertain_fields = [f for f in update_data.uncertain_fields if f]

    # Update line items if provided
    if update_data.line_items is not None:
        db.query(LineItem).filter(LineItem.document_id == doc.id).delete(synchronize_session=False)
        for item_data in update_data.line_items:
            item = LineItem(
                id=str(uuid.uuid4()),
                document_id=doc.id,
                description=item_data.description,
                category=item_data.category,
                quantity=item_data.quantity,
                unit_price=item_data.unit_price,
                tax_amount=item_data.tax_amount,
                total=item_data.total,
                is_suggested_category=item_data.is_suggested_category
            )
            db.add(item)

    db.commit()
    db.refresh(doc)
    return to_document_response(doc)


@router.delete("/{doc_id}")
def delete_document(
    doc_id: str,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
    db: Session = Depends(get_db)
):
    doc = get_accessible_document(db, doc_id, x_user_id, x_user_name)

    StorageService.delete_file(doc.storage_path)
    StorageService.delete_file(doc.thumbnail_path)

    db.delete(doc)
    db.commit()
    return {"message": "Document deleted successfully"}


@router.get("/{doc_id}/file")
def get_original_file(
    doc_id: str,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
    user_id: Optional[str] = Query(None, max_length=255),
    db: Session = Depends(get_db)
):
    doc = get_accessible_document(db, doc_id, x_user_id, x_user_name, query_user_id=user_id)
    if not doc.storage_path:
        raise HTTPException(status_code=404, detail="File not found")
    abs_path = StorageService.get_absolute_path(doc.storage_path)
    if not abs_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(abs_path, media_type=doc.mime_type, filename=doc.filename)


@router.get("/{doc_id}/thumbnail")
def get_thumbnail(
    doc_id: str,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
    user_id: Optional[str] = Query(None, max_length=255),
    db: Session = Depends(get_db)
):
    doc = get_accessible_document(db, doc_id, x_user_id, x_user_name, query_user_id=user_id)
    if not doc.thumbnail_path:
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    abs_path = StorageService.get_absolute_path(doc.thumbnail_path)
    if not abs_path.is_file():
        raise HTTPException(status_code=404, detail="Thumbnail file not found")
    return FileResponse(abs_path, media_type="image/webp")


@router.post("/{doc_id}/share")
def generate_share_link(
    doc_id: str,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
    db: Session = Depends(get_db)
):
    """
    Returns the document's share token. Pass ?rotate=true to invalidate the previous link.
    """
    doc = get_accessible_document(db, doc_id, x_user_id, x_user_name)
    if not doc.share_token:
        doc.share_token = uuid.uuid4().hex
        db.commit()
    return {
        "share_token": doc.share_token,
        "share_url": f"/?shared={doc.share_token}"
    }


@router.post("/{doc_id}/share/rotate")
def rotate_share_link(
    doc_id: str,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
    db: Session = Depends(get_db)
):
    """Issues a new share token so previously shared links stop working."""
    doc = get_accessible_document(db, doc_id, x_user_id, x_user_name)
    doc.share_token = uuid.uuid4().hex
    db.commit()
    return {
        "share_token": doc.share_token,
        "share_url": f"/?shared={doc.share_token}"
    }
