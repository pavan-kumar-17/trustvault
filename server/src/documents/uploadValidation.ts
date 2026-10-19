import crypto from 'crypto';
import path from 'path';

export interface ValidatedFile {
  originalName: string;
  sanitizedName: string;
  storageKey: string;
  detectedMimeType: string;
  sizeBytes: number;
  sha256Hex: string;
  buffer: Buffer;
}

export interface ValidationFailure {
  valid: false;
  reason: string;
}

export interface ValidationSuccess {
  valid: true;
  file: ValidatedFile;
}

export type FileValidationResult = ValidationSuccess | ValidationFailure;

// Allowed extensions and corresponding MIME types
const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.txt': ['text/plain'],
};

// Strict magic bytes signature check
function detectMagicMime(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;

  // PDF: %PDF (25 50 44 46)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // ZIP-based Office Open XML (DOCX, XLSX): PK.. (50 4B 03 04)
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return 'application/zip-package';
  }

  // Plain Text: verify printable characters, strictly no HTML or script tags
  const textSample = buffer.slice(0, Math.min(buffer.length, 1024)).toString('utf8');
  if (/<[a-z/][\s\S]*>/i.test(textSample)) {
    // Contains HTML or script tags -> reject as active content
    return null;
  }

  // Check if buffer is valid UTF-8 without control bytes
  let isPrintable = true;
  for (let i = 0; i < Math.min(buffer.length, 256); i++) {
    const byte = buffer[i]!;
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) {
      isPrintable = false;
      break;
    }
  }

  if (isPrintable) {
    return 'text/plain';
  }

  return null;
}

/**
 * Validates uploaded file against size limits, extension allowlists,
 * double extensions, path traversal, and magic byte signatures.
 */
export function validateUploadFile(
  fileBuffer: Buffer,
  rawFilename: string,
  claimedMime: string,
  maxSizeBytes: number = 10485760
): FileValidationResult {
  // 1. Size check
  if (!fileBuffer || fileBuffer.length === 0) {
    return { valid: false, reason: 'File is empty' };
  }

  if (fileBuffer.length > maxSizeBytes) {
    return {
      valid: false,
      reason: `File size ${fileBuffer.length} exceeds maximum permitted limit ${maxSizeBytes} bytes`,
    };
  }

  // 2. Traversal and control characters check
  if (rawFilename.includes('..') || rawFilename.includes('/') || rawFilename.includes('\\')) {
    return { valid: false, reason: 'Invalid characters in filename (path traversal detected)' };
  }

  // 3. Prevent double extension attacks (e.g. payload.exe.pdf or payload.php.docx)
  const basename = path.basename(rawFilename);
  const parts = basename.split('.');
  if (parts.length > 2) {
    const dangerousExts = ['exe', 'bat', 'sh', 'php', 'js', 'py', 'cmd', 'ps1', 'vbs', 'html', 'htm', 'svg'];
    for (let i = 1; i < parts.length - 1; i++) {
      if (dangerousExts.includes(parts[i]!.toLowerCase())) {
        return { valid: false, reason: `Disallowed dangerous secondary extension: .${parts[i]}` };
      }
    }
  }

  // 4. Extension check
  const ext = path.extname(basename).toLowerCase();
  const allowedMimesForExt = ALLOWED_EXTENSIONS[ext];
  if (!allowedMimesForExt) {
    return { valid: false, reason: `Disallowed file extension: ${ext || '(none)'}` };
  }

  // 5. Magic signature verification
  const signatureMime = detectMagicMime(fileBuffer);
  if (!signatureMime) {
    return { valid: false, reason: 'Unrecognized or dangerous file signature' };
  }

  // Check signature match against extension
  let detectedContentType = signatureMime;

  if (signatureMime === 'application/zip-package') {
    if (ext === '.docx') {
      detectedContentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (ext === '.xlsx') {
      detectedContentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    } else {
      return { valid: false, reason: 'Generic zip files are not permitted; must be docx or xlsx' };
    }
  } else if (!allowedMimesForExt.includes(signatureMime)) {
    return {
      valid: false,
      reason: `MIME signature mismatch: file content (${signatureMime}) does not match extension ${ext}`,
    };
  }

  // 6. Sanitize filename (alphanumeric, underscores, hyphens, periods)
  const cleanBase = path.basename(basename, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
  const sanitizedName = `${cleanBase}${ext}`;

  // 7. Compute SHA-256 and generate opaque storage key
  const sha256Hex = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const storageKey = `doc_${crypto.randomUUID()}_${Date.now()}.bin`;

  return {
    valid: true,
    file: {
      originalName: rawFilename,
      sanitizedName,
      storageKey,
      detectedMimeType: detectedContentType,
      sizeBytes: fileBuffer.length,
      sha256Hex,
      buffer: fileBuffer,
    },
  };
}
