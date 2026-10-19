import React, { useState, useEffect } from 'react';
import { DocumentItem, UserProfile } from '../../types.js';
import { api } from '../../lib/api.js';
import {
  Search,
  Filter,
  ArrowUpDown,
  Upload,
  Download,
  Info,
  FileText,
  FileSpreadsheet,
  FileCode,
  File,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface WorkspaceProps {
  currentUser: UserProfile | null;
  onOpenUpload: () => void;
  onOpenDetails: (id: string) => void;
  refreshTrigger: number;
}

export const Workspace: React.FC<WorkspaceProps> = ({
  currentUser,
  onOpenUpload,
  onOpenDetails,
  refreshTrigger,
}) => {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Pagination
  const [query, setQuery] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [sort, setSort] = useState<string>('created_at:desc');
  const [page, setPage] = useState<number>(1);
  const limit = 8;

  useEffect(() => {
    fetchDocuments();
  }, [currentUser?.id, query, category, sort, page, refreshTrigger]);

  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getDocuments({
        q: query,
        category: category || undefined,
        sort,
        page,
        limit,
      });
      setDocuments(data.items);
      setTotal(data.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (doc: DocumentItem, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.downloadDocument(doc.id, doc.displayName);
    } catch (err: any) {
      alert(`Download failed: ${err.message}`);
    }
  };

  const getFileIcon = (contentType: string) => {
    if (contentType.includes('pdf')) return <FileText size={18} color="#f43f5e" />;
    if (contentType.includes('sheet') || contentType.includes('excel'))
      return <FileSpreadsheet size={18} color="#10b981" />;
    if (contentType.includes('word') || contentType.includes('document'))
      return <FileCode size={18} color="#3b82f6" />;
    return <File size={18} color="#a855f7" />;
  };

  const totalPages = Math.ceil(total / limit) || 1;
  const canUpload = currentUser?.role === 'document_owner' || currentUser?.role === 'administrator';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Filter and Action Bar */}
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Search Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: '1', minWidth: '260px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              className="input-field"
              placeholder="Search accessible documents by name or category..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              style={{ paddingLeft: '2.5rem' }}
            />
          </div>
        </div>

        {/* Filters and Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Category Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Filter size={15} color="var(--text-dim)" />
            <select
              className="input-field"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              style={{ width: 'auto', padding: '0.5rem 0.75rem' }}
            >
              <option value="">All Categories</option>
              <option value="finance">Finance</option>
              <option value="strategy">Strategy</option>
              <option value="legal">Legal</option>
              <option value="hr">HR</option>
              <option value="general">General</option>
            </select>
          </div>

          {/* Sort Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ArrowUpDown size={15} color="var(--text-dim)" />
            <select
              className="input-field"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              style={{ width: 'auto', padding: '0.5rem 0.75rem' }}
            >
              <option value="created_at:desc">Newest First</option>
              <option value="created_at:asc">Oldest First</option>
              <option value="name:asc">Name (A-Z)</option>
              <option value="name:desc">Name (Z-A)</option>
            </select>
          </div>

          {/* Upload Button */}
          {canUpload && (
            <button className="btn btn-primary" onClick={onOpenUpload}>
              <Upload size={16} />
              Upload Document
            </button>
          )}
        </div>
      </div>

      {/* Primary Documents Table */}
      <div className="glass-panel" style={{ padding: '0.5rem 0' }}>
        <div className="table-wrapper">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Document Name</th>
                <th>Category</th>
                <th>Owner</th>
                <th>Size</th>
                <th>Access Right</th>
                <th>Uploaded</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                    Loading authorized documents...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: '#fb7185' }}>
                    {error}
                  </td>
                </tr>
              ) : documents.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3.5rem', color: 'var(--text-dim)' }}>
                    <p style={{ fontSize: '1rem', fontWeight: 500, marginBottom: '0.25rem' }}>No accessible documents found</p>
                    <span style={{ fontSize: '0.8rem' }}>
                      Zero-Trust Principle: You only see documents you explicitly own or have been granted access to.
                    </span>
                  </td>
                </tr>
              ) : (
                documents.map((doc) => (
                  <tr
                    key={doc.id}
                    onClick={() => onOpenDetails(doc.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {getFileIcon(doc.detectedContentType)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{doc.displayName}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }} className="font-mono">
                            {doc.sha256Hex.slice(0, 16)}...
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-viewer">{doc.category}</span>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{doc.ownerName}</td>
                    <td style={{ fontSize: '0.825rem', color: 'var(--text-dim)' }}>
                      {(doc.sizeBytes / 1024).toFixed(1)} KB
                    </td>
                    <td>
                      <span className={`badge ${doc.isOwner ? 'badge-owner' : doc.userPermission === 'edit' ? 'badge-admin' : 'badge-active'}`}>
                        {doc.userPermission.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.825rem', color: 'var(--text-dim)' }}>
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                          onClick={(e) => handleDownload(doc, e)}
                          title="Stream Download"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenDetails(doc.id);
                          }}
                          title="View Details & Manage Grants"
                        >
                          <Info size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.85rem 1.25rem', borderTop: '1px solid var(--border-subtle)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
            Showing {documents.length} of {total} accessible document{total === 1 ? '' : 's'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              className="btn btn-secondary"
              style={{ padding: '0.3rem 0.6rem' }}
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Page {page} of {totalPages}
            </span>
            <button
              className="btn btn-secondary"
              style={{ padding: '0.3rem 0.6rem' }}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
