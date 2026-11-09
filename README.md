# SnapIT — AI-Powered Smart Document & Receipt Clipper

A simple, modern, AI-powered document-reading and receipt-clipping web application with the authentic mobile UI/UX of **SnapIT**.

Upload, scan, or photograph any bill, invoice, receipt, purchase order, medical bill, fuel bill, or utility bill. SnapIT reads the actual document, extracts its information, organizes the data into structured fields, and displays the result in a clean digital receipt/details interface.

---

## 🌟 Key Features

### 1. Primary Workflow
`Upload document` → `Process document` → `Extract information` → `Display results` → `Edit` → `Save` → `Export`

### 2. Prominent Upload Section
- **Multiple Upload Channels**: Drag-and-drop, file browser, camera capture on mobile/laptops.
- **File Formats**: JPG, JPEG, PNG, WebP, and multi-page PDFs (up to 25MB).
- **Staged File Review**: Displays filename, preview thumbnail, file size, with **Remove** or **Replace** options.
- **User-Controlled Execution**: Document processing is strictly initiated when the user clicks **"Read Document"**.

### 3. Step-by-Step Processing State Stepper
Displays visual real-time progress through all stages:
1. `Uploading document`
2. `Reading document`
3. `Extracting information`
4. `Validating details`
5. `Completed` (or helpful error message with a **Retry** button)

### 4. Receipt Details Screen (Klipit.ai-Inspired)
- **Document Summary Card**: Original document thumbnail, document type badge, merchant/supplier name, invoice/receipt #, date, total amount with currency formatting (INR `₹` or detected currency), line items count, and review status badge.
- **Side-by-Side Comparison**: View original document with zoom, rotation, and full-screen view alongside digital receipt on desktop; stacked on mobile.
- **Digital Receipt Card**: Merchant name & address, invoice #, invoice date, due date, GST / Tax ID with one-click copy, itemized line-items table, subtotal, discount, tax amount, and total amount.
- **Dynamic Mismatch Detection**: Automatically detects and alerts if line items + tax - discount mismatch the stated total.

### 5. In-Place & Modal Editing
- Easily edit merchant name, invoice numbers, dates, tax numbers, amounts, and individual line items (add/remove rows, modify quantities, prices, categories).
- Recalculates totals live.

### 6. Tags & Categorization
- "All Tags" section with custom tag creation and deletion.
- One-click preset tags: `Travel`, `Medical`, `Fuel`, `Office Supplies`, `Purchase`, `Utility Bill`, `Food & Dining`, `Other`.
- AI-suggested categories clearly indicated with suggestion badges until verified.

### 7. Document Actions & Export
- **Original Download**: Download original file.
- **JSON Export**: Export clean structured JSON payload.
- **CSV Export**: Export formatted spreadsheet.
- **Excel (.xlsx) Export**: Export formatted Microsoft Excel workbook with formulas, emerald green headers, and itemized tables.
- **PDF Summary**: Generate an official digital receipt summary PDF using ReportLab.
- **Access-Controlled Sharing**: Generate unique token links for secure sharing without public exposure.

### 8. Document History
- Search by merchant name, invoice number, or filename.
- Filter by document type (`Tax Invoice`, `Receipt`, `Medical Bill`, etc.) and review status.
- Thumbnail previews and permanent delete confirmation modal.

### 9. AI & OCR Engine
- **Google Gemini Vision AI** (`gemini-2.5-flash` / `gemini-1.5-flash`): State-of-the-art multimodal extraction for printed and handwritten receipts.
- **Intelligent Local Parser**: Out-of-the-box text extraction (PyPDF / heuristics) when running offline or without an API key. Never displays hardcoded fake data.

---

## 🛠 Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Vanilla CSS design system (Inter font, emerald green accents, white cards), Lucide Icons.
- **Backend**: Python 3, FastAPI, Uvicorn, Pydantic v2, SQLAlchemy.
- **Database**: SQLite (default, zero configuration needed) or PostgreSQL (via `DATABASE_URL`).
- **AI / OCR**: `google-genai` SDK + PyPDF + Pillow.
- **Exporting**: ReportLab (PDF), Python standard CSV & JSON.

---

## 🚀 Deployment Guide

### Option 1: Docker (Recommended for Any Cloud / VPS)
```bash
docker build -t snapit:latest .
docker run -p 8000:8000 -e GEMINI_API_KEY="your-api-key" snapit:latest
```

### Option 2: Render / Railway / Heroku
The included `Procfile` is pre-configured:
```
web: python -m uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}
```
1. Connect your repository to Render / Railway.
2. Build command:
   ```bash
   cd frontend && npm install && npm run build && cd ../backend && pip install -r requirements.txt
   ```
3. Start command:
   ```bash
   python -m uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT
   ```
4. Set environment variables: `GEMINI_API_KEY`, `DEFAULT_CURRENCY` (optional), `DATABASE_URL` (optional, defaults to SQLite).

### Option 3: Production Single-Server (Local or Linux VPS)
```bash
# Build frontend
cd frontend
npm install
npm run build

# Start FastAPI serving both API and frontend
cd ../backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Visit `http://localhost:8000` in any browser.

---

## 📱 Android App Deployment
The Android APK is compiled and ready at `SnapIT.apk`:
- Built with Capacitor 8 and Android SDK 35.
- Connects automatically via Cloud Tunnel or LAN Wi-Fi with automatic fallback.
- Configurable cloud endpoints via **Settings -> Cloud API Endpoint**.


### 1. Prerequisites
- Python 3.10+
- Node.js 18+

### 2. Setup & Installation

#### Backend Setup
```bash
cd backend
python -m pip install -r requirements.txt
```

*(Optional)* Configure your Google Gemini API key:
- Copy `.env.example` to `.env`
- Add your free API key from [Google AI Studio](https://aistudio.google.com/app/apikey):
```env
GEMINI_API_KEY="your-gemini-api-key"
GEMINI_MODEL="gemini-2.5-flash"
```
*(You can also configure this directly inside the application's Settings tab!)*

#### Frontend Setup
```bash
cd frontend
npm install
```

### 3. Running Locally

You can launch both services together using the provided Windows script:
```bash
run_dev.bat
```

Or run them in separate terminals:

**Terminal 1 (Backend API):**
```bash
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

**Terminal 2 (Frontend UI):**
```bash
cd frontend
npm run dev
```

Open your browser at:
- **Frontend App**: [http://127.0.0.1:5173](http://127.0.0.1:5173)
- **API Documentation**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## 🧪 Running Backend Unit Tests

Run the test suite covering file upload, processing, editing, saving, and export endpoints:
```bash
cd backend
python -m pytest tests/
```

---

## 📂 Project Structure

```
klipit/
├── backend/
│   ├── app/
│   │   ├── config.py              # Application settings
│   │   ├── database.py            # SQLite/PostgreSQL engine
│   │   ├── models.py              # Document, LineItem, Setting models
│   │   ├── schemas.py             # Pydantic v2 validation models
│   │   ├── services/
│   │   │   ├── ocr_service.py     # Gemini Vision & Local OCR engine
│   │   │   ├── export_service.py  # JSON, CSV, PDF summary generation
│   │   │   └── storage_service.py # Secure file storage & thumbnails
│   │   ├── routers/
│   │   │   ├── documents.py       # Upload, process, edit, share endpoints
│   │   │   ├── export.py          # Export endpoints
│   │   │   └── settings.py        # Settings endpoints
│   │   └── main.py                # FastAPI entry point & CORS
│   ├── tests/
│   │   └── test_api.py            # Comprehensive test suite
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx
│   │   │   ├── UploadSection.tsx
│   │   │   ├── ProcessingModal.tsx
│   │   │   ├── DocumentPreview.tsx
│   │   │   ├── DocumentSummaryCard.tsx
│   │   │   ├── DigitalReceiptCard.tsx
│   │   │   ├── TagsSection.tsx
│   │   │   ├── EditDetailsModal.tsx
│   │   │   ├── DocumentActions.tsx
│   │   │   ├── HistoryView.tsx
│   │   │   └── SettingsView.tsx
│   │   ├── api/
│   │   │   └── client.ts          # API client
│   │   ├── types/
│   │   │   └── document.ts        # TypeScript interfaces
│   │   ├── App.tsx
│   │   └── index.css              # Klipit design system & tokens
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
├── run_dev.bat
├── sample_receipt.pdf
└── prompt.docx
```
