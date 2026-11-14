/**
 * Shared formatting helpers so every screen shows money and dates the same way and
 * never substitutes made-up values for missing data.
 */

const LOCALE_FOR_CURRENCY: Record<string, string> = {
  INR: 'en-IN',
  USD: 'en-US',
  GBP: 'en-GB',
  EUR: 'de-DE',
  AED: 'en-AE',
  CAD: 'en-CA',
  SGD: 'en-SG',
};

/** Returns true when `code` is a 3-letter ISO currency code that Intl can format. */
export function isValidCurrencyCode(code?: string | null): boolean {
  if (!code || !/^[A-Za-z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: code.toUpperCase() });
    return true;
  } catch {
    return false;
  }
}

/**
 * Formats an amount in its currency. Null/undefined amounts are rendered as a placeholder
 * (never as a fake number). Unknown currency strings fall back to a plain prefix.
 */
export function formatMoney(amount: number | null | undefined, currency?: string | null, placeholder = '—'): string {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return placeholder;
  const code = (currency || 'INR').toUpperCase();
  if (isValidCurrencyCode(code)) {
    try {
      return new Intl.NumberFormat(LOCALE_FOR_CURRENCY[code] || 'en', {
        style: 'currency',
        currency: code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(amount));
    } catch {
      /* fall through */
    }
  }
  return `${code} ${Number(amount).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Parses the date strings OCR and users produce: ISO (2026-10-24), DD/MM/YYYY, DD-MM-YYYY,
 * DD.MM.YYYY and "24 Oct 2026". Day-first is assumed for numeric forms (Indian convention).
 * Returns null instead of a wrong date when the string cannot be read.
 */
export function parseReceiptDate(dateStr?: string | null, fallbackIso?: string | null): Date | null {
  if (dateStr) {
    const s = dateStr.trim();
    const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
    if (dmy) {
      const d = parseInt(dmy[1], 10);
      const m = parseInt(dmy[2], 10);
      let y = parseInt(dmy[3], 10);
      if (y < 100) y += 2000;
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        const date = new Date(y, m - 1, d);
        if (!isNaN(date.getTime())) return date;
      }
    }
    const ymd = s.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
    if (ymd) {
      const date = new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10));
      if (!isNaN(date.getTime())) return date;
    }
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  if (fallbackIso) {
    const parsed = new Date(fallbackIso);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

/** Human readable date; shows the raw string when it cannot be parsed and a placeholder when absent. */
export function formatReceiptDate(dateStr?: string | null, placeholder = 'Date not read'): string {
  if (!dateStr) return placeholder;
  const parsed = parseReceiptDate(dateStr);
  if (!parsed) return dateStr;
  return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** True when a merchant name is a placeholder produced by the app rather than read from the bill. */
export function isPlaceholderMerchant(name?: string | null): boolean {
  if (!name) return true;
  return /Analyzing|Scanning|Needs Review|Unverified|Unreadable/i.test(name);
}

export function displayMerchant(name?: string | null): string {
  return isPlaceholderMerchant(name) ? 'Merchant not read' : (name as string);
}
