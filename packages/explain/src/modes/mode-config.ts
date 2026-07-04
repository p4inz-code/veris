/**
 * Mode configuration — frozen configuration objects for each explanation mode.
 *
 * Each mode configuration defines the structural and presentational behavior
 * for that mode, including sentence/paragraph limits, citation density,
 * and which information panels to show.
 *
 * All configuration objects are **deep-frozen** at creation time to prevent
 * accidental mutation. Every configuration is PURELY DETERMINISTIC — the same
 * mode always produces the same configuration object.
 *
 * These configurations are consumed by the {@link Formatter} to control
 * mode-specific formatting behavior. They integrate with the existing
 * `ModeFormatConfig` type from the formatter system.
 *
 * @module @veris/explain/modes/mode-config
 */

import type { ModeFormatConfig } from '../output/formatter-options.js';
import type { ExplanationMode } from '../types/explanation.js';

// ═══════════════════════════════════════════════════════════════════════════
// ModeConfig — Extended Mode Configuration
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extended mode configuration that augments `ModeFormatConfig` with
 * mode-specific metadata and behavior flags not covered by the formatter.
 */
export interface ModeConfig {
  /** The explanation mode this config targets. */
  readonly mode: ExplanationMode;

  /** The base formatter configuration for this mode. */
  readonly format: ModeFormatConfig;

  /** Whether this mode uses technical or domain-specific jargon. */
  readonly allowJargon: boolean;

  /** Whether this mode includes the full evidence list. */
  readonly showFullEvidence: boolean;

  /** Whether this mode shows the traceability chain. */
  readonly showTraceability: boolean;

  /** Whether this mode includes report-level metadata. */
  readonly showReportMeta: boolean;

  /** Whether this mode includes recommendation summaries. */
  readonly showRecommendations: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Frozen Configuration Objects
// ═══════════════════════════════════════════════════════════════════════════

/** Frozen configuration for **simple** mode. */
export const SIMPLE_MODE_CONFIG: ModeConfig = Object.freeze({
  mode: 'simple',
  format: Object.freeze({
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
  }),
  allowJargon: false,
  showFullEvidence: false,
  showTraceability: false,
  showReportMeta: false,
  showRecommendations: false,
});

/** Frozen configuration for **technical** mode. */
export const TECHNICAL_MODE_CONFIG: ModeConfig = Object.freeze({
  mode: 'technical',
  format: Object.freeze({
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
  }),
  allowJargon: true,
  showFullEvidence: true,
  showTraceability: false,
  showReportMeta: false,
  showRecommendations: true,
});

/** Frozen configuration for **expert** mode. */
export const EXPERT_MODE_CONFIG: ModeConfig = Object.freeze({
  mode: 'expert',
  format: Object.freeze({
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
  }),
  allowJargon: true,
  showFullEvidence: true,
  showTraceability: true,
  showReportMeta: true,
  showRecommendations: true,
});

// ═══════════════════════════════════════════════════════════════════════════
// Registry & Helpers
// ═══════════════════════════════════════════════════════════════════════════

/** All mode configurations indexed by mode. Deep-frozen. */
export const MODE_CONFIGS: Readonly<Record<ExplanationMode, ModeConfig>> = Object.freeze({
  simple: SIMPLE_MODE_CONFIG,
  technical: TECHNICAL_MODE_CONFIG,
  expert: EXPERT_MODE_CONFIG,
});

/**
 * Get the configuration for a given explanation mode.
 *
 * @param mode - The explanation mode.
 * @returns The frozen mode configuration.
 */
export function getModeConfig(mode: ExplanationMode): ModeConfig {
  return MODE_CONFIGS[mode];
}

/**
 * Get the `ModeFormatConfig` (formatter-compatible) for a given mode.
 *
 * This bridges the modes module with the formatter system. The returned
 * config can be passed directly to `Formatter` or merged into
 * `FormatterOptions.modes`.
 *
 * @param mode - The explanation mode.
 * @returns The formatter-compatible mode format configuration.
 */
export function getModeFormat(mode: ExplanationMode): ModeFormatConfig {
  return MODE_CONFIGS[mode].format;
}

/**
 * Create a `ModeConfig` with optional overrides.
 *
 * The returned object is NOT frozen — callers should freeze it themselves
 * if immutability is required. This is useful for creating custom mode
 * configurations that extend the built-in presets.
 *
 * @param mode - The explanation mode.
 * @param overrides - Optional fields to override in the base configuration.
 * @returns A new mode configuration with overrides applied.
 */
export function createModeConfig(
  mode: ExplanationMode,
  overrides?: Partial<ModeConfig>,
): ModeConfig {
  const base = MODE_CONFIGS[mode];
  if (!overrides) {
    return { ...base, format: { ...base.format } };
  }
  return {
    ...base,
    ...overrides,
    format: { ...base.format, ...overrides.format },
  };
}

export type { ModeFormatConfig };
