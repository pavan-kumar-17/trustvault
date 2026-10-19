-- ============================================================================
-- TrustVault Complete Supabase Production Setup Script
-- Version: 2.0 MVP Baseline
-- Run this script in the Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enable Cryptographic Extensions
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 2. Profiles Table (Tied to Supabase auth.users)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('administrator', 'document_owner', 'viewer')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON public.profiles(is_active);

-- Auto-provision profile trigger when a user signs up via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name, role, is_active)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
        COALESCE(new.raw_user_meta_data->>'role', 'viewer'),
        TRUE
    )
    ON CONFLICT (id) DO UPDATE SET
        display_name = EXCLUDED.display_name;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 3. Documents Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id),
    storage_key TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    category TEXT NOT NULL,
    detected_content_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
    sha256_hex CHAR(64) NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_owner ON public.documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_category ON public.documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_status ON public.documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON public.documents(created_at DESC);

-- ----------------------------------------------------------------------------
-- 4. Document Grants Table (Per-Document Named User Grants)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_grants (
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    permission TEXT NOT NULL CHECK (permission IN ('read', 'edit')),
    granted_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (document_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_document_grants_user ON public.document_grants(user_id);
CREATE INDEX IF NOT EXISTS idx_document_grants_doc ON public.document_grants(document_id);

-- ----------------------------------------------------------------------------
-- 5. Audit Chain State & Audit Events (Tamper-Evident Hash Chain)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_chain_state (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    head_sequence BIGINT NOT NULL DEFAULT 0,
    head_hash CHAR(64) NOT NULL DEFAULT '0000000000000000000000000000000000000000000000000000000000000000',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.audit_chain_state (id, head_sequence, head_hash, updated_at)
VALUES (1, 0, '0000000000000000000000000000000000000000000000000000000000000000', now())
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.audit_events (
    sequence BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    actor_user_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_label_snapshot TEXT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('allowed', 'denied', 'success', 'failure')),
    reason_code TEXT NOT NULL,
    request_id UUID NOT NULL,
    source_ip_hash TEXT NULL,
    user_agent_summary TEXT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    previous_hash CHAR(64) NULL,
    event_hash CHAR(64) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_events_occurred_at ON public.audit_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON public.audit_events(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_target ON public.audit_events(target_id);

-- Enforce append-only: Prohibit UPDATE and DELETE on audit records
CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit records are append-only. UPDATE and DELETE operations are forbidden.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_mutation ON public.audit_events;
CREATE TRIGGER trg_prevent_audit_mutation
BEFORE UPDATE OR DELETE ON public.audit_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();

-- Serialized Hash Chain Append Stored Procedure
CREATE OR REPLACE FUNCTION public.append_audit_event(
    p_event_id UUID,
    p_actor_user_id UUID,
    p_actor_label_snapshot TEXT,
    p_action TEXT,
    p_target_type TEXT,
    p_target_id TEXT,
    p_outcome TEXT,
    p_reason_code TEXT,
    p_request_id UUID,
    p_source_ip_hash TEXT,
    p_user_agent_summary TEXT,
    p_details JSONB
)
RETURNS TABLE (
    sequence BIGINT,
    event_id UUID,
    occurred_at TIMESTAMPTZ,
    event_hash CHAR(64),
    previous_hash CHAR(64)
) AS $$
DECLARE
    v_prev_hash CHAR(64);
    v_new_hash CHAR(64);
    v_timestamp TIMESTAMPTZ := clock_timestamp();
    v_canonical_text TEXT;
    v_new_seq BIGINT;
    v_event_uuid UUID := COALESCE(p_event_id, gen_random_uuid());
BEGIN
    -- Exclusive transaction lock on chain head to prevent forks/races
    SELECT head_hash INTO v_prev_hash
    FROM public.audit_chain_state
    WHERE id = 1
    FOR UPDATE;

    v_canonical_text := CONCAT_WS(
        '|',
        v_prev_hash,
        v_event_uuid::TEXT,
        to_char(v_timestamp AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        COALESCE(p_actor_user_id::TEXT, 'ANONYMOUS'),
        p_action,
        p_target_type,
        COALESCE(p_target_id, 'NULL'),
        p_outcome,
        p_reason_code,
        p_request_id::TEXT,
        COALESCE(p_source_ip_hash, 'NULL'),
        p_details::TEXT
    );

    v_new_hash := encode(digest(v_canonical_text, 'sha256'), 'hex');

    INSERT INTO public.audit_events (
        event_id,
        occurred_at,
        actor_user_id,
        actor_label_snapshot,
        action,
        target_type,
        target_id,
        outcome,
        reason_code,
        request_id,
        source_ip_hash,
        user_agent_summary,
        details,
        previous_hash,
        event_hash
    ) VALUES (
        v_event_uuid,
        v_timestamp,
        p_actor_user_id,
        p_actor_label_snapshot,
        p_action,
        p_target_type,
        p_target_id,
        p_outcome,
        p_reason_code,
        p_request_id,
        p_source_ip_hash,
        p_user_agent_summary,
        COALESCE(p_details, '{}'::jsonb),
        v_prev_hash,
        v_new_hash
    ) RETURNING audit_events.sequence INTO v_new_seq;

    UPDATE public.audit_chain_state
    SET head_sequence = v_new_seq,
        head_hash = v_new_hash,
        updated_at = v_timestamp
    WHERE id = 1;

    RETURN QUERY
    SELECT v_new_seq, v_event_uuid, v_timestamp, v_new_hash, v_prev_hash;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- 6. Row Level Security (RLS) Configuration
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_chain_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by authenticated users"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can view owned or granted documents"
ON public.documents FOR SELECT
TO authenticated
USING (
    status = 'active' AND (
        owner_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.document_grants dg
            WHERE dg.document_id = documents.id
              AND dg.user_id = auth.uid()
        )
    )
);

CREATE POLICY "Grants viewable by doc owner or grantee"
ON public.document_grants FOR SELECT
TO authenticated
USING (
    user_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.id = document_grants.document_id
          AND d.owner_id = auth.uid()
    )
);

CREATE POLICY "Audit events viewable only by administrators"
ON public.audit_events FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'administrator'
    )
);

-- ----------------------------------------------------------------------------
-- 7. Private Supabase Storage Bucket Setup
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'documents',
    'documents',
    false,
    10485760,
    ARRAY[
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/png',
        'image/jpeg',
        'text/plain'
    ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: Deny public access, server role only
DROP POLICY IF EXISTS "Deny public access to documents bucket" ON storage.objects;
CREATE POLICY "Deny public access to documents bucket"
ON storage.objects FOR ALL
TO public
USING (false);

-- ----------------------------------------------------------------------------
-- 8. Seed Demo Users in auth.users and profiles
-- Password for all demo accounts: TrustVault2026!
-- ----------------------------------------------------------------------------
INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at
) VALUES
    ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'admin@trustvault.local', crypt('TrustVault2026!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Alice Admin","role":"administrator"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'ownera@trustvault.local', crypt('TrustVault2026!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Oscar Owner A","role":"document_owner"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'ownerb@trustvault.local', crypt('TrustVault2026!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Bob Owner B","role":"document_owner"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'viewera@trustvault.local', crypt('TrustVault2026!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Victor Viewer A","role":"viewer"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', '55555555-5555-4555-8555-555555555555', 'authenticated', 'authenticated', 'viewerb@trustvault.local', crypt('TrustVault2026!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Vera Viewer B","role":"viewer"}', now(), now()),
    ('00000000-0000-0000-0000-000000000000', '66666666-6666-4666-8666-666666666666', 'authenticated', 'authenticated', 'inactive@trustvault.local', crypt('TrustVault2026!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Ian Inactive","role":"viewer"}', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, display_name, role, is_active)
VALUES
    ('11111111-1111-4111-8111-111111111111', 'Alice Admin', 'administrator', TRUE),
    ('22222222-2222-4222-8222-222222222222', 'Oscar Owner A', 'document_owner', TRUE),
    ('33333333-3333-4333-8333-333333333333', 'Bob Owner B', 'document_owner', TRUE),
    ('44444444-4444-4444-8444-444444444444', 'Victor Viewer A', 'viewer', TRUE),
    ('55555555-5555-4555-8555-555555555555', 'Vera Viewer B', 'viewer', TRUE),
    ('66666666-6666-4666-8666-666666666666', 'Ian Inactive', 'viewer', FALSE)
ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    is_active = EXCLUDED.is_active;

-- ----------------------------------------------------------------------------
-- 9. Seed Documents and Grants
-- ----------------------------------------------------------------------------
INSERT INTO public.documents (id, owner_id, storage_key, display_name, category, detected_content_type, size_bytes, sha256_hex, status, created_at)
VALUES
    (
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '22222222-2222-4222-8222-222222222222',
        'storage-key-doc-a-secret',
        'Financial_Report_Q3.pdf',
        'finance',
        'application/pdf',
        1024,
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        'active',
        now() - INTERVAL '2 days'
    ),
    (
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        '33333333-3333-4333-8333-333333333333',
        'storage-key-doc-b-secret',
        'Confidential_Strategy_2027.docx',
        'strategy',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        2048,
        'f2ca1bb6c7e907d06dafe4687e579fce76b37e4e93b7605022da52e6ccc26fd2',
        'active',
        now() - INTERVAL '1 day'
    )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.document_grants (document_id, user_id, permission, granted_by, created_at)
VALUES (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '44444444-4444-4444-8444-444444444444',
    'read',
    '22222222-2222-4222-8222-222222222222',
    now() - INTERVAL '1 day'
)
ON CONFLICT (document_id, user_id) DO NOTHING;
