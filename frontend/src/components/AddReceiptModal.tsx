import React, { useState, useRef } from 'react';
import type { ChangeEvent } from 'react';
import {
  X,
  ChevronDown,
  Check,
  Camera as CameraIcon,
  UploadCloud,
} from 'lucide-react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

interface AddReceiptModalProps {
  onClose: () => void;
  onFileSelected: (file: File) => void;
  onManualExpenseCreate: (data: {
    merchant_name: string;
    total_amount: number;
    category?: string;
  }) => void;
}

export const AddReceiptModal: React.FC<AddReceiptModalProps> = ({
  onClose,
  onFileSelected,
  onManualExpenseCreate,
}) => {
  const [merchantName, setMerchantName] = useState<string>('');
  const [totalAmount, setTotalAmount] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const isNative = typeof window !== 'undefined' && 
    (window.location.protocol === 'capacitor:' || !!(window as any).Capacitor?.isNativePlatform?.());

  // Dual-Platform Camera Capture (Android Native Camera & Web Browser Camera)
  const handleCameraCapture = async () => {
    if (isNative) {
      try {
        setIsCapturing(true);
        const photo = await Camera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.Uri,
          source: CameraSource.Camera,
        });

        if (photo.webPath) {
          const response = await fetch(photo.webPath);
          const blob = await response.blob();
          const file = new File(
            [blob],
            `receipt_camera_${Date.now()}.${photo.format || 'jpg'}`,
            { type: `image/${photo.format || 'jpeg'}` }
          );
          onFileSelected(file);
          onClose();
          return;
        }
      } catch (err) {
        console.warn('[SnapIT] Capacitor camera error, falling back to file input:', err);
      } finally {
        setIsCapturing(false);
      }
    }

    // On Web (or fallback): trigger camera input with capture="environment"
    if (cameraInputRef.current) {
      cameraInputRef.current.click();
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelected(e.target.files[0]);
      onClose();
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelected(e.dataTransfer.files[0]);
      onClose();
    }
  };

  const handleManualSubmit = () => {
    const amt = parseFloat(totalAmount);
    if (!amt || isNaN(amt)) return;
    onManualExpenseCreate({
      merchant_name: merchantName.trim() || 'Manual Expense',
      total_amount: amt,
    });
    onClose();
  };

  return (
    <div className="modal-overlay" style={{ alignItems: 'flex-end', padding: 0 }}>
      <div className="klipit-bottom-sheet">
        {/* Header */}
        <div className="klipit-sheet-header">
          <h2 className="klipit-sheet-title">Add Receipts/Expense</h2>
          <button className="klipit-close-circle" onClick={onClose}>
            <X size={20} color="#64748b" />
          </button>
        </div>

        <div className="klipit-sheet-body">
          {/* Card 1: Camera & Upload Options for Web & Mobile */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '1rem' }}>
            <button
              type="button"
              className="klipit-scan-card"
              onClick={handleCameraCapture}
              disabled={isCapturing}
              style={{ padding: '1.25rem 0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
            >
              <div className="klipit-scan-icon-wrap" style={{ marginBottom: '6px' }}>
                <CameraIcon size={32} color="#16a34a" strokeWidth={2} />
              </div>
              <div className="klipit-scan-title" style={{ fontSize: '0.92rem' }}>
                {isCapturing ? 'Opening Camera...' : 'Take Photo'}
              </div>
              <span style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '2px' }}>
                {isNative ? 'Device Camera' : 'Camera / Webcam'}
              </span>
            </button>

            <button
              type="button"
              className={`klipit-scan-card ${isDragOver ? 'drag-over' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              style={{ padding: '1.25rem 0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
            >
              <div className="klipit-scan-icon-wrap" style={{ marginBottom: '6px' }}>
                <UploadCloud size={32} color="#0284c7" strokeWidth={2} />
              </div>
              <div className="klipit-scan-title" style={{ fontSize: '0.92rem' }}>Choose File</div>
              <span style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '2px' }}>Gallery / PDF / File</span>
            </button>
          </div>

          {/* Hidden File Inputs for Standard File & Direct Camera on Web */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf,image/*"
            style={{ display: 'none' }}
            onChange={handleFileInput}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={handleFileInput}
          />

          <div className="klipit-or-divider">(OR)</div>

          {/* Card 2: Manual Total Amount */}
          <div className="klipit-amount-box">
            <div className="klipit-amount-label">Merchant / Note (optional)</div>
            <input
              type="text"
              placeholder="e.g. Cafe, Pharmacy, Electronics"
              value={merchantName}
              onChange={(e) => setMerchantName(e.target.value)}
              className="klipit-amount-field"
              style={{ width: '100%', marginBottom: '1rem', fontSize: '0.95rem' }}
            />

            <div className="klipit-amount-label">Total amount*</div>
            <div className="klipit-amount-input-row">
              <div className="klipit-curr-pill">
                <ChevronDown size={16} />
                <span>INR</span>
              </div>
              <input
                type="number"
                placeholder="Enter Amount"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                className="klipit-amount-field"
              />
            </div>
          </div>

          {parseFloat(totalAmount) > 0 && (
            <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
              <button
                className="btn-read-large"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={handleManualSubmit}
              >
                <Check size={18} />
                <span>Save Expense</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
