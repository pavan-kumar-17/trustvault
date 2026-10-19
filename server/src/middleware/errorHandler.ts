import { Request, Response, NextFunction } from 'express';
import { auditEngine } from '../audit/auditService.js';

/**
 * Central Express error handler.
 * Guarantees that internal errors NEVER leak stack traces, database secrets,
 * or filesystem paths to the client (Section 5 & 9).
 */
export async function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  const requestId = req.requestId || 'unknown-req';
  console.error(`[Unhandled Error][${requestId}]:`, err);

  try {
    await auditEngine.log({
      actorUserId: req.user?.id ?? null,
      actorLabelSnapshot: req.user?.displayName,
      action: 'SYSTEM_ERROR',
      targetType: 'API',
      outcome: 'failure',
      reasonCode: err.name || 'INTERNAL_ERROR',
      requestId,
      sourceIp: req.ip,
      details: {
        message: err.message,
        path: req.originalUrl,
        method: req.method,
      },
    });
  } catch (auditErr) {
    console.error('Failed to log system error to audit engine:', auditErr);
  }

  res.status(err.status || 500).json({
    error: 'An internal error occurred. Please refer to request ID for support.',
    requestId,
  });
}
