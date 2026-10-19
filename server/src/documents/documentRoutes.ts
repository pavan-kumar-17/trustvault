import { Router, Request, Response } from 'express';
import multer from 'multer';
import { requireAuth, userRepository } from '../auth/authMiddleware.js';
import { documentRepository } from './documentService.js';
import { evaluateDocumentPolicy } from '../policy/documentPolicy.js';
import { validateUploadFile } from './uploadValidation.js';
import { privateStorage, streamDocumentToResponse } from './privateStorage.js';
import { auditEngine } from '../audit/auditService.js';
import {
  DocumentQuerySchema,
  UpdateDocumentSchema,
  UpsertGrantSchema,
  SoftDeleteSchema,
} from '../schemas/index.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10485760 }, // 10MB limit
});

const paramToString = (p: unknown): string => (Array.isArray(p) ? p[0] || '' : String(p || ''));

export const documentRouter = Router();

// ============================================================================
// GET /api/me - Current identity, role, and status
// ============================================================================
documentRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({
    user: req.user,
  });
});

// ============================================================================
// GET /api/documents - Scoped search, filter, sort, paginate
// Applied BEFORE count/pagination in database repository
// ============================================================================
documentRouter.get('/documents', requireAuth, (req: Request, res: Response) => {
  const parsedQuery = DocumentQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: 'Invalid query parameters', details: parsedQuery.error.format() });
    return;
  }

  const { items, total } = documentRepository.listAccessibleDocuments(req.user!.id, parsedQuery.data);

  // Map to safe client DTO (never leak storageKey!)
  const safeItems = items.map((doc) => {
    const isOwner = doc.ownerId === req.user!.id;
    const grant = !isOwner ? documentRepository.getGrant(doc.id, req.user!.id) : undefined;
    const owner = userRepository.getById(doc.ownerId);

    return {
      id: doc.id,
      displayName: doc.displayName,
      category: doc.category,
      detectedContentType: doc.detectedContentType,
      sizeBytes: doc.sizeBytes,
      sha256Hex: doc.sha256Hex,
      status: doc.status,
      ownerId: doc.ownerId,
      ownerName: owner?.displayName || 'Unknown',
      isOwner,
      userPermission: isOwner ? 'owner' : grant?.permission || 'none',
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  });

  res.json({
    items: safeItems,
    total,
    page: parsedQuery.data.page,
    limit: parsedQuery.data.limit,
  });
});

// ============================================================================
// POST /api/documents - Upload document
// Enforces: Document Owner or Administrator role, file validation, audit
// ============================================================================
documentRouter.post(
  '/documents',
  requireAuth,
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    const user = req.user!;

    // Role check: Viewers cannot upload documents
    if (user.role === 'viewer') {
      await auditEngine.log({
        actorUserId: user.id,
        actorLabelSnapshot: user.displayName,
        action: 'UPLOAD',
        targetType: 'DOCUMENT',
        outcome: 'denied',
        reasonCode: 'WRONG_ROLE',
        requestId: req.requestId,
        sourceIp: req.ip,
      });
      res.status(403).json({ error: 'Viewers are not permitted to upload documents' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    // Category and optional target owner validation
    const category = (req.body.category as string)?.trim() || 'general';

    // File validation (magic bytes, extension, size, double-extension, traversal)
    const validation = validateUploadFile(req.file.buffer, req.file.originalname, req.file.mimetype);
    if (!validation.valid) {
      await auditEngine.log({
        actorUserId: user.id,
        actorLabelSnapshot: user.displayName,
        action: 'UPLOAD',
        targetType: 'DOCUMENT',
        outcome: 'denied',
        reasonCode: `VALIDATION_FAILED: ${validation.reason}`,
        requestId: req.requestId,
        sourceIp: req.ip,
      });
      res.status(400).json({ error: validation.reason });
      return;
    }

    const { file } = validation;

    // Save object to private storage
    await privateStorage.saveObject(file.storageKey, file.buffer, file.detectedMimeType);

    // Save document record (assign owner server-side!)
    const docRecord = documentRepository.createDocument({
      ownerId: user.id,
      storageKey: file.storageKey,
      displayName: file.sanitizedName,
      category,
      detectedContentType: file.detectedMimeType,
      sizeBytes: file.sizeBytes,
      sha256Hex: file.sha256Hex,
      status: 'active',
      deletedAt: null,
    });

    // Transactional audit event
    await auditEngine.log({
      actorUserId: user.id,
      actorLabelSnapshot: user.displayName,
      action: 'UPLOAD',
      targetType: 'DOCUMENT',
      targetId: docRecord.id,
      outcome: 'success',
      reasonCode: 'DOCUMENT_UPLOADED',
      requestId: req.requestId,
      sourceIp: req.ip,
      details: {
        displayName: docRecord.displayName,
        category: docRecord.category,
        sizeBytes: docRecord.sizeBytes,
        sha256Hex: docRecord.sha256Hex,
      },
    });

    res.status(201).json({
      id: docRecord.id,
      displayName: docRecord.displayName,
      category: docRecord.category,
      detectedContentType: docRecord.detectedContentType,
      sizeBytes: docRecord.sizeBytes,
      sha256Hex: docRecord.sha256Hex,
      createdAt: docRecord.createdAt,
    });
  }
);

// ============================================================================
// GET /api/documents/:id - Read metadata
// Uniform 404 response on denial or nonexistent document
// ============================================================================
documentRouter.get('/documents/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const documentId = paramToString(req.params.id);
  const user = req.user!;

  const doc = documentRepository.getById(documentId);
  const grant = documentRepository.getGrant(documentId, user.id);
  const decision = evaluateDocumentPolicy(user, doc, 'read', grant);

  if (!decision.allowed) {
    await auditEngine.log({
      actorUserId: user.id,
      actorLabelSnapshot: user.displayName,
      action: 'READ_METADATA',
      targetType: 'DOCUMENT',
      targetId: documentId,
      outcome: 'denied',
      reasonCode: decision.reason,
      requestId: req.requestId,
      sourceIp: req.ip,
    });
    // Non-disclosing 404
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  const isOwner = doc!.ownerId === user.id;
  const owner = userRepository.getById(doc!.ownerId);

  res.json({
    id: doc!.id,
    displayName: doc!.displayName,
    category: doc!.category,
    detectedContentType: doc!.detectedContentType,
    sizeBytes: doc!.sizeBytes,
    sha256Hex: doc!.sha256Hex,
    status: doc!.status,
    ownerId: doc!.ownerId,
    ownerName: owner?.displayName || 'Unknown',
    isOwner,
    userPermission: isOwner ? 'owner' : grant?.permission || 'none',
    createdAt: doc!.createdAt,
    updatedAt: doc!.updatedAt,
  });
});

// ============================================================================
// GET /api/documents/:id/download - Stream file bytes
// Re-checks current grant; streams through Express; no public URLs
// ============================================================================
documentRouter.get('/documents/:id/download', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const documentId = paramToString(req.params.id);
  const user = req.user!;

  const doc = documentRepository.getById(documentId);
  const grant = documentRepository.getGrant(documentId, user.id);
  const decision = evaluateDocumentPolicy(user, doc, 'download', grant);

  if (!decision.allowed) {
    await auditEngine.log({
      actorUserId: user.id,
      actorLabelSnapshot: user.displayName,
      action: 'DOWNLOAD',
      targetType: 'DOCUMENT',
      targetId: documentId,
      outcome: 'denied',
      reasonCode: decision.reason,
      requestId: req.requestId,
      sourceIp: req.ip,
    });
    // Uniform non-disclosing 404
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  // Audit BEFORE streaming bytes (Section 8 & 9)
  await auditEngine.log({
    actorUserId: user.id,
    actorLabelSnapshot: user.displayName,
    action: 'DOWNLOAD',
    targetType: 'DOCUMENT',
    targetId: doc!.id,
    outcome: 'allowed',
    reasonCode: decision.reason,
    requestId: req.requestId,
    sourceIp: req.ip,
    details: {
      displayName: doc!.displayName,
      sizeBytes: doc!.sizeBytes,
      sha256Hex: doc!.sha256Hex,
    },
  });

  const streamed = await streamDocumentToResponse(
    res,
    doc!.storageKey,
    doc!.displayName,
    doc!.detectedContentType,
    doc!.sizeBytes
  );

  if (!streamed) {
    res.status(500).json({ error: 'File stream could not be initialized' });
  }
});

// ============================================================================
// PATCH /api/documents/:id - Edit allowed metadata
// Only owner or user with explicit 'edit' grant
// ============================================================================
documentRouter.patch('/documents/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const documentId = paramToString(req.params.id);
  const user = req.user!;

  const parsed = UpdateDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid update body', details: parsed.error.format() });
    return;
  }

  const doc = documentRepository.getById(documentId);
  const grant = documentRepository.getGrant(documentId, user.id);
  const decision = evaluateDocumentPolicy(user, doc, 'edit_metadata', grant);

  if (!decision.allowed) {
    await auditEngine.log({
      actorUserId: user.id,
      actorLabelSnapshot: user.displayName,
      action: 'EDIT_METADATA',
      targetType: 'DOCUMENT',
      targetId: documentId,
      outcome: 'denied',
      reasonCode: decision.reason,
      requestId: req.requestId,
      sourceIp: req.ip,
    });
    res.status(decision.reason === 'document_not_found' ? 404 : 403).json({
      error: 'You do not have permission to edit this document',
    });
    return;
  }

  const updated = documentRepository.updateMetadata(documentId, {
    displayName: parsed.data.display_name,
    category: parsed.data.category,
  });

  await auditEngine.log({
    actorUserId: user.id,
    actorLabelSnapshot: user.displayName,
    action: 'EDIT_METADATA',
    targetType: 'DOCUMENT',
    targetId: documentId,
    outcome: 'success',
    reasonCode: 'METADATA_UPDATED',
    requestId: req.requestId,
    sourceIp: req.ip,
    details: parsed.data,
  });

  res.json(updated);
});

// ============================================================================
// DELETE /api/documents/:id - Soft-delete document
// Requires reason; Owner or Administrator
// ============================================================================
documentRouter.delete('/documents/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const documentId = paramToString(req.params.id);
  const user = req.user!;

  const parsed = SoftDeleteSchema.safeParse(req.body);
  const reason = parsed.success ? parsed.data.reason : 'User requested soft delete';

  const doc = documentRepository.getById(documentId);
  const grant = documentRepository.getGrant(documentId, user.id);
  const decision = evaluateDocumentPolicy(user, doc, 'delete', grant);

  if (!decision.allowed) {
    await auditEngine.log({
      actorUserId: user.id,
      actorLabelSnapshot: user.displayName,
      action: 'DELETE',
      targetType: 'DOCUMENT',
      targetId: documentId,
      outcome: 'denied',
      reasonCode: decision.reason,
      requestId: req.requestId,
      sourceIp: req.ip,
    });
    res.status(decision.reason === 'document_not_found' ? 404 : 403).json({
      error: 'You do not have permission to delete this document',
    });
    return;
  }

  documentRepository.softDelete(documentId);

  await auditEngine.log({
    actorUserId: user.id,
    actorLabelSnapshot: user.displayName,
    action: 'DELETE',
    targetType: 'DOCUMENT',
    targetId: documentId,
    outcome: 'success',
    reasonCode: 'DOCUMENT_SOFT_DELETED',
    requestId: req.requestId,
    sourceIp: req.ip,
    details: { reason },
  });

  res.status(204).send();
});

// ============================================================================
// GET /api/documents/:id/grants - List current grants
// Only owner or administrator
// ============================================================================
documentRouter.get('/documents/:id/grants', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const documentId = paramToString(req.params.id);
  const user = req.user!;

  const doc = documentRepository.getById(documentId);
  const grant = documentRepository.getGrant(documentId, user.id);
  const decision = evaluateDocumentPolicy(user, doc, 'grant', grant);

  if (!decision.allowed) {
    await auditEngine.log({
      actorUserId: user.id,
      actorLabelSnapshot: user.displayName,
      action: 'LIST_GRANTS',
      targetType: 'DOCUMENT',
      targetId: documentId,
      outcome: 'denied',
      reasonCode: decision.reason,
      requestId: req.requestId,
      sourceIp: req.ip,
    });
    res.status(403).json({ error: 'Only the owner or administrator can view grants' });
    return;
  }

  const grants = documentRepository.getGrantsForDocument(documentId).map((g) => {
    const targetUser = userRepository.getById(g.userId);
    return {
      userId: g.userId,
      userDisplayName: targetUser?.displayName || 'Unknown',
      userEmail: targetUser?.email || '',
      permission: g.permission,
      grantedBy: g.grantedBy,
      createdAt: g.createdAt,
    };
  });

  res.json({ grants });
});

// ============================================================================
// PUT /api/documents/:id/grants/:userId - Create or update grant
// Target user must exist and be active. Owner or Administrator only.
// ============================================================================
documentRouter.put('/documents/:id/grants/:userId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const documentId = paramToString(req.params.id);
  const targetUserId = paramToString(req.params.userId);
  const user = req.user!;

  const parsed = UpsertGrantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid grant payload', details: parsed.error.format() });
    return;
  }

  const doc = documentRepository.getById(documentId!);
  const grant = documentRepository.getGrant(documentId!, user.id);
  const decision = evaluateDocumentPolicy(user, doc, 'grant', grant);

  if (!decision.allowed) {
    await auditEngine.log({
      actorUserId: user.id,
      actorLabelSnapshot: user.displayName,
      action: 'GRANT',
      targetType: 'DOCUMENT',
      targetId: documentId,
      outcome: 'denied',
      reasonCode: decision.reason,
      requestId: req.requestId,
      sourceIp: req.ip,
    });
    res.status(403).json({ error: 'Only the owner or administrator can grant access' });
    return;
  }

  const targetUser = userRepository.getById(targetUserId!);
  if (!targetUser) {
    res.status(404).json({ error: 'Target user not found' });
    return;
  }

  if (!targetUser.isActive) {
    res.status(400).json({ error: 'Cannot grant access to an inactive user' });
    return;
  }

  const existingGrant = documentRepository.getGrant(documentId!, targetUserId!);
  const newGrant = documentRepository.setGrant(
    documentId!,
    targetUserId!,
    parsed.data.permission,
    user.id
  );

  await auditEngine.log({
    actorUserId: user.id,
    actorLabelSnapshot: user.displayName,
    action: 'GRANT',
    targetType: 'DOCUMENT',
    targetId: documentId,
    outcome: 'success',
    reasonCode: 'GRANT_APPLIED',
    requestId: req.requestId,
    sourceIp: req.ip,
    details: {
      targetUserId,
      targetUserEmail: targetUser.email,
      previousPermission: existingGrant?.permission || null,
      newPermission: parsed.data.permission,
    },
  });

  res.json({
    documentId,
    userId: targetUserId,
    permission: newGrant.permission,
    updatedAt: newGrant.updatedAt,
  });
});

// ============================================================================
// DELETE /api/documents/:id/grants/:userId - Revoke access
// Immediate effect on next request
// ============================================================================
documentRouter.delete('/documents/:id/grants/:userId', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const documentId = paramToString(req.params.id);
  const targetUserId = paramToString(req.params.userId);
  const user = req.user!;

  const doc = documentRepository.getById(documentId!);
  const grant = documentRepository.getGrant(documentId!, user.id);
  const decision = evaluateDocumentPolicy(user, doc, 'revoke', grant);

  if (!decision.allowed) {
    await auditEngine.log({
      actorUserId: user.id,
      actorLabelSnapshot: user.displayName,
      action: 'REVOKE',
      targetType: 'DOCUMENT',
      targetId: documentId,
      outcome: 'denied',
      reasonCode: decision.reason,
      requestId: req.requestId,
      sourceIp: req.ip,
    });
    res.status(403).json({ error: 'Only the owner or administrator can revoke access' });
    return;
  }

  const existing = documentRepository.getGrant(documentId!, targetUserId!);
  documentRepository.revokeGrant(documentId!, targetUserId!);

  await auditEngine.log({
    actorUserId: user.id,
    actorLabelSnapshot: user.displayName,
    action: 'REVOKE',
    targetType: 'DOCUMENT',
    targetId: documentId,
    outcome: 'success',
    reasonCode: 'GRANT_REVOKED',
    requestId: req.requestId,
    sourceIp: req.ip,
    details: {
      targetUserId,
      revokedPermission: existing?.permission || 'unknown',
    },
  });

  res.status(204).send();
});

// ============================================================================
// GET /api/documents/:id/audit - Document activity trail
// ============================================================================
documentRouter.get('/documents/:id/audit', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const documentId = paramToString(req.params.id);
  const user = req.user!;

  const doc = documentRepository.getById(documentId);
  const grant = documentRepository.getGrant(documentId, user.id);
  const decision = evaluateDocumentPolicy(user, doc, 'view_document_audit', grant);

  if (!decision.allowed) {
    await auditEngine.log({
      actorUserId: user.id,
      actorLabelSnapshot: user.displayName,
      action: 'READ_DOC_AUDIT',
      targetType: 'DOCUMENT',
      targetId: documentId,
      outcome: 'denied',
      reasonCode: decision.reason,
      requestId: req.requestId,
      sourceIp: req.ip,
    });
    res.status(403).json({ error: 'You do not have access to this document audit trail' });
    return;
  }

  const { items, total } = auditEngine.getEvents({ targetId: documentId, limit: 50 });

  res.json({
    items,
    total,
  });
});
