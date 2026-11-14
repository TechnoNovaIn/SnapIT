import re
from typing import Optional

from fastapi import APIRouter, Depends, Header, Query, Response
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.export_service import ExportService
from ._common import get_accessible_document

router = APIRouter(prefix="/documents", tags=["export"])


def _attachment(name: str) -> dict:
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", name)
    return {"Content-Disposition": f'attachment; filename="{safe}"'}


def _basename(doc) -> str:
    merchant = re.sub(r"[^A-Za-z0-9]+", "_", (doc.merchant_name or "receipt")).strip("_")[:40] or "receipt"
    return f"snapit_{merchant}_{doc.id[:8]}"


@router.get("/{doc_id}/export/json")
def export_json(
    doc_id: str,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
    user_id: Optional[str] = Query(None, max_length=255),
    db: Session = Depends(get_db)
):
    doc = get_accessible_document(db, doc_id, x_user_id, x_user_name, query_user_id=user_id)
    return Response(
        content=ExportService.export_json(doc),
        media_type="application/json",
        headers=_attachment(f"{_basename(doc)}.json")
    )


@router.get("/{doc_id}/export/csv")
def export_csv(
    doc_id: str,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
    user_id: Optional[str] = Query(None, max_length=255),
    db: Session = Depends(get_db)
):
    doc = get_accessible_document(db, doc_id, x_user_id, x_user_name, query_user_id=user_id)
    return Response(
        content=ExportService.export_csv(doc).encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers=_attachment(f"{_basename(doc)}.csv")
    )


@router.get("/{doc_id}/export/excel")
def export_excel(
    doc_id: str,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
    user_id: Optional[str] = Query(None, max_length=255),
    db: Session = Depends(get_db)
):
    doc = get_accessible_document(db, doc_id, x_user_id, x_user_name, query_user_id=user_id)
    return Response(
        content=ExportService.export_excel(doc),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=_attachment(f"{_basename(doc)}.xlsx")
    )


@router.get("/{doc_id}/export/pdf")
def export_pdf_summary(
    doc_id: str,
    x_user_id: Optional[str] = Header(None, alias="X-User-Id"),
    x_user_name: Optional[str] = Header(None, alias="X-User-Name"),
    user_id: Optional[str] = Query(None, max_length=255),
    db: Session = Depends(get_db)
):
    doc = get_accessible_document(db, doc_id, x_user_id, x_user_name, query_user_id=user_id)
    return Response(
        content=ExportService.export_pdf_summary(doc),
        media_type="application/pdf",
        headers=_attachment(f"{_basename(doc)}_summary.pdf")
    )
