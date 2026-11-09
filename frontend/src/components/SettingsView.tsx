import React, { useState, useEffect } from 'react';
import { Key, Sparkles, ShieldCheck, ExternalLink, Cpu } from 'lucide-react';
import { api } from '../api/client';
import type { AppSettings } from '../types/document';

interface SettingsViewProps {
  onShowToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onShowToast }) => {
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

  useEffect(() => {
    api.getSettings().then((res) => {
      setSettings(res);
      setGeminiModel(res.gemini_model || 'gemini-3.8-flash');
      setDefaultCurrency(res.default_currency || 'INR');
      if (res.gemini_api_key) {
        setApiKeyInput(res.gemini_api_key);
      }
    }).catch(() => {
      onShowToast('Could not load current settings', 'error');
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      api.setCustomBaseUrl(serverUrlInput);
      const payload: Partial<AppSettings> = {
        gemini_model: geminiModel,
        default_currency: defaultCurrency,
      };
      if (apiKeyInput && !apiKeyInput.includes('...')) {
        payload.gemini_api_key = apiKeyInput.trim();
      }

      const updated = await api.saveSettings(payload);
      setSettings(updated);
      onShowToast('Settings saved successfully!', 'success');
    } catch (err) {
      onShowToast('Failed to save settings', 'error');
    } finally {
      setIsSaving(false);
    }
  };

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
          background: settings.has_api_key ? '#ecfdf5' : '#f8fafc',
          border: `1px solid ${settings.has_api_key ? '#a7f3d0' : '#e2e8f0'}`,
          borderRadius: '10px',
          padding: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.9rem',
          marginBottom: '1.75rem',
        }}
      >
        {settings.has_api_key ? (
          <Sparkles size={24} color="#059669" />
        ) : (
          <Cpu size={24} color="#64748b" />
        )}
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: settings.has_api_key ? '#065f46' : '#1e293b' }}>
            {settings.has_api_key
              ? 'Google Gemini Vision AI: Connected'
              : 'Built-in Local Document Parser: Active'}
          </div>
          <div style={{ fontSize: '0.825rem', color: '#64748b', marginTop: '0.15rem' }}>
            {settings.has_api_key
              ? `Using multimodal AI (${settings.gemini_model}) for accurate receipt parsing.`
              : 'Processing documents locally. Add a Gemini API key below for state-of-the-art vision extraction.'}
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
            type="text"
            className="form-input"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder="AIzaSy..."
          />
          <div className="form-help">
            Your key is stored securely in server-side environment/database and never exposed to public links.
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Vision Model</label>
          <select
            className="form-input"
            value={geminiModel}
            onChange={(e) => setGeminiModel(e.target.value)}
          >
            <option value="gemini-3.8-flash">Gemini 3.8 Flash (Recommended - Latest & Most Accurate)</option>
            <option value="gemini-flash-latest">Gemini Flash Latest</option>
            <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
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
        </div>

        {/* Web & Mobile Server Connection */}
        <div style={{ marginTop: '2rem', borderTop: '1px solid #e2e8f0', paddingTop: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.6rem' }}>
            <span style={{ fontSize: '1.1rem' }}>🌐</span>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
              Platform & Backend Connection (Web & Android)
            </h3>
          </div>
          <p style={{ color: '#64748b', fontSize: '0.84rem', marginBottom: '1rem' }}>
            Works seamlessly in Web Browsers and on Android Mobile with local offline vault or live backend API.
          </p>

          <div className="form-group">
            <label className="form-label">Backend API URL (Optional)</label>
            <input
              type="text"
              className="form-input"
              value={serverUrlInput}
              onChange={(e) => setServerUrlInput(e.target.value)}
              placeholder="e.g. http://192.168.1.10:8000 or http://10.0.2.2:8000"
            />
            <div className="form-help" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
              <button
                type="button"
                className="btn-secondary-sm"
                onClick={() => setServerUrlInput('https://relatives-major-lisa-saints.trycloudflare.com/api')}
              >
                ☁️ Cloud Sync (4G/5G/Internet)
              </button>
              <button
                type="button"
                className="btn-secondary-sm"
                onClick={() => setServerUrlInput('http://192.168.0.156:8000/api')}
              >
                📶 Local Wi-Fi (192.168.0.156)
              </button>
              <button
                type="button"
                className="btn-secondary-sm"
                onClick={() => setServerUrlInput('/api')}
              >
                💻 Default Web (/api)
              </button>
              <button
                type="button"
                className="btn-secondary-sm"
                onClick={() => setServerUrlInput('http://10.0.2.2:8000/api')}
              >
                📱 Android Emulator
              </button>
              <button
                type="button"
                className="btn-secondary-sm"
                onClick={() => setServerUrlInput('')}
              >
                Clear / Auto
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
    </div>
  );
};
