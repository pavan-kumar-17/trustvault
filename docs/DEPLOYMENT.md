# TrustVault Deployment Guide: Vercel & Supabase

This guide walks you through deploying TrustVault to **Vercel** (Frontend + Serverless API) and connecting it to **Supabase** (PostgreSQL Database, Auth & Private Storage).

---

## Part 1: Supabase Database Preparation

### 1. Create a Supabase Project
1. Log in to [supabase.com](https://supabase.com).
2. Click **New project**, choose an organization, give it a name (e.g. `trustvault-prod`), and set a strong database password.
3. Wait ~1 minute for the project to provision.

### 2. Run the Complete Setup Script
1. In the Supabase Dashboard left sidebar, click **SQL Editor**.
2. Click **New query**.
3. Open the file [`supabase/complete_setup.sql`](../supabase/complete_setup.sql) in this repository and copy its entire content.
4. Paste it into the SQL Editor and click **Run**.

**What this automatically provisions:**
- **Tables:** `profiles`, `documents`, `document_grants`, `audit_events`, and `audit_chain_state`.
- **Triggers:** `trg_prevent_audit_mutation` (enforces append-only immutable audit rows; prohibits `UPDATE` and `DELETE`).
- **Stored Functions:** `append_audit_event()` with exclusive transaction-level locking for the serialized SHA-256 hash chain.
- **RLS Policies:** Explicit Row-Level Security policies on all tables.
- **Storage Bucket:** A private `documents` bucket with a 10MB file size limit and strict MIME type allowlist.
- **Seed Users in `auth.users` & `profiles`:** Pre-creates all 6 evaluation personas (`adminA`, `ownerA`, `ownerB`, `viewerA`, `viewerB`, `inactiveUser`) with default password:
  ```text
  TrustVault2026!
  ```

### 3. Copy Project API Keys
1. In Supabase Dashboard, go to **Project Settings** -> **API**.
2. Copy the following values:
   - **Project URL:** `https://your-project-ref.supabase.co`
   - **anon / public key:** `eyJ...` (Project API Keys -> `anon` / `public`)
   - **service_role key:** `eyJ...` (Project API Keys -> `service_role` - secret, keep server-only)

---

## Part 2: Deploying to Vercel via CLI

The project is already pre-configured for Vercel with:
- `vercel.json` (routing rewrites for `/api` and `/healthz`)
- `api/index.ts` (Express serverless adapter)
- `dist/client` (optimized Vite React bundle)

### Step 1: Login to Vercel CLI
Run in your terminal from the project root:
```bash
npx vercel login
```
Follow the browser or email authentication prompt.

### Step 2: Deploy to Preview
Run:
```bash
npx vercel
```
Vercel CLI will ask a few setup questions:
- **Set up and deploy?** `Y`
- **Which scope?** (Select your personal account or team)
- **Link to existing project?** `N`
- **What's your project's name?** `trustvault`
- **In which directory is your code located?** `./`
- **Want to modify these settings?** `N` (settings are auto-detected from `vercel.json`)

### Step 3: Configure Environment Variables in Vercel
Set the environment variables in your Vercel project:
```bash
npx vercel env add SUPABASE_URL
# Enter your Supabase Project URL (e.g. https://xyz.supabase.co)
# Select: Production, Preview, Development

npx vercel env add SUPABASE_PUBLISHABLE_KEY
# Enter your Supabase anon/public key

npx vercel env add SUPABASE_SECRET_KEY
# Enter your Supabase service_role key

npx vercel env add JWT_SECRET
# Enter a random 32+ character string (e.g. openssl rand -hex 32)

npx vercel env add NODE_ENV
# Enter: production
```

*(Alternatively, you can set these variables in the Vercel Web Dashboard under **Project Settings -> Environment Variables**).*

### Step 4: Deploy to Production
Trigger the live production deployment:
```bash
npx vercel --prod
```
Vercel will output your live URL (e.g., `https://trustvault-xyz.vercel.app`).

---

## Part 3: Live Verification Checklist

Once deployed, verify your deployment:

1. **Check Public Health Endpoint:**
   ```bash
   curl https://your-project.vercel.app/healthz
   ```
   Should return: `{"status":"ok","service":"TrustVault","timestamp":"..."}`

2. **Open the Web Application:**
   Visit `https://your-project.vercel.app` in your browser.
   - Use the **Switch Persona** dropdown to test:
     - `Alice Admin`: Check the **Administrator Console** and run **Verify Chain Integrity**.
     - `Oscar Owner A`: Verify documents and manage per-document grants.
     - `Victor Viewer A`: Verify access only to granted documents.
     - `Ian Inactive`: Verify immediate `403 Account is deactivated` rejection.
