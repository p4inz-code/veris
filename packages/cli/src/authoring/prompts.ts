/**
 * @veris/cli/authoring/prompts — Prompts and schema guidelines for AI-assisted rule generation.
 *
 * Enforces:
 * - Strict JSON output contract
 * - Declarative AST output (zero JavaScript/executable code)
 * - Structured guidance for property matchers, taxonomy IDs, and remediation
 *
 * @module @veris/cli/authoring/prompts
 */

import type { RuleAuthoringRequest } from './types.js';

/**
 * System prompt governing rule authoring generation.
 */
export const RULE_AUTHOR_SYSTEM_PROMPT = `
You are the VERIS Security Detection Engineering Assistant.
Your task is to generate a strictly declarative candidate Rule Pack conforming to the VERIS V2 Plugin Rule Pack specification.

CRITICAL INVARIANTS:
1. Output MUST be valid JSON only. Do not wrap in markdown code blocks or explanations outside JSON.
2. Rules MUST be 100% declarative AST data structures. NO executable JavaScript, NO lambda expressions, NO functions, NO eval.
3. Supported property matcher operators are: "equals", "not-equals", "contains", "matches", "gt", "gte", "lt", "lte", "exists", "in", "regex".
4. Regex patterns must be safe against ReDoS (no catastrophic backtracking, max length 500 chars).
5. Severity scores must be between 0.0 and 10.0, with levels: "critical", "high", "medium", "low", "info".
6. You must supply:
   - "candidateRulePack": the complete declarative PluginRulePack object.
   - "rationale": clear explanation of why this condition detects the threat.
   - "threatScenario": the attack technique or misconfiguration addressed.
   - "samplePositiveValue": sample data that will trigger a match for testing.
   - "sampleNegativeValue": sample data that will NOT trigger a match for testing.
`.trim();

/**
 * Build the user prompt for a specific authoring request.
 */
export function buildRuleAuthorUserPrompt(request: RuleAuthoringRequest): string {
  const parts: string[] = [];
  parts.push(`Threat Intent: "${request.intent}"`);

  if (request.name) {
    parts.push(`Rule Name: "${request.name}"`);
  }
  if (request.category) {
    parts.push(`Category: "${request.category}"`);
  }
  if (request.evidenceType) {
    parts.push(`Evidence Category/Type: "${request.evidenceType}"`);
  }
  if (request.propertyPath) {
    parts.push(`Target Property Path: "${request.propertyPath}"`);
  }
  if (request.matcherOperator) {
    parts.push(`Desired Operator: "${request.matcherOperator}"`);
  }
  if (request.expectedValue !== undefined) {
    parts.push(`Expected Match Value: ${JSON.stringify(request.expectedValue)}`);
  }
  if (request.cweId) {
    parts.push(`CWE ID: "${request.cweId}"`);
  }
  if (request.taxonomyId) {
    parts.push(`Taxonomy ID: "${request.taxonomyId}"`);
  }
  if (request.severity) {
    parts.push(`Target Severity: "${request.severity}"`);
  }

  parts.push(
    `
Respond with a JSON object matching this schema:
{
  "candidateRulePack": {
    "id": "<pack-id>",
    "version": "1.0.0",
    "description": "<pack description>",
    "rules": [
      {
        "id": "<rule-id>",
        "packId": "<pack-id>",
        "version": "1.0.0",
        "name": "<rule name>",
        "description": "<rule description>",
        "severity": { "level": "<critical|high|medium|low|info>", "score": <number 0-10> },
        "taxonomyIds": ["<taxonomy.id>"],
        "matchLogic": {
          "kind": "single-behavior",
          "behaviorTaxonomyId": "<taxonomy.id>",
          "propertyMatcher": {
            "path": "<property.path>",
            "operator": "<operator>",
            "value": <value>
          }
        },
        "metadata": {
          "author": "VERIS Detection Engineering",
          "tags": ["<tag1>", "<tag2>"],
          "cweIds": ["<CWE-ID>"],
          "remediation": "<actionable remediation instructions>"
        }
      }
    ],
    "metadata": {
      "author": "VERIS Detection Engineering",
      "tags": ["security"],
      "severity": { "min": 0, "max": 10 }
    }
  },
  "rationale": "<explanation>",
  "threatScenario": "<scenario>",
  "samplePositiveValue": <value that matches>,
  "sampleNegativeValue": <value that does NOT match>
}
`.trim(),
  );

  return parts.join('\n');
}
