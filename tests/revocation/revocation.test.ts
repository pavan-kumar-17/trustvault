import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/src/app.js';
import { userRepository, issueTestToken } from '../../server/src/auth/authMiddleware.js';
import { documentRepository } from '../../server/src/documents/documentService.js';

describe('Immediate Revocation (Section 10)', () => {
  const app = createApp();

  const ownerAToken = issueTestToken('22222222-2222-4222-8222-222222222222');
  const viewerAToken = issueTestToken('44444444-4444-4444-8444-444444444444');
  const viewerAId = '44444444-4444-4444-8444-444444444444';
  const docAId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  beforeEach(() => {
    userRepository.seedDefaultUsers();
    documentRepository.seedDefaultDocuments();
  });

  it('revoking access immediately denies next request reusing the exact same token', async () => {
    // 1. Initial state: viewerA has read grant on docA
    const preDownload = await request(app)
      .get(`/api/documents/${docAId}/download`)
      .set('Authorization', `Bearer ${viewerAToken}`);
    expect(preDownload.status).toBe(200);

    // 2. Owner revokes grant via API
    const revokeRes = await request(app)
      .delete(`/api/documents/${docAId}/grants/${viewerAId}`)
      .set('Authorization', `Bearer ${ownerAToken}`);
    expect(revokeRes.status).toBe(204);

    // 3. Immediately repeat download using the SAME token -> MUST FAIL on next request
    const postDownload = await request(app)
      .get(`/api/documents/${docAId}/download`)
      .set('Authorization', `Bearer ${viewerAToken}`);
    expect(postDownload.status).toBe(404);

    // 4. Repeat metadata read using the SAME token -> MUST FAIL
    const postMeta = await request(app)
      .get(`/api/documents/${docAId}`)
      .set('Authorization', `Bearer ${viewerAToken}`);
    expect(postMeta.status).toBe(404);
  });

  it('downgrading grant from edit to read immediately blocks metadata edit', async () => {
    // 1. Grant EDIT permission to viewerA
    const grantRes = await request(app)
      .put(`/api/documents/${docAId}/grants/${viewerAId}`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ permission: 'edit' });
    expect(grantRes.status).toBe(200);

    // 2. Edit metadata succeeds
    const edit1 = await request(app)
      .patch(`/api/documents/${docAId}`)
      .set('Authorization', `Bearer ${viewerAToken}`)
      .send({ display_name: 'Updated by Editor.pdf' });
    expect(edit1.status).toBe(200);

    // 3. Downgrade grant to READ only
    const downgradeRes = await request(app)
      .put(`/api/documents/${docAId}/grants/${viewerAId}`)
      .set('Authorization', `Bearer ${ownerAToken}`)
      .send({ permission: 'read' });
    expect(downgradeRes.status).toBe(200);

    // 4. Reusing SAME token, attempt another edit -> MUST FAIL IMMEDIATELY
    const edit2 = await request(app)
      .patch(`/api/documents/${docAId}`)
      .set('Authorization', `Bearer ${viewerAToken}`)
      .send({ display_name: 'Attempted Second Update.pdf' });
    expect(edit2.status).toBe(403);
  });
});
