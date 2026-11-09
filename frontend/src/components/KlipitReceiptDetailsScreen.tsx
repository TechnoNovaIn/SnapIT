import React, { useState } from 'react';
import type { DocumentData } from '../types/document';
import {
  ChevronLeft,
  Share2,
  Search,
  Plus,
  Edit3,
  Info,
  Download,
  FileSpreadsheet,
  FileText,
  Trash2,
  X,
  Tag as TagIcon,
  Eye,
  Receipt
} from 'lucide-react';
import { api, resolveAssetUrl } from '../api/client';
import { DocumentPreview } from './DocumentPreview';

interface KlipitReceiptDetailsScreenProps {
  document: DocumentData;
  onBack: () => void;
  onEdit: () => void;
  onUpdateTags: (tags: string[]) => void;
  onDeleteReceipt: (id: string) => void;
  onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const KlipitReceiptDetailsScreen: React.FC<KlipitReceiptDetailsScreenProps> = ({
  document: doc,
  onBack,
  onEdit,
  onUpdateTags,
  onDeleteReceipt,
  onShowToast,
}) => {
  const [activeViewMode, setActiveViewMode] = useState<'digital' | 'preview'>('digital');
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');

  const isPdf = doc.mime_type === 'application/pdf' || doc.filename.toLowerCase().endsWith('.pdf');
  const fileUrl = resolveAssetUrl(doc.file_url || api.getOriginalFileUrl(doc.id));
  const thumbUrl = resolveAssetUrl(doc.thumbnail_url || api.getThumbnailUrl(doc.id));

  const handleShare = async () => {
    try {
      const res = await api.createShareLink(doc.id);
      const shareUrl = `${window.location.origin}${res.share_url}`;
      await navigator.clipboard.writeText(shareUrl);
      onShowToast('Secure share link copied to clipboard!', 'success');
    } catch {
      onShowToast('Link copied to clipboard', 'info');
    }
  };

  const handleAddTag = () => {
    const trimmed = newTagInput.trim();
    if (!trimmed) return;
    const existing = doc.tags || [];
    if (!existing.includes(trimmed)) {
      onUpdateTags([...existing, trimmed]);
      onShowToast(`Tag "${trimmed}" added!`, 'success');
    }
    setNewTagInput('');
    setIsAddingTag(false);
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const updated = (doc.tags || []).filter((t) => t !== tagToRemove);
    onUpdateTags(updated);
  };

  const lineItems = doc.line_items && doc.line_items.length > 0
    ? doc.line_items
    : [
        {
          id: 'def-1',
          document_id: doc.id,
          description: 'Itemized Bill',
          category: 'General',
          unit_price: doc.total_amount || 0,
          amount: doc.total_amount || 0,
          total: doc.total_amount || 0,
          quantity: 1,
          tax_amount: 0,
          is_suggested_category: false,
        },
      ];

  const totalItemsCount = lineItems.reduce((acc, item) => acc + (item.quantity || 1), 0);

  return (
    <div className="klipit-screen-container klipit-details-view">
      {/* Top App Bar */}
      <div className="klipit-top-nav-bar">
        <button className="klipit-nav-icon-btn" onClick={onBack} title="Back">
          <ChevronLeft size={24} color="#0f172a" />
        </button>

        <h1 className="klipit-details-title">Receipt details</h1>

        <button className="klipit-nav-icon-btn" onClick={handleShare} title="Share">
          <Share2 size={20} color="#0f172a" />
        </button>
      </div>

      {/* View Mode Switcher: Extracted Digital Bill vs Uploaded Original Bill Preview */}
      <div className="klipit-details-tab-bar">
        <button
          className={`klipit-details-tab-btn ${activeViewMode === 'digital' ? 'active' : ''}`}
          onClick={() => setActiveViewMode('digital')}
        >
          <Receipt size={16} />
          <span>Extracted Receipt</span>
        </button>
        <button
          className={`klipit-details-tab-btn ${activeViewMode === 'preview' ? 'active' : ''}`}
          onClick={() => setActiveViewMode('preview')}
        >
          <Eye size={16} />
          <span>Uploaded Bill Preview</span>
        </button>
      </div>

      {activeViewMode === 'preview' ? (
        /* ================= FULL PREVIEW VIEW ================= */
        <div style={{ marginBottom: '5rem' }}>
          <DocumentPreview
            documentId={doc.id}
            filename={doc.filename}
            mimeType={doc.mime_type}
            fileUrl={doc.file_url}
            thumbnailUrl={doc.thumbnail_url}
            fileSize={doc.file_size}
          />

          <div style={{ marginTop: '1rem', display: 'flex', gap: '8px' }}>
            <button
              className="btn-secondary-sm"
              style={{ flex: 1, padding: '10px' }}
              onClick={() => setActiveViewMode('digital')}
            >
              Back to Extracted Receipt
            </button>
            <a
              href={fileUrl}
              download={doc.filename}
              className="btn-primary-sm"
              style={{
                flex: 1,
                padding: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                textDecoration: 'none'
              }}
            >
              <Download size={15} />
              <span>Download Bill</span>
            </a>
          </div>
        </div>
      ) : (
        /* ================= DIGITAL RECEIPT VIEW ================= */
        <>
          {/* Card 1: Top Summary Card */}
          <div className="klipit-summary-top-card">
            {/* Left: Receipt thumbnail with magnifying glass overlay */}
            <div
              className="klipit-top-thumbnail-wrap"
              onClick={() => setIsLightboxOpen(true)}
              title="Click to view full preview"
            >
              {thumbUrl || fileUrl ? (
                <img
                  src={thumbUrl || fileUrl}
                  alt={doc.merchant_name || 'Receipt'}
                  className="klipit-top-thumbnail-img"
                />
              ) : (
                <div className="klipit-top-thumb-placeholder">
                  <span>📄</span>
                </div>
              )}
              <div className="klipit-zoom-overlay">
                <Search size={18} color="#ffffff" strokeWidth={2.5} />
              </div>
            </div>

            {/* Right Info */}
            <div className="klipit-top-info-block">
              <div className="klipit-amt-pill-badge">
                INR {doc.total_amount ? Number(doc.total_amount).toLocaleString() : '0'}
              </div>

              <div className="klipit-summary-merchant">
                Merchant: {doc.merchant_name || 'Store Receipt'}
              </div>

              <div className="klipit-summary-meta">
                Total {totalItemsCount} item{totalItemsCount === 1 ? '' : 's'}
              </div>

              <div className="klipit-summary-meta">
                {doc.invoice_date || new Date().toISOString().split('T')[0]}
              </div>

              {/* Quick Bill Preview Action Pill */}
              <button
                type="button"
                onClick={() => setActiveViewMode('preview')}
                style={{
                  marginTop: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: '#ecfdf5',
                  color: '#059669',
                  border: '1px solid #a7f3d0',
                  borderRadius: '20px',
                  padding: '3px 10px',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  width: 'fit-content'
                }}
              >
                <Eye size={12} />
                <span>Preview Original Bill</span>
              </button>
            </div>
          </div>

          {/* Card 2: Dedicated Uploaded Bill Preview Card */}
          <div className="klipit-bill-preview-card">
            <div className="klipit-bill-preview-header">
              <div className="klipit-bill-preview-title">
                <Eye size={16} color="#16a34a" />
                <span>Uploaded Bill Preview</span>
              </div>
              <span className="klipit-bill-file-badge">
                {isPdf ? 'PDF Bill' : 'Photo Scan'}
              </span>
            </div>

            <DocumentPreview
              documentId={doc.id}
              filename={doc.filename}
              mimeType={doc.mime_type}
              fileUrl={doc.file_url}
              thumbnailUrl={doc.thumbnail_url}
              fileSize={doc.file_size}
              inline={true}
            />
          </div>

          {/* Card 3: Authentic Sawtooth Jagged Paper Receipt Card */}
          <div className="klipit-paper-receipt-container">
            {/* ZigZag Perforated Top Border */}
            <div className="sawtooth-edge-top" />

            <div className="klipit-paper-receipt-body">
              {/* Merchant Title */}
              <div className="klipit-paper-merchant">
                {doc.merchant_name || 'Receipt Purchase'}
              </div>

              {/* Date, Invoice No, Total Items */}
              <div className="klipit-paper-meta-row">
                Date: {doc.invoice_date || 'N/A'}
              </div>
              <div className="klipit-paper-meta-row">
                Invoice No: {doc.invoice_number || 'N/A'}
              </div>
              <div className="klipit-paper-meta-row">
                Total Items: {totalItemsCount}
              </div>

              <div className="klipit-paper-divider" />

              {/* Itemized Line Items List */}
              <div className="klipit-paper-items-section">
                {lineItems.map((item, idx) => (
                  <div key={item.id || idx} className="klipit-paper-item-card">
                    <div className="klipit-paper-item-row">
                      <span className="item-label">Item:</span>
                      <span className="item-val bold uppercase">{item.description || 'Item'}</span>
                    </div>
                    <div className="klipit-paper-item-row">
                      <span className="item-label">Unit Price:</span>
                      <span className="item-val">{item.unit_price || doc.total_amount || 0}</span>
                    </div>
                    <div className="klipit-paper-item-row">
                      <span className="item-label">Amount:</span>
                      <span className="item-val">{item.total || item.unit_price || 0}</span>
                    </div>
                    <div className="klipit-paper-item-row">
                      <span className="item-label">Qty:</span>
                      <span className="item-val">{item.quantity || 1}</span>
                    </div>
                    {idx < lineItems.length - 1 && <div className="klipit-paper-sub-divider" />}
                  </div>
                ))}
              </div>

              <div className="klipit-paper-divider" />

              {/* Total Amount Row */}
              <div className="klipit-paper-total-row">
                <span className="total-title">Total Amount</span>
                <span className="total-val">
                  INR {doc.total_amount ? Number(doc.total_amount).toLocaleString() : '0'}
                </span>
              </div>
            </div>

            {/* ZigZag Perforated Bottom Border */}
            <div className="sawtooth-edge-bottom" />
          </div>

          {/* Card 4: All Tags Card */}
          <div className="klipit-section-card">
            <h2 className="klipit-card-title">All tags</h2>

            <div className="klipit-tags-row">
              <button
                className="klipit-add-tag-pill"
                onClick={() => setIsAddingTag(true)}
              >
                <span>Add tag</span>
                <Plus size={16} strokeWidth={2.5} />
              </button>

              {doc.tags && doc.tags.map((tag) => (
                <div key={tag} className="klipit-tag-chip">
                  <TagIcon size={12} color="#059669" />
                  <span>{tag}</span>
                  <button
                    className="klipit-tag-remove-btn"
                    onClick={() => handleRemoveTag(tag)}
                    title="Remove tag"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>

            {isAddingTag && (
              <div className="klipit-tag-input-row">
                <input
                  type="text"
                  placeholder="Enter tag name..."
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                  autoFocus
                  className="klipit-tag-input"
                />
                <button className="btn-primary-sm" onClick={handleAddTag}>
                  Save
                </button>
                <button className="btn-secondary-sm" onClick={() => setIsAddingTag(false)}>
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Card 5: Want to edit your receipt? */}
          <div className="klipit-section-card">
            <div className="klipit-card-header-row">
              <h2 className="klipit-card-title">Want to edit your receipt?</h2>
              <button className="klipit-edit-link-btn" onClick={onEdit}>
                <span>Edit</span>
                <Edit3 size={15} />
              </button>
            </div>

            <div className="klipit-info-bullet-list">
              <div className="klipit-info-bullet">
                <div className="bullet-icon-wrap">
                  <Info size={16} color="#16a34a" />
                </div>
                <span>You can edit the receipt within 24 hours</span>
              </div>

              <div className="klipit-info-bullet">
                <div className="bullet-icon-wrap">
                  <Info size={16} color="#16a34a" />
                </div>
                <span>Once a receipt is submitted for processing, edits update the digital record.</span>
              </div>
            </div>
          </div>

          {/* Card 6: Export & Delete Actions */}
          <div className="klipit-section-card" style={{ marginBottom: '5rem' }}>
            <h2 className="klipit-card-title">Download & Export</h2>
            <div className="klipit-export-grid">
              <a
                href={api.getExportExcelUrl(doc.id)}
                download
                className="klipit-export-btn btn-excel"
              >
                <FileSpreadsheet size={16} />
                <span>Excel (.xlsx)</span>
              </a>

              <a
                href={api.getExportCsvUrl(doc.id)}
                download
                className="klipit-export-btn btn-csv"
              >
                <FileText size={16} />
                <span>CSV</span>
              </a>

              <a
                href={api.getExportPdfUrl(doc.id)}
                download
                className="klipit-export-btn btn-pdf"
              >
                <Download size={16} />
                <span>PDF Summary</span>
              </a>

              <a
                href={api.getExportJsonUrl(doc.id)}
                download
                className="klipit-export-btn btn-json"
              >
                <FileText size={16} />
                <span>JSON</span>
              </a>
            </div>

            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
              <button
                className="klipit-delete-receipt-btn"
                onClick={() => {
                  if (window.confirm('Are you sure you want to delete this receipt?')) {
                    onDeleteReceipt(doc.id);
                  }
                }}
              >
                <Trash2 size={16} />
                <span>Delete Receipt</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* Lightbox Modal for Full Image Zoom */}
      {isLightboxOpen && (
        <div className="modal-overlay" onClick={() => setIsLightboxOpen(false)}>
          <div className="klipit-lightbox-modal" onClick={(e) => e.stopPropagation()}>
            <div className="klipit-lightbox-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Eye size={18} color="#4ade80" />
                <span>{doc.filename || 'Receipt Preview'}</span>
              </div>
              <button className="klipit-close-circle" onClick={() => setIsLightboxOpen(false)}>
                <X size={20} color="#ffffff" />
              </button>
            </div>
            <div className="klipit-lightbox-body">
              {isPdf ? (
                <iframe
                  src={fileUrl}
                  title="PDF Document"
                  style={{ width: '100%', height: '80vh', border: 'none', background: '#fff' }}
                />
              ) : (fileUrl || thumbUrl) ? (
                <img
                  src={fileUrl || thumbUrl}
                  alt={doc.merchant_name || 'Receipt Full View'}
                  className="klipit-lightbox-img"
                />
              ) : (
                <div style={{ color: '#fff', padding: '2rem' }}>No image preview available</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
