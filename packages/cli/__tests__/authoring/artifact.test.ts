/**
 * Tests for candidate rule artifact serialization (Phase 12).
 */

import { describe, expect, it } from 'vitest';

import {
  createCandidateRuleArtifact,
  renderCandidateArtifactJson,
  renderCandidateArtifactMarkdown,
  REVIEW_NOTICE,
} from '../../src/authoring/artifact.js';
import { generateOfflineCandidateRule } from '../../src/authoring/provider.js';
import { executeCandidateRuleTests } from '../../src/authoring/test-generator.js';
import { validateCandidateRulePack } from '../../src/authoring/validator.js';

describe('Phase 12: Candidate Rule Artifact', () => {
  it('creates artifact and serializes to JSON and Markdown', async () => {
    const request = {
      intent: 'Detect hardcoded private keys',
      severity: 'critical' as const,
      cweId: 'CWE-321',
    };

    const payload = generateOfflineCandidateRule(request);
    const validation = validateCandidateRulePack(payload.candidateRulePack);
    const testExecution = await executeCandidateRuleTests(
      payload.candidateRulePack,
      payload.samplePositiveValue,
      payload.sampleNegativeValue,
    );

    const artifact = createCandidateRuleArtifact({
      request,
      candidateRulePack: payload.candidateRulePack,
      rationale: payload.rationale,
      threatScenario: payload.threatScenario,
      validation,
      testExecution,
      provider: 'offline-template',
      timestamp: '2026-09-24T00:00:00.000Z',
    });

    expect(artifact.id).toContain('crule_');
    expect(artifact.metadata.reviewNotice).toBe(REVIEW_NOTICE);

    // JSON serialization
    const jsonStr = renderCandidateArtifactJson(artifact);
    const parsed = JSON.parse(jsonStr);
    expect(parsed.id).toBe(artifact.id);
    expect(parsed.candidateRulePack.rules).toHaveLength(1);

    // Markdown serialization
    const mdStr = renderCandidateArtifactMarkdown(artifact);
    expect(mdStr).toContain('# VERIS Candidate Rule Pack:');
    expect(mdStr).toContain('Declarative Purity');
    expect(mdStr).toContain('Promotion Instructions');
    expect(mdStr).toContain('veris rule author --promote');
  });
});
