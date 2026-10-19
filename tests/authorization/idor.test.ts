import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/src/app.js';
import { userRepository, issueTestToken } from '../../server/src/auth/authMiddleware.js';
import { documentRepository } from '../../server/src/documents/documentService.js';

describe('Authorization & Cross-User IDOR Isolation (Section 10)', () => {
  const app = createApp();

  const adminToken = issueTestToken('11111111-1111-4111-8111-111111111111');
  const ownerAToken = issueTestToken('22222222-2222-4222-8222-222222222222');
  const ownerBToken = issueTestToken('33333333-3333-4333-8333-333333333333');
  const viewerAToken = issueTestToken('44444444-4444-4444-8444-444444444444');
  const viewerBToken = issueTestToken('55555555-5555-4555-8555-555555555555');

  const docAId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const docBId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const docDeletedId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  beforeEach(() => {
    userRepository.seedDefaultUsers();
    documentRepository.seedDefaultDocuments();
  });

  it('viewerA can read metadata and download docA due to explicit grant', async () => {
    const metaRes = await request(app)
      .get(`/api/documents/${docAId}`)
      .set('Authorization', `Bearer ${viewerAToken}`);
    expect(metaRes.status).toBe(200);
    expect(metaRes.body.displayName).toBe('Financial_Report_Q3.pdf');
    expect(metaRes.body.userPermission).toBe('read');

    const downloadRes = await request(app)
      .get(`/api/documents/${docAId}/download`)
      .set('Authorization', `Bearer ${viewerAToken}`);
    expect(downloadRes.status).toBe(200);
    expect(downloadRes.headers['content-disposition']).toContain('Financial_Report_Q3.pdf');
    expect(downloadRes.headers['x-content-type-options']).toBe('nosniff');
  });

  it('viewerA cannot read or download docB (IDOR attempt returns 404 with no metadata leak)', async () => {
    const metaRes = await request(app)
      .get(`/api/documents/${docBId}`)
      .set('Authorization', `Bearer ${viewerAToken}`);

    expect(metaRes.status).toBe(404);
    expect(metaRes.body.error).toBe('Document not found');
    expect(metaRes.body.displayName).toBeUndefined();

    const downloadRes = await request(app)
      .get(`/api/documents/${docBId}/download`)
      .set('Authorization', `Bearer ${viewerAToken}`);
    expect(downloadRes.status).toBe(404);
  });

  it('viewerB cannot access docA or docB without explicit grant', async () => {
    const resA = await request(app)
      .get(`/api/documents/${docAId}`)
      .set('Authorization', `Bearer ${viewerBToken}`);
    expect(resA.status).toBe(404);

    const resB = await request(app)
      .get(`/api/documents/${docBId}`)
      .set('Authorization', `Bearer ${viewerBToken}`);
    expect(resB.status).toBe(404);
  });

  it('ownerA cannot edit or delete ownerBs document (docB)', async () => {
    const editRes = await request(app)
      .patch(`/api/documents/${docBId}`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ display_name: 'Hacked Title.pdf' });
    expect(editRes.status).toBe(403);

    const deleteRes = await request(app)
      .delete(`/api/documents/${docBId}`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ reason: 'Malicious deletion' });
    expect(deleteRes.status).toBe(403);
  });

  it('viewer cannot grant themselves access to any document', async () => {
    const grantRes = await request(app)
      .put(`/api/documents/${docBId}/grants/44444444-4444-4444-8444-444444444444`)
      .set('Authorization', `Bearer ${viewerAToken}`)
      .send({ permission: 'edit' });
    expect(grantRes.status).toBe(403);
  });

  it('administrator cannot download ungranted document bytes merely because of admin role', async () => {
    // Admin does NOT have an explicit grant on docB
    const res = await request(app)
      .get(`/api/documents/${docBId}/download`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Must be denied: Administrator is an operational oversight role, not a content bypass
    expect(res.status).toBe(404);
  });

  it('soft-deleted documents are inaccessible to ordinary users', async () => {
    const res = await request(app)
      .get(`/api/documents/${docDeletedId}`)
      .set('Authorization', `Bearer ${ownerAToken}`);
    expect(res.status).toBe(404);
  });

  it('scoped list/search strictly excludes inaccessible documents before pagination and count', async () => {
    const res = await request(app)
      .get('/api/documents')
      .set('Authorization', `Bearer ${viewerAToken}`);

    expect(res.status).toBe(200);
    // viewerA only has access to docA
    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].id).toBe(docAId);

    // Searching specifically for docB's exact title must return 0 results
    const searchRes = await request(app)
      .get('/api/documents?q=Confidential_Strategy')
      .set('Authorization', `Bearer ${viewerAToken}`);

    expect(searchRes.status).toBe(200);
    expect(searchRes.body.total).toBe(0);
    expect(searchRes.body.items).toHaveLength(0);
  });
});
