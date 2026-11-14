# SnapIT Full Audit and Fix Report

Date: 2026-11-14
Scope: entire repository (FastAPI backend, React/Capacitor frontend, Docker/launch scripts, git hygiene).
Verification after fixes: backend `pytest` 16/16 passing on an isolated database; frontend `tsc` clean, `oxlint` 0 errors (4 style warnings), `vite build` succeeds; end-to-end smoke test with `sample_receipt.pdf` reads merchant, invoice number, date and total from the document text.

Nothing has been committed. Everything below is in the working tree for review.

---

## 1. Critical findings (fixed)

### 1.1 Hardcoded fake OCR results (spec violation)
The project spec (`prompt_extracted.txt`) says: *"Do not display fake processing results or hardcoded document information"* and *"Never use these values as fixed demo output for uploaded documents."* Despite that, both the backend and the frontend returned pre-written results for four specific documents:

- `backend/app/services/ocr_service.py` returned fixed data for "Sree Siddeshwara Tyres", "Navarathna Marketing", "Sri Siddeshwara Medical" and "IIT Dharwad" whenever the OCR text contained trigger words such as `DHARWAD` + `IIT`, a phone number, or a GSTIN.
- `frontend/src/api/client.ts` did the same in three places, keyed on the **filename**: any file named `receipt.jpg`, `recipt.pdf`, or containing `tyre` or `11-13` was shown as a specific real invoice, including a real person's name as the customer.
- The receipts list and home screen printed `24 Oct 2026` for any receipt without a date and `3,100` for any receipt without a total. The account screen showed a fake phone number `+91 98765 43210` and pre-filled it into the edit form, so pressing Save stored it as the user's number. The expenditure chart had a fabricated September value and a y-axis fixed at 3100.

**Fix:** all fixtures removed. The local engine returns `null` for anything it cannot read and lists the field in `uncertain_fields`; the UI shows "Not read", "Merchant not read" and "No line items read" instead of invented values, and the review banner lists exactly which fields were not read. The smoke test on the sample PDF confirms the real parser still extracts the real values from the document text.

### 1.2 Secrets and runtime data committed to git
- `backend/.env` with a Gemini API key has been tracked since the initial commit. **Removing it from the index does not remove it from history: rotate the key in Google AI Studio.**
- `backend/smartbill.db` (the live database), `backend/uploads/*` (users' receipt photos), all `__pycache__` folders and `backend/tools/cloudflared.exe` were tracked.

**Fix:** added a root `.gitignore` and `.dockerignore`; untracked these paths with `git rm --cached` (local files are untouched). `backend/uploads/.gitkeep` keeps the folder.

### 1.3 Path traversal in `/api/sync/vault`
The document `id` supplied by the client was used unvalidated to build file names (`f"{doc_id}_thumb.webp"`), so an id such as `../../x` wrote files outside the uploads folder. Any client could also overwrite any other user's record by replaying its id.

**Fix:** ids must match `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`; data URLs are checked for an image/PDF MIME type and a size cap, and the saved extension follows the real MIME type; existing records are only updated when they belong to the calling user. Covered by `test_sync_vault_rejects_unsafe_ids_and_bad_assets`.

### 1.4 Docker image could not start
`config.py` used a backslash inside an f-string expression, which is a syntax error on Python 3.11, the base image in the Dockerfile. `requirements.txt` was also missing `pypdfium2` and `openpyxl`, which the code imports at runtime (thumbnails, scanned PDFs, Excel export), so those features failed in any fresh install.

**Fix:** expression moved out of the f-string; requirements completed (`winocr` marked Windows-only); Dockerfile moved to Python 3.12, uses `npm ci`, installs Tesseract as the Linux OCR fallback, runs as a non-root user and has a health check; `.dockerignore` keeps secrets, the DB, uploads and the Windows binary out of the image.

### 1.5 No per-user scoping on document endpoints
`GET/PUT/DELETE /documents/{id}`, file/thumbnail download, processing, sharing and all exports ignored the caller's identity entirely; only the list endpoint filtered by user. `DELETE /documents/all` without a header deleted **every** user's documents.

**Fix:** every document endpoint now resolves the document through one helper that applies the same user condition as the list; a mismatch answers 404. `DELETE /documents/all` requires a user id. Download links carry the user as a `user_id` query parameter because browsers cannot send headers on plain links. Covered by tests.

Note: this is still client-asserted identity (the `X-User-Id` header). The app has no real authentication; see section 5.

---

## 2. Backend defects (fixed)

| Area | Problem | Fix |
|---|---|---|
| Upload | File written fully to disk before the size limit was checked; no check that the bytes match the extension; `filename` could be `None` or contain a path | Streamed write with an early 413, magic-byte/PIL verification (400), filename reduced to its base name |
| Processing | `async def` endpoint ran blocking OCR/Gemini calls on the event loop, freezing every other request | Endpoint is sync, so FastAPI runs it in its threadpool |
| Processing | `float(item["quantity"])` crashed on model output such as `"2 pcs"`; `description: None` violated `NOT NULL`; placeholder merchant string compared against a value nobody sets | Safe numeric coercion everywhere, defaults for empty descriptions, unread merchant stored as `null` and flagged |
| Gemini | Retired `gemini-1.5-flash` in the fallback list; an invalid key was retried against four models; JSON fences and stray text broke parsing; string numbers (`"1,250.00"`) reached the DB | Fallback list updated; auth/quota errors stop the retry loop; tolerant JSON parsing; full normalisation of numbers, lists and confidence range |
| Local engine | `raw_text` column never populated; "unpaid" matched the "paid" check; `_parse_words_amount` accepted arbitrary words; no OCR at all outside Windows | Raw OCR text stored; payment status only when stated; words parser validates tokens; optional Tesseract fallback; EXIF orientation respected |
| Settings | Posting the settings form without a model silently overwrote the stored model with the schema default | Separate `SettingsUpdate` schema; only present fields change; currency upper-cased; `ocr_engine` reported |
| Exports | PDF used Helvetica, which cannot draw `₹` (blank glyph); long descriptions overflowed cells; bold-row range hardcoded to 4 rows; CSV had no BOM so Excel mangled the header; `_basename` filenames ignored the merchant | ISO currency code in PDF/CSV, wrapped `Paragraph` cells with escaping, computed summary range, UTF-8 BOM, descriptive attachment names, uncertain fields listed in the PDF |
| Models | `datetime.utcnow` is deprecated (Python 3.12+) | `utcnow()` helper using an aware clock |
| Database | SQLite ignores `ON DELETE CASCADE` unless enabled | `PRAGMA foreign_keys=ON` per connection |
| Schemas | No bounds: negative amounts, arbitrary review statuses, unlimited string lengths accepted | Pydantic constraints (`ge=0`, status pattern, max lengths) |
| CORS | Explicit origins plus `"*"` (the list was pointless) | Configurable `CORS_ORIGINS`, credentials disabled, `Content-Disposition` exposed |
| Tests | The test suite used the **production** `smartbill.db` and uploads folder, and would call the real Gemini key if one was set; the "PNG" fixture was not a valid PNG | `tests/conftest.py` points at a temporary DB/uploads dir and blanks the key; 16 tests cover validation, scoping, sync safety, settings masking and the no-invented-data rule |
| Logging | `print()` everywhere, including document ids and user ids | `logging` module |

---

## 3. Frontend defects (fixed)

| File | Problem | Fix |
|---|---|---|
| `api/client.ts` | Three hardcoded fixture blocks (see 1.1); hardcoded private IPs (`192.168.0.116`, `192.168.0.188`) and two stale `trycloudflare.com` hostnames; on the web every request tried up to 6 hosts with 8 s timeouts when the server was down; a 404 from the real API was treated as "try the next host"; Gemini key sent in the URL query string; `gemini-3.8-flash` (non-existent) and `has_api_key: true` returned as the offline fallback; invoice numbers and dates invented for offline uploads; `getSharedDocument` never asked the server | Rewritten: web uses same-origin `/api` only; Android uses the configured URL, the last working URL and the emulator alias; failover only on network errors; key sent in the `x-goog-api-key` header; honest offline placeholders; shared documents fetched from the server; server validation errors surfaced to the user |
| `KlipitReceiptDetailsScreen.tsx` | Share link had the origin prepended twice (`http://host http://host?shared=…`); failure toast said "copied"; today's date shown when the invoice date was missing; a fake "Itemized Bill" line item synthesised; currency hardcoded to INR; "Handwritten text detected" shown for any zero total; "edit within 24 hours" claim; export links 404 for device-only receipts | All fixed; the receipt card now also shows address, tax id, subtotal/tax/discount, payment status and suggested-category markers |
| `KlipitReceiptsScreen.tsx` / `KlipitHomeScreen.tsx` | Fake `24 Oct 2026` date and `3,100` amount; date parser misread `DD/MM/YYYY` as month-first; `document_type === 'RECEIPT'` never matched; share button showed a placeholder `alert`; "this month" count and period toggle did nothing; donut chart was a constant | Shared `utils/format.ts` (day-first date parsing, currency-aware money formatting, placeholder for unread values); period totals computed from dates; donut proportional to data; manual entries labelled as such |
| `ExpenditureAnalysisScreen.tsx` | Initialised to October 2026; y-axis fixed at 3100; fabricated September bar; budget saved but never used | Starts on the current month; bars and axis derived from real monthly totals; budget shown as a progress bar with over/under amounts |
| `AccountModal.tsx` | Fake phone number displayed and written back on Save; unconditional "Verified" badge; "PHONE SSO" label | Removed |
| `LoginPage.tsx` | "Sign in with Google" performed no OAuth: it was a form asking the user to type any name and email, with a "Privacy Guarantee" claim | Relabelled "Continue with email" with an accurate explanation of how the vault is keyed |
| `SettingsView.tsx` | Stale tunnel/LAN presets; API key echoed into a plain text input; key written to `localStorage` on the web; a bad server URL was persisted even when saving failed | Presets reduced to "same server" and "Android emulator"; password input, masked key shown as placeholder only; device copy of the key only on Android with a remove button; URL rolled back on failure; engine status banner |
| `ProcessingModal.tsx` / `App.tsx` | On failure the first three steps were always ticked; fallback document invented `INV-001`, `PAID`, confidence 1.0 and a fake line item; 5-second polling | Failure shows the real failed step; fallback shows only known data; polling every 15 s |
| Dead code | 8 components (~1,500 lines) were never imported: `DigitalReceiptCard`, `DocumentActions`, `DocumentSummaryCard`, `Header`, `HistoryView`, `KlipitIDModal`, `TagsSection`, `UploadSection` (several with their own bugs, e.g. `Intl.NumberFormat` throwing on non-ISO currency strings) | Deleted (recoverable from git history) |

---

## 4. Infrastructure and scripts

- `run.py` printed a hardcoded LAN IP and a dead tunnel URL; it now detects the LAN address and prints the real tunnel URL from cloudflared's output (`SNAPIT_TUNNEL=0` skips the tunnel).
- `backend/.env.example` documents all variables (`CORS_ORIGINS`, `SNAPIT_UPLOAD_DIR`, `MAX_FILE_SIZE_MB` is now honoured).
- README: Android connection instructions corrected (no automatic tunnel discovery exists), security notes added, test instructions updated.

---

## 5. Open issues (not fixed; need a product decision)

1. **No authentication.** Identity is the `X-User-Id` header, which any client can set. The scoping added here isolates well-behaved clients but is not security. Options: a password or OTP login with server-issued tokens, or an authenticating reverse proxy in front of the API. Until then the server must stay private.
2. **The leaked Gemini key must be rotated** in Google AI Studio; it is in git history.
3. **`SnapIT.apk`** (8 MB) is still committed and predates these fixes; rebuild it with `npx cap sync android` and consider publishing APKs as release assets instead of in git.
4. **Android downloads:** `<a download>` to a cross-origin backend URL navigates the WebView away instead of saving the file. Native downloads need the Capacitor Filesystem/Share plugins.
5. **OCR quality without Gemini** is heuristic (regexes over OCR text). It reads simple bills but not complex tables; the UI now says so and flags every unread field. Gemini remains the recommended engine.
6. **Edit form numeric inputs** snap to `0` when cleared, which makes typing decimals awkward (`EditDetailsModal.tsx`).
7. `android:usesCleartextTraffic="true"` is required for plain-HTTP LAN servers; remove it if the backend is only ever reached over HTTPS.
8. Remaining `oxlint` warnings are style-only (`new Date()` during render; one `setState` in an effect in `App.tsx`).

---

## 6. Files changed

New: `.gitignore`, `.dockerignore`, `backend/app/routers/_common.py`, `backend/tests/conftest.py`, `backend/uploads/.gitkeep`, `frontend/src/utils/format.ts`, `AUDIT.md`.
Rewritten: `backend/app/services/ocr_service.py`, `backend/app/routers/documents.py`, `backend/app/routers/sync.py`, `backend/app/services/storage_service.py`, `backend/app/services/export_service.py`, `backend/app/routers/settings.py`, `backend/app/routers/export.py`, `backend/tests/test_api.py`, `frontend/src/api/client.ts`, `frontend/src/components/SettingsView.tsx`, `frontend/src/components/ExpenditureAnalysisScreen.tsx`, `run.py`, `Dockerfile`.
Edited: `backend/app/{config,database,main,models,schemas}.py`, `backend/requirements.txt`, `backend/.env.example`, `README.md`, `frontend/src/App.tsx`, `frontend/src/types/document.ts`, `frontend/src/components/{AccountModal,KlipitHomeScreen,KlipitReceiptsScreen,KlipitReceiptDetailsScreen,LoginPage,ProcessingModal}.tsx`.
Untracked from git (files kept on disk): `backend/.env`, `backend/smartbill.db`, `backend/uploads/*`, `backend/tools/cloudflared.exe`, all `__pycache__`.
Deleted: the 8 unused components listed in section 3.
