# TrustVault AI Engineering Log (PROMPTS.md)

**Baseline:** TrustVault MVP Specification v2.0  
**Specification Reference:** Section 15 Required Documentation  
**Repository:** TrustVault Secure Document Sharing Platform  

---

### Entry 1: Architecture Baseline Realignment & Tamper-Evident Chain
- **Date:** 2026-10-19
- **1. What was asked:**  
  Review the provided starter codebase and reconcile it with the final v2.0 MVP specification (`TrustVault MVP.md`).
- **2. What it produced:**  
  Initial examination revealed an old Prisma/Express prototype with static file downloads, simple boolean roles, and mutable audit rows.
- **3. What was specifically wrong or unverified:**  
  The legacy prototype did not satisfy the strict v2.0 requirements:
  - It lacked the tamper-evident cryptographic SHA-256 hash chain (`previous_hash` to `event_hash` linkage).
  - It lacked real-time database profile verification (`is_active` check on every protected request).
  - It permitted direct static file downloads without explicit server-side streaming authorization.
- **4. What was changed and how it was checked:**  
  Discarded the legacy starter. Implemented the complete v2.0 architecture in strict TypeScript with Supabase PostgreSQL schema (`001_initial_schema.sql`), append-only triggers, mutex-locked audit chain serialization (`auditService.ts`), and chain verification (`verifyChain.ts`). Verified via `tests/audit/auditChain.test.ts`.
- **5. Commit / Verification Reference:**  
  Verified in test suite: `tests/audit/auditChain.test.ts` (4/4 tests passing).

---

### Entry 2: Express 5 Router & Wildcard Fallback Syntax Error
- **Date:** 2026-10-19
- **1. What was asked:**  
  Build the Express application factory in `server/src/app.ts` serving `/api` routes and the static Vite SPA.
- **2. What it produced:**  
  `app.get('*', (req, res, next) => ...)` as the SPA fallback catch-all route.
- **3. What was specifically wrong or unverified:**  
  Express 5 (`express@^5.3.0` with `path-to-regexp` v8) does not accept bare `*` wildcard patterns in route paths, crashing on boot with:  
  `TypeError: Missing parameter name at index 1: *; visit https://git.new/pathToRegexpError`
- **4. What was changed and how it was checked:**  
  Replaced `app.get('*', ...)` with pathless middleware `app.use((req, res, next) => ...)` checking `!req.path.startsWith('/api') && req.path !== '/healthz'`. Verified that the server boots cleanly and `/healthz` responds with HTTP 200.
- **5. Commit / Verification Reference:**  
  Updated in `server/src/app.ts`, verified via unit test execution.

---

### Entry 3: Content-Length Stream Mismatch in Test Download Route
- **Date:** 2026-10-19
- **1. What was asked:**  
  Implement server-side authorized streaming in `server/src/documents/privateStorage.ts` and verify via Supertest in `tests/authorization/idor.test.ts`.
- **2. What it produced:**  
  Seeded document fixtures set `sizeBytes: 1024`, but the in-memory buffer was initialized with a short synthetic string (`~40 bytes`), resulting in a mismatch with `res.setHeader('Content-Length', sizeBytes)`.
- **3. What was specifically wrong or unverified:**  
  Supertest threw `Error: Parse Error: Data after Connection: close` because the HTTP response sent fewer bytes than declared by `Content-Length`, causing the client to terminate prematurely.
- **4. What was changed and how it was checked:**  
  Updated `server/src/documents/documentService.ts` to construct synthetic buffers with padding and dynamically assign `doc.sizeBytes = buffer.length`. Re-ran Vitest: `tests/authorization/idor.test.ts` passed 8/8 tests.
- **5. Commit / Verification Reference:**  
  Updated in `server/src/documents/documentService.ts`, verified via `tests/authorization/idor.test.ts`.

---

### Entry 4: Express 5 `req.params` Type Coercion in Strict TypeScript Mode
- **Date:** 2026-10-19
- **1. What was asked:**  
  Compile the backend code in strict TypeScript mode (`tsc`).
- **2. What it produced:**  
  Direct parameter access `req.params.id!` in route handlers.
- **3. What was specifically wrong or unverified:**  
  In `@types/express` for Express 5, `req.params` values are typed as `string | string[]` to support splat routes. The compiler generated 27 errors (`TS2345: Argument of type 'string | string[]' is not assignable to parameter of type 'string'`).
- **4. What was changed and how it was checked:**  
  Added a defensive normalization helper `const paramToString = (p: unknown): string => (Array.isArray(p) ? p[0] || '' : String(p || ''))` to `documentRoutes.ts` and `adminRoutes.ts`. Re-ran `npm run build:server` which exited with code 0.
- **5. Commit / Verification Reference:**  
  Updated in `server/src/documents/documentRoutes.ts` and `server/src/admin/adminRoutes.ts`.

---

### Entry 5: Real-Time Account Deactivation Check on Every Request
- **Date:** 2026-10-19
- **1. What was asked:**  
  Implement the authentication middleware verifying JWTs issued by Supabase Auth.
- **2. What it produced:**  
  Initial middleware verified the JWT signature and attached `req.user = decoded` directly without querying database state.
- **3. What was specifically wrong or unverified:**  
  If an administrator deactivates a user, their 15-minute or 1-hour JWT token would remain valid and continue allowing access until expiration, directly violating Section 3 & 10 ("Deactivation blocks subsequent API requests even when the Auth token has not expired").
- **4. What was changed and how it was checked:**  
  Enhanced `requireAuth` in `server/src/auth/authMiddleware.ts` to perform a real-time lookup against `userRepository.getById(decoded.sub)` and immediately reject deactivated accounts (`isActive === false`) with `403 Forbidden` and an audit entry. Wrote negative test `rejects an inactive profile on the next API request even with an already-issued valid token` in `tests/auth/auth.test.ts`.
- **5. Commit / Verification Reference:**  
  Updated in `server/src/auth/authMiddleware.ts`, verified via `tests/auth/auth.test.ts` (test passed).
