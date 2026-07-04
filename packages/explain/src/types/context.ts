/**
 * Context types — strongly typed interfaces derived from canonical models.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Each type is a READ-ONLY PICK of the relevant fields from the corresponding
 * canonical type. These are NOT the canonical types themselves — they are
 * the subset of fields that may be exposed to the LLM.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * @module @veris/explain/types/context
 */

import type { SeverityLevel } from '@veris/core';

// ── Explained Subject Types ──

/**
 * Fields from a canonical Finding exposed to the LLM.
 */
export interface ExplainedFinding {
  readonly id: string;
  readonly title: string;
  readonly severity: { readonly level: SeverityLevel; readonly score: number };
  readonly confidence: number;
  readonly ruleId: string;
  readonly description: string;
  readonly taxonomyIds?: readonly string[];
  readonly evidenceIds?: readonly string[];
}

/**
 * Fields from a canonical Evidence object exposed to the LLM.
 */
export interface ExplainedEvidence {
  readonly id: string;
  readonly sourceLocation: {
    readonly path: string;
    readonly startLine: number;
    readonly startColumn: number;
    readonly snippet?: string;
  };
  readonly matchDetail: {
    readonly kind: string;
    readonly value?: string;
  };
  readonly confidence: number;
}

/**
 * Fields from a canonical Rule exposed to the LLM.
 */
export interface ExplainedRule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly severity: { readonly level: SeverityLevel; readonly score: number };
  readonly packId?: string;
  readonly cweIds?: readonly string[];
  readonly owaspIds?: readonly string[];
  readonly remediation?: string;
}

/**
 * Fields from a canonical Artifact exposed to the LLM.
 */
export interface ExplainedArtifact {
  readonly id: string;
  readonly path: string;
  readonly type: string;
  readonly subType?: string;
}

/**
 * Fields from a canonical RiskProfile exposed to the LLM.
 */
export interface ExplainedRiskProfile {
  readonly overallScore: number;
  readonly overallLevel: 'critical' | 'high' | 'medium' | 'low' | 'negligible';
  readonly dimensions?: readonly {
    readonly id: string;
    readonly name: string;
    readonly score: number;
    readonly contribution?: number;
  }[];
  readonly trustScore?: number;
}

/**
 * Fields from a canonical BehaviorChain exposed to the LLM.
 */
export interface ExplainedChain {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly severity: { readonly level: SeverityLevel; readonly score: number };
  readonly findingIds: readonly string[];
}

/**
 * Fields from a report summary exposed to the LLM.
 */
export interface ExplainedReportSummary {
  readonly totalFindings: number;
  readonly totalArtifacts: number;
  readonly findingsBySeverity: Record<SeverityLevel, number>;
  readonly scanDurationMs?: number;
  readonly scanTimestamp?: string;
}

/**
 * Union of all possible subject types for explanation.
 */
export type ExplainedSubject =
  ExplainedFinding | ExplainedChain | ExplainedRiskProfile | ExplainedReportSummary;

// ── Token Budget ──

/** Token budget information included in the context. */
export interface ContextTokenBudget {
  readonly allocated: number;
  readonly used: number;
  readonly remaining: number;
}

// ── ExplainedContext ──

/**
 * Context provided to the LLM for generating explanations.
 *
 * All fields are strongly typed — no Record<string, unknown>.
 * Every field is a pick of deterministic canonical data.
 */
export interface ExplainedContext {
  /** The subject being explained (Finding, Chain, etc.). */
  readonly subject: ExplainedSubject;
  /** Supporting evidence context (up to 10 items, ordered by confidence desc). */
  readonly evidence: readonly ExplainedEvidence[];
  /** Rule context (if explaining a Finding). */
  readonly rule?: ExplainedRule;
  /** Artifact context (if explaining a Finding). */
  readonly artifact?: ExplainedArtifact;
  /** Risk context. */
  readonly risk?: ExplainedRiskProfile;
  /** Report summary context. */
  readonly report?: ExplainedReportSummary;
  /** Token budget information. */
  readonly tokenBudget: ContextTokenBudget;
  /** Schema version of the context structure (for cache keying). */
  readonly contextSchemaVersion: string;
}
