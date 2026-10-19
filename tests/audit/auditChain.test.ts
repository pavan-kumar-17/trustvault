import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server/src/app.js';
import { auditEngine } from '../../server/src/audit/auditService.js';
import { verifyAuditChain } from '../../server/src/audit/verifyChain.js';
import { issueTestToken, userRepository } from '../../server/src/auth/authMiddleware.js';
import { documentRepository } from '../../server/src/documents/documentService.js';

describe('Audit Chain Integrity & Tamper Detection (Section 10)', () => {
  const app = createApp();

  beforeEach(() => {
    auditEngine.reset();
    userRepository.seedDefaultUsers();
    documentRepository.seedDefaultDocuments();
  });

  it('records audit events for denied access attempts with internal reason and request ID', async () => {
    const viewerAToken = issueTestToken('44444444-4444-4444-8444-444444444444');
    const docBId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

    // Denied read attempt
    await request(app)
      .get(`/api/documents/${docBId}`)
      .set('Authorization', `Bearer ${viewerAToken}`)
      .set('X-Request-Id', '77777777-7777-4777-8777-777777777777');

    const { items } = auditEngine.getEvents({ targetId: docBId });
    expect(items.length).toBeGreaterThanOrEqual(1);

    const event = items[0]!;
    expect(event.targetId).toBe(docBId);
    expect(event.outcome).toBe('denied');
    expect(event.reasonCode).toBe('missing_grant');
    expect(event.requestId).toBe('77777777-7777-4777-8777-777777777777');
    expect(event.eventHash).toHaveLength(64);
  });

  it('validates a clean, untampered audit chain successfully', async () => {
    // Append multiple events
    await auditEngine.log({
      action: 'LOGIN',
      targetType: 'SESSION',
      outcome: 'success',
      reasonCode: 'SUCCESSFUL_LOGIN',
      requestId: 'req-1',
    });

    await auditEngine.log({
      action: 'UPLOAD',
      targetType: 'DOCUMENT',
      targetId: 'doc-1',
      outcome: 'success',
      reasonCode: 'DOCUMENT_UPLOADED',
      requestId: 'req-2',
    });

    await auditEngine.log({
      action: 'GRANT',
      targetType: 'DOCUMENT',
      targetId: 'doc-1',
      outcome: 'success',
      reasonCode: 'GRANT_APPLIED',
      requestId: 'req-3',
    });

    const events = auditEngine.getAllSequential();
    expect(events.length).toBe(3);

    const verification = verifyAuditChain(events);
    expect(verification.valid).toBe(true);
    expect(verification.checkedCount).toBe(3);
    expect(verification.errorAtSequence).toBeUndefined();
  });

  it('detects tampering when an audit record payload is modified', async () => {
    // Append 4 events
    for (let i = 1; i <= 4; i++) {
      await auditEngine.log({
        action: `ACTION_${i}`,
        targetType: 'DOCUMENT',
        targetId: `doc-${i}`,
        outcome: 'success',
        reasonCode: 'OK',
        requestId: `req-${i}`,
        details: { step: i },
      });
    }

    // Tamper with record at sequence 2
    auditEngine._dangerouslyCorruptRecord(2, 'tampered_malicious_edit');

    const events = auditEngine.getAllSequential();
    const verification = verifyAuditChain(events);

    expect(verification.valid).toBe(false);
    expect(verification.errorAtSequence).toBe(2);
    expect(verification.details).toContain('Tamper detected at sequence 2');
  });

  it('handles concurrent audit appends without race conditions, duplicates, or chain forks', async () => {
    // Dispatch 20 concurrent appends
    const promises = Array.from({ length: 20 }, (_, i) =>
      auditEngine.log({
        action: `CONCURRENT_ACTION_${i}`,
        targetType: 'SYSTEM',
        outcome: 'allowed',
        reasonCode: 'CONCURRENCY_TEST',
        requestId: `req-concurrent-${i}`,
        details: { index: i },
      })
    );

    await Promise.all(promises);

    const events = auditEngine.getAllSequential();
    expect(events.length).toBe(20);

    // Verify all sequence numbers are 1..20 monotonic
    for (let i = 0; i < events.length; i++) {
      expect(events[i]!.sequence).toBe(i + 1);
    }

    // Verify cryptographic chain has no forks
    const verification = verifyAuditChain(events);
    expect(verification.valid).toBe(true);
    expect(verification.checkedCount).toBe(20);
  });
});
