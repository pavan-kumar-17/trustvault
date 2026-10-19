import { AuditEventRecord, GENESIS_HASH, computeCanonicalEventHash } from './auditService.js';

export interface VerificationResult {
  valid: boolean;
  checkedCount: number;
  errorAtSequence?: number;
  details?: string;
}

/**
 * Validates the cryptographic integrity of the audit chain from genesis to head.
 * Ensures:
 * 1. Monotonic sequential numbering without gaps or forks.
 * 2. Unbroken previous_hash linkage across adjacent records.
 * 3. Exact match between stored event_hash and re-computed canonical payload hash.
 */
export function verifyAuditChain(events: AuditEventRecord[]): VerificationResult {
  if (events.length === 0) {
    return { valid: true, checkedCount: 0 };
  }

  // Ensure events are sorted by sequence
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);

  let expectedPreviousHash = GENESIS_HASH;

  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i]!;
    const expectedSequence = i + 1;

    // Check sequence continuity
    if (event.sequence !== expectedSequence) {
      return {
        valid: false,
        checkedCount: i,
        errorAtSequence: event.sequence,
        details: `Sequence gap detected: expected ${expectedSequence}, found ${event.sequence}`,
      };
    }

    // Check previous_hash chain linkage
    if (event.previousHash !== expectedPreviousHash) {
      return {
        valid: false,
        checkedCount: i,
        errorAtSequence: event.sequence,
        details: `Hash chain broken at sequence ${event.sequence}: previousHash mismatch. Expected ${expectedPreviousHash}, found ${event.previousHash}`,
      };
    }

    // Recompute canonical hash
    const recomputedHash = computeCanonicalEventHash(
      event.previousHash,
      event.eventId,
      event.occurredAt,
      event.actorUserId,
      event.action,
      event.targetType,
      event.targetId,
      event.outcome,
      event.reasonCode,
      event.requestId,
      event.sourceIpHash,
      event.details
    );

    if (recomputedHash !== event.eventHash) {
      return {
        valid: false,
        checkedCount: i,
        errorAtSequence: event.sequence,
        details: `Tamper detected at sequence ${event.sequence}: event_hash ${event.eventHash} does not match canonical recomputed hash ${recomputedHash}`,
      };
    }

    expectedPreviousHash = event.eventHash;
  }

  return {
    valid: true,
    checkedCount: sorted.length,
  };
}
