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
}

/**
 * In-memory repository of profiles to support local testing, seed fixtures,
 * and immediate response to activation/deactivation changes.
 */
class UserRepository {
  private profiles = new Map<string, UserProfileRecord>();

  constructor() {
    this.seedDefaultUsers();
  }

  public seedDefaultUsers(): void {
    this.profiles.clear();
    const defaults: UserProfileRecord[] = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'admin@trustvault.local',
        displayName: 'Alice Admin',
        role: 'administrator',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        email: 'ownera@trustvault.local',
        displayName: 'Oscar Owner A',
        role: 'document_owner',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        email: 'ownerb@trustvault.local',
        displayName: 'Bob Owner B',
        role: 'document_owner',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        email: 'viewera@trustvault.local',
        displayName: 'Victor Viewer A',
        role: 'viewer',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        email: 'viewerb@trustvault.local',
        displayName: 'Vera Viewer B',
        role: 'viewer',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '66666666-6666-4666-8666-666666666666',
        email: 'inactive@trustvault.local',
        displayName: 'Ian Inactive',
        role: 'viewer',
        isActive: false, // Inactive fixture
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    defaults.forEach((u) => this.profiles.set(u.id, u));
  }

  public getById(id: string): UserProfileRecord | undefined {
    return this.profiles.get(id);
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
}

export const userRepository = new UserRepository();

/**
 * Issues JWT for a given user fixture (used for demo and tests).
 */
export function issueTestToken(userId: string): string {
  const user = userRepository.getById(userId);
  if (!user) throw new Error(`Cannot issue token: user ${userId} not found`);

  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
    },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );
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
