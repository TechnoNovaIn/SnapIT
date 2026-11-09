import React from 'react';
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, X } from 'lucide-react';

export type ProcessingStep = 'uploading' | 'reading' | 'extracting' | 'validating' | 'completed' | 'failed';

interface ProcessingModalProps {
  currentStep: ProcessingStep;
  errorMessage?: string | null;
  file?: File | null;
  onRetry: () => void;
  onCancel: () => void;
}

const STEPS = [
  { key: 'uploading', label: 'Uploading document' },
  { key: 'reading', label: 'Reading document' },
  { key: 'extracting', label: 'Extracting information' },
  { key: 'validating', label: 'Validating details' },
  { key: 'completed', label: 'Completed' },
];

export const ProcessingModal: React.FC<ProcessingModalProps> = ({
  currentStep,
  errorMessage,
  file,
  onRetry,
  onCancel,
}) => {
  const [thumb, setThumb] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (file && (file.type.startsWith('image/') || file.name.match(/\.(jpg|jpeg|png|webp)$/i))) {
      try {
        const url = URL.createObjectURL(file);
        setThumb(url);
        return () => URL.revokeObjectURL(url);
      } catch {}
    } else {
      setThumb(null);
    }
  }, [file]);
  const getStepStatus = (stepKey: string) => {
    const order = ['uploading', 'reading', 'extracting', 'validating', 'completed'];
    const currentIndex = order.indexOf(currentStep);
    const stepIndex = order.indexOf(stepKey);

    if (currentStep === 'failed') {
      return stepIndex <= 2 ? 'completed' : 'pending';
    }
    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'active';
    return 'pending';
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
            {currentStep === 'failed' ? 'Processing Interrupted' : 'Analyzing Document'}
          </h3>
          {currentStep === 'failed' && (
            <button className="icon-btn" onClick={onCancel}>
              <X size={20} />
            </button>
          )}
        </div>

        <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '0.25rem' }}>
          {currentStep === 'failed'
            ? 'An error occurred during AI extraction'
            : 'Applying vision & OCR models to structure invoice fields...'}
        </p>

        {thumb && (
          <div style={{ textAlign: 'center', margin: '0.75rem 0' }}>
            <div
              style={{
                position: 'relative',
                display: 'inline-block',
                borderRadius: '12px',
                overflow: 'hidden',
                border: '1.5px solid #e2e8f0',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                background: '#0f172a',
              }}
            >
              <img
                src={thumb}
                alt="Bill Upload Preview"
                style={{ maxHeight: '130px', maxWidth: '240px', objectFit: 'contain', display: 'block' }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: 'rgba(15, 23, 42, 0.75)',
                  color: '#ffffff',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  padding: '3px 8px',
                  backdropFilter: 'blur(4px)',
                }}
              >
                Bill Preview
              </div>
            </div>
          </div>
        )}

        <div className="stepper-container">
          {STEPS.map((s, index) => {
            const status = getStepStatus(s.key);
            const isCurrent = currentStep === s.key;

            return (
              <div
                key={s.key}
                className={`stepper-step ${isCurrent ? 'active' : ''} ${status === 'completed' ? 'completed' : ''}`}
              >
                <div className="step-indicator">
                  {status === 'completed' ? (
                    <CheckCircle2 size={18} color="#10b981" />
                  ) : isCurrent ? (
                    <Loader2 size={16} className="spin" color="#059669" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                <div className="step-label">{s.label}</div>
              </div>
            );
          })}
        </div>

        {currentStep === 'failed' && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '0.85rem 1rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              marginTop: '1rem',
            }}
          >
            <AlertCircle size={20} color="#b91c1c" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div>
              <div style={{ fontWeight: 600, color: '#991b1b', fontSize: '0.9rem' }}>
                Extraction Failed
              </div>
              <div style={{ color: '#b91c1c', fontSize: '0.825rem', marginTop: '0.2rem' }}>
                {errorMessage || 'Unable to parse document contents. Check image clarity or network connection.'}
              </div>
            </div>
          </div>
        )}

        {currentStep === 'failed' && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
            <button className="btn-primary" onClick={onRetry}>
              <RefreshCw size={16} />
              <span>Retry Processing</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
