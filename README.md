# TrustVault (v2.0 MVP)

**Company-Only, Per-Document Secure Sharing with Tamper-Evident Cryptographic Audit**  
*Built strictly against the TrustVault MVP Specification v2.0 baseline.*

---

## 1. Product Summary & Architecture

TrustVault is a security-first document-sharing platform designed with a zero-trust model:
- **Per-Document Named Grants:** Access is granted strictly on a per-document, per-user basis (`read` or `edit`). No folder inheritance, group sprawl, or public link exposure.
- **Immediate Revocation:** The permission state is queried fresh on every request; revoking a grant denies access on the very next HTTP request without waiting for cache expiration.
- **Server-Authorized Private Streaming:** Document bytes are stored in private storage with opaque keys and streamed exclusively through Express after authorization. No public URLs or long-lived signed download URLs.
- **Tamper-Evident Cryptographic Audit:** Every security event (upload, download, edit, grant, revoke, denial) is recorded into an append-only, serialized SHA-256 hash chain with immutable linkage (`previous_hash` $\to$ `event_hash`).
- **Defense in Depth:** Dual protection through Express centralized policy enforcement and PostgreSQL Row Level Security (RLS).
- **Least Privilege Administration:** Administrators have operational oversight (user activation/deactivation, global audit verification), but cannot read or download document content without an explicit grant.

### Technology Stack
- **Language:** TypeScript (Strict mode enabled across client and server)
- **Frontend:** React 19 + Vite (Dark mode glassmorphism design system)
- **Backend API:** Node.js + Express 5 + TypeScript
- **Database:** Supabase PostgreSQL with RLS, append-only triggers, and hash-chain RPC
- **Validation:** Zod strict schemas on all inputs, parameters, and environment settings
- **Security:** Helmet CSP, nosniff, attachment delivery, magic byte signature checks
- **Testing:** Vitest + Supertest

---

## 2. Quick Start from a Clean Clone

### Prerequisites
- Node.js v20+ (tested on Node v24.13)
- npm v10+

### Installation
```bash
# Clone the repository and enter directory
cd trust

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
```

### Running Tests
The test suite proves cross-user isolation, IDOR prevention, immediate same-token revocation, and audit tampering detection:
```bash
npm test
```
*All 25 automated security tests execute and pass out-of-the-box.*

### Running the Application
```bash
# 1. Build the frontend and compile TypeScript
npm run build

# 2. Start the production server
npm start

# Alternatively, for full development mode:
npm run dev:server    # Starts API on http://localhost:3000
npm run dev:client    # Starts Vite client on http://localhost:5173
```
Visit **http://localhost:3000** in your browser.

---

## 3. Demo Personas & Test Credentials

The platform includes preloaded test fixtures accessible directly from the **Switch Persona** dropdown in the top navbar:

| Persona | Name | Role | Access State | Key Test Fixture Role |
| :--- | :--- | :--- | :--- | :--- |
| **`adminA`** | Alice Admin | `administrator` | Active | Operational oversight, user activation, audit verification. |
| **`ownerA`** | Oscar Owner | `document_owner` | Active | Owns `Financial_Report_Q3.pdf`. Can grant/revoke access. |
| **`ownerB`** | Bob Owner | `document_owner` | Active | Owns `Confidential_Strategy_2027.docx`. |
| **`viewerA`** | Victor Viewer | `viewer` | Active | Has explicit grant on `Financial_Report_Q3.pdf`. Cannot see `docB`. |
| **`viewerB`** | Vera Viewer | `viewer` | Active | Has zero document grants initially. |
| **`inactiveUser`** | Ian Inactive | `viewer` | **Deactivated** | Deactivated account; rejected with 403 on all requests. |

---

## 4. Five-Minute Evaluator Demo Script

Follow this reproducible script to demonstrate all release gates:

1. **Demonstrate Scoped Access & IDOR Protection:**
   - Switch persona to **Victor Viewer A**.
   - Observe that the workspace displays *only* `Financial_Report_Q3.pdf` (total count: 1).
   - In the search bar, search for `Confidential_Strategy_2027.docx` (owned by Bob Owner B). The table returns 0 results without disclosing that the document exists.
2. **Download Document Bytes:**
   - As Victor Viewer A, click the Download icon next to `Financial_Report_Q3.pdf`.
   - The file streams successfully with safe attachment headers (`Content-Disposition: attachment; filename="Financial_Report_Q3.pdf"`, `X-Content-Type-Options: nosniff`).
3. **Grant Access to Another User:**
   - Switch persona to **Oscar Owner A** (owner of `Financial_Report_Q3.pdf`).
   - Click the Info icon to open Document Details.
   - Switch to the **Manage Access** tab.
   - Select **Vera Viewer B** from the user dropdown, choose **Viewer (Read)**, and click **Grant Access**.
   - Notice the grant is recorded immediately. Switch persona to **Vera Viewer B**; `Financial_Report_Q3.pdf` is now visible in her workspace.
4. **Demonstrate Immediate Revocation:**
   - Switch back to **Oscar Owner A**, open `Financial_Report_Q3.pdf` Manage Access, and click **Revoke** next to Victor Viewer A.
   - Switch persona to **Victor Viewer A**; on the very next request, Victor Viewer A has zero accessible documents and any direct ID request returns `404 Not Found`.
5. **Demonstrate Account Deactivation:**
   - Switch persona to **Alice Admin** and navigate to the **Administrator Console**.
   - Locate **Bob Owner B** in the User Management table and click **Deactivate**.
   - Switch persona to **Bob Owner B**; notice the red **Account Deactivated** banner and that all API requests are rejected with `403 Forbidden`.
6. **Verify Tamper-Evident Audit Chain:**
   - In the **Administrator Console**, click the **Verify Chain Integrity** button.
   - Observe the green badge: `Chain Verified (XX events unbroken)`.
   - The cryptographic verifier recalculates the SHA-256 canonical hash across all sequential events and validates that `previous_hash` linkage is unbroken.

---

## 5. Database Schema & Migrations

Database definitions are located in `supabase/migrations/`:
- `001_initial_schema.sql`: Contains `profiles`, `documents`, `document_grants`, `audit_events`, `audit_chain_state`, the append-only trigger `trg_prevent_audit_mutation`, and the serialized cryptographic RPC function `append_audit_event`.
- `seed.sql`: Contains deterministic test UUIDs and synthetic fixtures.

To apply migrations against your Supabase project:
```bash
# Link your Supabase project
npx supabase link --project-ref YOUR_PROJECT_REF

# Push migrations
npx supabase db push
```

---

## 6. Known Limitations & Threat Model

In accordance with Section 1.104 and Section 12 of the MVP specification:
- **In-Flight Bytes:** Once bytes have been transferred over TCP and saved to client disk, they cannot be physically recalled from client memory upon grant revocation. Access is blocked on all subsequent requests.
- **External Immutable Anchoring:** The cryptographic hash chain detects modification and sequence gaps within its trust boundary. Protection against a compromised database superuser with direct root access to rewrite historical tables without audit evidence requires external immutable anchoring (out of MVP scope).

For the complete threat register, refer to [THREATS.md](file:///C:/Users/pavan/OneDrive/Documents/trust/THREATS.md).  
For the complete API contract and schema specifications, refer to [docs/API.md](file:///C:/Users/pavan/OneDrive/Documents/trust/docs/API.md).  
For the AI pair programming log, refer to [PROMPTS.md](file:///C:/Users/pavan/OneDrive/Documents/trust/PROMPTS.md).
