/**
 * Tests for candidate rule test generator (Phase 12).
 */

import { describe, expect, it } from 'vitest';

import { generateOfflineCandidateRule } from '../../src/authoring/provider.js';
import { executeCandidateRuleTests } from '../../src/authoring/test-generator.js';

describe('Phase 12: Candidate Rule Test Generator & Runner', () => {
  it('executes automated test fixtures and verifies positive match and negative non-match', async () => {
    const payload = generateOfflineCandidateRule({
      intent: 'Detect cleartext credentials',
      evidenceType: 'credential.detection',
      taxonomyId: 'credential.detection',
      propertyPath: 'metadata.password',
      matcherOperator: 'contains',
      expectedValue: 'admin123',
    });

    const report = await executeCandidateRuleTests(
      payload.candidateRulePack,
      payload.samplePositiveValue,
      payload.sampleNegativeValue,
    );

    expect(report.passed).toBe(true);
    expect(report.determinismPass).toBe(true);
    expect(report.outcomes).toHaveLength(2);

    const posOutcome = report.outcomes.find((o) => o.expectedMatch);
    expect(posOutcome).toBeDefined();
    expect(posOutcome?.passed).toBe(true);
    expect(posOutcome?.actualMatch).toBe(true);

    const negOutcome = report.outcomes.find((o) => !o.expectedMatch);
    expect(negOutcome).toBeDefined();
    expect(negOutcome?.passed).toBe(true);
    expect(negOutcome?.actualMatch).toBe(false);
  });

  it('detects test failure when sample values do not satisfy rule', async () => {
    const payload = generateOfflineCandidateRule({
      intent: 'Detect debug mode',
      evidenceType: 'config.debug',
      taxonomyId: 'config.debug',
      propertyPath: 'value',
      matcherOperator: 'equals',
      expectedValue: 'DEBUG_ACTIVE',
    });

    // Provide intentional non-matching value for positive test
    const report = await executeCandidateRuleTests(
      payload.candidateRulePack,
      'WRONG_VALUE', // will fail positive match
      payload.sampleNegativeValue,
    );

    expect(report.passed).toBe(false);
    const posOutcome = report.outcomes.find((o) => o.expectedMatch);
    expect(posOutcome?.passed).toBe(false);
    expect(posOutcome?.actualMatch).toBe(false);
  });
});
