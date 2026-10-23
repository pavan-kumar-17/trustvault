import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/src/app.js';
import { userRepository } from '../../server/src/auth/authMiddleware.js';

describe('Auth Routes & Zero-Trust Registration Policy', () => {
  const app = createApp();

  beforeEach(() => {
    userRepository.seedDefaultUsers();
  });

  describe('POST /api/auth/login', () => {
    it('authenticates valid demo administrator credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@trustvault.local',
          password: 'TrustVault2026!',
        });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe('admin@trustvault.local');
      expect(res.body.user.role).toBe('administrator');
      expect(res.body.user.isActive).toBe(true);
    });

    it('rejects invalid password with 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@trustvault.local',
          password: 'WrongPassword999!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });

    it('rejects nonexistent user email with 401', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'ghost@trustvault.local',
          password: 'TrustVault2026!',
        });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });

    it('rejects inactive user with 403', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'inactive@trustvault.local',
          password: 'TrustVault2026!',
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Account is deactivated');
    });
  });

  describe('POST /api/auth/register', () => {
    it('successfully registers standard Viewer account with Viewer role', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'John Doe',
          email: 'john.doe@trustvault.internal',
          dateOfBirth: '1995-05-15',
          password: 'Password123',
          confirmPassword: 'Password123',
          requestedAccountType: 'viewer',
          agreeTerms: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.user.role).toBe('viewer');
      expect(res.body.user.requestedRole).toBe('viewer');
      expect(res.body.user.roleApprovalStatus).toBe('approved');
      expect(res.body.requiresEmailVerification).toBe(true);
      expect(res.body.verificationCode).toBeDefined();
    });

    it('provisions Document Owner request as Viewer privileges with pending approval', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Jane Smith',
          email: 'jane.smith@trustvault.internal',
          dateOfBirth: '1992-08-20',
          password: 'SecretPass123',
          confirmPassword: 'SecretPass123',
          requestedAccountType: 'document_owner',
          agreeTerms: true,
        });

      expect(res.status).toBe(201);
      // Zero-Trust security requirement: Active role MUST be viewer, not document_owner!
      expect(res.body.user.role).toBe('viewer');
      expect(res.body.user.requestedRole).toBe('document_owner');
      expect(res.body.user.roleApprovalStatus).toBe('pending');
    });

    it('rejects registration when age is under 13', async () => {
      const currentYear = new Date().getFullYear();
      const underAgeDob = `${currentYear - 10}-01-01`; // 10 years old

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Child User',
          email: 'child@trustvault.internal',
          dateOfBirth: underAgeDob,
          password: 'Password123',
          confirmPassword: 'Password123',
          requestedAccountType: 'viewer',
          agreeTerms: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('13 years old');
    });

    it('rejects passwords shorter than 8 characters', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Short Pass',
          email: 'short@trustvault.internal',
          dateOfBirth: '1990-01-01',
          password: 'Pass1',
          confirmPassword: 'Pass1',
          requestedAccountType: 'viewer',
          agreeTerms: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('at least 8 characters');
    });

    it('rejects passwords without numbers', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'No Numbers',
          email: 'nonum@trustvault.internal',
          dateOfBirth: '1990-01-01',
          password: 'PasswordLettersOnly',
          confirmPassword: 'PasswordLettersOnly',
          requestedAccountType: 'viewer',
          agreeTerms: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('letters and numbers');
    });

    it('rejects password mismatch', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Mismatch Pass',
          email: 'mismatch@trustvault.internal',
          dateOfBirth: '1990-01-01',
          password: 'Password123',
          confirmPassword: 'DifferentPassword123',
          requestedAccountType: 'viewer',
          agreeTerms: true,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Passwords must match');
    });

    it('rejects registration without terms agreement', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'No Terms',
          email: 'noterms@trustvault.internal',
          dateOfBirth: '1990-01-01',
          password: 'Password123',
          confirmPassword: 'Password123',
          requestedAccountType: 'viewer',
          agreeTerms: false,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Terms & Conditions');
    });

    it('rejects duplicate email with 409 Conflict', async () => {
      const payload = {
        fullName: 'Original User',
        email: 'duplicate.test@trustvault.internal',
        dateOfBirth: '1990-01-01',
        password: 'Password123',
        confirmPassword: 'Password123',
        requestedAccountType: 'viewer' as const,
        agreeTerms: true,
      };

      const res1 = await request(app).post('/api/auth/register').send(payload);
      expect(res1.status).toBe(201);

      const res2 = await request(app).post('/api/auth/register').send(payload);
      expect(res2.status).toBe(409);
      expect(res2.body.error).toContain('already exists');
    });

    it('strictly forbids public registration as administrator', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Hacker Admin',
          email: 'hacker@trustvault.internal',
          dateOfBirth: '1990-01-01',
          password: 'Password123',
          confirmPassword: 'Password123',
          requestedAccountType: 'administrator',
          agreeTerms: true,
        });

      expect(res.status).toBe(400);
    });
  });

  describe('Email Verification & Password Reset Flows', () => {
    it('verifies email with code and permits login', async () => {
      // 1. Register new user
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          fullName: 'Verify Test',
          email: 'verify.test@trustvault.internal',
          dateOfBirth: '1994-03-12',
          password: 'Password123',
          confirmPassword: 'Password123',
          requestedAccountType: 'viewer',
          agreeTerms: true,
        });

      expect(regRes.status).toBe(201);
      const code = regRes.body.verificationCode;

      // 2. Attempt login prior to verification -> 403 unverified
      const loginAttempt = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'verify.test@trustvault.internal',
          password: 'Password123',
        });
      expect(loginAttempt.status).toBe(403);
      expect(loginAttempt.body.unverified).toBe(true);

      // 3. Verify with incorrect code -> 400
      const badVerify = await request(app)
        .post('/api/auth/verify-email')
        .send({
          email: 'verify.test@trustvault.internal',
          code: '000000',
        });
      expect(badVerify.status).toBe(400);

      // 4. Verify with correct code -> 200 with JWT
      const goodVerify = await request(app)
        .post('/api/auth/verify-email')
        .send({
          email: 'verify.test@trustvault.internal',
          code,
        });
      expect(goodVerify.status).toBe(200);
      expect(goodVerify.body.token).toBeDefined();

      // 5. Subsequent login succeeds
      const successfulLogin = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'verify.test@trustvault.internal',
          password: 'Password123',
        });
      expect(successfulLogin.status).toBe(200);
      expect(successfulLogin.body.token).toBeDefined();
    });

    it('supports forgot password request and reset', async () => {
      // 1. Request reset
      const forgotRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'admin@trustvault.local' });

      expect(forgotRes.status).toBe(200);
      const resetToken = forgotRes.body.resetToken;
      expect(resetToken).toBeDefined();

      // 2. Reset password with token
      const resetRes = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'BrandNewPassword2026!',
        });

      expect(resetRes.status).toBe(200);

      // 3. Login with new password
      const newLogin = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'admin@trustvault.local',
          password: 'BrandNewPassword2026!',
        });

      expect(newLogin.status).toBe(200);
      expect(newLogin.body.user.email).toBe('admin@trustvault.local');
    });
  });
});
