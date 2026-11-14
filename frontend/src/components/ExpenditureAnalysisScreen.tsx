import React, { useMemo, useState } from 'react';
import type { DocumentListItem } from '../types/document';
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  X,
  Check,
} from 'lucide-react';
import { formatMoney, parseReceiptDate } from '../utils/format';

interface ExpenditureAnalysisScreenProps {
  receipts: DocumentListItem[];
  onBack: () => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Period = 'This month' | 'Last month' | 'All time';

const BUDGET_KEY = 'snapit_monthly_budget';
const DONUT_CIRCUMFERENCE = 2 * Math.PI * 85; // r=85 in the SVG below

const readBudget = (): number | null => {
  try {
    const saved = localStorage.getItem(BUDGET_KEY);
    const val = saved ? parseFloat(saved) : NaN;
    return Number.isFinite(val) && val > 0 ? val : null;
  } catch {
    return null;
  }
};

/** Sum of receipt totals whose date falls in the given month. */
const sumForMonth = (receipts: DocumentListItem[], year: number, month: number): number =>
  receipts.reduce((acc, r) => {
    const d = parseReceiptDate(r.invoice_date, r.created_at);
    if (d && d.getFullYear() === year && d.getMonth() === month) return acc + (Number(r.total_amount) || 0);
    return acc;
  }, 0);

/** Compact axis labels: 1.2k, 45k, 1.5L (lakh) */
const axisLabel = (v: number): string => {
  if (v >= 100000) return `${(v / 100000).toFixed(v % 100000 === 0 ? 0 : 1)}L`;
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return `${Math.round(v)}`;
};

export const ExpenditureAnalysisScreen: React.FC<ExpenditureAnalysisScreenProps> = ({
  receipts,
  onBack,
}) => {
  const today = new Date();
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('This month');
  const [activeMonthIdx, setActiveMonthIdx] = useState<number>(today.getMonth());
  const [activeYear, setActiveYear] = useState<number>(today.getFullYear());

  const [monthlyBudget, setMonthlyBudget] = useState<number | null>(readBudget);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [tempBudgetInput, setTempBudgetInput] = useState<string>(monthlyBudget ? String(monthlyBudget) : '');

  // Most receipts share one currency; the dominant one is used for formatting totals.
  const currency = useMemo(() => {
    const counts = new Map<string, number>();
    receipts.forEach((r) => counts.set(r.currency || 'INR', (counts.get(r.currency || 'INR') || 0) + 1));
    let best = 'INR';
    let bestCount = -1;
    counts.forEach((c, k) => {
      if (c > bestCount) {
        best = k;
        bestCount = c;
      }
    });
    return best;
  }, [receipts]);
  const mixedCurrencies = useMemo(() => new Set(receipts.map((r) => r.currency || 'INR')).size > 1, [receipts]);

  const allTimeTotal = receipts.reduce((acc, r) => acc + (Number(r.total_amount) || 0), 0);
  const thisMonthTotal = sumForMonth(receipts, today.getFullYear(), today.getMonth());
  const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthTotal = sumForMonth(receipts, lastMonthDate.getFullYear(), lastMonthDate.getMonth());
  const periodTotal = selectedPeriod === 'This month' ? thisMonthTotal : selectedPeriod === 'Last month' ? lastMonthTotal : allTimeTotal;

  const selectedMonthTotal = sumForMonth(receipts, activeYear, activeMonthIdx);
  const selectedMonthCount = receipts.filter((r) => {
    const d = parseReceiptDate(r.invoice_date, r.created_at);
    return d && d.getFullYear() === activeYear && d.getMonth() === activeMonthIdx;
  }).length;

  // Donut: share of the selected period against the monthly budget (or against all-time spend when no budget is set).
  const donutRatio = monthlyBudget && selectedPeriod !== 'All time'
    ? Math.min(periodTotal / monthlyBudget, 1)
    : allTimeTotal > 0
      ? Math.min(periodTotal / allTimeTotal, 1)
      : 0;
  const donutOffset = DONUT_CIRCUMFERENCE * (1 - donutRatio);
  const overBudget = !!monthlyBudget && selectedPeriod !== 'All time' && periodTotal > monthlyBudget;

  // Monthly bars for the active year
  const monthlyTotals = useMemo(
    () => MONTH_SHORT.map((_, idx) => sumForMonth(receipts, activeYear, idx)),
    [receipts, activeYear]
  );
  const chartMax = Math.max(...monthlyTotals, monthlyBudget || 0, 1);
  const yAxis = [1, 0.75, 0.5, 0.25, 0].map((f) => axisLabel(chartMax * f));

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

  const openBudgetModal = () => {
    setTempBudgetInput(monthlyBudget ? String(monthlyBudget) : '');
    setIsBudgetModalOpen(true);
  };

  const handleSaveBudget = () => {
    const val = parseFloat(tempBudgetInput);
    if (!isNaN(val) && val > 0) {
      setMonthlyBudget(val);
      try {
        localStorage.setItem(BUDGET_KEY, val.toString());
      } catch {
        /* storage unavailable */
      }
      setIsBudgetModalOpen(false);
    }
  };

  const handleClearBudget = () => {
    setMonthlyBudget(null);
    try {
      localStorage.removeItem(BUDGET_KEY);
    } catch {
      /* storage unavailable */
    }
    setIsBudgetModalOpen(false);
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

      {/* CARD 1: Your Expenditure with Donut Chart */}
      <div className="klipit-expenditure-main-card">
        <div className="klipit-card-header-row" style={{ padding: '0 0.5rem' }}>
          <h2 className="klipit-card-title">Your expenditure</h2>
          <button
            type="button"
            className="klipit-dropdown-pill"
            onClick={() => {
              setSelectedPeriod((prev) =>
                prev === 'This month' ? 'Last month' : prev === 'Last month' ? 'All time' : 'This month'
              );
            }}
          >
            <span>{selectedPeriod}</span>
            <ChevronDown size={16} />
          </button>
        </div>

        {/* DONUT CHART VISUALIZATION */}
        <div className="klipit-donut-container">
          <svg className="klipit-donut-svg" viewBox="0 0 240 240">
            <circle cx="120" cy="120" r="85" fill="none" stroke="#f1f5f9" strokeWidth="42" />
            <circle
              cx="120"
              cy="120"
              r="85"
              fill="none"
              stroke={overBudget ? '#ef4444' : '#e2959d'}
              strokeWidth="42"
              strokeDasharray={DONUT_CIRCUMFERENCE}
              strokeDashoffset={donutOffset}
              strokeLinecap={donutRatio > 0 ? 'round' : 'butt'}
              className="donut-segment"
              transform="rotate(-90 120 120)"
            />
          </svg>

          <div className="klipit-donut-center">
            <div className="klipit-donut-amt">{formatMoney(periodTotal, currency)}</div>
            <div className="klipit-donut-sub">
              {monthlyBudget && selectedPeriod !== 'All time'
                ? `${Math.round((periodTotal / monthlyBudget) * 100)}% of ${formatMoney(monthlyBudget, currency)} budget`
                : selectedPeriod === 'All time'
                  ? 'Total expenditure'
                  : `${Math.round(donutRatio * 100)}% of all-time spend`}
            </div>
          </div>
        </div>
        {mixedCurrencies && (
          <p className="klipit-vat-disclaimer" style={{ padding: '0 0.75rem' }}>
            * Receipts in different currencies are added together without conversion.
          </p>
        )}
      </div>

      {/* CARD 2: Spending Summary & Monthly Budget */}
      <div className="klipit-expenditure-card-white">
        <div className="klipit-card-header-row">
          <h2 className="klipit-card-title">Spending summary</h2>
          <button className="klipit-edit-text-btn" onClick={openBudgetModal}>
            {monthlyBudget ? 'Edit budget' : 'Set budget'}
          </button>
        </div>

        {/* Month Selector Carousel */}
        <div className="klipit-month-carousel-row">
          <button className="klipit-carousel-arrow-btn" onClick={handlePrevMonth} title="Previous month">
            <ChevronLeft size={18} color="#0f172a" />
          </button>
          <div className="klipit-month-year-label">
            <span className="month-underlined">{MONTHS[activeMonthIdx]}</span>
            <span className="year-text">{activeYear}</span>
          </div>
          <button className="klipit-carousel-arrow-btn" onClick={handleNextMonth} title="Next month">
            <ChevronRight size={18} color="#0f172a" />
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 0.25rem 0.75rem', fontSize: '0.9rem', color: '#334155' }}>
          <span>{selectedMonthCount} receipt{selectedMonthCount === 1 ? '' : 's'}</span>
          <strong>{formatMoney(selectedMonthTotal, currency)}</strong>
        </div>

        {monthlyBudget ? (
          <div style={{ padding: '0 0.25rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#64748b', marginBottom: '6px' }}>
              <span>Budget {formatMoney(monthlyBudget, currency)}</span>
              <span style={{ color: selectedMonthTotal > monthlyBudget ? '#b91c1c' : '#16a34a', fontWeight: 600 }}>
                {selectedMonthTotal > monthlyBudget
                  ? `${formatMoney(selectedMonthTotal - monthlyBudget, currency)} over`
                  : `${formatMoney(monthlyBudget - selectedMonthTotal, currency)} left`}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: '#f1f5f9', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min((selectedMonthTotal / monthlyBudget) * 100, 100)}%`,
                  background: selectedMonthTotal > monthlyBudget ? '#ef4444' : '#22c55e',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        ) : (
          <div className="klipit-budget-promo-card">
            <div className="klipit-budget-promo-left">
              <h3 className="klipit-budget-title">Set your monthly budget</h3>
              <p className="klipit-budget-desc">
                Set a monthly spending limit to track how much of it each month uses.
              </p>
              <button className="klipit-dark-pill-btn" onClick={openBudgetModal}>
                Let's set
              </button>
            </div>

            <div className="klipit-budget-illustration">
              <div className="budget-star-1">✦</div>
              <div className="budget-star-2">✦</div>
              <svg viewBox="0 0 120 110" width="100" height="95" fill="none">
                <ellipse cx="65" cy="70" rx="35" ry="25" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="2.5" />
                <path d="M50 45 C45 35 55 25 65 25 C75 25 85 35 80 45 Z" fill="#cbd5e1" stroke="#94a3b8" strokeWidth="2.5" />
                <path d="M48 45 Q65 48 82 45" stroke="#94a3b8" strokeWidth="3" />
                <text x="65" y="74" fill="#64748b" fontSize="18" fontWeight="bold" textAnchor="middle">₹</text>
                <ellipse cx="28" cy="85" rx="14" ry="5" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="2" />
                <ellipse cx="28" cy="80" rx="14" ry="5" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" />
                <ellipse cx="28" cy="75" rx="14" ry="5" fill="#f8fafc" stroke="#94a3b8" strokeWidth="2" />
                <ellipse cx="28" cy="70" rx="14" ry="5" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" />
                <ellipse cx="40" cy="90" rx="12" ry="4.5" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="2" />
                <ellipse cx="40" cy="85" rx="12" ry="4.5" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" />
                <ellipse cx="40" cy="80" rx="12" ry="4.5" fill="#ffffff" stroke="#94a3b8" strokeWidth="2" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* CARD 3: Total Expenditure & Monthly Timeline Graph */}
      <div className="klipit-expenditure-card-white" style={{ marginBottom: '5rem' }}>
        <h3 className="klipit-sub-card-title">Total expenditure {activeYear}</h3>
        <div className="klipit-total-stat-val">{formatMoney(monthlyTotals.reduce((a, b) => a + b, 0), currency)}</div>
        <p className="klipit-vat-disclaimer">
          * Totals are taken from each receipt as read and may include tax and discounts.
        </p>

        <div className="klipit-chart-wrapper">
          <div className="klipit-chart-y-axis">
            {yAxis.map((label, idx) => (
              <span key={idx}>{label}</span>
            ))}
          </div>

          <div className="klipit-chart-plot-area">
            <div className="chart-gridline" style={{ top: '0%' }} />
            <div className="chart-gridline" style={{ top: '25%' }} />
            <div className="chart-gridline" style={{ top: '50%' }} />
            <div className="chart-gridline" style={{ top: '75%' }} />
            <div className="chart-gridline" style={{ top: '100%' }} />

            <div className="chart-bars-container">
              {MONTH_SHORT.map((label, idx) => {
                const val = monthlyTotals[idx];
                const heightPct = Math.min((val / chartMax) * 100, 100);
                const isCurrent = idx === activeMonthIdx;
                return (
                  <div
                    key={label}
                    className="chart-col"
                    onClick={() => setActiveMonthIdx(idx)}
                    style={{ cursor: 'pointer' }}
                    title={`${label} ${activeYear}: ${formatMoney(val, currency)}`}
                  >
                    <div className="chart-bar-track">
                      <div
                        className={`chart-bar-fill ${isCurrent ? 'current' : ''}`}
                        style={{ height: `${heightPct}%` }}
                      />
                    </div>
                    <span className={`chart-col-label ${isCurrent ? 'bold' : ''}`}>{label}</span>
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
                Set your maximum monthly spending threshold ({currency}):
              </p>
              <div className="account-input-group">
                <input
                  type="number"
                  min="1"
                  step="any"
                  className="account-input-field"
                  value={tempBudgetInput}
                  onChange={(e) => setTempBudgetInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveBudget()}
                  placeholder="e.g. 5000"
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
                <button className="btn-primary-sm" style={{ flex: 1, padding: '10px' }} onClick={handleSaveBudget}>
                  <Check size={16} />
                  <span>Save Budget</span>
                </button>
                {monthlyBudget && (
                  <button className="btn-secondary-sm" style={{ flex: 1, padding: '10px' }} onClick={handleClearBudget}>
                    Remove
                  </button>
                )}
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
