/**
 * @veris/cli/authoring/provider — Model integration and offline fallback generator for rule authoring.
 *
 * Implements Section 4.2 of ADR-016:
 * - Deterministic offline rule template generation (100% offline, zero network)
 * - Integration with @veris/ai provider registry when configured
 * - Untrusted model output parsing and sanitization
 *
 * @module @veris/cli/authoring/provider
 */

import { defaultProviderFactory } from '@veris/ai';

import { safeJsonParse } from '../ci/baseline.js';

import { buildRuleAuthorUserPrompt, RULE_AUTHOR_SYSTEM_PROMPT } from './prompts.js';
import type { PluginRulePack, RuleAuthoringRequest, SeverityLevel } from './types.js';

/**
 * Raw output payload expected from generator (AI or offline template).
 */
export interface GeneratedRulePayload {
  readonly candidateRulePack: PluginRulePack;
  readonly rationale: string;
  readonly threatScenario: string;
  readonly samplePositiveValue: unknown;
  readonly sampleNegativeValue: unknown;
  readonly provider: string;
  readonly model?: string;
}

/**
 * Clean and parse raw LLM output text into a JSON object.
 */
function cleanAndParseModelOutput(rawText: string): Record<string, unknown> {
  let cleaned = rawText.trim();

  // Strip markdown code fences if present
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    if (firstNewline !== -1) {
      cleaned = cleaned.substring(firstNewline + 1);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    cleaned = cleaned.trim();
  }

  return safeJsonParse<Record<string, unknown>>(cleaned);
}

/**
 * Maps severity level string to normalized score.
 */
function severityToScore(level: SeverityLevel): number {
  switch (level) {
    case 'critical':
      return 9.5;
    case 'high':
      return 7.5;
    case 'medium':
      return 5.0;
    case 'low':
      return 2.5;
    case 'info':
    default:
      return 0.5;
  }
}

/**
 * Deterministic offline rule template generator.
 * Operates with 0 network calls and produces consistent, valid Rule Packs from request parameters.
 */
export function generateOfflineCandidateRule(request: RuleAuthoringRequest): GeneratedRulePayload {
  const normIntent = request.intent.trim();
  const slug =
    normIntent
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'custom-rule';

  const packId = request.packId || `pack-${slug}`;
  const ruleId = `${packId}/${request.name ? request.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') : slug}`;
  const ruleName = request.name || normIntent.slice(0, 50);
  const severityLevel: SeverityLevel = request.severity || 'medium';
  const severityScore = severityToScore(severityLevel);

  const taxonomyId =
    request.taxonomyId || (request.category ? `${request.category}.detection` : 'detection.custom');
  const propertyPath = request.propertyPath || 'value';
  const operator = request.matcherOperator || 'contains';
  const expectedValue =
    request.expectedValue !== undefined ? request.expectedValue : normIntent.slice(0, 20);

  // Derive positive and negative test sample values
  let samplePositiveValue: unknown;
  let sampleNegativeValue: unknown;

  if (operator === 'contains') {
    samplePositiveValue = `prefix_${String(expectedValue)}_suffix`;
    sampleNegativeValue = 'completely_unrelated_clean_value';
  } else if (operator === 'equals') {
    samplePositiveValue = expectedValue;
    sampleNegativeValue =
      typeof expectedValue === 'number' ? (expectedValue as number) + 1 : 'different_value';
  } else if (operator === 'regex' || operator === 'matches') {
    samplePositiveValue = String(expectedValue);
    sampleNegativeValue = 'non_matching_safe_input';
  } else if (operator === 'gt' || operator === 'gte') {
    const num = typeof expectedValue === 'number' ? expectedValue : 10;
    samplePositiveValue = num + 5;
    sampleNegativeValue = num - 5;
  } else if (operator === 'exists') {
    samplePositiveValue = 'present_value';
    sampleNegativeValue = undefined;
  } else {
    samplePositiveValue = expectedValue;
    sampleNegativeValue = null;
  }

  const candidateRulePack: PluginRulePack = Object.freeze({
    id: packId,
    version: '1.0.0',
    description: `Rule Pack for detecting: ${normIntent}`,
    rules: Object.freeze([
      Object.freeze({
        id: ruleId,
        packId,
        version: '1.0.0',
        name: ruleName,
        description: normIntent,
        severity: Object.freeze({
          level: severityLevel,
          score: severityScore,
        }),
        taxonomyIds: Object.freeze([taxonomyId]),
        matchLogic: Object.freeze({
          kind: 'single-behavior',
          behaviorTaxonomyId: taxonomyId,
          propertyMatcher: Object.freeze({
            path: propertyPath,
            operator,
            value: expectedValue,
          }),
        }),
        metadata: Object.freeze({
          author: 'VERIS Detection Engineering (Offline Template)',
          tags: Object.freeze(['security', request.category || 'custom']),
          cweIds: Object.freeze(request.cweId ? [request.cweId] : ['CWE-710']),
          remediation: `Inspect artifact containing ${propertyPath} matching pattern. Validate origin and remediate per standard operating procedures.`,
        }),
      }),
    ]),
    metadata: Object.freeze({
      author: 'VERIS Detection Engineering',
      tags: Object.freeze(['security', 'authoring']),
      severity: Object.freeze({
        min: severityScore,
        max: severityScore,
      }),
    }),
  });

  return {
    candidateRulePack,
    rationale: `Offline template rule constructed from intent: "${normIntent}". Checks property "${propertyPath}" with operator "${operator}".`,
    threatScenario: `Potential threat or policy non-compliance involving: ${normIntent}`,
    samplePositiveValue,
    sampleNegativeValue,
    provider: 'offline-template',
  };
}

/**
 * Generate candidate rule payload using configured LLM provider or offline fallback.
 */
export async function generateCandidateRulePayload(
  request: RuleAuthoringRequest,
): Promise<GeneratedRulePayload> {
  // If explicitly offline or provider is 'offline'/'mock'
  if (request.offline || request.provider === 'offline') {
    return generateOfflineCandidateRule(request);
  }

  const providerName = request.provider;

  // If no provider requested, try default offline generator
  if (!providerName) {
    return generateOfflineCandidateRule(request);
  }

  // Attempt generation via @veris/ai provider factory
  try {
    const provider = defaultProviderFactory.createProvider({
      type: providerName as 'openai' | 'anthropic' | 'ollama' | 'mock',
      model: request.model,
    });

    if (!provider) {
      const fallback = generateOfflineCandidateRule(request);
      return {
        ...fallback,
        rationale: `${fallback.rationale} (Note: provider "${providerName}" was not available; used offline generator).`,
      };
    }

    const health = await provider.healthCheck();
    if (!health.healthy) {
      const fallback = generateOfflineCandidateRule(request);
      return {
        ...fallback,
        rationale: `${fallback.rationale} (Note: provider "${providerName}" health check failed: ${health.message ?? 'unhealthy'}; used offline generator).`,
      };
    }

    const userPrompt = buildRuleAuthorUserPrompt(request);
    const response = await provider.generate({
      messages: [
        { role: 'system', content: RULE_AUTHOR_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1, // low temperature for deterministic structural adherence
      responseFormat: 'json',
    });

    const parsed = cleanAndParseModelOutput(response.content);

    if (!parsed || typeof parsed !== 'object' || !parsed.candidateRulePack) {
      throw new Error('Model response did not contain a valid "candidateRulePack" object.');
    }

    return {
      candidateRulePack: parsed.candidateRulePack as PluginRulePack,
      rationale:
        typeof parsed.rationale === 'string'
          ? parsed.rationale
          : `Generated for intent: ${request.intent}`,
      threatScenario:
        typeof parsed.threatScenario === 'string' ? parsed.threatScenario : request.intent,
      samplePositiveValue: parsed.samplePositiveValue,
      sampleNegativeValue: parsed.sampleNegativeValue,
      provider: providerName,
      model: request.model ?? response.model,
    };
  } catch (err) {
    // If provider fails, fall back to offline generator with diagnostic note
    const fallback = generateOfflineCandidateRule(request);
    const errMessage = err instanceof Error ? err.message : String(err);
    return {
      ...fallback,
      rationale: `${fallback.rationale} (Fallback used due to provider error: ${errMessage}).`,
    };
  }
}
