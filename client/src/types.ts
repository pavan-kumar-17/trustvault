export type Role = 'administrator' | 'document_owner' | 'viewer';
export type PermissionLevel = 'read' | 'edit';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  requestedRole?: Role;
  roleApprovalStatus?: 'approved' | 'pending' | 'none';
}

export interface DocumentItem {
  id: string;
  displayName: string;
  category: string;
  detectedContentType: string;
  sizeBytes: number;
  sha256Hex: string;
  status: 'active' | 'deleted';
  ownerId: string;
  ownerName: string;
  isOwner: boolean;
  userPermission: 'owner' | 'read' | 'edit' | 'none';
  createdAt: string;
  updatedAt: string;
}

export interface GrantItem {
  userId: string;
  userDisplayName: string;
  userEmail: string;
  permission: PermissionLevel;
  grantedBy: string;
  createdAt: string;
}

export interface AuditEventItem {
  sequence: number;
  eventId: string;
  occurredAt: string;
  actorUserId: string | null;
  actorLabelSnapshot: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  outcome: 'allowed' | 'denied' | 'success' | 'failure';
  reasonCode: string;
  requestId: string;
  sourceIpHash: string | null;
  userAgentSummary: string | null;
  details: Record<string, any>;
  previousHash: string;
  eventHash: string;
}

export interface ChainVerificationResult {
  valid: boolean;
  checkedCount: number;
  errorAtSequence?: number;
  details?: string;
}

export interface FixturePersona {
  id: string;
  displayName: string;
  email: string;
  role: Role;
  isActive: boolean;
}
