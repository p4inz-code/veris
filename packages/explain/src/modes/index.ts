/**
 * Explanation Modes module — mode handling, configuration, selection,
 * validation, output options, citation policies, and verbosity rules.
 *
 * ## Module Structure
 *
 * | Module | Purpose |
 * |--------|---------|
 * | `explanation-mode.ts` | Core `ExplanationMode` type, constants, helpers |
 * | `mode-config.ts` | Frozen `ModeConfig` objects per mode |
 * | `mode-selector.ts` | Mode selection, parsing, validation, resolution |
 * | `mode-validator.ts` | Mode configuration validation |
 * | `output-options.ts` | Pre-configured `FormatterOptions` presets per mode |
 * | `citation-policy.ts` | Citation rules and density per mode |
 * | `verbosity.ts` | Tone, depth, and detail rules per mode |
 *
 * ## Integration with Formatter (M6b)
 *
 * The modes module works with the formatter system through:
 * - `ModeConfig.format` provides `ModeFormatConfig` for the `Formatter`
 * - `OUTPUT_OPTIONS_PRESETS` provides complete `FormatterOptions` per mode
 * - `getModeFormat()` bridges mode config to formatter-compatible config
 *
 * All exported objects and functions are PURELY DETERMINISTIC and frozen
 * where applicable.
 *
 * @module @veris/explain/modes
 */

// ── Explanation Mode Core ──

export type { ExplanationMode } from '../types/explanation.js';

export {
  ALL_MODES,
  MODE_LABELS,
  MODE_DESCRIPTIONS,
  MODE_TAGS,
  MODE_DEPTH,
  DEFAULT_MODE,
  isValidMode,
  getDefaultMode,
  compareModes,
  isMoreDetailed,
  isLessDetailed,
  getModeLabel,
  getModeDescription,
  getAllModes,
  parseMode,
} from './explanation-mode.js';

// ── Mode Configuration ──

export type { ModeConfig } from './mode-config.js';
export type { ModeFormatConfig } from '../output/formatter-options.js';

export {
  SIMPLE_MODE_CONFIG,
  TECHNICAL_MODE_CONFIG,
  EXPERT_MODE_CONFIG,
  MODE_CONFIGS,
  getModeConfig,
  getModeFormat,
  createModeConfig,
} from './mode-config.js';

// ── Mode Selector ──

export {
  selectMode,
  resolveMode,
  validateMode,
  selectModeByConfidence,
  isAboveMode,
  isBelowMode,
} from './mode-selector.js';

// ── Mode Validator ──

export type {
  ModeValidationSeverity,
  ModeValidationIssue,
  ModeValidationResult,
} from './mode-validator.js';

export {
  validateModeIdentifier,
  validateModeConfig,
  createValidatedModeConfig,
} from './mode-validator.js';

// ── Output Options ──

export {
  SIMPLE_OUTPUT_OPTIONS,
  TECHNICAL_OUTPUT_OPTIONS,
  EXPERT_OUTPUT_OPTIONS,
  OUTPUT_OPTIONS_PRESETS,
  getOutputOptions,
  mergeOutputOptions,
} from './output-options.js';

// ── Citation Policy ──

export type { CitationDensity, ModeCitationPolicy } from './citation-policy.js';

export {
  SIMPLE_CITATION_POLICY,
  TECHNICAL_CITATION_POLICY,
  EXPERT_CITATION_POLICY,
  CITATION_POLICIES,
  getCitationPolicy,
  isSourceTypeAllowed,
  isSourceTypeRequired,
  isSourceTypeExcluded,
  getUniversalSourceTypes,
  getExpertOnlySourceTypes,
  getMinimumCitations,
} from './citation-policy.js';

// ── Verbosity Rules ──

export type {
  ExplanationTone,
  ExplanationDepth,
  TargetAudience,
  ModeVerbosity,
} from './verbosity.js';

export {
  SIMPLE_VERBOSITY,
  TECHNICAL_VERBOSITY,
  EXPERT_VERBOSITY,
  VERBOSITY_RULES,
  getVerbosity,
  getTone,
  getDepth,
  getAudience,
  describeVerbosity,
} from './verbosity.js';
