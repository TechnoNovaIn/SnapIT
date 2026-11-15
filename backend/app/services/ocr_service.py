import json
import logging
import os
import re
import sys
from pathlib import Path
from typing import Dict, Any, List, Optional, Union

import pypdf

from ..config import settings
from ..database import SessionLocal
from ..models import AppSetting

logger = logging.getLogger(__name__)

EXTRACTION_SYSTEM_PROMPT = """You are an expert AI document reader specializing in invoices, bills, receipts, purchase orders, medical bills, fuel bills, utility bills, and transport documents.

Analyze the uploaded document image/PDF with extreme precision. Extract the real structured information following these strict rules:
1. NEVER invent or hallucinate missing data. If an invoice number, date, tax amount, or line item is not clearly visible, return null for that field.
2. If text or a field is handwritten or ambiguous, mark the field name in the "uncertain_fields" array and provide your best reading or null.
3. Line items: Extract each item with exact description, quantity, unit_price, tax_amount, and total. Categorize each line item (e.g. Travel, Medical, Fuel, Office Supplies, Purchase, Utility Bill, Food & Beverage, Professional Services, Other). Set "is_suggested_category": true if you inferred the category.
4. Currency: Detect and preserve the exact ISO 4217 currency code (e.g. "INR", "USD", "EUR", "GBP"). For Indian receipts (₹, Rs, INR), use "INR".
5. Tax details: Extract GST / VAT / Tax registration number if present (e.g., Indian GSTIN format).
6. Document type: One of ["Receipt", "Tax Invoice", "Purchase Order", "Utility Bill", "Medical Bill", "Transport Bill", "Fuel Bill", "Fee Receipt", "Other"].
7. Calculate/extract subtotal, discount, tax_amount, and total_amount. Dates must be ISO format YYYY-MM-DD when the date is readable.
8. Suggest 2-4 concise tags for categorizing this document (e.g., ["Medical", "Pharmacy", "Reimbursement"] or ["Fuel", "Travel"]).

Return a valid JSON object matching this schema:
{
  "document_type": string,
  "merchant_name": string or null,
  "merchant_address": string or null,
  "customer_name": string or null,
  "invoice_number": string or null,
  "invoice_date": string or null,
  "due_date": string or null,
  "tax_id": string or null,
  "currency": string,
  "subtotal": float or null,
  "discount": float or null,
  "tax_amount": float or null,
  "total_amount": float or null,
  "payment_status": string or null,
  "confidence_score": float (between 0.0 and 1.0),
  "tags": [string],
  "uncertain_fields": [string],
  "line_items": [
    {
      "description": string,
      "category": string,
      "quantity": float,
      "unit_price": float,
      "tax_amount": float,
      "total": float,
      "is_suggested_category": boolean
    }
  ]
}
"""

# Models tried in order after the configured one.
_FALLBACK_MODELS = ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-2.0-flash"]

# Errors that will not get better by switching models (bad key, quota, permissions).
_NON_RETRYABLE_MARKERS = ("api key", "api_key", "permission_denied", "unauthenticated", "quota", "resource_exhausted", "401", "403", "429")


def _to_float(value, default: Optional[float] = None) -> Optional[float]:
    """Coerces values such as 1250, "1,250.00", "₹ 550/-" to float."""
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


class OCRService:
    @staticmethod
    def looks_like_google_key(api_key: Optional[str]) -> bool:
        key = (api_key or "").strip()
        if len(key) < 20:
            return False
        # Accept AIza* (AI Studio) and other Google Cloud API key formats
        if key.startswith("AIza"):
            return True
        # Google Cloud keys can have various prefixes; accept anything that
        # looks like a real key (long enough, printable ASCII, no spaces).
        return bool(re.fullmatch(r"[A-Za-z0-9_.+/=-]{20,}", key))

    @staticmethod
    def describe_engine(api_key: Optional[str]) -> str:
        if OCRService.looks_like_google_key(api_key):
            return "gemini"
        if sys.platform == "win32":
            return "local-winocr"
        return "local-text-only"

    @staticmethod
    def get_configured_api_key() -> str:
        # Check database settings first, then env
        try:
            with SessionLocal() as db:
                setting = db.query(AppSetting).filter(AppSetting.key == "gemini_api_key").first()
                if setting and setting.value:
                    return setting.value.strip()
        except Exception as e:
            logger.warning("Could not read gemini_api_key setting: %s", e)
        return os.getenv("GEMINI_API_KEY", settings.GEMINI_API_KEY).strip()

    @staticmethod
    def get_configured_model() -> str:
        try:
            with SessionLocal() as db:
                setting = db.query(AppSetting).filter(AppSetting.key == "gemini_model").first()
                if setting and setting.value:
                    return setting.value.strip()
        except Exception as e:
            logger.warning("Could not read gemini_model setting: %s", e)
        return os.getenv("GEMINI_MODEL", settings.GEMINI_MODEL).strip() or "gemini-3.8-flash"

    @classmethod
    def extract_document(cls, file_path: Union[str, Path], mime_type: str, original_filename: Optional[str] = None) -> Dict[str, Any]:
        """
        Main extraction entry point.
        Attempts Gemini Vision API if a key is configured; otherwise uses the local OCR / text
        extraction engine with rule-based parsing.
        """
        file_path = Path(file_path)
        api_key = cls.get_configured_api_key()
        model_name = cls.get_configured_model()

        if cls.looks_like_google_key(api_key):
            candidate_models = [model_name] + _FALLBACK_MODELS
            seen = set()
            unique_models = [m for m in candidate_models if m and not (m in seen or seen.add(m))]

            for candidate in unique_models:
                try:
                    logger.info("Trying Gemini API (%s)...", candidate)
                    result = cls._extract_with_gemini(file_path, mime_type, api_key, candidate)
                    if result:
                        result["engine"] = f"gemini:{candidate}"
                        return result
                except Exception as e:
                    msg = str(e).lower()
                    if any(marker in msg for marker in _NON_RETRYABLE_MARKERS):
                        logger.warning("Gemini request rejected (%s); not retrying other models: %s", candidate, e)
                        break
                    logger.warning("Gemini model %s error: %s. Trying next...", candidate, e)
        elif api_key:
            logger.info("GEMINI_API_KEY present but not recognized as a valid key format. Using local engine.")

        logger.info("Using local extraction engine...")
        result = cls._extract_with_local_engine(file_path, mime_type, original_filename=original_filename)
        result["engine"] = "local"
        return result

    @classmethod
    def _extract_with_gemini(cls, file_path: Path, mime_type: str, api_key: str, model_name: str) -> Optional[Dict[str, Any]]:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key, http_options={"timeout": 300})

        with open(file_path, "rb") as f:
            file_bytes = f.read()

        contents = [
            types.Part.from_bytes(data=file_bytes, mime_type=mime_type),
            EXTRACTION_SYSTEM_PROMPT
        ]

        response = client.models.generate_content(
            model=model_name,
            contents=contents,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1
            )
        )

        text = (getattr(response, "text", None) or "").strip()
        if not text:
            return None

        # Strip markdown code fences if the model added them despite the JSON mime type
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.I)
        text = re.sub(r"\s*```$", "", text)
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            # Try to salvage the first JSON object in the response
            m = re.search(r"\{.*\}", text, re.S)
            if not m:
                raise
            data = json.loads(m.group(0))
        if not isinstance(data, dict):
            return None
        return cls._validate_and_normalize(data)

    @classmethod
    def _extract_with_local_engine(cls, file_path: Path, mime_type: str, original_filename: Optional[str] = None) -> Dict[str, Any]:
        """
        Local parser: extracts digital text from PDFs (pypdf) or image text via native OCR,
        then applies rule-based heuristics to extract structured fields.
        """
        raw_text = ""
        filename_to_use = original_filename or file_path.name

        if mime_type == "application/pdf":
            try:
                reader = pypdf.PdfReader(str(file_path))
                for page in reader.pages:
                    page_text = page.extract_text()
                    if page_text:
                        raw_text += page_text + "\n"
            except Exception as e:
                logger.warning("PDF digital text extraction error: %s", e)

            # Scanned PDF (no digital text): render pages and OCR them
            if not raw_text.strip():
                try:
                    import pypdfium2 as pdfium
                    pdf = pdfium.PdfDocument(str(file_path))
                    for i in range(min(len(pdf), 3)):
                        page = pdf[i]
                        img = page.render(scale=2).to_pil()
                        ocr_page_text = cls._run_image_ocr(img)
                        if ocr_page_text:
                            raw_text += ocr_page_text + "\n"
                except Exception as scan_err:
                    logger.warning("Scanned PDF OCR error: %s", scan_err)

        elif mime_type.startswith("image/"):
            try:
                from PIL import Image, ImageOps
                with Image.open(file_path) as img:
                    img = ImageOps.exif_transpose(img)
                    raw_text = cls._run_image_ocr(img)
            except Exception as img_err:
                logger.warning("Image OCR error: %s", img_err)

        result = cls._parse_text_heuristically(raw_text, filename_to_use)
        result["raw_text"] = raw_text[:20000] if raw_text else None
        return result

    @staticmethod
    def _run_image_ocr(image) -> str:
        """
        Runs native OCR. On Windows this uses winocr in a dedicated worker thread (it needs its own
        event loop, which must not be the server's). On other platforms it falls back to pytesseract
        when that is installed, otherwise returns an empty string.
        """
        try:
            from PIL import Image, ImageEnhance, ImageOps

            # Ensure image is RGB
            if image.mode != "RGB":
                image = image.convert("RGB")

            # Upscale small images; OCR engines do much better above ~1200px wide
            w, h = image.size
            base_img = image
            if w < 1200:
                scale = 1200 / max(w, 1)
                base_img = image.resize((1200, int(h * scale)), Image.Resampling.LANCZOS)

            # Enhanced grayscale variant (contrast + sharpness) for low-contrast phone photos / blue ink
            gray = ImageOps.grayscale(base_img)
            enhanced = ImageEnhance.Contrast(gray).enhance(2.2)
            enhanced = ImageEnhance.Sharpness(enhanced).enhance(2.0).convert("RGB")

            runner = OCRService._ocr_runner()
            if runner is None:
                logger.info("No local OCR engine available on this platform (winocr/pytesseract missing)")
                return ""

            best_text = runner(base_img)
            enhanced_text = runner(enhanced)
            if len(enhanced_text.strip()) > len(best_text.strip()):
                best_text = enhanced_text
            return best_text.strip()
        except Exception as e:
            logger.warning("OCR execution note: %s", e)
            return ""

    @staticmethod
    def _ocr_runner():
        """Returns a callable(PIL.Image) -> str for the best available local OCR engine, or None."""
        try:
            import winocr  # Windows only
            import asyncio
            import concurrent.futures

            def run_winocr(img_pil) -> str:
                def worker():
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    try:
                        res = loop.run_until_complete(winocr.recognize_pil(img_pil, "en"))
                        return res.text if res else ""
                    finally:
                        loop.close()
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                    return pool.submit(worker).result()

            return run_winocr
        except Exception:
            pass

        try:
            import pytesseract

            def run_tesseract(img_pil) -> str:
                return pytesseract.image_to_string(img_pil) or ""

            return run_tesseract
        except Exception:
            return None

    @classmethod
    def _parse_words_amount(cls, text: str) -> Optional[float]:
        """Parses 'Rupees Three Thousand One Hundred Only' style amounts."""
        try:
            m = re.search(
                r'(?:inr|rs\.?|rupees|amount(?:\s*chargeable)?(?:\s*in\s*words)?)\s*(?:is)?\s*[:.\s-]*([A-Za-z\s-]+?)(?:only|\.|\n|$)',
                text,
                re.IGNORECASE
            )
            if not m:
                return None
            words_str = m.group(1).strip()
            units = {
                "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
                "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
                "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
                "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19
            }
            tens = {
                "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
                "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90
            }
            scales = {
                "thousand": 1000, "thousands": 1000,
                "lakh": 100000, "lakhs": 100000,
                "crore": 10000000, "crores": 10000000
            }
            words = re.sub(r"\band\b", " ", words_str.lower().replace("-", " ")).split()
            known = set(units) | set(tens) | set(scales) | {"hundred", "hundreds"}
            if not words or not all(w in known for w in words):
                return None
            total = 0
            current = 0
            for w in words:
                if w in units:
                    current += units[w]
                elif w in tens:
                    current += tens[w]
                elif w in ("hundred", "hundreds"):
                    current = max(1, current) * 100
                elif w in scales:
                    current = max(1, current) * scales[w]
                    total += current
                    current = 0
            total += current
            return float(total) if total > 0 else None
        except Exception:
            return None

    @classmethod
    def _parse_text_heuristically(cls, text: str, filename: str) -> Dict[str, Any]:
        """
        Parses OCR text to extract merchant, dates, invoice numbers, currency, line items, and totals.
        Fields that cannot be read are returned as null and listed in uncertain_fields.
        """
        uncertain_fields: List[str] = []
        text = text or ""

        # Pre-segment continuous single-line OCR streams on invoice section keywords
        segment_keywords = [
            r'Consignee\s*\(Ship\s*to\)',
            r'Buyer\s*\(Bill\s*to\)',
            r'Tax\s*Invoice',
            r'Cash\s*Bill',
            r'Invoice\s*No',
            r'Delivery\s*Note',
            r'Dated\s*[.:]',
            r'GSTIN/UIN',
            r'Place\s*of\s*Supply',
            r'Description\s*of\s*Goods',
            r'Output\s*CGST',
            r'Output\s*SGST',
            r'Round\s*Off',
            r'Amount\s*Chargeable',
            r'Company\'?s\s*Bank\s*Details',
            r'Alc\s*Holders?\s*Name',
            r'Bank\s*Name',
            r'Warranty\s*Terms',
            r'Declaration\b'
        ]
        segmented_text = text
        for kw in segment_keywords:
            segmented_text = re.sub(f'\\s*({kw})', r'\n\1', segmented_text, flags=re.IGNORECASE)

        lines = [line.strip() for line in re.split(r'[\r\n]+', segmented_text) if line.strip()]
        cleaned_text = re.sub(r'[ \t]+', ' ', segmented_text)
        text_lower = text.lower()

        # 1. Currency
        is_indian = bool(
            re.search(r'\b(?:gstin|gst|karnataka|bengaluru|bangalore|tumkur|tumakuru|dharwad|mumbai|delhi|lakh|crore|rupees|rs\.?|inr)\b', text, re.I)
            or "₹" in text
        )
        if is_indian:
            currency = "INR"
        elif "$" in text or re.search(r'\bUSD\b', text):
            currency = "USD"
        elif "£" in text or re.search(r'\bGBP\b', text):
            currency = "GBP"
        elif "€" in text or re.search(r'\bEUR\b', text):
            currency = "EUR"
        else:
            currency = settings.DEFAULT_CURRENCY

        # 2. Merchant Name Extraction
        merchant_name = None
        merchant_address = None

        def is_phone_or_contact(s: str) -> bool:
            c = s.strip()
            if re.match(r'^(?:mob|mobile|cell|phone|ph|tel|contact|call|fax|helpline|care)[\s.:/|-]*', c, re.I):
                return True
            digits = re.findall(r'\d', c)
            if len(digits) >= 8 and len(digits) / max(len(c), 1) > 0.35:
                return True
            return False

        def is_tax_or_header(s: str) -> bool:
            c = s.strip()
            if re.search(r'\b(?:patient|customer|buyer|client|billed\s*to|ship\s*to)\b', c, re.I):
                return True
            if re.match(r'^(?:gstin|gst|vat|tin|pan|cin|fssai|dl\s*no|d\.l\.|tan|regd)[\s.:/|-]*', c, re.I):
                return True
            if re.match(r'^(?:tax\s*invoice|retail\s*invoice|cash\s*memo|cash\s*bill|estimate|quotation|receipt|bill\s*no|invoice\s*no|date|time|welcome|original|duplicate|triplicate|total|subtotal|grand\s*total|net\s*payable|amount|amt|balance)[\s.:/|-]*', c, re.I):
                return True
            if re.match(r'^(?:\|\||//)\s*(?:om|sri|shri|shree|jai|bismillah|allah|786)\s*(?:\|\||//)?$', c, re.I):
                return True
            return False

        def is_address_text(s: str) -> bool:
            c = s.strip().lower()
            address_words = [
                "station road", "road", "street", "nagar", "colony", "layout", "cross", "main",
                "floor", "bldg", "building", "complex", "plot", "shop no", "opp", "opposite",
                "near", "behind", "beside", "circle", "hubballi", "bangalore", "bengaluru",
                "mumbai", "delhi", "chennai", "hyderabad", "pune", "karnataka", "maharashtra",
                "pin", "pincode", "dist", "district"
            ]
            return any(w in c for w in address_words)

        biz_suffix_split = r'([A-Za-z]{3,})(MARKETING|ENTERPRISES|AGENCIES|TRADERS|PHARMACY|STORES|STORE|MEDICAL|SERVICES|HOSPITAL|CLINIC|BAZAAR|MOTORS)\b'

        # Step 2A: Direct detection of a commercial name with business suffix in the document header
        spaced_text = re.sub(biz_suffix_split, r'\1 \2', text, flags=re.I)
        biz_suffix_pattern = r'\b([A-Za-z0-9\s&().,\'-]{2,50}?(?:ENTERPRISES|LOGISTICS|TRANSPORT|MARKETING|AGENCIES|SERVICES|HOSPITAL|PHARMACY|STORES|STORE|MEDICAL|CLINIC|BAZAAR|TRADERS|PVT\s*LTD|COMPANY|MOTORS|MART|LTD|CO\b)(?:\s+(?:STORES|STORE|AGENCY|AGENCIES|SERVICES|LTD|PVT\s*LTD))?)\b'
        biz_match = re.search(biz_suffix_pattern, spaced_text[:400], re.I)
        if biz_match:
            cand = biz_match.group(1).strip()
            cand = re.sub(r'^(?:mob|mobile|cell|ph|phone|gstin|gst|date|cash|credit|tax|inv|invoice|\d{8,12})[\s.:/|-]*', '', cand, flags=re.I).strip()
            if not is_phone_or_contact(cand) and not is_tax_or_header(cand) and len(cand) >= 3:
                merchant_name = cand

        valid_merchant_candidates = []
        for line in lines[:8]:
            if is_phone_or_contact(line) or is_tax_or_header(line):
                continue

            clean_cand = re.split(r'\s+(?:station\b|road\b|street\b|nagar\b|opp\b|near\b|behind\b|ph\b|mob\b|date\b|cete\b|bill\b|inv\b|gstin\b|\d{5,6})', line, flags=re.I)[0].strip()
            clean_cand = re.sub(biz_suffix_split, r'\1 \2', clean_cand, flags=re.I)

            if is_address_text(clean_cand):
                if not merchant_address:
                    merchant_address = line
                continue

            letters = re.findall(r'[A-Za-z]', clean_cand)
            if len(letters) < 3 or len(clean_cand) > 60:
                continue

            digits = re.findall(r'\d', clean_cand)
            if len(digits) / len(clean_cand) > 0.30:
                continue

            valid_merchant_candidates.append(clean_cand)

        if not merchant_name and valid_merchant_candidates:
            biz_keywords = [
                "marketing", "medical", "store", "stores", "general", "pharmacy", "hospital", "clinic",
                "hotel", "restaurant", "bazaar", "mart", "supermarket", "enterprise",
                "enterprises", "traders", "agency", "agencies", "transport", "logistics",
                "motors", "services", "ltd", "pvt", "co.", "company", "cafe", "bakers"
            ]
            for cand in valid_merchant_candidates:
                if any(k in cand.lower() for k in biz_keywords):
                    merchant_name = cand
                    break
            if not merchant_name:
                merchant_name = valid_merchant_candidates[0]

        # Single-block text fallback (OCR output without newlines)
        if not merchant_name:
            m = re.search(r'^\s*([A-Za-z0-9\s&().,\'-]{3,60}?)(?=\s+(?:station\s*road|road|street|nagar|gstin|phone|mob|cell|bill\s*no|tax\s*invoice|date)\b)', text, re.I)
            if m:
                cand = m.group(1).strip()
                cand = re.sub(biz_suffix_split, r'\1 \2', cand, flags=re.I)
                if not is_phone_or_contact(cand) and not is_tax_or_header(cand) and not is_address_text(cand):
                    merchant_name = cand

        if not merchant_address and lines:
            for line in lines[1:6]:
                if is_address_text(line):
                    merchant_address = line
                    break

        if merchant_name:
            merchant_name = merchant_name.strip(" -:|.,")[:255] or None

        if not merchant_name:
            # The filename is only a hint and is never trusted on its own.
            uncertain_fields.append("merchant_name")

        # 3. Invoice Number
        STOP_WORDS = {
            "for", "mob", "mobile", "cell", "phone", "date", "cash", "credit", "to", "the", "and",
            "of", "in", "at", "by", "is", "payment", "state", "bank", "receipt", "invoice", "bill",
            "memo", "total", "amount", "rs", "inr", "erence", "reference", "references", "other",
            "delivery", "note", "dated", "challan", "order", "no", "number"
        }
        invoice_number = None

        ref_match = re.search(r'\b(?:sbcollect\s+reference\s+number|reference\s+number|ref\s*no|invoice\s*no|tax\s*invoice\s*no|bill\s*no|receipt\s*no)\s*[:.,\s#-]+([A-Za-z0-9\/-]+)', text, re.IGNORECASE)
        if ref_match and ref_match.group(1).strip().lower() not in STOP_WORDS and not ref_match.group(1).strip().lower().startswith("erence"):
            invoice_number = ref_match.group(1).strip()
        else:
            inv_matches = re.finditer(r'\b(?:tax\s*invoice|invoice|inv|bill|receipt|po|memo|cash\s*memo)\s*(?:no|number|#)?[:.,\s#-]+([A-Za-z0-9\/-]+)', text, re.IGNORECASE)
            for m in inv_matches:
                cand = m.group(1).strip()
                if cand.lower() not in STOP_WORDS and not cand.lower().startswith("erence") and len(cand) >= 2:
                    invoice_number = cand
                    break

        if not invoice_number:
            inv_fallback = re.search(r'\b(?:no|#)[:.,\s#-]+([0-9]{3,8})\b', text, re.IGNORECASE)
            if inv_fallback:
                invoice_number = inv_fallback.group(1).strip()
            else:
                uncertain_fields.append("invoice_number")

        # 4. Dates
        invoice_date = None
        date_match = re.search(r'\b(\d{1,2}[-\/\s](?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[-\/\s]\d{2,4})\b', text, re.I)
        if date_match:
            invoice_date = date_match.group(1)
        else:
            num_date = re.search(r'\b(\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}|\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2})\b', text)
            if num_date:
                invoice_date = num_date.group(1)
            else:
                uncertain_fields.append("invoice_date")

        # 5. GSTIN / Tax ID
        tax_id = None
        gst_match = re.search(r'\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b', text)
        if gst_match:
            tax_id = gst_match.group(0)
        else:
            tax_match = re.search(r'(?:gstin|gst\s*no|vat\s*no|tax\s*id)[:.\s-]*([A-Za-z0-9]{6,})', text, re.IGNORECASE)
            if tax_match:
                tax_id = tax_match.group(1)

        # 6. Amounts & Totals
        total_amount = None
        subtotal = None
        tax_amount = None

        def _first_positive(values, reverse=True):
            seq = reversed(values) if reverse else values
            for val in seq:
                num = _to_float(val)
                if num and num > 0:
                    return num
            return None

        # Level 0: amount in words (Indian invoices)
        words_amt = cls._parse_words_amount(text)
        if words_amt and words_amt > 0:
            total_amount = words_amt

        # Level A: Grand Totals / Final Payable
        grand_pattern = re.findall(
            r'(?:grand(?:\s*tota[lt])?|final\s*amount|net\s*payable|amount\s*payable|balance\s*due)(?:\s*\([^)]*\))?\s*[:.\s-]*(?:inr|rs\.?|₹|\$|€|£)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:\/-)?',
            cleaned_text,
            re.I
        )
        if grand_pattern:
            total_amount = _first_positive(grand_pattern) or total_amount

        # Level B: General Total amounts
        if total_amount is None:
            high_conf_pattern = re.findall(
                r'(?:tota[lt](?:\s*amount)?|net\s*amount|bill\s*amount)(?:\s*\([^)]*\))?\s*[:.\s-]*(?:inr|rs\.?|₹|\$|€|£)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:\/-)?',
                cleaned_text,
                re.I
            )
            total_amount = _first_positive(high_conf_pattern)

        # Level C: Explicit currency amount (e.g. INR 3100.00 or Rs. 550/-)
        if total_amount is None:
            currency_matches = re.findall(r'(?:inr|rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:\/-)?', cleaned_text, re.I)
            total_amount = _first_positive(currency_matches)

        # Level D: Generic Total / Amt / Amount / Paid (largest value)
        if total_amount is None:
            total_matches = re.findall(
                r'\b(?:tota[lt]|grand|amount|amt|paid)\s*[:.\s-]*(?:inr|rs\.?|₹|\$|€|£)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:\/-)?',
                cleaned_text,
                re.I
            )
            valid_totals = [n for n in (_to_float(v) for v in total_matches) if n and n > 0]
            if valid_totals:
                total_amount = max(valid_totals)

        # Level E: Trailing numbers with /- e.g. 550/-
        if total_amount is None:
            slash_matches = re.findall(r'\b([\d,]+(?:\.\d{1,2})?)\s*\/-', cleaned_text)
            total_amount = _first_positive(slash_matches)

        sub_match = re.search(r'(?:subtotal|sub\s*total)\s*[:.\s-]*(?:inr|rs\.?|₹|\$|€|£)?\s*([\d,]+\.?\d*)', cleaned_text, re.I)
        if sub_match:
            subtotal = _to_float(sub_match.group(1))

        tax_match_amt = re.search(r'\b(?:total\s*tax|tax\s*amount|gst\s*amount|igst|vat)\s*(?:\([^)]*\))?\s*[:.\s-]*(?:inr|rs\.?|₹|\$|€|£)?\s*([\d,]+(?:\.\d{1,2})?)', cleaned_text, re.I)
        if tax_match_amt:
            tax_amount = _to_float(tax_match_amt.group(1))

        if total_amount is None:
            uncertain_fields.append("total_amount")

        # 7. Line items parsing: "<description> <qty> <unit price> <line total>"
        line_items = []
        row_regex = re.compile(r'([A-Za-z0-9\s&()\-]{3,35})\s+(\d+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)')
        for line in lines:
            m = row_regex.search(line)
            if not m:
                continue
            desc = m.group(1).strip()
            if desc.lower() in ["subtotal", "total", "tax", "gst", "amount", "description", "item"]:
                continue
            qty = _to_float(m.group(2))
            unit_p = _to_float(m.group(3))
            item_tot = _to_float(m.group(4))
            if qty is None or unit_p is None or item_tot is None:
                continue
            line_items.append({
                "description": desc,
                "category": cls._infer_category(desc),
                "quantity": qty,
                "unit_price": unit_p,
                "tax_amount": 0.0,
                "total": item_tot,
                "is_suggested_category": True
            })

        # No itemised rows: represent the bill as a single line only when a total was actually read.
        if not line_items:
            if total_amount:
                line_items.append({
                    "description": merchant_name or "Purchase",
                    "category": "Purchase",
                    "quantity": 1.0,
                    "unit_price": total_amount,
                    "tax_amount": 0.0,
                    "total": total_amount,
                    "is_suggested_category": True
                })
            uncertain_fields.append("line_items")

        # Document Type classification
        doc_type = "Receipt"
        if "tax invoice" in text_lower or "gst invoice" in text_lower:
            doc_type = "Tax Invoice"
        elif "purchase order" in text_lower or "p.o." in text_lower:
            doc_type = "Purchase Order"
        elif any(w in text_lower for w in ["medical", "pharmacy", "hospital", "medicine", "tablets", "pharma"]):
            doc_type = "Medical Bill"
        elif any(w in text_lower for w in ["fuel", "petrol", "diesel", "cng"]):
            doc_type = "Fuel Bill"
        elif any(w in text_lower for w in ["electricity", "utility", "water bill"]):
            doc_type = "Utility Bill"
        elif any(w in text_lower for w in ["transport", "freight", "trip", "toll", "logistics"]):
            doc_type = "Transport Bill"
        elif any(w in text_lower for w in ["fee receipt", "application fee", "tuition", "admission fee"]):
            doc_type = "Fee Receipt"

        tags = [doc_type]
        if merchant_name:
            tags.append(merchant_name[:20].strip())

        # Payment status only when explicitly stated ("unpaid" contains "paid", so check it first)
        if re.search(r'\b(?:unpaid|balance\s*due|due\s*amount)\b', text_lower):
            payment_status = "Unpaid"
        elif re.search(r'\b(?:paid|payment\s*received|received\s*with\s*thanks|successful)\b', text_lower):
            payment_status = "Paid"
        else:
            payment_status = None

        has_uncertainties = bool(uncertain_fields) or not total_amount or not merchant_name
        if not text.strip():
            confidence = 0.1
        elif has_uncertainties:
            confidence = 0.55
        else:
            confidence = 0.88

        return {
            "document_type": doc_type,
            "merchant_name": merchant_name,
            "merchant_address": merchant_address,
            "customer_name": None,
            "invoice_number": invoice_number,
            "invoice_date": invoice_date,
            "due_date": None,
            "tax_id": tax_id,
            "currency": currency,
            "subtotal": subtotal if subtotal is not None else total_amount,
            "discount": 0.0,
            "tax_amount": tax_amount if tax_amount is not None else 0.0,
            "total_amount": total_amount,
            "payment_status": payment_status,
            "confidence_score": confidence,
            "tags": tags,
            "uncertain_fields": list(dict.fromkeys(uncertain_fields)),
            "line_items": line_items
        }

    @classmethod
    def _infer_category(cls, desc: str) -> str:
        d = desc.lower()
        if any(w in d for w in ["medicine", "tablet", "syrup", "capsule", "doctor", "consultation", "pharma"]):
            return "Medical"
        if any(w in d for w in ["tyre", "tyres", "tube", "tubes", "flap", "flaps", "wheel", "alignment", "radial", "nylon"]):
            return "Vehicle Maintenance"
        if any(w in d for w in ["fuel", "petrol", "diesel", "gas", "cng"]):
            return "Fuel"
        if any(w in d for w in ["transport", "taxi", "cab", "flight", "train", "bus", "travel", "uber", "ola"]):
            return "Travel"
        if any(w in d for w in ["pen", "paper", "stationery", "notebook", "print", "cartridge", "file", "stapler"]):
            return "Office Supplies"
        if any(w in d for w in ["electricity", "power", "water", "broadband", "internet", "phone"]):
            return "Utility Bill"
        if any(w in d for w in ["food", "meal", "coffee", "restaurant", "lunch", "dinner"]):
            return "Food & Beverage"
        return "Purchase"

    @classmethod
    def _validate_and_normalize(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Coerces model output into clean types: numbers may arrive as strings, lists may be missing,
        and the confidence score must stay within [0, 1].
        """
        data["document_type"] = str(data.get("document_type") or "Receipt")
        data["currency"] = str(data.get("currency") or "INR").upper()[:10]
        data["tags"] = [str(t) for t in (data.get("tags") or []) if t] if isinstance(data.get("tags"), list) else []
        data["uncertain_fields"] = [str(f) for f in (data.get("uncertain_fields") or []) if f] if isinstance(data.get("uncertain_fields"), list) else []
        raw_items = data.get("line_items") or []
        data["line_items"] = [i for i in raw_items if isinstance(i, dict)] if isinstance(raw_items, list) else []

        for key in ("subtotal", "discount", "tax_amount", "total_amount"):
            data[key] = _to_float(data.get(key))
        for key in ("merchant_name", "merchant_address", "customer_name", "invoice_number", "invoice_date", "due_date", "tax_id", "payment_status"):
            val = data.get(key)
            data[key] = str(val).strip() if val not in (None, "", "null", "None") else None

        conf = _to_float(data.get("confidence_score"), 0.85)
        data["confidence_score"] = min(max(conf, 0.0), 1.0)

        for item in data["line_items"]:
            item["description"] = str(item.get("description") or "Item").strip() or "Item"
            item["category"] = str(item.get("category") or "General").strip() or "General"
            item["quantity"] = _to_float(item.get("quantity"), 1.0)
            item["unit_price"] = _to_float(item.get("unit_price"), 0.0)
            item["tax_amount"] = _to_float(item.get("tax_amount"), 0.0)
            total = _to_float(item.get("total"))
            item["total"] = total if total is not None else round(item["quantity"] * item["unit_price"], 2)
            item["is_suggested_category"] = bool(item.get("is_suggested_category", False))

        # A total that was not read but can be derived from itemised rows is still flagged for review.
        if data["total_amount"] is None and data["line_items"]:
            derived = round(sum(i["total"] for i in data["line_items"]), 2)
            if derived > 0:
                data["total_amount"] = derived
                if "total_amount" not in data["uncertain_fields"]:
                    data["uncertain_fields"].append("total_amount")

        return data
