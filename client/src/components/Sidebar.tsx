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
  X
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
            onCloseMobile?.();
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
            className="sidebar-toggle-btn desktop-only"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

          <button
            className="sidebar-close-btn mobile-only"
            onClick={onCloseMobile}
            title="Close menu"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="sidebar-menu">
        <div className="sidebar-section">
          {showExpanded && <span className="sidebar-section-title">WORKSPACE</span>}
          <div className="sidebar-links">
            <button
              className={`sidebar-link ${activeView === 'workspace' ? 'active' : ''}`}
              onClick={() => {
                setActiveView('workspace');
                onCloseMobile?.();
              }}
              title="Documents & Files"
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
          </div>
        </div>

        <div className="sidebar-section">
          {showExpanded && <span className="sidebar-section-title">GOVERNANCE & SECURITY</span>}
          <div className="sidebar-links">
            {currentUser?.role === 'administrator' ? (
              <button
                className={`sidebar-link ${activeView === 'admin' ? 'active' : ''}`}
                onClick={() => {
                  setActiveView('admin');
                  onCloseMobile?.();
                }}
                title="Administrator Console"
              >
                <ShieldCheck size={18} className="link-icon" />
                {showExpanded && (
                  <>
                    <span className="link-label">Admin Console</span>
                    <span className="role-tag admin">Admin</span>
                  </>
                )}
              </button>
            ) : (
              <div
                className="sidebar-link disabled"
                title="Switch to Alice Admin to manage access governance"
              >
                <Lock size={18} className="link-icon text-muted" />
                {showExpanded && (
                  <>
                    <span className="link-label text-muted">Admin Console</span>
                    <span className="role-tag locked">Restricted</span>
                  </>
                )}
              </div>
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
