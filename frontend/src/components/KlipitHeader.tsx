import React from 'react';
import { User, Settings } from 'lucide-react';
import { KlipitLogo } from './KlipitLogo';

interface KlipitHeaderProps {
  onOpenSettings?: () => void;
  onOpenProfile?: () => void;
  onOpenAccount?: () => void;
}

export const KlipitHeader: React.FC<KlipitHeaderProps> = ({ onOpenSettings, onOpenProfile, onOpenAccount }) => {
  return (
    <div className="klipit-top-header">
      <button
        className="klipit-icon-circle-btn"
        onClick={onOpenAccount || onOpenProfile || onOpenSettings}
        title="Your Account"
      >
        <User size={22} color="#1e293b" />
      </button>

      <div className="klipit-header-center">
        <KlipitLogo size={34} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {onOpenSettings && (
          <button className="klipit-icon-circle-btn" onClick={onOpenSettings} title="Settings">
            <Settings size={20} color="#1e293b" />
          </button>
        )}
      </div>
    </div>
  );
};
