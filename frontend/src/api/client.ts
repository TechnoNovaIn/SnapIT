import { Capacitor } from '@capacitor/core';
import type { DocumentData, DocumentListItem, AppSettings } from '../types/document';

/**
 * API client.
 *
 * Web: talks to the same origin (`/api`, proxied by Vite in dev and served by FastAPI in prod).
 * Android (Capacitor): there is no same-origin backend, so the user configures the server URL in
 * Settings. The Android emulator alias (10.0.2.2) is tried automatically. No private IPs or tunnel
 * hostnames are hardcoded: they change per network and silently break.
 *
 * Every write is mirrored to a per-user localStorage vault so the app keeps working offline and the
 * vault is pushed back to the server through /sync/vault once a backend is reachable.
 */

const STORAGE_KEYS = {
  customApiUrl: 'snapit_api_url',
  workingApiUrl: 'snapit_working_api_url',
  account: 'snapit_user_account',
  geminiKey: 'snapit_gemini_api_key',
} as const;

export const ANDROID_EMULATOR_API_URL = 'http://10.0.2.2:8000/api';
export const LOCAL_ID_PREFIXES = ['doc-offline-', 'doc-manual-'];

export const isLocalId = (id: string): boolean => LOCAL_ID_PREFIXES.some((p) => id.startsWith(p));

export const isNativeMobile = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    if (Capacitor.isNativePlatform()) return true;
  } catch {
    /* Capacitor not available */
  }
  return window.location.protocol === 'capacitor:';
};

const normalizeApiUrl = (raw?: string | null): string => {
  const trimmed = (raw || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed === '/api') return trimmed;
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};

const readStorage = (key: string): string => {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};

const writeStorage = (key: string, value: string | null): void => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode / quota) */
  }
};

/** Ordered list of API base URLs to try. */
export const getCandidateEndpoints = (): string[] => {
  const custom = normalizeApiUrl(readStorage(STORAGE_KEYS.customApiUrl));
  const list: string[] = [];

  if (custom) list.push(custom);

  if (!isNativeMobile()) {
    // Web: same origin only. Trying other hosts from a browser just produces slow CORS failures.
    list.push('/api');
    return Array.from(new Set(list));
  }

  const lastWorking = normalizeApiUrl(readStorage(STORAGE_KEYS.workingApiUrl));
  if (lastWorking) list.push(lastWorking);
  list.push(ANDROID_EMULATOR_API_URL);
  return Array.from(new Set(list));
};

/** Base URL used for links the browser opens directly (downloads, exports). */
export const getBaseUrl = (): string => {
  const custom = normalizeApiUrl(readStorage(STORAGE_KEYS.customApiUrl));
  if (custom) return custom;
  if (!isNativeMobile()) return '/api';
  const lastWorking = normalizeApiUrl(readStorage(STORAGE_KEYS.workingApiUrl));
  return lastWorking || ANDROID_EMULATOR_API_URL;
};

export const resolveAssetUrl = (url?: string | null): string => {
  if (!url) return '';
  if (/^(data:|blob:|https?:\/\/)/.test(url)) return url;
  if (url.startsWith('/api')) {
    const base = getBaseUrl();
    if (base !== '/api') return `${base.replace(/\/api$/, '')}${url}`;
  }
  return url;
};

const withUserQuery = (url: string): string => {
  // Downloads are plain links, so the user id travels as a query parameter instead of a header.
  const id = getCurrentUserIdentifier();
  if (!id) return url;
  return `${url}${url.includes('?') ? '&' : '?'}user_id=${encodeURIComponent(id)}`;
};

// ---------------------------------------------------------------------------
// Local (per user) vault
// ---------------------------------------------------------------------------

const getCurrentUserIdentifier = (): string => {
  try {
    const raw = readStorage(STORAGE_KEYS.account);
    if (raw) {
      const parsed = JSON.parse(raw);
      return String(parsed.email || parsed.phoneNumber || parsed.identifier || parsed.name || '').trim();
    }
  } catch {
    /* corrupt account record */
  }
  return '';
};

const getCurrentUserName = (): string => {
  try {
    const raw = readStorage(STORAGE_KEYS.account);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.name && String(parsed.name).trim()) return String(parsed.name).trim();
    }
  } catch {
    /* corrupt account record */
  }
  return 'Guest';
};

const getUserVaultKey = (): string => {
  const id = getCurrentUserIdentifier();
  if (!id) return 'snapit_vault_anonymous';
  const digits = id.replace(/\D/g, '');
  if (digits.length >= 10) return `snapit_vault_phone_${digits.slice(-10)}`;
  return `snapit_vault_user_${id.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
};

const getLocalDocs = (): DocumentData[] => {
  try {
    const raw = readStorage(getUserVaultKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLocalDocs = (docs: DocumentData[]): void => {
  writeStorage(getUserVaultKey(), JSON.stringify(docs));
};

const upsertLocalDoc = (doc: DocumentData): void => {
  const local = getLocalDocs();
  const idx = local.findIndex((d) => d.id === doc.id);
  if (idx === -1) local.unshift(doc);
  else local[idx] = doc;
  saveLocalDocs(local);
};

/** Iterates every vault in storage (the user may have signed in under a different identifier earlier). */
const forEachVault = (fn: (key: string, list: DocumentData[]) => boolean | void): void => {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('snapit_vault_') || key === 'snapit_offline_docs')) keys.push(key);
    }
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const list = JSON.parse(raw);
      if (Array.isArray(list) && fn(key, list) === true) return;
    }
  } catch {
    /* storage unavailable */
  }
};

const getAuthHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {};
  const userId = getCurrentUserIdentifier();
  const userName = getCurrentUserName();
  if (userId) headers['X-User-Id'] = userId;
  if (userName) headers['X-User-Name'] = userName;
  return headers;
};

const pendingFiles = new Map<string, File>();

// ---------------------------------------------------------------------------
// Networking
// ---------------------------------------------------------------------------

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const readErrorDetail = async (res: Response): Promise<string> => {
  try {
    const body = await res.json();
    if (typeof body?.detail === 'string') return body.detail;
    if (Array.isArray(body?.detail)) return body.detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ');
  } catch {
    /* not JSON */
  }
  return `Request failed (${res.status})`;
};

/**
 * Tries each candidate endpoint until one answers. Only network failures and non-API responses
 * (e.g. an HTML 404 from a static host) move on to the next endpoint; a real API answer, even an
 * error, is returned so callers can show its message.
 */
async function fetchWithCandidateFailover(path: string, options: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  const endpoints = getCandidateEndpoints();
  let lastError: unknown = null;

  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${endpoint}${path}`, { ...options, signal: options.signal || controller.signal });
      const contentType = res.headers.get('content-type') || '';
      const isApiAnswer = res.ok || contentType.includes('application/json');
      if (isApiAnswer) {
        if (isNativeMobile() && endpoint.startsWith('http')) writeStorage(STORAGE_KEYS.workingApiUrl, endpoint);
        return res;
      }
      lastError = new ApiError(res.status, `Unexpected response from ${endpoint}`);
    } catch (e) {
      lastError = e;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw lastError || new Error(`Network request failed for ${path}`);
}

async function requestJson<T>(path: string, options: RequestInit = {}, timeoutMs?: number): Promise<T> {
  const res = await fetchWithCandidateFailover(path, options, timeoutMs);
  if (!res.ok) throw new ApiError(res.status, await readErrorDetail(res));
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// On-device extraction (used only when no backend is reachable)
// ---------------------------------------------------------------------------

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

const getStoredGeminiKey = (): string => readStorage(STORAGE_KEYS.geminiKey).trim();

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function generateThumbnailDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) return '';
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (!result || typeof document === 'undefined') {
          resolve(result || '');
          return;
        }
        const img = new Image();
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const maxDim = 400;
            let w = img.width;
            let h = img.height;
            if (w > maxDim || h > maxDim) {
              if (w > h) {
                h = Math.round((h * maxDim) / w);
                w = maxDim;
              } else {
                w = Math.round((w * maxDim) / h);
                h = maxDim;
              }
            }
            canvas.width = Math.max(1, w);
            canvas.height = Math.max(1, h);
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              resolve(canvas.toDataURL('image/jpeg', 0.7));
              return;
            }
          } catch {
            /* canvas unavailable */
          }
          resolve(result);
        };
        img.onerror = () => resolve(result);
        img.src = result;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    } catch {
      resolve('');
    }
  });
}

const num = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^\d.-]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

const EXTRACTION_PROMPT = `You are an expert AI document reader for invoices, bills, receipts, purchase orders, medical bills, fuel bills, utility bills and transport documents.
Analyze the document image with extreme precision and extract real structured data. NEVER invent missing values: return null for anything that is not clearly visible.
Fields: merchant_name, merchant_address, invoice_number, invoice_date (YYYY-MM-DD), due_date, tax_id, currency (ISO code, "INR" for ₹/Rs), subtotal, discount, tax_amount, total_amount, payment_status (only if printed),
document_type (one of "Receipt", "Tax Invoice", "Purchase Order", "Utility Bill", "Medical Bill", "Transport Bill", "Fuel Bill", "Fee Receipt", "Other"),
tags (2-4 short strings), confidence_score (0.0-1.0), uncertain_fields (names of fields that are handwritten or ambiguous),
line_items: array of { description, category, quantity, unit_price, tax_amount, total }.
Return ONLY a valid JSON object.`;

/** Fallback result when nothing could be read. Every value is a visible placeholder, not a number. */
const UNREAD_RESULT: Partial<DocumentData> = {
  merchant_name: null,
  total_amount: null,
  subtotal: null,
  tax_amount: null,
  discount: 0,
  confidence_score: 0,
  review_status: 'needs_review',
  tags: ['Needs Review'],
  uncertain_fields: ['merchant_name', 'invoice_number', 'invoice_date', 'total_amount', 'line_items'],
  line_items: [],
};

async function extractWithGeminiVision(file: File): Promise<Partial<DocumentData>> {
  const geminiKey = getStoredGeminiKey();
  if (!geminiKey) return UNREAD_RESULT;

  let base64 = '';
  try {
    base64 = await fileToBase64(file);
  } catch (err) {
    console.error('[SnapIT AI] Could not read file:', err);
    return UNREAD_RESULT;
  }

  for (const model of GEMINI_MODELS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        // The key goes in a header, never in the URL (URLs end up in logs and history).
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: EXTRACTION_PROMPT }, { inline_data: { mime_type: file.type || 'image/jpeg', data: base64 } }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
        }),
        signal: controller.signal,
      });
      if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 429) {
        console.warn(`[SnapIT AI] Gemini rejected the request (${res.status}); not retrying other models.`);
        break;
      }
      if (!res.ok) continue;

      const data = await res.json();
      const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;
      const parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''));

      const items = Array.isArray(parsed.line_items)
        ? parsed.line_items
            .filter((it: any) => it && typeof it === 'object')
            .map((it: any) => {
              const quantity = num(it.quantity) ?? 1;
              const unitPrice = num(it.unit_price) ?? 0;
              return {
                description: String(it.description || 'Item'),
                category: String(it.category || 'General'),
                quantity,
                unit_price: unitPrice,
                tax_amount: num(it.tax_amount) ?? 0,
                total: num(it.total) ?? Math.round(quantity * unitPrice * 100) / 100,
                is_suggested_category: true,
              };
            })
        : [];

      const uncertain: string[] = Array.isArray(parsed.uncertain_fields) ? parsed.uncertain_fields.map(String) : [];
      let total = num(parsed.total_amount) ?? null;
      if (total === null && items.length > 0) {
        total = items.reduce((s: number, it: any) => s + (it.total || 0), 0);
        if (!uncertain.includes('total_amount')) uncertain.push('total_amount');
      }
      const merchant = parsed.merchant_name ? String(parsed.merchant_name) : null;
      if (!merchant && !uncertain.includes('merchant_name')) uncertain.push('merchant_name');

      return {
        merchant_name: merchant,
        merchant_address: parsed.merchant_address || null,
        invoice_number: parsed.invoice_number ? String(parsed.invoice_number) : null,
        invoice_date: parsed.invoice_date ? String(parsed.invoice_date) : null,
        due_date: parsed.due_date ? String(parsed.due_date) : null,
        tax_id: parsed.tax_id ? String(parsed.tax_id) : null,
        currency: typeof parsed.currency === 'string' && parsed.currency ? parsed.currency.toUpperCase() : 'INR',
        subtotal: num(parsed.subtotal) ?? total,
        discount: num(parsed.discount) ?? 0,
        tax_amount: num(parsed.tax_amount) ?? 0,
        total_amount: total,
        payment_status: parsed.payment_status ? String(parsed.payment_status) : null,
        document_type: parsed.document_type || 'Receipt',
        tags: Array.isArray(parsed.tags) && parsed.tags.length > 0 ? parsed.tags.map(String) : [parsed.document_type || 'Receipt'],
        confidence_score: Math.min(Math.max(num(parsed.confidence_score) ?? 0.8, 0), 1),
        uncertain_fields: uncertain,
        review_status: uncertain.length > 0 || !total || !merchant ? 'needs_review' : 'ready_for_review',
        line_items: items,
      };
    } catch (err) {
      console.warn(`[SnapIT AI] Gemini model ${model} extraction error:`, err);
    } finally {
      clearTimeout(timeoutId);
    }
  }
  return UNREAD_RESULT;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const nowIso = () => new Date().toISOString();

export const api = {
  // Config helpers
  getCustomBaseUrl(): string {
    return readStorage(STORAGE_KEYS.customApiUrl);
  },

  setCustomBaseUrl(url: string) {
    writeStorage(STORAGE_KEYS.customApiUrl, url.trim() ? url.trim() : null);
    writeStorage(STORAGE_KEYS.workingApiUrl, null);
  },

  async checkServer(): Promise<boolean> {
    try {
      const res = await fetchWithCandidateFailover('/health', {}, 5000);
      return res.ok;
    } catch {
      return false;
    }
  },

  // 1. Upload Document
  async uploadDocument(file: File): Promise<DocumentData> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      const data = await requestJson<DocumentData>('/documents/upload', { method: 'POST', headers: getAuthHeaders(), body: formData }, 30000);

      // Keep an instant local preview while the server thumbnail is generated.
      const localThumb = await generateThumbnailDataUrl(file).catch(() => '');
      if (localThumb) data.thumbnail_url = localThumb;
      upsertLocalDoc(data);
      return data;
    } catch (err) {
      if (err instanceof ApiError) throw err; // the server rejected the file: surface its reason
      console.warn('[SnapIT Upload] No backend reachable; storing the receipt locally:', err);
    }

    // Offline: keep the file in memory so "Read Document" can run on-device extraction.
    const id = `doc-offline-${Date.now()}`;
    pendingFiles.set(id, file);
    const previewUrl = (await generateThumbnailDataUrl(file).catch(() => '')) || URL.createObjectURL(file);

    const newDoc: DocumentData = {
      id,
      filename: file.name,
      file_size: file.size,
      mime_type: file.type || 'application/octet-stream',
      file_url: previewUrl,
      thumbnail_url: previewUrl,
      document_type: 'Receipt',
      merchant_name: null,
      customer_name: getCurrentUserName(),
      invoice_number: null,
      invoice_date: null,
      currency: 'INR',
      subtotal: null,
      discount: 0,
      tax_amount: null,
      total_amount: null,
      payment_status: null,
      review_status: 'needs_review',
      processing_status: 'pending',
      confidence_score: 0,
      tags: ['Offline Upload'],
      uncertain_fields: ['merchant_name', 'invoice_number', 'invoice_date', 'total_amount', 'line_items'],
      line_items: [],
      share_token: '',
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    upsertLocalDoc(newDoc);
    return newDoc;
  },

  // 2. Create Manual Expense
  async createManualExpense(payload: {
    merchant_name: string;
    total_amount: number;
    category?: string;
    invoice_date?: string;
    invoice_number?: string;
  }): Promise<DocumentData> {
    try {
      const data = await requestJson<DocumentData>('/documents/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });
      upsertLocalDoc(data);
      return data;
    } catch (err) {
      if (err instanceof ApiError) throw err;
    }

    const id = `doc-manual-${Date.now()}`;
    const category = payload.category || 'General';
    const newDoc: DocumentData = {
      id,
      filename: `${payload.merchant_name}.manual`,
      file_size: 0,
      mime_type: 'text/plain',
      file_url: '',
      thumbnail_url: null,
      document_type: 'Receipt',
      merchant_name: payload.merchant_name,
      customer_name: getCurrentUserName(),
      invoice_number: payload.invoice_number || `EXP-${Date.now().toString(36).toUpperCase()}`,
      invoice_date: payload.invoice_date || new Date().toISOString().split('T')[0],
      currency: 'INR',
      subtotal: payload.total_amount,
      discount: 0,
      tax_amount: 0,
      total_amount: payload.total_amount,
      payment_status: 'Paid',
      review_status: 'verified',
      processing_status: 'completed',
      confidence_score: 1.0,
      tags: [category, 'Manual Entry'],
      uncertain_fields: [],
      line_items: [
        { description: `${category} Expense`, category, quantity: 1, unit_price: payload.total_amount, tax_amount: 0, total: payload.total_amount },
      ],
      share_token: '',
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    upsertLocalDoc(newDoc);
    this.syncVaultWithServer().catch(() => {});
    return newDoc;
  },

  // 3. Process Document
  async processDocument(id: string): Promise<DocumentData> {
    if (!isLocalId(id)) {
      // Server processing can take a while for Gemini / OCR, so allow a long timeout.
      const data = await requestJson<DocumentData>(`/documents/${id}/process`, { method: 'POST', headers: getAuthHeaders() }, 120000);
      const existing = getLocalDocs().find((d) => d.id === id);
      if (existing?.thumbnail_url?.startsWith('data:')) data.thumbnail_url = existing.thumbnail_url;
      upsertLocalDoc(data);
      pendingFiles.delete(id);
      return data;
    }

    const local = getLocalDocs();
    const doc = local.find((d) => d.id === id);
    if (!doc) throw new Error('Document not found');

    const pendingFile = pendingFiles.get(id);
    if (pendingFile) {
      const extracted = await extractWithGeminiVision(pendingFile);
      Object.assign(doc, extracted);
      doc.processing_status = 'completed';
      doc.customer_name = getCurrentUserName();
      doc.updated_at = nowIso();
      saveLocalDocs(local);
      pendingFiles.delete(id);
      this.syncVaultWithServer().catch(() => {});
      return doc;
    }

    // The file is no longer in memory (app restarted): nothing more can be read.
    doc.processing_status = 'completed';
    doc.review_status = doc.total_amount ? doc.review_status : 'needs_review';
    saveLocalDocs(local);
    return doc;
  },

  // 4. Get Document Details
  async getDocument(id: string): Promise<DocumentData> {
    if (!isLocalId(id)) {
      try {
        const data = await requestJson<DocumentData>(`/documents/${id}`, { headers: getAuthHeaders() });
        const cached = getLocalDocs().find((d) => d.id === id);
        data.thumbnail_url = cached?.thumbnail_url?.startsWith('data:') ? cached.thumbnail_url : resolveAssetUrl(data.thumbnail_url);
        data.file_url = resolveAssetUrl(data.file_url);
        upsertLocalDoc(data);
        return data;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) throw new Error('Receipt not found');
        console.warn('[SnapIT] Server fetch failed, using local vault:', err);
      }
    }

    const local = getLocalDocs();
    const doc = local.find((d) => d.id === id);
    if (doc) {
      return { ...doc, thumbnail_url: resolveAssetUrl(doc.thumbnail_url), file_url: resolveAssetUrl(doc.file_url) };
    }

    let found: DocumentData | undefined;
    forEachVault((_key, list) => {
      const hit = list.find((d) => d.id === id);
      if (hit) {
        found = hit;
        return true;
      }
    });
    if (found) {
      upsertLocalDoc(found);
      return { ...found, thumbnail_url: resolveAssetUrl(found.thumbnail_url), file_url: resolveAssetUrl(found.file_url) };
    }

    throw new Error('Receipt not found');
  },

  // 5. Update Document
  async updateDocument(id: string, payload: Partial<DocumentData>): Promise<DocumentData> {
    let updatedDoc: DocumentData | null = null;
    const local = getLocalDocs();
    const idx = local.findIndex((d) => d.id === id);
    if (idx !== -1) {
      local[idx] = { ...local[idx], ...payload, updated_at: nowIso() };
      saveLocalDocs(local);
      updatedDoc = local[idx];
    } else {
      forEachVault((key, list) => {
        const fIdx = list.findIndex((d) => d.id === id);
        if (fIdx !== -1) {
          list[fIdx] = { ...list[fIdx], ...payload, updated_at: nowIso() };
          writeStorage(key, JSON.stringify(list));
          updatedDoc = list[fIdx];
          return true;
        }
      });
    }

    if (!isLocalId(id)) {
      try {
        const serverUpdated = await requestJson<DocumentData>(`/documents/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify(payload),
        });
        serverUpdated.thumbnail_url = updatedDoc?.thumbnail_url?.startsWith('data:') ? updatedDoc.thumbnail_url : resolveAssetUrl(serverUpdated.thumbnail_url);
        serverUpdated.file_url = resolveAssetUrl(serverUpdated.file_url);
        upsertLocalDoc(serverUpdated);
        return serverUpdated;
      } catch (err) {
        if (err instanceof ApiError) throw err; // validation error: tell the user
      }
    } else {
      this.syncVaultWithServer().catch(() => {});
    }

    if (updatedDoc) return updatedDoc;
    throw new Error('Failed to update receipt');
  },

  // 6. Delete Document
  async deleteDocument(id: string): Promise<void> {
    saveLocalDocs(getLocalDocs().filter((d) => d.id !== id));
    forEachVault((key, list) => {
      const filtered = list.filter((d) => d.id !== id);
      if (filtered.length !== list.length) writeStorage(key, JSON.stringify(filtered));
    });

    try {
      await fetchWithCandidateFailover(`/documents/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
    } catch {
      /* offline: the local removal stands; the server copy (if any) is removed on next manual delete */
    }
  },

  // 7. Delete All Documents (Start Fresh for current user)
  async deleteAllDocuments(): Promise<void> {
    try {
      await fetchWithCandidateFailover('/documents/all', { method: 'DELETE', headers: getAuthHeaders() });
    } catch {
      /* offline */
    }
    saveLocalDocs([]);
  },

  // 8. Bidirectional Vault Sync between Web & Android Mobile
  async syncVaultWithServer(): Promise<{ count: number; synced: boolean; documents: DocumentData[] }> {
    const userId = getCurrentUserIdentifier();
    const local = getLocalDocs();
    if (!userId) return { count: local.length, synced: false, documents: local };

    try {
      const data = await requestJson<{ documents: DocumentData[] }>('/sync/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ user_id: userId, user_name: getCurrentUserName(), documents: local }),
      }, 15000);

      if (Array.isArray(data?.documents)) {
        const merged: DocumentData[] = data.documents.map((srvDoc) => {
          const loc = local.find((l) => l.id === srvDoc.id);
          return {
            ...srvDoc,
            thumbnail_url: loc?.thumbnail_url?.startsWith('data:') ? loc.thumbnail_url : resolveAssetUrl(srvDoc.thumbnail_url),
            file_url: resolveAssetUrl(srvDoc.file_url) || loc?.file_url || '',
          };
        });
        saveLocalDocs(merged);
        return { count: merged.length, synced: true, documents: merged };
      }
    } catch (err) {
      console.warn('[SnapIT Sync] Sync failed:', err);
    }
    return { count: local.length, synced: false, documents: local };
  },

  // 9. List Documents
  async listDocuments(search?: string, document_type?: string, status?: string): Promise<DocumentListItem[]> {
    try {
      const serverDocs = await requestJson<DocumentListItem[]>('/documents', { headers: getAuthHeaders() });
      if (Array.isArray(serverDocs)) {
        // Refresh the local cache from the server list, keeping local-only receipts.
        const local = getLocalDocs();
        const serverIds = new Set(serverDocs.map((d) => d.id));
        const kept = local.filter((d) => serverIds.has(d.id) || isLocalId(d.id));
        for (const srv of serverDocs) {
          const idx = kept.findIndex((d) => d.id === srv.id);
          if (idx !== -1) {
            kept[idx] = {
              ...kept[idx],
              merchant_name: srv.merchant_name,
              total_amount: srv.total_amount,
              invoice_number: srv.invoice_number,
              invoice_date: srv.invoice_date,
              currency: srv.currency,
              document_type: srv.document_type,
              processing_status: (srv.processing_status as DocumentData['processing_status']) || kept[idx].processing_status,
              review_status: (srv.review_status as DocumentData['review_status']) || kept[idx].review_status,
            };
          }
        }
        saveLocalDocs(kept);

        const result: DocumentListItem[] = serverDocs.map((d) => ({ ...d, thumbnail_url: resolveAssetUrl(d.thumbnail_url) }));
        // Local-only receipts (offline uploads) are listed too so they are not lost from view.
        for (const d of kept) {
          if (isLocalId(d.id) && !serverIds.has(d.id)) result.unshift(toListItem(d));
        }
        return applyListFilters(result, search, document_type, status);
      }
    } catch (err) {
      console.warn('[SnapIT] Document list fetch failed, using local vault:', err);
    }

    return applyListFilters(getLocalDocs().map(toListItem), search, document_type, status);
  },

  // Settings
  async getSettings(): Promise<AppSettings> {
    try {
      return await requestJson<AppSettings>('/settings', {}, 5000);
    } catch {
      return { has_api_key: false, gemini_model: 'gemini-2.5-flash', default_currency: 'INR', ocr_engine: 'offline' };
    }
  },

  async saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    return requestJson<AppSettings>('/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
  },

  async createShareLink(id: string): Promise<{ share_token: string; share_url: string }> {
    if (!isLocalId(id)) {
      const res = await requestJson<{ share_token: string; share_url: string }>(`/documents/${id}/share`, { method: 'POST', headers: getAuthHeaders() });
      return { share_token: res.share_token, share_url: `${window.location.origin}/?shared=${res.share_token}` };
    }
    throw new Error('This receipt is only stored on this device. Connect to the server to share it.');
  },

  async getSharedDocument(token: string): Promise<DocumentData> {
    try {
      const data = await requestJson<DocumentData>(`/documents/shared/${encodeURIComponent(token)}`);
      data.thumbnail_url = resolveAssetUrl(data.thumbnail_url);
      data.file_url = resolveAssetUrl(data.file_url);
      return data;
    } catch (err) {
      if (err instanceof ApiError) throw new Error('Invalid or expired share link');
    }
    let found: DocumentData | undefined;
    forEachVault((_key, list) => {
      const hit = list.find((d) => d.share_token && d.share_token === token);
      if (hit) {
        found = hit;
        return true;
      }
    });
    if (found) return found;
    throw new Error('Invalid or expired share link');
  },

  // Export URLs (plain links; the user id is carried as a query parameter)
  getExportJsonUrl(id: string) {
    return withUserQuery(`${getBaseUrl()}/documents/${id}/export/json`);
  },
  getExportCsvUrl(id: string) {
    return withUserQuery(`${getBaseUrl()}/documents/${id}/export/csv`);
  },
  getExportExcelUrl(id: string) {
    return withUserQuery(`${getBaseUrl()}/documents/${id}/export/excel`);
  },
  getExportPdfUrl(id: string) {
    return withUserQuery(`${getBaseUrl()}/documents/${id}/export/pdf`);
  },
  getOriginalFileUrl(id: string) {
    return withUserQuery(`${getBaseUrl()}/documents/${id}/file`);
  },
  getThumbnailUrl(id: string) {
    return withUserQuery(`${getBaseUrl()}/documents/${id}/thumbnail`);
  },
};

function toListItem(d: DocumentData): DocumentListItem {
  return {
    id: d.id,
    filename: d.filename,
    file_size: d.file_size,
    mime_type: d.mime_type,
    thumbnail_url: resolveAssetUrl(d.thumbnail_url),
    document_type: d.document_type,
    merchant_name: d.merchant_name,
    invoice_number: d.invoice_number,
    invoice_date: d.invoice_date,
    currency: d.currency,
    total_amount: d.total_amount,
    line_items_count: (d.line_items || []).length,
    processing_status: d.processing_status,
    review_status: d.review_status,
    created_at: d.created_at,
  };
}

function applyListFilters(items: DocumentListItem[], search?: string, document_type?: string, status?: string): DocumentListItem[] {
  let result = items;
  if (search && search.trim()) {
    const q = search.toLowerCase();
    result = result.filter(
      (d) =>
        d.merchant_name?.toLowerCase().includes(q) ||
        d.filename?.toLowerCase().includes(q) ||
        d.invoice_number?.toLowerCase().includes(q)
    );
  }
  if (document_type && document_type !== 'All') {
    result = result.filter((d) => d.document_type?.toLowerCase() === document_type.toLowerCase());
  }
  if (status && status !== 'All') {
    result = result.filter((d) => d.review_status?.toLowerCase() === status.toLowerCase() || d.processing_status?.toLowerCase() === status.toLowerCase());
  }
  return result;
}
