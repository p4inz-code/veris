/**
 * Finding context builder — transforms a canonical Finding into Explained types.
 *
 * Builds:
 * - ExplainedFinding (finding metadata)
 * - ExplainedEvidence[] (evidence list, sorted per SPEC-011)
 * - ExplainedRule (rule definition)
 * - ExplainedArtifact (artifact metadata)
 *
 * @module @veris/explain/context/finding-context
 */

import type { CanonicalReport, Finding, Evidence, Artifact } from '@veris/core';

import type {
  ExplainedFinding,
  ExplainedEvidence,
  ExplainedRule,
  ExplainedArtifact,
} from '../types/context.js';

import { sortExplainedEvidence, limitEvidence } from './evidence-ordering.js';

/** Maximum evidence items to include in context (per SPEC-011 §7.3). */
const MAX_EVIDENCE_ITEMS = 10;

/**
 * Build ExplainedFinding from canonical Finding.
 *
 * @param finding - The canonical Finding.
 * @returns ExplainedFinding with readonly fields.
 */
export function buildExplainedFinding(finding: Finding): ExplainedFinding {
  return {
    id: finding.id,
    title: finding.title,
    severity: {
      level: finding.severity.level,
      score: finding.severity.score,
    },
    confidence: finding.confidence,
    ruleId: finding.ruleId,
    description: finding.description,
    taxonomyIds: finding.taxonomyIds?.length ? [...finding.taxonomyIds] : undefined,
    evidenceIds: finding.evidenceIds?.length ? [...finding.evidenceIds] : undefined,
  };
}

/**
 * Build ExplainedEvidence list from canonical Evidence items.
 *
 * Evidence is sorted by: confidence DESC, severity DESC, path ASC, line ASC, ID ASC
 * Limited to MAX_EVIDENCE_ITEMS items.
 *
 * @param evidenceIds - The list of evidence IDs from the finding.
 * @param report - The canonical report containing evidence.
 * @returns Sorted and limited array of ExplainedEvidence.
 */
export function buildExplainedEvidenceList(
  evidenceIds: readonly string[],
  report: CanonicalReport,
): ExplainedEvidence[] {
  // Collect all evidence for this finding
  const allEvidence: ExplainedEvidence[] = [];

  for (const evId of evidenceIds) {
    // Evidence is found through findings — we need to look up from the finding's artifacts
    const ev = findEvidenceInReport(evId, report);
    if (!ev) continue;

    // Extract a path-like value from the match detail (only "exact" and "regex" kinds have pattern)
    const patternValue =
      ev.matchDetail?.kind === 'exact' || ev.matchDetail?.kind === 'regex'
        ? ev.matchDetail.pattern
        : undefined;

    allEvidence.push({
      id: ev.id,
      sourceLocation: {
        path: patternValue ?? 'unknown',
        startLine: 0,
        startColumn: 0,
        snippet: undefined,
      },
      matchDetail: {
        kind: ev.matchDetail?.kind ?? 'unknown',
        value:
          ev.matchDetail?.kind === 'exact' || ev.matchDetail?.kind === 'regex'
            ? ev.matchDetail.pattern
            : ev.matchDetail?.kind === 'heuristic'
              ? `rule=${ev.matchDetail.rule}`
              : undefined,
      },
      confidence: ev.confidence,
    });
  }

  // Sort evidence by deterministic order
  const sorted = sortExplainedEvidence(allEvidence);

  // Limit to MAX_EVIDENCE_ITEMS
  return limitEvidence(sorted, MAX_EVIDENCE_ITEMS);
}

/**
 * Build ExplainedRule from a canonical Rule via the finding's ruleId.
 *
 * Rule definitions require external rule packs loaded at runtime;
 * they are not embedded in CanonicalReport. When the rule is unavailable,
 * a minimal rule object is returned with default severity.
 *
 * @param ruleId - The rule ID from the finding.
 * @param report - The canonical report (for context, but rules are external).
 * @returns ExplainedRule with available information, or undefined if not found.
 */
export function buildExplainedRule(
  ruleId: string,
  _report: CanonicalReport,
): ExplainedRule | undefined {
  // Rule definitions are loaded from external rule packs at scan time.
  // They are not embedded in the CanonicalReport, so default severity
  // is used when the pack is not available in the current context.
  return {
    id: ruleId,
    name: ruleId.split('/').pop() ?? ruleId,
    description: '',
    severity: { level: 'medium', score: 5.0 },
    packId: ruleId.includes('/') ? ruleId.split('/')[0] : undefined,
  };
}

/**
 * Build ExplainedArtifact from a canonical Artifact.
 *
 * @param artifactId - The artifact ID to look up.
 * @param report - The canonical report containing artifacts.
 * @returns ExplainedArtifact, or undefined if artifact not found.
 */
export function buildExplainedArtifact(
  artifactId: string,
  report: CanonicalReport,
): ExplainedArtifact | undefined {
  const artifact = report.artifacts.find((a) => a.id === artifactId);
  if (!artifact) return undefined;

  return {
    id: artifact.id,
    path: artifact.normalizedPath,
    type: artifact.type,
    subType: artifact.subType,
  };
}

/**
 * Build a complete set of context components for a single finding.
 *
 * @param finding - The canonical Finding.
 * @param report - The canonical CanonicalReport.
 * @returns Object containing finding, evidence, rule, and artifact contexts.
 */
export function buildFindingContext(
  finding: Finding,
  report: CanonicalReport,
): {
  readonly finding: ExplainedFinding;
  readonly evidence: readonly ExplainedEvidence[];
  readonly rule?: ExplainedRule;
  readonly artifact?: ExplainedArtifact;
} {
  const explainedFinding = buildExplainedFinding(finding);
  const evidence = buildExplainedEvidenceList(finding.evidenceIds ?? [], report);
  const rule = buildExplainedRule(finding.ruleId, report);
  const artifact = finding.affectedArtifacts?.length
    ? buildExplainedArtifact(finding.affectedArtifacts[0].artifactId, report)
    : undefined;

  return { finding: explainedFinding, evidence, rule, artifact };
}

// ── Helpers ──

/**
 * Find evidence in the canonical report by its ID.
 * Evidence lives inside findings in the current data model.
 */
function findEvidenceInReport(evidenceId: string, report: CanonicalReport): Evidence | undefined {
  // Scan findings for evidence
  for (const finding of report.findings) {
    // Since evidence is embedded in finding properties, we create a minimal
    // evidence object from what's available in the finding's data
    if (finding.evidenceIds?.includes(evidenceId)) {
      // The actual evidence data model needs the full Evidence type.
      // For now, construct from available data.
      // In production, evidence would be stored alongside findings.
      return {
        id: evidenceId,
        ruleId: finding.ruleId,
        behaviorId: '',
        findingId: finding.id,
        sessionId: finding.sessionId,
        matchedProperties: {},
        matchDetail: {
          kind: 'exact',
          pattern: '',
          matched: '',
        },
        confidence: finding.confidence,
      };
    }
  }
  return undefined;
}
