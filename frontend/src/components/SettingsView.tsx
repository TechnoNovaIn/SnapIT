import React, { useState, useEffect } from 'react';
import { Key, Sparkles, ShieldCheck, ExternalLink, Cpu, Trash2, WifiOff } from 'lucide-react';
import { api, ANDROID_EMULATOR_API_URL, isNativeMobile } from '../api/client';
import type { AppSettings } from '../types/document';

interface SettingsViewProps {
  onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  onDataReset?: () => void;
}

const GEMINI_KEY_STORAGE = 'snapit_gemini_api_key';

const engineLabel = (settings: AppSettings): { title: string; detail: string; online: boolean } => {
  switch (settings.ocr_engine) {
    case 'gemini':
      return { title: 'Google Gemini Vision AI: Connected', detail: `Documents are read with ${settings.gemini_model || 'Gemini'} on the server.`, online: true };
    case 'local-winocr':
      return { title: 'Built-in Local OCR: Active', detail: 'Documents are read with the Windows OCR engine and rule-based parsing. Add a Gemini key for far better accuracy on handwriting and tables.', online: true };
    case 'local-text-only':
      return { title: 'Text-only Parser: Active', detail: 'This server has no OCR engine, so only PDFs with digital text can be read. Add a Gemini key to read photos and scans.', online: true };
    case 'offline':
      return { title: 'Server Not Reachable', detail: 'Receipts are stored on this device only. Set the backend URL below (Android) or start the server.', online: false };
    default:
      return settings.has_api_key
        ? { title: 'Google Gemini Vision AI: Connected', detail: `Using ${settings.gemini_model || 'Gemini'} for document extraction.`, online: true }
        : { title: 'Built-in Local Parser: Active', detail: 'Add a Gemini API key below for accurate vision extraction.', online: true };
  }
};

export const SettingsView: React.FC<SettingsViewProps> = ({ onShowToast, onDataReset }) => {
  const [settings, setSettings] = useState<AppSettings>({
    has_api_key: false,
    gemini_model: 'gemini-3.8-flash',
    default_currency: 'INR',
  });
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [geminiModel, setGeminiModel] = useState('gemini-3.8-flash');
  const [defaultCurrency, setDefaultCurrency] = useState('INR');
  const [serverUrlInput, setServerUrlInput] = useState(() => api.getCustomBaseUrl());
  const [isSaving, setIsSaving] = useState(false);
  const [isErasing, setIsErasing] = useState(false);
  const [hasDeviceKey, setHasDeviceKey] = useState(() => {
    try {
      return !!localStorage.getItem(GEMINI_KEY_STORAGE);
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let cancelled = false;
    api
      .getSettings()
      .then((res) => {
        if (cancelled) return;
        setSettings(res);
        setGeminiModel(res.gemini_model || 'gemini-3.8-flash');
        setDefaultCurrency(res.default_currency || 'INR');
      })
      .catch(() => {
        if (!cancelled) onShowToast('Could not load current settings', 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [onShowToast]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const previousUrl = api.getCustomBaseUrl();
    try {
      api.setCustomBaseUrl(serverUrlInput);
      const payload: Partial<AppSettings> = {
        gemini_model: geminiModel,
        default_currency: defaultCurrency,
      };
      const key = apiKeyInput.trim();
      if (key) {
        payload.gemini_api_key = key;
      }

      const updated = await api.saveSettings(payload);
      setSettings(updated);

      if (key && isNativeMobile()) {
        // On Android the key is also kept on the device so receipts can be read while offline.
        try {
          localStorage.setItem(GEMINI_KEY_STORAGE, key);
          setHasDeviceKey(true);
        } catch {
          /* storage unavailable */
        }
      }
      setApiKeyInput('');
      onShowToast('Settings saved successfully!', 'success');
    } catch (err) {
      // Roll back a server URL that does not answer so later requests are not sent to it.
      api.setCustomBaseUrl(previousUrl);
      setServerUrlInput(previousUrl);
      onShowToast(err instanceof Error && err.message ? `Failed to save settings: ${err.message}` : 'Failed to save settings', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearDeviceKey = () => {
    try {
      localStorage.removeItem(GEMINI_KEY_STORAGE);
    } catch {
      /* storage unavailable */
    }
    setHasDeviceKey(false);
    onShowToast('Removed the API key stored on this device', 'info');
  };

  const handleEraseAll = async () => {
    if (!window.confirm('Permanently erase all of your receipts, documents, line items and uploads? This cannot be undone.')) {
      return;
    }
    setIsErasing(true);
    try {
      await api.deleteAllDocuments();
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('snapit_vault_') || k === 'snapit_offline_docs')) keysToRemove.push(k);
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
      } catch {
        /* storage unavailable */
      }
      onShowToast('All data erased successfully! Starting fresh.', 'success');
      if (onDataReset) onDataReset();
    } catch {
      onShowToast('Failed to erase all data', 'error');
    } finally {
      setIsErasing(false);
    }
  };

  const engine = engineLabel(settings);

  return (
    <div className="settings-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
        <div className="brand-logo-icon">
          <Key size={20} />
        </div>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f172a' }}>
            AI & OCR Engine Settings
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
            Configure vision model credentials, default currency, and document reading preferences.
          </p>
        </div>
      </div>

      {/* Engine Status Banner */}
      <div
        style={{
          background: !engine.online ? '#fef2f2' : settings.has_api_key ? '#ecfdf5' : '#f8fafc',
          border: `1px solid ${!engine.online ? '#fecaca' : settings.has_api_key ? '#a7f3d0' : '#e2e8f0'}`,
          borderRadius: '10px',
          padding: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.9rem',
          marginBottom: '1.75rem',
        }}
      >
        {!engine.online ? (
          <WifiOff size={24} color="#b91c1c" />
        ) : settings.has_api_key ? (
          <Sparkles size={24} color="#059669" />
        ) : (
          <Cpu size={24} color="#64748b" />
        )}
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: !engine.online ? '#991b1b' : settings.has_api_key ? '#065f46' : '#1e293b' }}>
            {engine.title}
          </div>
          <div style={{ fontSize: '0.825rem', color: '#64748b', marginTop: '0.15rem' }}>
            {engine.detail}
          </div>
        </div>
      </div>

      <form onSubmit={handleSave}>
        <div className="form-group">
          <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Gemini Vision API Key</span>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: '0.8rem', color: '#059669', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.2rem' }}
            >
              Get free key at Google AI Studio <ExternalLink size={12} />
            </a>
          </label>
          <input
            type="password"
            className="form-input"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={settings.has_api_key ? `Key saved (${settings.gemini_api_key}). Enter a new key to replace it.` : 'AIzaSy...'}
            autoComplete="off"
          />
          <div className="form-help">
            Enter your Google AI Studio API key. The key is stored on the server and only ever shown masked.
            {hasDeviceKey && (
              <>
                {' '}A copy is also stored on this device for offline reading.{' '}
                <button type="button" className="klipit-link-btn" onClick={handleClearDeviceKey} style={{ padding: 0 }}>
                  Remove device copy
                </button>
              </>
            )}
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Vision Model</label>
          <select
            className="form-input"
            value={geminiModel}
            onChange={(e) => setGeminiModel(e.target.value)}
          >
            <option value="gemini-3.8-flash">Gemini 3.8 Flash (Recommended)</option>
            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
            <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
          </select>
          <div className="form-help">
            Multimodal models analyze handwriting, printed tables, GST stamps, and receipt typography.
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Default Currency</label>
          <select
            className="form-input"
            value={defaultCurrency}
            onChange={(e) => setDefaultCurrency(e.target.value)}
          >
            <option value="INR">Indian Rupee (INR - ₹)</option>
            <option value="USD">US Dollar (USD - $)</option>
            <option value="EUR">Euro (EUR - €)</option>
            <option value="GBP">British Pound (GBP - £)</option>
            <option value="AED">UAE Dirham (AED - د.إ)</option>
          </select>
          <div className="form-help">Used for manual expenses and for documents whose currency cannot be detected.</div>
        </div>

        {/* Web & Mobile Server Connection */}
        <div style={{ marginTop: '2rem', borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.6rem' }}>
            <span style={{ fontSize: '1.1rem' }}>🌐</span>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
              Backend Connection (Web & Android)
            </h3>
          </div>
          <p style={{ color: '#64748b', fontSize: '0.84rem', marginBottom: '1rem' }}>
            In a browser the app talks to the server it was loaded from, so this can stay empty.
            On Android enter the address of your SnapIT server (for example <code>http://192.168.1.10:8000</code> on Wi-Fi, or a tunnel URL).
          </p>

          <div className="form-group">
            <label className="form-label">Backend API URL (Optional)</label>
            <input
              type="url"
              className="form-input"
              value={serverUrlInput}
              onChange={(e) => setServerUrlInput(e.target.value)}
              placeholder="e.g. http://192.168.1.10:8000"
              autoComplete="off"
            />
            <div className="form-help" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
              <button type="button" className="btn-secondary-sm" onClick={() => setServerUrlInput('')}>
                💻 Same server as the app (default)
              </button>
              <button type="button" className="btn-secondary-sm" onClick={() => setServerUrlInput(ANDROID_EMULATOR_API_URL)}>
                📱 Android Emulator (10.0.2.2)
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2rem' }}>
          <button type="submit" className="btn-primary" disabled={isSaving}>
            <ShieldCheck size={16} />
            <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>

      {/* Danger Zone: Erase Overall Data */}
      <div
        style={{
          marginTop: '2.5rem',
          padding: '1.25rem',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
          <Trash2 size={18} color="#dc2626" />
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#991b1b', margin: 0 }}>
            Danger Zone: Erase All Data
          </h3>
        </div>
        <p style={{ fontSize: '0.825rem', color: '#b91c1c', marginBottom: '1rem', lineHeight: 1.4 }}>
          Permanently delete all of your receipts, invoices, expense records, scanned images, and local vaults for a completely fresh start.
        </p>
        <button
          type="button"
          onClick={handleEraseAll}
          disabled={isErasing}
          style={{
            background: '#dc2626',
            color: '#fff',
            border: 'none',
            padding: '10px 18px',
            borderRadius: '8px',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Trash2 size={15} />
          <span>{isErasing ? 'Erasing Everything...' : 'Erase All Data'}</span>
        </button>
      </div>
    </div>
  );
};
