import React, { useState } from 'react';
import { api } from '../../lib/api.js';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Mail,
  KeyRound,
  X,
  FileText,
  Lock,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultEmail?: string;
  onSuccessNotification?: (msg: string) => void;
}

export const ForgotPasswordModal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  defaultEmail = '',
  onSuccessNotification,
}) => {
  const [email, setEmail] = useState(defaultEmail);
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRequestToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.forgotPassword({ email });
      if (res.resetToken) {
        setResetToken(res.resetToken);
        setStep('reset');
        setSuccess('Password reset token generated. Please enter your new password below.');
      } else {
        setSuccess(res.message);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to request password reset');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    setLoading(true);
    try {
      const res = await api.resetPassword({ token: resetToken, newPassword });
      setSuccess(res.message);
      onSuccessNotification?.('Password reset successfully! Please sign in with your new password.');
      setTimeout(() => {
        onClose();
        setStep('request');
        setResetToken('');
        setNewPassword('');
        setConfirmPassword('');
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-box">
            <div className="modal-icon-badge" style={{ background: 'var(--color-blue-light)', color: 'var(--color-blue)' }}>
              <KeyRound size={20} />
            </div>
            <div>
              <h3 className="modal-title">Reset Vault Password</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                Zero-Trust verified credential recovery
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="auth-alert error">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="auth-alert success">
              <CheckCircle2 size={18} />
              <span>{success}</span>
            </div>
          )}

          {step === 'request' ? (
            <form onSubmit={handleRequestToken}>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                Enter the work email address associated with your TrustVault account. A cryptographic reset token will be issued.
              </p>

              <div className="auth-input-group">
                <label className="auth-input-label">Work Email Address *</label>
                <div className="auth-input-wrapper">
                  <Mail size={18} className="auth-input-icon" />
                  <input
                    type="email"
                    className="auth-input"
                    placeholder="name@trustvault.internal"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="auth-submit-btn" style={{ width: 'auto', padding: '0 1.5rem' }} disabled={loading}>
                  {loading ? 'Sending...' : 'Issue Reset Token'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleResetPassword}>
              <div className="auth-input-group">
                <label className="auth-input-label">Reset Token *</label>
                <div className="auth-input-wrapper">
                  <KeyRound size={18} className="auth-input-icon" />
                  <input
                    type="text"
                    className="auth-input"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="auth-input-group">
                <label className="auth-input-label">New Password *</label>
                <div className="auth-input-wrapper">
                  <Lock size={18} className="auth-input-icon" />
                  <input
                    type="password"
                    className="auth-input"
                    placeholder="Min 8 characters (letters & numbers)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="auth-input-group">
                <label className="auth-input-label">Confirm New Password *</label>
                <div className="auth-input-wrapper">
                  <Lock size={18} className="auth-input-icon" />
                  <input
                    type="password"
                    className="auth-input"
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setStep('request')}>
                  Back
                </button>
                <button type="submit" className="auth-submit-btn" style={{ width: 'auto', padding: '0 1.5rem' }} disabled={loading}>
                  {loading ? 'Updating...' : 'Set New Password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export const VerifyEmailModal: React.FC<
  ModalProps & {
    onVerified?: (token: string, user: any) => void;
  }
> = ({ isOpen, onClose, defaultEmail = '', onVerified }) => {
  const [email, setEmail] = useState(defaultEmail);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.verifyEmail({ email, code });
      setSuccess('Email successfully verified! Opening your secure vault...');
      if (res.token && res.user && onVerified) {
        setTimeout(() => {
          onVerified(res.token, res.user);
          onClose();
        }, 1000);
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please check the code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      setError('Please provide your work email address to resend');
      return;
    }
    setError(null);
    setResending(true);
    try {
      const res = await api.resendVerification({ email });
      setSuccess(`Verification code dispatched! ${res.code ? `Code: ${res.code}` : ''}`);
      if (res.code) {
        setCode(res.code);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-box">
            <div className="modal-icon-badge" style={{ background: 'var(--color-blue-light)', color: 'var(--color-blue)' }}>
              <Mail size={20} />
            </div>
            <div>
              <h3 className="modal-title">Verify Work Email</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                Confirm identity to activate corporate vault access
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="auth-alert error">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="auth-alert success">
              <CheckCircle2 size={18} />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleVerify}>
            <div className="auth-input-group">
              <label className="auth-input-label">Work Email Address *</label>
              <div className="auth-input-wrapper">
                <Mail size={18} className="auth-input-icon" />
                <input
                  type="email"
                  className="auth-input"
                  placeholder="name@trustvault.internal"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="auth-input-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <label className="auth-input-label" style={{ marginBottom: 0 }}>
                  6-Digit Verification Code *
                </label>
                <button
                  type="button"
                  className="auth-text-btn"
                  onClick={handleResend}
                  disabled={resending}
                  style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <RefreshCw size={13} className={resending ? 'spin-icon' : ''} />
                  {resending ? 'Resending...' : 'Resend Code'}
                </button>
              </div>
              <div className="auth-input-wrapper">
                <KeyRound size={18} className="auth-input-icon" />
                <input
                  type="text"
                  className="auth-input font-mono"
                  placeholder="e.g. 849201"
                  maxLength={10}
                  value={code}
                  onChange={(e) => setCode(e.target.value.trim())}
                  required
                  autoFocus
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="auth-submit-btn" style={{ width: 'auto', padding: '0 1.5rem' }} disabled={loading}>
                {loading ? 'Verifying...' : 'Verify Email & Sign In'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export const TermsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog auth-modal large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-box">
            <div className="modal-icon-badge" style={{ background: 'var(--color-blue-light)', color: 'var(--color-blue)' }}>
              <FileText size={20} />
            </div>
            <div>
              <h3 className="modal-title">Terms & Conditions</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                TrustVault Enterprise Document Management Policy
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body policy-content" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <h4>1. Acceptance of Terms</h4>
          <p>
            By accessing or using the TrustVault zero-trust confidential document platform, you agree to comply with all corporate information governance standards and organizational security policies.
          </p>

          <h4>2. Minimum Age & Eligibility</h4>
          <p>
            TrustVault requires authorized enterprise users to be at least 13 years of age. Registration by unauthorized individuals or minors under 13 is strictly prohibited.
          </p>

          <h4>3. Access Levels & Privileges</h4>
          <p>
            New registrations default to Viewer privileges under the principle of least privilege. Document Owner privileges require explicit administrator approval. Unauthorized privilege escalation attempts are logged in the cryptographic audit trail.
          </p>

          <h4>4. Immutable Audit Logging</h4>
          <p>
            All document reads, downloads, grant modifications, authentication events, and denied access attempts are permanently recorded to an append-only, tamper-evident SHA-256 Merkle hash chain.
          </p>

          <h4>5. Data Confidentiality & Revocation</h4>
          <p>
            Document access grants are dynamic and subject to immediate revocation by document owners or system administrators. Cached credentials and active sessions are re-validated in real time against live authorization rules.
          </p>
        </div>

        <div className="modal-footer" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-subtle)' }}>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
};

export const PrivacyModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog auth-modal large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-box">
            <div className="modal-icon-badge" style={{ background: 'var(--color-blue-light)', color: 'var(--color-blue)' }}>
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="modal-title">Privacy Policy</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                Zero-Trust Data Protection & SOC2 Compliance
              </p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body policy-content" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <h4>1. Information Collection & Use</h4>
          <p>
            TrustVault collects corporate identity details including full name, verified work email, date of birth (for age compliance verification), and role metadata solely for access control and organizational compliance. Plaintext passwords are never stored or logged.
          </p>

          <h4>2. End-to-End Encryption</h4>
          <p>
            All files uploaded to TrustVault are protected using cryptographic hashing (SHA-256) and stored in isolated, private storage buckets without public access URLs. All requests require TLS 1.3 encryption in transit.
          </p>

          <h4>3. Audit Provenance</h4>
          <p>
            Security audit logs store actor identities, IP hashes, correlation request IDs, and timestamp hashes. In accordance with SOC2 and ISO 27001 readiness, audit records are append-only and cannot be altered or purged.
          </p>

          <h4>4. Data Sharing & Third Parties</h4>
          <p>
            Your corporate documents and identity data are strictly confidential and are never shared with or sold to third-party commercial vendors or advertising entities.
          </p>
        </div>

        <div className="modal-footer" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-subtle)' }}>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
