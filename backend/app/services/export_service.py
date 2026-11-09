import io
import csv
import json
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from ..models import Document

class ExportService:
    @staticmethod
    def export_json(document: Document) -> str:
        data = {
            "id": document.id,
            "filename": document.filename,
            "document_type": document.document_type,
            "merchant_name": document.merchant_name,
            "merchant_address": document.merchant_address,
            "customer_name": document.customer_name,
            "invoice_number": document.invoice_number,
            "invoice_date": document.invoice_date,
            "due_date": document.due_date,
            "tax_id": document.tax_id,
            "currency": document.currency,
            "financials": {
                "subtotal": document.subtotal,
                "discount": document.discount,
                "tax_amount": document.tax_amount,
                "total_amount": document.total_amount
            },
            "payment_status": document.payment_status,
            "review_status": document.review_status,
            "tags": document.tags,
            "line_items": [
                {
                    "description": item.description,
                    "category": item.category,
                    "quantity": item.quantity,
                    "unit_price": item.unit_price,
                    "tax_amount": item.tax_amount,
                    "total": item.total,
                    "is_suggested_category": item.is_suggested_category
                } for item in document.line_items
            ],
            "exported_at": str(document.updated_at or document.created_at)
        }
        return json.dumps(data, indent=2)

    @staticmethod
    def export_csv(document: Document) -> str:
        output = io.StringIO()
        writer = csv.writer(output)

        # Header section
        writer.writerow(["SnapIT — Digital Receipt Summary"])
        writer.writerow(["Document ID", document.id])
        writer.writerow(["Filename", document.filename])
        writer.writerow(["Document Type", document.document_type])
        writer.writerow(["Merchant", document.merchant_name or "N/A"])
        writer.writerow(["Invoice Number", document.invoice_number or "N/A"])
        writer.writerow(["Date", document.invoice_date or "N/A"])
        writer.writerow(["Tax / GST ID", document.tax_id or "N/A"])
        writer.writerow(["Currency", document.currency])
        writer.writerow(["Subtotal", document.subtotal or 0.0])
        writer.writerow(["Tax Amount", document.tax_amount or 0.0])
        writer.writerow(["Discount", document.discount or 0.0])
        writer.writerow(["Total Amount", document.total_amount or 0.0])
        writer.writerow(["Tags", ", ".join(document.tags)])
        writer.writerow([])

        # Line items
        writer.writerow(["Line Items"])
        writer.writerow(["#", "Description", "Category", "Quantity", "Unit Price", "Tax", "Line Total"])
        for idx, item in enumerate(document.line_items, 1):
            writer.writerow([
                idx,
                item.description,
                item.category,
                item.quantity,
                f"{item.unit_price:.2f}",
                f"{item.tax_amount:.2f}",
                f"{item.total:.2f}"
            ])

        return output.getvalue()

    @staticmethod
    def export_excel(document: Document) -> bytes:
        import io
        from openpyxl import Workbook
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

        wb = Workbook()
        ws = wb.active
        ws.title = "Digital Receipt"

        # Theme colors: Emerald green Klipit style
        header_fill = PatternFill(start_color="059669", end_color="059669", fill_type="solid")
        subtle_fill = PatternFill(start_color="ECFDF5", end_color="ECFDF5", fill_type="solid")
        title_font = Font(name="Calibri", size=16, bold=True, color="059669")
        header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
        bold_font = Font(name="Calibri", size=11, bold=True)
        regular_font = Font(name="Calibri", size=11)

        ws["A1"] = "SnapIT — Digital Receipt Summary"
        ws["A1"].font = title_font
        ws["A2"] = f"Original Document: {document.filename} | Type: {document.document_type}"
        ws["A2"].font = Font(name="Calibri", size=10, italic=True, color="64748B")

        # Metadata Block
        meta_rows = [
            ("Merchant / Supplier", document.merchant_name or "N/A"),
            ("Invoice / Receipt #", document.invoice_number or "N/A"),
            ("Document Date", document.invoice_date or "N/A"),
            ("GST / Tax ID", document.tax_id or "N/A"),
            ("Payment Status", document.payment_status or "Pending"),
            ("Review Status", document.review_status.replace("_", " ").title()),
            ("Currency", document.currency or "INR"),
        ]

        row_idx = 4
        for label, val in meta_rows:
            ws.cell(row=row_idx, column=1, value=label).font = bold_font
            ws.cell(row=row_idx, column=2, value=val).font = regular_font
            row_idx += 1

        row_idx += 1
        # Line Items Header
        headers = ["#", "Item Description", "Category", "Quantity", "Unit Price", "Tax Amount", "Line Total"]
        for col_idx, header in enumerate(headers, 1):
            cell = ws.cell(row=row_idx, column=col_idx, value=header)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center" if col_idx in [1, 4] else "right" if col_idx >= 5 else "left")

        row_idx += 1
        curr = document.currency or "INR"
        for idx, item in enumerate(document.line_items, 1):
            ws.cell(row=row_idx, column=1, value=idx).alignment = Alignment(horizontal="center")
            ws.cell(row=row_idx, column=2, value=item.description).font = regular_font
            ws.cell(row=row_idx, column=3, value=item.category).font = regular_font
            ws.cell(row=row_idx, column=4, value=item.quantity).alignment = Alignment(horizontal="center")
            ws.cell(row=row_idx, column=5, value=item.unit_price).number_format = '#,##0.00'
            ws.cell(row=row_idx, column=6, value=item.tax_amount).number_format = '#,##0.00'
            ws.cell(row=row_idx, column=7, value=item.total).number_format = '#,##0.00'
            row_idx += 1

        # Totals Summary
        row_idx += 1
        if document.subtotal is not None:
            ws.cell(row=row_idx, column=6, value="Subtotal:").font = bold_font
            cell = ws.cell(row=row_idx, column=7, value=document.subtotal)
            cell.font = bold_font
            cell.number_format = '#,##0.00'
            row_idx += 1

        if document.discount:
            ws.cell(row=row_idx, column=6, value="Discount:").font = bold_font
            cell = ws.cell(row=row_idx, column=7, value=-document.discount)
            cell.font = bold_font
            cell.number_format = '#,##0.00'
            row_idx += 1

        if document.tax_amount is not None:
            ws.cell(row=row_idx, column=6, value="Tax / GST:").font = bold_font
            cell = ws.cell(row=row_idx, column=7, value=document.tax_amount)
            cell.font = bold_font
            cell.number_format = '#,##0.00'
            row_idx += 1

        ws.cell(row=row_idx, column=6, value="Grand Total:").font = Font(name="Calibri", size=12, bold=True, color="059669")
        cell = ws.cell(row=row_idx, column=7, value=document.total_amount or 0.0)
        cell.font = Font(name="Calibri", size=12, bold=True, color="059669")
        cell.fill = subtle_fill
        cell.number_format = '#,##0.00'

        # Auto-adjust column widths
        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = col[0].column_letter
            ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        return buffer.getvalue()

    @staticmethod
    def export_pdf_summary(document: Document) -> bytes:
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
        elements = []
        styles = getSampleStyleSheet()

        # Title
        title_style = ParagraphStyle(
            'TitleStyle',
            parent=styles['Heading1'],
            fontSize=20,
            textColor=colors.HexColor("#065f46"),
            spaceAfter=6
        )
        subtitle_style = ParagraphStyle(
            'SubStyle',
            parent=styles['Normal'],
            fontSize=10,
            textColor=colors.HexColor("#64748b"),
            spaceAfter=15
        )
        elements.append(Paragraph("SnapIT — Digital Receipt Summary", title_style))
        elements.append(Paragraph(f"Generated from original document: {document.filename}", subtitle_style))
        elements.append(Spacer(1, 10))

        # Overview Table
        curr = document.currency or "INR"
        curr_symbol = "₹" if curr == "INR" else curr + " "
        tot_str = f"{curr_symbol}{document.total_amount:,.2f}" if document.total_amount is not None else "N/A"

        overview_data = [
            ["Merchant / Supplier:", document.merchant_name or "N/A", "Document Type:", document.document_type],
            ["Invoice / Bill #:", document.invoice_number or "N/A", "Date:", document.invoice_date or "N/A"],
            ["GST / Tax ID:", document.tax_id or "N/A", "Payment Status:", document.payment_status or "Pending"],
            ["Review Status:", document.review_status.replace("_", " ").title(), "Total Amount:", tot_str]
        ]

        overview_table = Table(overview_data, colWidths=[130, 140, 130, 140])
        overview_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
            ('FONTNAME', (0,0), (-1,-1), 'Helvetica'),
            ('FONTSIZE', (0,0), (-1,-1), 9),
            ('FONTNAME', (0,0), (0,-1), 'Helvetica-Bold'),
            ('FONTNAME', (2,0), (2,-1), 'Helvetica-Bold'),
            ('TEXTCOLOR', (0,0), (-1,-1), colors.HexColor("#1e293b")),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
            ('PADDING', (0,0), (-1,-1), 6),
        ]))
        elements.append(overview_table)
        elements.append(Spacer(1, 15))

        # Line Items Table
        heading_style = ParagraphStyle('H2', parent=styles['Heading2'], fontSize=12, textColor=colors.HexColor("#0f172a"), spaceAfter=8)
        elements.append(Paragraph("Itemized Details", heading_style))

        items_data = [["Item Description", "Category", "Qty", "Unit Price", "Tax", "Total"]]
        for item in document.line_items:
            items_data.append([
                item.description,
                item.category,
                f"{item.quantity:g}",
                f"{curr_symbol}{item.unit_price:.2f}",
                f"{curr_symbol}{item.tax_amount:.2f}",
                f"{curr_symbol}{item.total:.2f}"
            ])

        # Financial summary rows
        if document.subtotal is not None:
            items_data.append(["", "", "", "", "Subtotal:", f"{curr_symbol}{document.subtotal:.2f}"])
        if document.tax_amount is not None:
            items_data.append(["", "", "", "", "Tax:", f"{curr_symbol}{document.tax_amount:.2f}"])
        if document.discount:
            items_data.append(["", "", "", "", "Discount:", f"-{curr_symbol}{document.discount:.2f}"])
        items_data.append(["", "", "", "", "Total:", tot_str])

        items_table = Table(items_data, colWidths=[180, 100, 40, 70, 70, 80])
        items_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#059669")),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,0), 9),
            ('ALIGN', (2,0), (-1,-1), 'RIGHT'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
            ('PADDING', (0,0), (-1,-1), 5),
            ('FONTNAME', (-2,-4), (-1,-1), 'Helvetica-Bold'),
            ('BACKGROUND', (-2,-1), (-1,-1), colors.HexColor("#ecfdf5")),
        ]))
        elements.append(items_table)
        elements.append(Spacer(1, 15))

        # Tags Section
        if document.tags:
            tag_text = "Tags: " + ", ".join(document.tags)
            elements.append(Paragraph(tag_text, styles['Normal']))

        doc.build(elements)
        buffer.seek(0)
        return buffer.getvalue()
