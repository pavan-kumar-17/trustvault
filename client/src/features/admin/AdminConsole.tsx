import React, { useState, useEffect } from 'react';
import { UserProfile, AuditEventItem, ChainVerificationResult } from '../../types.js';
import { api } from '../../lib/api.js';
import {
  ShieldCheck,
  ShieldAlert,
  Users,
  Activity,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Power,
  Lock,
} from 'lucide-react';

interface AdminConsoleProps {
  currentUser: UserProfile | null;
  onRefreshGlobal: () => void;
}

export const AdminConsole: React.FC<AdminConsoleProps> = ({ currentUser, onRefreshGlobal }) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEventItem[]>([]);
  const [totalEvents, setTotalEvents] = useState<number>(0);
  const [verification, setVerification] = useState<ChainVerificationResult | null>(null);
  const [verifying, setVerifying] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionFilter, setActionFilter] = useState<string>('');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('');

  useEffect(() => {
    loadAdminData();
  }, [actionFilter, outcomeFilter]);

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [usersData, auditData] = await Promise.all([
        api.getAdminUsers(),
        api.getAdminAudit({
          action: actionFilter || undefined,
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
      loadAdminData(); // Refresh audit to include the verification audit entry
    } catch (err: any) {
      alert(`Verification failed: ${err.message}`);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Cryptographic Chain Integrity Card */}
      <div className="glass-panel" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.8), rgba(30, 27, 75, 0.5))', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #a855f7, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldCheck size={20} color="#fff" />
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Tamper-Evident Audit Hash Chain</h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              Every security action is linked via a serialized SHA-256 cryptographic chain. The runtime role is prohibited from mutating or deleting audit records.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {verification && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                background: verification.valid ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.2)',
                border: `1px solid ${verification.valid ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.4)'}`,
                color: verification.valid ? '#34d399' : '#fb7185'
              }}>
                {verification.valid ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                  {verification.valid ? `Chain Verified (${verification.checkedCount} events unbroken)` : `Tamper Detected at #${verification.errorAtSequence}`}
                </span>
              </div>
            )}

            <button
              className="btn btn-primary"
              onClick={handleVerifyChain}
              disabled={verifying}
              style={{ background: 'linear-gradient(135deg, #6366f1, #06b6d4)' }}
            >
              <RefreshCw size={16} className={verifying ? 'spin' : ''} />
              {verifying ? 'Verifying Chain...' : 'Verify Chain Integrity'}
            </button>
          </div>
        </div>
      </div>

      {/* User Directory Management */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
          <Users size={20} color="#818cf8" />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>User Management & Immediate Account Control</h3>
        </div>

        <div className="table-wrapper">
          <table className="custom-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                <th>Account Status</th>
                <th>Created</th>
                <th style={{ textAlign: 'right' }}>Status Toggle</th>
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
                      <span className={`badge badge-${u.role === 'administrator' ? 'admin' : u.role === 'document_owner' ? 'owner' : 'viewer'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${u.isActive ? 'active' : 'inactive'}`}>
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
                        {u.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Global Security Activity Feed */}
      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Activity size={20} color="#06b6d4" />
            <h3 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Global Security Audit Trail ({totalEvents} events)</h3>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <select
              className="input-field"
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
              style={{ width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
            >
              <option value="">All Outcomes</option>
              <option value="allowed">Allowed / Success</option>
              <option value="denied">Denied / Failure</option>
            </select>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="custom-table">
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
                  <td style={{ fontWeight: 600, fontSize: '0.8rem', color: '#cbd5e1' }}>
                    {evt.action}
                  </td>
                  <td style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                    {evt.targetType} {evt.targetId ? `(${evt.targetId.slice(0, 8)}...)` : ''}
                  </td>
                  <td>
                    <span className={`badge badge-${evt.outcome === 'allowed' || evt.outcome === 'success' ? 'active' : 'inactive'}`}>
                      {evt.outcome}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                    {evt.reasonCode}
                  </td>
                  <td>
                    <code className="font-mono" style={{ fontSize: '0.7rem', color: '#64748b' }} title={evt.eventHash}>
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
