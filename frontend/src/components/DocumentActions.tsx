import React, { useState } from 'react';
import {
  Edit3,
  Save,
  Download,
  FileJson,
  FileSpreadsheet,
  FileCheck,
  Share2,
  Copy,
  Check,
  Lock,
  X,
} from 'lucide-react';
import type { DocumentData } from '../types/document';
import { api } from '../api/client';

interface DocumentActionsProps {
  document: DocumentData;
  onEdit: () => void;
  onSave: () => void;
  onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const DocumentActions: React.FC<DocumentActionsProps> = ({
  document,
  onEdit,
  onSave,
  onShowToast,
}) => {
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  const handleShareClick = async () => {
    try {
      const res = await api.createShareLink(document.id);
      const fullUrl = `${window.location.origin}?shared=${res.share_token}`;
      setShareUrl(fullUrl);
      setShowShareModal(true);
    } catch (err) {
      onShowToast('Could not generate secure share link', 'error');
    }
  };

  const handleCopyShare = () => {
    navigator.clipboard.writeText(shareUrl);
    setIsCopied(true);
    onShowToast('Secure share link copied to clipboard!', 'success');
    setTimeout(() => setIsCopied(false), 2500);
  };

  return (
    <>
      <div className="actions-bar">
        <div className="actions-group">
          <button className="btn-primary" onClick={onEdit}>
            <Edit3 size={16} />
            <span>Edit Details</span>
          </button>

          <button className="btn-secondary" onClick={onSave}>
            <Save size={16} />
            <span>Save to Database</span>
          </button>
        </div>

        <div className="actions-group">
          <a
            href={api.getOriginalFileUrl(document.id)}
            download={document.filename}
            className="btn-secondary"
            title="Download Original Uploaded File"
          >
            <Download size={16} />
            <span>Original</span>
          </a>

          <a
            href={api.getExportJsonUrl(document.id)}
            className="btn-secondary"
            title="Export structured JSON"
          >
            <FileJson size={16} />
            <span>JSON</span>
          </a>

          <a
            href={api.getExportCsvUrl(document.id)}
            className="btn-secondary"
            title="Export CSV spreadsheet"
          >
            <FileSpreadsheet size={16} />
            <span>CSV</span>
          </a>

          <a
            href={api.getExportExcelUrl(document.id)}
            className="btn-secondary"
            title="Export Excel spreadsheet (.xlsx)"
          >
            <FileSpreadsheet size={16} color="#059669" />
            <span>Excel</span>
          </a>

          <a
            href={api.getExportPdfUrl(document.id)}
            className="btn-secondary"
            title="Download summary PDF receipt"
          >
            <FileCheck size={16} />
            <span>PDF Summary</span>
          </a>

          <button className="btn-secondary" onClick={handleShareClick}>
            <Share2 size={16} />
            <span>Share</span>
          </button>
        </div>
      </div>

      {/* Access Controlled Share Modal */}
      {showShareModal && (
        <div className="modal-overlay" style={{ zIndex: 80 }}>
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Lock size={18} color="#059669" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Secure Document Share</h3>
              </div>
              <button className="icon-btn" onClick={() => setShowShareModal(false)}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.25rem' }}>
              This document is protected. Only users with this unique token link can view this document without needing an account.
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="form-input"
                style={{ fontSize: '0.85rem', background: '#f8fafc' }}
              />
              <button className="btn-primary" onClick={handleCopyShare} style={{ flexShrink: 0 }}>
                {isCopied ? <Check size={16} /> : <Copy size={16} />}
                <span>{isCopied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setShowShareModal(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
