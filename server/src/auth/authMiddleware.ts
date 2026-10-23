import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../config/env.js';
import { AuthenticatedUser } from '../policy/documentPolicy.js';
import { auditEngine } from '../audit/auditService.js';
import { Role } from '../schemas/index.js';

// Extend Express Request to include authenticated user and request ID
declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      requestId: string;
      auditAction?: string;
    }
  }
}

export interface UserProfileRecord {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  dateOfBirth?: string;
  requestedRole?: Role;
  roleApprovalStatus?: 'approved' | 'pending' | 'none';
  isEmailVerified: boolean;
  passwordHash?: string;
  salt?: string;
  resetToken?: string;
  resetTokenExpiry?: Date;
  verificationCode?: string;
}

export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function verifyPassword(password: string, salt: string, hash: string): boolean {
  try {
    const calculated = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(calculated, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

export function calculateAge(dobString: string): number {
  const parts = dobString.split('-');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return -1;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return -1;

  const today = new Date();
  let age = today.getFullYear() - year;
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();

  if (currentMonth < month || (currentMonth === month && currentDay < day)) {
    age--;
  }
  return age;
}

const DEFAULT_DEMO_PASSWORD = 'TrustVault2026!';

/**
 * In-memory repository of profiles to support local testing, seed fixtures,
 * registration, authentication, and immediate response to activation/deactivation changes.
 */
class UserRepository {
  private profiles = new Map<string, UserProfileRecord>();

  constructor() {
    this.seedDefaultUsers();
  }

  public seedDefaultUsers(): void {
    this.profiles.clear();
    const defaultSalt = generateSalt();
    const defaultHash = hashPassword(DEFAULT_DEMO_PASSWORD, defaultSalt);

    const defaults: UserProfileRecord[] = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'admin@trustvault.local',
        displayName: 'Alice Admin',
        role: 'administrator',
        requestedRole: 'administrator',
        roleApprovalStatus: 'approved',
        isEmailVerified: true,
        isActive: true,
        salt: defaultSalt,
        passwordHash: defaultHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        email: 'ownera@trustvault.local',
        displayName: 'Oscar Owner A',
        role: 'document_owner',
        requestedRole: 'document_owner',
        roleApprovalStatus: 'approved',
        isEmailVerified: true,
        isActive: true,
        salt: defaultSalt,
        passwordHash: defaultHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        email: 'ownerb@trustvault.local',
        displayName: 'Bob Owner B',
        role: 'document_owner',
        requestedRole: 'document_owner',
        roleApprovalStatus: 'approved',
        isEmailVerified: true,
        isActive: true,
        salt: defaultSalt,
        passwordHash: defaultHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        email: 'viewera@trustvault.local',
        displayName: 'Victor Viewer A',
        role: 'viewer',
        requestedRole: 'viewer',
        roleApprovalStatus: 'approved',
        isEmailVerified: true,
        isActive: true,
        salt: defaultSalt,
        passwordHash: defaultHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        email: 'viewerb@trustvault.local',
        displayName: 'Vera Viewer B',
        role: 'viewer',
        requestedRole: 'viewer',
        roleApprovalStatus: 'approved',
        isEmailVerified: true,
        isActive: true,
        salt: defaultSalt,
        passwordHash: defaultHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '66666666-6666-4666-8666-666666666666',
        email: 'inactive@trustvault.local',
        displayName: 'Ian Inactive',
        role: 'viewer',
        requestedRole: 'viewer',
        roleApprovalStatus: 'approved',
        isEmailVerified: true,
        isActive: false, // Inactive fixture
        salt: defaultSalt,
        passwordHash: defaultHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    defaults.forEach((u) => this.profiles.set(u.id, u));
  }

  public getById(id: string): UserProfileRecord | undefined {
    return this.profiles.get(id);
  }

  public getByEmail(email: string): UserProfileRecord | undefined {
    const normalized = email.trim().toLowerCase();
    return Array.from(this.profiles.values()).find(
      (u) => u.email.toLowerCase() === normalized
    );
  }

  public getAll(): UserProfileRecord[] {
    return Array.from(this.profiles.values());
  }

  public updateStatus(id: string, isActive: boolean): UserProfileRecord | null {
    const user = this.profiles.get(id);
    if (!user) return null;
    user.isActive = isActive;
    user.updatedAt = new Date();
    return user;
  }

  public createUser(params: {
    displayName: string;
    email: string;
    password: string;
    dateOfBirth: string;
    requestedAccountType: 'viewer' | 'document_owner';
  }): UserProfileRecord {
    const normalizedEmail = params.email.trim().toLowerCase();

    // Check unique email
    if (this.getByEmail(normalizedEmail)) {
      const err = new Error('An account with this email address already exists');
      (err as any).statusCode = 409;
      throw err;
    }

    // Server-side age validation: must be at least 13
    const age = calculateAge(params.dateOfBirth);
    if (age < 13) {
      const err = new Error('TrustVault requires users to be at least 13 years old to register');
      (err as any).statusCode = 400;
      throw err;
    }

    const salt = generateSalt();
    const passwordHash = hashPassword(params.password, salt);
    const id = crypto.randomUUID();
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Zero-Trust Rule: Public users can NEVER register as administrator.
    // Document Owner requires approval, so initial active role is always 'viewer'
    const isOwnerRequest = params.requestedAccountType === 'document_owner';
    const role: Role = 'viewer';
    const requestedRole: Role = isOwnerRequest ? 'document_owner' : 'viewer';
    const roleApprovalStatus: 'approved' | 'pending' = isOwnerRequest ? 'pending' : 'approved';

    const user: UserProfileRecord = {
      id,
      email: normalizedEmail,
      displayName: params.displayName.trim(),
      role,
      requestedRole,
      roleApprovalStatus,
      dateOfBirth: params.dateOfBirth,
      isActive: true,
      isEmailVerified: false,
      verificationCode,
      passwordHash,
      salt,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.profiles.set(id, user);
    return user;
  }

  public authenticate(
    email: string,
    password: string
  ): {
    user?: UserProfileRecord;
    error?: string;
    statusCode?: number;
    unverified?: boolean;
  } {
    const normalizedEmail = email.trim().toLowerCase();
    const user = this.getByEmail(normalizedEmail);

    if (!user || !user.salt || !user.passwordHash) {
      return { error: 'Invalid email or password', statusCode: 401 };
    }

    const isValid = verifyPassword(password, user.salt, user.passwordHash);
    if (!isValid) {
      return { error: 'Invalid email or password', statusCode: 401 };
    }

    if (!user.isActive) {
      return {
        error: 'Account is deactivated. Please contact your security administrator.',
        statusCode: 403,
      };
    }

    if (!user.isEmailVerified) {
      return {
        error: 'Email address has not been verified. Please verify your email before signing in.',
        statusCode: 403,
        unverified: true,
        user,
      };
    }

    return { user };
  }

  public verifyEmail(
    email: string,
    code: string
  ): { success: boolean; user?: UserProfileRecord; error?: string } {
    const normalizedEmail = email.trim().toLowerCase();
    const user = this.getByEmail(normalizedEmail);
    if (!user) {
      return { success: false, error: 'User not found' };
    }
    if (user.isEmailVerified) {
      return { success: true, user };
    }
    if (user.verificationCode !== code.trim()) {
      return { success: false, error: 'Invalid verification code' };
    }
    user.isEmailVerified = true;
    user.verificationCode = undefined;
    user.updatedAt = new Date();
    return { success: true, user };
  }

  public resendVerification(email: string): { success: boolean; code?: string; error?: string } {
    const normalizedEmail = email.trim().toLowerCase();
    const user = this.getByEmail(normalizedEmail);
    if (!user) {
      return { success: false, error: 'User not found' };
    }
    if (user.isEmailVerified) {
      return { success: false, error: 'Email is already verified' };
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.verificationCode = code;
    user.updatedAt = new Date();
    return { success: true, code };
  }

  public requestPasswordReset(email: string): { success: boolean; token?: string } {
    const normalizedEmail = email.trim().toLowerCase();
    const user = this.getByEmail(normalizedEmail);
    if (!user) {
      // Avoid revealing user existence
      return { success: true };
    }
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetToken = resetToken;
    user.resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour
    user.updatedAt = new Date();
    return { success: true, token: resetToken };
  }

  public resetPassword(token: string, newPassword: string): { success: boolean; error?: string } {
    const user = Array.from(this.profiles.values()).find(
      (u) => u.resetToken === token && u.resetTokenExpiry && u.resetTokenExpiry > new Date()
    );
    if (!user) {
      return { success: false, error: 'Invalid or expired password reset token' };
    }
    const salt = generateSalt();
    user.salt = salt;
    user.passwordHash = hashPassword(newPassword, salt);
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    user.updatedAt = new Date();
    return { success: true };
  }
}

export const userRepository = new UserRepository();

/**
 * Issues JWT for a given user profile.
 */
export function issueToken(user: UserProfileRecord): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
    },
    env.JWT_SECRET,
    { expiresIn: '8h' }
  );
}

/**
 * Issues JWT for a given user fixture (used for demo and tests).
 */
export function issueTestToken(userId: string): string {
  const user = userRepository.getById(userId);
  if (!user) throw new Error(`Cannot issue token: user ${userId} not found`);
  return issueToken(user);
}


/**
 * Middleware: assigns a unique correlation request ID to each request.
 */
export function assignRequestId(req: Request, _res: Response, next: NextFunction): void {
  req.requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  next();
}

/**
 * Strict authentication middleware:
 * 1. Checks Bearer token.
 * 2. Cryptographically verifies JWT.
 * 3. Freshly loads profile row from database on every request.
 * 4. Fails immediately if account has been deactivated (even with a valid unexpired token).
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    await auditEngine.log({
      actorUserId: null,
      action: 'AUTH_REQUIRED',
      targetType: 'API',
      outcome: 'denied',
      reasonCode: 'MISSING_TOKEN',
      requestId: req.requestId,
      sourceIp: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { sub: string };
    const currentProfile = userRepository.getById(decoded.sub);

    if (!currentProfile) {
      await auditEngine.log({
        actorUserId: decoded.sub,
        action: 'AUTH_REQUIRED',
        targetType: 'API',
        outcome: 'denied',
        reasonCode: 'USER_PROFILE_NOT_FOUND',
        requestId: req.requestId,
        sourceIp: req.ip,
      });
      res.status(401).json({ error: 'User profile not found' });
      return;
    }

    // Check account status in real-time (no cached status!)
    if (!currentProfile.isActive) {
      await auditEngine.log({
        actorUserId: currentProfile.id,
        actorLabelSnapshot: currentProfile.displayName,
        action: 'ACCESS_ATTEMPT',
        targetType: 'API',
        outcome: 'denied',
        reasonCode: 'ACCOUNT_DEACTIVATED',
        requestId: req.requestId,
        sourceIp: req.ip,
      });
      res.status(403).json({ error: 'Account is deactivated' });
      return;
    }

    req.user = {
      id: currentProfile.id,
      email: currentProfile.email,
      displayName: currentProfile.displayName,
      role: currentProfile.role,
      isActive: currentProfile.isActive,
    };

    next();
  } catch (err: any) {
    await auditEngine.log({
      actorUserId: null,
      action: 'AUTH_REQUIRED',
      targetType: 'API',
      outcome: 'denied',
      reasonCode: `INVALID_TOKEN: ${err.message}`,
      requestId: req.requestId,
      sourceIp: req.ip,
    });
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
