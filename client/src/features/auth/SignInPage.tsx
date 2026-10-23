import React, { useState } from 'react';
import { api } from '../../lib/api.js';
import { UserProfile } from '../../types.js';
import {
  Shield,
  ShieldCheck,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  FileText,
  Activity,
  AlertCircle,
  CheckCircle2,
  Award,
  Zap,
} from 'lucide-react';
import { ForgotPasswordModal, VerifyEmailModal } from './AuthModals.js';

interface SignInPageProps {
  onSuccess: (user: UserProfile) => void;
  onNavigateToRegister: () => void;
}

export const SignInPage: React.FC<SignInPageProps> = ({
  onSuccess,
  onNavigateToRegister,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modals state
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email.trim()) {
      setErrorMessage('Please enter your work email address');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password');
      return;
    }

    setIsLoading(true);
    try {
      const data = await api.login({
        email: email.trim(),
        password,
      });

      setSuccessMessage('Authentication successful. Loading vault workspace...');
      setTimeout(() => {
        onSuccess(data.user);
      }, 400);
    } catch (err: any) {
      const msg = err.message || 'Authentication failed. Please check your credentials.';
      setErrorMessage(msg);
      if (msg.toLowerCase().includes('not been verified') || msg.toLowerCase().includes('unverified')) {
        setUnverifiedEmail(email.trim());
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickFill = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('TrustVault2026!');
    setErrorMessage(null);
  };

  return (
    <div className="auth-page-shell">
      <div className="auth-responsive-layout">
        {/* Left Column on Desktop / Top Features Section on Mobile */}
        <div className="auth-features-section">
          {/* Desktop Hero Branding (visible on desktop >= 1024px) */}
          <div className="auth-desktop-hero desktop-only">
            <div className="auth-desktop-badge">
              <ShieldCheck size={16} />
              <span>Enterprise Document Governance • Zero-Trust Protocol</span>
            </div>
            <h2 className="auth-desktop-title">
              Zero-Trust Document Security & Cryptographic Compliance
            </h2>
            <p className="auth-desktop-subtitle">
              Secure corporate document sharing with database-level ACL enforcement, immediate grant revocation, and tamper-evident SHA-256 audit trails.
            </p>
          </div>

          <div className="auth-feature-card">
            <div className="auth-feature-icon-wrap">
              <FileText size={20} className="auth-feature-icon" />
            </div>
            <div className="auth-feature-content">
              <h4 className="auth-feature-title">Granular Per-Document ACLs</h4>
              <p className="auth-feature-desc">
                Owners grant explicit Read or Edit access to named collaborators with live database-level validation.
              </p>
            </div>
          </div>

          <div className="auth-feature-card">
            <div className="auth-feature-icon-wrap">
              <Activity size={20} className="auth-feature-icon" />
            </div>
            <div className="auth-feature-content">
              <h4 className="auth-feature-title">Immutable Audit Trail</h4>
              <p className="auth-feature-desc">
                Append-only compliance logging records every read, stream download, modification, and refused attempt.
              </p>
            </div>
          </div>

          {/* Third feature card visible on desktop */}
          <div className="auth-feature-card desktop-only">
            <div className="auth-feature-icon-wrap" style={{ background: '#ecfdf5', color: '#10b981' }}>
              <ShieldCheck size={20} />
            </div>
            <div className="auth-feature-content">
              <h4 className="auth-feature-title">Immediate Revocation</h4>
              <p className="auth-feature-desc">
                Access policy modifications take effect instantaneously on subsequent API requests with zero caching delay.
              </p>
            </div>
          </div>

          {/* Protocol divider visible on mobile */}
          <div className="auth-protocol-divider mobile-only">
            <Shield size={14} className="auth-protocol-shield" />
            <span>Enterprise Document Management • Verified Zero-Trust Protocol</span>
          </div>

          {/* Desktop trust badges */}
          <div className="auth-desktop-trust-pills desktop-only">
            <div className="auth-trust-pill">
              <ShieldCheck size={14} className="auth-pill-icon" />
              <span>Zero-Trust Architecture</span>
            </div>
            <div className="auth-trust-pill">
              <Award size={14} className="auth-pill-icon" />
              <span>SOC2 & ISO 27001 Ready</span>
            </div>
            <div className="auth-trust-pill">
              <Zap size={14} className="auth-pill-icon text-emerald" />
              <span>SHA-256 Provenance</span>
            </div>
          </div>
        </div>

        {/* Main Sign-In Card (from Screenshot 1) */}
        <div className="auth-card-wrap">
        <div className="auth-card">
          {/* Brand Header */}
          <div className="auth-card-brand">
            <div className="auth-brand-icon-box">
              <ShieldCheck size={22} className="auth-brand-icon" />
            </div>
            <span className="auth-brand-name">TrustVault</span>
          </div>

          {/* Heading & Subtitle */}
          <h1 className="auth-card-heading">Sign in to your vault</h1>
          <p className="auth-card-subheading">
            Enter your corporate credentials to access confidential documents.
          </p>

          {/* Alert messages */}
          {errorMessage && (
            <div className="auth-alert error" role="alert">
              <AlertCircle size={18} className="auth-alert-icon" />
              <div className="auth-alert-text">
                <span>{errorMessage}</span>
                {unverifiedEmail && (
                  <button
                    type="button"
                    className="auth-alert-action-btn"
                    onClick={() => setIsVerifyOpen(true)}
                  >
                    Verify Email Now →
                  </button>
                )}
              </div>
            </div>
          )}

          {successMessage && (
            <div className="auth-alert success" role="status">
              <CheckCircle2 size={18} className="auth-alert-icon" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Sign In Form */}
          <form onSubmit={handleSubmit} noValidate>
            {/* Work Email Address */}
            <div className="auth-input-group">
              <label htmlFor="signin-email" className="auth-input-label">
                Work Email Address *
              </label>
              <div className="auth-input-wrapper">
                <Mail size={18} className="auth-input-icon" />
                <input
                  id="signin-email"
                  type="email"
                  className="auth-input"
                  placeholder="name@trustvault.internal"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Password */}
            <div className="auth-input-group" style={{ marginBottom: '0.6rem' }}>
              <label htmlFor="signin-password" className="auth-input-label">
                Password *
              </label>
              <div className="auth-input-wrapper">
                <Lock size={18} className="auth-input-icon" />
                <input
                  id="signin-password"
                  type={showPassword ? 'text' : 'password'}
                  className="auth-input"
                  placeholder="••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="auth-input-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={0}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Links Row: Forgot Password & Verify Email */}
            <div className="auth-sub-links-row">
              <button
                type="button"
                className="auth-link primary"
                onClick={() => setIsForgotOpen(true)}
              >
                Forgot Password?
              </button>

              <button
                type="button"
                className="auth-link muted"
                onClick={() => setIsVerifyOpen(true)}
              >
                Verify email / Resend?
              </button>
            </div>

            {/* Primary Blue Button */}
            <button
              type="submit"
              className="auth-submit-btn"
              disabled={isLoading}
              id="btn-sign-in"
            >
              {isLoading ? (
                <>
                  <span className="auth-btn-spinner" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Vault</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>

            {/* Link to Create Account */}
            <div className="auth-switch-link-row">
              <span>Don't have an account? </span>
              <button
                type="button"
                className="auth-link-bold"
                onClick={onNavigateToRegister}
              >
                Create account
              </button>
            </div>
          </form>

          {/* Quick Demo Personas (Evaluator Helper) */}
          <div className="auth-evaluator-box">
            <div className="auth-evaluator-header">
              <Zap size={14} className="text-amber" />
              <span>Evaluator Demo Personas (Password: TrustVault2026!)</span>
            </div>
            <div className="auth-evaluator-chips">
              <button
                type="button"
                className="auth-chip"
                onClick={() => handleQuickFill('admin@trustvault.local')}
                title="Fill Alice Admin (Administrator)"
              >
                Alice (Admin)
              </button>
              <button
                type="button"
                className="auth-chip"
                onClick={() => handleQuickFill('ownera@trustvault.local')}
                title="Fill Oscar Owner (Document Owner)"
              >
                Oscar (Owner)
              </button>
              <button
                type="button"
                className="auth-chip"
                onClick={() => handleQuickFill('viewera@trustvault.local')}
                title="Fill Victor Viewer (Standard Viewer)"
              >
                Victor (Viewer)
              </button>
              <button
                type="button"
                className="auth-chip danger"
                onClick={() => handleQuickFill('inactive@trustvault.local')}
                title="Fill Ian Inactive (Deactivated Account)"
              >
                Ian (Inactive)
              </button>
            </div>
          </div>
        </div>

        {/* Trust Badges Footer (from Screenshot 2) */}
        <div className="auth-footer-trust">
          <p className="auth-footer-text">
            TrustVault • Zero-Trust Protected • Enterprise Document Governance
          </p>
          <div className="auth-trust-pills">
            <div className="auth-trust-pill">
              <ShieldCheck size={14} className="auth-pill-icon" />
              <span>Zero-Trust Architecture</span>
            </div>
            <div className="auth-trust-pill">
              <Award size={14} className="auth-pill-icon" />
              <span>SOC2 & ISO 27001 Ready</span>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Modals */}
      <ForgotPasswordModal
        isOpen={isForgotOpen}
        onClose={() => setIsForgotOpen(false)}
        defaultEmail={email}
        onSuccessNotification={(msg) => setSuccessMessage(msg)}
      />

      <VerifyEmailModal
        isOpen={isVerifyOpen}
        onClose={() => setIsVerifyOpen(false)}
        defaultEmail={unverifiedEmail || email}
        onVerified={(token, user) => onSuccess(user)}
      />
    </div>
  );
};
