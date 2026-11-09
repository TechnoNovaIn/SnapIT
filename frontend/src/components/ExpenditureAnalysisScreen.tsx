import React, { useState } from 'react';
import type { DocumentListItem } from '../types/document';
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  X,
  Check,
} from 'lucide-react';

interface ExpenditureAnalysisScreenProps {
  receipts: DocumentListItem[];
  onBack: () => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const ExpenditureAnalysisScreen: React.FC<ExpenditureAnalysisScreenProps> = ({
  receipts,
  onBack,
}) => {
  const [selectedMonthPeriod, setSelectedMonthPeriod] = useState<string>('This month');
  const [activeMonthIdx, setActiveMonthIdx] = useState<number>(9); // October
  const [activeYear, setActiveYear] = useState<number>(2026);

  // Budget Limit state
  const [monthlyBudget, setMonthlyBudget] = useState<number>(() => {
    const saved = localStorage.getItem('snapit_monthly_budget');
    return saved ? parseFloat(saved) : 5000;
  });
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [tempBudgetInput, setTempBudgetInput] = useState<string>(monthlyBudget.toString());

  // Calculate total expenditure from receipts
  const calculatedTotal = receipts.reduce((acc, r) => acc + (r.total_amount || 0), 0);
  const totalExpenditure = calculatedTotal;

  const handlePrevMonth = () => {
    if (activeMonthIdx === 0) {
      setActiveMonthIdx(11);
      setActiveYear((prev) => prev - 1);
    } else {
      setActiveMonthIdx((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (activeMonthIdx === 11) {
      setActiveMonthIdx(0);
      setActiveYear((prev) => prev + 1);
    } else {
      setActiveMonthIdx((prev) => prev + 1);
    }
  };

  const handleSaveBudget = () => {
    const val = parseFloat(tempBudgetInput);
    if (!isNaN(val) && val > 0) {
      setMonthlyBudget(val);
      localStorage.setItem('snapit_monthly_budget', val.toString());
      setIsBudgetModalOpen(false);
    }
  };

  return (
    <div className="klipit-screen-container klipit-expenditure-screen">
      {/* Top Navigation */}
      <div className="klipit-top-nav-bar">
        <button className="klipit-nav-icon-btn" onClick={onBack} title="Back">
          <ChevronLeft size={24} color="#0f172a" />
        </button>
        <h1 className="klipit-details-title">Expenditure analysis</h1>
        <div style={{ width: 32 }} /> {/* balance spacing */}
      </div>

      {/* CARD 1: Your Expenditure with Donut Chart and 6 Categories */}
      <div className="klipit-expenditure-main-card">
        <div className="klipit-card-header-row" style={{ padding: '0 0.5rem' }}>
          <h2 className="klipit-card-title">Your expenditure</h2>
          <button
            type="button"
            className="klipit-dropdown-pill"
            onClick={() => {
              setSelectedMonthPeriod((prev) =>
                prev === 'This month' ? 'Last month' : prev === 'Last month' ? 'All time' : 'This month'
              );
            }}
          >
            <span>{selectedMonthPeriod}</span>
            <ChevronDown size={16} />
          </button>
        </div>

        {/* DONUT CHART VISUALIZATION */}
        <div className="klipit-donut-container">
          <svg className="klipit-donut-svg" viewBox="0 0 240 240">
            {/* Background ring */}
            <circle
              cx="120"
              cy="120"
              r="85"
              fill="none"
              stroke="#f1f5f9"
              strokeWidth="42"
            />
            {/* Expenditure Ring (Rose pink) */}
            <circle
              cx="120"
              cy="120"
              r="85"
              fill="none"
              stroke="#e2959d"
              strokeWidth="42"
              strokeDasharray="534"
              strokeDashoffset={100}
              strokeLinecap="round"
              className="donut-segment"
              transform="rotate(-90 120 120)"
            />
          </svg>

          {/* Central Elevated Card */}
          <div className="klipit-donut-center">
            <div className="klipit-donut-amt">
              INR {totalExpenditure.toLocaleString()}
            </div>
            <div className="klipit-donut-sub">Total expenditure</div>
          </div>
        </div>
      </div>

      {/* CARD 2: Spending Summary & Monthly Budget Banner */}
      <div className="klipit-expenditure-card-white">
        <div className="klipit-card-header-row">
          <h2 className="klipit-card-title">Spending summary</h2>
          <button
            className="klipit-edit-text-btn"
            onClick={() => {
              setTempBudgetInput(monthlyBudget.toString());
              setIsBudgetModalOpen(true);
            }}
          >
            Edit
          </button>
        </div>

        {/* Month Selector Carousel: < October 2026 > */}
        <div className="klipit-month-carousel-row">
          <button className="klipit-carousel-arrow-btn" onClick={handlePrevMonth}>
            <ChevronLeft size={18} color="#0f172a" />
          </button>
          <div className="klipit-month-year-label">
            <span className="month-underlined">{MONTHS[activeMonthIdx]}</span>
            <span className="year-text">{activeYear}</span>
          </div>
          <button className="klipit-carousel-arrow-btn" onClick={handleNextMonth}>
            <ChevronRight size={18} color="#0f172a" />
          </button>
        </div>

        {/* Set your monthly budgets banner card */}
        <div className="klipit-budget-promo-card">
          <div className="klipit-budget-promo-left">
            <h3 className="klipit-budget-title">Set your monthly budgets</h3>
            <p className="klipit-budget-desc">
              Set your monthly spending limit to track your expense
            </p>
            <button
              className="klipit-dark-pill-btn"
              onClick={() => {
                setTempBudgetInput(monthlyBudget.toString());
                setIsBudgetModalOpen(true);
              }}
            >
              Let's set
            </button>
          </div>

          {/* Money Bag & Coin Stacks Illustration with Green Sparkle Stars */}
          <div className="klipit-budget-illustration">
            <div className="budget-star-1">✦</div>
            <div className="budget-star-2">✦</div>
            <svg viewBox="0 0 120 110" width="100" height="95" fill="none">
              {/* Money Sacks */}
              <ellipse cx="65" cy="70" rx="35" ry="25" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="2.5" />
              <path
                d="M50 45 C45 35 55 25 65 25 C75 25 85 35 80 45 Z"
                fill="#cbd5e1"
                stroke="#94a3b8"
                strokeWidth="2.5"
              />
              <path d="M48 45 Q65 48 82 45" stroke="#94a3b8" strokeWidth="3" />
              {/* Currency Symbol on Bag */}
              <text x="65" y="74" fill="#64748b" fontSize="18" fontWeight="bold" textAnchor="middle">₹</text>

              {/* Coin Stacks */}
              {/* Stack 1 */}
              <ellipse cx="28" cy="85" rx="14" ry="5" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="2" />
              <ellipse cx="28" cy="80" rx="14" ry="5" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" />
              <ellipse cx="28" cy="75" rx="14" ry="5" fill="#f8fafc" stroke="#94a3b8" strokeWidth="2" />
              <ellipse cx="28" cy="70" rx="14" ry="5" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" />

              {/* Stack 2 */}
              <ellipse cx="40" cy="90" rx="12" ry="4.5" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="2" />
              <ellipse cx="40" cy="85" rx="12" ry="4.5" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" />
              <ellipse cx="40" cy="80" rx="12" ry="4.5" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" />
            </svg>
          </div>
        </div>
      </div>

      {/* CARD 3: Total Expenditure & Monthly Timeline Graph */}
      <div className="klipit-expenditure-card-white" style={{ marginBottom: '5rem' }}>
        <h3 className="klipit-sub-card-title">Total expenditure</h3>
        <div className="klipit-total-stat-val">INR {totalExpenditure.toLocaleString()}</div>
        <p className="klipit-vat-disclaimer">
          * Value considered in total expenditure may be inclusive of VAT paid & discounts.
        </p>

        {/* Expenditure Bar/Line Chart */}
        <div className="klipit-chart-wrapper">
          <div className="klipit-chart-y-axis">
            <span>3100</span>
            <span>2325</span>
            <span>1550</span>
            <span>775</span>
            <span>0</span>
          </div>

          <div className="klipit-chart-plot-area">
            {/* Gridlines */}
            <div className="chart-gridline" style={{ top: '0%' }} />
            <div className="chart-gridline" style={{ top: '25%' }} />
            <div className="chart-gridline" style={{ top: '50%' }} />
            <div className="chart-gridline" style={{ top: '75%' }} />
            <div className="chart-gridline" style={{ top: '100%' }} />

            {/* Monthly Bars */}
            <div className="chart-bars-container">
              {[
                { m: 'Jan', val: 0 },
                { m: 'Feb', val: 0 },
                { m: 'Mar', val: 0 },
                { m: 'Apr', val: 0 },
                { m: 'May', val: 0 },
                { m: 'Jun', val: 0 },
                { m: 'Jul', val: 0 },
                { m: 'Aug', val: 0 },
                { m: 'Sep', val: 450 },
                { m: 'Oct', val: totalExpenditure, isCurrent: true },
                { m: 'Nov', val: 0 },
                { m: 'Dec', val: 0 },
              ].map((item, idx) => {
                const heightPct = Math.min((item.val / 3100) * 100, 100);
                return (
                  <div key={idx} className="chart-col">
                    <div className="chart-bar-track">
                      <div
                        className={`chart-bar-fill ${item.isCurrent ? 'current' : ''}`}
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <span className={`chart-col-label ${item.isCurrent ? 'bold' : ''}`}>
                      {item.m}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Set Monthly Budget Modal */}
      {isBudgetModalOpen && (
        <div className="modal-overlay" onClick={() => setIsBudgetModalOpen(false)}>
          <div className="klipit-budget-modal" onClick={(e) => e.stopPropagation()}>
            <div className="klipit-sheet-header">
              <h3 className="klipit-sheet-title">Monthly Budget Limit</h3>
              <button className="klipit-close-circle" onClick={() => setIsBudgetModalOpen(false)}>
                <X size={18} color="#64748b" />
              </button>
            </div>
            <div style={{ padding: '0 1.5rem 1.5rem' }}>
              <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem' }}>
                Set your maximum monthly spending threshold in INR:
              </p>
              <div className="account-input-group">
                <input
                  type="number"
                  className="account-input-field"
                  value={tempBudgetInput}
                  onChange={(e) => setTempBudgetInput(e.target.value)}
                  placeholder="e.g. 5000"
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
                <button className="btn-primary-sm" style={{ flex: 1, padding: '10px' }} onClick={handleSaveBudget}>
                  <Check size={16} />
                  <span>Save Budget</span>
                </button>
                <button className="btn-secondary-sm" style={{ flex: 1, padding: '10px' }} onClick={() => setIsBudgetModalOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
