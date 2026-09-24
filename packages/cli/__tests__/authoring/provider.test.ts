/**
 * Tests for rule authoring provider and offline template generator (Phase 12).
 */

import { describe, expect, it } from 'vitest';

import {
  generateCandidateRulePayload,
  generateOfflineCandidateRule,
} from '../../src/authoring/provider.js';

describe('Phase 12: Rule Authoring Provider & Offline Generator', () => {
  it('generates a complete declarative rule pack using offline template', () => {
    const payload = generateOfflineCandidateRule({
      intent: 'Detect cleartext AWS keys in configuration files',
      category: 'credential-access',
      evidenceType: 'configuration',
      propertyPath: 'metadata.token',
      matcherOperator: 'contains',
      expectedValue: 'AKIAIOSFODNN7EXAMPLE',
      severity: 'critical',
      cweId: 'CWE-798',
    });

    expect(payload.provider).toBe('offline-template');
    expect(payload.candidateRulePack.rules).toHaveLength(1);

    const rule = payload.candidateRulePack.rules[0];
    expect(rule.severity.level).toBe('critical');
    expect(rule.severity.score).toBeGreaterThanOrEqual(9.0);
    expect(rule.taxonomyIds).toContain('credential-access.detection');
    expect(rule.metadata.cweIds).toContain('CWE-798');
    expect(rule.matchLogic.kind).toBe('single-behavior');

    if (rule.matchLogic.kind === 'single-behavior') {
      expect(rule.matchLogic.propertyMatcher.path).toBe('metadata.token');
      expect(rule.matchLogic.propertyMatcher.operator).toBe('contains');
      expect(rule.matchLogic.propertyMatcher.value).toBe('AKIAIOSFODNN7EXAMPLE');
    }

    expect(payload.samplePositiveValue).toContain('AKIAIOSFODNN7EXAMPLE');
    expect(payload.sampleNegativeValue).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('handles regex operator sample values properly', () => {
    const payload = generateOfflineCandidateRule({
      intent: 'Match base64 encoded strings',
      matcherOperator: 'regex',
      expectedValue: '^[A-Za-z0-9+/=]{20,}$',
    });

    const rule = payload.candidateRulePack.rules[0];
    if (rule.matchLogic.kind === 'single-behavior') {
      expect(rule.matchLogic.propertyMatcher.operator).toBe('regex');
      expect(rule.matchLogic.propertyMatcher.value).toBe('^[A-Za-z0-9+/=]{20,}$');
    }
    expect(payload.samplePositiveValue).toBe('^[A-Za-z0-9+/=]{20,}$');
  });

  it('falls back to offline template if provider is unconfigured', async () => {
    const payload = await generateCandidateRulePayload({
      intent: 'Detect suspicious PowerShell downloads',
      provider: 'non-existent-provider',
    });

    expect(payload.candidateRulePack.rules).toHaveLength(1);
    expect(payload.candidateRulePack.rules[0].description).toContain('PowerShell');
  });
});
