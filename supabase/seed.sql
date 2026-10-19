-- ============================================================================
-- TrustVault Seed Data
-- Strictly following Section 10 fixtures:
-- adminA, ownerA, ownerB, viewerA, viewerB, inactiveUser, docA, docB, docDeleted
-- ============================================================================

-- Fixed Test UUIDs for deterministic testing & evaluation
-- Users:
-- adminA:      11111111-1111-4111-8111-111111111111
-- ownerA:      22222222-2222-4222-8222-222222222222
-- ownerB:      33333333-3333-4333-8333-333333333333
-- viewerA:     44444444-4444-4444-8444-444444444444
-- viewerB:     55555555-5555-4555-8555-555555555555
-- inactiveUser:66666666-6666-4666-8666-666666666666

-- Seed Profiles
INSERT INTO public.profiles (id, display_name, role, is_active, created_at)
VALUES
    ('11111111-1111-4111-8111-111111111111', 'Alice Admin (adminA)', 'administrator', TRUE, now()),
    ('22222222-2222-4222-8222-222222222222', 'Oscar Owner (ownerA)', 'document_owner', TRUE, now()),
    ('33333333-3333-4333-8333-333333333333', 'Bob Owner (ownerB)', 'document_owner', TRUE, now()),
    ('44444444-4444-4444-8444-444444444444', 'Victor Viewer (viewerA)', 'viewer', TRUE, now()),
    ('55555555-5555-4555-8555-555555555555', 'Vera Viewer (viewerB)', 'viewer', TRUE, now()),
    ('66666666-6666-4666-8666-666666666666', 'Ian Inactive (inactiveUser)', 'viewer', FALSE, now())
ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    is_active = EXCLUDED.is_active;

-- Seed Documents:
-- docA: owned by ownerA
-- docB: owned by ownerB
-- docDeleted: owned by ownerA, soft deleted
INSERT INTO public.documents (id, owner_id, storage_key, display_name, category, detected_content_type, size_bytes, sha256_hex, status, created_at, deleted_at)
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
        now() - INTERVAL '2 days',
        NULL
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
        now() - INTERVAL '1 day',
        NULL
    ),
    (
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        '22222222-2222-4222-8222-222222222222',
        'storage-key-doc-del-secret',
        'Old_Draft_Archive.pdf',
        'archive',
        'application/pdf',
        512,
        '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
        'deleted',
        now() - INTERVAL '5 days',
        now() - INTERVAL '1 hour'
    )
ON CONFLICT (id) DO NOTHING;

-- Seed Grants:
-- docA is explicitly granted to viewerA with READ permission
INSERT INTO public.document_grants (document_id, user_id, permission, granted_by, created_at)
VALUES
    (
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '44444444-4444-4444-8444-444444444444',
        'read',
        '22222222-2222-4222-8222-222222222222',
        now() - INTERVAL '1 day'
    )
ON CONFLICT (document_id, user_id) DO UPDATE SET
    permission = EXCLUDED.permission,
    granted_by = EXCLUDED.granted_by;
