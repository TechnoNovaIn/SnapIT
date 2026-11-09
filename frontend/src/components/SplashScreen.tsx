import React from 'react';

interface SplashScreenProps {
  onFinish?: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  return (
    <div className="klipit-splash-wrapper" onClick={onFinish}>
      {/* Centered App Logo matching Image 2 */}
      <div className="klipit-splash-center">
        <div className="klipit-splash-logo-row">
          {/* Green Leaf Contour Glyph from Image 2 */}
          <div className="klipit-leaf-icon-wrap">
            <svg
              className="klipit-splash-leaf-svg"
              viewBox="0 0 100 100"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Green leaf shape with inner paperclip curl */}
              <path
                d="M15 48 C15 24 34 15 58 15 C82 15 90 28 90 45 C90 62 82 85 55 85 C30 85 15 72 15 48 Z"
                fill="#3cd15b"
              />
              <path
                d="M32 46 C32 32 42 27 56 27 C70 27 75 34 75 44 C75 56 70 71 52 71 C40 71 32 62 32 46 Z"
                fill="#f7f7f8"
              />
              <path
                d="M45 46 C45 39 49 37 55 37 C61 37 63 40 63 46 C63 52 61 60 52 60 C47 60 45 56 45 46 Z"
                fill="#3cd15b"
              />
            </svg>
          </div>

          {/* SnapIT brand text: 'Snap' dark, 'IT' bright green */}
          <div className="klipit-splash-brand-text">
            <span className="klipit-text-klip">Snap</span>
            <span className="klipit-text-it">IT</span>
          </div>
        </div>
      </div>
    </div>
  );
};

