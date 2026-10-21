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
  Folder,
  LayoutGrid,
  List,
  Copy,
  Check,
  Shield,
  Eye,
  Trash2,
  Share2,
  HardDrive
} from 'lucide-react';

interface WorkspaceProps {
  currentUser: UserProfile | null;
  onOpenUpload: () => void;
  onOpenDetails: (id: string) => void;
  refreshTrigger: number;
  externalSearch?: string;
  onStatsUpdate?: (stats: { count: number; bytes: number }) => void;
}

export const Workspace: React.FC<WorkspaceProps> = ({
  currentUser,
  onOpenUpload,
  onOpenDetails,
  refreshTrigger,
  externalSearch = '',
  onStatsUpdate,
}) => {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Controls
  const [query, setQuery] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [sort, setSort] = useState<string>('created_at:desc');
  const [page, setPage] = useState<number>(1);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [copiedSha, setCopiedSha] = useState<string | null>(null);
  const limit = 8;

  // Real Category Counts (derived from loaded documents)
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (externalSearch !== undefined && externalSearch !== query) {
      setQuery(externalSearch);
      setPage(1);
    }
  }, [externalSearch]);

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

      // Compute real metrics for parent
      const totalBytes = data.items.reduce((acc, curr) => acc + (curr.sizeBytes || 0), 0);
      if (onStatsUpdate) {
        onStatsUpdate({ count: data.total, bytes: totalBytes });
      }

      // Count by category
      const counts: Record<string, number> = {};
      data.items.forEach((d) => {
        const cat = d.category?.toLowerCase() || 'general';
        counts[cat] = (counts[cat] || 0) + 1;
      });
      setCategoryCounts(counts);
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

  const handleCopySha = (sha: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(sha);
    setCopiedSha(sha);
    setTimeout(() => setCopiedSha(null), 2000);
  };

  const getFileIcon = (contentType: string) => {
    if (contentType.includes('pdf')) {
      return (
        <div className="doc-icon-box pdf">
          <FileText size={18} />
        </div>
      );
    }
    if (contentType.includes('sheet') || contentType.includes('excel') || contentType.includes('csv')) {
      return (
        <div className="doc-icon-box sheet">
          <FileSpreadsheet size={18} />
        </div>
      );
    }
    if (contentType.includes('word') || contentType.includes('document')) {
      return (
        <div className="doc-icon-box doc">
          <FileCode size={18} />
        </div>
      );
    }
    return (
      <div className="doc-icon-box generic">
        <File size={18} />
      </div>
    );
  };

  const getPermissionBadge = (perm: string, isOwner: boolean) => {
    if (isOwner) {
      return <span className="badge badge-perm-owner">Owner</span>;
    }
    if (perm === 'edit') {
      return <span className="badge badge-perm-edit">Editor</span>;
    }
    return <span className="badge badge-perm-read">Viewer</span>;
  };

  const totalPages = Math.ceil(total / limit) || 1;
  const canUpload = currentUser?.role === 'document_owner' || currentUser?.role === 'administrator';

  const categoriesList = [
    { id: '', name: 'All Files', count: total },
    { id: 'finance', name: 'Finance', count: categoryCounts['finance'] || 0 },
    { id: 'strategy', name: 'Strategy', count: categoryCounts['strategy'] || 0 },
    { id: 'legal', name: 'Legal', count: categoryCounts['legal'] || 0 },
    { id: 'hr', name: 'HR', count: categoryCounts['hr'] || 0 },
    { id: 'general', name: 'General', count: categoryCounts['general'] || 0 },
  ];

  return (
    <div className="documents-page">
      {/* 1. Page Header */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Documents</h1>
          <p className="page-subtitle">
            Secure Zero-Trust file repository. Explicit permissions and tamper-evident audit logging.
          </p>
        </div>

        {canUpload && (
          <button className="btn btn-primary page-upload-btn" onClick={onOpenUpload}>
            <Upload size={16} />
            <span>Upload Document</span>
          </button>
        )}
      </div>

      {/* 2. Category Folders (Matching reference layout cards) */}
      <div className="category-folders-grid">
        {categoriesList.map((cat) => (
          <div
            key={cat.id || 'all'}
            className={`folder-card ${category === cat.id ? 'active' : ''}`}
            onClick={() => {
              setCategory(cat.id);
              setPage(1);
            }}
          >
            <div className="folder-card-left">
              <div className="folder-icon-wrap">
                <Folder size={18} className={category === cat.id ? 'text-emerald' : 'text-muted'} />
              </div>
              <span className="folder-name">{cat.name}</span>
            </div>
            <span className="folder-count-badge">{cat.count}</span>
          </div>
        ))}
      </div>

      {/* 3. Filter & Controls Toolbar */}
      <div className="filter-toolbar-card">
        {/* Search */}
        <div className="toolbar-search">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="toolbar-search-input"
            placeholder="Search documents by name, category, or owner..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </div>

        {/* Toolbar Controls */}
        <div className="toolbar-controls">
          {/* Category Dropdown */}
          <div className="select-wrapper">
            <Filter size={14} className="select-icon" />
            <select
              className="custom-select"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Categories</option>
              <option value="finance">Finance</option>
              <option value="strategy">Strategy</option>
              <option value="legal">Legal</option>
              <option value="hr">HR</option>
              <option value="engineering">Engineering</option>
              <option value="general">General</option>
            </select>
          </div>

          {/* Sort Selector */}
          <div className="select-wrapper">
            <ArrowUpDown size={14} className="select-icon" />
            <select
              className="custom-select"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="created_at:desc">Newest First</option>
              <option value="created_at:asc">Oldest First</option>
              <option value="name:asc">Name (A-Z)</option>
              <option value="name:desc">Name (Z-A)</option>
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className="view-toggle-wrap">
            <button
              className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
              onClick={() => setViewMode('table')}
              title="Table View"
            >
              <List size={16} />
            </button>
            <button
              className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => setViewMode('grid')}
              title="Grid View"
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* 4. Documents Display: Table or Grid */}
      {viewMode === 'table' ? (
        <div className="table-card">
          <div className="table-wrapper">
            <table className="saas-table">
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
                    <td colSpan={7} style={{ textAlign: 'center', padding: '3.5rem', color: 'var(--text-dim)' }}>
                      <div className="flex-center gap-1">
                        <span className="spin" style={{ display: 'inline-block', width: '18px', height: '18px', border: '2px solid var(--emerald-primary)', borderTopColor: 'transparent', borderRadius: '50%' }} />
                        <span style={{ marginLeft: '0.5rem' }}>Loading authorized documents...</span>
                      </div>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-rose)' }}>
                      {error}
                    </td>
                  </tr>
                ) : documents.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state-box">
                        <div className="empty-state-icon">
                          <Shield size={28} />
                        </div>
                        <h4 className="empty-state-title">No Accessible Documents</h4>
                        <p className="empty-state-desc">
                          Under Zero-Trust rules, you only have visibility over documents you explicitly own or have been granted active permissions to view.
                        </p>
                        {canUpload && (
                          <button className="btn btn-primary" onClick={onOpenUpload}>
                            <Upload size={14} />
                            Upload First File
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  documents.map((doc) => (
                    <tr
                      key={doc.id}
                      onClick={() => onOpenDetails(doc.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* Name & File Type */}
                      <td>
                        <div className="doc-name-cell">
                          {getFileIcon(doc.detectedContentType)}
                          <div>
                            <div className="doc-name-text" title={doc.displayName}>
                              {doc.displayName}
                            </div>
                            <div className="flex-center" style={{ justifyContent: 'flex-start', gap: '0.4rem', marginTop: '0.15rem' }}>
                              <span className="doc-sha-hash">
                                SHA: {doc.sha256Hex.slice(0, 12)}...
                              </span>
                              <button
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 0 }}
                                onClick={(e) => handleCopySha(doc.sha256Hex, e)}
                                title="Copy Full SHA-256 Hash"
                              >
                                {copiedSha === doc.sha256Hex ? (
                                  <Check size={12} className="text-emerald" />
                                ) : (
                                  <Copy size={12} />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td>
                        <span className="badge badge-cat">{doc.category}</span>
                      </td>

                      {/* Owner */}
                      <td style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                        {doc.ownerName}
                      </td>

                      {/* Size */}
                      <td style={{ color: 'var(--text-dim)', fontSize: '0.825rem' }}>
                        {(doc.sizeBytes / 1024).toFixed(1)} KB
                      </td>

                      {/* Access Right */}
                      <td>
                        {getPermissionBadge(doc.userPermission, doc.isOwner)}
                      </td>

                      {/* Date */}
                      <td style={{ color: 'var(--text-dim)', fontSize: '0.825rem' }}>
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                            onClick={(e) => handleDownload(doc, e)}
                            title="Download Stream"
                          >
                            <Download size={14} />
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenDetails(doc.id);
                            }}
                            title="Manage Access & Details"
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

          {/* Pagination */}
          <div className="pagination-bar">
            <span className="pagination-text">
              Showing {documents.length} of {total} accessible document{total === 1 ? '' : 's'}
            </span>
            <div className="pagination-controls">
              <button
                className="btn btn-secondary"
                style={{ padding: '0.3rem 0.65rem' }}
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '0 0.5rem' }}>
                Page {page} of {totalPages}
              </span>
              <button
                className="btn btn-secondary"
                style={{ padding: '0.3rem 0.65rem' }}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Grid View Cards */
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
              Loading documents grid...
            </div>
          ) : documents.length === 0 ? (
            <div className="empty-state-box" style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
              <div className="empty-state-icon">
                <Shield size={28} />
              </div>
              <h4 className="empty-state-title">No Accessible Documents</h4>
              <p className="empty-state-desc">
                Under Zero-Trust rules, you only have visibility over documents you explicitly own or have been granted active permissions to view.
              </p>
            </div>
          ) : (
            <div className="documents-grid">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="grid-doc-card"
                  onClick={() => onOpenDetails(doc.id)}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                      {getFileIcon(doc.detectedContentType)}
                      <span className="badge badge-cat">{doc.category}</span>
                    </div>

                    <h4
                      style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.25rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={doc.displayName}
                    >
                      {doc.displayName}
                    </h4>

                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '0.75rem' }}>
                      Owner: <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>{doc.ownerName}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-dim)', padding: '0.5rem 0', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', marginBottom: '0.75rem' }}>
                      <span>{(doc.sizeBytes / 1024).toFixed(1)} KB</span>
                      <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                    {getPermissionBadge(doc.userPermission, doc.isOwner)}

                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.3rem 0.5rem' }}
                        onClick={(e) => handleDownload(doc, e)}
                        title="Download"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '0.3rem 0.5rem' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDetails(doc.id);
                        }}
                        title="Details"
                      >
                        <Info size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
