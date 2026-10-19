import React, { useState, useEffect } from 'react';
import { UserProfile, FixturePersona } from './types.js';
import { api, authStorage } from './lib/api.js';
import { Navbar } from './components/Navbar.js';
import { Workspace } from './features/documents/Workspace.js';
import { UploadModal } from './features/documents/UploadModal.js';
import { DocumentDetailsModal } from './features/documents/DocumentDetailsModal.js';
import { AdminConsole } from './features/admin/AdminConsole.js';
import { AlertCircle, ShieldAlert } from 'lucide-react';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [fixtures, setFixtures] = useState<FixturePersona[]>([]);
  const [activeView, setActiveView] = useState<'workspace' | 'admin'>('workspace');
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

  // Modals state
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  useEffect(() => {
    bootstrapApp();
  }, []);

  const bootstrapApp = async () => {
    try {
      const { fixtures: fixtureList } = await api.getFixtures();
      setFixtures(fixtureList);

      // Default persona: Alice Admin if no token, or check existing token
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
          // Token expired or invalid -> login as default
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
      // If switched to non-admin while in admin view, return to workspace
      if (data.user.role !== 'administrator') {
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

  return (
    <div>
      <Navbar
        currentUser={currentUser}
        fixtures={fixtures}
        onSwitchUser={handleSwitchUser}
        activeView={activeView}
        setActiveView={setActiveView}
      />

      <main className="app-container">
        {/* Deactivated User Alert Banner */}
        {currentUser && !currentUser.isActive && (
          <div style={{
            background: 'rgba(244, 63, 94, 0.12)',
            border: '1px solid rgba(244, 63, 94, 0.35)',
            color: '#fb7185',
            padding: '1rem 1.25rem',
            borderRadius: '12px',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <ShieldAlert size={22} />
            <div>
              <strong style={{ display: 'block', fontSize: '0.95rem' }}>Account Deactivated</strong>
              <span style={{ fontSize: '0.825rem', color: '#fda4af' }}>
                This account has been deactivated by an administrator. Subsequent API requests are rejected immediately with 403 Forbidden.
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
          />
        ) : (
          <AdminConsole
            currentUser={currentUser}
            onRefreshGlobal={handleRefresh}
          />
        )}
      </main>

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={handleRefresh}
      />

      {/* Document Details & Manage Grants Modal */}
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
