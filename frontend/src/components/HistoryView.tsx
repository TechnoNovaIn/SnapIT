import React, { useState, useEffect } from 'react';
import {
  Search,
  Eye,
  Trash2,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import type { DocumentListItem } from '../types/document';
import { api } from '../api/client';

interface HistoryViewProps {
  onSelectDocument: (id: string) => void;
  onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  onSelectDocument,
  onShowToast,
}) => {
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');

  const [documentToDelete, setDocumentToDelete] = useState<DocumentListItem | null>(null);

  const fetchDocuments = async () => {
    setIsLoading(true);
    try {
      const data = await api.listDocuments(searchTerm, typeFilter, statusFilter);
      setDocuments(data);
    } catch (err) {
      onShowToast('Failed to load document history', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [typeFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchDocuments();
  };

  const handleConfirmDelete = async () => {
    if (!documentToDelete) return;
    try {
      await api.deleteDocument(documentToDelete.id);
      setDocuments((prev) => prev.filter((d) => d.id !== documentToDelete.id));
      onShowToast(`Document "${documentToDelete.filename}" deleted`, 'success');
      setDocumentToDelete(null);
    } catch (err) {
      onShowToast('Failed to delete document', 'error');
    }
  };

  const formatCurrency = (amt: number | null | undefined, curr: string) => {
    if (amt === null || amt === undefined) return 'N/A';
    if (curr === 'INR') {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2,
      }).format(amt);
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr || 'USD',
      maximumFractionDigits: 2,
    }).format(amt);
  };

  return (
    <div className="history-container">
      <div className="history-header">
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0f172a' }}>
            Document History
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
            Search, filter, and review all previously processed receipts and invoices.
          </p>
        </div>

        <button className="btn-secondary" onClick={fetchDocuments} style={{ fontSize: '0.85rem' }}>
          Refresh
        </button>
      </div>

      {/* Search & Filter Toolbar */}
      <form onSubmit={handleSearchSubmit} className="search-filter-bar">
        <div className="search-input-box">
          <Search size={16} className="search-icon-pos" />
          <input
            type="text"
            placeholder="Search by merchant, invoice #, or file name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <select
          className="select-filter"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="All">All Types</option>
          <option value="Receipt">Receipt</option>
          <option value="Tax Invoice">Tax Invoice</option>
          <option value="Purchase Order">Purchase Order</option>
          <option value="Medical Bill">Medical Bill</option>
          <option value="Fuel Bill">Fuel Bill</option>
          <option value="Utility Bill">Utility Bill</option>
          <option value="Transport Bill">Transport Bill</option>
          <option value="Other">Other</option>
        </select>

        <select
          className="select-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="All">All Statuses</option>
          <option value="verified">Verified</option>
          <option value="ready_for_review">Ready for Review</option>
          <option value="needs_review">Needs Review</option>
        </select>

        <button type="submit" className="btn-primary" style={{ padding: '0.55rem 1.1rem' }}>
          Filter
        </button>
      </form>

      {/* Document Cards Grid */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
          Loading document history...
        </div>
      ) : documents.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '3.5rem 1rem',
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
          }}
        >
          <FileText size={40} color="#94a3b8" style={{ margin: '0 auto 0.75rem' }} />
          <h3 style={{ fontSize: '1.15rem', color: '#1e293b', marginBottom: '0.25rem' }}>
            No documents found
          </h3>
          <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
            Upload a document from the reader screen to see it in your history.
          </p>
        </div>
      ) : (
        <div className="documents-grid">
          {documents.map((doc) => {
            const thumbUrl = doc.thumbnail_url || api.getThumbnailUrl(doc.id);

            return (
              <div key={doc.id} className="doc-history-card">
                <div>
                  <div style={{ display: 'flex', gap: '0.9rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div
                      style={{
                        width: '52px',
                        height: '52px',
                        borderRadius: '8px',
                        background: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {doc.mime_type.startsWith('image/') ? (
                        <img
                          src={thumbUrl}
                          alt="Thumbnail"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <FileText size={26} color="#059669" />
                      )}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '1rem',
                          fontWeight: 700,
                          color: '#0f172a',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {doc.merchant_name || doc.filename}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', gap: '0.5rem', marginTop: '0.15rem' }}>
                        <span>{doc.document_type}</span>
                        {doc.invoice_date && <span>&bull; {doc.invoice_date}</span>}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {doc.line_items_count} Line Items
                    </span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#059669' }}>
                      {formatCurrency(doc.total_amount, doc.currency)}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: '1px solid #f1f5f9',
                    paddingTop: '0.85rem',
                    marginTop: '0.5rem',
                  }}
                >
                  <span
                    className={`badge ${
                      doc.review_status === 'verified'
                        ? 'badge-emerald'
                        : doc.review_status === 'needs_review'
                        ? 'badge-amber'
                        : 'badge-blue'
                    }`}
                  >
                    {doc.review_status.replace(/_/g, ' ').toUpperCase()}
                  </span>

                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button
                      className="btn-primary"
                      style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                      onClick={() => onSelectDocument(doc.id)}
                    >
                      <Eye size={13} />
                      <span>View</span>
                    </button>

                    <button
                      className="icon-btn"
                      style={{ color: '#b91c1c' }}
                      onClick={() => setDocumentToDelete(doc)}
                      title="Delete document"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {documentToDelete && (
        <div className="modal-overlay" style={{ zIndex: 90 }}>
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#b91c1c', marginBottom: '1rem' }}>
              <AlertTriangle size={24} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>
                Delete Document?
              </h3>
            </div>

            <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '1.5rem' }}>
              Are you sure you want to delete <strong>{documentToDelete.filename}</strong>? This will permanently remove the original file and its structured data.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                className="btn-secondary"
                onClick={() => setDocumentToDelete(null)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                style={{ background: '#b91c1c' }}
                onClick={handleConfirmDelete}
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
