import React, { useMemo, useState } from 'react';
import type { DocumentListItem } from '../types/document';
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  X,
  Check,
  Fuel,
  Truck,
  GraduationCap,
  FileText,
  Stethoscope,
  ShoppingBag,
  Receipt,
  Layers,
} from 'lucide-react';
import { formatMoney, parseReceiptDate, formatReceiptDate } from '../utils/format';

interface ExpenditureAnalysisScreenProps {
  receipts: DocumentListItem[];
  onBack: () => void;
  onSelectReceipt?: (receipt: DocumentListItem) => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Period = 'This month' | 'Last month' | 'All time';
type DateMode = 'upload' | 'bill';

const BUDGET_KEY = 'snapit_monthly_budget';
const DONUT_CIRCUMFERENCE = 2 * Math.PI * 85;

const readBudget = (): number | null => {
  try {
    const saved = localStorage.getItem(BUDGET_KEY);
    const val = saved ? parseFloat(saved) : NaN;
    return Number.isFinite(val) && val > 0 ? val : null;
  } catch {
    return null;
  }
};

const getCategoryMeta = (catName?: string) => {
  const c = (catName || '').toLowerCase();
  if (c.includes('fuel') || c.includes('petrol') || c.includes('diesel')) {
    return { label: 'Fuel & Diesel', icon: Fuel, color: '#f59e0b', bg: '#fef3c7' };
  }
  if (c.includes('transport') || c.includes('travel') || c.includes('carrier') || c.includes('freight') || c.includes('lorry')) {
    return { label: 'Transport & Freight', icon: Truck, color: '#3b82f6', bg: '#dbeafe' };
  }
  if (c.includes('fee') || c.includes('education') || c.includes('institution') || c.includes('college') || c.includes('iit')) {
    return { label: 'Education & Fees', icon: GraduationCap, color: '#8b5cf6', bg: '#ede9fe' };
  }
  if (c.includes('tax') || c.includes('invoice') || c.includes('commercial') || c.includes('tyre')) {
    return { label: 'Commercial & Invoices', icon: FileText, color: '#10b981', bg: '#d1fae5' };
  }
  if (c.includes('medical') || c.includes('pharmacy') || c.includes('health') || c.includes('doctor')) {
    return { label: 'Medical & Healthcare', icon: Stethoscope, color: '#ef4444', bg: '#fee2e2' };
  }
  return { label: catName || 'General Expenses', icon: ShoppingBag, color: '#64748b', bg: '#f1f5f9' };
};

const axisLabel = (v: number): string => {
  if (v >= 100000) return `${(v / 100000).toFixed(v % 100000 === 0 ? 0 : 1)}L`;
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return `${Math.round(v)}`;
};

export const ExpenditureAnalysisScreen: React.FC<ExpenditureAnalysisScreenProps> = ({
  receipts,
  onBack,
  onSelectReceipt,
}) => {
  const today = new Date();
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('This month');
  // Date Mode: 'upload' (when saved in SnapIT app) or 'bill' (printed bill date)
  const [dateMode, setDateMode] = useState<DateMode>('upload');
  const [activeMonthIdx, setActiveMonthIdx] = useState<number>(today.getMonth());
  const [activeYear, setActiveYear] = useState<number>(today.getFullYear());
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);

  const [monthlyBudget, setMonthlyBudget] = useState<number | null>(readBudget);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [tempBudgetInput, setTempBudgetInput] = useState<string>(monthlyBudget ? String(monthlyBudget) : '');

  // Helper to resolve receipt date based on active dateMode
  const getReceiptDate = (r: DocumentListItem): Date => {
    if (dateMode === 'upload' && r.created_at) {
      const cd = new Date(r.created_at);
      if (!isNaN(cd.getTime())) return cd;
    }
    const bd = parseReceiptDate(r.invoice_date);
    if (bd && !isNaN(bd.getTime())) return bd;
    if (r.created_at) {
      const cd = new Date(r.created_at);
      if (!isNaN(cd.getTime())) return cd;
    }
    return new Date();
  };

  // Helper to sum for specific year and month
  const sumForMonth = (list: DocumentListItem[], y: number, m: number): number =>
    list.reduce((acc, r) => {
      const d = getReceiptDate(r);
      if (d.getFullYear() === y && d.getMonth() === m) {
        return acc + (Number(r.total_amount) || 0);
      }
      return acc;
    }, 0);

  // Dominant currency
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

  const allTimeTotal = useMemo(
    () => receipts.reduce((acc, r) => acc + (Number(r.total_amount) || 0), 0),
    [receipts]
  );

  const thisMonthTotal = useMemo(
    () => sumForMonth(receipts, today.getFullYear(), today.getMonth()),
    [receipts, dateMode]
  );

  const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthTotal = useMemo(
    () => sumForMonth(receipts, lastMonthDate.getFullYear(), lastMonthDate.getMonth()),
    [receipts, dateMode]
  );

  const periodTotal =
    selectedPeriod === 'This month'
      ? thisMonthTotal
      : selectedPeriod === 'Last month'
        ? lastMonthTotal
        : allTimeTotal;

  // Selected Month Summary
  const selectedMonthTotal = useMemo(
    () => sumForMonth(receipts, activeYear, activeMonthIdx),
    [receipts, activeYear, activeMonthIdx, dateMode]
  );

  const selectedMonthReceipts = useMemo(() => {
    return receipts.filter((r) => {
      const d = getReceiptDate(r);
      return d.getFullYear() === activeYear && d.getMonth() === activeMonthIdx;
    });
  }, [receipts, activeYear, activeMonthIdx, dateMode]);

  const selectedMonthCount = selectedMonthReceipts.length;

  // Receipts to display in detailed view:
  // If period is 'All time', show all receipts. Otherwise show selected month's receipts.
  const displayReceipts = useMemo(() => {
    let list = selectedPeriod === 'All time' ? receipts : selectedMonthReceipts;
    if (selectedCategoryFilter) {
      list = list.filter((r) => {
        const meta = getCategoryMeta(r.document_type);
        return meta.label === selectedCategoryFilter;
      });
    }
    return list;
  }, [receipts, selectedMonthReceipts, selectedPeriod, selectedCategoryFilter]);

  // Category breakdown for currently viewed receipts
  const categoryBreakdown = useMemo(() => {
    const baseList = selectedPeriod === 'All time' ? receipts : selectedMonthReceipts;
    const total = baseList.reduce((acc, r) => acc + (Number(r.total_amount) || 0), 0);
    const map = new Map<string, { total: number; count: number; meta: ReturnType<typeof getCategoryMeta> }>();

    baseList.forEach((r) => {
      const amt = Number(r.total_amount) || 0;
      const meta = getCategoryMeta(r.document_type);
      const existing = map.get(meta.label);
      if (existing) {
        existing.total += amt;
        existing.count += 1;
      } else {
        map.set(meta.label, { total: amt, count: 1, meta });
      }
    });

    const items = Array.from(map.entries()).map(([label, data]) => ({
      label,
      total: data.total,
      count: data.count,
      meta: data.meta,
      pct: total > 0 ? (data.total / total) * 100 : 0,
    }));

    return items.sort((a, b) => b.total - a.total);
  }, [receipts, selectedMonthReceipts, selectedPeriod]);

  // Donut ratios
  const donutRatio =
    monthlyBudget && selectedPeriod !== 'All time'
      ? Math.min(periodTotal / monthlyBudget, 1)
      : allTimeTotal > 0
        ? Math.min(periodTotal / allTimeTotal, 1)
        : 0;
  const donutOffset = DONUT_CIRCUMFERENCE * (1 - donutRatio);
  const overBudget = !!monthlyBudget && selectedPeriod !== 'All time' && periodTotal > monthlyBudget;

  // Monthly timeline bars for activeYear
  const monthlyTotals = useMemo(
    () => MONTH_SHORT.map((_, idx) => sumForMonth(receipts, activeYear, idx)),
    [receipts, activeYear, dateMode]
  );
  const chartMax = Math.max(...monthlyTotals, monthlyBudget || 0, 1);
  const yAxis = [1, 0.75, 0.5, 0.25, 0].map((f) => axisLabel(chartMax * f));

  // Available years across all receipts
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    years.add(today.getFullYear());
    receipts.forEach((r) => {
      const d = getReceiptDate(r);
      if (d && !isNaN(d.getFullYear())) years.add(d.getFullYear());
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [receipts, dateMode]);

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
      } catch {}
      setIsBudgetModalOpen(false);
    }
  };

  const handleClearBudget = () => {
    setMonthlyBudget(null);
    try {
      localStorage.removeItem(BUDGET_KEY);
    } catch {}
    setIsBudgetModalOpen(false);
  };

  return (
    <div className="klipit-screen-container klipit-expenditure-screen">
      {/* Top Navigation Bar */}
      <div className="klipit-top-nav-bar">
        <button className="klipit-nav-icon-btn" onClick={onBack} title="Back">
          <ChevronLeft size={24} color="#0f172a" />
        </button>
        <h1 className="klipit-details-title">Expenditure analysis</h1>
        <div style={{ width: 32 }} />
      </div>

      {/* Date Mode Pill Switcher */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '0 1rem 0.75rem',
        }}
      >
        <span style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>Group by:</span>
        <button
          type="button"
          onClick={() => setDateMode('upload')}
          style={{
            background: dateMode === 'upload' ? '#0f172a' : '#f1f5f9',
            color: dateMode === 'upload' ? '#ffffff' : '#475569',
            border: 'none',
            borderRadius: '20px',
            padding: '5px 12px',
            fontSize: '0.75rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          Saved Date (Active Period)
        </button>
        <button
          type="button"
          onClick={() => setDateMode('bill')}
          style={{
            background: dateMode === 'bill' ? '#0f172a' : '#f1f5f9',
            color: dateMode === 'bill' ? '#ffffff' : '#475569',
            border: 'none',
            borderRadius: '20px',
            padding: '5px 12px',
            fontSize: '0.75rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          Bill Print Date
        </button>
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

        {/* DONUT CHART */}
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
      </div>

      {/* CARD 2: Spending Summary & Month Carousel */}
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

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 0.25rem 0.75rem', fontSize: '0.95rem', color: '#0f172a' }}>
          <span style={{ fontWeight: 600, color: '#475569' }}>
            {selectedMonthCount} receipt{selectedMonthCount === 1 ? '' : 's'}
          </span>
          <strong style={{ fontSize: '1.1rem', fontWeight: 800 }}>
            {formatMoney(selectedMonthTotal, currency)}
          </strong>
        </div>

        {monthlyBudget ? (
          <div style={{ padding: '0 0.25rem 0.75rem' }}>
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

      {/* CARD 3: Category Breakdown (Detailed Spending by Category) */}
      {categoryBreakdown.length > 0 && (
        <div className="klipit-expenditure-card-white">
          <div className="klipit-card-header-row" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={18} color="#0f172a" />
              <h2 className="klipit-card-title">Spending by category</h2>
            </div>
            {selectedCategoryFilter && (
              <button
                type="button"
                onClick={() => setSelectedCategoryFilter(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563eb',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Clear filter
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {categoryBreakdown.map((item) => {
              const IconComp = item.meta.icon;
              const isSelected = selectedCategoryFilter === item.label;
              return (
                <div
                  key={item.label}
                  onClick={() =>
                    setSelectedCategoryFilter((prev) => (prev === item.label ? null : item.label))
                  }
                  style={{
                    padding: '10px 12px',
                    borderRadius: '12px',
                    background: isSelected ? '#f8fafc' : '#ffffff',
                    border: isSelected ? `2px solid ${item.meta.color}` : '1px solid #f1f5f9',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '8px',
                          background: item.meta.bg,
                          color: item.meta.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <IconComp size={16} />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                          {item.label}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          {item.count} receipt{item.count === 1 ? '' : 's'}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>
                        {formatMoney(item.total, currency)}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>
                        {item.pct.toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  <div style={{ height: 6, borderRadius: 3, background: '#f1f5f9', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(item.pct, 100)}%`,
                        background: item.meta.color,
                        borderRadius: 3,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* CARD 4: Itemized Receipts Breakdown (The Core Detailed View!) */}
      <div className="klipit-expenditure-card-white">
        <div className="klipit-card-header-row" style={{ marginBottom: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Receipt size={18} color="#0f172a" />
            <h2 className="klipit-card-title">
              Detailed receipts ({displayReceipts.length})
            </h2>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
            {selectedPeriod === 'All time' ? 'All Time' : `${MONTH_SHORT[activeMonthIdx]} ${activeYear}`}
          </span>
        </div>

        {displayReceipts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#94a3b8' }}>
            <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>No receipts found for this selection.</p>
            <p style={{ fontSize: '0.78rem', marginTop: '4px' }}>
              Switch Date Mode above or use the month arrows to inspect another period.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {displayReceipts.map((r) => {
              const meta = getCategoryMeta(r.document_type);
              const IconComp = meta.icon;
              return (
                <div
                  key={r.id}
                  onClick={() => onSelectReceipt && onSelectReceipt(r)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px',
                    borderRadius: '14px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    cursor: onSelectReceipt ? 'pointer' : 'default',
                    transition: 'all 0.15s ease',
                  }}
                  className="expenditure-receipt-row"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: '10px',
                        background: meta.bg,
                        color: meta.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <IconComp size={18} />
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '0.88rem',
                          fontWeight: 700,
                          color: '#0f172a',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {r.merchant_name || 'Receipt'}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                        <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          {formatReceiptDate(r.invoice_date || r.created_at)}
                        </span>
                        {r.invoice_number && (
                          <span
                            style={{
                              fontSize: '0.68rem',
                              background: '#e2e8f0',
                              color: '#334155',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontWeight: 600,
                            }}
                          >
                            #{r.invoice_number}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a' }}>
                        {formatMoney(r.total_amount, r.currency || currency)}
                      </div>
                      <div
                        style={{
                          fontSize: '0.68rem',
                          color: meta.color,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                        }}
                      >
                        {r.document_type || 'Receipt'}
                      </div>
                    </div>
                    {onSelectReceipt && <ChevronRight size={16} color="#94a3b8" />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CARD 5: Total Expenditure & Monthly Timeline Graph */}
      <div className="klipit-expenditure-card-white" style={{ marginBottom: '5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 className="klipit-sub-card-title">Total expenditure {activeYear}</h3>
            <div className="klipit-total-stat-val">
              {formatMoney(monthlyTotals.reduce((a, b) => a + b, 0), currency)}
            </div>
          </div>

          {/* Year Switcher Pills */}
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {availableYears.map((yr) => (
              <button
                key={yr}
                type="button"
                onClick={() => setActiveYear(yr)}
                style={{
                  background: activeYear === yr ? '#0f172a' : '#f1f5f9',
                  color: activeYear === yr ? '#ffffff' : '#475569',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '4px 8px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {yr}
              </button>
            ))}
          </div>
        </div>

        <p className="klipit-vat-disclaimer">
          * Totals are taken from each receipt as read and include taxes and discounts.
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
                  placeholder="e.g. 50000"
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
