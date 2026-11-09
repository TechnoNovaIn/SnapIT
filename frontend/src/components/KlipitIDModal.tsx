import React from 'react';
import { X, QrCode, Copy, Check, ShieldCheck } from 'lucide-react';

interface KlipitIDModalProps {
  onClose: () => void;
  userName?: string;
  klipitId?: string;
}

export const KlipitIDModal: React.FC<KlipitIDModalProps> = ({
  onClose,
  userName = 'User',
  klipitId = 'SNP-89241-BLR',
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(klipitId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="klipit-id-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="klipit-sheet-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <QrCode size={20} color="#16a34a" />
            <h2 className="klipit-sheet-title">My SnapIT ID</h2>
          </div>
          <button className="klipit-close-circle" onClick={onClose}>
            <X size={18} color="#64748b" />
          </button>
        </div>

        <div className="klipit-id-card-body">
          {/* Virtual Loyalty / SnapIT Card */}
          <div className="klipit-virtual-card">
            <div className="klipit-virtual-card-top">
              <div className="klipit-virtual-brand">
                <span className="brand-logo-text" style={{ fontWeight: 800 }}>SnapIT</span>
                <span className="brand-badge-id">DIGITAL ID</span>
              </div>
              <ShieldCheck size={22} color="#4ade80" />
            </div>

            <div className="klipit-virtual-qr-wrap">
              {/* Stylized QR Code SVG */}
              <svg viewBox="0 0 160 160" width="140" height="140" className="qr-svg">
                <rect width="160" height="160" fill="#ffffff" rx="12" />
                {/* Position detection squares */}
                {/* Top Left */}
                <rect x="15" y="15" width="40" height="40" rx="6" fill="#0f172a" />
                <rect x="23" y="23" width="24" height="24" rx="3" fill="#ffffff" />
                <rect x="29" y="29" width="12" height="12" rx="2" fill="#16a34a" />

                {/* Top Right */}
                <rect x="105" y="15" width="40" height="40" rx="6" fill="#0f172a" />
                <rect x="113" y="23" width="24" height="24" rx="3" fill="#ffffff" />
                <rect x="119" y="29" width="12" height="12" rx="2" fill="#16a34a" />

                {/* Bottom Left */}
                <rect x="15" y="105" width="40" height="40" rx="6" fill="#0f172a" />
                <rect x="23" y="113" width="24" height="24" rx="3" fill="#ffffff" />
                <rect x="29" y="119" width="12" height="12" rx="2" fill="#16a34a" />

                {/* Central QR Data Bits */}
                <rect x="65" y="20" width="10" height="10" rx="2" fill="#0f172a" />
                <rect x="85" y="20" width="10" height="10" rx="2" fill="#0f172a" />
                <rect x="65" y="40" width="10" height="10" rx="2" fill="#16a34a" />
                <rect x="85" y="45" width="10" height="10" rx="2" fill="#0f172a" />
                <rect x="65" y="65" width="30" height="30" rx="4" fill="#0f172a" />
                <circle cx="80" cy="80" r="6" fill="#4ade80" />
                <rect x="20" y="65" width="10" height="10" rx="2" fill="#0f172a" />
                <rect x="35" y="80" width="10" height="10" rx="2" fill="#0f172a" />
                <rect x="110" y="65" width="10" height="10" rx="2" fill="#0f172a" />
                <rect x="130" y="80" width="10" height="10" rx="2" fill="#16a34a" />
                <rect x="65" y="110" width="10" height="10" rx="2" fill="#0f172a" />
                <rect x="85" y="110" width="10" height="10" rx="2" fill="#0f172a" />
                <rect x="65" y="130" width="20" height="10" rx="2" fill="#0f172a" />
                <rect x="105" y="115" width="15" height="10" rx="2" fill="#0f172a" />
                <rect x="125" y="130" width="15" height="10" rx="2" fill="#16a34a" />
              </svg>
            </div>

            <div className="klipit-virtual-member-name">{userName}</div>

            <div className="klipit-id-number-row" onClick={handleCopy}>
              <span className="klipit-id-mono">{klipitId}</span>
              <button className="klipit-copy-icon-btn" title="Copy SnapIT ID">
                {copied ? <Check size={16} color="#22c55e" /> : <Copy size={16} color="#94a3b8" />}
              </button>
            </div>
          </div>

          <div className="klipit-id-helper-box">
            <p>
              Show this QR code at checkout in participating stores to automatically clip your receipts into SnapIT!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
