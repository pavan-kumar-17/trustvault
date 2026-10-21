import React, { useState } from 'react';
import { api } from '../../lib/api.js';
import { UploadCloud, X, AlertCircle, FileCheck, ShieldCheck } from 'lucide-react';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>('general');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file to upload');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', category);

      await api.uploadDocument(formData);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-box">
            <div className="modal-icon-badge">
              <UploadCloud size={18} />
            </div>
            <div>
              <h3 className="modal-title">Upload Secure Document</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: 0 }}>
                Encrypted and verified with cryptographic SHA-256
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {error && (
            <div
              style={{
                background: 'var(--color-rose-light)',
                border: '1px solid var(--color-rose-border)',
                color: 'var(--color-rose)',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                marginBottom: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.85rem',
              }}
            >
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleUpload}>
            {/* File Drag & Drop Zone */}
            <div className="form-group">
              <label className="form-label">
                Document File (PDF, DOCX, XLSX, PNG, JPEG, TXT — max 10MB)
              </label>
              <div className="upload-dropzone">
                <input
                  type="file"
                  onChange={handleFileChange}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0,
                    cursor: 'pointer',
                    width: '100%',
                    height: '100%',
                  }}
                />
                {file ? (
                  <div className="flex-center gap-1" style={{ flexDirection: 'column' }}>
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        background: 'var(--emerald-light)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--emerald-primary)',
                        marginBottom: '0.5rem',
                      }}
                    >
                      <FileCheck size={22} />
                    </div>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      {file.name}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      {(file.size / 1024).toFixed(1)} KB • Ready for cryptographic sealing
                    </span>
                  </div>
                ) : (
                  <div>
                    <UploadCloud size={32} className="dropzone-icon" />
                    <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-main)', marginBottom: '0.2rem' }}>
                      Click to choose a file or drag and drop here
                    </p>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                      Strict magic-byte validation and SHA-256 digest computed
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Category Selector */}
            <div className="form-group">
              <label className="form-label">Vault Category</label>
              <select
                className="input-field"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="finance">Finance</option>
                <option value="strategy">Strategy</option>
                <option value="legal">Legal</option>
                <option value="hr">Human Resources (HR)</option>
                <option value="engineering">Engineering</option>
                <option value="general">General</option>
              </select>
            </div>

            {/* Security Notice */}
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
              }}
            >
              <ShieldCheck size={18} className="text-emerald" style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Your file will be encrypted in private object storage. Only you and explicitly authorized accounts will have decryption rights.
              </span>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading || !file}
              >
                {loading ? 'Encrypting & Sealing...' : 'Upload to Vault'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
