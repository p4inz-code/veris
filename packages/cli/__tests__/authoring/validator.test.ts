/**
 * Tests for deterministic rule validator (Phase 12).
 */

import { describe, expect, it } from 'vitest';

import { validateCandidateRulePack } from '../../src/authoring/validator.js';
import type { PluginRulePack } from '../../src/authoring/types.js';

describe('Phase 12: Rule Authoring Validator', () => {
  const validPack: PluginRulePack = Object.freeze({
    id: 'test-pack',
    version: '1.0.0',
    description: 'Test rule pack',
    rules: Object.freeze([
      Object.freeze({
        id: 'test-pack/api-key',
        packId: 'test-pack',
        version: '1.0.0',
        name: 'Hardcoded API Key',
        description: 'Detects hardcoded secrets',
        severity: Object.freeze({ level: 'high', score: 8.0 }),
        taxonomyIds: Object.freeze(['credential.access']),
        matchLogic: Object.freeze({
          kind: 'single-behavior',
          behaviorTaxonomyId: 'credential.access',
          propertyMatcher: Object.freeze({
            path: 'value',
            operator: 'contains',
            value: 'SECRET_',
          }),
        }),
        metadata: Object.freeze({
          author: 'Test Engineer',
          remediation: 'Rotate key immediately.',
          cweIds: Object.freeze(['CWE-798']),
        }),
      }),
    ]),
    metadata: Object.freeze({
      author: 'Test Engineer',
      tags: Object.freeze(['test']),
      severity: Object.freeze({ min: 8.0, max: 8.0 }),
    }),
  });

  it('validates a well-formed declarative rule pack', () => {
    const report = validateCandidateRulePack(validPack);
    expect(report.valid).toBe(true);
    expect(report.isPure).toBe(true);
    expect(report.isValidSchema).toBe(true);
    expect(report.supportedMatchers).toBe(true);
    expect(report.regexSafe).toBe(true);
    expect(report.adaptedSuccessfully).toBe(true);
    expect(report.adaptedRuleCount).toBe(1);
    expect(report.errors).toHaveLength(0);
  });

  it('rejects candidate with executable functions (declarative purity)', () => {
    const maliciousPack = {
      ...validPack,
      maliciousFn: () => 'evil',
    };
    const report = validateCandidateRulePack(maliciousPack);
    expect(report.valid).toBe(false);
    expect(report.isPure).toBe(false);
    expect(report.errors.some((e) => e.includes('Declarative purity violation'))).toBe(true);
  });

  it('rejects candidate with prototype pollution keys', () => {
    const pollutedPack = {
      ...validPack,
      __proto__: { hacked: true },
    };
    const report = validateCandidateRulePack(pollutedPack);
    // Even if sanitized, forbidden object keys are rejected
    expect(report.valid).toBe(false);
  });

  it('rejects candidate with unsupported matcher operator', () => {
    const badOpPack: PluginRulePack = {
      ...validPack,
      rules: [
        {
          ...validPack.rules[0],
          matchLogic: {
            kind: 'single-behavior',
            behaviorTaxonomyId: 'credential.access',
            propertyMatcher: {
              path: 'value',
              // @ts-expect-error testing invalid operator
              operator: 'eval_arbitrary_code',
              value: 'test',
            },
          },
        },
      ],
    };
    const report = validateCandidateRulePack(badOpPack);
    expect(report.valid).toBe(false);
    expect(report.supportedMatchers).toBe(false);
    expect(report.errors.some((e) => e.includes('Unsupported matcher operator'))).toBe(true);
  });

  it('rejects candidate with regex pattern exceeding 1000 characters', () => {
    const hugePattern = 'a'.repeat(1005);
    const badRegexPack: PluginRulePack = {
      ...validPack,
      rules: [
        {
          ...validPack.rules[0],
          matchLogic: {
            kind: 'single-behavior',
            behaviorTaxonomyId: 'credential.access',
            propertyMatcher: {
              path: 'value',
              operator: 'regex',
              value: hugePattern,
            },
          },
        },
      ],
    };
    const report = validateCandidateRulePack(badRegexPack);
    expect(report.valid).toBe(false);
    expect(report.regexSafe).toBe(false);
    expect(report.errors.some((e) => e.includes('exceeds maximum length'))).toBe(true);
  });

  it('rejects candidate with malformed regex pattern', () => {
    const badRegexPack: PluginRulePack = {
      ...validPack,
      rules: [
        {
          ...validPack.rules[0],
          matchLogic: {
            kind: 'single-behavior',
            behaviorTaxonomyId: 'credential.access',
            propertyMatcher: {
              path: 'value',
              operator: 'regex',
              value: '[unclosed-bracket',
            },
          },
        },
      ],
    };
    const report = validateCandidateRulePack(badRegexPack);
    expect(report.valid).toBe(false);
    expect(report.regexSafe).toBe(false);
    expect(report.errors.some((e) => e.includes('Malformed regex pattern'))).toBe(true);
  });

  it('rejects candidate with invalid severity score', () => {
    const badSevPack: PluginRulePack = {
      ...validPack,
      rules: [
        {
          ...validPack.rules[0],
          severity: { level: 'critical', score: 15.0 }, // > 10
        },
      ],
    };
    const report = validateCandidateRulePack(badSevPack);
    expect(report.valid).toBe(false);
    expect(report.severityValid).toBe(false);
  });

  it('rejects candidate with duplicate rule IDs', () => {
    const dupPack: PluginRulePack = {
      ...validPack,
      rules: [validPack.rules[0], validPack.rules[0]],
    };
    const report = validateCandidateRulePack(dupPack);
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.includes('Duplicate rule ID'))).toBe(true);
  });
});
