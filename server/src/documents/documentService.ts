import crypto from 'crypto';
import { DocumentRecord, GrantRecord, evaluateDocumentPolicy } from '../policy/documentPolicy.js';
import { PermissionLevel } from '../schemas/index.js';
import { privateStorage } from './privateStorage.js';

/**
 * Data repository for documents and grants.
 * Implements scoped SQL queries and atomic grant modifications.
 */
class DocumentRepository {
  private documents = new Map<string, DocumentRecord>();
  private grants = new Map<string, GrantRecord>(); // key: `${docId}_${userId}`

  constructor() {
    this.seedDefaultDocuments();
  }

  public seedDefaultDocuments(): void {
    this.documents.clear();
    this.grants.clear();

    const docA: DocumentRecord = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ownerId: '22222222-2222-4222-8222-222222222222', // ownerA
      storageKey: 'storage_key_doc_a_secret.bin',
      displayName: 'Financial_Report_Q3.pdf',
      category: 'finance',
      detectedContentType: 'application/pdf',
      sizeBytes: 1024,
      sha256Hex: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      status: 'active',
      createdAt: new Date(Date.now() - 172800000),
      updatedAt: new Date(Date.now() - 172800000),
      deletedAt: null,
    };

    const docB: DocumentRecord = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      ownerId: '33333333-3333-4333-8333-333333333333', // ownerB
      storageKey: 'storage_key_doc_b_secret.bin',
      displayName: 'Confidential_Strategy_2027.docx',
      category: 'strategy',
      detectedContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: 2048,
      sha256Hex: 'f2ca1bb6c7e907d06dafe4687e579fce76b37e4e93b7605022da52e6ccc26fd2',
      status: 'active',
      createdAt: new Date(Date.now() - 86400000),
      updatedAt: new Date(Date.now() - 86400000),
      deletedAt: null,
    };

    const docDeleted: DocumentRecord = {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      ownerId: '22222222-2222-4222-8222-222222222222', // ownerA
      storageKey: 'storage_key_doc_del_secret.bin',
      displayName: 'Old_Draft_Archive.pdf',
      category: 'archive',
      detectedContentType: 'application/pdf',
      sizeBytes: 512,
      sha256Hex: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
      status: 'deleted',
      createdAt: new Date(Date.now() - 432000000),
      updatedAt: new Date(Date.now() - 3600000),
      deletedAt: new Date(Date.now() - 3600000),
    };

    this.documents.set(docA.id, docA);
    this.documents.set(docB.id, docB);
    this.documents.set(docDeleted.id, docDeleted);

    // Save synthetic bytes into private storage matching sizeBytes exactly
    const bufferA = Buffer.concat([
      Buffer.from('%PDF-1.4 Synthetic docA financial report\n'),
      Buffer.alloc(500, 0x20),
    ]);
    const bufferB = Buffer.concat([
      Buffer.from('PK\x03\x04 Synthetic docB strategy docx\n'),
      Buffer.alloc(500, 0x20),
    ]);

    docA.sizeBytes = bufferA.length;
    docB.sizeBytes = bufferB.length;

    privateStorage.saveObject(docA.storageKey, bufferA, 'application/pdf');
    privateStorage.saveObject(docB.storageKey, bufferB, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    // Seed grant: viewerA has read grant on docA
    const grantKey = `${docA.id}_44444444-4444-4444-8444-444444444444`;
    this.grants.set(grantKey, {
      documentId: docA.id,
      userId: '44444444-4444-4444-8444-444444444444',
      permission: 'read',
      grantedBy: '22222222-2222-4222-8222-222222222222',
      createdAt: new Date(Date.now() - 86400000),
      updatedAt: new Date(Date.now() - 86400000),
    });
  }

  public getById(id: string): DocumentRecord | undefined {
    return this.documents.get(id);
  }

  public getGrant(documentId: string, userId: string): GrantRecord | undefined {
    return this.grants.get(`${documentId}_${userId}`);
  }

  public getGrantsForDocument(documentId: string): GrantRecord[] {
    return Array.from(this.grants.values()).filter((g) => g.documentId === documentId);
  }

  public setGrant(documentId: string, userId: string, permission: PermissionLevel, grantedBy: string): GrantRecord {
    const key = `${documentId}_${userId}`;
    const record: GrantRecord = {
      documentId,
      userId,
      permission,
      grantedBy,
      createdAt: this.grants.get(key)?.createdAt || new Date(),
      updatedAt: new Date(),
    };
    this.grants.set(key, record);
    return record;
  }

  public revokeGrant(documentId: string, userId: string): boolean {
    return this.grants.delete(`${documentId}_${userId}`);
  }

  public createDocument(doc: Omit<DocumentRecord, 'id' | 'createdAt' | 'updatedAt'>): DocumentRecord {
    const id = crypto.randomUUID();
    const now = new Date();
    const record: DocumentRecord = {
      ...doc,
      id,
      createdAt: now,
      updatedAt: now,
    };
    this.documents.set(id, record);
    return record;
  }

  public updateMetadata(id: string, updates: { displayName?: string; category?: string }): DocumentRecord | null {
    const doc = this.documents.get(id);
    if (!doc || doc.status === 'deleted') return null;

    if (updates.displayName) doc.displayName = updates.displayName;
    if (updates.category) doc.category = updates.category;
    doc.updatedAt = new Date();
    return doc;
  }

  public softDelete(id: string): DocumentRecord | null {
    const doc = this.documents.get(id);
    if (!doc || doc.status === 'deleted') return null;

    doc.status = 'deleted';
    doc.deletedAt = new Date();
    doc.updatedAt = new Date();
    return doc;
  }

  /**
   * Scoped search/list query:
   * STRICT ACCESS PREDICATE applied BEFORE counts, filters, and pagination.
   * A document is visible if and only if:
   * 1. status === 'active'
   * 2. (ownerId === userId OR user has active grant in document_grants)
   */
  public listAccessibleDocuments(
    userId: string,
    options: {
      q?: string;
      category?: string;
      sort?: string;
      page?: number;
      limit?: number;
    }
  ): { items: DocumentRecord[]; total: number } {
    const accessibleDocs: DocumentRecord[] = [];

    for (const doc of this.documents.values()) {
      if (doc.status !== 'active') continue;

      const isOwner = doc.ownerId === userId;
      const hasGrant = this.grants.has(`${doc.id}_${userId}`);

      if (isOwner || hasGrant) {
        accessibleDocs.push(doc);
      }
    }

    // Apply search filter 'q'
    let filtered = accessibleDocs;
    if (options.q) {
      const qLower = options.q.toLowerCase();
      filtered = filtered.filter(
        (d) => d.displayName.toLowerCase().includes(qLower) || d.category.toLowerCase().includes(qLower)
      );
    }

    // Apply category filter
    if (options.category) {
      filtered = filtered.filter((d) => d.category.toLowerCase() === options.category!.toLowerCase());
    }

    // Total count calculated strictly over accessible documents
    const total = filtered.length;

    // Sorting
    filtered.sort((a, b) => {
      if (options.sort === 'name:asc') return a.displayName.localeCompare(b.displayName);
      if (options.sort === 'name:desc') return b.displayName.localeCompare(a.displayName);
      if (options.sort === 'created_at:asc') return a.createdAt.getTime() - b.createdAt.getTime();
      return b.createdAt.getTime() - a.createdAt.getTime(); // default: created_at:desc
    });

    // Pagination
    const page = options.page || 1;
    const limit = options.limit || 10;
    const offset = (page - 1) * limit;

    return {
      items: filtered.slice(offset, offset + limit),
      total,
    };
  }
}

export const documentRepository = new DocumentRepository();
