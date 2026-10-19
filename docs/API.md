# TrustVault API Documentation (`docs/API.md`)

**Baseline:** TrustVault MVP Specification v2.0  
**Transport:** HTTPS / JSON bodies (except file uploads as multipart/form-data)  
**Authentication:** `Authorization: Bearer <token>`  

---

## 1. System Endpoints

### `GET /healthz`
- **Purpose:** Public service liveness health check.
- **Authentication:** None (Public).
- **Allowed Roles:** Anyone.
- **Response:** `200 OK`
  ```json
  {
    "status": "ok",
    "service": "TrustVault",
    "timestamp": "2026-10-19T06:32:55.699Z"
  }
  ```
- **Denial Behavior:** N/A. Does not disclose internal database details, secrets, or stack traces.
- **Automated Test:** Server boot verification.

---

## 2. Authentication & Identity

### `GET /api/me`
- **Purpose:** Current user identity, active role, and profile status.
- **Authentication:** Bearer token required.
- **Allowed Roles:** Any active role (`administrator`, `document_owner`, `viewer`).
- **Response:** `200 OK`
  ```json
  {
    "user": {
      "id": "22222222-2222-4222-8222-222222222222",
      "email": "ownera@trustvault.local",
      "displayName": "Oscar Owner A",
      "role": "document_owner",
      "isActive": true
    }
  }
  ```
- **Denial Behavior:** `401 Unauthorized` if missing/invalid token; `403 Forbidden` if user is deactivated.
- **Automated Tests:** `tests/auth/auth.test.ts` (`authenticates valid active user successfully`, `rejects an inactive profile on the next API request`).

### `POST /api/auth/demo-login`
- **Purpose:** Issues authenticated token for evaluator demo personas.
- **Authentication:** None (Demo evaluator helper).
- **Request Body:**
  ```json
  {
    "userId": "11111111-1111-4111-8111-111111111111"
  }
  ```
- **Response:** `200 OK` (`{ token, user }`).

---

## 3. Documents Workspace

### `GET /api/documents`
- **Purpose:** List, search, filter, sort, and paginate authorized documents.
- **Authentication:** Bearer token required.
- **Allowed Roles:** Any active role.
- **Access Rule:** Scoped SQL predicate in database repository:
  `status = 'active' AND (owner_id = user.id OR has_grant)`
- **Query Parameters:**
  - `q` (string, optional): search by display name or category.
  - `category` (string, optional): filter by category.
  - `sort` (enum, optional): `created_at:desc`, `created_at:asc`, `name:asc`, `name:desc`.
  - `page` (number, default: 1).
  - `limit` (number, default: 10, max: 50).
- **Response:** `200 OK`
  ```json
  {
    "items": [
      {
        "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "displayName": "Financial_Report_Q3.pdf",
        "category": "finance",
        "detectedContentType": "application/pdf",
        "sizeBytes": 1024,
        "sha256Hex": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "status": "active",
        "ownerId": "22222222-2222-4222-8222-222222222222",
        "ownerName": "Oscar Owner A",
        "isOwner": true,
        "userPermission": "owner",
        "createdAt": "2026-10-17T12:00:00.000Z",
        "updatedAt": "2026-10-17T12:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "limit": 10
  }
  ```
- **Denial Behavior:** Documents not owned or granted are completely omitted. Searching for a hidden title returns `total: 0` without disclosing existence.
- **Automated Test:** `tests/authorization/idor.test.ts` (`scoped list/search strictly excludes inaccessible documents before pagination and count`).

### `POST /api/documents`
- **Purpose:** Upload and register a new secure document.
- **Authentication:** Bearer token required.
- **Allowed Roles:** `document_owner` or `administrator`. (Viewers forbidden).
- **Request:** `multipart/form-data`
  - `file`: binary buffer (max 10MB; validated against magic signature and extension).
  - `category`: string (optional, default: `general`).
- **Response:** `201 Created` (`{ id, displayName, category, detectedContentType, sizeBytes, sha256Hex, createdAt }`).
- **Denial Behavior:**
  - `403 Forbidden` if caller is a viewer.
  - `400 Bad Request` if file exceeds 10MB, has double extension (`.exe.pdf`), path traversal, or signature mismatch.
- **Automated Tests:** `tests/upload/uploadValidation.test.ts` (6 tests).

### `GET /api/documents/:id`
- **Purpose:** Retrieve metadata for a specific document.
- **Authentication:** Bearer token required.
- **Allowed Roles:** Document Owner OR user with explicit `read` or `edit` grant.
- **Response:** `200 OK` (metadata object without internal `storageKey`).
- **Denial Behavior:** Uniform `404 Not Found` for nonexistent or unauthorized document IDs, preventing existence enumeration. Denial is recorded in audit chain.
- **Automated Tests:** `tests/authorization/idor.test.ts` (`viewerA cannot read or download docB`).

### `GET /api/documents/:id/download`
- **Purpose:** Stream private document bytes to caller.
- **Authentication:** Bearer token required.
- **Allowed Roles:** Document Owner OR user with explicit `read` or `edit` grant.
- **Response:** `200 OK`
  - Headers:
    - `Content-Type: <mime>`
    - `Content-Disposition: attachment; filename="<sanitizedName>"`
    - `X-Content-Type-Options: nosniff`
- **Denial Behavior:** `404 Not Found`. Denial logged to audit trail.
- **Automated Tests:** `tests/authorization/idor.test.ts` (`viewerA can read metadata and download docA`, `viewerA cannot read or download docB`).

### `PATCH /api/documents/:id`
- **Purpose:** Update allowed metadata (`display_name`, `category`).
- **Authentication:** Bearer token required.
- **Allowed Roles:** Document Owner OR user with explicit `edit` grant.
- **Request Body (Zod strict allowlist):**
  ```json
  {
    "display_name": "Updated_Quarterly_Report.pdf",
    "category": "finance"
  }
  ```
- **Denial Behavior:** `403 Forbidden` if user has only `read` grant or is not owner; `404 Not Found` if inaccessible.
- **Automated Tests:** `tests/revocation/revocation.test.ts` (`downgrading grant from edit to read immediately blocks metadata edit`).

### `DELETE /api/documents/:id`
- **Purpose:** Soft-delete document (`status = 'deleted'`).
- **Authentication:** Bearer token required.
- **Allowed Roles:** Document Owner OR Administrator.
- **Request Body:**
  ```json
  {
    "reason": "Superseded by Q4 audit filing"
  }
  ```
- **Response:** `204 No Content`.
- **Denial Behavior:** `403 Forbidden` if unauthorized.
- **Automated Tests:** `tests/authorization/idor.test.ts` (`ownerA cannot edit or delete ownerBs document`).

---

## 4. Per-Document Access Grants

### `GET /api/documents/:id/grants`
- **Purpose:** List current active grants for a document.
- **Authentication:** Bearer token required.
- **Allowed Roles:** Document Owner OR Administrator. (Viewers forbidden).
- **Response:** `200 OK` (`{ grants: [{ userId, userDisplayName, userEmail, permission, grantedBy, createdAt }] }`).

### `PUT /api/documents/:id/grants/:userId`
- **Purpose:** Grant or update named user permission (`read` or `edit`).
- **Authentication:** Bearer token required.
- **Allowed Roles:** Document Owner OR Administrator.
- **Request Body:**
  ```json
  {
    "permission": "read"
  }
  ```
- **Response:** `200 OK`.
- **Denial Behavior:** `403 Forbidden` if caller does not own document; `400 Bad Request` if target user is inactive.
- **Automated Tests:** `tests/revocation/revocation.test.ts`.

### `DELETE /api/documents/:id/grants/:userId`
- **Purpose:** Revoke named user permission.
- **Authentication:** Bearer token required.
- **Allowed Roles:** Document Owner OR Administrator.
- **Response:** `204 No Content`.
- **Access Effect:** Access is revoked immediately on the very next API request from that user.
- **Automated Test:** `tests/revocation/revocation.test.ts` (`revoking access immediately denies next request reusing the exact same token`).

### `GET /api/documents/:id/audit`
- **Purpose:** View audit trail for a specific document.
- **Authentication:** Bearer token required.
- **Allowed Roles:** Document Owner OR Administrator.
- **Response:** `200 OK` (`{ items: [...], total }`).

---

## 5. Administrator Console

### `GET /api/admin/users`
- **Purpose:** View minimal directory of users and active status.
- **Authentication:** Bearer token required.
- **Allowed Roles:** `administrator` only.
- **Response:** `200 OK` (`{ users: [{ id, displayName, email, role, isActive, createdAt }] }`).

### `PATCH /api/admin/users/:id/status`
- **Purpose:** Activate or deactivate a user account.
- **Authentication:** Bearer token required.
- **Allowed Roles:** `administrator` only.
- **Request Body:**
  ```json
  {
    "is_active": false,
    "reason": "Security review deactivation"
  }
  ```
- **Response:** `200 OK`.
- **Denial Behavior:** `400 Bad Request` if administrator attempts to deactivate themselves.

### `GET /api/admin/audit`
- **Purpose:** Global security activity stream across all documents and users.
- **Authentication:** Bearer token required.
- **Allowed Roles:** `administrator` only.
- **Response:** `200 OK` (`{ items, total, page, limit }`).

### `POST /api/admin/audit/verify`
- **Purpose:** Validates unbroken cryptographic hash chain from genesis to head.
- **Authentication:** Bearer token required.
- **Allowed Roles:** `administrator` only.
- **Response:** `200 OK`
  ```json
  {
    "valid": true,
    "checkedCount": 42
  }
  ```
- **Failure Response (when tampering detected):**
  ```json
  {
    "valid": false,
    "checkedCount": 14,
    "errorAtSequence": 15,
    "details": "Tamper detected at sequence 15: event_hash does not match canonical recomputed hash"
  }
  ```
- **Automated Tests:** `tests/audit/auditChain.test.ts` (`validates a clean, untampered audit chain successfully`, `detects tampering when an audit record payload is modified`).
