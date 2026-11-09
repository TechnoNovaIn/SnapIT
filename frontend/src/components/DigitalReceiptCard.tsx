import React from 'react';
import { AlertTriangle, Sparkles, Copy, Check } from 'lucide-react';
import type { DocumentData } from '../types/document';

interface DigitalReceiptCardProps {
  document: DocumentData;
  onEditClick: () => void;
  onConfirmCategory?: (index: number) => void;
}

export const DigitalReceiptCard: React.FC<DigitalReceiptCardProps> = ({
  document,
  onEditClick,
  onConfirmCategory,
}) => {
  const [copiedTax, setCopiedTax] = React.useState(false);

  const formatCurr = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return '—';
    const curr = document.currency || 'INR';
    if (curr === 'INR') {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2,
      }).format(amount);
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const isFieldUncertain = (fieldName: string) => {
    return document.uncertain_fields?.includes(fieldName);
  };

  const handleCopyTaxId = () => {
    if (document.tax_id) {
      navigator.clipboard.writeText(document.tax_id);
      setCopiedTax(true);
      setTimeout(() => setCopiedTax(false), 2000);
    }
  };

  // Check calculation mismatch: line items total vs stated total
  const calculatedLineItemsSum = document.line_items?.reduce((sum, item) => sum + (item.total || 0), 0) || 0;
  const statedTotal = document.total_amount || 0;
  const difference = Math.abs(calculatedLineItemsSum - statedTotal);
  const hasMismatch = document.line_items && document.line_items.length > 0 && statedTotal > 0 && difference > 1.0;

  return (
    <div className="digital-receipt-card">
      <div className="receipt-top-banner">
        <div>
          <h3>Digital Receipt Details</h3>
          <span style={{ fontSize: '0.8rem', opacity: 0.9 }}>
            Structured document view &bull; {document.document_type}
          </span>
        </div>
        <button
          className="btn-secondary"
          style={{ background: 'rgba(255,255,255,0.18)', color: '#ffffff', borderColor: 'transparent', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
          onClick={onEditClick}
        >
          Edit Details
        </button>
      </div>

      <div className="receipt-body">
        {/* Merchant & Document Metadata */}
        <div className="meta-grid">
          <div>
            <div className="meta-field-label">Merchant / Supplier</div>
            <div className="meta-field-val">
              {document.merchant_name || 'Not Detected'}
              {isFieldUncertain('merchant_name') && (
                <span className="uncertain-indicator" title="Uncertain - Please verify">
                  <AlertTriangle size={11} /> Unverified
                </span>
              )}
            </div>
            {document.merchant_address && (
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.2rem' }}>
                {document.merchant_address}
              </div>
            )}
          </div>

          <div>
            <div className="meta-field-label">Invoice / Bill #</div>
            <div className="meta-field-val">
              {document.invoice_number || 'N/A'}
              {isFieldUncertain('invoice_number') && (
                <span className="uncertain-indicator" title="Uncertain - Please verify">
                  <AlertTriangle size={11} /> Unverified
                </span>
              )}
            </div>
          </div>

          <div>
            <div className="meta-field-label">Date</div>
            <div className="meta-field-val">
              {document.invoice_date || 'N/A'}
              {isFieldUncertain('invoice_date') && (
                <span className="uncertain-indicator" title="Uncertain - Please verify">
                  <AlertTriangle size={11} /> Unverified
                </span>
              )}
            </div>
            {document.due_date && (
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.2rem' }}>
                Due: {document.due_date}
              </div>
            )}
          </div>

          {document.tax_id && (
            <div>
              <div className="meta-field-label">GSTIN / Tax ID</div>
              <div className="meta-field-val" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>{document.tax_id}</span>
                <button
                  className="icon-btn"
                  onClick={handleCopyTaxId}
                  title="Copy Tax ID"
                  style={{ padding: '2px' }}
                >
                  {copiedTax ? <Check size={14} color="#059669" /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          )}

          {document.customer_name && (
            <div>
              <div className="meta-field-label">Billed To</div>
              <div className="meta-field-val">{document.customer_name}</div>
            </div>
          )}

          <div>
            <div className="meta-field-label">Payment Status</div>
            <div className="meta-field-val" style={{ color: document.payment_status?.toLowerCase() === 'paid' ? '#059669' : '#d97706' }}>
              {document.payment_status || 'Unspecified'}
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="items-table-wrapper">
          <table className="items-table">
            <thead>
              <tr>
                <th style={{ width: '45%' }}>Item Description</th>
                <th>Category</th>
                <th style={{ textAlign: 'center' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Unit Price</th>
                <th style={{ textAlign: 'right' }}>Tax</th>
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {document.line_items && document.line_items.length > 0 ? (
                document.line_items.map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td style={{ fontWeight: 500 }}>{item.description}</td>
                    <td>
                      <span className="category-tag">
                        {item.category}
                        {item.is_suggested_category && (
                          <button
                            type="button"
                            className="suggested-star"
                            style={{
                              background: '#fef3c7',
                              border: '1px solid #fde68a',
                              borderRadius: '4px',
                              padding: '1px 5px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              cursor: 'pointer',
                              color: '#b45309',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              marginLeft: '4px'
                            }}
                            onClick={() => onConfirmCategory?.(idx)}
                            title="AI Suggested - Click to confirm category"
                          >
                            <Sparkles size={10} /> Confirm
                          </button>
                        )}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', color: '#64748b' }}>{item.quantity}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurr(item.unit_price)}</td>
                    <td style={{ textAlign: 'right', color: '#64748b' }}>{formatCurr(item.tax_amount)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurr(item.total)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: '#64748b', padding: '1.5rem' }}>
                    No line items extracted. Click "Edit Details" to add items manually.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Calculation Mismatch Alert */}
        {hasMismatch && (
          <div className="mismatch-banner">
            <AlertTriangle size={18} style={{ flexShrink: 0 }} />
            <div>
              <strong>Total Mismatch Detected: </strong>
              The sum of item totals ({formatCurr(calculatedLineItemsSum)}) differs from the stated document total ({formatCurr(statedTotal)}) by {formatCurr(difference)}. Click "Edit Details" to reconcile.
            </div>
          </div>
        )}

        {/* Financial Summary */}
        <div className="financial-totals-box">
          {document.subtotal !== null && document.subtotal !== undefined && (
            <div className="total-row">
              <span>Subtotal</span>
              <span>{formatCurr(document.subtotal)}</span>
            </div>
          )}
          {document.discount ? (
            <div className="total-row" style={{ color: '#059669' }}>
              <span>Discount</span>
              <span>-{formatCurr(document.discount)}</span>
            </div>
          ) : null}
          {document.tax_amount !== null && document.tax_amount !== undefined && (
            <div className="total-row">
              <span>Taxes / GST</span>
              <span>{formatCurr(document.tax_amount)}</span>
            </div>
          )}
          <div className="total-row grand-total">
            <span>Total Payable</span>
            <span className="amount-highlight">{formatCurr(document.total_amount)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
