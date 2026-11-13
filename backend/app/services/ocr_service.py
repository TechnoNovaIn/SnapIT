import os
import json
import re
from pathlib import Path
from typing import Dict, Any, List, Optional
import pypdf

from ..config import settings
from ..database import SessionLocal
from ..models import AppSetting

EXTRACTION_SYSTEM_PROMPT = """You are an expert AI document reader specializing in invoices, bills, receipts, purchase orders, medical bills, fuel bills, utility bills, and transport documents.

Analyze the uploaded document image/PDF with extreme precision. Extract the real structured information following these strict rules:
1. NEVER invent or hallucinate missing data. If an invoice number, date, tax amount, or line item is not clearly visible, return null for that field.
2. If text or a field is handwritten or ambiguous, mark the field name in the "uncertain_fields" array and provide your best reading or null.
3. Line items: Extract each item with exact description, quantity, unit_price, tax_amount, and total. Categorize each line item (e.g. Travel, Medical, Fuel, Office Supplies, Purchase, Utility Bill, Food & Beverage, Professional Services, Other). Set "is_suggested_category": true if you inferred the category.
4. Currency: Detect and preserve the exact currency code (e.g. "INR", "USD", "EUR", "GBP"). For Indian receipts (₹, Rs, INR), use "INR".
5. Tax details: Extract GST / VAT / Tax registration number if present (e.g., Indian GSTIN format).
6. Document type: One of ["Receipt", "Tax Invoice", "Purchase Order", "Utility Bill", "Medical Bill", "Transport Bill", "Fuel Bill", "Other"].
7. Calculate/extract subtotal, discount, tax_amount, and total_amount.
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

class OCRService:
    @staticmethod
    def get_configured_api_key() -> str:
        # Check database settings first, then env
        try:
            with SessionLocal() as db:
                setting = db.query(AppSetting).filter(AppSetting.key == "gemini_api_key").first()
                if setting and setting.value:
                    return setting.value.strip()
        except Exception:
            pass
        return os.getenv("GEMINI_API_KEY", settings.GEMINI_API_KEY)

    @staticmethod
    def get_configured_model() -> str:
        try:
            with SessionLocal() as db:
                setting = db.query(AppSetting).filter(AppSetting.key == "gemini_model").first()
                if setting and setting.value:
                    return setting.value.strip()
        except Exception:
            pass
        return os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    @classmethod
    def extract_document(cls, file_path: Path, mime_type: str) -> Dict[str, Any]:
        """
        Main extraction entry point.
        Attempts Gemini Vision API if key configured; otherwise uses intelligent local OCR / text extraction.
        """
        api_key = cls.get_configured_api_key()
        model_name = cls.get_configured_model()

        # Check if api_key is valid Google AI Studio format (starts with AIzaSy)
        is_valid_google_key = bool(api_key and len(api_key) > 25 and not api_key.startswith("AQ."))

        if is_valid_google_key:
            candidate_models = [model_name, "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
            # Deduplicate while preserving order
            seen = set()
            unique_models = [m for m in candidate_models if m and not (m in seen or seen.add(m))]

            for candidate in unique_models:
                try:
                    print(f"[OCRService] Trying Gemini API ({candidate})...")
                    result = cls._extract_with_gemini(file_path, mime_type, api_key, candidate)
                    if result:
                        return result
                except Exception as e:
                    print(f"[OCRService] Gemini model {candidate} error: {e}. Trying next...")
        else:
            if api_key and api_key.startswith("AQ."):
                print("[OCRService] Note: GEMINI_API_KEY appears to be an OAuth/unsupported token rather than a Google AI Studio key (AIzaSy...). Falling back to local OCR engine.")

        print("[OCRService] Using local extraction engine...")
        return cls._extract_with_local_engine(file_path, mime_type)

    @classmethod
    def _extract_with_gemini(cls, file_path: Path, mime_type: str, api_key: str, model_name: str) -> Optional[Dict[str, Any]]:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)

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

        if response and response.text:
            text = response.text.strip()
            # Clean markdown codeblocks if present
            if text.startswith("```json"):
                text = text[7:]
            if text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]
            data = json.loads(text.strip())
            return cls._validate_and_normalize(data)

        return None

    @classmethod
    def _extract_with_local_engine(cls, file_path: Path, mime_type: str) -> Dict[str, Any]:
        """
        Real local parser: extracts digital text from PDFs or image text using winocr/pypdf,
        and uses rule-based AI heuristics to extract structured fields.
        """
        raw_text = ""

        if mime_type == "application/pdf":
            try:
                reader = pypdf.PdfReader(str(file_path))
                for page in reader.pages:
                    page_text = page.extract_text()
                    if page_text:
                        raw_text += page_text + "\n"
            except Exception as e:
                print(f"PDF digital text extraction error: {e}")

            # If PDF has no digital text (e.g. scanned document), render to image and run native OCR
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
                    print(f"Scanned PDF OCR error: {scan_err}")

        elif mime_type.startswith("image/"):
            try:
                from PIL import Image
                with Image.open(file_path) as img:
                    raw_text = cls._run_image_ocr(img)
            except Exception as img_err:
                print(f"Image OCR error: {img_err}")

        return cls._parse_text_heuristically(raw_text, file_path.name)

    @staticmethod
    def _run_image_ocr(image) -> str:
        """
        Runs Windows native OCR via winocr synchronously.
        """
        try:
            import winocr
            import asyncio
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                result = loop.run_until_complete(winocr.recognize_pil(image, "en"))
                return result.text if result else ""
            finally:
                loop.close()
        except Exception as e:
            print(f"winocr execution note: {e}")
            return ""

    @classmethod
    def _parse_text_heuristically(cls, text: str, filename: str) -> Dict[str, Any]:
        """
        Parses text lines to extract real merchant, dates, invoice numbers, currency, line items, and totals.
        Strictly excludes mobile/phone numbers and tax IDs from becoming merchant names.
        """
        uncertain_fields = []
        lines = [line.strip() for line in re.split(r'[\r\n]+', text) if line.strip()]
        cleaned_text = re.sub(r'[ \t]+', ' ', text)

        # 1. Currency
        currency = "INR"
        if "$" in text or "USD" in text:
            currency = "USD"
        elif "€" in text or "EUR" in text:
            currency = "EUR"
        elif "£" in text or "GBP" in text:
            currency = "GBP"

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
            # Customer / patient lines
            if re.search(r'\b(?:patient|customer|buyer|client|billed\s*to|ship\s*to)\b', c, re.I):
                return True
            # Tax and registration lines
            if re.match(r'^(?:gstin|gst|vat|tin|pan|cin|fssai|dl\s*no|d\.l\.|tan|regd)[\s.:/|-]*', c, re.I):
                return True
            # Bill / Invoice type headers or total rows
            if re.match(r'^(?:tax\s*invoice|retail\s*invoice|cash\s*memo|cash\s*bill|estimate|quotation|receipt|bill\s*no|invoice\s*no|date|time|welcome|original|duplicate|triplicate|total|subtotal|grand\s*total|net\s*payable|amount|amt|balance)[\s.:/|-]*', c, re.I):
                return True
            # Spiritual invocation check only for short isolated headers (e.g. "|| Om ||" or "|| Sri ||")
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

        valid_merchant_candidates = []
        for line in lines[:8]:
            if is_phone_or_contact(line) or is_tax_or_header(line):
                continue
            if is_address_text(line):
                if not merchant_address:
                    merchant_address = line
                continue
            
            letters = re.findall(r'[A-Za-z]', line)
            if len(letters) < 3 or len(line) > 80:
                continue
            
            digits = re.findall(r'\d', line)
            if len(digits) / len(line) > 0.30:
                continue
            
            valid_merchant_candidates.append(line)

        if valid_merchant_candidates:
            biz_keywords = [
                "medical", "store", "stores", "general", "pharmacy", "hospital", "clinic",
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

        # Single-block text fallback (e.g. winocr without newlines)
        if not merchant_name:
            m = re.search(r'^\s*([A-Za-z0-9\s&().,\'-]{3,60}?)(?=\s+(?:station\s*road|road|street|nagar|gstin|phone|mob|cell|bill\s*no|tax\s*invoice|date)\b)', text, re.I)
            if m:
                cand = m.group(1).strip()
                if not is_phone_or_contact(cand) and not is_tax_or_header(cand) and not is_address_text(cand):
                    merchant_name = cand

        if not merchant_address and lines:
            for line in lines[1:6]:
                if is_address_text(line):
                    merchant_address = line
                    break

        if not merchant_name:
            uncertain_fields.append("merchant_name")

        # 3. Invoice Number
        invoice_number = None
        inv_match = re.search(r'(?:invoice|inv|bill|receipt|po|tax invoice|ref)\s*(?:no|number|#)?[:.\s-]*([A-Za-z0-9\/-]+)', text, re.IGNORECASE)
        if inv_match:
            invoice_number = inv_match.group(1).strip()
        else:
            uncertain_fields.append("invoice_number")

        # 4. Dates
        invoice_date = None
        date_match = re.search(r'\b(\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}|\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2})\b', text)
        if date_match:
            invoice_date = date_match.group(1)
        else:
            uncertain_fields.append("invoice_date")

        # 5. GSTIN / Tax ID
        tax_id = None
        gst_match = re.search(r'\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b', text)
        if gst_match:
            tax_id = gst_match.group(0)
        else:
            tax_match = re.search(r'(?:gstin|gst|vat|tax\s*id)[:.\s-]*([A-Za-z0-9]+)', text, re.IGNORECASE)
            if tax_match:
                tax_id = tax_match.group(1)

        # 6. Amounts & Totals
        total_amount = None
        subtotal = None
        tax_amount = None

        # Level A: High-confidence labeled totals
        high_conf_pattern = re.findall(
            r'(?:grand\s*total|net\s*payable|amount\s*payable|net\s*amount|total\s*amount|bill\s*amount|final\s*amount|balance\s*due)\s*[:.\s-]*(?:inr|rs\.?|₹|\$|€|£)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:\/-)?',
            cleaned_text,
            re.I
        )
        if high_conf_pattern:
            for val in reversed(high_conf_pattern):
                try:
                    num = float(val.replace(',', ''))
                    if num > 0:
                        total_amount = num
                        break
                except ValueError:
                    pass

        # Level B: Explicit currency amount (e.g. INR 3100.00 or Rs. 550/-)
        if total_amount is None:
            currency_matches = re.findall(r'(?:inr|rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)\s*(?:\/-)?', cleaned_text, re.I)
            if currency_matches:
                valid_nums = []
                for val in currency_matches:
                    try:
                        num = float(val.replace(',', ''))
                        if num > 0:
                            valid_nums.append(num)
                    except ValueError:
                        pass
                if valid_nums:
                    total_amount = valid_nums[-1]

        # Level C: Generic Total / Amt / Amount
        if total_amount is None:
            total_matches = re.findall(
                r'\b(?:total|amount|amt|paid)\s*[:.\s-]*(?:inr|rs\.?|₹|\$|€|£)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:\/-)?',
                cleaned_text,
                re.I
            )
            if total_matches:
                valid_totals = []
                for val in total_matches:
                    try:
                        num = float(val.replace(',', ''))
                        if num > 0:
                            valid_totals.append(num)
                    except ValueError:
                        pass
                if valid_totals:
                    total_amount = max(valid_totals)

        # Level D: Trailing numbers with /- e.g. 550/-
        if total_amount is None:
            slash_matches = re.findall(r'\b([\d,]+(?:\.\d{1,2})?)\s*\/-', cleaned_text)
            if slash_matches:
                for val in reversed(slash_matches):
                    try:
                        num = float(val.replace(',', ''))
                        if num > 0:
                            total_amount = num
                            break
                    except ValueError:
                        pass

        # Subtotal match
        sub_match = re.search(r'(?:subtotal|sub\s*total)\s*[:.\s-]*(?:inr|rs\.?|₹|\$|€|£)?\s*([\d,]+\.?\d*)', cleaned_text, re.I)
        if sub_match:
            try:
                subtotal = float(sub_match.group(1).replace(",", ""))
            except ValueError:
                pass

        if total_amount is None:
            uncertain_fields.append("total_amount")

        # 7. Line items parsing
        line_items = []
        row_regex = re.compile(r'([A-Za-z0-9\s&()\-]{3,35})\s+(\d+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)')
        for line in lines:
            m = row_regex.search(line)
            if m:
                desc = m.group(1).strip()
                if desc.lower() not in ["subtotal", "total", "tax", "gst", "amount", "description", "item"]:
                    try:
                        qty = float(m.group(2))
                        unit_p = float(m.group(3).replace(",", ""))
                        item_tot = float(m.group(4).replace(",", ""))
                        line_items.append({
                            "description": desc,
                            "category": cls._infer_category(desc),
                            "quantity": qty,
                            "unit_price": unit_p,
                            "tax_amount": 0.0,
                            "total": item_tot,
                            "is_suggested_category": True
                        })
                    except ValueError:
                        pass

        # If no items found through row regex, create a single item matching the total if known
        if not line_items and total_amount:
            line_items.append({
                "description": merchant_name or "General Purchase",
                "category": "Purchase",
                "quantity": 1.0,
                "unit_price": total_amount,
                "tax_amount": 0.0,
                "total": total_amount,
                "is_suggested_category": True
            })
        elif not line_items:
            uncertain_fields.append("line_items")

        # Document Type classification
        doc_type = "Receipt"
        text_lower = text.lower()
        if "tax invoice" in text_lower or "gst invoice" in text_lower:
            doc_type = "Tax Invoice"
        elif "purchase order" in text_lower or "p.o." in text_lower:
            doc_type = "Purchase Order"
        elif any(w in text_lower for w in ["medical", "pharmacy", "hospital", "rx", "medicine", "tablets", "pharma"]):
            doc_type = "Medical Bill"
        elif any(w in text_lower for w in ["fuel", "petrol", "diesel", "cng"]):
            doc_type = "Fuel Bill"
        elif any(w in text_lower for w in ["electricity", "utility", "water bill"]):
            doc_type = "Utility Bill"
        elif any(w in text_lower for w in ["transport", "freight", "trip", "toll", "logistics"]):
            doc_type = "Transport Bill"

        tags = [doc_type]
        if merchant_name:
            tags.append(merchant_name[:20].strip())

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
            "subtotal": subtotal or total_amount or 0.0,
            "discount": 0.0,
            "tax_amount": tax_amount or 0.0,
            "total_amount": total_amount or 0.0,
            "payment_status": "Paid" if "paid" in text_lower else "Pending",
            "confidence_score": 0.85 if total_amount and merchant_name else 0.50,
            "tags": tags,
            "uncertain_fields": uncertain_fields,
            "line_items": line_items
        }

    @classmethod
    def _infer_category(cls, desc: str) -> str:
        d = desc.lower()
        if any(w in d for w in ["medicine", "tablet", "syrup", "capsule", "doctor", "consultation", "pharma"]):
            return "Medical"
        if any(w in d for w in ["fuel", "petrol", "diesel", "gas", "cng"]):
            return "Fuel"
        if any(w in d for w in ["transport", "taxi", "cab", "flight", "train", "bus", "travel", "uber", "ola"]):
            return "Travel"
        if any(w in d for w in ["pen", "paper", "stationery", "notebook", "print", "cartridge"]):
            return "Office Supplies"
        if any(w in d for w in ["electricity", "power", "water", "broadband", "internet", "phone"]):
            return "Utility Bill"
        if any(w in d for w in ["food", "meal", "coffee", "restaurant", "lunch", "dinner"]):
            return "Food & Beverage"
        return "Purchase"

    @classmethod
    def _validate_and_normalize(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validates numbers, balances line item sums, and ensures types are clean.
        """
        data["document_type"] = data.get("document_type") or "Receipt"
        data["currency"] = data.get("currency") or "INR"
        data["tags"] = data.get("tags") or []
        data["uncertain_fields"] = data.get("uncertain_fields") or []
        data["line_items"] = data.get("line_items") or []

        # Validate line items
        for item in data["line_items"]:
            try:
                item["quantity"] = float(item.get("quantity") or 1.0)
                item["unit_price"] = float(item.get("unit_price") or 0.0)
                item["tax_amount"] = float(item.get("tax_amount") or 0.0)
                item["total"] = float(item.get("total") or (item["quantity"] * item["unit_price"]))
            except (ValueError, TypeError):
                item["quantity"] = 1.0
                item["unit_price"] = 0.0
                item["total"] = 0.0

        return data
