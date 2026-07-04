/**
 * Core explanation types — Citation system, ExplanationMode, and the complete Explanation.
 *
 * @module @veris/explain/types/explanation
 */

import type { SeverityLevel } from '@veris/core';

// ── Citation System ──

/**
 * All 10 valid citation source types matching SPEC-011 §8.2.
 *
 * Each value corresponds to a canonical VERIS object type:
 * - `finding` → Finding objects (ID prefix: fin_)
 * - `evidence` → Evidence objects (ID prefix: ev_)
 * - `rule` → Rule objects (ID format: {pack}/{rule})
 * - `behavior` → Behavior objects (ID prefix: beh_)
 * - `artifact` → Artifact objects (ID prefix: art_)
 * - `chain` → BehaviorChain objects (ID prefix: bc_)
 * - `risk-dimension` → Risk dimension (ID prefix: D)
 * - `recommendation` → Recommendation objects (ID prefix: rec_)
 * - `rule-prop` → A specific property of a Rule (ID format: {rule}:{prop})
 * - `report-meta` → Report-level metadata (ID format: report:{field})
 */
export type CitationSourceType =
  | 'finding'
  | 'evidence'
  | 'rule'
  | 'behavior'
  | 'artifact'
  | 'chain'
  | 'risk-dimension'
  | 'recommendation'
  | 'rule-prop'
  | 'report-meta';

/**
 * A single citation referencing deterministic evidence.
 *
 * Every citation points to a canonical VERIS object that exists in the
 * report or context. Citations are verified by {@link CitationVerifier}
 * before delivery to the user.
 */
export interface Citation {
  /** Unique citation ID within the explanation (e.g., "cit_1"). */
  readonly id: string;
  /** The type of source being cited. */
  readonly sourceType: CitationSourceType;
  /** The deterministic ID of the source object. */
  readonly sourceId: string;
  /** Human-readable label for the citation. */
  readonly label: string;
  /** Whether the citation was verified to point to a real object. */
  readonly verified: boolean;
  /** If verified=false, the reason for verification failure. */
  readonly verificationError?: string;
}

/**
 * The result of validating all citations in an explanation.
 */
export interface CitationValidationResult {
  /** Whether all citations passed validation. */
  readonly valid: boolean;
  /** Total number of citations in the explanation. */
  readonly totalCitations: number;
  /** Number of citations that passed verification. */
  readonly verifiedCitations: number;
  /** Number of citations that failed verification. */
  readonly failedCitations: number;
  /** All citations with their verification status. */
  readonly citations: readonly Citation[];
}

// ── Explanation Mode ──

/**
 * Detail level for an explanation.
 *
 * - `"simple"`: One paragraph, one citation per claim, no technical jargon
 * - `"technical"`: Multiple paragraphs, all citations, technical details
 * - `"expert"`: Full traceability chain, all evidence, source locations
 */
export type ExplanationMode = 'simple' | 'technical' | 'expert';

// ── Provider Metadata ──

/** Metadata about the AI provider that generated the explanation. */
export interface ProviderInfo {
  readonly id: string;
  readonly model: string;
}

/** Token usage statistics for an explanation. */
export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

// ── Explanation ──

/**
 * A complete AI-generated explanation.
 *
 * Contains the generated text, all citations with validation results,
 * provider metadata, token usage, and AI disclaimer.
 */
export interface Explanation {
  /** Unique explanation ID. */
  readonly id: string;
  /** The canonical object being explained (Finding ID, Chain ID, etc.). */
  readonly subjectId: string;
  /** The type of subject being explained. */
  readonly subjectType: 'finding' | 'chain' | 'risk' | 'report';
  /** The detail mode of this explanation. */
  readonly mode: ExplanationMode;
  /** The generated explanation text (Markdown-formatted). */
  readonly text: string;
  /** All citations in the explanation. */
  readonly citations: readonly Citation[];
  /** Citation validation result. */
  readonly citationValidation: CitationValidationResult;
  /** Provider metadata. */
  readonly provider: ProviderInfo;
  /** Prompt version used. */
  readonly promptVersion: string;
  /** Token usage. */
  readonly tokenUsage: TokenUsage;
  /** Whether this is a cached response. */
  readonly cached: boolean;
  /** Whether the AI refused to explain (null-evidence). */
  readonly refused: boolean;
  /** Refusal reason, if refused. */
  readonly refusalReason?: string;
  /** Timestamp (ISO 8601). */
  readonly generatedAt: string;
  /** AI disclaimer. */
  readonly disclaimer: string;
}
