-- ============================================================================
-- TrustVault Initial Schema Migration (v2.0 MVP)
-- Strictly adhering to Section 7 of TrustVault MVP.md
-- ============================================================================

-- Ensure pgcrypto is enabled for SHA-256 and UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Profiles Table (tied to auth.users)
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

-- ----------------------------------------------------------------------------
-- 2. Documents Table
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
-- 3. Document Grants Table (Per-document named user access)
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
-- 4. Audit Chain State & Audit Events Table (Tamper-evident append-only)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_chain_state (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    head_sequence BIGINT NOT NULL DEFAULT 0,
    head_hash CHAR(64) NOT NULL DEFAULT '0000000000000000000000000000000000000000000000000000000000000000',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Initialize the chain state singleton row
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
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON public.audit_events(action);

-- ----------------------------------------------------------------------------
-- 5. Append-only Trigger on audit_events
--    Prevents UPDATE and DELETE operations at the database engine level.
-- ----------------------------------------------------------------------------
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

-- ----------------------------------------------------------------------------
-- 6. Canonical Hash Computation & Serialized Append Function
-- ----------------------------------------------------------------------------
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
    -- Acquire exclusive transaction lock on chain head to prevent forks/races
    SELECT head_hash INTO v_prev_hash
    FROM public.audit_chain_state
    WHERE id = 1
    FOR UPDATE;

    -- Canonical representation: pipe-delimited fields with jsonb canonical string
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

    -- Insert into immutable audit table
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

    -- Update chain head
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
-- 7. Row Level Security (RLS) Configuration
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_chain_state ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can view all active profiles (for sharing dropdown), only update own display name
CREATE POLICY "Profiles are viewable by authenticated users"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

-- Documents: Visible if owner OR if granted via document_grants
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

CREATE POLICY "Owners can insert documents"
ON public.documents FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners and editors can update document metadata"
ON public.documents FOR UPDATE
TO authenticated
USING (
    status = 'active' AND (
        owner_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.document_grants dg
            WHERE dg.document_id = documents.id
              AND dg.user_id = auth.uid()
              AND dg.permission = 'edit'
        )
    )
);

-- Document Grants: Visible to document owner or grant recipient
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

-- Audit Events: Only administrators can view global audit events via direct query
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
