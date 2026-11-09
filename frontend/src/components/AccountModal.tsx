import React, { useState } from 'react';
import { User, Phone, LogOut, X, Edit2, Check, ShieldCheck, ArrowRight, Mail } from 'lucide-react';

export interface UserAccount {
  name: string;
  phoneNumber?: string;
  email?: string;
  identifier?: string;
  provider?: 'phone' | 'email' | 'google' | 'apple';
  isSignedIn: boolean;
}

interface AccountModalProps {
  user: UserAccount;
  onClose: () => void;
  onUpdateUser: (updated: Partial<UserAccount>) => void;
  onSignOut: () => void;
  onSignIn: (name: string, identifier: string) => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  user,
  onClose,
  onUpdateUser,
  onSignOut,
  onSignIn,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [nameInput, setNameInput] = useState(user.name);
  const [phoneInput, setPhoneInput] = useState<string>(user.phoneNumber || '');
  const [emailInput, setEmailInput] = useState<string>(user.email || '');
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  // Sign in state when signed out
  const [loginName, setLoginName] = useState('');
  const [loginPhone, setLoginPhone] = useState('');

  const handleSave = () => {
    if (!nameInput.trim()) return;
    onUpdateUser({
      name: nameInput.trim(),
      phoneNumber: phoneInput.trim() || undefined,
      email: emailInput.trim() || undefined,
    });
    setIsEditing(false);
  };

  const handleConfirmSignOut = () => {
    onSignOut();
    setShowSignOutConfirm(false);
    onClose();
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginName.trim()) return;
    onSignIn(loginName.trim(), loginPhone.trim());
  };

  return (
    <div className="account-drawer-overlay" onClick={onClose}>
      <div className="account-drawer-stage" onClick={(e) => e.stopPropagation()}>
        <div className="account-side-bar">
          {/* Header */}
          <div className="account-drawer-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="account-header-icon-wrap">
                <User size={18} color="#16a34a" />
              </div>
              <h2 className="klipit-sheet-title">Your Account</h2>
            </div>
            <button className="klipit-close-circle" onClick={onClose} title="Close">
              <X size={18} color="#64748b" />
            </button>
          </div>

          <div className="account-drawer-body">
          {user.isSignedIn ? (
            <>
              {/* Profile Card Header */}
              <div className="account-profile-hero">
                <div className="account-avatar-circle">
                  <span>{user.name.charAt(0).toUpperCase()}</span>
                </div>
                <div className="account-profile-info">
                  <div className="account-name-row">
                    <span className="account-user-name">{user.name}</span>
                    <span className="account-verified-badge">
                      <ShieldCheck size={14} color="#16a34a" />
                      <span>Verified</span>
                    </span>
                  </div>
                  <div className="account-user-phone">
                    {user.email || user.phoneNumber || user.identifier || '+91 98765 43210'}
                  </div>
                </div>
                {!isEditing && (
                  <button
                    className="account-edit-trigger"
                    onClick={() => {
                      setNameInput(user.name);
                      setPhoneInput(user.phoneNumber || '+91 98765 43210');
                      setEmailInput(user.email || '');
                      setIsEditing(true);
                    }}
                    title="Edit profile"
                  >
                    <Edit2 size={16} color="#059669" />
                  </button>
                )}
              </div>

              {/* Edit Details Form (inline) */}
              {isEditing ? (
                <div className="account-edit-form">
                  <div className="account-input-group">
                    <label className="account-input-label">
                      <User size={15} color="#64748b" />
                      <span>Full Name</span>
                    </label>
                    <input
                      type="text"
                      className="account-input-field"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Enter your full name"
                      autoFocus
                    />
                  </div>

                  <div className="account-input-group">
                    <label className="account-input-label">
                      <Phone size={15} color="#64748b" />
                      <span>Mobile Number</span>
                    </label>
                    <input
                      type="tel"
                      className="account-input-field"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      placeholder="+91 98765 43210"
                    />
                  </div>

                  <div className="account-input-group">
                    <label className="account-input-label">
                      <Mail size={15} color="#64748b" />
                      <span>Email Address</span>
                    </label>
                    <input
                      type="email"
                      className="account-input-field"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="user@gmail.com"
                    />
                  </div>

                  <div className="account-form-actions">
                    <button className="btn-primary-sm" onClick={handleSave}>
                      <Check size={16} />
                      <span>Save Changes</span>
                    </button>
                    <button className="btn-secondary-sm" onClick={() => setIsEditing(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* Account Details Display */
                <div className="account-details-list">
                  <div className="account-detail-row">
                    <div className="account-detail-label">
                      <User size={16} color="#64748b" />
                      <span>Name</span>
                    </div>
                    <div className="account-detail-value">{user.name}</div>
                  </div>

                  <div className="account-detail-row">
                    <div className="account-detail-label">
                      <Phone size={16} color="#64748b" />
                      <span>Mobile Number</span>
                    </div>
                    <div className="account-detail-value">
                      {user.phoneNumber || 'Not provided'}
                    </div>
                  </div>

                  <div className="account-detail-row">
                    <div className="account-detail-label">
                      <Mail size={16} color="#64748b" />
                      <span>Email ID</span>
                    </div>
                    <div className="account-detail-value">
                      {user.email || 'Not provided'}
                    </div>
                  </div>

                  <div className="account-detail-row">
                    <div className="account-detail-label">
                      <ShieldCheck size={16} color="#64748b" />
                      <span>Sign-In Method</span>
                    </div>
                    <div className="account-detail-value text-green" style={{ fontWeight: 700 }}>
                      {user.provider === 'google' ? 'GOOGLE SSO' : (user.provider ? `${user.provider.toUpperCase()} SSO` : 'UNIVERSAL ID')}
                    </div>
                  </div>
                </div>
              )}

              {/* Sign Out Section */}
              <div className="account-signout-section">
                {showSignOutConfirm ? (
                  <div className="account-signout-confirm-box">
                    <p style={{ fontWeight: 600, color: '#0f172a', marginBottom: '8px' }}>
                      Are you sure you want to sign out?
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn-danger-sm"
                        style={{ flex: 1 }}
                        onClick={handleConfirmSignOut}
                      >
                        Yes, Sign Out
                      </button>
                      <button
                        className="btn-secondary-sm"
                        style={{ flex: 1 }}
                        onClick={() => setShowSignOutConfirm(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="account-signout-btn"
                    onClick={() => setShowSignOutConfirm(true)}
                  >
                    <LogOut size={18} />
                    <span>Sign Out</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            /* Signed Out View / Quick Sign In */
            <div className="account-signed-out-view">
              <div className="account-avatar-placeholder">
                <User size={36} color="#94a3b8" />
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: '8px 0 4px', color: '#0f172a' }}>
                You are currently signed out
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.25rem', textAlign: 'center' }}>
                Sign in with your name and phone number to sync your receipts and manage your account.
              </p>

              <form onSubmit={handleLoginSubmit} className="account-edit-form" style={{ width: '100%' }}>
                <div className="account-input-group">
                  <label className="account-input-label">
                    <User size={15} color="#64748b" />
                    <span>Your Name</span>
                  </label>
                  <input
                    type="text"
                    className="account-input-field"
                    value={loginName}
                    onChange={(e) => setLoginName(e.target.value)}
                    placeholder="e.g. Full Name"
                    required
                  />
                </div>

                <div className="account-input-group">
                  <label className="account-input-label">
                    <Phone size={15} color="#64748b" />
                    <span>Phone Number</span>
                  </label>
                  <input
                    type="tel"
                    className="account-input-field"
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value)}
                    placeholder="e.g. +91 98765 43210"
                    required
                  />
                </div>

                <button type="submit" className="btn-read-large" style={{ width: '100%', justifyContent: 'center', marginTop: '0.75rem' }}>
                  <span>Sign In</span>
                  <ArrowRight size={18} />
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
);
};

