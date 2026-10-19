import { z } from 'zod';

export const RoleEnum = z.enum(['administrator', 'document_owner', 'viewer']);
export type Role = z.infer<typeof RoleEnum>;

export const PermissionLevelEnum = z.enum(['read', 'edit']);
export type PermissionLevel = z.infer<typeof PermissionLevelEnum>;

export const DocumentActionEnum = z.enum([
  'read',
  'edit_metadata',
  'download',
  'delete',
  'grant',
  'revoke',
  'view_document_audit',
]);
export type DocumentAction = z.infer<typeof DocumentActionEnum>;

export const DocumentStatusEnum = z.enum(['active', 'deleted']);

// Pagination and list filter schema
export const DocumentQuerySchema = z.object({
  q: z.string().trim().optional(),
  category: z.string().trim().optional(),
  sort: z.enum(['created_at:desc', 'created_at:asc', 'name:asc', 'name:desc']).default('created_at:desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// Update document metadata schema (only allowed fields: display_name, category)
export const UpdateDocumentSchema = z.object({
  display_name: z.string().trim().min(1, 'Display name cannot be empty').max(255).optional(),
  category: z.string().trim().min(1, 'Category cannot be empty').max(100).optional(),
}).strict(); // strictly reject unexpected fields like owner_id, size_bytes, etc.

// Grant access schema
export const UpsertGrantSchema = z.object({
  permission: PermissionLevelEnum,
}).strict();

// Soft delete schema
export const SoftDeleteSchema = z.object({
  reason: z.string().trim().min(3, 'A reason is required for deletion').max(500),
}).strict();

// Admin user status update
export const UpdateUserStatusSchema = z.object({
  is_active: z.boolean(),
  reason: z.string().trim().min(3).max(500).optional(),
}).strict();

// Admin audit query
export const AdminAuditQuerySchema = z.object({
  action: z.string().trim().optional(),
  outcome: z.enum(['allowed', 'denied', 'success', 'failure']).optional(),
  target_id: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
