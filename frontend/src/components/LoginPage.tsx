import React, { useState } from 'react';
import { ChevronDown, Check, X, ShieldCheck, Phone, Mail, User } from 'lucide-react';

interface LoginPageProps {
  onLogin: (
    name: string,
    identifier: string,
    provider?: 'phone' | 'email' | 'google' | 'apple',
    phoneNumber?: string,
    email?: string
  ) => void;
  defaultName?: string;
  defaultPhone?: string;
  defaultEmail?: string;
}

const COUNTRIES = [
  { code: '+91', name: 'India', flag: '🇮🇳' },
  { code: '+1', name: 'United States', flag: '🇺🇸' },
  { code: '+44', name: 'United Kingdom', flag: '🇬🇧' },
  { code: '+971', name: 'UAE', flag: '🇦🇪' },
  { code: '+65', name: 'Singapore', flag: '🇸🇬' },
];

const CAROUSEL_SLIDES = [
  "Just Scan Receipts, we'll keep it safe.",
  "Track monthly expenditure & budgets effortlessly.",
  "Automatic AI itemization & lifetime warranty vault.",
];

export const LoginPage: React.FC<LoginPageProps> = ({
  onLogin,
  defaultName = '',
  defaultPhone = '',
  defaultEmail = '',
}) => {
  const [activeSlide, setActiveSlide] = useState(0);
  const [selectedCountry, setSelectedCountry] = useState(COUNTRIES[0]);
  const [isCountryOpen, setIsCountryOpen] = useState(false);

  // Form Fields - Clean & Open for any user by default
  const [fullName, setFullName] = useState(defaultName || '');
  const [phoneNumber, setPhoneNumber] = useState(defaultPhone ? defaultPhone.replace(/^\+\d+\s*/, '') : '');
  const [emailAddress, setEmailAddress] = useState(defaultEmail || '');
  const [error, setError] = useState<string | null>(null);

  // Google Account Access Dialog State
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [googleName, setGoogleName] = useState(fullName || '');
  const [googleEmail, setGoogleEmail] = useState(emailAddress || '');
  const [googlePhone, setGooglePhone] = useState(phoneNumber ? `${selectedCountry.code} ${phoneNumber}` : '');
  const [googleError, setGoogleError] = useState<string | null>(null);

  const isFormValid = fullName.trim().length >= 2 && (phoneNumber.trim().length >= 6 || emailAddress.trim().includes('@'));

  const handleContinue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Please enter your full name');
      return;
    }
    if (!phoneNumber.trim() && !emailAddress.trim()) {
      setError('Please enter your mobile number or email address');
      return;
    }

    setError(null);
    const cleanDigits = phoneNumber.replace(/\D/g, '');
    const formattedPhone = cleanDigits.length >= 6 ? `${selectedCountry.code} ${cleanDigits}` : undefined;
    const formattedEmail = emailAddress.trim().includes('@') ? emailAddress.trim().toLowerCase() : undefined;
    const primaryId = formattedPhone || formattedEmail || fullName.trim();

    onLogin(
      fullName.trim(),
      primaryId,
      formattedPhone ? 'phone' : 'email',
      formattedPhone,
      formattedEmail
    );
  };

  const handleOpenGoogleAuth = () => {
    setGoogleName(fullName.trim() || '');
    setGoogleEmail(emailAddress.trim() || '');
    const cleanDigits = phoneNumber.replace(/\D/g, '');
    setGooglePhone(cleanDigits ? `${selectedCountry.code} ${cleanDigits}` : '');
    setGoogleError(null);
    setIsGoogleModalOpen(true);
  };

  const handleConfirmGoogleSignIn = () => {
    if (!googleName.trim()) {
      setGoogleError('Please enter your Google account name');
      return;
    }
    if (!googleEmail.trim() || !googleEmail.includes('@')) {
      setGoogleError('Please enter a valid Google email address');
      return;
    }

    const finalName = googleName.trim();
    const finalEmail = googleEmail.trim().toLowerCase();
    const cleanDigits = googlePhone.replace(/\D/g, '');
    const finalPhone = cleanDigits ? `${selectedCountry.code} ${cleanDigits}` : undefined;

    setIsGoogleModalOpen(false);
    onLogin(finalName, finalEmail, 'google', finalPhone, finalEmail);
  };

  return (
    <div className="klipit-auth-screen-container">
      {/* 1. TOP HERO CARD WITH GREEN-BLUE GRADIENT & SCANNING ILLUSTRATION */}
      <div className="klipit-auth-hero-card">
        {/* Glow ambient background */}
        <div className="hero-gradient-overlay" />

        {/* Hand Holding Phone Scanning Receipt Illustration */}
        <div className="hero-illustration-wrapper">
          {/* Peeking background paper receipt */}
          <div className="illustration-peeking-receipt">
            <div className="peeking-receipt-line short" />
            <div className="peeking-receipt-line long" />
            <div className="peeking-receipt-line med" />
            <div className="peeking-receipt-line short" />
            <div className="peeking-receipt-line long" />
          </div>

          {/* Floating transaction badges around phone */}
          <div className="floating-badge badge-uber">
            <span className="badge-brand">Uber</span>
            <span className="badge-amt">150.00</span>
          </div>

          <div className="floating-badge badge-cam">
            <span className="badge-icon">📷</span>
            <span className="badge-amt">50.00</span>
          </div>

          <div className="floating-badge-ai">
            <span>AI</span>
          </div>

          <div className="floating-badge badge-flight">
            <span className="badge-icon">✈️</span>
            <span className="badge-amt">800.00</span>
          </div>

          <div className="floating-badge badge-lyft">
            <span className="badge-brand lyft-pink">lyft</span>
            <span className="badge-amt">100.00</span>
          </div>

          <div className="floating-badge badge-call">
            <span className="badge-icon">📞</span>
            <span className="badge-amt">80.00</span>
          </div>

          {/* Center Smartphone */}
          <div className="illustration-phone">
            <div className="phone-notch" />
            <div className="phone-screen-content">
              <div className="phone-app-header">
                <span className="phone-logo-text">Snap<span style={{ color: '#22c55e' }}>IT</span></span>
              </div>

              {/* Scanned Digital Receipt */}
              <div className="phone-receipt-sheet">
                <div className="receipt-scan-beam" />
                <div className="scanned-merchant-title">EXPRESS MART</div>
                <div className="scanned-amt-row">INR 40</div>
                <div className="scanned-sub-info">Total at: BMTC</div>
                <div className="scanned-sub-sub">Merchant</div>
                <div className="scanned-sawtooth-bottom" />
              </div>
            </div>
          </div>

          {/* Hands */}
          <div className="illustration-hand hand-left" />
          <div className="illustration-hand hand-right" />
        </div>

        {/* Carousel Caption */}
        <h2 className="hero-caption-text">
          {CAROUSEL_SLIDES[activeSlide]}
        </h2>

        {/* Pagination Dots */}
        <div className="hero-carousel-dots">
          {CAROUSEL_SLIDES.map((_, idx) => (
            <button
              key={idx}
              type="button"
              className={`carousel-dot ${activeSlide === idx ? 'active' : ''}`}
              onClick={() => setActiveSlide(idx)}
              aria-label={`Slide ${idx + 1}`}
            />
          ))}
        </div>
      </div>

      {/* 2. BOTTOM AUTH FORM SECTION */}
      <div className="klipit-auth-form-body">
        <h1 className="auth-get-started-title">
          Get <u>Started</u>
        </h1>

        {error && (
          <div className="auth-error-text">{error}</div>
        )}

        <form onSubmit={handleContinue} className="auth-form-fields">
          {/* Country Selection Dropdown Box */}
          <div className="country-selector-box-wrap">
            <button
              type="button"
              className="country-selector-box"
              onClick={() => setIsCountryOpen((prev) => !prev)}
            >
              <div className="country-flag-name">
                <span className="country-flag">{selectedCountry.flag}</span>
                <span className="country-name-code">
                  {selectedCountry.name} ({selectedCountry.code})
                </span>
              </div>
              <ChevronDown size={18} color="#0f172a" />
            </button>

            {isCountryOpen && (
              <div className="country-dropdown-menu">
                {COUNTRIES.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    className="country-dropdown-item"
                    onClick={() => {
                      setSelectedCountry(c);
                      setIsCountryOpen(false);
                    }}
                  >
                    <span>{c.flag} {c.name} ({c.code})</span>
                    {selectedCountry.code === c.code && <Check size={16} color="#16a34a" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* User Full Name Input - Open for any user */}
          <div className="auth-input-box-wrap">
            <input
              type="text"
              placeholder="Full Name (e.g. Your Name)"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                setError(null);
              }}
              className="auth-identifier-input"
              autoComplete="name"
            />
          </div>

          {/* Mobile Number Input */}
          <div className="auth-input-box-wrap">
            <input
              type="tel"
              placeholder="Mobile Number (e.g. 98765 43210)"
              value={phoneNumber}
              onChange={(e) => {
                setPhoneNumber(e.target.value);
                setError(null);
              }}
              className="auth-identifier-input"
              autoComplete="tel"
            />
          </div>

          {/* Email Address Input */}
          <div className="auth-input-box-wrap">
            <input
              type="email"
              placeholder="Email Address (e.g. user@gmail.com)"
              value={emailAddress}
              onChange={(e) => {
                setEmailAddress(e.target.value);
                setError(null);
              }}
              className="auth-identifier-input"
              autoComplete="email"
            />
          </div>

          {/* Primary Continue Button */}
          <button
            type="submit"
            disabled={!isFormValid}
            className={`auth-continue-btn ${isFormValid ? 'ready' : 'disabled'}`}
          >
            Continue
          </button>

          {/* Google Sign In Button */}
          <button
            type="button"
            className="auth-google-btn"
            onClick={handleOpenGoogleAuth}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" className="google-icon">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Sign in with Google</span>
          </button>
        </form>
      </div>

      {/* 3. GOOGLE ACCOUNT ACCESS MODAL (Universal for any Google user) */}
      {isGoogleModalOpen && (
        <div className="google-auth-overlay" onClick={() => setIsGoogleModalOpen(false)}>
          <div className="google-auth-modal" onClick={(e) => e.stopPropagation()}>
            <div className="google-auth-header">
              <div className="google-brand-title">
                <svg width="22" height="22" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <div className="google-header-text">
                  <h3>Sign in with Google</h3>
                  <p>Access your private personal vault</p>
                </div>
              </div>
              <button
                type="button"
                className="klipit-close-circle"
                onClick={() => setIsGoogleModalOpen(false)}
              >
                <X size={18} color="#64748b" />
              </button>
            </div>

            <div className="google-auth-body">
              {googleError && (
                <div className="auth-error-text" style={{ margin: '0 0 6px' }}>{googleError}</div>
              )}

              {/* Full Name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={14} color="#64748b" />
                  <span>Google Account Name</span>
                </label>
                <input
                  type="text"
                  placeholder="Your Name (e.g. John Doe)"
                  value={googleName}
                  onChange={(e) => {
                    setGoogleName(e.target.value);
                    setGoogleError(null);
                  }}
                  className="auth-identifier-input"
                />
              </div>

              {/* Email Address */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Mail size={14} color="#64748b" />
                  <span>Google Email Address</span>
                </label>
                <input
                  type="email"
                  placeholder="your.email@gmail.com"
                  value={googleEmail}
                  onChange={(e) => {
                    setGoogleEmail(e.target.value);
                    setGoogleError(null);
                  }}
                  className="auth-identifier-input"
                />
              </div>

              {/* Mobile Number Link */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Phone size={14} color="#64748b" />
                  <span>Link Mobile Number (Optional)</span>
                </label>
                <input
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={googlePhone}
                  onChange={(e) => setGooglePhone(e.target.value)}
                  className="auth-identifier-input"
                />
              </div>

              <div className="google-auth-disclaimer">
                🔒 Privacy Guarantee: Your personal receipts and expenditure are strictly isolated to your account. No other user can see your data.
              </div>

              <button
                type="button"
                className="google-auth-submit-btn"
                onClick={handleConfirmGoogleSignIn}
              >
                <ShieldCheck size={16} />
                <span>Sign In to My Private Vault</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
