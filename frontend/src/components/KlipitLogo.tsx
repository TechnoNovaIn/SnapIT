import React from 'react';

export const KlipitLogo: React.FC<{ size?: number }> = ({ size = 32 }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="40" height="40" rx="10" fill="#22C55E" />
        {/* Stylized SnapIT Camera Shutter / S Glyph */}
        <path
          d="M26 13H14C12.3431 13 11 14.3431 11 16V26C11 27.6569 12.3431 29 14 29H26C27.6569 29 29 27.6569 29 26V16C29 14.3431 27.6569 13 26 13Z"
          stroke="white"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="20" cy="21" r="4.5" stroke="white" strokeWidth="2.8" />
        <circle cx="25" cy="16.5" r="1.5" fill="white" />
      </svg>
      <span
        style={{
          fontSize: `${size * 0.8}px`,
          fontWeight: 800,
          color: '#0f172a',
          letterSpacing: '-0.03em',
          fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif",
          display: 'flex',
          alignItems: 'baseline',
        }}
      >
        Snap<span style={{ color: '#22c55e' }}>IT</span>
      </span>
    </div>
  );
};
