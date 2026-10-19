import { describe, it, expect } from 'vitest';
import { validateUploadFile } from '../../server/src/documents/uploadValidation.js';

describe('Upload Validation & Security Checks (Section 10)', () => {
  it('accepts valid PDF with proper %PDF magic bytes and matching extension', () => {
    const validPdfBuffer = Buffer.from('%PDF-1.7 valid content for security testing');
    const result = validateUploadFile(validPdfBuffer, 'Monthly_Report.pdf', 'application/pdf');

    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.file.sanitizedName).toBe('Monthly_Report.pdf');
      expect(result.file.detectedMimeType).toBe('application/pdf');
      expect(result.file.storageKey).toMatch(/^doc_/);
      expect(result.file.sha256Hex).toHaveLength(64);
    }
  });

  it('rejects double extension attack (e.g. payload.exe.pdf)', () => {
    const fakeBuffer = Buffer.from('%PDF-1.4 malicious shell');
    const result = validateUploadFile(fakeBuffer, 'trojan.exe.pdf', 'application/pdf');

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain('Disallowed dangerous secondary extension: .exe');
    }
  });

  it('rejects path traversal attempts in raw filename', () => {
    const fakeBuffer = Buffer.from('%PDF-1.4');
    const result = validateUploadFile(fakeBuffer, '../../etc/passwd.pdf', 'application/pdf');

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain('path traversal detected');
    }
  });

  it('rejects MIME signature mismatch (text content claiming to be PDF)', () => {
    const textBuffer = Buffer.from('This is plain text disguised as a PDF file.');
    const result = validateUploadFile(textBuffer, 'fake.pdf', 'application/pdf');

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain('MIME signature mismatch');
    }
  });

  it('rejects active content such as HTML or script tags even in text files', () => {
    const htmlBuffer = Buffer.from('<html><script>alert("XSS")</script></html>');
    const result = validateUploadFile(htmlBuffer, 'notes.txt', 'text/plain');

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain('Unrecognized or dangerous file signature');
    }
  });

  it('rejects oversized files exceeding maximum byte limit', () => {
    const smallLimit = 100;
    const oversizedBuffer = Buffer.alloc(150, 0x25); // 150 bytes
    const result = validateUploadFile(oversizedBuffer, 'large.pdf', 'application/pdf', smallLimit);

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain('exceeds maximum permitted limit');
    }
  });
});
