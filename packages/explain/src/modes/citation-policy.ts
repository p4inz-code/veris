/**
 * Citation policy — citation rules and requirements per explanation mode.
 *
 * Defines which citation source types are allowed, required, or excluded
 * for each mode, as well as citation density requirements (minimum citations
 * per sentence or paragraph).
 *
 * All citation policies are **frozen** and PURELY DETERMINISTIC — the same
 * mode and context always produce the same policy.
 *
 * @module @veris/explain/modes/citation-policy
 */

import type { ExplanationMode, CitationSourceType } from '../types/explanation.js';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Citation density requirement for a mode.
 *
 * - `minCitationsPerSentence`: Minimum citations that must appear per sentence.
 * - `minCitationsPerParagraph`: Minimum citations that must appear per paragraph.
 * - `maxCitationsPerSentence`: Maximum citations allowed per sentence (0 = no limit).
 */
export interface CitationDensity {
  readonly minCitationsPerSentence: number;
  readonly minCitationsPerParagraph: number;
  readonly maxCitationsPerSentence: number;
}

/**
 * Citation policy for a single explanation mode.
 *
 * Defines which citation types are allowed, required, or excluded,
 * as well as density requirements.
 */
export interface ModeCitationPolicy {
  /** The mode this policy applies to. */
  readonly mode: ExplanationMode;

  /** Citation source types that are allowed in this mode. */
  readonly allowedSourceTypes: readonly CitationSourceType[];

  /** Citation source types that are required (must appear at least once). */
  readonly requiredSourceTypes: readonly CitationSourceType[];

  /** Citation source types that are explicitly excluded. */
  readonly excludedSourceTypes: readonly CitationSourceType[];

  /** Citation density requirements. */
  readonly density: CitationDensity;

  /** Whether inline citation numbers should be shown in the text. */
  readonly showInlineCitations: boolean;

  /** Whether the citations section should be included at the end. */
  readonly showCitationsSection: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers — Cast frozen arrays to the right type
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a frozen array of CitationSourceType values.
 * This helper ensures TypeScript infers the correct type.
 */
function freezeTypes(...types: CitationSourceType[]): readonly CitationSourceType[] {
  return Object.freeze(types);
}

// ═══════════════════════════════════════════════════════════════════════════
// Citation Policies — Frozen
// ═══════════════════════════════════════════════════════════════════════════

/** Citation policy for **simple** mode. */
export const SIMPLE_CITATION_POLICY: ModeCitationPolicy = Object.freeze({
  mode: 'simple' as ExplanationMode,
  allowedSourceTypes: freezeTypes('finding', 'evidence', 'rule', 'artifact'),
  requiredSourceTypes: freezeTypes('finding', 'evidence'),
  excludedSourceTypes: freezeTypes(
    'behavior',
    'chain',
    'risk-dimension',
    'recommendation',
    'rule-prop',
    'report-meta',
  ),
  density: Object.freeze({
    minCitationsPerSentence: 1,
    minCitationsPerParagraph: 1,
    maxCitationsPerSentence: 2,
  }),
  showInlineCitations: true,
  showCitationsSection: true,
});

/** Citation policy for **technical** mode. */
export const TECHNICAL_CITATION_POLICY: ModeCitationPolicy = Object.freeze({
  mode: 'technical' as ExplanationMode,
  allowedSourceTypes: freezeTypes(
    'finding',
    'evidence',
    'rule',
    'artifact',
    'behavior',
    'chain',
    'risk-dimension',
    'recommendation',
    'rule-prop',
  ),
  requiredSourceTypes: freezeTypes('finding', 'evidence', 'rule'),
  excludedSourceTypes: freezeTypes('report-meta'),
  density: Object.freeze({
    minCitationsPerSentence: 1,
    minCitationsPerParagraph: 2,
    maxCitationsPerSentence: 0,
  }),
  showInlineCitations: true,
  showCitationsSection: true,
});

/** Citation policy for **expert** mode. */
export const EXPERT_CITATION_POLICY: ModeCitationPolicy = Object.freeze({
  mode: 'expert' as ExplanationMode,
  allowedSourceTypes: freezeTypes(
    'finding',
    'evidence',
    'rule',
    'artifact',
    'behavior',
    'chain',
    'risk-dimension',
    'recommendation',
    'rule-prop',
    'report-meta',
  ),
  requiredSourceTypes: freezeTypes('finding', 'evidence', 'rule', 'artifact'),
  excludedSourceTypes: freezeTypes(),
  density: Object.freeze({
    minCitationsPerSentence: 1,
    minCitationsPerParagraph: 3,
    maxCitationsPerSentence: 0,
  }),
  showInlineCitations: true,
  showCitationsSection: true,
});

// ═══════════════════════════════════════════════════════════════════════════
// Registry & Accessors
// ═══════════════════════════════════════════════════════════════════════════

/** All citation policies indexed by mode. Deep-frozen. */
export const CITATION_POLICIES: Readonly<Record<ExplanationMode, ModeCitationPolicy>> =
  Object.freeze({
    simple: SIMPLE_CITATION_POLICY,
    technical: TECHNICAL_CITATION_POLICY,
    expert: EXPERT_CITATION_POLICY,
  });

/**
 * Get the citation policy for a given mode.
 *
 * @param mode - The explanation mode.
 * @returns The frozen citation policy for that mode.
 */
export function getCitationPolicy(mode: ExplanationMode): ModeCitationPolicy {
  return CITATION_POLICIES[mode];
}

/**
 * Check whether a citation source type is allowed in the given mode.
 *
 * @param mode - The explanation mode.
 * @param sourceType - The citation source type to check.
 * @returns `true` if the source type is allowed in this mode.
 */
export function isSourceTypeAllowed(
  mode: ExplanationMode,
  sourceType: CitationSourceType,
): boolean {
  const policy = CITATION_POLICIES[mode];
  return policy.allowedSourceTypes.includes(sourceType);
}

/**
 * Check whether a citation source type is required in the given mode.
 *
 * @param mode - The explanation mode.
 * @param sourceType - The citation source type to check.
 * @returns `true` if the source type is required in this mode.
 */
export function isSourceTypeRequired(
  mode: ExplanationMode,
  sourceType: CitationSourceType,
): boolean {
  const policy = CITATION_POLICIES[mode];
  return policy.requiredSourceTypes.includes(sourceType);
}

/**
 * Check whether a citation source type is excluded in the given mode.
 *
 * @param mode - The explanation mode.
 * @param sourceType - The citation source type to check.
 * @returns `true` if the source type is excluded in this mode.
 */
export function isSourceTypeExcluded(
  mode: ExplanationMode,
  sourceType: CitationSourceType,
): boolean {
  const policy = CITATION_POLICIES[mode];
  return policy.excludedSourceTypes.includes(sourceType);
}

/**
 * Get the set of citation source types that are allowed in ALL modes.
 *
 * These are the universal citation types that every mode can use.
 *
 * @returns The array of universally allowed source types.
 */
export function getUniversalSourceTypes(): readonly CitationSourceType[] {
  return freezeTypes('finding', 'evidence', 'rule', 'artifact');
}

/**
 * Get the set of citation source types that are ONLY available in expert mode.
 *
 * @returns The array of expert-only source types.
 */
export function getExpertOnlySourceTypes(): readonly CitationSourceType[] {
  return freezeTypes('report-meta');
}

/**
 * Calculate the minimum number of citations required for a text of
 * a given length in the given mode.
 *
 * Uses a simple heuristic: at least `minCitationsPerParagraph` per paragraph,
 * scaled by the number of paragraphs.
 *
 * @param mode - The explanation mode.
 * @param paragraphCount - The number of paragraphs in the text.
 * @returns The minimum number of citations required.
 */
export function getMinimumCitations(mode: ExplanationMode, paragraphCount: number): number {
  const policy = CITATION_POLICIES[mode];
  const safeCount = Math.max(0, Math.floor(paragraphCount));
  return Math.max(
    policy.density.minCitationsPerParagraph,
    safeCount * policy.density.minCitationsPerParagraph,
  );
}
