import React, { useState, useRef, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import {
  UploadCloud,
  Camera,
  FileUp,
  X,
  FileText,
  Sparkles,
  Plus,
  Video,
} from 'lucide-react';

interface StagedFile {
  id: string;
  file: File;
  previewUrl: string | null;
}

interface UploadSectionProps {
  onStartProcessing: (file: File) => void;
  isUploading: boolean;
}

export const UploadSection: React.FC<UploadSectionProps> = ({
  onStartProcessing,
  isUploading,
}) => {
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showWebcam, setShowWebcam] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const addFiles = (files: FileList | File[]) => {
    const newItems: StagedFile[] = [];
    Array.from(files).forEach((file) => {
      const isImg = file.type.startsWith('image/');
      const previewUrl = isImg ? URL.createObjectURL(file) : null;
      newItems.push({
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        previewUrl,
      });
    });
    setStagedFiles((prev) => [...prev, ...newItems]);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleRemove = (id: string) => {
    setStagedFiles((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const handleClearAll = () => {
    stagedFiles.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    setStagedFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  // In-Browser Live Webcam Capture
  const startWebcam = async () => {
    setShowWebcam(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch {
      cameraInputRef.current?.click();
      setShowWebcam(false);
    }
  };

  const stopWebcam = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setShowWebcam(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 1280;
    canvas.height = videoRef.current.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
        addFiles([file]);
        stopWebcam();
      }
    }, 'image/jpeg', 0.95);
  };

  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <div className="upload-card-wrapper">
      <div className="hero-banner">
        <h1 className="hero-title">
          Smart Document <span>Reader</span>
        </h1>
        <p className="hero-subtitle">
          Instantly transform any paper receipt, invoice, medical bill, or utility bill into structured digital data.
        </p>
      </div>

      {stagedFiles.length === 0 ? (
        <div
          className={`upload-card ${isDragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
        >
          <div className="upload-icon-circle">
            <UploadCloud size={32} />
          </div>

          <h3>Upload or Photograph Document</h3>
          <p>Drag and drop multiple files or a single document here</p>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            style={{ display: 'none' }}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              if (e.target.files && e.target.files.length > 0) {
                addFiles(e.target.files);
              }
            }}
          />

          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              if (e.target.files && e.target.files.length > 0) {
                addFiles(e.target.files);
              }
            }}
          />

          <div className="upload-actions-row">
            <button
              className="btn-primary"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp size={18} />
              <span>Browse Files</span>
            </button>

            <button
              className="btn-secondary"
              onClick={startWebcam}
            >
              <Camera size={18} />
              <span>Camera Capture</span>
            </button>
          </div>

          <div className="file-specs-hint">
            Supported formats: <strong>JPG, JPEG, PNG, WebP, PDF</strong> &bull; Max file size: <strong>25 MB</strong> &bull; Multiple files supported
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a' }}>
              Staged Documents ({stagedFiles.length})
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn-secondary"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus size={14} />
                <span>Add More</span>
              </button>

              <button
                className="btn-secondary"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', color: '#b91c1c' }}
                onClick={handleClearAll}
              >
                Clear All
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {stagedFiles.map((item) => (
              <div key={item.id} className="staged-file-card" style={{ marginTop: 0 }}>
                <div className="staged-file-info">
                  <div className="staged-thumb-wrapper">
                    {item.previewUrl ? (
                      <img src={item.previewUrl} alt="Preview" />
                    ) : (
                      <FileText size={26} color="#059669" />
                    )}
                  </div>
                  <div className="staged-file-details">
                    <div className="staged-file-name" title={item.file.name}>
                      {item.file.name}
                    </div>
                    <div className="staged-file-size">
                      {formatFileSize(item.file.size)} &bull; {item.file.type || 'Document'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    className="icon-btn"
                    style={{ color: '#b91c1c' }}
                    onClick={() => handleRemove(item.id)}
                    title="Remove this document"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            style={{ display: 'none' }}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              if (e.target.files && e.target.files.length > 0) {
                addFiles(e.target.files);
              }
            }}
          />

          <div className="read-button-container" style={{ marginTop: '2rem' }}>
            <button
              className="btn-read-large"
              onClick={() => onStartProcessing(stagedFiles[0].file)}
              disabled={isUploading}
            >
              <Sparkles size={20} />
              <span>
                {stagedFiles.length === 1
                  ? 'Read Document'
                  : `Read Document (1 of ${stagedFiles.length})`}
              </span>
            </button>
            <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.5rem' }}>
              Processing will extract fields, line items, and totals using Vision AI.
            </div>
          </div>
        </div>
      )}

      {/* Live Camera Viewfinder Modal */}
      {showWebcam && (
        <div className="modal-overlay" style={{ zIndex: 90 }}>
          <div className="modal-content" style={{ maxWidth: '640px', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Video size={18} color="#059669" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Position Document in Viewfinder</h3>
              </div>
              <button className="icon-btn" onClick={stopWebcam}>
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                width: '100%',
                height: '380px',
                background: '#000000',
                borderRadius: '12px',
                overflow: 'hidden',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: '20px',
                  border: '2px dashed rgba(255, 255, 255, 0.6)',
                  borderRadius: '8px',
                  pointerEvents: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
              <button className="btn-secondary" onClick={stopWebcam}>
                Cancel
              </button>
              <button className="btn-primary" onClick={capturePhoto}>
                <Camera size={18} />
                <span>Snap Document</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
