import { Readable } from 'stream';
import { Response } from 'express';

export interface StorageDriver {
  saveObject(key: string, buffer: Buffer, contentType: string): Promise<void>;
  getObjectStream(key: string): Promise<Readable | null>;
  deleteObject(key: string): Promise<void>;
  hasObject(key: string): Promise<boolean>;
}

/**
 * In-memory storage driver for deterministic test suites, local development,
 * and high-speed unit tests without external network dependencies.
 */
class MemoryStorageDriver implements StorageDriver {
  private objects = new Map<string, { buffer: Buffer; contentType: string }>();

  async saveObject(key: string, buffer: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { buffer, contentType });
  }

  async getObjectStream(key: string): Promise<Readable | null> {
    const item = this.objects.get(key);
    if (!item) return null;
    return Readable.from(item.buffer);
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async hasObject(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  public reset(): void {
    this.objects.clear();
  }
}

export const privateStorage: StorageDriver = new MemoryStorageDriver();

/**
 * Streams private document bytes directly to the Express HTTP response.
 * Strictly sets attachment Content-Disposition and nosniff to prevent browser execution.
 */
export async function streamDocumentToResponse(
  res: Response,
  storageKey: string,
  downloadName: string,
  mimeType: string,
  sizeBytes: number
): Promise<boolean> {
  const stream = await privateStorage.getObjectStream(storageKey);
  if (!stream) {
    return false;
  }

  // Safe headers to prevent inline XSS and ensure download behavior
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Length', sizeBytes);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

  stream.pipe(res);
  return true;
}
