import crypto from 'crypto';

export interface AuditEventPayload {
  eventId?: string;
  actorUserId?: string | null;
  actorLabelSnapshot?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  outcome: 'allowed' | 'denied' | 'success' | 'failure';
  reasonCode: string;
  requestId: string;
  sourceIp?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
}

export interface AuditEventRecord {
  sequence: number;
  eventId: string;
  occurredAt: Date;
  actorUserId: string | null;
  actorLabelSnapshot: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  outcome: 'allowed' | 'denied' | 'success' | 'failure';
  reasonCode: string;
  requestId: string;
  sourceIpHash: string | null;
  userAgentSummary: string | null;
  details: Record<string, unknown>;
  previousHash: string;
  eventHash: string;
}

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Computes canonical SHA-256 hash matching the PostgreSQL RPC implementation.
 */
export function computeCanonicalEventHash(
  previousHash: string,
  eventId: string,
  occurredAt: Date,
  actorUserId: string | null,
  action: string,
  targetType: string,
  targetId: string | null,
  outcome: string,
  reasonCode: string,
  requestId: string,
  sourceIpHash: string | null,
  details: Record<string, unknown>
): string {
  // Canonical sorted JSON representation
  const canonicalDetails = JSON.stringify(details, Object.keys(details).sort());
  const isoDate = occurredAt.toISOString();

  const canonicalPayload = [
    previousHash,
    eventId,
    isoDate,
    actorUserId ?? 'ANONYMOUS',
    action,
    targetType,
    targetId ?? 'NULL',
    outcome,
    reasonCode,
    requestId,
    sourceIpHash ?? 'NULL',
    canonicalDetails,
  ].join('|');

  return crypto.createHash('sha256').update(canonicalPayload, 'utf8').digest('hex');
}

/**
 * Hash raw IP for privacy-preserving audit logs.
 */
export function hashIp(ip?: string | null): string | null {
  if (!ip) return null;
  return crypto.createHash('sha256').update(`trustvault-salt-${ip}`).digest('hex').slice(0, 16);
}

/**
 * Serialized in-memory append-only audit repository.
 * Matches PostgreSQL serialized transaction behavior with a strict write lock.
 */
class AuditEngine {
  private events: AuditEventRecord[] = [];
  private currentSequence = 0;
  private headHash = GENESIS_HASH;
  private writeMutex: Promise<void> = Promise.resolve();

  /**
   * Appends an audit event to the cryptographic chain.
   * Atomic and serialized to avoid race conditions and forks.
   */
  public async log(payload: AuditEventPayload): Promise<AuditEventRecord> {
    // Acquire mutex lock
    let releaseLock: () => void = () => {};
    const lockAcquisition = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const previousMutex = this.writeMutex;
    this.writeMutex = this.writeMutex.then(() => lockAcquisition);

    await previousMutex;

    try {
      this.currentSequence += 1;
      const eventId = payload.eventId || crypto.randomUUID();
      const occurredAt = new Date();
      const previousHash = this.headHash;
      const sourceIpHash = hashIp(payload.sourceIp);
      const details = payload.details || {};

      const eventHash = computeCanonicalEventHash(
        previousHash,
        eventId,
        occurredAt,
        payload.actorUserId ?? null,
        payload.action,
        payload.targetType,
        payload.targetId ?? null,
        payload.outcome,
        payload.reasonCode,
        payload.requestId,
        sourceIpHash,
        details
      );

      const record: AuditEventRecord = {
        sequence: this.currentSequence,
        eventId,
        occurredAt,
        actorUserId: payload.actorUserId ?? null,
        actorLabelSnapshot: payload.actorLabelSnapshot ?? null,
        action: payload.action,
        targetType: payload.targetType,
        targetId: payload.targetId ?? null,
        outcome: payload.outcome,
        reasonCode: payload.reasonCode,
        requestId: payload.requestId,
        sourceIpHash,
        userAgentSummary: payload.userAgent ? payload.userAgent.slice(0, 100) : null,
        details,
        previousHash,
        eventHash,
      };

      // Immutable append
      this.events.push(Object.freeze({ ...record }));
      this.headHash = eventHash;

      return record;
    } finally {
      releaseLock();
    }
  }

  /**
   * Queries audit events (immutable read-only view).
   */
  public getEvents(options: {
    targetId?: string;
    action?: string;
    outcome?: string;
    limit?: number;
    offset?: number;
  } = {}): { items: AuditEventRecord[]; total: number } {
    let filtered = [...this.events];

    if (options.targetId) {
      filtered = filtered.filter((e) => e.targetId === options.targetId);
    }
    if (options.action) {
      filtered = filtered.filter((e) => e.action === options.action);
    }
    if (options.outcome) {
      filtered = filtered.filter((e) => e.outcome === options.outcome);
    }

    const total = filtered.length;
    const offset = options.offset || 0;
    const limit = options.limit || 50;

    // Return most recent first
    filtered.sort((a, b) => b.sequence - a.sequence);

    return {
      items: filtered.slice(offset, offset + limit),
      total,
    };
  }

  /**
   * Returns all events in sequential order for chain verification.
   */
  public getAllSequential(): AuditEventRecord[] {
    return [...this.events].sort((a, b) => a.sequence - b.sequence);
  }

  /**
   * For testing tampering detection: corrupts a record.
   */
  public _dangerouslyCorruptRecord(seq: number, newDetail: string): void {
    const idx = this.events.findIndex((e) => e.sequence === seq);
    if (idx !== -1) {
      const target = this.events[idx]!;
      // Mutate detail without recomputing hash to trigger verification failure
      (this.events as any)[idx] = {
        ...target,
        details: { ...target.details, tampered: newDetail },
      };
    }
  }

  /**
   * Resets engine for clean test runs.
   */
  public reset(): void {
    this.events = [];
    this.currentSequence = 0;
    this.headHash = GENESIS_HASH;
    this.writeMutex = Promise.resolve();
  }
}

export const auditEngine = new AuditEngine();
