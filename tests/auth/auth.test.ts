import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/src/app.js';
import { userRepository, issueTestToken } from '../../server/src/auth/authMiddleware.js';

describe('Authentication & Profile Status (Section 10)', () => {
  const app = createApp();

  beforeEach(() => {
    userRepository.seedDefaultUsers();
  });

  it('rejects unauthenticated requests with 401 and generic error', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Authentication required');
  });

  it('rejects invalid or forged bearer tokens with 401', async () => {
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', 'Bearer invalid.forged.jwt.token');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid or expired token');
  });

  it('authenticates valid active user successfully', async () => {
    const token = issueTestToken('44444444-4444-4444-8444-444444444444'); // viewerA
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe('44444444-4444-4444-8444-444444444444');
    expect(res.body.user.role).toBe('viewer');
    expect(res.body.user.isActive).toBe(true);
  });

  it('rejects an inactive profile on the next API request even with an already-issued valid token', async () => {
    // Generate valid token while user is active
    const userId = '44444444-4444-4444-8444-444444444444';
    const token = issueTestToken(userId);

    // Initial check passes
    const res1 = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res1.status).toBe(200);

    // Administrator deactivates the user
    userRepository.updateStatus(userId, false);

    // Next request with the SAME token MUST immediately fail
    const res2 = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res2.status).toBe(403);
    expect(res2.body.error).toBe('Account is deactivated');
  });

  it('rejects inactiveUser fixture immediately on authentication', async () => {
    // inactiveUser: 66666666-6666-4666-8666-666666666666
    const token = issueTestToken('66666666-6666-4666-8666-666666666666');
    const res = await request(app)
      .get('/api/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Account is deactivated');
  });
});
