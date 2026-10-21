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
  FileText,
  UserCheck,
  ShieldAlert,
  Share2
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
  const [copiedSha, setCopiedSha] = useState<boolean>(false);

  // Edit metadata
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>('');
  const [editCategory, setEditCategory] = useState<string>('');

  // Add grant
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [grantLevel, setGrantLevel] = useState<'read' | 'edit'>('read');
  const [grantLoading, setGrantLoading] = useState<boolean>(false);

  // Soft-Delete
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

      // If user is owner or admin, load grants and audit
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
      loadDocumentData();
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

  const handleCopySha = () => {
    if (!doc) return;
    navigator.clipboard.writeText(doc.sha256Hex);
    setCopiedSha(true);
    setTimeout(() => setCopiedSha(false), 2000);
  };

  const canManageAccess = doc?.isOwner || currentUser?.role === 'administrator';
  const canEditMetadata = doc?.isOwner || doc?.userPermission === 'edit';
  const canDelete = doc?.isOwner || currentUser?.role === 'administrator';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '780px' }}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-box">
            <div className="modal-icon-badge">
              <FileText size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h3 className="modal-title">{doc?.displayName || 'Document Details'}</h3>
                {doc && <span className="badge badge-cat">{doc.category}</span>}
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: 0 }}>
                ID: <code className="font-mono">{doc?.id}</code>
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="modal-tabs">
          <button
            className={`modal-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          {canManageAccess && (
            <button
              className={`modal-tab-btn ${activeTab === 'access' ? 'active' : ''}`}
              onClick={() => setActiveTab('access')}
            >
              <Key size={14} />
              <span>Secure Sharing ({grants.length})</span>
            </button>
          )}
          {canManageAccess && (
            <button
              className={`modal-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
              onClick={() => setActiveTab('audit')}
            >
              <Clock size={14} />
              <span>Audit Trail ({auditEvents.length})</span>
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {error ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-rose)' }}>
              <AlertCircle size={32} style={{ margin: '0 auto 0.75rem' }} />
              <p>{error}</p>
            </div>
          ) : loading || !doc ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>
              Loading document metadata...
            </div>
          ) : (
            <div>
              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Metadata Grid */}
                  <div className="modal-meta-grid">
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                        Document Owner
                      </span>
                      <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)', marginTop: '0.1rem' }}>
                        {doc.ownerName}
                      </p>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                        Your Access Rights
                      </span>
                      <p style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--emerald-dark)', marginTop: '0.1rem' }}>
                        {doc.userPermission.toUpperCase()} {doc.isOwner && '(OWNER)'}
                      </p>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                        File Size
                      </span>
                      <p style={{ fontSize: '0.9rem', fontWeight: 500, marginTop: '0.1rem' }}>
                        {(doc.sizeBytes / 1024).toFixed(1)} KB ({doc.sizeBytes} bytes)
                      </p>
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                        Detected MIME Type
                      </span>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.1rem', wordBreak: 'break-all' }}>
                        {doc.detectedContentType}
                      </p>
                    </div>
                  </div>

                  {/* SHA-256 Digest Box */}
                  <div className="modal-sha-box">
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Cryptographic SHA-256 Checksum
                    </span>
                    <div className="modal-sha-row">
                      <code className="font-mono" style={{ fontSize: '0.8rem', color: '#0369a1', wordBreak: 'break-all' }}>
                        {doc.sha256Hex}
                      </code>
                      <button
                        className="btn btn-secondary flex-shrink-0"
                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                        onClick={handleCopySha}
                        title="Copy SHA-256"
                      >
                        {copiedSha ? <Check size={14} className="text-emerald" /> : <Copy size={14} />}
                        <span>{copiedSha ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Action Bar */}
                  <div className="modal-actions-bar">
                    <div className="modal-actions-left">
                      <button className="btn btn-primary" onClick={handleDownload}>
                        <Download size={16} />
                        <span>Download Decrypted Stream</span>
                      </button>
                      {canEditMetadata && !isEditing && (
                        <button className="btn btn-secondary" onClick={() => setIsEditing(true)}>
                          <Edit2 size={14} />
                          <span>Edit Metadata</span>
                        </button>
                      )}
                    </div>

                    {canDelete && (
                      <button className="btn btn-danger" onClick={() => setShowDeleteConfirm(true)}>
                        <Trash2 size={15} />
                        <span>Soft-Delete</span>
                      </button>
                    )}
                  </div>

                  {/* Inline Metadata Edit Form */}
                  {isEditing && (
                    <div
                      style={{
                        background: '#f8fafc',
                        border: '1px solid var(--border-subtle)',
                        padding: '1.25rem',
                        borderRadius: '10px',
                      }}
                    >
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                        Update Document Metadata
                      </h4>
                      <div className="modal-edit-grid">
                        <div>
                          <label className="form-label">Display Name</label>
                          <input
                            className="input-field"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="form-label">Category</label>
                          <input
                            className="input-field"
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary" onClick={() => setIsEditing(false)}>
                          Cancel
                        </button>
                        <button className="btn btn-primary" onClick={handleSaveMetadata}>
                          Save Changes
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Inline Delete Confirmation */}
                  {showDeleteConfirm && (
                    <div
                      style={{
                        background: 'var(--color-rose-light)',
                        border: '1px solid var(--color-rose-border)',
                        padding: '1.25rem',
                        borderRadius: '10px',
                      }}
                    >
                      <h4 style={{ fontSize: '0.9rem', color: 'var(--color-rose)', fontWeight: 600, marginBottom: '0.4rem' }}>
                        Confirm Soft-Deletion
                      </h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                        A reason is mandatory and will be cryptographically written into the immutable audit chain.
                      </p>
                      <input
                        className="input-field"
                        placeholder="Enter deletion justification..."
                        value={deleteReason}
                        onChange={(e) => setDeleteReason(e.target.value)}
                        style={{ marginBottom: '0.75rem' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)}>
                          Cancel
                        </button>
                        <button className="btn btn-danger" onClick={handleDelete}>
                          Confirm Soft-Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: ACCESS GRANTS (SHARING) */}
              {activeTab === 'access' && canManageAccess && (
                <div>
                  {/* Grant Access Form */}
                  <form
                    onSubmit={handleAddGrant}
                    className="grant-access-form"
                  >
                    <div className="grant-user-select-wrap">
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
                    </div>

                    <div className="grant-level-select-wrap">
                      <select
                        className="input-field"
                        value={grantLevel}
                        onChange={(e) => setGrantLevel(e.target.value as any)}
                      >
                        <option value="read">Viewer (Read)</option>
                        <option value="edit">Editor (Edit)</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      className="btn btn-primary grant-submit-btn"
                      disabled={grantLoading || !targetUserId}
                    >
                      <UserPlus size={16} />
                      <span>Grant</span>
                    </button>
                  </form>

                  {/* Grants Table */}
                  <div className="table-card">
                    <div className="table-wrapper">
                    <table className="saas-table">
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>Email</th>
                          <th>Permission</th>
                          <th>Granted Date</th>
                          <th style={{ textAlign: 'right' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grants.length === 0 ? (
                          <tr>
                            <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '2rem' }}>
                              No named user grants. Only the document owner can access this file.
                            </td>
                          </tr>
                        ) : (
                          grants.map((g) => (
                            <tr key={g.userId}>
                              <td style={{ fontWeight: 600 }}>{g.userDisplayName}</td>
                              <td style={{ color: 'var(--text-dim)' }}>{g.userEmail}</td>
                              <td>
                                <span className={`badge ${g.permission === 'edit' ? 'badge-perm-edit' : 'badge-perm-read'}`}>
                                  {g.permission}
                                </span>
                              </td>
                              <td style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                                {new Date(g.createdAt).toLocaleDateString()}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <button
                                  className="btn btn-danger"
                                  style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem' }}
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
                </div>
              )}

              {/* TAB 3: AUDIT TRAIL */}
              {activeTab === 'audit' && canManageAccess && (
                <div className="table-card">
                  <div className="table-wrapper">
                    <table className="saas-table">
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
                            <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-dim)', padding: '2rem' }}>
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
                              <td style={{ fontSize: '0.85rem', fontWeight: 500 }}>
                                {evt.actorLabelSnapshot || 'System'}
                              </td>
                              <td style={{ fontWeight: 600, fontSize: '0.8rem' }}>
                                {evt.action}
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
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
