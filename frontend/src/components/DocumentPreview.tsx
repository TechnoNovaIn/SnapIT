import React, { useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  ExternalLink,
  FileText,
  Minimize2,
  Download,
  Eye,
  FileCheck
} from 'lucide-react';
import { api, resolveAssetUrl } from '../api/client';

export interface DocumentPreviewProps {
  documentId: string;
  filename: string;
  mimeType: string;
  fileUrl?: string | null;
  thumbnailUrl?: string | null;
  fileSize?: number | null;
  inline?: boolean;
}

export const DocumentPreview: React.FC<DocumentPreviewProps> = ({
  documentId,
  filename,
  mimeType,
  fileUrl: propFileUrl,
  thumbnailUrl: propThumbnailUrl,
  fileSize,
  inline = false,
}) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Compute effective URLs
  const rawFileUrl = propFileUrl || api.getOriginalFileUrl(documentId);
  const rawThumbUrl = propThumbnailUrl || api.getThumbnailUrl(documentId);
  const fileUrl = resolveAssetUrl(rawFileUrl);
  const thumbnailUrl = resolveAssetUrl(rawThumbUrl);

  const isPdf = mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
  const isManual = filename.toLowerCase().endsWith('.manual');

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3.5));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handleResetZoom = () => {
    setZoom(1);
    setRotation(0);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (isManual) {
    return (
      <div className="viewer-panel" style={{ padding: '2rem 1rem', textAlign: 'center', background: '#f8fafc' }}>
        <FileCheck size={40} color="#16a34a" style={{ margin: '0 auto 10px' }} />
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
          Manual Expense Entry
        </h3>
        <p style={{ fontSize: '0.82rem', color: '#64748b' }}>
          This receipt was added manually with verified expense data. No physical scan attached.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="viewer-panel" style={inline ? { position: 'static', margin: 0 } : undefined}>
        {/* Header Bar */}
        <div className="viewer-header">
          <div className="viewer-title">
            <Eye size={16} color="#16a34a" />
            <span
              style={{
                maxWidth: '220px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: 600,
              }}
              title={filename}
            >
              {filename || 'Uploaded Bill'}
            </span>
            {fileSize ? (
              <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500 }}>
                ({formatFileSize(fileSize)})
              </span>
            ) : null}
          </div>

          <div className="viewer-controls">
            {!isPdf && (
              <>
                <button className="icon-btn" onClick={handleZoomOut} title="Zoom Out">
                  <ZoomOut size={16} />
                </button>
                <span
                  onClick={handleResetZoom}
                  style={{
                    fontSize: '0.78rem',
                    color: '#64748b',
                    minWidth: '40px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                  title="Click to reset zoom"
                >
                  {Math.round(zoom * 100)}%
                </span>
                <button className="icon-btn" onClick={handleZoomIn} title="Zoom In">
                  <ZoomIn size={16} />
                </button>
                <button className="icon-btn" onClick={handleRotate} title="Rotate 90°">
                  <RotateCw size={16} />
                </button>
              </>
            )}

            <button
              className="icon-btn"
              onClick={() => setIsFullScreen(true)}
              title="Fullscreen Preview"
            >
              <Maximize2 size={16} />
            </button>

            <a
              href={fileUrl}
              download={filename}
              className="icon-btn"
              title="Download original file"
            >
              <Download size={16} />
            </a>

            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="icon-btn"
              title="Open full resolution in new tab"
            >
              <ExternalLink size={16} />
            </a>
          </div>
        </div>

        {/* Viewer Canvas */}
        <div
          className="viewer-body"
          style={{
            height: inline ? '360px' : '520px',
            background: '#0b1329',
          }}
        >
          {isPdf ? (
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
              <iframe
                src={fileUrl}
                title="Original Uploaded PDF"
                className="viewer-iframe"
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
              {/* Fallback button overlay if browser blocks inline PDF */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  right: '12px',
                  display: 'flex',
                  gap: '8px',
                }}
              >
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary-sm"
                  style={{
                    background: 'rgba(15, 23, 42, 0.85)',
                    backdropFilter: 'blur(6px)',
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.78rem',
                  }}
                >
                  <ExternalLink size={13} />
                  <span>Open Full PDF</span>
                </a>
              </div>
            </div>
          ) : imageError ? (
            <div style={{ color: '#94a3b8', textAlign: 'center', padding: '2.5rem 1.5rem', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
              <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <FileText size={28} color="#059669" />
              </div>
              <h4 style={{ fontSize: '0.96rem', fontWeight: 700, color: '#1e293b', marginBottom: '4px' }}>
                {filename || 'Uploaded Receipt Scan'}
              </h4>
              <p style={{ fontSize: '0.82rem', color: '#64748b', maxWidth: '340px', margin: '0 auto 14px' }}>
                Original document was processed and digital receipt data extracted. File image preview is archived in your storage vault.
              </p>
              {fileUrl && !fileUrl.startsWith('data:') && (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', margin: '0 auto' }}
                >
                  <ExternalLink size={14} />
                  <span>Open Attached Document</span>
                </a>
              )}
            </div>
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'auto',
                cursor: zoom > 1 ? 'grab' : 'zoom-in',
              }}
              onClick={() => {
                if (zoom === 1) setZoom(1.5);
              }}
            >
              <img
                src={fileUrl || thumbnailUrl}
                alt={filename || 'Uploaded Bill Scan'}
                className="viewer-img"
                onError={() => {
                  if (fileUrl && thumbnailUrl && fileUrl !== thumbnailUrl) {
                    // Try thumbnail if main file failed
                    setImageError(true);
                  } else {
                    setImageError(true);
                  }
                }}
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  maxWidth: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  borderRadius: '4px',
                }}
              />
            </div>
          )}
        </div>

        {/* Footer info strip */}
        <div
          style={{
            padding: '8px 14px',
            background: '#0f172a',
            color: '#94a3b8',
            fontSize: '0.74rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <span>
            {isPdf ? 'PDF Bill Document' : 'Original Scanned Bill'} &bull; Click to enlarge
          </span>
          <button
            onClick={() => setIsFullScreen(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#4ade80',
              fontWeight: 600,
              fontSize: '0.74rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <Maximize2 size={12} />
            <span>Full Screen</span>
          </button>
        </div>
      </div>

      {/* Fullscreen Enlarge Modal */}
      {isFullScreen && (
        <div
          className="modal-overlay"
          style={{ zIndex: 9999, background: 'rgba(0, 0, 0, 0.92)' }}
          onClick={() => setIsFullScreen(false)}
        >
          <div
            style={{
              background: '#0f172a',
              width: '96vw',
              height: '94vh',
              borderRadius: '20px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '0.9rem 1.25rem',
                background: '#1e293b',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                color: '#ffffff',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Eye size={18} color="#4ade80" />
                <span style={{ fontWeight: 700, fontSize: '0.96rem' }}>
                  {filename || 'Uploaded Bill Preview'}
                </span>
                {fileSize ? (
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    ({formatFileSize(fileSize)})
                  </span>
                ) : null}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {!isPdf && (
                  <>
                    <button
                      className="icon-btn"
                      style={{ color: '#ffffff' }}
                      onClick={handleZoomOut}
                      title="Zoom Out"
                    >
                      <ZoomOut size={18} />
                    </button>
                    <span
                      onClick={handleResetZoom}
                      style={{
                        fontSize: '0.82rem',
                        color: '#cbd5e1',
                        minWidth: '45px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                      title="Reset"
                    >
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      className="icon-btn"
                      style={{ color: '#ffffff' }}
                      onClick={handleZoomIn}
                      title="Zoom In"
                    >
                      <ZoomIn size={18} />
                    </button>
                    <button
                      className="icon-btn"
                      style={{ color: '#ffffff' }}
                      onClick={handleRotate}
                      title="Rotate 90°"
                    >
                      <RotateCw size={18} />
                    </button>
                  </>
                )}

                <a
                  href={fileUrl}
                  download={filename}
                  className="icon-btn"
                  style={{ color: '#ffffff' }}
                  title="Download File"
                >
                  <Download size={18} />
                </a>

                <button
                  className="icon-btn"
                  style={{ color: '#ffffff', marginLeft: '6px' }}
                  onClick={() => setIsFullScreen(false)}
                  title="Close preview"
                >
                  <Minimize2 size={20} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'auto',
                padding: '1rem',
                background: '#020617',
              }}
            >
              {isPdf ? (
                <iframe
                  src={fileUrl}
                  title="Fullscreen PDF"
                  style={{ width: '100%', height: '100%', border: 'none', background: '#ffffff', borderRadius: '8px' }}
                />
              ) : (
                <img
                  src={fileUrl || thumbnailUrl}
                  alt="Fullscreen View"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain',
                    transform: `scale(${zoom}) rotate(${rotation}deg)`,
                    transition: 'transform 0.2s ease',
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
