from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Document
from ..services.export_service import ExportService

router = APIRouter(prefix="/documents", tags=["export"])

@router.get("/{doc_id}/export/json")
def export_json(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    json_data = ExportService.export_json(doc)
    return Response(
        content=json_data,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="smartbill_{doc_id[:8]}.json"'}
    )

@router.get("/{doc_id}/export/csv")
def export_csv(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    csv_data = ExportService.export_csv(doc)
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="smartbill_{doc_id[:8]}.csv"'}
    )

@router.get("/{doc_id}/export/excel")
def export_excel(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    excel_bytes = ExportService.export_excel(doc)
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="smartbill_{doc_id[:8]}.xlsx"'}
    )

@router.get("/{doc_id}/export/pdf")
def export_pdf_summary(doc_id: str, db: Session = Depends(get_db)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    pdf_bytes = ExportService.export_pdf_summary(doc)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="smartbill_summary_{doc_id[:8]}.pdf"'}
    )
