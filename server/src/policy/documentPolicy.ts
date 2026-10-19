import { DocumentAction, Role, PermissionLevel } from '../schemas/index.js';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  displayName?: string;
  role: Role;
  isActive: boolean;
}

export interface DocumentRecord {
  id: string;
  ownerId: string;
  storageKey: string;
  displayName: string;
  category: string;
  detectedContentType: string;
  sizeBytes: number;
  sha256Hex: string;
  status: 'active' | 'deleted';
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

export interface GrantRecord {
  documentId: string;
  userId: string;
  permission: PermissionLevel;
  grantedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export type AccessDecisionReason =
  | 'owner'
  | 'explicit_read_grant'
  | 'explicit_edit_grant'
  | 'admin_management'
  | 'missing_grant'
  | 'inactive_user'
  | 'deleted_document'
  | 'document_not_found'
  | 'wrong_role';

export interface AccessDecision {
  allowed: boolean;
  reason: AccessDecisionReason;
  grant?: GrantRecord;
}

/**
 * Evaluates whether an authenticated user may perform `action` on `doc` given `grants`.
 * This is the SINGLE application policy model required by Section 5 of the MVP spec.
 */
export function evaluateDocumentPolicy(
  user: AuthenticatedUser,
  doc: DocumentRecord | null | undefined,
  action: DocumentAction,
  userGrant?: GrantRecord | null
): AccessDecision {
  // 1. Account must be active
  if (!user.isActive) {
    return { allowed: false, reason: 'inactive_user' };
  }

  // 2. Document existence check
  if (!doc) {
    return { allowed: false, reason: 'document_not_found' };
  }

  // 3. Document soft-delete status check
  if (doc.status === 'deleted' || doc.deletedAt) {
    return { allowed: false, reason: 'deleted_document' };
  }

  const isOwner = doc.ownerId === user.id;

  // 4. Document Owner has full access to their own active document
  if (isOwner) {
    return { allowed: true, reason: 'owner' };
  }

  // 5. Administrator permissions:
  // Operational role: can manage grants, soft-delete with reason, view document audit logs,
  // but CANNOT implicitly bypass content read/download without explicit grant (Section 3).
  if (user.role === 'administrator') {
    if (action === 'grant' || action === 'revoke' || action === 'delete' || action === 'view_document_audit') {
      return { allowed: true, reason: 'admin_management' };
    }
    // For read/download/edit_metadata, check if admin has an explicit grant
  }

  // 6. Action-specific rules based on explicit grants
  if (action === 'grant' || action === 'revoke') {
    // Only owner (or admin handled above) can grant/revoke
    return { allowed: false, reason: 'wrong_role' };
  }

  if (action === 'delete') {
    // Only owner (or admin handled above) can delete
    return { allowed: false, reason: 'wrong_role' };
  }

  if (action === 'view_document_audit') {
    // Only owner (or admin handled above) can view document audit
    return { allowed: false, reason: 'wrong_role' };
  }

  // 7. Check explicit grants for read, download, edit_metadata
  if (!userGrant) {
    return { allowed: false, reason: 'missing_grant' };
  }

  if (action === 'read' || action === 'download') {
    if (userGrant.permission === 'read') {
      return { allowed: true, reason: 'explicit_read_grant', grant: userGrant };
    }
    if (userGrant.permission === 'edit') {
      return { allowed: true, reason: 'explicit_edit_grant', grant: userGrant };
    }
  }

  if (action === 'edit_metadata') {
    if (userGrant.permission === 'edit') {
      return { allowed: true, reason: 'explicit_edit_grant', grant: userGrant };
    }
    return { allowed: false, reason: 'missing_grant' }; // Has read only, requires edit
  }

  return { allowed: false, reason: 'missing_grant' };
}
