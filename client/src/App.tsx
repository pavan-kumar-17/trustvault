import React, { useState, useEffect } from 'react';
import { UserProfile, FixturePersona } from './types.js';
import { api, authStorage } from './lib/api.js';
import { Sidebar } from './components/Sidebar.js';
import { Header } from './components/Header.js';
import { Workspace } from './features/documents/Workspace.js';
import { UploadModal } from './features/documents/UploadModal.js';
import { DocumentDetailsModal } from './features/documents/DocumentDetailsModal.js';
import { AdminConsole } from './features/admin/AdminConsole.js';
import { ShieldAlert, RefreshCw } from 'lucide-react';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [fixtures, setFixtures] = useState<FixturePersona[]>([]);
  const [activeView, setActiveView] = useState<'workspace' | 'admin'>('workspace');
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Responsive sidebar state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Global search input
  const [globalSearch, setGlobalSearch] = useState<string>('');

  // Modals state
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
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

  useEffect(() => {
    bootstrapApp();
  }, []);

  const bootstrapApp = async () => {
    try {
      const { fixtures: fixtureList } = await api.getFixtures();
      setFixtures(fixtureList);

      const existingToken = authStorage.getToken();
      if (!existingToken) {
        const defaultAdmin = fixtureList[0];
        if (defaultAdmin) {
          const authData = await api.demoLogin(defaultAdmin.id);
          setCurrentUser(authData.user);
        }
      } else {
        try {
          const me = await api.getMe();
          setCurrentUser(me.user);
        } catch {
          const defaultAdmin = fixtureList[0];
          if (defaultAdmin) {
            const authData = await api.demoLogin(defaultAdmin.id);
            setCurrentUser(authData.user);
          }
        }
      }
    } catch (err) {
      console.error('Failed to initialize app:', err);
    }
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

  return (
    <div className="app-shell">
      {/* Mobile Drawer Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="modal-overlay mobile-only"
          onClick={() => setIsMobileMenuOpen(false)}
          style={{ zIndex: 35 }}
        />
      )}

      {/* 1. Deep Navy Sidebar */}
      <div className={isMobileMenuOpen ? 'sidebar-nav mobile-open' : ''}>
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
        />
      </div>

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
