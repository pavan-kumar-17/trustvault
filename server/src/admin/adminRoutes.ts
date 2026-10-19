import { Router, Request, Response } from 'express';
import { requireAuth, userRepository, issueTestToken } from '../auth/authMiddleware.js';
import { auditEngine } from '../audit/auditService.js';
import { verifyAuditChain } from '../audit/verifyChain.js';
import { UpdateUserStatusSchema, AdminAuditQuerySchema } from '../schemas/index.js';

export const adminRouter = Router();

// ============================================================================
// POST /api/auth/demo-login - Developer & Evaluator Demo Login Helper
// ============================================================================
adminRouter.post('/auth/demo-login', (req: Request, res: Response) => {
  const { userId } = req.body;
  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  const user = userRepository.getById(userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const token = issueTestToken(user.id);
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      isActive: user.isActive,
    },
  });
});

// GET /api/auth/fixtures - List available demo personas
adminRouter.get('/auth/fixtures', (_req: Request, res: Response) => {
  const users = userRepository.getAll().map((u) => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    isActive: u.isActive,
  }));
  res.json({ fixtures: users });
});

// Middleware to require Administrator role
function requireAdminRole(req: Request, res: Response, next: () => void): void {
  if (req.user?.role !== 'administrator') {
    auditEngine.log({
      actorUserId: req.user?.id ?? null,
      actorLabelSnapshot: req.user?.displayName,
      action: 'ADMIN_ACCESS',
      targetType: 'SYSTEM',
      outcome: 'denied',
      reasonCode: 'NOT_ADMINISTRATOR',
      requestId: req.requestId,
      sourceIp: req.ip,
    });
    res.status(403).json({ error: 'Administrator role required' });
    return;
  }
  next();
}

// ============================================================================
// GET /api/admin/users - Minimal user directory
// ============================================================================
adminRouter.get('/admin/users', requireAuth, requireAdminRole, (_req: Request, res: Response) => {
  const users = userRepository.getAll().map((u) => ({
    id: u.id,
    displayName: u.displayName,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  }));

  res.json({ users });
});

const paramToString = (p: unknown): string => (Array.isArray(p) ? p[0] || '' : String(p || ''));

// ============================================================================
// PATCH /api/admin/users/:id/status - Activate or deactivate user
// ============================================================================
adminRouter.patch('/admin/users/:id/status', requireAuth, requireAdminRole, async (req: Request, res: Response): Promise<void> => {
  const targetUserId = paramToString(req.params.id);
  const user = req.user!;

  const parsed = UpdateUserStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid status payload', details: parsed.error.format() });
    return;
  }

  // Prevent self-deactivation to avoid lockouts
  if (targetUserId === user.id && !parsed.data.is_active) {
    res.status(400).json({ error: 'Administrators cannot deactivate their own account' });
    return;
  }

  const updated = userRepository.updateStatus(targetUserId, parsed.data.is_active);
  if (!updated) {
    res.status(404).json({ error: 'Target user not found' });
    return;
  }

  await auditEngine.log({
    actorUserId: user.id,
    actorLabelSnapshot: user.displayName,
    action: parsed.data.is_active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
    targetType: 'USER',
    targetId: targetUserId,
    outcome: 'success',
    reasonCode: parsed.data.reason || 'ADMIN_STATUS_CHANGE',
    requestId: req.requestId,
    sourceIp: req.ip,
    details: {
      targetUserId,
      targetEmail: updated.email,
      isActive: updated.isActive,
    },
  });

  res.json({
    id: updated.id,
    displayName: updated.displayName,
    email: updated.email,
    role: updated.role,
    isActive: updated.isActive,
  });
});

// ============================================================================
// GET /api/admin/audit - Global security audit log
// ============================================================================
adminRouter.get('/admin/audit', requireAuth, requireAdminRole, async (req: Request, res: Response): Promise<void> => {
  const parsed = AdminAuditQuerySchema.safeParse(req.query);
  const data = parsed.success ? parsed.data : { page: 1, limit: 20 };

  const offset = (data.page - 1) * data.limit;
  const { items, total } = auditEngine.getEvents({
    action: data.action,
    outcome: data.outcome,
    targetId: data.target_id,
    offset,
    limit: data.limit,
  });

  // Audit the audit read itself
  await auditEngine.log({
    actorUserId: req.user!.id,
    actorLabelSnapshot: req.user!.displayName,
    action: 'AUDIT_LOG_INSPECTED',
    targetType: 'SYSTEM',
    outcome: 'success',
    reasonCode: 'ADMIN_OVERSIGHT',
    requestId: req.requestId,
    sourceIp: req.ip,
  });

  res.json({
    items,
    total,
    page: data.page,
    limit: data.limit,
  });
});

// ============================================================================
// POST /api/admin/audit/verify - Cryptographic chain verification
// ============================================================================
adminRouter.post('/admin/audit/verify', requireAuth, requireAdminRole, async (req: Request, res: Response): Promise<void> => {
  const allEvents = auditEngine.getAllSequential();
  const verification = verifyAuditChain(allEvents);

  await auditEngine.log({
    actorUserId: req.user!.id,
    actorLabelSnapshot: req.user!.displayName,
    action: 'AUDIT_CHAIN_VERIFY',
    targetType: 'AUDIT_CHAIN',
    outcome: verification.valid ? 'success' : 'failure',
    reasonCode: verification.valid ? 'CHAIN_INTEGRITY_VERIFIED' : 'TAMPER_DETECTED',
    requestId: req.requestId,
    sourceIp: req.ip,
    details: {
      checkedCount: verification.checkedCount,
      errorAtSequence: verification.errorAtSequence,
    },
  });

  res.json(verification);
});
