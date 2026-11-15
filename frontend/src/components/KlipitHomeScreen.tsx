import React, { useState } from 'react';
import type { DocumentListItem } from '../types/document';
import {
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { displayMerchant, formatMoney, formatReceiptDate, parseReceiptDate } from '../utils/format';

type Period = 'This month' | 'Last month' | 'All time';
const DONUT_CIRCUMFERENCE = 2 * Math.PI * 85;

const inMonth = (r: DocumentListItem, year: number, month: number): boolean => {
  const d = parseReceiptDate(r.invoice_date, r.created_at);
  return !!d && d.getFullYear() === year && d.getMonth() === month;
};

const uploadedInMonth = (r: DocumentListItem, year: number, month: number): boolean => {
  if (!r.created_at) return false;
  const d = new Date(r.created_at);
  return !isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month;
};

interface KlipitHomeScreenProps {
  receipts: DocumentListItem[];
  onOpenReceipt: (id: string) => void;
  onViewAllReceipts: () => void;
  onOpenAddModal: () => void;
  onOpenExpenditureAnalysis?: () => void;
  userName?: string;
}

const ReceiptAvatar: React.FC<{ url?: string | null; name?: string | null }> = ({ url, name }) => {
  const [hasError, setHasError] = useState(false);
  if (url && !hasError) {
    return <img src={url} alt={name || 'Receipt'} onError={() => setHasError(true)} />;
  }
  return (
    <div className="klipit-receipt-avatar-placeholder">
      <span style={{ fontSize: '1.2rem' }}>🧾</span>
    </div>
  );
};

export const KlipitHomeScreen: React.FC<KlipitHomeScreenProps> = ({
  receipts,
  onOpenReceipt,
  onViewAllReceipts,
  onOpenAddModal,
  onOpenExpenditureAnalysis,
  userName = 'User',
}) => {
  const [selectedMonth, setSelectedMonth] = useState<Period>('This month');

  // Monthly stats: "saved" count uses upload date, expenditure uses upload date for grouping
  const today = new Date();
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const countThisMonth = receipts.filter((r) => uploadedInMonth(r, today.getFullYear(), today.getMonth())).length;
  const sum = (list: DocumentListItem[]) => list.reduce((acc, r) => acc + (Number(r.total_amount) || 0), 0);
  const allTimeTotal = sum(receipts);
  const totalExpenditure =
    selectedMonth === 'This month'
      ? sum(receipts.filter((r) => uploadedInMonth(r, today.getFullYear(), today.getMonth())))
      : selectedMonth === 'Last month'
        ? sum(receipts.filter((r) => uploadedInMonth(r, lastMonth.getFullYear(), lastMonth.getMonth())))
        : allTimeTotal;
  const donutRatio = allTimeTotal > 0 ? Math.min(totalExpenditure / allTimeTotal, 1) : 0;
  const currency = receipts[0]?.currency || 'INR';

  return (
    <div className="klipit-screen-container">
      {/* Greeting */}
      <div className="klipit-greeting-row">
        <h1 className="klipit-greeting-text">Hi {userName}!</h1>
      </div>

      {/* Hero Savings Card */}
      <div className="klipit-hero-card">
        <div className="klipit-hero-left">
          <div className="klipit-green-pill-bar" />
          <div className="klipit-hero-text-block">
            <div className="klipit-hero-sub">
              You've <span className="klipit-green-text">SAVED</span>
            </div>
            <div className="klipit-hero-num">{countThisMonth} receipts</div>
            <div className="klipit-hero-period">(this month)</div>
          </div>
        </div>

        {/* Hero Illustration: Wireframe Calculator + Receipt Roll + Sparkle Stars */}
        <div className="klipit-hero-graphic">
          <div className="klipit-sparkle-star star-1">✦</div>
          <div className="klipit-sparkle-star star-2">✦</div>
          <svg
            className="klipit-calc-svg"
            viewBox="0 0 140 140"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Calculator Body */}
            <rect
              x="25"
              y="35"
              width="50"
              height="75"
              rx="8"
              stroke="#ffffff"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {/* Calculator Screen */}
            <rect
              x="33"
              y="45"
              width="34"
              height="14"
              rx="3"
              stroke="#ffffff"
              strokeWidth="3"
            />
            {/* Calculator Keypad Grid */}
            <rect x="33" y="66" width="8" height="8" rx="2" stroke="#ffffff" strokeWidth="2.5" />
            <rect x="46" y="66" width="8" height="8" rx="2" stroke="#ffffff" strokeWidth="2.5" />
            <rect x="59" y="66" width="8" height="8" rx="2" stroke="#ffffff" strokeWidth="2.5" />
            <rect x="33" y="78" width="8" height="8" rx="2" stroke="#ffffff" strokeWidth="2.5" />
            <rect x="46" y="78" width="8" height="8" rx="2" stroke="#ffffff" strokeWidth="2.5" />
            <rect x="59" y="78" width="8" height="8" rx="2" stroke="#ffffff" strokeWidth="2.5" />
            <rect x="33" y="90" width="8" height="8" rx="2" stroke="#ffffff" strokeWidth="2.5" />
            <rect x="46" y="90" width="8" height="8" rx="2" stroke="#ffffff" strokeWidth="2.5" />
            <rect x="59" y="90" width="8" height="8" rx="2" stroke="#ffffff" strokeWidth="2.5" />

            {/* Receipt Tape Emerging and Curling */}
            <path
              d="M50 35 V20 C50 16 54 12 58 12 H90 C96 12 100 16 100 22 V95 C100 102 96 106 90 106 H80"
              stroke="#ffffff"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect
              x="78"
              y="32"
              width="45"
              height="80"
              rx="6"
              stroke="#ffffff"
              strokeWidth="4"
            />
            {/* Lines on the paper receipt */}
            <line x1="86" y1="48" x2="114" y2="48" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
            <line x1="86" y1="62" x2="114" y2="62" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
            <line x1="86" y1="76" x2="114" y2="76" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
            <line x1="86" y1="90" x2="104" y2="90" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
      </div>


      {/* Recent Receipts Section */}
      <div className="klipit-section">
        <div className="klipit-section-header">
          <h2 className="klipit-section-title">Recent receipts</h2>
          <button className="klipit-link-btn" onClick={onViewAllReceipts}>
            View all
          </button>
        </div>

        {receipts.length === 0 ? (
          <div
            className="klipit-empty-card"
            onClick={onOpenAddModal}
            style={{ cursor: 'pointer' }}
          >
            <Sparkles size={28} color="#22c55e" style={{ marginBottom: '8px' }} />
            <p style={{ fontWeight: 600, color: '#1e293b' }}>No receipts saved yet</p>
            <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
              Tap "+ Add Receipt" to scan or manually add your first receipt!
            </p>
          </div>
        ) : (
          <div className="klipit-receipts-list">
            {receipts.slice(0, 4).map((rec) => (
              <div
                key={rec.id}
                className="klipit-receipt-row-card"
                onClick={() => onOpenReceipt(rec.id)}
              >
                {/* Circular receipt thumbnail */}
                <div className="klipit-receipt-avatar">
                  <ReceiptAvatar url={rec.thumbnail_url} name={rec.merchant_name} />
                </div>

                {/* Details */}
                <div className="klipit-receipt-info">
                  <div className="klipit-receipt-merchant">
                    {displayMerchant(rec.merchant_name)}
                  </div>
                  <div className="klipit-receipt-date">
                    {formatReceiptDate(rec.invoice_date)}
                  </div>
                  <div className="klipit-badge-ai">
                    <span>{rec.mime_type === 'text/plain' ? 'Manual entry' : rec.review_status === 'needs_review' ? 'Needs review' : 'SnapIT AI'}</span>
                  </div>
                </div>

                {/* Amount */}
                <div className="klipit-receipt-amt">
                  {formatMoney(rec.total_amount, rec.currency, 'Not read')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Your Expenditure Section */}
      <div className="klipit-section" style={{ marginBottom: '5.5rem' }}>
        <div className="klipit-section-header">
          <h2 className="klipit-section-title">Your expenditure</h2>
          <button
            className="klipit-link-btn"
            onClick={onOpenExpenditureAnalysis || onViewAllReceipts}
          >
            Detailed view
          </button>
        </div>

        <div className="klipit-expenditure-card" style={{ padding: '1rem 0.5rem 1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-start', padding: '0 0.75rem 0.25rem' }}>
            <button
              type="button"
              className="klipit-dropdown-pill"
              onClick={() => {
                setSelectedMonth((prev) =>
                  prev === 'This month' ? 'Last month' : prev === 'Last month' ? 'All time' : 'This month'
                );
              }}
            >
              <span>{selectedMonth}</span>
              <ChevronDown size={16} />
            </button>
          </div>

          {/* DONUT CHART */}
          <div className="klipit-donut-container" onClick={onOpenExpenditureAnalysis} style={{ cursor: 'pointer' }}>
            <svg className="klipit-donut-svg" viewBox="0 0 240 240">
              <circle
                cx="120"
                cy="120"
                r="85"
                fill="none"
                stroke="#f1f5f9"
                strokeWidth="42"
              />
              <circle
                cx="120"
                cy="120"
                r="85"
                fill="none"
                stroke="#e2959d"
                strokeWidth="42"
                strokeDasharray={DONUT_CIRCUMFERENCE}
                strokeDashoffset={DONUT_CIRCUMFERENCE * (1 - donutRatio)}
                strokeLinecap={donutRatio > 0 ? 'round' : 'butt'}
                transform="rotate(-90 120 120)"
              />
            </svg>

            <div className="klipit-donut-center">
              <div className="klipit-donut-amt">
                {formatMoney(totalExpenditure, currency)}
              </div>
              <div className="klipit-donut-sub">{selectedMonth === 'All time' ? 'Total expenditure' : `${Math.round(donutRatio * 100)}% of all-time spend`}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
