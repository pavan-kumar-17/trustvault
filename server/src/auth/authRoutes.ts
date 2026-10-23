import { Router, Request, Response } from 'express';
import {
  userRepository,
  issueToken,
  issueTestToken,
} from './authMiddleware.js';
import { auditEngine } from '../audit/auditService.js';
import {
  LoginSchema,
  RegisterSchema,
  VerifyEmailSchema,
  ResendVerificationSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
} from '../schemas/index.js';

export const authRouter = Router();

// ============================================================================
// POST /api/auth/login and POST /api/auth/signin - Authenticate with email & password
// ============================================================================
const handleLogin = async (req: Request, res: Response): Promise<void> => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Invalid login details',
      details: parsed.error.format(),
    });
    return;
  }

  const { email, password } = parsed.data;
  const result = userRepository.authenticate(email, password);

  if (result.error || !result.user) {
    await auditEngine.log({
      actorUserId: result.user?.id ?? null,
      actorLabelSnapshot: result.user?.displayName,
      action: 'USER_LOGIN',
      targetType: 'SYSTEM',
      outcome: 'denied',
      reasonCode: result.unverified
        ? 'EMAIL_UNVERIFIED'
        : result.statusCode === 403
        ? 'ACCOUNT_DEACTIVATED'
        : 'INVALID_CREDENTIALS',
      requestId: req.requestId,
      sourceIp: req.ip,
      userAgent: req.headers['user-agent'],
      details: { emailAttempted: email },
    });

    if (result.unverified) {
      res.status(403).json({
        error: result.error,
        unverified: true,
        email: result.user?.email || email,
      });
      return;
    }

    res.status(result.statusCode || 401).json({ error: result.error });
    return;
  }

  const user = result.user;
  const token = issueToken(user);

  await auditEngine.log({
    actorUserId: user.id,
    actorLabelSnapshot: user.displayName,
    action: 'USER_LOGIN',
    targetType: 'SYSTEM',
    outcome: 'success',
    reasonCode: 'AUTHENTICATION_SUCCESS',
    requestId: req.requestId,
    sourceIp: req.ip,
    userAgent: req.headers['user-agent'],
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      requestedRole: user.requestedRole,
      roleApprovalStatus: user.roleApprovalStatus,
      isActive: user.isActive,
    },
  });
};

authRouter.post('/login', handleLogin);
authRouter.post('/signin', handleLogin);

// ============================================================================
// POST /api/auth/register - Create corporate account with Zero-Trust constraints
// ============================================================================
authRouter.post('/register', async (req: Request, res: Response) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    const errorMessages = Object.values(parsed.error.flatten().fieldErrors)
      .flat()
      .join(', ');
    res.status(400).json({
      error: errorMessages || 'Invalid registration form submission',
      details: parsed.error.format(),
    });
    return;
  }

  const { fullName, email, dateOfBirth, password, requestedAccountType } =
    parsed.data;

  try {
    const user = userRepository.createUser({
      displayName: fullName,
      email,
      dateOfBirth,
      password,
      requestedAccountType,
    });

    await auditEngine.log({
      actorUserId: user.id,
      actorLabelSnapshot: user.displayName,
      action: 'USER_REGISTRATION',
      targetType: 'USER',
      targetId: user.id,
      outcome: 'success',
      reasonCode:
        user.requestedRole === 'document_owner'
          ? 'REGISTERED_VIEWER_OWNER_APPROVAL_PENDING'
          : 'REGISTERED_VIEWER_STANDARD',
      requestId: req.requestId,
      sourceIp: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        requestedRole: user.requestedRole,
        effectiveRole: user.role,
        approvalStatus: user.roleApprovalStatus,
      },
    });

    res.status(201).json({
      success: true,
      message:
        'Corporate account created successfully. Please verify your email before accessing confidential documents.',
      requiresEmailVerification: true,
      email: user.email,
      verificationCode: user.verificationCode,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        requestedRole: user.requestedRole,
        roleApprovalStatus: user.roleApprovalStatus,
        isActive: user.isActive,
      },
    });
  } catch (err: any) {
    const statusCode = err.statusCode || 400;

    await auditEngine.log({
      actorUserId: null,
      action: 'USER_REGISTRATION',
      targetType: 'USER',
      outcome: 'denied',
      reasonCode: statusCode === 409 ? 'DUPLICATE_EMAIL' : 'REGISTRATION_REJECTED',
      requestId: req.requestId,
      sourceIp: req.ip,
      userAgent: req.headers['user-agent'],
      details: { emailAttempted: email, error: err.message },
    });

    res.status(statusCode).json({ error: err.message });
  }
});

// ============================================================================
// POST /api/auth/verify-email - Verify email with verification code
// ============================================================================
authRouter.post('/verify-email', async (req: Request, res: Response) => {
  const parsed = VerifyEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'Please provide a valid email and 6-digit verification code',
      details: parsed.error.format(),
    });
    return;
  }

  const { email, code } = parsed.data;
  const result = userRepository.verifyEmail(email, code);

  if (!result.success || !result.user) {
    await auditEngine.log({
      actorUserId: null,
      action: 'EMAIL_VERIFICATION',
      targetType: 'USER',
      outcome: 'denied',
      reasonCode: 'INVALID_VERIFICATION_CODE',
      requestId: req.requestId,
      sourceIp: req.ip,
      details: { email },
    });

    res.status(400).json({ error: result.error || 'Invalid verification code' });
    return;
  }

  const token = issueToken(result.user);

  await auditEngine.log({
    actorUserId: result.user.id,
    actorLabelSnapshot: result.user.displayName,
    action: 'EMAIL_VERIFICATION',
    targetType: 'USER',
    targetId: result.user.id,
    outcome: 'success',
    reasonCode: 'EMAIL_VERIFIED',
    requestId: req.requestId,
    sourceIp: req.ip,
  });

  res.json({
    success: true,
    message: 'Work email address verified successfully.',
    token,
    user: {
      id: result.user.id,
      email: result.user.email,
      displayName: result.user.displayName,
      role: result.user.role,
      requestedRole: result.user.requestedRole,
      roleApprovalStatus: result.user.roleApprovalStatus,
      isActive: result.user.isActive,
    },
  });
});

// ============================================================================
// POST /api/auth/resend-verification - Resend verification code
// ============================================================================
authRouter.post('/resend-verification', async (req: Request, res: Response) => {
  const parsed = ResendVerificationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid email address is required' });
    return;
  }

  const { email } = parsed.data;
  const result = userRepository.resendVerification(email);

  if (!result.success) {
    res.status(400).json({ error: result.error });
    return;
  }

  await auditEngine.log({
    actorUserId: null,
    action: 'EMAIL_VERIFICATION_RESEND',
    targetType: 'USER',
    outcome: 'success',
    reasonCode: 'CODE_RESENT',
    requestId: req.requestId,
    sourceIp: req.ip,
    details: { email },
  });

  res.json({
    success: true,
    message: 'A fresh 6-digit verification code has been dispatched to your email.',
    code: result.code,
  });
});

// ============================================================================
// POST /api/auth/forgot-password - Request password reset link/token
// ============================================================================
authRouter.post('/forgot-password', async (req: Request, res: Response) => {
  const parsed = ForgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Valid email address is required' });
    return;
  }

  const { email } = parsed.data;
  const result = userRepository.requestPasswordReset(email);

  await auditEngine.log({
    actorUserId: null,
    action: 'PASSWORD_RESET_REQUEST',
    targetType: 'USER',
    outcome: 'success',
    reasonCode: 'RESET_TOKEN_GENERATED',
    requestId: req.requestId,
    sourceIp: req.ip,
    details: { email },
  });

  res.json({
    success: true,
    message:
      'If an account exists with this email address, password reset instructions have been issued.',
    resetToken: result.token,
  });
});

// ============================================================================
// POST /api/auth/reset-password - Reset password using verified token
// ============================================================================
authRouter.post('/reset-password', async (req: Request, res: Response) => {
  const parsed = ResetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    const errorMessages = Object.values(parsed.error.flatten().fieldErrors)
      .flat()
      .join(', ');
    res.status(400).json({ error: errorMessages || 'Invalid password reset input' });
    return;
  }

  const { token, newPassword } = parsed.data;
  const result = userRepository.resetPassword(token, newPassword);

  if (!result.success) {
    await auditEngine.log({
      actorUserId: null,
      action: 'PASSWORD_RESET_SUBMIT',
      targetType: 'USER',
      outcome: 'denied',
      reasonCode: 'INVALID_RESET_TOKEN',
      requestId: req.requestId,
      sourceIp: req.ip,
    });
    res.status(400).json({ error: result.error });
    return;
  }

  await auditEngine.log({
    actorUserId: null,
    action: 'PASSWORD_RESET_SUBMIT',
    targetType: 'USER',
    outcome: 'success',
    reasonCode: 'PASSWORD_RESET_COMPLETE',
    requestId: req.requestId,
    sourceIp: req.ip,
  });

  res.json({
    success: true,
    message: 'Your password has been successfully reset. You may now sign in.',
  });
});

// ============================================================================
// POST /api/auth/demo-login - Developer & Evaluator Demo Login Helper
// ============================================================================
authRouter.post('/demo-login', (req: Request, res: Response) => {
  const { userId } = req.body;
  if (!userId) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  const user = userRepository.getById(userId);
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const token = issueTestToken(user.id);
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      isActive: user.isActive,
    },
  });
});

// ============================================================================
// GET /api/auth/fixtures - List available demo personas
// ============================================================================
authRouter.get('/fixtures', (_req: Request, res: Response) => {
  const users = userRepository.getAll().map((u) => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    isActive: u.isActive,
  }));
  res.json({ fixtures: users });
});
