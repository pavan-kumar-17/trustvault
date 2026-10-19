import React from 'react';
import { UserProfile, FixturePersona } from '../types.js';
import { Shield, ShieldAlert, User, ShieldCheck, Users, Database } from 'lucide-react';

interface NavbarProps {
  currentUser: UserProfile | null;
  fixtures: FixturePersona[];
  onSwitchUser: (userId: string) => void;
  activeView: 'workspace' | 'admin';
  setActiveView: (view: 'workspace' | 'admin') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  fixtures,
  onSwitchUser,
  activeView,
  setActiveView,
}) => {
  return (
    <header className="glass-panel" style={{ margin: '1rem 2rem', padding: '0.85rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 10 }}>
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }} onClick={() => setActiveView('workspace')}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 15px rgba(99, 102, 241, 0.4)'
        }}>
          <Shield size={20} color="#ffffff" />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.02em', background: 'linear-gradient(90deg, #fff, #cbd5e1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              TrustVault
            </span>
            <span style={{ fontSize: '0.65rem', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', padding: '0.15rem 0.45rem', borderRadius: '4px', fontWeight: 600 }}>
              v2.0 MVP
            </span>
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', margin: 0 }}>Company-Only Zero-Trust Document Sharing</p>
        </div>
      </div>

      {/* Navigation tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button
          className={`btn ${activeView === 'workspace' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveView('workspace')}
        >
          <Database size={16} />
          Documents Workspace
        </button>

        {currentUser?.role === 'administrator' && (
          <button
            className={`btn ${activeView === 'admin' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveView('admin')}
            style={activeView === 'admin' ? { background: 'linear-gradient(135deg, #a855f7, #6366f1)' } : {}}
          >
            <ShieldCheck size={16} />
            Administrator Console
          </button>
        )}
      </div>

      {/* Demo Switcher & Active User Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{currentUser?.displayName || 'Loading...'}</span>
            <span className={`badge badge-${currentUser?.role === 'administrator' ? 'admin' : currentUser?.role === 'document_owner' ? 'owner' : 'viewer'}`}>
              {currentUser?.role}
            </span>
            <span className={`badge badge-${currentUser?.isActive ? 'active' : 'inactive'}`}>
              {currentUser?.isActive ? 'Active' : 'Deactivated'}
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{currentUser?.email}</span>
        </div>

        {/* Persona quick-switch dropdown */}
        <div style={{ position: 'relative' }}>
          <select
            className="input-field"
            style={{ width: 'auto', padding: '0.45rem 0.8rem', fontSize: '0.8rem', cursor: 'pointer', background: 'rgba(15, 23, 42, 0.9)' }}
            value={currentUser?.id || ''}
            onChange={(e) => onSwitchUser(e.target.value)}
          >
            <option value="" disabled>Switch Persona</option>
            {fixtures.map((f) => (
              <option key={f.id} value={f.id}>
                {f.displayName} ({f.role}{!f.isActive ? ' - INACTIVE' : ''})
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
};
