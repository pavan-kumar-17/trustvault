import React, { useState, useEffect } from 'react';
import { UserProfile, FixturePersona } from './types.js';
import { api, authStorage } from './lib/api.js';
import { Sidebar } from './components/Sidebar.js';
import { Header } from './components/Header.js';
import { Workspace } from './features/documents/Workspace.js';
import { UploadModal } from './features/documents/UploadModal.js';
import { DocumentDetailsModal } from './features/documents/DocumentDetailsModal.js';
import { AdminConsole } from './features/admin/AdminConsole.js';
import { SignInPage } from './features/auth/SignInPage.js';
import { RegisterPage } from './features/auth/RegisterPage.js';
import { ShieldAlert, RefreshCw, Settings, ShieldCheck } from 'lucide-react';

const DEFAULT_FIXTURES: FixturePersona[] = [
  { id: 'usr-1', email: 'admin@trustvault.local', displayName: 'Alice (Security Admin)', role: 'administrator', isActive: true },
  { id: 'usr-2', email: 'owner@trustvault.local', displayName: 'Oscar (Document Owner)', role: 'document_owner', isActive: true },
  { id: 'usr-3', email: 'viewer@trustvault.local', displayName: 'Victor (Compliance Viewer)', role: 'viewer', isActive: true },
  { id: 'usr-4', email: 'inactive@trustvault.local', displayName: 'Ian (Deactivated Employee)', role: 'viewer', isActive: false },
];

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [fixtures, setFixtures] = useState<FixturePersona[]>(DEFAULT_FIXTURES);
  const [activeView, setActiveView] = useState<'workspace' | 'admin'>('workspace');
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);
  const [isInitializing, setIsInitializing] = useState<boolean>(() => {
    // Only show initializing screen if an existing token needs validation
    return Boolean(authStorage.getToken());
  });

  // Authentication subroute state ('signin' | 'register')
  const [authRoute, setAuthRoute] = useState<'signin' | 'register'>('signin');

  // Active navigation category ('all' | 'my' | 'shared')
  const [activeNavCategory, setActiveNavCategory] = useState<'all' | 'my' | 'shared'>('all');

  // Responsive sidebar state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Global search input
  const [globalSearch, setGlobalSearch] = useState<string>('');

  // Modals state
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  // Real Vault metrics computed from loaded documents
  const [vaultStats, setVaultStats] = useState<{ count: number; bytes: number }>({
    count: 0,
    bytes: 0,
  });

  // Chain verification status
  const [chainVerification, setChainVerification] = useState<{
    valid: boolean;
    checkedCount: number;
  } | null>(null);
  const [isVerifyingChain, setIsVerifyingChain] = useState<boolean>(false);

  // Synchronize route with current browser URL path
  const syncRouteFromLocation = () => {
    const path = window.location.pathname.toLowerCase();
    if (path === '/register' || path === '/signup') {
      setAuthRoute('register');
    } else if (path === '/admin') {
      setActiveView('admin');
      setAuthRoute('signin');
    } else {
      setAuthRoute('signin');
      setActiveView('workspace');
    }
  };

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    syncRouteFromLocation();
  };

  // Listen to browser Back and Forward navigation
  useEffect(() => {
    syncRouteFromLocation();

    const handlePopState = () => {
      syncRouteFromLocation();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Prevent background scrolling while mobile drawer is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  // Handle Escape key to close mobile drawer and open modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isMobileMenuOpen) setIsMobileMenuOpen(false);
        if (isSettingsOpen) setIsSettingsOpen(false);
        if (isUploadOpen) setIsUploadOpen(false);
        if (selectedDocId) setSelectedDocId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen, isSettingsOpen, isUploadOpen, selectedDocId]);

  useEffect(() => {
    bootstrapApp();
  }, []);

  const bootstrapApp = async () => {
    // 1. Fetch live fixtures in background without blocking initial render
    api.getFixtures()
      .then(({ fixtures: fixtureList }) => {
        if (fixtureList && fixtureList.length > 0) {
          setFixtures(fixtureList);
        }
      })
      .catch((err) => {
        console.warn('Could not refresh fixture personas from API, using defaults:', err);
      });

    // 2. If an existing token exists, verify with 2500ms timeout guard
    const existingToken = authStorage.getToken();
    if (!existingToken) {
      setCurrentUser(null);
      setIsInitializing(false);
      return;
    }

    try {
      const timeoutPromise = new Promise<{ user: null }>((_, reject) =>
        setTimeout(() => reject(new Error('Session verification timeout')), 2500)
      );

      const me = await Promise.race([api.getMe(), timeoutPromise]);
      if (me.user && me.user.isActive) {
        setCurrentUser(me.user);
      } else {
        authStorage.clearToken();
        setCurrentUser(null);
      }
    } catch {
      authStorage.clearToken();
      setCurrentUser(null);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleAuthSuccess = (user: UserProfile) => {
    setCurrentUser(user);
    navigateTo('/');
  };

  const handleSignOut = () => {
    api.logout();
    setCurrentUser(null);
    navigateTo('/login');
  };

  const handleSwitchUser = async (userId: string) => {
    try {
      const data = await api.demoLogin(userId);
      setCurrentUser(data.user);
      if (data.user.role !== 'administrator' && activeView === 'admin') {
        setActiveView('workspace');
      }
      setRefreshTrigger((prev) => prev + 1);
    } catch (err: any) {
      alert(`Failed to switch persona: ${err.message}`);
    }
  };

  const handleRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleVerifyChain = async () => {
    setIsVerifyingChain(true);
    try {
      const res = await api.verifyAuditChain();
      setChainVerification(res);
      handleRefresh();
    } catch (err: any) {
      alert(`Chain verification failed: ${err.message}`);
    } finally {
      setIsVerifyingChain(false);
    }
  };

  // Initial loading screen while verifying session
  if (isInitializing) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          background: 'var(--workspace-bg)',
          gap: '1rem',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: '#eff6ff',
            border: '1px solid #dbeafe',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ShieldCheck size={28} color="#2563eb" />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: '#475569', fontSize: '0.9rem' }}>
          <span className="auth-btn-spinner" style={{ borderColor: '#cbd5e1', borderTopColor: '#2563eb' }} />
          <span>Verifying TrustVault session...</span>
        </div>
      </div>
    );
  }

  // Unauthenticated State: Render Sign In or Register Pages
  if (!currentUser) {
    if (authRoute === 'register') {
      return (
        <RegisterPage
          onSuccess={handleAuthSuccess}
          onNavigateToSignIn={() => navigateTo('/login')}
        />
      );
    }

    return (
      <SignInPage
        onSuccess={handleAuthSuccess}
        onNavigateToRegister={() => navigateTo('/register')}
      />
    );
  }

  // Authenticated State: Protected Workspace & Admin Console
  return (
    <div className="app-shell">
      {/* Mobile Drawer Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="sidebar-backdrop mobile-only"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* 1. Deep Navy Sidebar */}
      <Sidebar
        currentUser={currentUser}
        fixtures={fixtures}
        onSwitchUser={handleSwitchUser}
        activeView={activeView}
        setActiveView={(view) => {
          setActiveView(view);
          setIsMobileMenuOpen(false);
        }}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        totalDocsCount={vaultStats.count}
        totalStorageBytes={vaultStats.bytes}
        chainVerified={chainVerification ? chainVerification.valid : null}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        activeCategory={activeNavCategory}
        onSelectCategory={(cat) => {
          setActiveNavCategory(cat as 'all' | 'my' | 'shared');
          setActiveView('workspace');
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onSignOut={handleSignOut}
      />

      {/* 2. White SaaS Workspace Area */}
      <div className="workspace-container">
        {/* Top Header */}
        <Header
          currentUser={currentUser}
          fixtures={fixtures}
          onSwitchUser={handleSwitchUser}
          activeView={activeView}
          setActiveView={setActiveView}
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          searchQuery={globalSearch}
          onSearchChange={setGlobalSearch}
          onVerifyChain={handleVerifyChain}
          isVerifyingChain={isVerifyingChain}
          chainVerification={chainVerification}
          onSignOut={handleSignOut}
        />

        {/* Main Content View */}
        <main className="workspace-main">
          {/* Deactivated User Alert Banner */}
          {currentUser && !currentUser.isActive && (
            <div
              style={{
                background: 'var(--color-rose-light)',
                border: '1px solid var(--color-rose-border)',
                color: 'var(--color-rose)',
                padding: '1rem 1.25rem',
                borderRadius: '10px',
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
                boxShadow: 'var(--shadow-xs)',
              }}
            >
              <ShieldAlert size={22} style={{ flexShrink: 0 }} />
              <div>
                <strong style={{ display: 'block', fontSize: '0.95rem' }}>
                  Account Deactivated
                </strong>
                <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                  This account has been deactivated by an administrator. Subsequent API requests are rejected immediately with HTTP 403 Forbidden.
                </span>
              </div>
            </div>
          )}

          {/* View Selection */}
          {activeView === 'workspace' ? (
            <Workspace
              currentUser={currentUser}
              onOpenUpload={() => setIsUploadOpen(true)}
              onOpenDetails={(id) => setSelectedDocId(id)}
              refreshTrigger={refreshTrigger}
              externalSearch={globalSearch}
              onStatsUpdate={setVaultStats}
              activeNavCategory={activeNavCategory}
            />
          ) : (
            <AdminConsole
              currentUser={currentUser}
              onRefreshGlobal={handleRefresh}
              onVerificationUpdate={setChainVerification}
            />
          )}
        </main>
      </div>

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={handleRefresh}
      />

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div
          className="modal-overlay"
          onClick={() => setIsSettingsOpen(false)}
        >
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '480px' }}
          >
            <div className="modal-header">
              <div className="modal-title-box">
                <div className="modal-icon-badge">
                  <Settings size={20} />
                </div>
                <div>
                  <h3 className="modal-title">Settings & Identity</h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                    Evaluation persona and security configuration
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsSettingsOpen(false)}
                title="Close settings"
                aria-label="Close settings"
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Active Persona Switcher</label>
                <select
                  className="input-field"
                  value={currentUser?.id || ''}
                  onChange={(e) => {
                    handleSwitchUser(e.target.value);
                    setIsSettingsOpen(false);
                  }}
                >
                  {fixtures.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.displayName} ({f.role.replace('_', ' ')}) - {f.email}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.35rem' }}>
                  Switches JWT bearer token to evaluate Zero-Trust authorization and access control.
                </span>
              </div>

              <div className="modal-meta-grid" style={{ marginTop: '1rem', gridTemplateColumns: '1fr' }}>
                <div>
                  <span className="meta-label">Identity Role</span>
                  <div style={{ marginTop: '0.25rem' }}>
                    <span
                      className={`badge ${
                        currentUser?.role === 'administrator'
                          ? 'badge-role-admin'
                          : currentUser?.role === 'document_owner'
                          ? 'badge-role-owner'
                          : 'badge-role-viewer'
                      }`}
                    >
                      {currentUser?.role?.replace('_', ' ') || 'None'}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="meta-label">Account Status</span>
                  <div style={{ marginTop: '0.25rem' }}>
                    <span
                      className={`badge ${
                        currentUser?.isActive ? 'badge-status-active' : 'badge-status-inactive'
                      }`}
                    >
                      {currentUser?.isActive ? 'Active' : 'Deactivated'}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="meta-label">Audit Hash Chain</span>
                  <span className="meta-value font-mono" style={{ fontSize: '0.8rem', color: 'var(--emerald-dark)' }}>
                    SHA-256 Merkle Provenance Active
                  </span>
                </div>
              </div>

              <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setIsSettingsOpen(false);
                    handleSignOut();
                  }}
                  style={{ color: 'var(--color-rose)', borderColor: 'var(--color-rose-border)' }}
                >
                  Sign Out
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setIsSettingsOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Document Details & Secure Sharing Modal */}
      <DocumentDetailsModal
        documentId={selectedDocId}
        currentUser={currentUser}
        fixtures={fixtures}
        onClose={() => setSelectedDocId(null)}
        onRefresh={handleRefresh}
      />
    </div>
  );
};
