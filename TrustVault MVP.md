# TrustVault --- Final MVP Specification

**Version:** 2.0 --- Final MVP baseline\
**Date:** 2026-10-18\
**Delivery target:** 7 days\
**Product:** Company-only, per-document secure sharing\
**Primary acceptance criterion:** A user who has not been granted access
cannot retrieve a document or its sensitive metadata through any
application or storage route. Allowed and refused security-relevant
actions leave verifiable audit evidence.

------------------------------------------------------------------------

## 1. Executive decision

TrustVault will be a deliberately small, security-first document-sharing
product. The MVP will support authentication, document upload and
download, per-document grants, search, soft deletion, user
administration, and a tamper-evident audit trail. It will not attempt to
become a full document-management suite.

### Selected stack

  -------------------------------------------------------------------------
  Layer                   Final decision            Rationale
  ----------------------- ------------------------- -----------------------
  Language                TypeScript, strict mode   One language across
                                                    frontend and backend;
                                                    strong editor support
                                                    and easier debugging.
                                                    Runtime validation is
                                                    still mandatory.

  Frontend                React + Vite              Simple SPA and quick
                                                    iteration.

  API                     Node.js + Express +       Explicit request
                          TypeScript                lifecycle and
                                                    easy-to-review
                                                    middleware.

  Identity                Supabase Auth             Managed credentials and
                                                    account lifecycle.

  Database                Supabase PostgreSQL       Relational constraints,
                                                    transactions,
                                                    functions, migrations,
                                                    and RLS.

  Database access         `@supabase/supabase-js`   Avoid hiding policy
                          for user-scoped calls;    predicates. Never use
                          SQL migrations and        the service-role client
                          narrowly scoped           as a shortcut for
                          PostgreSQL functions for  ordinary user
                          sensitive atomic          operations.
                          operations                

  File storage            Private Supabase Storage  No public object URLs.
                          bucket                    Download through an
                                                    authorized application
                                                    path.

  Runtime validation      Zod                       Validate request
                                                    bodies, query
                                                    parameters, uploaded
                                                    metadata, and
                                                    environment
                                                    configuration.

  Tests                   Vitest + Supertest;       Route-level negative
                          Playwright smoke tests    tests plus a small
                                                    browser-level suite.

  Deployment              One Node web service +    Minimal operations and
                          one Supabase project      one application origin.

  Code quality            ESLint + Prettier +       Consistent, reviewable
                          TypeScript strict checks  code.
  -------------------------------------------------------------------------

### Final architecture choices

1.  **One application:** React SPA and Express API are deployed together
    on one HTTPS origin.
2.  **Supabase Auth remains the identity provider.** Application roles
    are stored in a protected `profiles` table, not in user-editable
    metadata.
3.  **Per-document named-user grants only.** No folder inheritance,
    group permissions, or public share links.
4.  **All document downloads pass through Express.** The server checks
    current authorization and streams bytes from the private Storage
    bucket. No public URLs or signed download URLs are issued.
5.  **RLS is defense in depth, not a substitute for API authorization.**
    User-scoped Supabase requests must use the caller's identity.
    Privileged server operations are isolated, narrow, and separately
    tested.
6.  **Sensitive audit writes are database-controlled.** A PostgreSQL
    function serializes hash-chain appends and enforces append-only
    behaviour.
7.  **One document workspace, one details view, one access-management
    workflow, one admin console.** Avoid duplicate screens and duplicate
    endpoints.

**Security wording:** The MVP aims for a tested, least-privilege
application boundary. It must not claim to be absolutely tamper-proof or
able to recall bytes already downloaded.

------------------------------------------------------------------------

## 2. Goals, non-goals, and release gate

### Goals

-   Authenticate users with Supabase Auth and support Administrator,
    Document Owner, and Viewer roles.
-   Upload, organize, list, search, edit metadata, download, and
    soft-delete documents.
-   Grant and revoke `read` or `edit` access to named active users per
    document.
-   Enforce authorization server-side on every implemented document
    operation.
-   Make grant revocation effective on the next request.
-   Record allowed and refused access attempts, permission changes, and
    document lifecycle events.
-   Make audit records append-only to the runtime application role and
    tamper-evident through a serialized hash chain.
-   Prove cross-user isolation through automated negative tests.
-   Deploy a live demonstration using synthetic files and demo-only
    accounts.

### Explicit non-goals

Do not build these in the seven-day MVP:

-   Folder inheritance, group-based grants, or public share links.
-   Long-lived signed download URLs.
-   Document preview, thumbnails, OCR, or content indexing.
-   File co-editing, version history, bulk actions, and exports.
-   AI permission recommendations.
-   Advanced anomaly scoring or a separate analytics/search service.
-   Enterprise SSO/SCIM or a custom password system.
-   A recycle-bin restoration UI.
-   A promise that already delivered or in-flight bytes can be recalled
    after revocation.

### Release rule

If a cross-user security test fails, stop feature work until the issue
is fixed. Do not compensate for a backend flaw by hiding a button or
changing the UI. A feature without a tested server-side access rule is
not complete.

------------------------------------------------------------------------

## 3. Roles and permission model

### Role definitions

  -------------------------------------------------------------------------
  Capability          Administrator     Document Owner    Viewer
  ------------------- ----------------- ----------------- -----------------
  Manage user         Yes               No                No
  activation/status                                       

  View global         Yes               No                No
  security audit                                          

  Upload a document   Yes               Yes               No

  Read/download own   Yes, if the admin Yes               N/A
  document            is the recorded                     
                      owner                               

  Read/download       Only with an      Only with an      Only with an
  another user's      explicit grant or explicit grant    explicit grant
  document            explicit audited                    
                      break-glass                         
                      feature (not in                     
                      MVP)                                

  Edit document       Only as owner or  Own documents or  No
  metadata            with an `edit`    with an `edit`    
                      grant             grant             

  Replace file bytes  Defer from MVP;   Defer from MVP    No
                      if added, require                   
                      owner/`edit`                        
                      permission and a                    
                      dedicated audit                     
                      event                               

  Grant/revoke access For any document  Own documents     No
                      only through an   only              
                      explicit audited                    
                      administrator                       
                      action                              

  Soft-delete         Any document      Own documents     No
  document            through an                          
                      explicit audited                    
                      admin action with                   
                      a reason                            

  Search documents    Accessible        Accessible        Accessible
                      documents only    documents only    documents only
  -------------------------------------------------------------------------

**Administrator is an operational role, not an automatic content-access
bypass.** Administrators can manage users and inspect global security
activity. They do not automatically get to read all document contents or
metadata. Admin actions that change grants or delete documents must
record the actor and a reason. Do not use the vague rule "acting on
behalf of the owner"; define and test each administrative capability.

### Document grants

-   Grants are per document and per named active user. There is no
    folder inheritance.
-   `read` permits metadata read and download.
-   `edit` implies `read` and permits editing the allowed metadata
    fields.
-   The owner always has access to their own active document.
-   A user cannot grant access to a document they do not own, except
    through the explicit administrator grant operation.
-   A grant cannot be issued to an inactive user.
-   A user cannot assign their own role, owner ID, actor ID, grantor ID,
    or audit fields.
-   Default is deny. Missing grant, inactive user, deleted document,
    invalid ID, or failed policy check never grants access.
-   Upload ownership is explicit: the server assigns the authenticated
    Document Owner as owner. An Administrator uploading on behalf of
    someone must choose a valid owner through a separately validated
    admin upload path; the browser cannot set an arbitrary owner field.

### Metadata visibility

Search, listing, sorting, pagination, and total counts must operate only
over documents the caller can access. Do not globally search and filter
in the browser. For inaccessible versus nonexistent document IDs, return
a uniform external response (normally `404`) when existence is
sensitive, while logging the true internal reason.

------------------------------------------------------------------------

## 4. Five-level decision process

Each important decision is scored from 1 (poor) to 5 (strong) across
security, revocation, auditability, build/debug effort, and operational
simplicity. A high total never overrides a security veto. The scores
guide trade-offs; they are not proof of safety.

### Decision A --- Architecture

  --------------------------------------------------------------------------------------------------------
  Option            Security   Revocation   Auditability   Build/debug   Operations     Total Decision
  --------------- ---------- ------------ -------------- ------------- ------------ --------- ------------
  TypeScript               5            5              5             5            4     24/25 **Accept**
  monolith +                                                                                  
  Supabase                                                                                    

  Separate                 4            4              4             3            3     18/25 Reject for
  frontend and                                                                                MVP
  API deployments                                                                             

  Microservices            3            3              3             1            1     11/25 Reject

  Python                   4            4              4             4            4     20/25 Reject:
  full-stack                                                                                  excluded by
                                                                                              user
  --------------------------------------------------------------------------------------------------------

**Reason:** One deployable application reduces CORS, secret-management,
and deployment complexity. Keep code modular even though it deploys
together.

### Decision B --- API framework

  -----------------------------------------------------------------------------------------------------
  Option         Security   Revocation   Auditability   Build/debug   Operations     Total Decision
  ------------ ---------- ------------ -------------- ------------- ------------ --------- ------------
  Express +             4            5              5             5            4     23/25 **Accept**
  TypeScript                                                                               

  NestJS                4            5              5             3            4     21/25 Reject for
                                                                                           MVP

  Fastify               4            5              5             4            4     22/25 Viable, not
                                                                                           selected
  -----------------------------------------------------------------------------------------------------

**Reason:** Express has a small mental model. Security depends on
explicit middleware, central policy code, and tests---not on framework
choice.

### Decision C --- Supabase access pattern

  -----------------------------------------------------------------------------------------------------------
  Option               Security   Revocation   Auditability   Build/debug   Operations     Total Decision
  ------------------ ---------- ------------ -------------- ------------- ------------ --------- ------------
  User-scoped                 5            5              4             4            4     22/25 **Accept**
  Supabase client                                                                                
  for ordinary                                                                                   
  data/Storage                                                                                   
  access + explicit                                                                              
  server policy +                                                                                
  RLS                                                                                            

  Service-role                2            5              4             4            4     19/25 Reject as
  client for every                                                                               default
  request, relying                                                                               
  only on Express                                                                                
  checks                                                                                         

  Direct browser              1            3              2             5            4     15/25 Reject
  database/storage                                                                               
  access without                                                                                 
  tested RLS                                                                                     
  -----------------------------------------------------------------------------------------------------------

**Reason:** The service-role key bypasses RLS. Ordinary operations
should use the authenticated caller's identity so database and Storage
policies can act as defense in depth. Use a privileged client only for
narrowly defined admin operations that cannot be performed safely under
the user's role. Those operations require explicit authorization, audit
evidence, and negative tests.

### Decision D --- Authentication and token transport

  ----------------------------------------------------------------------------------------------------
  Option          Security   Revocation   Auditability   Build/debug   Operations     Total Decision
  ------------- ---------- ------------ -------------- ------------- ------------ --------- ----------
  Supabase Auth          4            4              4             5            4     21/25 **Accept
  bearer token                                                                              for MVP**
  sent to                                                                                   
  Express;                                                                                  
  strict CSP                                                                                
  and XSS                                                                                   
  prevention;                                                                               
  token never                                                                               
  in URL                                                                                    

  Custom                 2            3              3             1            2     11/25 Reject
  password                                                                                  
  system                                                                                    

  Trust role             2            2              2             5            5     16/25 Reject
  claims in a                                                                               
  long-lived                                                                                
  token without                                                                             
  current DB                                                                                
  status lookup                                                                             
  ----------------------------------------------------------------------------------------------------

**Reason:** Supabase Auth handles credentials. The SPA uses the
supported Supabase client flow and sends its access token as a bearer
token to Express. Express verifies the token with Supabase Auth, then
loads the current `profiles` row on every protected request. Do not
trust client-editable role metadata. Never put tokens in URLs or logs.

**Trade-off:** Browser-managed tokens increase the impact of XSS. Use a
restrictive Content Security Policy, avoid unsafe HTML rendering, keep
dependencies lean, and do not store other secrets in browser storage. If
the product later handles high-value regulated records, consider a
Backend-for-Frontend with HttpOnly cookies and a carefully designed
server-side session layer.

**Revocation distinction:** Grant revocation and account deactivation
must fail on the next API request because current grants and account
status are checked each time. A Supabase JWT may remain
cryptographically valid until expiry; this does not permit the API to
ignore the current `is_active` state. Test with an already-issued token.

### Decision E --- Permission model

  -------------------------------------------------------------------------------------------------------
  Option           Security   Revocation   Auditability   Build/debug   Operations     Total Decision
  -------------- ---------- ------------ -------------- ------------- ------------ --------- ------------
  Per-document            5            5              5             5            4     24/25 **Accept**
  grants to                                                                                  
  named users                                                                                

  Folder                  2            3              3             3            3     14/25 Reject
  inheritance                                                                                

  Groups                  4            4              4             3            3     18/25 Defer

  Public share            1            1              2             4            3     11/25 Reject
  links                                                                                      
  -------------------------------------------------------------------------------------------------------

**Reason:** Named grants are the easiest model to explain, audit, and
test. The usability cost of granting each document separately is
accepted to prevent accidental sibling-document exposure.

### Decision F --- File delivery

  -----------------------------------------------------------------------------------------------------
  Option         Security   Revocation   Auditability   Build/debug   Operations     Total Decision
  ------------ ---------- ------------ -------------- ------------- ------------ --------- ------------
  Private               5            5              5             4            3     22/25 **Accept**
  bucket +                                                                                 
  authorized                                                                               
  Express                                                                                  
  streaming                                                                                

  Public                1            1              1             5            4     12/25 Reject
  bucket or                                                                                
  static file                                                                              
  path                                                                                     

  Long-lived            3            1              3             4            4     15/25 Reject
  signed URLs                                                                              
  -----------------------------------------------------------------------------------------------------

**Reason:** Express checks the current grant and then streams bytes from
the private bucket using a server-side Storage client scoped to the
caller wherever possible. Do not issue public URLs or signed URLs. This
costs server bandwidth but ensures new download requests are checked
against current permissions.

**Limitation:** Bytes already delivered, saved, or being streamed cannot
reliably be recalled after revocation. State that honestly.

### Decision G --- Audit integrity

  ------------------------------------------------------------------------------------------------------
  Option          Security   Revocation   Auditability   Build/debug   Operations     Total Decision
  ------------- ---------- ------------ -------------- ------------- ------------ --------- ------------
  Append-only            5            4              5             3            3     20/25 **Accept**
  table +                                                                                   
  restricted                                                                                
  roles +                                                                                   
  serialized                                                                                
  hash-chain                                                                                
  RPC +                                                                                     
  verifier                                                                                  

  Mutable audit          1            4              1             5            4     15/25 Reject
  rows                                                                                      

  Hash chain             2            4              2             3            3     14/25 Reject
  without                                                                                   
  concurrency                                                                               
  control or                                                                                
  privilege                                                                                 
  separation                                                                                

  External               5            4              5             2            2     18/25 Defer
  immutable                                                                                 
  logging                                                                                   
  service                                                                                   
  ------------------------------------------------------------------------------------------------------

**Reason:** Use a PostgreSQL function to append events in a serialized
transaction, lock the chain head, compute the next hash, and insert an
event. Revoke runtime `UPDATE`/`DELETE` on audit rows and add a trigger
as defense in depth. A hash chain detects tampering within its trust
boundary but cannot defeat a fully privileged attacker who can rewrite
both the events and all trusted chain material. External anchoring is
out of scope.

### Decision H --- Search and routes

  ----------------------------------------------------------------------------------------------------------
  Option              Security   Revocation   Auditability   Build/debug   Operations     Total Decision
  ----------------- ---------- ------------ -------------- ------------- ------------ --------- ------------
  One scoped                 5            5              4             5            5     24/25 **Accept**
  list/search                                                                                   
  endpoint                                                                                      

  Separate list,             3            4              3             2            2     14/25 Reject for
  search, count,                                                                                MVP
  and autocomplete                                                                              
  endpoints from                                                                                
  day one                                                                                       

  Independent                3            2              3             2            2     12/25 Defer
  search index with                                                                             
  ACL                                                                                           
  synchronization                                                                               
  ----------------------------------------------------------------------------------------------------------

**Reason:** One endpoint handles query filters, sorting, and pagination,
with the access predicate applied in the database before rows or counts
are calculated. No separate count/autocomplete API is needed initially.

### Decision I --- Upload validation

  ------------------------------------------------------------------------------------------------------------
  Option                Security   Revocation   Auditability   Build/debug   Operations     Total Decision
  ------------------- ---------- ------------ -------------- ------------- ------------ --------- ------------
  Narrow allowlist +           5            4              4             4            4     21/25 **Accept**
  size limits +                                                                                   
  signature/content                                                                               
  checks + safe                                                                                   
  attachment delivery                                                                             

  Trust extension or           1            3              2             5            4     15/25 Reject
  browser MIME                                                                                    

  Accept every format          2            3              3             3            2     13/25 Reject
  and rely only on                                                                                
  antivirus                                                                                       
  ------------------------------------------------------------------------------------------------------------

**Reason:** Allow only required formats such as PDF, DOCX, XLSX, PNG,
and JPEG. Reject HTML, SVG, executables, archives, and unsupported
formats. Validate size, extension, claimed MIME, and detected signature.
Signature checks are not proof that a file is safe. If malware scanning
cannot be operated reliably, document that limitation rather than
claiming uploads are virus-free.

### Decision J --- MVP scope

  -----------------------------------------------------------------------------------------------------------
  Option               Security   Revocation   Auditability   Build/debug   Operations     Total Decision
  ------------------ ---------- ------------ -------------- ------------- ------------ --------- ------------
  Finish                      5            5              5             5            4     24/25 **Accept**
  permissions,                                                                                   
  audit, tests,                                                                                  
  deployment, and a                                                                              
  coherent UI first                                                                              

  Build previews, AI          2            2              3             1            2     10/25 Reject
  recommendations,                                                                               
  versioning, and                                                                                
  bulk actions in                                                                                
  week one                                                                                       
  -----------------------------------------------------------------------------------------------------------

------------------------------------------------------------------------

## 5. Architecture and authorization contract

### Request flow

``` text
React SPA
  |
  | HTTPS + Supabase Auth bearer token (Authorization header)
  v
Express API
  1. Validate request with Zod
  2. Verify token with Supabase Auth
  3. Load current profile (role + is_active)
  4. Apply central document policy
  5. Perform user-scoped database/Storage operation where possible
  6. Append audit event for security-relevant outcome
  7. Return a non-disclosing response
  |
  +---- Supabase PostgreSQL: profiles, documents, grants, audit_events
  |
  +---- Private Supabase Storage bucket: opaque object keys only
```

### One policy model

Create a central policy module with an interface such as:

``` ts
type DocumentAction =
  | "read"
  | "edit_metadata"
  | "download"
  | "delete"
  | "grant"
  | "revoke"
  | "view_document_audit";

type AccessDecision = {
  allowed: boolean;
  reason:
    | "owner"
    | "explicit_read_grant"
    | "explicit_edit_grant"
    | "missing_grant"
    | "inactive_user"
    | "deleted_document"
    | "document_not_found"
    | "wrong_role";
};

async function authorizeDocumentAction(
  actor: AuthenticatedUser,
  documentId: string,
  action: DocumentAction,
  requestContext: RequestContext
): Promise<AuthorizedDocument>;
```

This is a contract, not a complete implementation. It must be the only
application policy model used by document routes. Search uses the
equivalent ownership/grant predicate directly in SQL because it
authorizes a result set rather than one document.

### Supabase trust boundaries

-   The Supabase publishable/anon key may be present in the frontend,
    but it grants no permissions by itself. RLS policies must be
    correct.
-   The `service_role`/secret key must never be sent to the browser,
    logged, or committed.
-   Do not use the service-role client for ordinary user reads or
    downloads.
-   If a privileged server action requires the service role, authorize
    the actor first, validate the operation, and write an audit event.
    Keep the action in a small dedicated module, not scattered across
    routes.
-   Enable RLS on every exposed application table. Tables not intended
    for direct client access should still have RLS enabled with no
    permissive policies.
-   Storage bucket is private. Storage policies must restrict object
    operations to intended paths and actors. If all file operations are
    performed through a privileged API client, recognize that Storage
    RLS is bypassed and ensure the API policy is tested.
-   Use opaque random object keys; never use a user-provided filename as
    a path or treat an unguessable key as authorization.
-   Avoid two independent implementations of permission rules. Write
    policy tests that compare the Express decision with allowed/denied
    RLS and Storage behaviour.

### Search predicate

The list/search query must constrain documents to:

-   documents owned by the current active user; OR
-   documents with an active grant for the current active user;

and must also exclude soft-deleted documents. Apply this predicate
before filtering, sorting, counting, and pagination. Do not query all
documents and filter them in JavaScript.

### Uniform denial behaviour

-   Return a generic `404` for a nonexistent or inaccessible document
    when existence is sensitive.
-   Do not reveal hidden titles, owners, categories, storage keys, or
    grant state in errors.
-   Record a precise internal reason code in audit evidence.
-   Rate-limit repeated denials to limit enumeration and audit flooding.
-   Never include SQL, stack traces, environment variables, or
    filesystem/storage internals in responses.

------------------------------------------------------------------------

## 6. Simplified product experience

The product has four primary areas. Avoid creating separate screens that
duplicate the same data.

### A. Document workspace

One primary table with:

-   Name
-   Category
-   Owner
-   Uploaded date
-   Access summary (for authorized users only)
-   Actions appropriate to the current user's permissions

Above the table: one search field, a small category filter, sort
control, and pagination. Do not add standalone count or autocomplete
endpoints for the MVP.

### B. Document details

One detail page with tabs or sections for:

-   Metadata
-   Manage access (only owner or authorized administrator)
-   Recent activity (only if the caller may view it)
-   Download (only if authorized)

Do not split metadata, sharing, and history into multiple navigation
destinations unless usability testing later proves it necessary.

### C. Manage access workflow

1.  Owner opens Manage access.
2.  Searches for an active named user using a server-scoped user
    directory endpoint.
3.  Chooses Viewer (`read`) or Editor (`edit`).
4.  Confirms the change.
5.  Sees current grants and can revoke them.
6.  The server records the grant/revoke event and updates access before
    returning success.

Do not expose a global user directory to viewers. The user lookup
endpoint must return only the minimum fields needed for sharing and only
to authorized grant managers.

### D. Administrator console

Keep these together:

-   User activation/deactivation
-   Global security activity
-   Audit-chain verification
-   Administrative grant/delete actions with mandatory reasons

Do not add a separate global document browser or grant admins automatic
content access.

### User-facing status and errors

Use clear messages such as "You no longer have access to this document"
without disclosing its title or owner. Confirm destructive actions and
permission changes. Show loading, empty, and error states. UI visibility
is usability, not authorization.

------------------------------------------------------------------------

## 7. Data model

Use UUIDs for IDs and server-generated random object keys for Storage.

### `profiles`

-   `id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`
-   `display_name TEXT NOT NULL`
-   `role TEXT NOT NULL CHECK (role IN ('administrator','document_owner','viewer'))`
-   `is_active BOOLEAN NOT NULL DEFAULT TRUE`
-   `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
-   `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Supabase Auth owns email and password credentials. Never store password
hashes in `profiles`. New accounts receive a safe default role through a
trusted signup/admin workflow. Users cannot update their own role or
activation status. Deactivation blocks subsequent API requests even when
the Auth token has not expired.

### `documents`

-   `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
-   `owner_id UUID NOT NULL REFERENCES profiles(id)`
-   `storage_key TEXT UNIQUE NOT NULL`
-   `display_name TEXT NOT NULL`
-   `category TEXT NOT NULL`
-   `detected_content_type TEXT NOT NULL`
-   `size_bytes BIGINT NOT NULL CHECK (size_bytes > 0)`
-   `sha256_hex CHAR(64) NOT NULL`
-   `status TEXT NOT NULL CHECK (status IN ('active','deleted'))`
-   `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
-   `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
-   `deleted_at TIMESTAMPTZ NULL`

Never return the storage key to the browser. Do not put the original
filename in the object path.

### `document_grants`

-   `document_id UUID NOT NULL REFERENCES documents(id)`
-   `user_id UUID NOT NULL REFERENCES profiles(id)`
-   `permission TEXT NOT NULL CHECK (permission IN ('read','edit'))`
-   `granted_by UUID NOT NULL REFERENCES profiles(id)`
-   `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
-   `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
-   `PRIMARY KEY (document_id, user_id)`

`edit` implies `read`. Revocation removes or deactivates the current
grant and appends an audit event in the same database transaction.
Historical permission changes live in audit events.

### `audit_events`

-   `sequence BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`
-   `event_id UUID UNIQUE NOT NULL`
-   `occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()`
-   `actor_user_id UUID NULL REFERENCES profiles(id) ON DELETE SET NULL`
-   `actor_label_snapshot TEXT NULL`
-   `action TEXT NOT NULL`
-   `target_type TEXT NOT NULL`
-   `target_id TEXT NULL`
-   `outcome TEXT NOT NULL CHECK (outcome IN ('allowed','denied','success','failure'))`
-   `reason_code TEXT NOT NULL`
-   `request_id UUID NOT NULL`
-   `source_ip_hash TEXT NULL`
-   `user_agent_summary TEXT NULL`
-   `details JSONB NOT NULL DEFAULT '{}'::jsonb`
-   `previous_hash CHAR(64) NULL`
-   `event_hash CHAR(64) NOT NULL`

Do not log passwords, access/refresh tokens, cookies, file bytes, or
unnecessary personal data. Sanitize untrusted strings. Store raw IP
addresses only if a documented operational/legal need requires them;
otherwise use a privacy-preserving keyed hash.

### Audit chain and database privileges

Implement a narrowly scoped PostgreSQL function that:

1.  Validates the event payload and permitted fields.
2.  Acquires a transaction-level lock or locks a single chain-head row.
3.  Reads the previous hash.
4.  Canonicalizes the event representation.
5.  Computes the next hash from the previous hash and event payload.
6.  Inserts the event and updates the chain head atomically.
7.  Returns only a minimal result.

Use a dedicated migration/schema-owner credential, separate from the web
runtime. The runtime role must not own the audit table and must not have
`UPDATE` or `DELETE` privileges on audit records. Add a trigger that
rejects updates/deletes as defense in depth. Test concurrent writes to
ensure no forks or duplicate previous hashes.

Use a carefully reviewed `SECURITY DEFINER` function only where
required; set a fixed safe `search_path`, schema-qualify objects,
restrict `EXECUTE` grants, validate inputs, and prevent untrusted
callers from spoofing another actor. For user-scoped RPC calls, derive
actor identity from `auth.uid()`. For privileged admin operations, the
database entry point must only be callable by the trusted server role
and must receive actor identity only after Express has independently
verified the admin.

**Honest limit:** This is tamper-evident within the defined trust
boundary, not proof against a database owner or a fully compromised
privileged server. External immutable anchoring is out of scope.

### Atomicity rule

Grant/revoke and metadata state changes should be committed together
with their required audit events in one database transaction/function.
If the required audit write fails, the sensitive change must fail. A
denial audit must not reveal hidden metadata to the caller. For download
events, record the authorization decision before streaming bytes; if
audit persistence is a required control and fails, fail closed before
sending the file.

------------------------------------------------------------------------

## 8. Final API contract

Use `/api` consistently. Supabase Auth handles credential operations
through its supported client flow; Express does not implement a second
password/login system.

  --------------------------------------------------------------------------------------------------------------------------
  Method         Endpoint                              Purpose                            Allowed caller  Core checks
  -------------- ------------------------------------- ---------------------------------- --------------- ------------------
  `GET`          `/api/me`                             Current identity, role, status     Authenticated   Verify Auth token;
                                                                                                          load current
                                                                                                          active profile

  `GET`          `/api/documents`                      List/search/filter/sort/paginate   Any active role Scoped SQL before
                                                       accessible docs                                    counts and
                                                                                                          pagination

  `POST`         `/api/documents`                      Upload document                    Document Owner; Validate file;
                                                                                          Administrator   assign owner
                                                                                          via explicit    server-side; audit
                                                                                          admin path      

  `GET`          `/api/documents/:id`                  Read metadata                      Owner or        Central policy;
                                                                                          explicit        generic
                                                                                          `read`/`edit`   inaccessible
                                                                                          grant           response

  `GET`          `/api/documents/:id/download`         Stream file bytes                  Owner or        Re-check grant;
                                                                                          explicit        private Storage;
                                                                                          `read`/`edit`   audit before bytes
                                                                                          grant           

  `PATCH`        `/api/documents/:id`                  Edit allowed metadata              Owner or        Allowlisted fields
                                                                                          explicit `edit` only;
                                                                                          grant           transactional
                                                                                                          audit

  `DELETE`       `/api/documents/:id`                  Soft-delete                        Owner or        Policy; immediate
                                                                                          Administrator   access denial;
                                                                                          with explicit   audit
                                                                                          reason          

  `GET`          `/api/documents/:id/grants`           List current grants                Owner or        Do not reveal
                                                                                          authorized      grant list to
                                                                                          Administrator   viewers

  `PUT`          `/api/documents/:id/grants/:userId`   Create/update grant                Owner or        Target active
                                                                                          authorized      user; permission
                                                                                          Administrator   allowlist; audit

  `DELETE`       `/api/documents/:id/grants/:userId`   Revoke grant                       Owner or        Transactional
                                                                                          authorized      revoke; audit;
                                                                                          Administrator   next request
                                                                                                          denied

  `GET`          `/api/documents/:id/audit`            Read document activity             Owner;          Filter fields and
                                                                                          Administrator   rows; audit access
                                                                                          only under      to audit
                                                                                          explicit audit  
                                                                                          policy          

  `GET`          `/api/admin/users`                    List minimal user directory        Administrator   No credentials,
                                                                                                          tokens, or
                                                                                                          unnecessary PII

  `PATCH`        `/api/admin/users/:id/status`         Activate/deactivate account        Administrator   Prevent
                                                                                                          self-escalation;
                                                                                                          audit; block
                                                                                                          inactive user next
                                                                                                          request

  `GET`          `/api/admin/audit`                    Global security activity           Administrator   Paginated; no
                                                                                                          secrets; audit
                                                                                                          access

  `POST`         `/api/admin/audit/verify`             Verify audit chain                 Administrator   Return integrity
                                                                                                          status and
                                                                                                          mismatch sequence
                                                                                                          only; audit
                                                                                                          verification

  `GET`          `/healthz`                            Minimal liveness response          Public          No secrets,
                                                                                                          database details,
                                                                                                          or debug
                                                                                                          information
  --------------------------------------------------------------------------------------------------------------------------

### Routes intentionally not built

No separate endpoints for:

-   `/documents/search`
-   `/documents/count`
-   `/documents/autocomplete`
-   `/documents/:id/preview`
-   `/documents/:id/thumbnail`
-   `/documents/:id/versions`
-   bulk operations or exports
-   public share links

If a feature is not implemented, do not leave a stub that accidentally
serves data. Unsupported routes must return a safe response and have no
static Storage fallback.

### Request and response rules

-   Validate path IDs, query parameters, and JSON bodies with Zod.
-   Use explicit DTOs/allowlists for mutable fields. Never pass
    arbitrary request JSON directly to database updates.
-   Derive actor ID and role from the verified token and current
    profile.
-   Never accept `owner_id`, `actor_user_id`, `granted_by`, `role`,
    `is_active`, `storage_key`, or audit hash fields from ordinary
    client payloads.
-   Use parameterized database operations.
-   Use generic external errors and correlation/request IDs.
-   Rate-limit authentication-related operations, uploads, grants, and
    repeated denials.

------------------------------------------------------------------------

## 9. Security controls

### Authentication and browser security

-   Supabase Auth handles credentials; no custom password database.
-   Verify tokens with Supabase Auth and load current role/status from
    `profiles` on every protected request.
-   Use one documented bearer-token transport. Never put tokens in URLs
    or logs.
-   Apply a restrictive Content Security Policy,
    `X-Content-Type-Options: nosniff`, frame restrictions, and a
    suitable referrer policy.
-   Do not render untrusted HTML or inline active uploaded content.
-   Use HTTPS only in production and configure proxy trust carefully.
-   Keep frontend and backend on the same origin where possible.
-   Do not expose the service-role key or any secret to the browser or
    Git.
-   Rate-limit authentication attempts and repeated denials.
-   Keep secrets in deployment environment settings; `.env.example`
    contains placeholders only.

### Authorization

-   Default deny; central policy module.
-   Re-check current profile status and current grant on every document
    request.
-   No permission caching across requests.
-   RLS enabled on exposed tables; private Storage bucket and explicit
    Storage policies.
-   Ordinary user operations use caller-scoped Supabase access where
    possible.
-   Privileged operations use a narrow allowlisted module and are
    separately audited/tested.
-   Admin role does not automatically grant document-content access.
-   Search filters access in SQL before counts, sorting, or pagination.
-   No authorization depends on hidden buttons or unguessable IDs.

### Upload and Storage

-   Strict upload size limit enforced at the proxy and application.
-   Allowlist only required formats; reject HTML, SVG, executables,
    archives, and unsupported types.
-   Check extension, claimed MIME, and detected signature; reject
    mismatch.
-   Sanitize display filename and generate object key server-side.
-   Upload to a temporary/staging object or use a controlled upload
    workflow; validate before making the document active.
-   Store object in private bucket; use opaque object key; never return
    it to the browser.
-   Compute SHA-256 and store it in metadata.
-   On partial failure, mark incomplete records and clean up orphaned
    objects with a documented reconciliation job.
-   Download as attachment with safe `Content-Disposition` and
    `nosniff`.
-   Stream through Express after current authorization. Do not issue
    public or signed URLs.
-   If malware scanning is unavailable, document it as a limitation;
    never claim the file is virus-free.

### Audit coverage

Audit at least:

-   Auth success/failure where application visibility is available.
-   Upload success/failure.
-   Document metadata reads where required by the product policy.
-   Download allowed/denied.
-   Metadata edit and soft-delete.
-   Grant/revoke, including previous and new permission.
-   User activation/deactivation.
-   Denied access to known or unknown document IDs, without leaking
    details to the caller.
-   Administrator audit reads and integrity verification.
-   Failures of sensitive operations.

Every event should answer who, what, which target (if known), when,
outcome, internal reason, and request ID. Do not log secrets or file
contents. Separate operational logs from the security audit trail.

### Failure behaviour

-   If the required audit write cannot be committed, fail closed for
    sensitive actions.
-   If authorization or current profile lookup fails, do not serve the
    file.
-   If Storage returns an error, do not disclose internal object paths
    or provider details.
-   If the upload partially succeeds, reconcile the database and Storage
    state; do not leave an accessible orphan.
-   Treat rate limits as protection for both the API and the audit
    pipeline.

------------------------------------------------------------------------

## 10. Test plan and release gates

Tests must prove that removing an authorization check causes a test to
fail. Test response bodies and side effects---not only status codes.

### Fixtures

-   `adminA`: Administrator
-   `ownerA`: Document Owner
-   `ownerB`: Document Owner
-   `viewerA`: Viewer
-   `viewerB`: Viewer
-   `docA`: owned by `ownerA`, explicitly granted to `viewerA`
-   `docB`: owned by `ownerB`, not granted to `viewerA`
-   `docDeleted`: soft-deleted
-   `inactiveUser`: deactivated after obtaining an Auth token

Use random UUIDs. Do not rely on sequential identifiers.

### Authentication and status

-   Invalid/expired token rejected.
-   Inactive profile rejected on the next API request even with an
    already-issued valid token.
-   Changing role is effective on the next request because the role is
    loaded from the database.
-   Client cannot set its own role or active status.
-   Tokens never appear in URLs, logs, or API error messages.
-   Browser security headers are present in the deployed build.

### Authorization and IDOR

-   `viewerA` can read/download `docA` only while grant exists.
-   `viewerA` cannot read/download/edit/delete/grant/revoke `docB`.
-   `ownerA` cannot manage `docB`.
-   A viewer cannot grant themselves access.
-   Admin cannot download ungranted document bytes merely because of the
    admin role.
-   Deleted documents are inaccessible to ordinary users.
-   Random IDs and malformed IDs do not reveal metadata.
-   A user cannot mass-assign `owner_id`, role, actor, grantor, Storage
    key, or audit fields.

### Search and metadata leakage

-   Listing/search does not include `docB` for `viewerA`.
-   Counts and pagination totals are computed after the access
    predicate.
-   Search by a hidden document's exact title returns no evidence of its
    existence.
-   Error bodies do not include hidden title, owner, category, grant, or
    Storage key.
-   No separate count/autocomplete route exists that leaks inaccessible
    records.

### RLS and Storage

-   Anonymous/non-privileged client cannot query protected rows.
-   User A's direct Supabase query cannot read user B's ungranted
    document metadata.
-   User A cannot read/download another user's Storage object by
    guessing its key.
-   Storage policies deny public access.
-   Any privileged service-role route has a negative test for each
    access boundary.
-   Browser build and network responses contain no service-role key.
-   Revocation is tested through the API and any direct user-scoped
    Supabase path that is intentionally supported.

### Immediate revocation

1.  Grant `viewerA` read access to `docA`.
2.  Confirm metadata and download succeed.
3.  Revoke the grant.
4.  Reuse the same Auth token and repeat metadata/download.
5.  Assert both fail on the next request.
6.  Change `edit` to `read`; metadata edit must fail on the next
    request.
7.  Deactivate a user and reuse the existing token; API access must
    fail.
8.  Confirm there are no previously issued signed URLs or public URLs to
    continue working.

### Audit integrity

-   Denied read/download creates an audit event with a request ID and
    internal reason.
-   Grant/revoke events record actor, target user, permission, and
    outcome.
-   Audit rows cannot be updated/deleted by the runtime role.
-   Verifier accepts a valid chain and detects modified
    payload/hash/previous link.
-   Concurrent writes produce one valid chain with no forks.
-   Sensitive operations fail closed when required audit persistence
    fails.
-   Users cannot spoof another actor through the audit RPC.
-   Audit reads are themselves audited and do not reveal unauthorized
    document metadata.

### Upload/download

-   Oversized file rejected.
-   MIME/signature/extension mismatch rejected.
-   Unsupported active formats rejected.
-   Traversal/control characters/double extensions do not affect Storage
    paths or headers.
-   Failed validation leaves no accessible object or active database
    row.
-   Partial upload failure is reconciled.
-   Download uses attachment disposition and `nosniff`.
-   Revocation blocks a new download request; the documented
    in-flight/previously downloaded limitation is not misrepresented.

### Mutation-check discipline

For each route, identify the exact policy check that blocks unauthorized
access. Temporarily remove or bypass that check and rerun the matching
test. At least one test must fail. Record the check and test name in the
test notes.

### Definition of done

-   Strict TypeScript build, lint, and tests pass from a clean clone.
-   No known cross-user read or metadata leak remains open.
-   RLS and Storage policy tests pass with non-privileged user tokens.
-   Revocation tests pass with the same existing token.
-   Runtime role cannot mutate audit rows.
-   Hash-chain verifier detects tampering and handles concurrent writes.
-   Production secrets, HTTPS, private Storage, and rate limits are
    configured.
-   Deployed security smoke tests pass.
-   README, API docs, `THREATS.md`, `PROMPTS.md`, and five-minute demo
    are complete.
-   Known limitations are explicit.

------------------------------------------------------------------------

## 11. Seven-day implementation plan

### Day 1 --- Foundation and policy model

-   Create repo, strict TypeScript config, lint, CI, environment
    validation.
-   Create Supabase schema/migrations, profiles, grants, documents, RLS
    policies, private bucket.
-   Configure Supabase Auth and current-profile middleware.
-   Write policy matrix and initial threat register.

**Exit gate:** clean clone runs; protected API rejects invalid identity;
no public Storage access.

### Day 2 --- Authorization before UI

-   Implement central policy module and user-scoped database operations.
-   Implement grant model and audit RPC design.
-   Add cross-user direct-ID tests and RLS tests.
-   Document administrator boundaries.

**Exit gate:** viewer cannot access another user's document via any
implemented metadata route.

### Day 3 --- Upload and download

-   Implement allowlisted upload validation and private Storage
    workflow.
-   Implement server-authorized download streaming.
-   Add checksum, safe headers, audit events, and orphan cleanup
    handling.
-   Test direct Storage access and cross-user download.

**Exit gate:** authorized download succeeds; unauthorized download fails
and is audited.

### Day 4 --- Core workflows

-   Implement one list/search endpoint with scoped SQL.
-   Implement metadata edit, soft-delete, grants, and revocation.
-   Implement account deactivation and administrator workflows.
-   Add same-token revocation tests.

**Exit gate:** all implemented endpoints have positive and negative
tests.

### Day 5 --- Audit integrity and attack review

-   Complete serialized hash-chain RPC and verifier.
-   Test append-only privileges, concurrency, denied attempts, and
    failure-closed behaviour.
-   Perform mutation checks.
-   Expand `THREATS.md`.

**Exit gate:** audit tampering is detected; runtime cannot update/delete
audit events.

### Day 6 --- Deploy and harden

-   Deploy web service and Supabase project.
-   Configure HTTPS, secrets, rate limits, headers, private Storage,
    backups.
-   Seed demo users and synthetic documents.
-   Run security smoke tests against the deployed URL.

**Exit gate:** no critical security test fails in deployment.

### Day 7 --- Judge rehearsal and evidence

-   Test every route and direct Storage path.
-   Verify access after grant revocation and account deactivation.
-   Complete README, API documentation, `THREATS.md`, `PROMPTS.md`.
-   Record five-minute demo and honest limitations.
-   Review commit history and clean-clone setup.

**Exit gate:** reproducible setup, deployed tests pass, and evidence is
ready.

------------------------------------------------------------------------

## 12. Threat register starter

Maintain `THREATS.md` with: threat → mitigation → exact test → status.

  ------------------------------------------------------------------------
  Threat            Mitigation        Required test      Initial status
  ----------------- ----------------- ------------------ -----------------
  IDOR/horizontal   Central policy +  Viewer requests    Must verify
  escalation        scoped queries +  another owner's    
                    RLS               doc on every route 

  Vertical          Server-derived    Viewer submits     Must verify
  escalation        role and          role/admin/owner   
                    allowlisted DTOs  fields             

  Service-role      Avoid privileged  Remove one route   Must verify
  bypass            client for        check and run      
                    ordinary calls;   attack test        
                    isolate admin                        
                    module                               

  Folder/sibling    No folder         Grant one doc;     Mitigated by
  over-sharing      inheritance       sibling stays      design; test
                                      inaccessible       required

  Grant revocation  Current grant     Revoke and reuse   Must verify
  delay             lookup every      same token         
                    request           immediately        

  Inactive account  Current profile   Deactivate and     Must verify
  retains API       status checked    reuse valid token  
  access            per request                          

  Direct Storage    Private bucket    Attempt anonymous  Must verify
  access            and explicit      and cross-user     
                    Storage policies  object access      

  Search metadata   Scoped SQL before Search for hidden  Must verify
  leak              count/page        exact title        

  Audit row         Restricted role + Runtime            Must verify
  mutation          trigger +         UPDATE/DELETE      
                    append-only RPC   attempt            

  Audit chain race  Lock chain head   Concurrent audit   Must verify
                    in transaction    appends            

  Audit chain       Hash chain;       Alter test chain   Partially
  rewrite by        external          and verify failure mitigated
  privileged        anchoring out of                     
  operator          scope                                

  Audit omission on Required audit    Denied             Must verify
  denial            path and          read/download      
                    failure-path      creates event      
                    tests                                

  Upload            Allowlist,        MIME spoofing,     Must verify
  spoofing/active   signature checks, SVG/HTML, double   
  content           attachment        extension          
                    delivery                             

  Orphaned object   Staging workflow  Simulate failure   Must verify
                    and               between Storage    
                    reconciliation    and DB             

  Admin content     No implicit admin Admin attempts     Must verify
  bypass            read access       ungranted download 

  Token leakage/XSS CSP, no URL       Inspect headers    Must verify
                    tokens, avoid     and network/log    
                    unsafe HTML       output             

  Brute force/log   Rate limits       Repeated           Must verify
  flooding                            login/denial       
                                      requests           

  Audit outage      Fail closed       Force audit        Must verify
  during sensitive                    function failure   
  action                                                 

  In-flight         State limitation; Revoke then        Accepted
  download after    block next        initiate new       limitation
  revocation        request           request            
  ------------------------------------------------------------------------

Only mark a threat mitigated after the relevant test passes against the
deployed build.

------------------------------------------------------------------------

## 13. Repository structure

``` text
trustvault/
├── client/
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── features/
│       │   ├── documents/
│       │   ├── access/
│       │   └── admin/
│       ├── lib/supabase.ts
│       └── main.tsx
├── server/
│   └── src/
│       ├── app.ts
│       ├── server.ts
│       ├── config/
│       ├── auth/
│       ├── policy/documentPolicy.ts
│       ├── audit/auditService.ts
│       ├── audit/verifyChain.ts
│       ├── documents/
│       │   ├── documentRoutes.ts
│       │   ├── documentService.ts
│       │   ├── uploadValidation.ts
│       │   └── privateStorage.ts
│       ├── admin/
│       ├── middleware/
│       └── schemas/
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   └── config.toml
├── tests/
│   ├── auth/
│   ├── authorization/
│   ├── rls-storage/
│   ├── revocation/
│   ├── audit/
│   ├── upload/
│   └── e2e/
├── docs/API.md
├── THREATS.md
├── PROMPTS.md
├── README.md
├── .env.example
├── package.json
└── .gitignore
```

Do not place policy logic in React components. Routes should orchestrate
validation, authentication, authorization, service operations, audit,
and response. The policy module owns the application rule; PostgreSQL
functions own atomic audit-chain mechanics.

------------------------------------------------------------------------

## 14. Environment and deployment

Example placeholders only:

``` dotenv
NODE_ENV=development
PORT=3000
PUBLIC_APP_ORIGIN=http://localhost:3000
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=SERVER_ONLY_SECRET_IF_REQUIRED
MAX_UPLOAD_BYTES=10485760
```

-   The publishable/anon key may be used by the browser, with correct
    RLS.
-   The secret/service-role key is server-only and should be omitted
    entirely if no privileged server operation requires it.
-   Validate required environment variables at startup.
-   Never commit real credentials.
-   Keep migrations in Git and test them from a clean Supabase project.
-   Configure private bucket and policies explicitly.
-   Configure HTTPS, secure deployment secrets, request-size limits,
    rate limits, backups, and restore instructions.
-   Back up metadata and document objects; a database backup without
    Storage objects is incomplete.
-   Do not expose debug routes, stack traces, provider error details, or
    secrets in production.
-   Seed only synthetic documents and disposable demo accounts.

------------------------------------------------------------------------

## 15. Required documentation and AI evidence

### `README.md`

Include product summary, stack, architecture, setup from a clean clone,
environment variables, migrations, demo seed instructions, deployment,
demo credentials for each role, tests, API docs, known limitations, and
recovery procedures.

### `THREATS.md`

For each threat, record what it is, what was implemented, the exact
test, status, and accepted risk. Update it throughout development.

### `PROMPTS.md`

At least five dated entries. Each records: 1. What was asked of an AI
tool. 2. What it produced. 3. What was specifically wrong or unverified.
4. What was changed and how it was checked. 5. A commit link showing the
correction.

At least two entries must concern authorization or audit integrity.
Never invent mistakes or commit links; record actual work as it occurs.

### `docs/API.md`

For each endpoint: method/path, authentication, allowed role/action,
schema, response, denial behaviour, and test names.

### Five-minute demo

1.  Sign in as `viewerA`; show only the explicitly granted document.
2.  Attempt a direct-ID request for `docB`; show a generic denial and
    the internal audit event.
3.  As owner, grant access; show successful read/download.
4.  Revoke access; reuse the same token and show the next request fails.
5.  Attempt direct Storage access as an unauthorized user and show
    denial.
6.  As admin, inspect activity and run audit-chain verification.
7.  Show the tests and explain the in-flight-download and
    external-anchor limitations.

Use synthetic files and demo accounts only.

------------------------------------------------------------------------

## 16. Final acceptance checklist

-   [ ] Strict TypeScript build, lint, and tests pass.
-   [ ] Clean-clone setup and migrations work.
-   [ ] Supabase Auth is configured; current profile status/role is
    loaded on every protected request.
-   [ ] Users cannot set their own role, active status, owner, grantor,
    or audit fields.
-   [ ] RLS is enabled and tested on exposed tables.
-   [ ] Storage bucket is private and cross-user direct access is
    denied.
-   [ ] Ordinary user operations do not rely on a service-role client.
-   [ ] Admin does not implicitly bypass document content access.
-   [ ] One scoped endpoint handles list/search/filter/sort/pagination.
-   [ ] Upload validation and partial-failure cleanup work.
-   [ ] Downloads are streamed only after current authorization; no
    public/signed URLs exist.
-   [ ] Revocation blocks the next request with the same token.
-   [ ] Audit records are append-only for runtime role; chain verifier
    detects tampering.
-   [ ] Concurrent audit writes do not fork the chain.
-   [ ] Denials and sensitive operations are audited; audit failure
    handling is tested.
-   [ ] Mutation checks show removing an authorization check causes a
    test failure.
-   [ ] Deployed security smoke tests pass over HTTPS.
-   [ ] `THREATS.md`, `PROMPTS.md`, README, API docs, setup, and demo
    are complete.
-   [ ] Known limitations are stated plainly.

## 17. Final rationale

TrustVault is a secure document-sharing MVP, not a general-purpose
enterprise content platform. Its professional quality comes from
consistent permission behaviour, a small API surface, clear user
workflows, audit evidence, and reproducible security tests---not from
the number of features.

The final design deliberately removes duplicate
search/count/autocomplete routes, previews, thumbnails, versions,
exports, bulk actions, public links, and AI features. It retains the
controls that support the product's central promise: per-document least
privilege, immediate denial after revocation, private storage,
tamper-evident auditing, and adversarial testing.

**Non-negotiable implementation rule:** Every request that can reveal or
change a document must prove current access on the server and leave the
required audit evidence. RLS and Storage policies must agree with that
rule. If a guarantee is not demonstrated by a test against the deployed
build, it is not finished.

**Production-readiness statement:** This document defines the final MVP
target. It does not claim the application has been implemented,
independently audited, or certified secure. Those claims require code
review, deployed tests, and operational evidence.
