import io
import base64

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import Base, engine
from app.config import settings
from app.services.ocr_service import OCRService

def _make_png() -> bytes:
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), color="white").save(buf, "PNG")
    return buf.getvalue()


# Small blank PNG (no readable text)
PNG_BYTES = _make_png()
USER_A = {"X-User-Id": "alice@example.com", "X-User-Name": "Alice"}
USER_B = {"X-User-Id": "bob@example.com", "X-User-Name": "Bob"}


@pytest.fixture(scope="module")
def client():
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:
        yield c


def _upload(client, headers=None, name="test_receipt.png", data=PNG_BYTES, content_type="image/png"):
    return client.post(
        "/api/documents/upload",
        files={"file": (name, io.BytesIO(data), content_type)},
        headers=headers or {},
    )


def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
    assert response.json()["service"] == "SnapIT"


def test_tests_are_isolated_from_real_data():
    assert "snapit_test_" in settings.DATABASE_URL
    assert "snapit_test_" in str(settings.UPLOAD_DIR)


def test_upload_rejects_unsupported_extension(client):
    res = _upload(client, name="notes.txt", data=b"hello", content_type="text/plain")
    assert res.status_code == 400
    assert "Unsupported" in res.json()["detail"]


def test_upload_rejects_mismatched_content(client):
    res = _upload(client, name="fake.png", data=b"this is not an image at all")
    assert res.status_code == 400
    assert "not a valid image" in res.json()["detail"]


def test_upload_rejects_fake_pdf(client):
    res = _upload(client, name="fake.pdf", data=b"not a pdf", content_type="application/pdf")
    assert res.status_code == 400


def test_upload_rejects_oversized_file(client):
    big = PNG_BYTES + b"\0" * (settings.MAX_FILE_SIZE_MB * 1024 * 1024 + 1)
    res = _upload(client, name="big.png", data=big)
    assert res.status_code == 413
    assert not list(settings.UPLOAD_DIR.glob("*big*"))


def test_upload_strips_directory_from_filename(client):
    res = _upload(client, name="../../etc/passwd.png")
    assert res.status_code == 200
    assert res.json()["filename"] == "passwd.png"


def test_upload_and_edit_workflow(client):
    # 1. Upload
    response = _upload(client, headers=USER_A)
    assert response.status_code == 200
    data = response.json()
    doc_id = data["id"]
    assert data["filename"] == "test_receipt.png"
    assert data["processing_status"] == "pending"
    assert data["thumbnail_url"] == f"/api/documents/{doc_id}/thumbnail"

    # 2. Process with the local engine (no Gemini key in tests)
    proc_res = client.post(f"/api/documents/{doc_id}/process", headers=USER_A)
    assert proc_res.status_code == 200
    proc_data = proc_res.json()
    assert proc_data["processing_status"] == "completed"
    # A blank 1x1 image has no readable text: nothing may be invented.
    assert proc_data["review_status"] == "needs_review"
    assert proc_data["total_amount"] in (None, 0, 0.0)
    assert proc_data["invoice_number"] is None
    assert "merchant_name" in proc_data["uncertain_fields"]

    # 3. Edit & recalculate
    edit_payload = {
        "merchant_name": "Apollo Pharmacy",
        "invoice_number": "INV-2026-999",
        "invoice_date": "2026-10-24",
        "currency": "inr",
        "subtotal": 1250.0,
        "discount": 50.0,
        "tax_amount": 100.0,
        "total_amount": 1300.0,
        "tags": ["Medical", "Healthcare", "  "],
        "review_status": "verified",
        "line_items": [
            {"description": "Prescription Medication", "category": "Medical", "quantity": 2, "unit_price": 500.0, "tax_amount": 50.0, "total": 1050.0},
            {"description": "Vitamin C Supplements", "category": "Medical", "quantity": 1, "unit_price": 250.0, "tax_amount": 50.0, "total": 300.0},
        ]
    }
    update_res = client.put(f"/api/documents/{doc_id}", json=edit_payload, headers=USER_A)
    assert update_res.status_code == 200
    updated = update_res.json()
    assert updated["merchant_name"] == "Apollo Pharmacy"
    assert updated["currency"] == "INR"
    assert updated["total_amount"] == 1300.0
    assert len(updated["line_items"]) == 2
    assert updated["tags"] == ["Medical", "Healthcare"]
    assert updated["review_status"] == "verified"

    # 4. Exports
    json_export = client.get(f"/api/documents/{doc_id}/export/json", headers=USER_A)
    assert json_export.status_code == 200
    assert "Apollo Pharmacy" in json_export.text

    csv_export = client.get(f"/api/documents/{doc_id}/export/csv", headers=USER_A)
    assert csv_export.status_code == 200
    assert csv_export.text.startswith("﻿")
    assert "Apollo Pharmacy" in csv_export.text
    assert "Prescription Medication" in csv_export.text

    excel_export = client.get(f"/api/documents/{doc_id}/export/excel", headers=USER_A)
    assert excel_export.status_code == 200
    assert len(excel_export.content) > 1000

    pdf_export = client.get(f"/api/documents/{doc_id}/export/pdf", headers=USER_A)
    assert pdf_export.status_code == 200
    assert pdf_export.headers["content-type"] == "application/pdf"
    assert pdf_export.content.startswith(b"%PDF")

    # 5. Sharing (token access needs no user scoping)
    share_res = client.post(f"/api/documents/{doc_id}/share", headers=USER_A)
    assert share_res.status_code == 200
    token = share_res.json()["share_token"]
    assert token
    assert share_res.json()["share_url"] == f"/?shared={token}"

    shared_doc = client.get(f"/api/documents/shared/{token}")
    assert shared_doc.status_code == 200
    assert shared_doc.json()["merchant_name"] == "Apollo Pharmacy"

    rotated = client.post(f"/api/documents/{doc_id}/share/rotate", headers=USER_A)
    assert rotated.status_code == 200
    assert rotated.json()["share_token"] != token
    assert client.get(f"/api/documents/shared/{token}").status_code == 404

    # 6. List & filter
    list_res = client.get("/api/documents?search=Apollo", headers=USER_A)
    assert list_res.status_code == 200
    assert any(d["id"] == doc_id for d in list_res.json())
    assert list_res.json()[0]["line_items_count"] == 2

    # 7. Another user cannot see, edit, export or delete it
    assert client.get(f"/api/documents/{doc_id}", headers=USER_B).status_code == 404
    assert client.put(f"/api/documents/{doc_id}", json={"merchant_name": "x"}, headers=USER_B).status_code == 404
    assert client.get(f"/api/documents/{doc_id}/export/json", headers=USER_B).status_code == 404
    assert client.delete(f"/api/documents/{doc_id}", headers=USER_B).status_code == 404
    assert not any(d["id"] == doc_id for d in client.get("/api/documents", headers=USER_B).json())

    # 8. Delete
    del_res = client.delete(f"/api/documents/{doc_id}", headers=USER_A)
    assert del_res.status_code == 200
    assert client.get(f"/api/documents/{doc_id}", headers=USER_A).status_code == 404
    assert not list(settings.UPLOAD_DIR.glob(f"{doc_id}*"))


def test_update_rejects_invalid_values(client):
    doc_id = _upload(client, headers=USER_A).json()["id"]
    bad = client.put(f"/api/documents/{doc_id}", json={"total_amount": -5}, headers=USER_A)
    assert bad.status_code == 422
    bad_status = client.put(f"/api/documents/{doc_id}", json={"review_status": "whatever"}, headers=USER_A)
    assert bad_status.status_code == 422
    client.delete(f"/api/documents/{doc_id}", headers=USER_A)


def test_manual_expense_creation(client):
    payload = {
        "merchant_name": "Zara Fashion Store",
        "total_amount": 4200.0,
        "category": "Fashion",
        "invoice_date": "25 Oct 2026"
    }
    response = client.post("/api/documents/manual", json=payload, headers=USER_A)
    assert response.status_code == 200
    data = response.json()
    assert data["merchant_name"] == "Zara Fashion Store"
    assert data["total_amount"] == 4200.0
    assert data["currency"] == "INR"
    assert data["processing_status"] == "completed"
    assert data["review_status"] == "verified"
    assert data["file_url"] == ""
    assert len(data["line_items"]) == 1
    assert data["line_items"][0]["category"] == "Fashion"

    # A manual entry has no file to process
    assert client.post(f"/api/documents/{data['id']}/process", headers=USER_A).status_code == 400

    bad = client.post("/api/documents/manual", json={"merchant_name": "", "total_amount": 1}, headers=USER_A)
    assert bad.status_code == 422


def test_delete_all_requires_user_and_is_scoped(client):
    a_id = client.post("/api/documents/manual", json={"merchant_name": "A Shop", "total_amount": 10}, headers=USER_A).json()["id"]
    b_id = client.post("/api/documents/manual", json={"merchant_name": "B Shop", "total_amount": 20}, headers=USER_B).json()["id"]

    assert client.delete("/api/documents/all").status_code == 400

    res = client.delete("/api/documents/all", headers=USER_A)
    assert res.status_code == 200
    assert client.get(f"/api/documents/{a_id}", headers=USER_A).status_code == 404
    assert client.get(f"/api/documents/{b_id}", headers=USER_B).status_code == 200
    client.delete(f"/api/documents/{b_id}", headers=USER_B)


def test_sync_vault_rejects_unsafe_ids_and_bad_assets(client):
    thumb = "data:image/png;base64," + base64.b64encode(PNG_BYTES).decode()
    payload = {
        "user_id": USER_A["X-User-Id"],
        "user_name": "Alice",
        "documents": [
            {"id": "../../evil", "merchant_name": "Evil", "total_amount": 1},
            {"id": "doc-offline-123", "merchant_name": "Corner Shop", "total_amount": "1,250.50",
             "thumbnail_url": thumb, "file_url": "data:text/html;base64,PGh0bWw+", "tags": ["Food"],
             "line_items": [{"description": "Tea", "quantity": "2", "unit_price": "625.25", "total": "1250.50"}]},
        ]
    }
    res = client.post("/api/sync/vault", json=payload, headers=USER_A)
    assert res.status_code == 200
    body = res.json()
    assert body["skipped"] == 1
    ids = [d["id"] for d in body["documents"]]
    assert "doc-offline-123" in ids
    assert "../../evil" not in ids
    synced = next(d for d in body["documents"] if d["id"] == "doc-offline-123")
    assert synced["total_amount"] == 1250.5
    assert synced["thumbnail_url"] == "/api/documents/doc-offline-123/thumbnail"
    assert synced["file_url"] == ""  # text/html data URL was rejected
    assert synced["line_items"][0]["quantity"] == 2.0
    assert not (settings.UPLOAD_DIR.parent / "evil.jpg").exists()

    # Bob cannot overwrite Alice's synced record by replaying its id
    res_b = client.post("/api/sync/vault", json={"user_id": USER_B["X-User-Id"], "documents": [
        {"id": "doc-offline-123", "merchant_name": "Hijacked", "total_amount": 9999}
    ]}, headers=USER_B)
    assert res_b.status_code == 200
    assert res_b.json()["skipped"] == 1
    assert client.get("/api/documents/doc-offline-123", headers=USER_A).json()["merchant_name"] == "Corner Shop"
    client.delete("/api/documents/doc-offline-123", headers=USER_A)


def test_settings_masks_key_and_ignores_masked_save(client):
    res = client.post("/api/settings", json={"gemini_api_key": "AIzaSy-TEST-KEY-1234567890abcdef", "default_currency": "usd"})
    assert res.status_code == 200
    body = res.json()
    assert body["has_api_key"] is True
    assert body["gemini_api_key"] == "AIza...cdef"
    assert body["default_currency"] == "USD"

    # Saving the masked value back must not clobber the stored key
    res2 = client.post("/api/settings", json={"gemini_api_key": body["gemini_api_key"]})
    assert res2.json()["has_api_key"] is True
    assert OCRService.get_configured_api_key() == "AIzaSy-TEST-KEY-1234567890abcdef"

    # Clean up so the rest of the suite stays on the local engine
    from app.database import SessionLocal
    from app.models import AppSetting
    with SessionLocal() as db:
        db.query(AppSetting).delete()
        db.commit()


def test_heuristic_parser_never_invents_data():
    result = OCRService._parse_text_heuristically("", "receipt.jpg")
    assert result["merchant_name"] is None
    assert result["total_amount"] is None
    assert result["invoice_number"] is None
    assert result["invoice_date"] is None
    assert result["line_items"] == []
    assert result["payment_status"] is None
    assert set(result["uncertain_fields"]) >= {"merchant_name", "invoice_number", "invoice_date", "total_amount", "line_items"}


def test_heuristic_parser_reads_simple_bill():
    text = (
        "SRI LAKSHMI MEDICAL STORES\n"
        "Station Road, Tumkur\n"
        "GSTIN: 29ABCDE1234F1Z5\n"
        "Bill No: 783  Date: 24/10/2026\n"
        "Paracetamol 2 25.00 50.00\n"
        "Cough Syrup 1 120.00 120.00\n"
        "Grand Total Rs. 170.00\n"
        "Paid\n"
    )
    result = OCRService._parse_text_heuristically(text, "scan.jpg")
    assert result["merchant_name"].upper().startswith("SRI LAKSHMI MEDICAL")
    assert result["invoice_number"] == "783"
    assert result["invoice_date"] == "24/10/2026"
    assert result["tax_id"] == "29ABCDE1234F1Z5"
    assert result["total_amount"] == 170.0
    assert result["currency"] == "INR"
    assert result["document_type"] == "Medical Bill"
    assert result["payment_status"] == "Paid"
    assert [i["description"] for i in result["line_items"]] == ["Paracetamol", "Cough Syrup"]


def test_validate_and_normalize_coerces_model_output():
    data = OCRService._validate_and_normalize({
        "merchant_name": " Shop ",
        "total_amount": "₹1,250.00",
        "subtotal": None,
        "confidence_score": "1.7",
        "tags": "not-a-list",
        "line_items": [{"description": None, "quantity": "2", "unit_price": "10"}, "junk"],
    })
    assert data["merchant_name"] == "Shop"
    assert data["total_amount"] == 1250.0
    assert data["confidence_score"] == 1.0
    assert data["tags"] == []
    assert len(data["line_items"]) == 1
    assert data["line_items"][0]["description"] == "Item"
    assert data["line_items"][0]["total"] == 20.0
