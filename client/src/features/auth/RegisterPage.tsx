import React, { useState, useId } from 'react';
import { api } from '../../lib/api.js';
import { UserProfile } from '../../types.js';
import {
  ShieldCheck,
  User,
  Mail,
  Calendar,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Award,
  Check,
  Shield,
  Clock,
  Sparkles,
} from 'lucide-react';
import { TermsModal, PrivacyModal, VerifyEmailModal } from './AuthModals.js';

interface RegisterPageProps {
  onSuccess: (user: UserProfile) => void;
  onNavigateToSignIn: () => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({
  onSuccess,
  onNavigateToSignIn,
}) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [requestedAccountType, setRequestedAccountType] = useState<'viewer' | 'document_owner'>('viewer');
  const [agreeTerms, setAgreeTerms] = useState(false);

  // States
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [registeredSuccess, setRegisteredSuccess] = useState<{
    email: string;
    code?: string;
    isOwnerRequest: boolean;
  } | null>(null);

  // Modals
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);

  // Dynamic Password Validations
  const hasEightChars = password.length >= 8;
  const hasLetterAndNumber = /[A-Za-z]/.test(password) && /\d/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  // Age validation
  const calculateAge = (dob: string): number => {
    if (!dob) return 0;
    const parts = dob.split('-');
    if (parts.length !== 3) return 0;
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    const today = new Date();
    let age = today.getFullYear() - year;
    const m = today.getMonth() + 1;
    const d = today.getDate();
    if (m < month || (m === month && d < day)) {
      age--;
    }
    return age;
  };

  const currentAge = calculateAge(dateOfBirth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setErrorMessage(null);

    // Client-side validations
    if (!fullName.trim()) {
      setErrorMessage('Full Name is required');
      return;
    }
    if (!email.trim()) {
      setErrorMessage('Work Email Address is required');
      return;
    }
    if (!dateOfBirth) {
      setErrorMessage('Date of Birth is required');
      return;
    }
    if (currentAge < 13) {
      setErrorMessage('TrustVault requires users to be at least 13 years old to register.');
      return;
    }
    if (!hasEightChars || !hasLetterAndNumber) {
      setErrorMessage('Password must be at least 8 characters and contain both letters and numbers.');
      return;
    }
    if (!passwordsMatch) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    if (!agreeTerms) {
      setErrorMessage('You must agree to the Terms & Conditions and acknowledge the Privacy Policy.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.register({
        fullName: fullName.trim(),
        email: email.trim(),
        dateOfBirth,
        password,
        confirmPassword,
        requestedAccountType,
        agreeTerms,
      });

      setRegisteredSuccess({
        email: email.trim(),
        code: res.verificationCode,
        isOwnerRequest: requestedAccountType === 'document_owner',
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed. Please check the provided information.');
    } finally {
      setIsLoading(false);
    }
  };

  // 13 years ago date string for datepicker max attribute
  const thirteenYearsAgo = new Date();
  thirteenYearsAgo.setFullYear(thirteenYearsAgo.getFullYear() - 13);
  const maxDobDate = thirteenYearsAgo.toISOString().split('T')[0];

  return (
    <div className="auth-page-shell">
      <div className="auth-card-wrap">
        <div className="auth-card">
          {/* Brand Header */}
          <div className="auth-card-brand">
            <div className="auth-brand-icon-box">
              <ShieldCheck size={22} className="auth-brand-icon" />
            </div>
            <span className="auth-brand-name">TrustVault</span>
          </div>

          {registeredSuccess ? (
            /* Registration Success Confirmation Card */
            <div className="auth-success-screen">
              <div className="auth-success-icon-wrap">
                <CheckCircle2 size={44} className="text-emerald" />
              </div>
              <h2 className="auth-card-heading" style={{ marginTop: '0.75rem', marginBottom: '0.5rem' }}>
                Account Created Successfully
              </h2>
              <p className="auth-card-subheading" style={{ marginBottom: '1.25rem' }}>
                Your corporate identity has been provisioned. To access confidential vault documents, please verify your work email address.
              </p>

              {registeredSuccess.isOwnerRequest && (
                <div className="auth-role-notice-card">
                  <Clock size={20} className="text-amber flex-shrink-0" />
                  <div>
                    <strong>Document Owner Request Submitted:</strong>
                    <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      In adherence to organizational security policies, new accounts operate with <strong>Standard Viewer privileges</strong>. Your request for Document Owner access has been queued for Administrator approval.
                    </p>
                  </div>
                </div>
              )}

              {registeredSuccess.code && (
                <div className="auth-verification-callout">
                  <span className="callout-label">DEMO VERIFICATION CODE:</span>
                  <span className="callout-code font-mono">{registeredSuccess.code}</span>
                  <span className="callout-hint">
                    (In production, this code is securely dispatched to {registeredSuccess.email})
                  </span>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="auth-submit-btn"
                  onClick={() => setIsVerifyOpen(true)}
                >
                  <span>Verify Work Email Now</span>
                  <ArrowRight size={18} />
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onNavigateToSignIn}
                >
                  Return to Sign In
                </button>
              </div>
            </div>
          ) : (
            /* Create Account Form */
            <>
              {/* Heading & Subtitle (from Screenshot 3) */}
              <h1 className="auth-card-heading">Create corporate account</h1>
              <p className="auth-card-subheading">
                New accounts are provisioned with Viewer privileges under organizational security policy.
              </p>

              {/* Error Alert */}
              {errorMessage && (
                <div className="auth-alert error" role="alert">
                  <AlertCircle size={18} className="auth-alert-icon" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                {/* Full Name */}
                <div className="auth-input-group">
                  <label htmlFor="reg-fullname" className="auth-input-label">
                    Full Name *
                  </label>
                  <div className="auth-input-wrapper">
                    <User size={18} className="auth-input-icon" />
                    <input
                      id="reg-fullname"
                      type="text"
                      className="auth-input"
                      placeholder="e.g. Alex Mercer"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      autoComplete="name"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {/* Work Email Address */}
                <div className="auth-input-group">
                  <label htmlFor="reg-email" className="auth-input-label">
                    Work Email Address *
                  </label>
                  <div className="auth-input-wrapper">
                    <Mail size={18} className="auth-input-icon" />
                    <input
                      id="reg-email"
                      type="email"
                      className="auth-input"
                      placeholder="name@trustvault.internal"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                {/* Date of Birth */}
                <div className="auth-input-group">
                  <div className="auth-label-row">
                    <label htmlFor="reg-dob" className="auth-input-label">
                      Date of Birth *
                    </label>
                    <span className="auth-label-hint">Minimum age: 13</span>
                  </div>
                  <div className="auth-input-wrapper">
                    <Calendar size={18} className="auth-input-icon" />
                    <input
                      id="reg-dob"
                      type="date"
                      className="auth-input"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      max={maxDobDate}
                      required
                      disabled={isLoading}
                    />
                  </div>
                  <span className="auth-field-helper">
                    TrustVault requires users to be at least 13 years old to register.
                  </span>
                </div>

                {/* Password */}
                <div className="auth-input-group">
                  <div className="auth-label-row">
                    <label htmlFor="reg-password" className="auth-input-label">
                      Password *
                    </label>
                    <span className="auth-label-hint">Min 8 chars (letters & numbers)</span>
                  </div>
                  <div className="auth-input-wrapper">
                    <Lock size={18} className="auth-input-icon" />
                    <input
                      id="reg-password"
                      type={showPassword ? 'text' : 'password'}
                      className="auth-input"
                      placeholder="••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      className="auth-input-toggle-btn"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div className="auth-input-group">
                  <label htmlFor="reg-confirm-password" className="auth-input-label">
                    Confirm Password *
                  </label>
                  <div className="auth-input-wrapper">
                    <Lock size={18} className="auth-input-icon" />
                    <input
                      id="reg-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      className="auth-input"
                      placeholder="Re-enter your password..."
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      className="auth-input-toggle-btn"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Password Requirements Box (from Screenshot 2) */}
                <div className="auth-requirements-box">
                  <span className="auth-requirements-title">PASSWORD REQUIREMENTS:</span>
                  <div className="auth-requirements-list">
                    <div className={`req-item ${hasEightChars ? 'met' : ''}`}>
                      <span className="req-bullet">{hasEightChars ? '✓' : '•'}</span>
                      <span>8+ characters</span>
                    </div>
                    <div className={`req-item ${hasLetterAndNumber ? 'met' : ''}`}>
                      <span className="req-bullet">{hasLetterAndNumber ? '✓' : '•'}</span>
                      <span>Letters & numbers</span>
                    </div>
                    <div className={`req-item ${passwordsMatch ? 'met' : ''}`}>
                      <span className="req-bullet">{passwordsMatch ? '✓' : '•'}</span>
                      <span>Passwords match</span>
                    </div>
                  </div>
                </div>

                {/* Requested Account Type (from Screenshot 2) */}
                <div className="auth-input-group" style={{ marginTop: '1.25rem' }}>
                  <label className="auth-input-label">Requested Account Type *</label>

                  {/* Viewer Card */}
                  <div
                    className={`auth-account-type-card ${
                      requestedAccountType === 'viewer' ? 'selected' : ''
                    }`}
                    onClick={() => setRequestedAccountType('viewer')}
                    role="radio"
                    aria-checked={requestedAccountType === 'viewer'}
                    tabIndex={0}
                  >
                    <div className="account-type-header">
                      <div className="account-type-radio-title">
                        <span className={`custom-radio ${requestedAccountType === 'viewer' ? 'checked' : ''}`} />
                        <span className="account-type-name">Viewer</span>
                      </div>
                      <span className="badge-standard-access">Standard Access</span>
                    </div>
                    <p className="account-type-desc">
                      Read documents shared with you. Ready upon email verification.
                    </p>
                  </div>

                  {/* Document Owner Card */}
                  <div
                    className={`auth-account-type-card ${
                      requestedAccountType === 'document_owner' ? 'selected' : ''
                    }`}
                    onClick={() => setRequestedAccountType('document_owner')}
                    role="radio"
                    aria-checked={requestedAccountType === 'document_owner'}
                    tabIndex={0}
                  >
                    <div className="account-type-header">
                      <div className="account-type-radio-title">
                        <span className={`custom-radio ${requestedAccountType === 'document_owner' ? 'checked' : ''}`} />
                        <span className="account-type-name">Document Owner</span>
                      </div>
                      <span className="badge-requires-approval">Requires Approval</span>
                    </div>
                    <p className="account-type-desc">
                      Upload confidential files and manage collaborator ACLs. Requires Admin approval.
                    </p>
                  </div>
                </div>

                {/* Agreement Checkbox (from Screenshot 2) */}
                <div className="auth-terms-checkbox-wrap">
                  <input
                    type="checkbox"
                    id="reg-terms-check"
                    className="auth-checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    required
                  />
                  <label htmlFor="reg-terms-check" className="auth-checkbox-label">
                    I agree to the{' '}
                    <button
                      type="button"
                      className="auth-inline-link"
                      onClick={(e) => {
                        e.preventDefault();
                        setIsTermsOpen(true);
                      }}
                    >
                      Terms & Conditions
                    </button>{' '}
                    and acknowledge the{' '}
                    <button
                      type="button"
                      className="auth-inline-link"
                      onClick={(e) => {
                        e.preventDefault();
                        setIsPrivacyOpen(true);
                      }}
                    >
                      Privacy Policy
                    </button>
                    . *
                  </label>
                </div>

                {/* Primary Blue Button */}
                <button
                  type="submit"
                  className="auth-submit-btn"
                  disabled={isLoading}
                  id="btn-create-account"
                >
                  {isLoading ? (
                    <>
                      <span className="auth-btn-spinner" />
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <>
                      <span>Create Account</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>

                {/* Footer Link */}
                <div className="auth-switch-link-row">
                  <span>Already have an account? </span>
                  <button
                    type="button"
                    className="auth-link-bold"
                    onClick={onNavigateToSignIn}
                  >
                    Sign in
                  </button>
                </div>
              </form>
            </>
          )}
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

      {/* Modals */}
      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
      <PrivacyModal isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} />
      <VerifyEmailModal
        isOpen={isVerifyOpen}
        onClose={() => setIsVerifyOpen(false)}
        defaultEmail={registeredSuccess?.email || email}
        onVerified={(_token, user) => onSuccess(user)}
      />
    </div>
  );
};
