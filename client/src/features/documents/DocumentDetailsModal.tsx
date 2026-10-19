import React, { useState, useEffect } from 'react';
import { DocumentItem, GrantItem, AuditEventItem, UserProfile, FixturePersona } from '../../types.js';
import { api } from '../../lib/api.js';
import {
  X,
  Download,
  Key,
  Clock,
  Shield,
  Trash2,
  Edit2,
  Check,
  UserPlus,
  Lock,
  Copy,
  AlertCircle,
} from 'lucide-react';

interface DocumentDetailsModalProps {
  documentId: string | null;
  currentUser: UserProfile | null;
  fixtures: FixturePersona[];
  onClose: () => void;
  onRefresh: () => void;
}

export const DocumentDetailsModal: React.FC<DocumentDetailsModalProps> = ({
  documentId,
  currentUser,
  fixtures,
  onClose,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'access' | 'audit'>('overview');
  const [doc, setDoc] = useState<DocumentItem | null>(null);
  const [grants, setGrants] = useState<GrantItem[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEventItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Edit metadata state
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>('');
  const [editCategory, setEditCategory] = useState<string>('');

  // Add grant state
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [grantLevel, setGrantLevel] = useState<'read' | 'edit'>('read');
  const [grantLoading, setGrantLoading] = useState<boolean>(false);

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [deleteReason, setDeleteReason] = useState<string>('');

  useEffect(() => {
    if (!documentId) return;
    loadDocumentData();
  }, [documentId]);

  const loadDocumentData = async () => {
    if (!documentId) return;
    setLoading(true);
    setError(null);

    try {
      const docData = await api.getDocument(documentId);
      setDoc(docData);
      setEditName(docData.displayName);
      setEditCategory(docData.category);

      // If user is owner or admin, also load grants and audit
      if (docData.isOwner || currentUser?.role === 'administrator') {
        try {
          const grantsData = await api.getGrants(documentId);
          setGrants(grantsData.grants);
        } catch {}

        try {
          const auditData = await api.getDocumentAudit(documentId);
          setAuditEvents(auditData.items);
        } catch {}
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load document');
    } finally {
      setLoading(false);
    }
  };

  if (!documentId) return null;

  const handleDownload = async () => {
    if (!doc) return;
    try {
      await api.downloadDocument(doc.id, doc.displayName);
      loadDocumentData(); // Reload to refresh audit trail
    } catch (err: any) {
      alert(`Download failed: ${err.message}`);
    }
  };

  const handleSaveMetadata = async () => {
    if (!doc) return;
    try {
      await api.updateDocument(doc.id, {
        display_name: editName,
        category: editCategory,
      });
      setIsEditing(false);
      loadDocumentData();
      onRefresh();
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    }
  };

  const handleAddGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doc || !targetUserId) return;
    setGrantLoading(true);
    try {
      await api.upsertGrant(doc.id, targetUserId, grantLevel);
      setTargetUserId('');
      loadDocumentData();
      onRefresh();
    } catch (err: any) {
      alert(`Failed to grant access: ${err.message}`);
    } finally {
      setGrantLoading(false);
    }
  };

  const handleRevokeGrant = async (targetId: string) => {
    if (!doc) return;
    if (!confirm('Are you sure you want to revoke access? Access will be denied immediately on their next request.')) return;
    try {
      await api.revokeGrant(doc.id, targetId);
      loadDocumentData();
      onRefresh();
    } catch (err: any) {
      alert(`Failed to revoke access: ${err.message}`);
    }
  };

  const handleDelete = async () => {
    if (!doc) return;
    if (!deleteReason.trim()) {
      alert('A reason is required to delete a document');
      return;
    }

    try {
      await api.deleteDocument(doc.id, deleteReason);
      onRefresh();
      onClose();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const canManageAccess = doc?.isOwner || currentUser?.role === 'administrator';
  const canEditMetadata = doc?.isOwner || doc?.userPermission === 'edit';
  const canDelete = doc?.isOwner || currentUser?.role === 'administrator';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '780px', padding: '1.75rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{doc?.displayName || 'Document Details'}</h3>
              <span className="badge badge-viewer">{doc?.category}</span>
              <span className={`badge badge-${doc?.status === 'active' ? 'active' : 'inactive'}`}>
                {doc?.status}
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.25rem' }}>
              ID: <span className="font-mono">{doc?.id}</span>
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {error ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#fb7185' }}>
            <AlertCircle size={32} style={{ margin: '0 auto 0.75rem' }} />
            <p>{error}</p>
          </div>
        ) : loading || !doc ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading document metadata...
          </div>
        ) : (
          <div>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-subtle)', marginBottom: '1.25rem', paddingBottom: '0.5rem' }}>
              <button
                className={`btn ${activeTab === 'overview' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem' }}
                onClick={() => setActiveTab('overview')}
              >
                Overview
              </button>
              {canManageAccess && (
                <button
                  className={`btn ${activeTab === 'access' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem' }}
                  onClick={() => setActiveTab('access')}
                >
                  <Key size={14} />
                  Manage Access ({grants.length})
                </button>
              )}
              {canManageAccess && (
                <button
                  className={`btn ${activeTab === 'audit' ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '0.4rem 0.9rem', fontSize: '0.8rem' }}
                  onClick={() => setActiveTab('audit')}
                >
                  <Clock size={14} />
                  Document Audit ({auditEvents.length})
                </button>
              )}
            </div>

            {/* TAB 1: OVERVIEW */}
            {activeTab === 'overview' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '10px' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Owner</span>
                    <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>{doc.ownerName}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Your Access Rights</span>
                    <p style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--accent-cyan)' }}>
                      {doc.userPermission.toUpperCase()}
                    </p>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>File Size</span>
                    <p style={{ fontSize: '0.9rem', fontWeight: 500 }}>{(doc.sizeBytes / 1024).toFixed(1)} KB</p>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>MIME Type</span>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{doc.detectedContentType}</p>
                  </div>
                </div>

                {/* SHA-256 Digest */}
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Cryptographic SHA-256 Checksum</span>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.25rem' }}>
                    <code className="font-mono" style={{ fontSize: '0.8rem', color: '#38bdf8', wordBreak: 'break-all' }}>
                      {doc.sha256Hex}
                    </code>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                      onClick={() => navigator.clipboard.writeText(doc.sha256Hex)}
                      title="Copy SHA-256"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                </div>

                {/* Action Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-primary" onClick={handleDownload}>
                      <Download size={16} />
                      Download Stream
                    </button>
                    {canEditMetadata && !isEditing && (
                      <button className="btn btn-secondary" onClick={() => setIsEditing(true)}>
                        <Edit2 size={15} />
                        Edit Metadata
                      </button>
                    )}
                  </div>

                  {canDelete && (
                    <button className="btn btn-danger" onClick={() => setShowDeleteConfirm(true)}>
                      <Trash2 size={16} />
                      Soft-Delete
                    </button>
                  )}
                </div>

                {/* Edit Metadata Inline Form */}
                {isEditing && (
                  <div style={{ background: 'rgba(99, 102, 241, 0.05)', border: '1px solid rgba(99, 102, 241, 0.2)', padding: '1rem', borderRadius: '10px' }}>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>Update Allowed Metadata</h4>
                    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
                      <input
                        className="input-field"
                        placeholder="Display Name"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                      <input
                        className="input-field"
                        placeholder="Category"
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                      <button className="btn btn-secondary" onClick={() => setIsEditing(false)}>Cancel</button>
                      <button className="btn btn-primary" onClick={handleSaveMetadata}>Save Changes</button>
                    </div>
                  </div>
                )}

                {/* Delete Confirmation */}
                {showDeleteConfirm && (
                  <div style={{ background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.25)', padding: '1rem', borderRadius: '10px' }}>
                    <h4 style={{ fontSize: '0.9rem', color: '#fda4af', marginBottom: '0.5rem' }}>Confirm Soft Deletion</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
                      As required by the specification, an explicit reason must be provided and logged in the immutable audit chain.
                    </p>
                    <input
                      className="input-field"
                      placeholder="Enter deletion reason (required)..."
                      value={deleteReason}
                      onChange={(e) => setDeleteReason(e.target.value)}
                      style={{ marginBottom: '0.75rem' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                      <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
                      <button className="btn btn-danger" onClick={handleDelete}>Confirm Soft-Delete</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: ACCESS GRANTS */}
            {activeTab === 'access' && canManageAccess && (
              <div>
                {/* Add Grant Form */}
                <form onSubmit={handleAddGrant} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.25rem', background: 'rgba(0,0,0,0.2)', padding: '0.85rem', borderRadius: '10px' }}>
                  <select
                    className="input-field"
                    value={targetUserId}
                    onChange={(e) => setTargetUserId(e.target.value)}
                    required
                  >
                    <option value="">Select Named Active User...</option>
                    {fixtures
                      .filter((f) => f.id !== doc.ownerId && f.isActive)
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.displayName} ({f.email})
                        </option>
                      ))}
                  </select>

                  <select
                    className="input-field"
                    value={grantLevel}
                    onChange={(e) => setGrantLevel(e.target.value as any)}
                    style={{ width: '130px' }}
                  >
                    <option value="read">Viewer (Read)</option>
                    <option value="edit">Editor (Edit)</option>
                  </select>

                  <button type="submit" className="btn btn-primary" disabled={grantLoading || !targetUserId} style={{ whiteSpace: 'nowrap' }}>
                    <UserPlus size={16} />
                    Grant Access
                  </button>
                </form>

                {/* Grants Table */}
                <div className="table-wrapper">
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Email</th>
                        <th>Permission</th>
                        <th>Granted Date</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grants.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '1.5rem' }}>
                            No named user grants. Only the document owner can access this file.
                          </td>
                        </tr>
                      ) : (
                        grants.map((g) => (
                          <tr key={g.userId}>
                            <td style={{ fontWeight: 500 }}>{g.userDisplayName}</td>
                            <td style={{ color: 'var(--text-dim)' }}>{g.userEmail}</td>
                            <td>
                              <span className={`badge ${g.permission === 'edit' ? 'badge-owner' : 'badge-viewer'}`}>
                                {g.permission}
                              </span>
                            </td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                              {new Date(g.createdAt).toLocaleDateString()}
                            </td>
                            <td>
                              <button
                                className="btn btn-danger"
                                style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                                onClick={() => handleRevokeGrant(g.userId)}
                              >
                                Revoke
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 3: AUDIT TRAIL */}
            {activeTab === 'audit' && canManageAccess && (
              <div className="table-wrapper">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Seq</th>
                      <th>Time</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Outcome</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditEvents.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '1.5rem' }}>
                          No audit activity recorded for this document.
                        </td>
                      </tr>
                    ) : (
                      auditEvents.map((evt) => (
                        <tr key={evt.sequence}>
                          <td className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                            #{evt.sequence}
                          </td>
                          <td style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                            {new Date(evt.occurredAt).toLocaleTimeString()}
                          </td>
                          <td style={{ fontSize: '0.85rem' }}>{evt.actorLabelSnapshot || 'System'}</td>
                          <td style={{ fontWeight: 600, fontSize: '0.8rem' }}>{evt.action}</td>
                          <td>
                            <span className={`badge badge-${evt.outcome === 'allowed' || evt.outcome === 'success' ? 'active' : 'inactive'}`}>
                              {evt.outcome}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{evt.reasonCode}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
