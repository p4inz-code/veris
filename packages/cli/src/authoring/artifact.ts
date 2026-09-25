/**
 * @veris/cli/authoring/artifact — Candidate rule artifact creation and rendering.
 *
 * Implements Section 4.5 of ADR-016:
 * - Human-reviewable candidate artifact assembly
 * - JSON and Markdown serialization
 * - Explicit review notices and promotion instructions
 *
 * @module @veris/cli/authoring/artifact
 */

import { deterministicId } from '@veris/shared';

import { CLI_VERSION } from '../wirer.js';

import type {
  CandidateRuleArtifact,
  PluginRulePack,
  RuleAuthoringRequest,
  RuleTestExecutionReport,
  RuleValidationReport,
} from './types.js';

export const REVIEW_NOTICE =
  'IMPORTANT NOTICE: This candidate rule pack was authored with AI assistance and/or automated templates. ' +
  'Model-generated rationales are non-authoritative. The candidate has passed deterministic structural validation ' +
  'and synthetic fixture testing, but REQUIRES EXPLICIT HUMAN REVIEW prior to promotion into production detection rules.';

/**
 * Creates a complete CandidateRuleArtifact record.
 */
export function createCandidateRuleArtifact(options: {
  readonly request: RuleAuthoringRequest;
  readonly candidateRulePack: PluginRulePack;
  readonly rationale: string;
  readonly threatScenario: string;
  readonly validation: RuleValidationReport;
  readonly testExecution: RuleTestExecutionReport;
  readonly provider: string;
  readonly model?: string;
  readonly timestamp?: string;
}): CandidateRuleArtifact {
  const createdAt = options.timestamp ?? new Date().toISOString();
  const id = deterministicId('crule', createdAt, options.candidateRulePack.id);

  return Object.freeze({
    id,
    createdAt,
    request: options.request,
    candidateRulePack: options.candidateRulePack,
    rationale: options.rationale,
    threatScenario: options.threatScenario,
    validation: options.validation,
    testExecution: options.testExecution,
    metadata: Object.freeze({
      provider: options.provider,
      model: options.model,
      generatorVersion: CLI_VERSION,
      reviewNotice: REVIEW_NOTICE,
      promotionInstructions: `To promote this candidate rule pack into your active plugin directory, execute:\n  veris rule author --promote <path-to-this-file> --target-dir <plugins-directory>`,
    }),
  });
}

/**
 * Serialize artifact to formatted JSON.
 */
export function renderCandidateArtifactJson(artifact: CandidateRuleArtifact): string {
  return JSON.stringify(artifact, null, 2) + '\n';
}

/**
 * Format artifact as human-reviewable Markdown.
 */
export function renderCandidateArtifactMarkdown(artifact: CandidateRuleArtifact): string {
  const pack = artifact.candidateRulePack;
  const val = artifact.validation;
  const test = artifact.testExecution;

  const lines: string[] = [];
  lines.push(`# VERIS Candidate Rule Pack: ${pack.id}`);
  lines.push('');
  lines.push(`> **Artifact ID:** \`${artifact.id}\`  `);
  lines.push(`> **Created At:** ${artifact.createdAt}  `);
  lines.push(
    `> **Generator / Provider:** \`${artifact.metadata.provider}\` ${artifact.metadata.model ? `(\`${artifact.metadata.model}\`)` : ''}  `,
  );
  lines.push(
    `> **Status:** ${val.valid && test.passed ? '✅ VALIDATED & TESTED (PENDING OPERATOR REVIEW)' : '❌ VALIDATION OR TEST FAILURE'}`,
  );
  lines.push('');
  lines.push(`> [!WARNING]`);
  lines.push(`> ${artifact.metadata.reviewNotice}`);
  lines.push('');

  lines.push('## Threat Scenario & Intent');
  lines.push('');
  lines.push(`- **Operator Intent:** ${artifact.request.intent}`);
  lines.push(`- **Threat Scenario:** ${artifact.threatScenario}`);
  lines.push(`- **Authoring Rationale:** ${artifact.rationale}`);
  lines.push('');

  lines.push('## Deterministic Validation Gate');
  lines.push('');
  lines.push('| Validation Check | Status | Details |');
  lines.push('| :--- | :---: | :--- |');
  lines.push(
    `| Declarative Purity (Zero Code Execution) | ${val.isPure ? '✅ PASS' : '❌ FAIL'} | No functions, lambdas, or prototype pollution |`,
  );
  lines.push(
    `| Manifest & Schema Validity | ${val.isValidSchema ? '✅ PASS' : '❌ FAIL'} | Valid semver, pack ID, and rule structure |`,
  );
  lines.push(
    `| Supported Matcher Operators | ${val.supportedMatchers ? '✅ PASS' : '❌ FAIL'} | Standard declarative comparison operators only |`,
  );
  lines.push(
    `| Regex Safety & Length Bounding | ${val.regexSafe ? '✅ PASS' : '❌ FAIL'} | Regex patterns <= 1,000 chars and syntax verified |`,
  );
  lines.push(
    `| Severity Bounds [0.0 - 10.0] | ${val.severityValid ? '✅ PASS' : '❌ FAIL'} | Normalized severity level and score valid |`,
  );
  lines.push(
    `| Rules Engine Adaptation | ${val.adaptedSuccessfully ? '✅ PASS' : '❌ FAIL'} | Converted to ${val.adaptedRuleCount} canonical Rule definition(s) |`,
  );
  lines.push('');

  if (val.errors.length > 0) {
    lines.push('### Validation Errors:');
    for (const err of val.errors) {
      lines.push(`- ❌ ${err}`);
    }
    lines.push('');
  }

  if (val.warnings.length > 0) {
    lines.push('### Advisories:');
    for (const warn of val.warnings) {
      lines.push(`- ⚠️ ${warn}`);
    }
    lines.push('');
  }

  lines.push('## Automated Test Fixture Execution');
  lines.push('');
  lines.push(`- **Overall Test Result:** ${test.passed ? '✅ PASSED' : '❌ FAILED'}`);
  lines.push(
    `- **Determinism Check (10 runs):** ${test.determinismPass ? '✅ PASSED (Byte-for-byte identical)' : '❌ FAILED'}`,
  );
  lines.push(`- **Total Evaluation Duration:** ${test.totalDurationMs} ms`);
  lines.push('');
  lines.push('| Test Fixture | Expected | Observed | Outcome | Duration |');
  lines.push('| :--- | :---: | :---: | :---: | :---: |');
  for (const outcome of test.outcomes) {
    lines.push(
      `| \`${outcome.fixtureName}\` | ${outcome.expectedMatch ? 'Match' : 'No Match'} | ${outcome.actualMatch ? 'Match' : 'No Match'} | ${outcome.passed ? '✅ PASS' : '❌ FAIL'} | ${outcome.durationMs}ms |`,
    );
  }
  lines.push('');

  lines.push('## Declarative Rule Pack Specification');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(pack, null, 2));
  lines.push('```');
  lines.push('');

  lines.push('## Promotion Instructions');
  lines.push('');
  lines.push('Candidate rules are never automatically loaded into active scanning directories.');
  lines.push('To promote this candidate rule pack to an active plugin directory, run:');
  lines.push('');
  lines.push('```bash');
  lines.push(`veris rule author --promote <candidate-file> --target-dir <plugins-dir>`);
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}
