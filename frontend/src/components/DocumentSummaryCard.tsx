import React, { useState } from 'react';
import { FileText, CheckCircle2, AlertTriangle, Clock, Layers } from 'lucide-react';
import type { DocumentData } from '../types/document';
import { api } from '../api/client';

interface DocumentSummaryCardProps {
  document: DocumentData;
  onEnlarge: () => void;
}

export const DocumentSummaryCard: React.FC<DocumentSummaryCardProps> = ({
  document,
  onEnlarge,
}) => {
  const [thumbError, setThumbError] = useState(false);
  const formatCurrency = (amount: number | null | undefined, currency: string) => {
    if (amount === null || amount === undefined) return 'N/A';
    if (currency === 'INR') {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2,
      }).format(amount);
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const getReviewStatusBadge = (status: string) => {
    switch (status) {
      case 'verified':
        return (
          <span className="badge badge-emerald">
            <CheckCircle2 size={13} />
            Verified
          </span>
        );
      case 'needs_review':
        return (
          <span className="badge badge-amber">
            <AlertTriangle size={13} />
            Needs Review
          </span>
        );
      default:
        return (
          <span className="badge badge-blue">
            <Clock size={13} />
            Ready for Review
          </span>
        );
    }
  };

  const thumbUrl = document.thumbnail_url || api.getThumbnailUrl(document.id);

  return (
    <div className="summary-card">
      <div className="summary-left">
        <div
          className="summary-thumb-box"
          onClick={onEnlarge}
          title="Click to view original document"
        >
          {document.mime_type.startsWith('image/') && !thumbError ? (
            <img src={thumbUrl} alt="Thumbnail" onError={() => setThumbError(true)} />
          ) : (
            <FileText size={28} color="#059669" />
          )}
        </div>

        <div className="summary-meta">
          <h2>{document.merchant_name || 'Document Receipt'}</h2>
          <div className="summary-badges-row">
            <span className="badge badge-purple">{document.document_type}</span>
            {getReviewStatusBadge(document.review_status)}
            <span className="badge" style={{ background: '#f1f5f9', color: '#475569' }}>
              <Layers size={13} />
              {document.line_items?.length || 0} Line Items
            </span>
            {document.invoice_date && (
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                &bull; {document.invoice_date}
              </span>
            )}
            {document.invoice_number && (
              <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                &bull; #{document.invoice_number}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="summary-amount-box">
        <div className="summary-amount-label">Total Amount</div>
        <div className="summary-amount-value">
          {formatCurrency(document.total_amount, document.currency)}
        </div>
      </div>
    </div>
  );
};
