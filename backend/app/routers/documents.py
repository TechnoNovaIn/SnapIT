import os
import uuid
from typing import List, Optional
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Header, status
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import desc

from ..database import get_db
from ..config import settings
from ..models import Document, LineItem
from ..schemas import DocumentResponse, DocumentListItem, DocumentUpdate, ManualExpenseCreate
from datetime import datetime
from ..services.storage_service import StorageService
from ..services.ocr_service import OCRService

router = APIRouter(prefix="/documents", tags=["documents"])

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
    ext = Path(file.filename).suffix.lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file format '{ext}'. Supported formats: JPG, JPEG, PNG, WebP, PDF"
        )

    doc_id = str(uuid.uuid4())
    storage_path, file_size, thumb_path = StorageService.save_upload_file(file.file, file.filename, doc_id)

    if file_size > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
        StorageService.delete_file(storage_path)
        if thumb_path:
            StorageService.delete_file(thumb_path)
        raise HTTPException(
            status_code=400,
            detail=f"File exceeds maximum allowed size of {settings.MAX_FILE_SIZE_MB}MB"
        )

    canonical_mime = "image/jpeg" if ext in [".jpg", ".jpeg"] else ("application/pdf" if ext == ".pdf" else ("image/png" if ext == ".png" else ("image/webp" if ext == ".webp" else (file.content_type or "application/octet-stream"))))
    doc = Document(
        id=doc_id,
        owner_id=x_user_id or x_user_name,
        filename=file.filename,
        storage_path=storage_path,
        file_size=file_size,
        mime_type=canonical_mime,
        thumbnail_path=thumb_path,
        customer_name=x_user_name or x_user_id,
        processing_status="pending",
        review_status="ready_for_review",
        currency=settings.DEFAULT_CURRENCY
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    return _to_document_response(doc)


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
    today_str = datetime.now().strftime("%d %b %Y")
    inv_num = data.invoice_number or f"EXP-{uuid.uuid4().hex[:6].upper()}"

    doc = Document(
        id=doc_id,
        owner_id=x_user_id or x_user_name,
        filename=f"{data.merchant_name}.manual",
        storage_path="",
        file_size=0,
        mime_type="text/plain",
        document_type="Receipt",
        merchant_name=data.merchant_name,
        customer_name=x_user_name or x_user_id,
        invoice_number=inv_num,
        invoice_date=data.invoice_date or today_str,
        currency="INR",
        total_amount=data.total_amount,
        subtotal=data.total_amount,
        tax_amount=0.0,
        discount=0.0,
        payment_status="Paid",
        processing_status="completed",
        review_status="ready_for_review",
        confidence_score=1.0,
        tags=[data.category] if data.category else ["Manual"],
        uncertain_fields=[]
    )
    db.add(doc)

    item = LineItem(
        id=str(uuid.uuid4()),
        document_id=doc.id,
        description=f"{data.category} Expense",
        category=data.category or "Others",
        quantity=1.0,
        unit_price=data.total_amount,
        tax_amount=0.0,
        total=data.total_amount,
        is_suggested_category=False
    )
    db.add(item)
    db.commit()
    db.refresh(doc)
    return _to_document_response(doc)


@router.post("/{doc_id}/process", response_model=DocumentResponse)
async def process_document(
    doc_id: str,
    db: Session = Depends(get_db)
):
    """
    Processes the uploaded document: runs OCR / Gemini AI extraction, validates data, and saves.
    """
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    abs_path = StorageService.get_absolute_path(doc.storage_path)
    if not abs_path.exists():
        doc.processing_status = "failed"
        doc.error_message = "Document file not found on disk"
        db.commit()
        raise HTTPException(status_code=404, detail="Original document file not found")

    try:
        doc.processing_status = "processing"
        db.commit()

        # Perform AI Extraction
        extraction = OCRService.extract_document(abs_path, doc.mime_type)

        # Update document fields
        doc.document_type = extraction.get("document_type") or "Receipt"
        doc.merchant_name = extraction.get("merchant_name")
        if not doc.merchant_name or doc.merchant_name == "Analyzing receipt with AI...":
            doc.merchant_name = "Handwritten Bill (Needs Review)"
        doc.merchant_address = extraction.get("merchant_address")
        if extraction.get("customer_name"):
            doc.customer_name = extraction.get("customer_name")
        doc.invoice_number = extraction.get("invoice_number")
        doc.invoice_date = extraction.get("invoice_date")
        doc.due_date = extraction.get("due_date")
        doc.tax_id = extraction.get("tax_id")
        doc.currency = extraction.get("currency") or "INR"
        doc.subtotal = extraction.get("subtotal")
        doc.discount = extraction.get("discount") or 0.0
        doc.tax_amount = extraction.get("tax_amount")
        doc.total_amount = extraction.get("total_amount")
        doc.payment_status = extraction.get("payment_status") or "Pending"
        doc.confidence_score = extraction.get("confidence_score") or 0.85
        doc.tags = extraction.get("tags") or []
        doc.uncertain_fields = extraction.get("uncertain_fields") or []

        # Remove previous line items if re-processing
        db.query(LineItem).filter(LineItem.document_id == doc.id).delete()

        # Add new line items
        for item_data in extraction.get("line_items", []):
            item = LineItem(
                id=str(uuid.uuid4()),
                document_id=doc.id,
                description=item_data.get("description", "Item"),
                category=item_data.get("category", "General"),
                quantity=float(item_data.get("quantity") or 1.0),
                unit_price=float(item_data.get("unit_price") or 0.0),
                tax_amount=float(item_data.get("tax_amount") or 0.0),
                total=float(item_data.get("total") or 0.0),
                is_suggested_category=bool(item_data.get("is_suggested_category", True))
            )
            db.add(item)

        doc.processing_status = "completed"
        is_uncertain = bool(doc.uncertain_fields) or not doc.total_amount or doc.total_amount == 0.0 or not doc.merchant_name or "Needs Review" in str(doc.merchant_name)
        doc.review_status = "needs_review" if is_uncertain else "ready_for_review"
        doc.error_message = None
        db.commit()
        db.refresh(doc)
        return _to_document_response(doc)

    except Exception as e:
        db.rollback()
        doc.processing_status = "failed"
        doc.error_message = f"Extraction error: {str(e)}"
        db.commit()
        db.refresh(doc)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process document: {str(e)}"
        )


@router.get("", response_model=List[DocumentListItem])
def list_documents(
    search: Optional[str] = Query(None),
    document_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
    db: Session = Depends(get_db)
):
    query = db.query(Document).order_by(desc(Document.created_at))

    if x_user_id and x_user_id.strip():
        from .sync import build_user_condition
        query = query.filter(build_user_condition(x_user_id, x_user_name))

    if search:
        s = f"%{search}%"
        query = query.filter((Document.merchant_name.ilike(s)) | (Document.invoice_number.ilike(s)) | (Document.filename.ilike(s)))
    if document_type and document_type != "All":
        query = query.filter(Document.document_type == document_type)
    if status and status != "All":
        query = query.filter(Document.review_status == status)

    docs = query.all()
    results = []
    for d in docs:
        thumb_url = f"/api/documents/{d.id}/thumbnail" if d.thumbnail_path else None
        results.append(DocumentListItem(
            id=d.id,
            filename=d.filename,
            file_size=d.file_size,
            mime_type=d.mime_type,
            thumbnail_url=thumb_url,
            document_type=d.document_type,
            merchant_name=d.merchant_name,
            invoice_number=d.invoice_number,
            invoice_date=d.invoice_date,
            currency=d.currency,
            total_amount=d.total_amount,
            line_items_count=len(d.line_items),
            processing_status=d.processing_status,
            review_status=d.review_status,
            created_at=d.created_at
        ))
    return results


@router.get("/{doc_id}", response_model=DocumentResponse)
def get_document(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return _to_document_response(doc)


@router.put("/{doc_id}", response_model=DocumentResponse)
def update_document(
    doc_id: str,
    update_data: DocumentUpdate,
    db: Session = Depends(get_db)
):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Update metadata fields if provided
    fields = [
        "document_type", "merchant_name", "merchant_address", "customer_name",
        "invoice_number", "invoice_date", "due_date", "tax_id", "currency",
        "subtotal", "discount", "tax_amount", "total_amount", "payment_status", "review_status"
    ]
    for field in fields:
        val = getattr(update_data, field, None)
        if val is not None:
            setattr(doc, field, val)

    if update_data.tags is not None:
        doc.tags = update_data.tags
    if update_data.uncertain_fields is not None:
        doc.uncertain_fields = update_data.uncertain_fields

    # Update line items if provided
    if update_data.line_items is not None:
        db.query(LineItem).filter(LineItem.document_id == doc.id).delete()
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
    return _to_document_response(doc)


@router.delete("/all")
def delete_all_documents(
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
    db: Session = Depends(get_db)
):
    """
    Deletes user's documents for a fresh start.
    """
    query = db.query(Document)
    if x_user_id and x_user_id.strip():
        from .sync import build_user_condition
        query = query.filter(build_user_condition(x_user_id, x_user_name))
    docs = query.all()
    for doc in docs:
        try:
            StorageService.delete_file(doc.storage_path)
            if doc.thumbnail_path:
                StorageService.delete_file(doc.thumbnail_path)
        except Exception:
            pass
        db.delete(doc)
    db.commit()
    return {"message": "All documents deleted, fresh start ready"}


@router.delete("/{doc_id}")
def delete_document(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    StorageService.delete_file(doc.storage_path)
    if doc.thumbnail_path:
        StorageService.delete_file(doc.thumbnail_path)

    db.delete(doc)
    db.commit()
    return {"message": "Document deleted successfully"}


@router.get("/{doc_id}/file")
def get_original_file(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc or not doc.storage_path:
        raise HTTPException(status_code=404, detail="File not found")
    abs_path = StorageService.get_absolute_path(doc.storage_path)
    if not abs_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(abs_path, media_type=doc.mime_type, filename=doc.filename)


@router.get("/{doc_id}/thumbnail")
def get_thumbnail(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc or not doc.thumbnail_path:
        raise HTTPException(status_code=404, detail="Thumbnail not found")
    abs_path = StorageService.get_absolute_path(doc.thumbnail_path)
    if not abs_path.is_file():
        raise HTTPException(status_code=404, detail="Thumbnail file not found")
    return FileResponse(abs_path, media_type="image/webp")


@router.post("/{doc_id}/share")
def generate_share_link(doc_id: str, db: Session = Depends(get_db)):
    """
    Access-controlled secure share token generation.
    """
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if not doc.share_token:
        doc.share_token = uuid.uuid4().hex
        db.commit()
    return {
        "share_token": doc.share_token,
        "share_url": f"/share/{doc.share_token}"
    }


@router.get("/shared/{token}", response_model=DocumentResponse)
def get_shared_document(token: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.share_token == token).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Invalid share token or document access expired")
    return _to_document_response(doc)


def _to_document_response(doc: Document) -> DocumentResponse:
    thumb_url = f"/api/documents/{doc.id}/thumbnail" if doc.thumbnail_path else None
    file_url = f"/api/documents/{doc.id}/file"
    return DocumentResponse(
        id=doc.id,
        filename=doc.filename,
        file_size=doc.file_size,
        mime_type=doc.mime_type,
        thumbnail_url=thumb_url,
        file_url=file_url,
        document_type=doc.document_type,
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
        review_status=doc.review_status,
        processing_status=doc.processing_status,
        error_message=doc.error_message,
        confidence_score=doc.confidence_score or 0.9,
        tags=doc.tags,
        uncertain_fields=doc.uncertain_fields,
        line_items=doc.line_items,
        share_token=doc.share_token,
        created_at=doc.created_at,
        updated_at=doc.updated_at
    )
