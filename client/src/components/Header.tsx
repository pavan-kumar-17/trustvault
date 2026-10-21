import React, { useState, useRef, useEffect } from 'react';
import { UserProfile, FixturePersona } from '../types.js';
import {
  Menu,
  Search,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  User,
  ChevronDown,
  Layers,
  ShieldAlert,
  Check
} from 'lucide-react';

interface HeaderProps {
  currentUser: UserProfile | null;
  fixtures: FixturePersona[];
  onSwitchUser: (userId: string) => void;
  activeView: 'workspace' | 'admin';
  setActiveView: (view: 'workspace' | 'admin') => void;
  onToggleMobileMenu: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onVerifyChain: () => void;
  isVerifyingChain: boolean;
  chainVerification: { valid: boolean; checkedCount: number } | null;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  fixtures,
  onSwitchUser,
  activeView,
  setActiveView,
  onToggleMobileMenu,
  searchQuery,
  onSearchChange,
  onVerifyChain,
  isVerifyingChain,
  chainVerification,
}) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getInitials = (name?: string) => {
    if (!name) return 'TV';
    const parts = name.split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const getRoleBadgeClass = (role?: string) => {
    if (role === 'administrator') return 'badge-role-admin';
    if (role === 'document_owner') return 'badge-role-owner';
    return 'badge-role-viewer';
  };

  return (
    <header className="workspace-header">
      <div className="header-left">
        {/* Mobile Hamburger Menu Toggle */}
        <button
          className="header-icon-btn mobile-only"
          onClick={onToggleMobileMenu}
          aria-label="Toggle Navigation Menu"
        >
          <Menu size={20} />
        </button>

        {/* Global Vault Search (Desktop/Tablet) */}
        <div className="header-search-box desktop-search">
          <Search size={16} className="search-icon" />
          <input
            type="search"
            placeholder="Search vault documents, metadata, categories..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="header-search-input"
          />
          {searchQuery && (
            <button
              className="clear-search-btn"
              onClick={() => onSearchChange('')}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="header-right">
        {/* Audit Hash Chain Verification Chip */}
        <div className="chain-status-chip">
          {chainVerification ? (
            <button
              className={`chain-chip-btn ${chainVerification.valid ? 'valid' : 'invalid'}`}
              onClick={onVerifyChain}
              disabled={isVerifyingChain}
              title="Click to re-verify cryptographic hash chain"
            >
              {chainVerification.valid ? (
                <CheckCircle2 size={15} className="text-emerald flex-shrink-0" />
              ) : (
                <AlertTriangle size={15} className="text-rose flex-shrink-0" />
              )}
              <span className="chain-text-full">
                {chainVerification.valid
                  ? `${chainVerification.checkedCount} Events Verified`
                  : 'Tamper Alert'}
              </span>
              <span className="chain-text-mobile">
                {chainVerification.valid ? `${chainVerification.checkedCount} Verified` : 'Alert'}
              </span>
              <RefreshCw size={13} className={isVerifyingChain ? 'spin ml-1' : 'ml-1 opacity-70'} />
            </button>
          ) : (
            <button
              className="chain-chip-btn neutral"
              onClick={onVerifyChain}
              disabled={isVerifyingChain}
              title="Verify cryptographic integrity of audit records"
            >
              <ShieldCheck size={15} className="text-emerald flex-shrink-0" />
              <span className="chain-text-full">
                {isVerifyingChain ? 'Verifying...' : 'Verify Audit Chain'}
              </span>
              <span className="chain-text-mobile">
                {isVerifyingChain ? 'Verifying...' : 'Verify Chain'}
              </span>
              <RefreshCw size={13} className={isVerifyingChain ? 'spin ml-1' : 'ml-1 opacity-70'} />
            </button>
          )}
        </div>

        {/* Persona Switcher Dropdown in Top Bar (Hidden on smaller screens) */}
        <div className="header-persona-selector">
          <label className="sr-only" htmlFor="top-persona-select">Persona</label>
          <div className="persona-select-container">
            <User size={14} className="persona-icon" />
            <select
              id="top-persona-select"
              className="top-persona-select"
              value={currentUser?.id || ''}
              onChange={(e) => onSwitchUser(e.target.value)}
            >
              {fixtures.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.displayName} ({f.role.replace('_', ' ')})
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="dropdown-arrow" />
          </div>
        </div>

        {/* Active Role Tag (Desktop/Tablet only) */}
        {currentUser && (
          <div className="header-user-badge desktop-only-badge">
            <span className={`badge ${getRoleBadgeClass(currentUser.role)}`}>
              {currentUser.role.replace('_', ' ')}
            </span>
            <span
              className={`badge ${currentUser.isActive ? 'badge-status-active' : 'badge-status-inactive'}`}
            >
              {currentUser.isActive ? 'Active' : 'Deactivated'}
            </span>
          </div>
        )}

        {/* User Initials Avatar with Interactive Menu Popover */}
        <div className="header-avatar-container" ref={profileRef}>
          <button
            className="header-avatar-btn"
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            title={`${currentUser?.displayName || 'User'} (${currentUser?.email}) - Click for profile`}
            aria-label="User profile and persona switch menu"
            aria-expanded={isProfileOpen}
          >
            <div className="header-avatar">
              {getInitials(currentUser?.displayName)}
            </div>
          </button>

          {/* Profile & Switcher Popover Dropdown */}
          {isProfileOpen && (
            <div className="header-profile-popover">
              <div className="popover-user-info">
                <div className="popover-user-row">
                  <div className="header-avatar small">
                    {getInitials(currentUser?.displayName)}
                  </div>
                  <div className="popover-text">
                    <span className="popover-name">{currentUser?.displayName || 'User'}</span>
                    <span className="popover-email">{currentUser?.email}</span>
                  </div>
                </div>

                <div className="popover-badges">
                  {currentUser && (
                    <>
                      <span className={`badge ${getRoleBadgeClass(currentUser.role)}`}>
                        {currentUser.role.replace('_', ' ')}
                      </span>
                      <span
                        className={`badge ${currentUser.isActive ? 'badge-status-active' : 'badge-status-inactive'}`}
                      >
                        {currentUser.isActive ? 'Active' : 'Deactivated'}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Persona Switcher Section in Popover */}
              <div className="popover-section">
                <label className="popover-label" htmlFor="popover-persona-select">
                  Switch Persona:
                </label>
                <div className="persona-select-container popover-select-wrap">
                  <User size={14} className="persona-icon" />
                  <select
                    id="popover-persona-select"
                    className="top-persona-select"
                    value={currentUser?.id || ''}
                    onChange={(e) => {
                      onSwitchUser(e.target.value);
                      setIsProfileOpen(false);
                    }}
                  >
                    {fixtures.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.displayName} ({f.role.replace('_', ' ')})
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="dropdown-arrow" />
                </div>
              </div>

              {/* Navigation Quick Links */}
              <div className="popover-actions">
                <button
                  className={`popover-nav-btn ${activeView === 'workspace' ? 'active' : ''}`}
                  onClick={() => {
                    setActiveView('workspace');
                    setIsProfileOpen(false);
                  }}
                >
                  <Layers size={14} />
                  <span>Documents Workspace</span>
                  {activeView === 'workspace' && <Check size={14} className="ml-auto" />}
                </button>

                {currentUser?.role === 'administrator' && (
                  <button
                    className={`popover-nav-btn ${activeView === 'admin' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveView('admin');
                      setIsProfileOpen(false);
                    }}
                  >
                    <ShieldCheck size={14} />
                    <span>Administrator Console</span>
                    {activeView === 'admin' && <Check size={14} className="ml-auto" />}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
