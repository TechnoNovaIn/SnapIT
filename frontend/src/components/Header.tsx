import React from 'react';
import { Receipt, History, Settings, FileText } from 'lucide-react';

interface HeaderProps {
  currentTab: 'reader' | 'history' | 'settings';
  setCurrentTab: (tab: 'reader' | 'history' | 'settings') => void;
}

export const Header: React.FC<HeaderProps> = ({ currentTab, setCurrentTab }) => {
  return (
    <header className="app-header">
      <div className="header-container">
        <div className="brand-section" onClick={() => setCurrentTab('reader')}>
          <div className="brand-logo-icon">
            <Receipt size={22} />
          </div>
          <div>
            <div className="brand-title">
              SnapIT
              <span className="brand-badge">AI Powered</span>
            </div>
          </div>
        </div>

        <nav className="header-nav">
          <button
            className={`nav-link ${currentTab === 'reader' ? 'active' : ''}`}
            onClick={() => setCurrentTab('reader')}
          >
            <FileText size={17} />
            <span>Document Reader</span>
          </button>

          <button
            className={`nav-link ${currentTab === 'history' ? 'active' : ''}`}
            onClick={() => setCurrentTab('history')}
          >
            <History size={17} />
            <span>Document History</span>
          </button>

          <button
            className={`nav-link ${currentTab === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentTab('settings')}
          >
            <Settings size={17} />
            <span>Settings</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
