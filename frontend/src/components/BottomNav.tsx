import React from 'react';
import { Home, ReceiptText, Plus } from 'lucide-react';

interface BottomNavProps {
  activeTab: 'home' | 'receipts';
  onChangeTab: (tab: 'home' | 'receipts') => void;
  onOpenAddModal: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onChangeTab,
  onOpenAddModal,
}) => {
  return (
    <>
      {/* Floating Add Receipt Button */}
      <div className="floating-add-container">
        <button className="floating-add-btn" onClick={onOpenAddModal}>
          <span>Add Receipt</span>
          <div className="floating-add-plus">
            <Plus size={18} strokeWidth={3} />
          </div>
        </button>
      </div>

      {/* Bottom Navigation Bar */}
      <nav className="klipit-bottom-bar">
        <button
          className={`bottom-nav-item ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => onChangeTab('home')}
        >
          <div className="bottom-nav-icon-wrap">
            <Home size={22} fill={activeTab === 'home' ? '#22c55e' : 'none'} color={activeTab === 'home' ? '#22c55e' : '#64748b'} />
          </div>
          <span>Home</span>
        </button>

        <button
          className={`bottom-nav-item ${activeTab === 'receipts' ? 'active' : ''}`}
          onClick={() => onChangeTab('receipts')}
        >
          <div className="bottom-nav-icon-wrap">
            <ReceiptText size={22} fill={activeTab === 'receipts' ? '#22c55e' : 'none'} color={activeTab === 'receipts' ? '#22c55e' : '#64748b'} />
          </div>
          <span>Receipts</span>
        </button>
      </nav>
    </>
  );
};
