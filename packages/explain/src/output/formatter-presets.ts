/**
 * Formatter presets — preset configuration objects for each explanation mode.
 *
 * Each preset provides a pre-configured ModeFormatConfig for simple, technical,
 * and expert modes, plus a helper to look up presets by ExplanationMode.
 *
 * Presets are immutable and purely presentational — they never modify the
 * evidence, citations, or structural content of an explanation.
 *
 * @module @veris/explain/output/formatter-presets
 */

import type { ExplanationMode } from '../types/explanation.js';

import type { ModeFormatConfig } from './formatter-options.js';

// ═══════════════════════════════════════════════════════════════════════════
// Presets
// ═══════════════════════════════════════════════════════════════════════════

/** Simple mode preset — one paragraph, one citation per claim, no jargon. */
export const SIMPLE_PRESET: ModeFormatConfig = {
  maxSentences: 5,
  maxParagraphs: 1,
  allowTechnicalJargon: false,
  citationsPerClaim: 1,
  showSeverity: false,
  showConfidence: false,
  showTraceability: false,
  showSourceLocations: false,
  showRecommendations: false,
  showDisclaimer: true,
  showSummaryHeading: false,
  showEvidenceDetails: false,
  showRuleDetails: false,
  showRiskContext: false,
  showReportMeta: false,
};

/** Technical mode preset — multiple paragraphs, all citations, technical details. */
export const TECHNICAL_PRESET: ModeFormatConfig = {
  maxSentences: 0,
  maxParagraphs: 3,
  allowTechnicalJargon: true,
  citationsPerClaim: 0,
  showSeverity: true,
  showConfidence: true,
  showTraceability: false,
  showSourceLocations: true,
  showRecommendations: true,
  showDisclaimer: true,
  showSummaryHeading: true,
  showEvidenceDetails: true,
  showRuleDetails: true,
  showRiskContext: true,
  showReportMeta: false,
};

/** Expert mode preset — full traceability chain, all evidence, source locations. */
export const EXPERT_PRESET: ModeFormatConfig = {
  maxSentences: 0,
  maxParagraphs: 5,
  allowTechnicalJargon: true,
  citationsPerClaim: 0,
  showSeverity: true,
  showConfidence: true,
  showTraceability: true,
  showSourceLocations: true,
  showRecommendations: true,
  showDisclaimer: true,
  showSummaryHeading: true,
  showEvidenceDetails: true,
  showRuleDetails: true,
  showRiskContext: true,
  showReportMeta: true,
};

// ═══════════════════════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════════════════════

/** All presets indexed by mode. */
export const PRESETS: Record<ExplanationMode, ModeFormatConfig> = {
  simple: SIMPLE_PRESET,
  technical: TECHNICAL_PRESET,
  expert: EXPERT_PRESET,
};

/** Preset names for human-readable display. */
export const PRESET_NAMES: Record<ExplanationMode, string> = {
  simple: 'Simple',
  technical: 'Technical',
  expert: 'Expert',
};

/** Preset descriptions for human-readable display. */
export const PRESET_DESCRIPTIONS: Record<ExplanationMode, string> = {
  simple: 'One paragraph summary with essential citations only.',
  technical: 'Detailed explanation with evidence and technical context.',
  expert: 'Full traceability chain with all evidence and source locations.',
};

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the preset configuration for a given explanation mode.
 *
 * @param mode - The explanation mode.
 * @returns The preset configuration for that mode.
 */
export function getPreset(mode: ExplanationMode): ModeFormatConfig {
  return PRESETS[mode];
}

/**
 * Check if a mode preset allows technical jargon.
 *
 * @param mode - The explanation mode.
 * @returns Whether technical jargon is allowed.
 */
export function allowsTechnicalJargon(mode: ExplanationMode): boolean {
  return PRESETS[mode].allowTechnicalJargon;
}

/**
 * Get the maximum paragraph count for a mode.
 *
 * @param mode - The explanation mode.
 * @returns Maximum paragraphs (0 = unlimited).
 */
export function getMaxParagraphs(mode: ExplanationMode): number {
  return PRESETS[mode].maxParagraphs;
}

/**
 * Get the maximum sentence count for a mode.
 *
 * @param mode - The explanation mode.
 * @returns Maximum sentences (0 = unlimited).
 */
export function getMaxSentences(mode: ExplanationMode): number {
  return PRESETS[mode].maxSentences;
}
