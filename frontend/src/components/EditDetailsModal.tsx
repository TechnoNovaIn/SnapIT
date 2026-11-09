import React, { useState } from 'react';
import { X, Plus, Trash2, Calculator, AlertTriangle } from 'lucide-react';
import type { DocumentData, LineItem } from '../types/document';

interface EditDetailsModalProps {
  document: DocumentData;
  onSave: (updatedData: Partial<DocumentData>) => Promise<void>;
  onClose: () => void;
}

export const EditDetailsModal: React.FC<EditDetailsModalProps> = ({
  document,
  onSave,
  onClose,
}) => {
  const [merchantName, setMerchantName] = useState(document.merchant_name || '');
  const [merchantAddress, setMerchantAddress] = useState(document.merchant_address || '');
  const [invoiceNumber, setInvoiceNumber] = useState(document.invoice_number || '');
  const [invoiceDate, setInvoiceDate] = useState(document.invoice_date || '');
  const [dueDate, setDueDate] = useState(document.due_date || '');
  const [taxId, setTaxId] = useState(document.tax_id || '');
  const [documentType, setDocumentType] = useState(document.document_type || 'Receipt');
  const [currency, setCurrency] = useState(document.currency || 'INR');
  const [paymentStatus, setPaymentStatus] = useState(document.payment_status || 'Pending');

  const [discount, setDiscount] = useState<number>(document.discount || 0);
  const [taxAmount, setTaxAmount] = useState<number>(document.tax_amount || 0);
  const [statedTotal, setStatedTotal] = useState<number>(document.total_amount || 0);

  const [lineItems, setLineItems] = useState<LineItem[]>(
    document.line_items?.map((item) => ({ ...item })) || []
  );

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleItemChange = (index: number, field: keyof LineItem, val: any) => {
    setLineItems((prev) => {
      const copy = [...prev];
      const item = { ...copy[index], [field]: val };

      if (field === 'quantity' || field === 'unit_price') {
        const qty = Number(field === 'quantity' ? val : item.quantity) || 0;
        const up = Number(field === 'unit_price' ? val : item.unit_price) || 0;
        item.total = Number((qty * up).toFixed(2));
      }
      copy[index] = item;
      return copy;
    });
  };

  const handleAddItem = () => {
    setLineItems((prev) => [
      ...prev,
      {
        description: 'New Line Item',
        category: 'Purchase',
        quantity: 1,
        unit_price: 0,
        tax_amount: 0,
        total: 0,
        is_suggested_category: false,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculate live subtotal & sum
  const calculatedItemsTotal = lineItems.reduce((acc, it) => acc + (Number(it.total) || 0), 0);
  const calculatedGrandTotal = Number((calculatedItemsTotal + (Number(taxAmount) || 0) - (Number(discount) || 0)).toFixed(2));
  const hasMismatch = Math.abs(calculatedGrandTotal - (Number(statedTotal) || 0)) > 1.0;

  const handleAutoReconcile = () => {
    setStatedTotal(calculatedGrandTotal);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave({
        merchant_name: merchantName,
        merchant_address: merchantAddress,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        due_date: dueDate,
        tax_id: taxId,
        document_type: documentType,
        currency,
        payment_status: paymentStatus,
        review_status: 'verified', // manual edit confirms and verifies details
        subtotal: calculatedItemsTotal,
        discount: Number(discount) || 0,
        tax_amount: Number(taxAmount) || 0,
        total_amount: Number(statedTotal) || 0,
        line_items: lineItems,
        uncertain_fields: [], // cleared upon manual edit
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 70 }}>
      <div
        className="modal-content"
        style={{
          maxWidth: '850px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '1.75rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#0f172a' }}>
              Edit Receipt Details
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
              Modify extracted fields and line items. Source document will remain intact.
            </p>
          </div>
          <button className="icon-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', flex: 1, paddingRight: '0.5rem' }}>
          {/* Document Overview Inputs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <label className="form-label">Merchant Name</label>
              <input
                type="text"
                className="form-input"
                value={merchantName}
                onChange={(e) => setMerchantName(e.target.value)}
                placeholder="e.g. Apollo Pharmacy"
              />
            </div>

            <div>
              <label className="form-label">Document Type</label>
              <select
                className="form-input"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
              >
                <option value="Receipt">Receipt</option>
                <option value="Tax Invoice">Tax Invoice</option>
                <option value="Purchase Order">Purchase Order</option>
                <option value="Medical Bill">Medical Bill</option>
                <option value="Fuel Bill">Fuel Bill</option>
                <option value="Utility Bill">Utility Bill</option>
                <option value="Transport Bill">Transport Bill</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div>
              <label className="form-label">Invoice / Receipt #</label>
              <input
                type="text"
                className="form-input"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="INV-12345"
              />
            </div>

            <div>
              <label className="form-label">Invoice Date</label>
              <input
                type="text"
                className="form-input"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                placeholder="DD/MM/YYYY or YYYY-MM-DD"
              />
            </div>

            <div>
              <label className="form-label">GST / Tax ID</label>
              <input
                type="text"
                className="form-input"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="e.g. 29ABCDE1234F1Z5"
              />
            </div>

            <div>
              <label className="form-label">Due Date</label>
              <input
                type="text"
                className="form-input"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                placeholder="Optional Due Date"
              />
            </div>

            <div>
              <label className="form-label">Currency</label>
              <select
                className="form-input"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="AED">AED (د.إ)</option>
                <option value="CAD">CAD ($)</option>
              </select>
            </div>

            <div>
              <label className="form-label">Payment Status</label>
              <select
                className="form-input"
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
              >
                <option value="Paid">Paid</option>
                <option value="Pending">Pending</option>
                <option value="Unpaid">Unpaid</option>
                <option value="Partial">Partial</option>
              </select>
            </div>
          </div>

          <div>
            <label className="form-label">Merchant Address</label>
            <input
              type="text"
              className="form-input"
              value={merchantAddress}
              onChange={(e) => setMerchantAddress(e.target.value)}
              placeholder="Store or vendor location address"
              style={{ marginBottom: '1.5rem' }}
            />
          </div>

          {/* Line Items Table Editor */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 700 }}>Line Items</h4>
              <button
                type="button"
                className="btn-secondary"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                onClick={handleAddItem}
              >
                <Plus size={14} />
                <span>Add Item</span>
              </button>
            </div>

            <table className="items-table" style={{ background: '#f8fafc', borderRadius: '8px' }}>
              <thead>
                <tr>
                  <th style={{ width: '40%' }}>Description</th>
                  <th>Category</th>
                  <th style={{ width: '70px' }}>Qty</th>
                  <th style={{ width: '100px' }}>Unit Price</th>
                  <th style={{ width: '100px' }}>Total</th>
                  <th style={{ width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, idx) => (
                  <tr key={idx}>
                    <td>
                      <input
                        type="text"
                        className="form-input"
                        style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                        value={item.description}
                        onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                        placeholder="Item name"
                      />
                    </td>
                    <td>
                      <select
                        className="form-input"
                        style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                        value={item.category}
                        onChange={(e) => handleItemChange(idx, 'category', e.target.value)}
                      >
                        <option value="General">General</option>
                        <option value="Medical">Medical</option>
                        <option value="Travel">Travel</option>
                        <option value="Fuel">Fuel</option>
                        <option value="Office Supplies">Office Supplies</option>
                        <option value="Purchase">Purchase</option>
                        <option value="Utility Bill">Utility Bill</option>
                        <option value="Food & Dining">Food & Dining</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        className="form-input"
                        style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem', textAlign: 'center' }}
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        className="form-input"
                        style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem', textAlign: 'right' }}
                        value={item.unit_price}
                        onChange={(e) => handleItemChange(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="any"
                        className="form-input"
                        style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem', textAlign: 'right', fontWeight: 600 }}
                        value={item.total}
                        onChange={(e) => handleItemChange(idx, 'total', parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="icon-btn"
                        style={{ color: '#b91c1c' }}
                        onClick={() => handleRemoveItem(idx)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mismatch Alert & Auto-Reconcile */}
          {hasMismatch && (
            <div className="mismatch-banner" style={{ marginBottom: '1.25rem' }}>
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                Calculated line total ({currency} {calculatedGrandTotal.toFixed(2)}) does not match entered total ({currency} {statedTotal.toFixed(2)}).
              </div>
              <button
                type="button"
                className="btn-secondary"
                style={{ background: '#ffffff', padding: '0.3rem 0.7rem', fontSize: '0.8rem' }}
                onClick={handleAutoReconcile}
              >
                <Calculator size={13} />
                Set to Calculated
              </button>
            </div>
          )}

          {/* Totals Box */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
            <div>
              <label className="form-label">Subtotal</label>
              <div style={{ fontWeight: 600, fontSize: '1rem', padding: '0.4rem 0' }}>
                {currency} {calculatedItemsTotal.toFixed(2)}
              </div>
            </div>

            <div>
              <label className="form-label">Tax / GST Amount</label>
              <input
                type="number"
                step="any"
                className="form-input"
                value={taxAmount}
                onChange={(e) => setTaxAmount(parseFloat(e.target.value) || 0)}
              />
            </div>

            <div>
              <label className="form-label">Discount</label>
              <input
                type="number"
                step="any"
                className="form-input"
                value={discount}
                onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)}
              />
            </div>

            <div>
              <label className="form-label">Stated Total Amount</label>
              <input
                type="number"
                step="any"
                className="form-input"
                style={{ fontWeight: 700, borderColor: hasMismatch ? '#f59e0b' : '#059669' }}
                value={statedTotal}
                onChange={(e) => setStatedTotal(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Modal Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
