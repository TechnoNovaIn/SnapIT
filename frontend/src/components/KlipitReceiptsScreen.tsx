import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { DocumentListItem } from '../types/document';
import {
  Share2,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  X,
  Check,
  RotateCcw,
} from 'lucide-react';

interface KlipitReceiptsScreenProps {
  receipts: DocumentListItem[];
  onOpenReceipt: (id: string) => void;
  onShareAll?: () => void;
}

type SortOption = 'recent' | 'highest' | 'lowest' | 'oldest' | 'alphabetical';
type DateFilter = 'all' | 'today' | 'yesterday' | 'week' | 'month';
type AmountFilter = 'all' | 'under1k' | '1k-5k' | 'over5k' | 'custom';
type StatusFilter = 'all' | 'completed' | 'pending';

function parseReceiptDate(dateStr?: string | null, createdStr?: string | null): Date | null {
  if (dateStr) {
    // Check for DD.MM.YYYY
    const ddmmyyyy = dateStr.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (ddmmyyyy) {
      return new Date(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1]));
    }
    // Check for DD-MM-YYYY
    const ddmmyyyyDash = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (ddmmyyyyDash) {
      return new Date(parseInt(ddmmyyyyDash[3]), parseInt(ddmmyyyyDash[2]) - 1, parseInt(ddmmyyyyDash[1]));
    }
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  if (createdStr) {
    const parsed = new Date(createdStr);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function formatDateGroup(date: Date | null, rawDateStr?: string | null): string {
  if (!date) return rawDateStr || 'Recent';
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return 'Yesterday';

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export const KlipitReceiptsScreen: React.FC<KlipitReceiptsScreenProps> = ({
  receipts,
  onOpenReceipt,
  onShareAll,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'ai'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOption>('highest');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);

  // Filter States
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [amountFilter, setAmountFilter] = useState<AmountFilter>('all');
  const [customMin, setCustomMin] = useState<string>('');
  const [customMax, setCustomMax] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const sortMenuRef = useRef<HTMLDivElement>(null);

  // Close sort menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setIsSortMenuOpen(false);
      }
    };
    if (isSortMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSortMenuOpen]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (dateFilter !== 'all') count++;
    if (amountFilter !== 'all') count++;
    if (statusFilter !== 'all') count++;
    return count;
  }, [dateFilter, amountFilter, statusFilter]);

  const handleResetFilters = () => {
    setDateFilter('all');
    setAmountFilter('all');
    setCustomMin('');
    setCustomMax('');
    setStatusFilter('all');
  };

  // Filter and Sort Receipts
  const processedReceipts = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86400000;
    const weekAgo = todayStart - 7 * 86400000;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const filtered = receipts.filter((r) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesMerchant = r.merchant_name && r.merchant_name.toLowerCase().includes(q);
        const matchesInvoice = r.invoice_number && r.invoice_number.toLowerCase().includes(q);
        if (!matchesMerchant && !matchesInvoice) return false;
      }

      // 2. Active Tab
      if (activeTab === 'ai') {
        const isAi = r.processing_status === 'completed' || r.document_type === 'RECEIPT';
        if (!isAi) return false;
      }

      // 3. Status Filter
      if (statusFilter === 'completed' && r.processing_status !== 'completed') {
        return false;
      }
      if (statusFilter === 'pending' && r.processing_status === 'completed') {
        return false;
      }

      // 4. Amount Filter
      const amt = Number(r.total_amount) || 0;
      if (amountFilter === 'under1k' && amt >= 1000) return false;
      if (amountFilter === '1k-5k' && (amt < 1000 || amt > 5000)) return false;
      if (amountFilter === 'over5k' && amt <= 5000) return false;
      if (amountFilter === 'custom') {
        const min = parseFloat(customMin);
        const max = parseFloat(customMax);
        if (!isNaN(min) && amt < min) return false;
        if (!isNaN(max) && amt > max) return false;
      }

      // 5. Date Filter
      if (dateFilter !== 'all') {
        const rDate = parseReceiptDate(r.invoice_date, (r as any).created_at);
        if (rDate) {
          const t = rDate.getTime();
          if (dateFilter === 'today' && t < todayStart) return false;
          if (dateFilter === 'yesterday' && (t < yesterdayStart || t >= todayStart)) return false;
          if (dateFilter === 'week' && t < weekAgo) return false;
          if (dateFilter === 'month' && t < monthStart) return false;
        }
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      const amtA = Number(a.total_amount) || 0;
      const amtB = Number(b.total_amount) || 0;

      if (sortOrder === 'highest') {
        return amtB - amtA;
      }
      if (sortOrder === 'lowest') {
        return amtA - amtB;
      }
      if (sortOrder === 'alphabetical') {
        const nameA = a.merchant_name || '';
        const nameB = b.merchant_name || '';
        return nameA.localeCompare(nameB);
      }
      const dateA = parseReceiptDate(a.invoice_date, (a as any).created_at)?.getTime() || 0;
      const dateB = parseReceiptDate(b.invoice_date, (b as any).created_at)?.getTime() || 0;

      if (sortOrder === 'oldest') {
        return dateA - dateB;
      }
      // 'recent'
      return dateB - dateA;
    });

    return filtered;
  }, [
    receipts,
    searchQuery,
    activeTab,
    statusFilter,
    amountFilter,
    customMin,
    customMax,
    dateFilter,
    sortOrder,
  ]);

  const allCount = receipts.length;
  const aiCount = receipts.filter(
    (r) => r.processing_status === 'completed' || r.document_type === 'RECEIPT'
  ).length;

  const getSortLabel = (order: SortOption) => {
    switch (order) {
      case 'highest':
        return 'Highest amount';
      case 'lowest':
        return 'Lowest amount';
      case 'recent':
        return 'Recent uploads';
      case 'oldest':
        return 'Oldest uploads';
      case 'alphabetical':
        return 'Merchant (A-Z)';
    }
  };

  // Group receipts if sorting by date; otherwise show clean grouped or single list
  const groupedReceipts = useMemo(() => {
    if (sortOrder === 'highest' || sortOrder === 'lowest' || sortOrder === 'alphabetical') {
      return [{ groupTitle: getSortLabel(sortOrder), items: processedReceipts }];
    }

    const groups: { groupTitle: string; items: DocumentListItem[] }[] = [];
    const map = new Map<string, DocumentListItem[]>();

    processedReceipts.forEach((r) => {
      const parsed = parseReceiptDate(r.invoice_date, (r as any).created_at);
      const title = formatDateGroup(parsed, r.invoice_date);
      if (!map.has(title)) {
        map.set(title, []);
      }
      map.get(title)!.push(r);
    });

    map.forEach((items, groupTitle) => {
      groups.push({ groupTitle, items });
    });

    return groups;
  }, [processedReceipts, sortOrder]);

  return (
    <div className="klipit-screen-container">
      {/* Top Header */}
      <div className="klipit-receipts-header">
        <h1 className="klipit-page-title">Receipts</h1>
        <div className="klipit-header-actions">
          <button
            className="klipit-icon-btn"
            onClick={onShareAll || (() => alert('Sharing your receipts list link'))}
            title="Share"
          >
            <Share2 size={22} color="#1e293b" />
          </button>
          <button
            className="klipit-icon-btn"
            onClick={() => setIsSearchOpen((prev) => !prev)}
            title="Search"
          >
            <Search size={22} color="#1e293b" />
          </button>
        </div>
      </div>

      {/* Optional Search Bar */}
      {isSearchOpen && (
        <div className="klipit-search-bar-row">
          <Search size={18} color="#64748b" />
          <input
            type="text"
            placeholder="Search by merchant, invoice..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="klipit-search-input"
            autoFocus
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}>
              <X size={16} color="#64748b" />
            </button>
          )}
        </div>
      )}

      {/* Tabs: All (N) and SnapIT AI (N) */}
      <div className="klipit-tabs-bar">
        <button
          className={`klipit-tab-btn ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          All ({allCount})
          {activeTab === 'all' && <div className="klipit-tab-indicator" />}
        </button>
        <button
          className={`klipit-tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
          onClick={() => setActiveTab('ai')}
        >
          SnapIT AI ({aiCount})
          {activeTab === 'ai' && <div className="klipit-tab-indicator" />}
        </button>
      </div>

      {/* Filter and Sort Row */}
      <div className="klipit-filter-sort-row">
        {/* Filter circle button with active filter counter badge */}
        <button
          className={`klipit-filter-circle-btn ${activeFilterCount > 0 ? 'active' : ''}`}
          onClick={() => setIsFilterModalOpen(true)}
          title="Filter receipts"
          style={{ position: 'relative' }}
        >
          <SlidersHorizontal size={18} color={activeFilterCount > 0 ? '#16a34a' : '#1e293b'} />
          {activeFilterCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                background: '#16a34a',
                color: '#ffffff',
                fontSize: '0.65rem',
                fontWeight: 700,
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Sort Pill with Dropdown Menu */}
        <div style={{ position: 'relative' }} ref={sortMenuRef}>
          <button
            className="klipit-sort-pill-btn"
            onClick={() => setIsSortMenuOpen((prev) => !prev)}
          >
            <ArrowUpDown size={15} color="#1e293b" />
            <span>{getSortLabel(sortOrder)}</span>
            <span style={{ fontSize: '0.8rem' }}>⌵</span>
          </button>

          {isSortMenuOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: '6px',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)',
                padding: '6px 0',
                minWidth: '180px',
                zIndex: 40,
              }}
            >
              {[
                { id: 'highest', label: 'Highest amount' },
                { id: 'lowest', label: 'Lowest amount' },
                { id: 'recent', label: 'Recent uploads' },
                { id: 'oldest', label: 'Oldest uploads' },
                { id: 'alphabetical', label: 'Merchant (A-Z)' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    setSortOrder(opt.id as SortOption);
                    setIsSortMenuOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '8px 14px',
                    fontSize: '0.86rem',
                    color: sortOrder === opt.id ? '#16a34a' : '#1e293b',
                    fontWeight: sortOrder === opt.id ? 700 : 500,
                    background: sortOrder === opt.id ? '#f0fdf4' : 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span>{opt.label}</span>
                  {sortOrder === opt.id && <Check size={14} color="#16a34a" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Receipts List with Date/Sort Groupings */}
      <div className="klipit-receipts-list" style={{ marginBottom: '5rem' }}>
        {processedReceipts.length === 0 ? (
          <div className="klipit-empty-card">
            <p style={{ fontWeight: 600, color: '#1e293b' }}>No receipts found</p>
            <p style={{ fontSize: '0.85rem', color: '#64748b' }}>
              {activeFilterCount > 0
                ? 'Try adjusting or clearing your filters.'
                : 'Add a receipt using the green button below!'}
            </p>
            {activeFilterCount > 0 && (
              <button
                className="btn-read-large"
                style={{
                  marginTop: '1rem',
                  padding: '6px 14px',
                  fontSize: '0.85rem',
                  borderRadius: '9999px',
                }}
                onClick={handleResetFilters}
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          groupedReceipts.map((group, gIdx) => (
            <div key={gIdx} style={{ marginBottom: '1rem' }}>
              <div className="klipit-date-group-title">{group.groupTitle}</div>

              {group.items.map((rec) => (
                <div
                  key={rec.id}
                  className="klipit-receipt-row-card"
                  onClick={() => onOpenReceipt(rec.id)}
                >
                  {/* Circular thumbnail */}
                  <div className="klipit-receipt-avatar">
                    {rec.thumbnail_url ? (
                      <img src={rec.thumbnail_url} alt={rec.merchant_name || 'Receipt'} />
                    ) : (
                      <div className="klipit-receipt-avatar-placeholder">
                        <span>📄</span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="klipit-receipt-info">
                    <div className="klipit-receipt-merchant">
                      {rec.merchant_name || 'Receipt'}
                    </div>
                    <div className="klipit-receipt-date">
                      {rec.invoice_date || '24 Oct 2026'}
                    </div>
                    <div className="klipit-badge-ai">
                      <span>SnapIT AI</span>
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="klipit-receipt-amt">
                    INR {rec.total_amount ? Number(rec.total_amount).toLocaleString() : '3,100'}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* FILTER BOTTOM SHEET / MODAL */}
      {isFilterModalOpen && (
        <div className="modal-overlay" style={{ alignItems: 'flex-end', padding: 0, zIndex: 60 }}>
          <div className="klipit-bottom-sheet">
            {/* Header */}
            <div className="klipit-sheet-header">
              <h2 className="klipit-sheet-title">Filter Receipts</h2>
              <button className="klipit-close-circle" onClick={() => setIsFilterModalOpen(false)}>
                <X size={20} color="#64748b" />
              </button>
            </div>

            <div className="klipit-sheet-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
              {/* Date Filter Section */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.6rem' }}>
                  Date Range
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {[
                    { id: 'all', label: 'All Time' },
                    { id: 'today', label: 'Today' },
                    { id: 'yesterday', label: 'Yesterday' },
                    { id: 'week', label: 'Last 7 Days' },
                    { id: 'month', label: 'This Month' },
                  ].map((df) => (
                    <button
                      key={df.id}
                      onClick={() => setDateFilter(df.id as DateFilter)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '9999px',
                        fontSize: '0.82rem',
                        fontWeight: dateFilter === df.id ? 700 : 500,
                        border: dateFilter === df.id ? '1px solid #16a34a' : '1px solid #e2e8f0',
                        background: dateFilter === df.id ? '#f0fdf4' : '#ffffff',
                        color: dateFilter === df.id ? '#16a34a' : '#64748b',
                        cursor: 'pointer',
                      }}
                    >
                      {df.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount Filter Section */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.6rem' }}>
                  Amount Range
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '0.6rem' }}>
                  {[
                    { id: 'all', label: 'All Amounts' },
                    { id: 'under1k', label: '< ₹1,000' },
                    { id: '1k-5k', label: '₹1,000 - ₹5,000' },
                    { id: 'over5k', label: '> ₹5,000' },
                    { id: 'custom', label: 'Custom' },
                  ].map((af) => (
                    <button
                      key={af.id}
                      onClick={() => setAmountFilter(af.id as AmountFilter)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '9999px',
                        fontSize: '0.82rem',
                        fontWeight: amountFilter === af.id ? 700 : 500,
                        border: amountFilter === af.id ? '1px solid #16a34a' : '1px solid #e2e8f0',
                        background: amountFilter === af.id ? '#f0fdf4' : '#ffffff',
                        color: amountFilter === af.id ? '#16a34a' : '#64748b',
                        cursor: 'pointer',
                      }}
                    >
                      {af.label}
                    </button>
                  ))}
                </div>

                {amountFilter === 'custom' && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <input
                      type="number"
                      placeholder="Min ₹"
                      value={customMin}
                      onChange={(e) => setCustomMin(e.target.value)}
                      className="klipit-amount-field"
                      style={{ fontSize: '0.85rem', padding: '8px 12px' }}
                    />
                    <input
                      type="number"
                      placeholder="Max ₹"
                      value={customMax}
                      onChange={(e) => setCustomMax(e.target.value)}
                      className="klipit-amount-field"
                      style={{ fontSize: '0.85rem', padding: '8px 12px' }}
                    />
                  </div>
                )}
              </div>

              {/* Status Section */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#334155', marginBottom: '0.6rem' }}>
                  Verification Status
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'completed', label: 'SnapIT AI Verified' },
                    { id: 'pending', label: 'Pending' },
                  ].map((sf) => (
                    <button
                      key={sf.id}
                      onClick={() => setStatusFilter(sf.id as StatusFilter)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '9999px',
                        fontSize: '0.82rem',
                        fontWeight: statusFilter === sf.id ? 700 : 500,
                        border: statusFilter === sf.id ? '1px solid #16a34a' : '1px solid #e2e8f0',
                        background: statusFilter === sf.id ? '#f0fdf4' : '#ffffff',
                        color: statusFilter === sf.id ? '#16a34a' : '#64748b',
                        cursor: 'pointer',
                      }}
                    >
                      {sf.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '12px',
                    borderRadius: '12px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                  }}
                >
                  <RotateCcw size={16} />
                  <span>Reset</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsFilterModalOpen(false)}
                  style={{
                    flex: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '12px',
                    borderRadius: '12px',
                    border: 'none',
                    background: '#16a34a',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                  }}
                >
                  <Check size={16} />
                  <span>Apply Filters</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
