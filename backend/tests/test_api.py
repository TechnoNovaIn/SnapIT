import io
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine

@pytest.fixture(scope="module")
def client():
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:
        yield c

def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
    assert response.json()["service"] == "SnapIT"

def test_upload_and_edit_workflow(client):
    # 1. Test Upload (Fake image content)
    file_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    response = client.post(
        "/api/documents/upload",
        files={"file": ("test_receipt.png", io.BytesIO(file_bytes), "image/png")}
    )
    assert response.status_code == 200
    data = response.json()
    doc_id = data["id"]
    assert data["filename"] == "test_receipt.png"
    assert data["processing_status"] == "pending"

    # 2. Test Process
    proc_res = client.post(f"/api/documents/{doc_id}/process")
    assert proc_res.status_code == 200
    proc_data = proc_res.json()
    assert proc_data["processing_status"] == "completed"

    # 3. Test Edit & Recalculate
    edit_payload = {
        "merchant_name": "Apollo Pharmacy",
        "invoice_number": "INV-2026-999",
        "invoice_date": "2026-10-24",
        "currency": "INR",
        "subtotal": 1250.0,
        "discount": 50.0,
        "tax_amount": 100.0,
        "total_amount": 1300.0,
        "tags": ["Medical", "Healthcare"],
        "line_items": [
            {
                "description": "Prescription Medication",
                "category": "Medical",
                "quantity": 2,
                "unit_price": 500.0,
                "tax_amount": 50.0,
                "total": 1050.0,
                "is_suggested_category": False
            },
            {
                "description": "Vitamin C Supplements",
                "category": "Medical",
                "quantity": 1,
                "unit_price": 250.0,
                "tax_amount": 50.0,
                "total": 300.0,
                "is_suggested_category": False
            }
        ]
    }
    update_res = client.put(f"/api/documents/{doc_id}", json=edit_payload)
    assert update_res.status_code == 200
    updated = update_res.json()
    assert updated["merchant_name"] == "Apollo Pharmacy"
    assert updated["total_amount"] == 1300.0
    assert len(updated["line_items"]) == 2
    assert "Medical" in updated["tags"]

    # 4. Test Export JSON
    json_export = client.get(f"/api/documents/{doc_id}/export/json")
    assert json_export.status_code == 200
    assert "Apollo Pharmacy" in json_export.text

    # 5. Test Export CSV
    csv_export = client.get(f"/api/documents/{doc_id}/export/csv")
    assert csv_export.status_code == 200
    assert "Apollo Pharmacy" in csv_export.text
    assert "Prescription Medication" in csv_export.text

    # 6. Test Export Excel (.xlsx)
    excel_export = client.get(f"/api/documents/{doc_id}/export/excel")
    assert excel_export.status_code == 200
    assert len(excel_export.content) > 1000

    # 7. Test Export PDF
    pdf_export = client.get(f"/api/documents/{doc_id}/export/pdf")
    assert pdf_export.status_code == 200
    assert pdf_export.headers["content-type"] == "application/pdf"

    # 7. Test Sharing
    share_res = client.post(f"/api/documents/{doc_id}/share")
    assert share_res.status_code == 200
    share_data = share_res.json()
    token = share_data["share_token"]
    assert token

    shared_doc = client.get(f"/api/documents/shared/{token}")
    assert shared_doc.status_code == 200
    assert shared_doc.json()["merchant_name"] == "Apollo Pharmacy"

    # 8. Test Document List & Filtering
    list_res = client.get("/api/documents?search=Apollo")
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 1

    # 9. Test Delete
    del_res = client.delete(f"/api/documents/{doc_id}")
    assert del_res.status_code == 200

    # Verify not found after delete
    get_after = client.get(f"/api/documents/{doc_id}")
    assert get_after.status_code == 404

def test_manual_expense_creation(client):
    payload = {
        "merchant_name": "Zara Fashion Store",
        "total_amount": 4200.0,
        "category": "Fashion",
        "invoice_date": "25 Oct 2026"
    }
    response = client.post("/api/documents/manual", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["merchant_name"] == "Zara Fashion Store"
    assert data["total_amount"] == 4200.0
    assert data["currency"] == "INR"
    assert data["processing_status"] == "completed"
    assert len(data["line_items"]) == 1
    assert data["line_items"][0]["category"] == "Fashion"
