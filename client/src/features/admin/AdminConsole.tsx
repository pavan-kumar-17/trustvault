import React, { useState, useEffect } from 'react';
import { UserProfile, AuditEventItem, ChainVerificationResult } from '../../types.js';
import { api } from '../../lib/api.js';
import {
  ShieldCheck,
  ShieldAlert,
  Users,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Power,
  Lock,
  Filter,
  Check
} from 'lucide-react';

interface AdminConsoleProps {
  currentUser: UserProfile | null;
  onRefreshGlobal: () => void;
  onVerificationUpdate?: (result: ChainVerificationResult | null) => void;
}

export const AdminConsole: React.FC<AdminConsoleProps> = ({
  currentUser,
  onRefreshGlobal,
  onVerificationUpdate,
}) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEventItem[]>([]);
  const [totalEvents, setTotalEvents] = useState<number>(0);
  const [verification, setVerification] = useState<ChainVerificationResult | null>(null);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [outcomeFilter, setOutcomeFilter] = useState<string>('');

  useEffect(() => {
    loadAdminData();
  }, [outcomeFilter]);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [usersData, auditData] = await Promise.all([
        api.getAdminUsers(),
        api.getAdminAudit({
          outcome: outcomeFilter || undefined,
          limit: 30,
        }),
      ]);
      setUsers(usersData.users);
      setAuditEvents(auditData.items);
      setTotalEvents(auditData.total);
    } catch (err: any) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleUserStatus = async (user: UserProfile) => {
    if (user.id === currentUser?.id) {
      alert('Administrators cannot deactivate their own account.');
      return;
    }

    const newStatus = !user.isActive;
    const confirmMsg = newStatus
      ? `Activate account for ${user.displayName}?`
      : `Deactivate ${user.displayName}? Their access tokens will immediately be denied on their next request.`;

    if (!confirm(confirmMsg)) return;

    try {
      await api.updateUserStatus(user.id, newStatus, 'Admin console manual toggle');
      loadAdminData();
      onRefreshGlobal();
    } catch (err: any) {
      alert(`Status update failed: ${err.message}`);
    }
  };

  const handleVerifyChain = async () => {
    setVerifying(true);
    try {
      const res = await api.verifyAuditChain();
      setVerification(res);
      if (onVerificationUpdate) {
        onVerificationUpdate(res);
      }
      loadAdminData();
    } catch (err: any) {
      alert(`Verification failed: ${err.message}`);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* 1. Page Title */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Administrator Console</h1>
          <p className="page-subtitle">
            Cryptographic audit chain verification, user directory governance, and global security activity.
          </p>
        </div>
      </div>

      {/* 2. Cryptographic Hash Chain Card */}
      <div
        className="table-card"
        style={{
          padding: '1.5rem',
          background: '#ffffff',
          borderLeft: '4px solid var(--emerald-primary)',
        }}
      >
        <div className="admin-chain-banner">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: 'var(--emerald-light)',
                  color: 'var(--emerald-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShieldCheck size={20} />
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>
                Tamper-Evident Cryptographic Hash Chain
              </h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.35rem', maxWidth: '680px' }}>
              Every security action is cryptographically serialized into a SHA-256 hash chain with database-level triggers preventing mutation or deletion.
            </p>
          </div>

          <div className="admin-chain-actions">
            {verification && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.45rem 0.85rem',
                  borderRadius: '8px',
                  background: verification.valid ? 'var(--emerald-light)' : 'var(--color-rose-light)',
                  border: `1px solid ${verification.valid ? 'var(--emerald-border)' : 'var(--color-rose-border)'}`,
                  color: verification.valid ? 'var(--emerald-dark)' : 'var(--color-rose)',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {verification.valid ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                <span>
                  {verification.valid
                    ? `Chain Verified (${verification.checkedCount} events intact)`
                    : `Tamper Detected at #${verification.errorAtSequence}`}
                </span>
              </div>
            )}

            <button
              className="btn btn-primary"
              onClick={handleVerifyChain}
              disabled={verifying}
            >
              <RefreshCw size={15} className={verifying ? 'spin' : ''} />
              <span>{verifying ? 'Verifying Integrity...' : 'Verify Chain Integrity'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. User Directory Management */}
      <div className="table-card">
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Users size={18} className="text-emerald" />
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
            User Management & Immediate Account Control
          </h3>
        </div>

        <div className="table-wrapper">
          <table className="saas-table">
            <thead>
              <tr>
                <th>Persona / Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Account Status</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === currentUser?.id;
                return (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>
                      {u.displayName} {isSelf && <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>(You)</span>}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{u.email}</td>
                    <td>
                      <span className={`badge badge-role-${u.role === 'administrator' ? 'admin' : u.role === 'document_owner' ? 'owner' : 'viewer'}`}>
                        {u.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${u.isActive ? 'badge-status-active' : 'badge-status-inactive'}`}>
                        {u.isActive ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className={`btn ${u.isActive ? 'btn-danger' : 'btn-primary'}`}
                        style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem' }}
                        disabled={isSelf}
                        onClick={() => handleToggleUserStatus(u)}
                        title={isSelf ? 'Cannot deactivate own admin account' : undefined}
                      >
                        <Power size={13} />
                        <span>{u.isActive ? 'Deactivate' : 'Activate'}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Global Security Activity Feed */}
      <div className="table-card">
        <div className="admin-section-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Activity size={18} className="text-emerald flex-shrink-0" />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
              Global Security Audit Trail ({totalEvents} events)
            </h3>
          </div>

          <div className="select-wrapper">
            <Filter size={14} className="select-icon" />
            <select
              className="custom-select"
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
            >
              <option value="">All Outcomes</option>
              <option value="allowed">Allowed / Success</option>
              <option value="denied">Denied / Failure</option>
            </select>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="saas-table">
            <thead>
              <tr>
                <th>Seq</th>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Outcome</th>
                <th>Reason Code</th>
                <th>Event Hash</th>
              </tr>
            </thead>
            <tbody>
              {auditEvents.map((evt) => (
                <tr key={evt.sequence}>
                  <td className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                    #{evt.sequence}
                  </td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                    {new Date(evt.occurredAt).toLocaleTimeString()}
                  </td>
                  <td style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                    {evt.actorLabelSnapshot || 'Unauthenticated'}
                  </td>
                  <td style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-main)' }}>
                    {evt.action}
                  </td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                    {evt.targetType} {evt.targetId ? `(${evt.targetId.slice(0, 8)}...)` : ''}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        evt.outcome === 'allowed' || evt.outcome === 'success'
                          ? 'badge-status-active'
                          : 'badge-status-inactive'
                      }`}
                    >
                      {evt.outcome}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                    {evt.reasonCode}
                  </td>
                  <td>
                    <code className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }} title={evt.eventHash}>
                      {evt.eventHash.slice(0, 10)}...
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
