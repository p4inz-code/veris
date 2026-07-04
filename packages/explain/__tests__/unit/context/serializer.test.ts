/**
 * Tests for M3 — Context serializer.
 *
 * Tests:
 * - Deterministic serialization (same input → same output)
 * - SHA-256 hashing
 * - Deep freeze immutability
 * - Context schema version
 *
 * @module @veris/explain/__tests__/unit/context/serializer.test
 */

import { describe, it, expect } from 'vitest';
import {
  serializeContext,
  hashContext,
  deepFreeze,
  getContextSchemaVersion,
} from '../../../src/context/serializer.js';
import type { ExplainedContext } from '../../../src/types/context.js';
import type { ExplainedFinding } from '../../../src/types/context.js';

describe('serializeContext', () => {
  const sampleContext: ExplainedContext = {
    subject: {
      id: 'fin_test',
      title: 'Test Finding',
      severity: { level: 'critical', score: 9.5 },
      confidence: 0.95,
      ruleId: 'test/rule',
      description: 'A test finding',
    },
    evidence: [],
    tokenBudget: { allocated: 4000, used: 1000, remaining: 3000 },
    contextSchemaVersion: '1.0.0',
  };

  it('produces deterministic output for same input', () => {
    const json1 = serializeContext(sampleContext);
    const json2 = serializeContext(sampleContext);
    expect(json1).toBe(json2);
  });

  it('produces valid JSON', () => {
    const json = serializeContext(sampleContext);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('produces different output for different inputs', () => {
    const ctx1 = { ...sampleContext, contextSchemaVersion: '1.0.0' };
    const ctx2 = {
      ...sampleContext,
      contextSchemaVersion: '2.0.0',
    };

    const json1 = serializeContext(ctx1);
    const json2 = serializeContext(ctx2 as ExplainedContext);
    expect(json1).not.toBe(json2);
  });
});

describe('hashContext', () => {
  const sampleContext: ExplainedContext = {
    subject: {
      id: 'fin_test',
      title: 'Test Finding',
      severity: { level: 'high', score: 7.0 },
      confidence: 0.8,
      ruleId: 'test/rule',
      description: 'test',
    },
    evidence: [],
    tokenBudget: { allocated: 4000, used: 1000, remaining: 3000 },
    contextSchemaVersion: '1.0.0',
  };

  it('produces deterministic hashes for same input', () => {
    const hash1 = hashContext(sampleContext);
    const hash2 = hashContext(sampleContext);
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different inputs', () => {
    const ctx1 = { ...sampleContext, contextSchemaVersion: '1.0.0' };
    const ctx2 = {
      ...sampleContext,
      contextSchemaVersion: '2.0.0',
    };

    const hash1 = hashContext(ctx1);
    const hash2 = hashContext(ctx2 as ExplainedContext);
    expect(hash1).not.toBe(hash2);
  });

  it('returns a 64-character hex string', () => {
    const hash = hashContext(sampleContext);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('deepFreeze', () => {
  it('freezes the top-level object', () => {
    const obj = { a: 1, b: 'hello' };
    const frozen = deepFreeze(obj);
    expect(Object.isFrozen(frozen)).toBe(true);
  });

  it('freezes nested objects', () => {
    const obj = { nested: { value: 42 } };
    const frozen = deepFreeze(obj);
    expect(Object.isFrozen(frozen.nested as Record<string, unknown>)).toBe(true);
  });

  it('freezes arrays', () => {
    const obj = { items: [1, 2, 3] };
    const frozen = deepFreeze(obj);
    expect(Object.isFrozen(frozen.items as unknown[])).toBe(true);
  });

  it('freezes array elements (objects)', () => {
    const obj = { items: [{ id: 1 }, { id: 2 }] };
    const frozen = deepFreeze(obj);
    for (const item of frozen.items as Record<string, unknown>[]) {
      expect(Object.isFrozen(item)).toBe(true);
    }
  });

  it('returns the same reference', () => {
    const obj = { a: 1 };
    const frozen = deepFreeze(obj);
    expect(frozen).toBe(obj);
  });

  it('does not throw on null', () => {
    const obj = { a: null, b: undefined };
    expect(() => deepFreeze(obj)).not.toThrow();
    expect(Object.isFrozen(obj)).toBe(true);
  });
});

describe('getContextSchemaVersion', () => {
  it('returns a semver string', () => {
    const version = getContextSchemaVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('returns the same value on repeated calls', () => {
    expect(getContextSchemaVersion()).toBe(getContextSchemaVersion());
  });
});
