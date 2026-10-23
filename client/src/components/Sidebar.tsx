import React from 'react';
import { UserProfile, FixturePersona } from '../types.js';
import {
  Shield,
  Files,
  Activity,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  HardDrive,
  Users,
  CheckCircle2,
  Lock,
  Layers,
  FileText,
  UserCheck,
  X,
  LayoutDashboard,
  Share2,
  Settings,
  LogOut,
} from 'lucide-react';

interface SidebarProps {
  currentUser: UserProfile | null;
  fixtures: FixturePersona[];
  onSwitchUser: (userId: string) => void;
  activeView: 'workspace' | 'admin';
  setActiveView: (view: 'workspace' | 'admin') => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  totalDocsCount: number;
  totalStorageBytes: number;
  chainVerified: boolean | null;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  activeCategory?: string;
  onSelectCategory?: (category: string) => void;
  onOpenSettings?: () => void;
  onSignOut?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  fixtures,
  onSwitchUser,
  activeView,
  setActiveView,
  isCollapsed,
  setIsCollapsed,
  totalDocsCount,
  totalStorageBytes,
  chainVerified,
  isMobileOpen = false,
  onCloseMobile,
  activeCategory = 'all',
  onSelectCategory,
  onOpenSettings,
}) => {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 KB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getInitials = (name?: string) => {
    if (!name) return 'TV';
    const parts = name.split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const showExpanded = !isCollapsed || isMobileOpen;

  return (
    <aside
      className={`sidebar-nav ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}
      aria-label="Main Navigation"
    >
      {/* Brand Header */}
      <div className="sidebar-brand">
        <div
          className="brand-logo-wrap"
          onClick={() => {
            setActiveView('workspace');
            onSelectCategory?.('all');
            onCloseMobile?.();
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              setActiveView('workspace');
              onSelectCategory?.('all');
              onCloseMobile?.();
            }
          }}
        >
          <div className="brand-icon-box">
            <Shield size={20} className="text-white" />
          </div>
          {showExpanded && (
            <div className="brand-text">
              <div className="brand-title">
                <span>TrustVault</span>
                <span className="brand-badge">SaaS</span>
              </div>
              <span className="brand-subtitle">Zero-Trust File Vault</span>
            </div>
          )}
        </div>

        <div className="sidebar-brand-controls">
          <button
            type="button"
            className="sidebar-toggle-btn desktop-only"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

          <button
            type="button"
            className="sidebar-close-btn mobile-only"
            onClick={onCloseMobile}
            title="Close navigation menu"
            aria-label="Close navigation menu"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="sidebar-menu">
        <div className="sidebar-section">
          {showExpanded && <span className="sidebar-section-title">VAULT REPOSITORY</span>}
          <div className="sidebar-links">
            {/* 1. Dashboard */}
            <button
              type="button"
              className={`sidebar-link ${activeView === 'workspace' && activeCategory === 'all' ? 'active' : ''}`}
              onClick={() => {
                setActiveView('workspace');
                onSelectCategory?.('all');
                onCloseMobile?.();
              }}
              title="Vault Dashboard Overview"
            >
              <LayoutDashboard size={18} className="link-icon" />
              {showExpanded && <span className="link-label">Dashboard</span>}
            </button>

            {/* 2. My Documents */}
            <button
              type="button"
              className={`sidebar-link ${activeView === 'workspace' && activeCategory === 'my' ? 'active' : ''}`}
              onClick={() => {
                setActiveView('workspace');
                onSelectCategory?.('my');
                onCloseMobile?.();
              }}
              title="My Documents & Uploads"
            >
              <Files size={18} className="link-icon" />
              {showExpanded && (
                <>
                  <span className="link-label">My Documents</span>
                  {totalDocsCount > 0 && (
                    <span className="link-count-badge">{totalDocsCount}</span>
                  )}
                </>
              )}
            </button>

            {/* 3. Shared Files */}
            <button
              type="button"
              className={`sidebar-link ${activeView === 'workspace' && activeCategory === 'shared' ? 'active' : ''}`}
              onClick={() => {
                setActiveView('workspace');
                onSelectCategory?.('shared');
                onCloseMobile?.();
              }}
              title="Shared Files & Permissions"
            >
              <Share2 size={18} className="link-icon" />
              {showExpanded && (
                <>
                  <span className="link-label">Shared Files</span>
                  <span
                    className="role-tag"
                    style={{
                      background: 'rgba(59, 130, 246, 0.2)',
                      color: '#93c5fd',
                      border: '1px solid rgba(59, 130, 246, 0.35)',
                    }}
                  >
                    Shared
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 4. Governance & Security */}
        <div className="sidebar-section">
          {showExpanded && <span className="sidebar-section-title">SECURITY & AUDIT</span>}
          <div className="sidebar-links">
            {currentUser?.role === 'administrator' ? (
              <button
                type="button"
                className={`sidebar-link ${activeView === 'admin' ? 'active' : ''}`}
                onClick={() => {
                  setActiveView('admin');
                  onCloseMobile?.();
                }}
                title="Security Activity & Cryptographic Audit Trail"
              >
                <Activity size={18} className="link-icon" />
                {showExpanded && (
                  <>
                    <span className="link-label">Security Activity</span>
                    <span className="role-tag admin">Admin</span>
                  </>
                )}
              </button>
            ) : (
              <div
                className="sidebar-link disabled"
                title="Switch to Alice Admin to inspect security activity"
              >
                <Lock size={18} className="link-icon text-muted" />
                {showExpanded && (
                  <>
                    <span className="link-label text-muted">Security Activity</span>
                    <span className="role-tag locked">Restricted</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 5. Preferences & Settings */}
        <div className="sidebar-section">
          {showExpanded && <span className="sidebar-section-title">PREFERENCES</span>}
          <div className="sidebar-links">
            <button
              type="button"
              className="sidebar-link"
              onClick={() => {
                onOpenSettings?.();
                onCloseMobile?.();
              }}
              title="Persona & Security Settings"
            >
              <Settings size={18} className="link-icon" />
              {showExpanded && (
                <>
                  <span className="link-label">Settings</span>
                  <span
                    className="role-tag"
                    style={{
                      background: 'rgba(148, 163, 184, 0.15)',
                      color: '#cbd5e1',
                      border: '1px solid rgba(148, 163, 184, 0.25)',
                    }}
                  >
                    Profile
                  </span>
                </>
              )}
            </button>

            {onSignOut && (
              <button
                type="button"
                className="sidebar-link"
                onClick={() => {
                  onCloseMobile?.();
                  onSignOut();
                }}
                title="Sign Out of TrustVault"
                style={{ color: '#f43f5e', marginTop: '0.25rem' }}
              >
                <LogOut size={18} className="link-icon" style={{ color: '#f43f5e' }} />
                {showExpanded && <span className="link-label">Sign Out</span>}
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Vault Real Storage Metrics Box (Non-collapsed or Mobile) */}
      {showExpanded && (
        <div className="vault-stats-card">
          <div className="stats-header">
            <HardDrive size={16} className="text-emerald" />
            <span className="stats-title">Vault Footprint</span>
          </div>
          <div className="stats-body">
            <div className="stats-row">
              <span className="stats-label">Accessible Docs:</span>
              <span className="stats-value">{totalDocsCount}</span>
            </div>
            <div className="stats-row">
              <span className="stats-label">Real Data Size:</span>
              <span className="stats-value">{formatBytes(totalStorageBytes)}</span>
            </div>
            <div className="stats-row">
              <span className="stats-label">Audit Hash Chain:</span>
              <span className="stats-status">
                {chainVerified ? (
                  <span className="text-emerald flex-center gap-1">
                    <CheckCircle2 size={13} /> Intact
                  </span>
                ) : (
                  <span className="text-dim">Active</span>
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* User Persona Profile Footer */}
      <div className="sidebar-footer">
        <div className="user-profile-card">
          <div className="user-avatar-wrap">
            <div className="user-avatar">
              {getInitials(currentUser?.displayName)}
            </div>
            <span
              className={`status-indicator ${currentUser?.isActive ? 'active' : 'inactive'}`}
              title={currentUser?.isActive ? 'Account Active' : 'Account Deactivated'}
            />
          </div>

          {showExpanded && (
            <div className="user-info">
              <div className="user-name-row">
                <span className="user-display-name">
                  {currentUser?.displayName || 'Loading...'}
                </span>
              </div>
              <span className="user-email">{currentUser?.email}</span>
              
              {/* Persona Switcher Selector */}
              <div className="persona-select-wrap">
                <label className="persona-label">Persona:</label>
                <select
                  className="persona-dropdown"
                  value={currentUser?.id || ''}
                  onChange={(e) => {
                    onSwitchUser(e.target.value);
                    onCloseMobile?.();
                  }}
                  title="Switch Persona for Evaluation"
                >
                  {fixtures.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.displayName} ({f.role.replace('_', ' ')}{!f.isActive ? ' - INACTIVE' : ''})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
