/**
 * Tests for M8 Explanation Modes module.
 *
 * Verifies:
 * - Mode selection and parsing
 * - Invalid mode handling
 * - Configuration generation and validation
 * - Citation policies per mode
 * - Verbosity rules per mode
 * - Formatter integration
 * - Determinism (100-run)
 * - Edge cases
 */

import { describe, it, expect } from 'vitest';

// ── Explanation Mode Core ──

import {
  isValidMode,
  getDefaultMode,
  compareModes,
  isMoreDetailed,
  isLessDetailed,
  getModeLabel,
  getModeDescription,
  getAllModes,
  parseMode,
  ALL_MODES,
  MODE_LABELS,
  MODE_DESCRIPTIONS,
  MODE_TAGS,
  MODE_DEPTH,
  DEFAULT_MODE,
} from '../../../src/modes/explanation-mode.js';

// ── Mode Config ──

import {
  SIMPLE_MODE_CONFIG,
  TECHNICAL_MODE_CONFIG,
  EXPERT_MODE_CONFIG,
  MODE_CONFIGS,
  getModeConfig,
  getModeFormat,
  createModeConfig,
} from '../../../src/modes/mode-config.js';
import type { ModeConfig } from '../../../src/modes/mode-config.js';

// ── Mode Selector ──

import {
  selectMode,
  resolveMode,
  validateMode,
  selectModeByConfidence,
  isAboveMode,
  isBelowMode,
} from '../../../src/modes/mode-selector.js';

// ── Mode Validator ──

import {
  validateModeIdentifier,
  validateModeConfig,
  createValidatedModeConfig,
} from '../../../src/modes/mode-validator.js';

// ── Output Options ──

import {
  SIMPLE_OUTPUT_OPTIONS,
  TECHNICAL_OUTPUT_OPTIONS,
  EXPERT_OUTPUT_OPTIONS,
  OUTPUT_OPTIONS_PRESETS,
  getOutputOptions,
  mergeOutputOptions,
} from '../../../src/modes/output-options.js';

// ── Citation Policy ──

import {
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
} from '../../../src/modes/citation-policy.js';

// ── Verbosity ──

import {
  SIMPLE_VERBOSITY,
  TECHNICAL_VERBOSITY,
  EXPERT_VERBOSITY,
  VERBOSITY_RULES,
  getVerbosity,
  getTone,
  getDepth,
  getAudience,
  describeVerbosity,
} from '../../../src/modes/verbosity.js';

// ── Formatter Integration ──

import { Formatter } from '../../../src/output/formatter.js';
import { DEFAULT_FORMATTER_OPTIONS } from '../../../src/output/formatter-options.js';
import type { ExplanationMode } from '../../../src/types/explanation.js';

// ═══════════════════════════════════════════════════════════════════════════
// 1. Mode Selection & Parsing
// ═══════════════════════════════════════════════════════════════════════════

describe('explanation-mode.ts — Mode type handling', () => {
  describe('isValidMode', () => {
    it('returns true for valid modes', () => {
      expect(isValidMode('simple')).toBe(true);
      expect(isValidMode('technical')).toBe(true);
      expect(isValidMode('expert')).toBe(true);
    });

    it('returns false for invalid modes', () => {
      expect(isValidMode('')).toBe(false);
      expect(isValidMode('invalid')).toBe(false);
      expect(isValidMode('SIMPLE')).toBe(false);
      expect(isValidMode('simple ')).toBe(false);
      expect(isValidMode('  technical')).toBe(false);
      expect(isValidMode('simple technical')).toBe(false);
    });

    it('returns false for null/undefined-like values', () => {
      expect(isValidMode(null as unknown as string)).toBe(false);
      expect(isValidMode(undefined as unknown as string)).toBe(false);
    });

    it('acts as a type guard', () => {
      const value: string = 'simple';
      if (isValidMode(value)) {
        // TypeScript should narrow to ExplanationMode
        const mode: ExplanationMode = value;
        expect(mode).toBe('simple');
      }
    });
  });

  describe('getDefaultMode', () => {
    it("returns 'technical'", () => {
      expect(getDefaultMode()).toBe('technical');
    });
  });

  describe('DEFAULT_MODE', () => {
    it("is 'technical'", () => {
      expect(DEFAULT_MODE).toBe('technical');
    });
  });

  describe('ALL_MODES', () => {
    it('contains exactly 3 modes in order', () => {
      expect(ALL_MODES).toEqual(['simple', 'technical', 'expert']);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(ALL_MODES)).toBe(true);
    });
  });

  describe('MODE_DEPTH', () => {
    it('assigns correct depth values', () => {
      expect(MODE_DEPTH.simple).toBe(1);
      expect(MODE_DEPTH.technical).toBe(2);
      expect(MODE_DEPTH.expert).toBe(3);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(MODE_DEPTH)).toBe(true);
    });
  });

  describe('compareModes', () => {
    it('returns negative when a is less detailed than b', () => {
      expect(compareModes('simple', 'expert')).toBeLessThan(0);
      expect(compareModes('simple', 'technical')).toBeLessThan(0);
      expect(compareModes('technical', 'expert')).toBeLessThan(0);
    });

    it('returns positive when a is more detailed than b', () => {
      expect(compareModes('expert', 'simple')).toBeGreaterThan(0);
      expect(compareModes('technical', 'simple')).toBeGreaterThan(0);
      expect(compareModes('expert', 'technical')).toBeGreaterThan(0);
    });

    it('returns zero when modes are the same', () => {
      expect(compareModes('simple', 'simple')).toBe(0);
      expect(compareModes('technical', 'technical')).toBe(0);
      expect(compareModes('expert', 'expert')).toBe(0);
    });
  });

  describe('isMoreDetailed / isLessDetailed', () => {
    it('correctly compares mode detail', () => {
      expect(isMoreDetailed('expert', 'simple')).toBe(true);
      expect(isMoreDetailed('technical', 'simple')).toBe(true);
      expect(isMoreDetailed('simple', 'expert')).toBe(false);
      expect(isMoreDetailed('simple', 'technical')).toBe(false);

      expect(isLessDetailed('simple', 'expert')).toBe(true);
      expect(isLessDetailed('simple', 'technical')).toBe(true);
      expect(isLessDetailed('expert', 'simple')).toBe(false);
    });
  });

  describe('getModeLabel', () => {
    it('returns human-readable labels', () => {
      expect(getModeLabel('simple')).toBe('Simple');
      expect(getModeLabel('technical')).toBe('Technical');
      expect(getModeLabel('expert')).toBe('Expert');
    });
  });

  describe('getModeDescription', () => {
    it('returns descriptions', () => {
      expect(getModeDescription('simple')).toBeTruthy();
      expect(getModeDescription('technical')).toBeTruthy();
      expect(getModeDescription('expert')).toBeTruthy();
    });
  });

  describe('getAllModes', () => {
    it('returns all 3 modes', () => {
      const modes = getAllModes();
      expect(modes).toHaveLength(3);
      expect(modes).toContain('simple');
      expect(modes).toContain('technical');
      expect(modes).toContain('expert');
    });

    it('returns the same frozen array each time', () => {
      expect(getAllModes()).toBe(ALL_MODES);
    });
  });

  describe('parseMode', () => {
    it('parses valid mode strings', () => {
      expect(parseMode('simple')).toBe('simple');
      expect(parseMode('technical')).toBe('technical');
      expect(parseMode('expert')).toBe('expert');
    });

    it('returns default for invalid strings', () => {
      expect(parseMode('invalid')).toBe('technical');
      expect(parseMode('')).toBe('technical');
      expect(parseMode('EXPERT')).toBe('technical');
    });

    it('accepts custom default', () => {
      expect(parseMode('invalid', 'simple')).toBe('simple');
      expect(parseMode('expert', 'simple')).toBe('expert');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. Mode Selection
// ═══════════════════════════════════════════════════════════════════════════

describe('mode-selector.ts — Mode selection', () => {
  describe('selectMode', () => {
    it('selects valid mode strings', () => {
      expect(selectMode('simple')).toBe('simple');
      expect(selectMode('technical')).toBe('technical');
      expect(selectMode('expert')).toBe('expert');
    });

    it('falls back to default for invalid strings', () => {
      expect(selectMode('invalid')).toBe('technical');
      expect(selectMode('SIMPLE')).toBe('technical');
      expect(selectMode('')).toBe('technical');
    });

    it('trims whitespace', () => {
      expect(selectMode('  simple  ')).toBe('simple');
      expect(selectMode('\ttechnical\n')).toBe('technical');
    });

    it('accepts custom default', () => {
      expect(selectMode('invalid', 'simple')).toBe('simple');
      expect(selectMode('', 'expert')).toBe('expert');
    });
  });

  describe('resolveMode', () => {
    it('resolves valid ExplanationMode values', () => {
      expect(resolveMode('simple')).toBe('simple');
      expect(resolveMode('technical')).toBe('technical');
      expect(resolveMode('expert')).toBe('expert');
    });

    it('returns default for undefined/null', () => {
      expect(resolveMode(undefined)).toBe('technical');
      expect(resolveMode(null)).toBe('technical');
    });

    it('returns default for invalid mode strings', () => {
      expect(resolveMode('invalid')).toBe('technical');
    });

    it('accepts custom default', () => {
      expect(resolveMode(undefined, 'simple')).toBe('simple');
      expect(resolveMode('invalid', 'expert')).toBe('expert');
    });
  });

  describe('validateMode', () => {
    it('returns valid mode for correct input', () => {
      expect(validateMode('simple')).toBe('simple');
      expect(validateMode('technical')).toBe('technical');
      expect(validateMode('expert')).toBe('expert');
    });

    it('throws TypeError for invalid input', () => {
      expect(() => validateMode('invalid')).toThrow(TypeError);
      expect(() => validateMode('')).toThrow(TypeError);
      expect(() => validateMode('SIMPLE')).toThrow(TypeError);
    });

    it('includes valid modes in error message', () => {
      expect(() => validateMode('bad')).toThrow(/simple/);
      expect(() => validateMode('bad')).toThrow(/technical/);
      expect(() => validateMode('bad')).toThrow(/expert/);
    });
  });

  describe('selectModeByConfidence', () => {
    it('returns requested mode for high confidence (>= 0.9)', () => {
      expect(selectModeByConfidence('expert', 0.95)).toBe('expert');
      expect(selectModeByConfidence('technical', 0.9)).toBe('technical');
      expect(selectModeByConfidence('simple', 1.0)).toBe('simple');
    });

    it('caps at technical for moderate confidence (0.7 - 0.89)', () => {
      expect(selectModeByConfidence('expert', 0.8)).toBe('technical');
      expect(selectModeByConfidence('technical', 0.75)).toBe('technical');
    });

    it('returns simple for low confidence (< 0.7)', () => {
      expect(selectModeByConfidence('expert', 0.5)).toBe('simple');
      expect(selectModeByConfidence('technical', 0.3)).toBe('simple');
      expect(selectModeByConfidence('simple', 0.0)).toBe('simple');
    });

    it('clamps confidence to valid range', () => {
      expect(selectModeByConfidence('expert', 2.0)).toBe('expert');
      expect(selectModeByConfidence('expert', -1.0)).toBe('simple');
    });
  });

  describe('isAboveMode / isBelowMode', () => {
    it('isAboveMode returns true for more detailed modes', () => {
      expect(isAboveMode('expert', 'simple')).toBe(true);
      expect(isAboveMode('technical', 'simple')).toBe(true);
    });

    it('isAboveMode returns false for less detailed modes', () => {
      expect(isAboveMode('simple', 'expert')).toBe(false);
      expect(isAboveMode('simple', 'technical')).toBe(false);
    });

    it('isBelowMode returns true for less detailed modes', () => {
      expect(isBelowMode('simple', 'expert')).toBe(true);
      expect(isBelowMode('simple', 'technical')).toBe(true);
    });

    it('returns false for equal modes', () => {
      expect(isAboveMode('simple', 'simple')).toBe(false);
      expect(isBelowMode('simple', 'simple')).toBe(false);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Mode Configuration
// ═══════════════════════════════════════════════════════════════════════════

describe('mode-config.ts — Mode configuration', () => {
  describe('SIMPLE_MODE_CONFIG', () => {
    it('has correct mode', () => {
      expect(SIMPLE_MODE_CONFIG.mode).toBe('simple');
    });

    it('has simple mode format settings', () => {
      expect(SIMPLE_MODE_CONFIG.format.maxSentences).toBe(5);
      expect(SIMPLE_MODE_CONFIG.format.maxParagraphs).toBe(1);
      expect(SIMPLE_MODE_CONFIG.format.allowTechnicalJargon).toBe(false);
      expect(SIMPLE_MODE_CONFIG.format.citationsPerClaim).toBe(1);
      expect(SIMPLE_MODE_CONFIG.format.showSeverity).toBe(false);
      expect(SIMPLE_MODE_CONFIG.format.showConfidence).toBe(false);
      expect(SIMPLE_MODE_CONFIG.format.showTraceability).toBe(false);
      expect(SIMPLE_MODE_CONFIG.format.showDisclaimer).toBe(true);
    });

    it('has correct mode-level flags', () => {
      expect(SIMPLE_MODE_CONFIG.allowJargon).toBe(false);
      expect(SIMPLE_MODE_CONFIG.showFullEvidence).toBe(false);
      expect(SIMPLE_MODE_CONFIG.showTraceability).toBe(false);
      expect(SIMPLE_MODE_CONFIG.showReportMeta).toBe(false);
      expect(SIMPLE_MODE_CONFIG.showRecommendations).toBe(false);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(SIMPLE_MODE_CONFIG)).toBe(true);
      expect(Object.isFrozen(SIMPLE_MODE_CONFIG.format)).toBe(true);
    });
  });

  describe('TECHNICAL_MODE_CONFIG', () => {
    it('has correct mode', () => {
      expect(TECHNICAL_MODE_CONFIG.mode).toBe('technical');
    });

    it('has technical mode format settings', () => {
      expect(TECHNICAL_MODE_CONFIG.format.maxSentences).toBe(0);
      expect(TECHNICAL_MODE_CONFIG.format.maxParagraphs).toBe(3);
      expect(TECHNICAL_MODE_CONFIG.format.allowTechnicalJargon).toBe(true);
      expect(TECHNICAL_MODE_CONFIG.format.showSeverity).toBe(true);
      expect(TECHNICAL_MODE_CONFIG.format.showSourceLocations).toBe(true);
    });

    it('has correct mode-level flags', () => {
      expect(TECHNICAL_MODE_CONFIG.allowJargon).toBe(true);
      expect(TECHNICAL_MODE_CONFIG.showFullEvidence).toBe(true);
      expect(TECHNICAL_MODE_CONFIG.showRecommendations).toBe(true);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(TECHNICAL_MODE_CONFIG)).toBe(true);
    });
  });

  describe('EXPERT_MODE_CONFIG', () => {
    it('has correct mode', () => {
      expect(EXPERT_MODE_CONFIG.mode).toBe('expert');
    });

    it('has expert mode format settings', () => {
      expect(EXPERT_MODE_CONFIG.format.maxParagraphs).toBe(5);
      expect(EXPERT_MODE_CONFIG.format.showTraceability).toBe(true);
      expect(EXPERT_MODE_CONFIG.format.showSourceLocations).toBe(true);
      expect(EXPERT_MODE_CONFIG.format.showReportMeta).toBe(true);
    });

    it('has correct mode-level flags', () => {
      expect(EXPERT_MODE_CONFIG.allowJargon).toBe(true);
      expect(EXPERT_MODE_CONFIG.showFullEvidence).toBe(true);
      expect(EXPERT_MODE_CONFIG.showTraceability).toBe(true);
      expect(EXPERT_MODE_CONFIG.showReportMeta).toBe(true);
      expect(EXPERT_MODE_CONFIG.showRecommendations).toBe(true);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(EXPERT_MODE_CONFIG)).toBe(true);
    });
  });

  describe('MODE_CONFIGS', () => {
    it('contains all three mode configs', () => {
      expect(MODE_CONFIGS.simple).toBe(SIMPLE_MODE_CONFIG);
      expect(MODE_CONFIGS.technical).toBe(TECHNICAL_MODE_CONFIG);
      expect(MODE_CONFIGS.expert).toBe(EXPERT_MODE_CONFIG);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(MODE_CONFIGS)).toBe(true);
    });
  });

  describe('getModeConfig', () => {
    it('returns correct config for each mode', () => {
      expect(getModeConfig('simple')).toBe(SIMPLE_MODE_CONFIG);
      expect(getModeConfig('technical')).toBe(TECHNICAL_MODE_CONFIG);
      expect(getModeConfig('expert')).toBe(EXPERT_MODE_CONFIG);
    });
  });

  describe('getModeFormat', () => {
    it('returns ModeFormatConfig for each mode', () => {
      const simpleFormat = getModeFormat('simple');
      expect(simpleFormat.maxSentences).toBe(5);
      expect(simpleFormat.maxParagraphs).toBe(1);

      const techFormat = getModeFormat('technical');
      expect(techFormat.maxParagraphs).toBe(3);

      const expertFormat = getModeFormat('expert');
      expect(expertFormat.maxParagraphs).toBe(5);
    });
  });

  describe('createModeConfig', () => {
    it('creates a copy of the base config', () => {
      const config = createModeConfig('simple');
      expect(config.mode).toBe('simple');
      expect(config.format.maxSentences).toBe(5);
      // Should not be the same reference
      expect(config).not.toBe(SIMPLE_MODE_CONFIG);
      expect(config.format).not.toBe(SIMPLE_MODE_CONFIG.format);
    });

    it('applies overrides', () => {
      const config = createModeConfig('simple', {
        allowJargon: true,
        format: { maxSentences: 3 },
      });
      expect(config.allowJargon).toBe(true);
      expect(config.format.maxSentences).toBe(3);
      // Other fields should remain
      expect(config.format.maxParagraphs).toBe(1);
    });

    it('returns a mutable copy when no overrides', () => {
      const config = createModeConfig('simple');
      // Should not throw since it's not frozen
      expect(() => {
        const mutable = config as { mode: string };
        mutable.mode = 'test';
      }).not.toThrow();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Mode Validation
// ═══════════════════════════════════════════════════════════════════════════

describe('mode-validator.ts — Mode validation', () => {
  describe('validateModeIdentifier', () => {
    it('validates correct mode identifiers', () => {
      expect(validateModeIdentifier('simple').valid).toBe(true);
      expect(validateModeIdentifier('technical').valid).toBe(true);
      expect(validateModeIdentifier('expert').valid).toBe(true);
    });

    it('rejects invalid mode identifiers', () => {
      expect(validateModeIdentifier('').valid).toBe(false);
      expect(validateModeIdentifier('invalid').valid).toBe(false);
      expect(validateModeIdentifier('SIMPLE').valid).toBe(false);
    });

    it('sets mode on success', () => {
      const result = validateModeIdentifier('simple');
      expect(result.mode).toBe('simple');
    });

    it('does not set mode on failure', () => {
      const result = validateModeIdentifier('invalid');
      expect(result.mode).toBeUndefined();
    });
  });

  describe('validateModeConfig', () => {
    it('validates a complete valid config', () => {
      const result = validateModeConfig({
        mode: 'simple',
        allowJargon: false,
        showFullEvidence: false,
        showTraceability: false,
        showReportMeta: false,
        showRecommendations: false,
      });
      expect(result.valid).toBe(true);
      expect(result.mode).toBe('simple');
    });

    it('validates format sub-object', () => {
      const result = validateModeConfig({
        mode: 'technical',
        format: {
          maxSentences: 0,
          maxParagraphs: 3,
          citationsPerClaim: 0,
          allowTechnicalJargon: true,
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
        },
        allowJargon: true,
        showFullEvidence: true,
        showTraceability: false,
        showReportMeta: false,
        showRecommendations: true,
      });
      expect(result.valid).toBe(true);
    });

    it('rejects config with missing mode', () => {
      const result = validateModeConfig({});
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'MODE_MISSING')).toBe(true);
    });

    it('rejects config with invalid mode', () => {
      const result = validateModeConfig({ mode: 'invalid' });
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'MODE_INVALID')).toBe(true);
    });

    it('rejects format with out-of-range values', () => {
      const result = validateModeConfig({
        mode: 'simple',
        format: { maxSentences: 200 },
      });
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.code === 'MAXSENTENCES_OUT_OF_RANGE')).toBe(true);
    });

    it('rejects format with non-numeric values', () => {
      const result = validateModeConfig({
        mode: 'simple',
        format: { maxSentences: 'many' },
      });
      expect(result.valid).toBe(false);
    });

    it('rejects non-boolean mode flags', () => {
      const result = validateModeConfig({
        mode: 'simple',
        allowJargon: 'yes' as unknown as boolean,
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('createValidatedModeConfig', () => {
    it('creates a valid config from defaults', () => {
      const config = createValidatedModeConfig('simple');
      expect(config.mode).toBe('simple');
    });

    it('applies overrides correctly', () => {
      const config = createValidatedModeConfig('expert', {
        allowJargon: false,
      });
      expect(config.allowJargon).toBe(false);
    });

    it('throws TypeError for invalid config', () => {
      expect(() =>
        createValidatedModeConfig('simple', {
          allowJargon: 'nope' as unknown as boolean,
        }),
      ).toThrow(TypeError);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. Output Options
// ═══════════════════════════════════════════════════════════════════════════

describe('output-options.ts — Output option presets', () => {
  describe('SIMPLE_OUTPUT_OPTIONS', () => {
    it('has numbered inline citation style', () => {
      expect(SIMPLE_OUTPUT_OPTIONS.citations.inlineStyle).toBe('numbered');
    });

    it('has compact section style', () => {
      expect(SIMPLE_OUTPUT_OPTIONS.citations.sectionStyle).toBe('compact');
    });

    it('is frozen', () => {
      expect(Object.isFrozen(SIMPLE_OUTPUT_OPTIONS)).toBe(true);
    });

    it('includes simple mode format config', () => {
      expect(SIMPLE_OUTPUT_OPTIONS.modes.simple.maxSentences).toBe(5);
    });
  });

  describe('TECHNICAL_OUTPUT_OPTIONS', () => {
    it('has numbered inline citation style', () => {
      expect(TECHNICAL_OUTPUT_OPTIONS.citations.inlineStyle).toBe('numbered');
    });

    it('has list section style', () => {
      expect(TECHNICAL_OUTPUT_OPTIONS.citations.sectionStyle).toBe('list');
    });

    it('shows verification status', () => {
      expect(TECHNICAL_OUTPUT_OPTIONS.citations.showVerificationStatus).toBe(true);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(TECHNICAL_OUTPUT_OPTIONS)).toBe(true);
    });
  });

  describe('EXPERT_OUTPUT_OPTIONS', () => {
    it('has bracketed inline citation style', () => {
      expect(EXPERT_OUTPUT_OPTIONS.citations.inlineStyle).toBe('bracketed');
    });

    it('has table section style', () => {
      expect(EXPERT_OUTPUT_OPTIONS.citations.sectionStyle).toBe('table');
    });

    it('has no paragraph wrapping', () => {
      expect(EXPERT_OUTPUT_OPTIONS.paragraphs.maxWidth).toBe(0);
    });

    it('preserves line breaks', () => {
      expect(EXPERT_OUTPUT_OPTIONS.paragraphs.preserveLineBreaks).toBe(true);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(EXPERT_OUTPUT_OPTIONS)).toBe(true);
    });
  });

  describe('OUTPUT_OPTIONS_PRESETS', () => {
    it('contains all three presets', () => {
      expect(OUTPUT_OPTIONS_PRESETS.simple).toBe(SIMPLE_OUTPUT_OPTIONS);
      expect(OUTPUT_OPTIONS_PRESETS.technical).toBe(TECHNICAL_OUTPUT_OPTIONS);
      expect(OUTPUT_OPTIONS_PRESETS.expert).toBe(EXPERT_OUTPUT_OPTIONS);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(OUTPUT_OPTIONS_PRESETS)).toBe(true);
    });
  });

  describe('getOutputOptions', () => {
    it('returns correct preset for each mode', () => {
      expect(getOutputOptions('simple')).toBe(SIMPLE_OUTPUT_OPTIONS);
      expect(getOutputOptions('technical')).toBe(TECHNICAL_OUTPUT_OPTIONS);
      expect(getOutputOptions('expert')).toBe(EXPERT_OUTPUT_OPTIONS);
    });
  });

  describe('mergeOutputOptions', () => {
    it('returns a copy without overrides', () => {
      const merged = mergeOutputOptions('simple');
      expect(merged.modes.simple.maxSentences).toBe(5);
      expect(merged).not.toBe(SIMPLE_OUTPUT_OPTIONS);
    });

    it('applies overrides', () => {
      const merged = mergeOutputOptions('technical', {
        normalizeWhitespace: false,
      });
      expect(merged.normalizeWhitespace).toBe(false);
      // Base values preserved
      expect(merged.citations.inlineStyle).toBe('numbered');
    });

    it('merges mode sub-configs', () => {
      const merged = mergeOutputOptions('expert', {
        modes: { simple: { maxSentences: 2 } },
      });
      expect(merged.modes.simple.maxSentences).toBe(2);
      expect(merged.modes.expert.maxParagraphs).toBe(5);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. Citation Policy
// ═══════════════════════════════════════════════════════════════════════════

describe('citation-policy.ts — Citation policy per mode', () => {
  describe('SIMPLE_CITATION_POLICY', () => {
    it('allows finding, evidence, rule, artifact', () => {
      const types = SIMPLE_CITATION_POLICY.allowedSourceTypes;
      expect(types).toContain('finding');
      expect(types).toContain('evidence');
      expect(types).toContain('rule');
      expect(types).toContain('artifact');
    });

    it('requires finding and evidence', () => {
      expect(SIMPLE_CITATION_POLICY.requiredSourceTypes).toContain('finding');
      expect(SIMPLE_CITATION_POLICY.requiredSourceTypes).toContain('evidence');
    });

    it('excludes complex source types', () => {
      expect(SIMPLE_CITATION_POLICY.excludedSourceTypes).toContain('chain');
      expect(SIMPLE_CITATION_POLICY.excludedSourceTypes).toContain('risk-dimension');
      expect(SIMPLE_CITATION_POLICY.excludedSourceTypes).toContain('report-meta');
    });

    it('has density: 1 citation per sentence min, 2 max', () => {
      expect(SIMPLE_CITATION_POLICY.density.minCitationsPerSentence).toBe(1);
      expect(SIMPLE_CITATION_POLICY.density.maxCitationsPerSentence).toBe(2);
    });

    it('is frozen', () => {
      expect(Object.isFrozen(SIMPLE_CITATION_POLICY)).toBe(true);
    });
  });

  describe('TECHNICAL_CITATION_POLICY', () => {
    it('allows most source types', () => {
      expect(TECHNICAL_CITATION_POLICY.allowedSourceTypes).toContain('finding');
      expect(TECHNICAL_CITATION_POLICY.allowedSourceTypes).toContain('chain');
      expect(TECHNICAL_CITATION_POLICY.allowedSourceTypes).toContain('risk-dimension');
    });

    it('excludes report-meta', () => {
      expect(TECHNICAL_CITATION_POLICY.excludedSourceTypes).toContain('report-meta');
    });

    it('is frozen', () => {
      expect(Object.isFrozen(TECHNICAL_CITATION_POLICY)).toBe(true);
    });
  });

  describe('EXPERT_CITATION_POLICY', () => {
    it('allows all 10 source types', () => {
      expect(EXPERT_CITATION_POLICY.allowedSourceTypes).toHaveLength(10);
    });

    it('has no excluded types', () => {
      expect(EXPERT_CITATION_POLICY.excludedSourceTypes).toHaveLength(0);
    });

    it('requires finding, evidence, rule, artifact', () => {
      expect(EXPERT_CITATION_POLICY.requiredSourceTypes).toContain('finding');
      expect(EXPERT_CITATION_POLICY.requiredSourceTypes).toContain('evidence');
      expect(EXPERT_CITATION_POLICY.requiredSourceTypes).toContain('rule');
      expect(EXPERT_CITATION_POLICY.requiredSourceTypes).toContain('artifact');
    });

    it('is frozen', () => {
      expect(Object.isFrozen(EXPERT_CITATION_POLICY)).toBe(true);
    });
  });

  describe('getCitationPolicy', () => {
    it('returns correct policy for each mode', () => {
      expect(getCitationPolicy('simple')).toBe(SIMPLE_CITATION_POLICY);
      expect(getCitationPolicy('technical')).toBe(TECHNICAL_CITATION_POLICY);
      expect(getCitationPolicy('expert')).toBe(EXPERT_CITATION_POLICY);
    });
  });

  describe('isSourceTypeAllowed', () => {
    it('returns true for allowed types', () => {
      expect(isSourceTypeAllowed('simple', 'finding')).toBe(true);
      expect(isSourceTypeAllowed('simple', 'evidence')).toBe(true);
    });

    it('returns false for excluded types', () => {
      expect(isSourceTypeAllowed('simple', 'report-meta')).toBe(false);
      expect(isSourceTypeAllowed('simple', 'chain')).toBe(false);
    });

    it('returns true for all types in expert mode', () => {
      expect(isSourceTypeAllowed('expert', 'finding')).toBe(true);
      expect(isSourceTypeAllowed('expert', 'report-meta')).toBe(true);
    });
  });

  describe('isSourceTypeRequired', () => {
    it('returns true for required types', () => {
      expect(isSourceTypeRequired('simple', 'finding')).toBe(true);
      expect(isSourceTypeRequired('simple', 'evidence')).toBe(true);
    });

    it('returns false for non-required types', () => {
      expect(isSourceTypeRequired('simple', 'rule')).toBe(false);
      expect(isSourceTypeRequired('technical', 'artifact')).toBe(false);
    });
  });

  describe('isSourceTypeExcluded', () => {
    it('returns true for excluded types', () => {
      expect(isSourceTypeExcluded('simple', 'report-meta')).toBe(true);
      expect(isSourceTypeExcluded('technical', 'report-meta')).toBe(true);
    });

    it('returns false for non-excluded types', () => {
      expect(isSourceTypeExcluded('expert', 'report-meta')).toBe(false);
      expect(isSourceTypeExcluded('simple', 'finding')).toBe(false);
    });
  });

  describe('getUniversalSourceTypes', () => {
    it('returns finding, evidence, rule, artifact', () => {
      const types = getUniversalSourceTypes();
      expect(types).toContain('finding');
      expect(types).toContain('evidence');
      expect(types).toContain('rule');
      expect(types).toContain('artifact');
      expect(types).not.toContain('report-meta');
    });
  });

  describe('getExpertOnlySourceTypes', () => {
    it('returns report-meta', () => {
      const types = getExpertOnlySourceTypes();
      expect(types).toContain('report-meta');
    });
  });

  describe('getMinimumCitations', () => {
    it('returns at least minCitationsPerParagraph', () => {
      expect(getMinimumCitations('simple', 0)).toBeGreaterThanOrEqual(1);
      expect(getMinimumCitations('technical', 0)).toBeGreaterThanOrEqual(2);
    });

    it('scales with paragraph count', () => {
      expect(getMinimumCitations('simple', 3)).toBeGreaterThan(getMinimumCitations('simple', 1));
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. Verbosity Rules
// ═══════════════════════════════════════════════════════════════════════════

describe('verbosity.ts — Verbosity rules per mode', () => {
  describe('SIMPLE_VERBOSITY', () => {
    it('has plain tone', () => {
      expect(SIMPLE_VERBOSITY.tone).toBe('plain');
    });

    it('has summary depth', () => {
      expect(SIMPLE_VERBOSITY.depth).toBe('summary');
    });

    it('targets general audience', () => {
      expect(SIMPLE_VERBOSITY.audience).toBe('general');
    });

    it('has 5 max sentences', () => {
      expect(SIMPLE_VERBOSITY.maxSentences).toBe(5);
    });

    it('has 1 max paragraph', () => {
      expect(SIMPLE_VERBOSITY.maxParagraphs).toBe(1);
    });

    it('does not use markdown', () => {
      expect(SIMPLE_VERBOSITY.useMarkdown).toBe(false);
    });

    it('expands acronyms', () => {
      expect(SIMPLE_VERBOSITY.expandAcronyms).toBe(true);
    });
  });

  describe('TECHNICAL_VERBOSITY', () => {
    it('has technical tone', () => {
      expect(TECHNICAL_VERBOSITY.tone).toBe('technical');
    });

    it('has detailed depth', () => {
      expect(TECHNICAL_VERBOSITY.depth).toBe('detailed');
    });

    it('targets technical audience', () => {
      expect(TECHNICAL_VERBOSITY.audience).toBe('technical');
    });

    it('uses markdown', () => {
      expect(TECHNICAL_VERBOSITY.useMarkdown).toBe(true);
    });

    it('shows code snippets', () => {
      expect(TECHNICAL_VERBOSITY.showCodeSnippets).toBe(true);
    });

    it('expands acronyms', () => {
      expect(TECHNICAL_VERBOSITY.expandAcronyms).toBe(true);
    });
  });

  describe('EXPERT_VERBOSITY', () => {
    it('has academic tone', () => {
      expect(EXPERT_VERBOSITY.tone).toBe('academic');
    });

    it('has exhaustive depth', () => {
      expect(EXPERT_VERBOSITY.depth).toBe('exhaustive');
    });

    it('targets security-expert audience', () => {
      expect(EXPERT_VERBOSITY.audience).toBe('security-expert');
    });

    it('does not expand acronyms', () => {
      expect(EXPERT_VERBOSITY.expandAcronyms).toBe(false);
    });
  });

  describe('getVerbosity / getTone / getDepth / getAudience', () => {
    it('returns verbosity for each mode', () => {
      expect(getVerbosity('simple')).toBe(SIMPLE_VERBOSITY);
      expect(getVerbosity('technical')).toBe(TECHNICAL_VERBOSITY);
      expect(getVerbosity('expert')).toBe(EXPERT_VERBOSITY);
    });

    it('returns tone for each mode', () => {
      expect(getTone('simple')).toBe('plain');
      expect(getTone('technical')).toBe('technical');
      expect(getTone('expert')).toBe('academic');
    });

    it('returns depth for each mode', () => {
      expect(getDepth('simple')).toBe('summary');
      expect(getDepth('technical')).toBe('detailed');
      expect(getDepth('expert')).toBe('exhaustive');
    });

    it('returns audience for each mode', () => {
      expect(getAudience('simple')).toBe('general');
      expect(getAudience('technical')).toBe('technical');
      expect(getAudience('expert')).toBe('security-expert');
    });
  });

  describe('describeVerbosity', () => {
    it('returns a description string', () => {
      const desc = describeVerbosity('simple');
      expect(typeof desc).toBe('string');
      expect(desc.length).toBeGreaterThan(0);
    });

    it('includes relevant keywords for each mode', () => {
      expect(describeVerbosity('simple')).toMatch(/plain|summary/);
      expect(describeVerbosity('technical')).toMatch(/technical|detailed/);
      expect(describeVerbosity('expert')).toMatch(/academic|exhaustive|security/);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. Formatter Integration
// ═══════════════════════════════════════════════════════════════════════════

describe('Formatter integration — M6b integration', () => {
  describe('getModeFormat → Formatter', () => {
    it('getModeFormat returns config usable by Formatter', () => {
      const formatter = new Formatter({
        modes: {
          simple: getModeFormat('simple'),
          technical: getModeFormat('technical'),
          expert: getModeFormat('expert'),
        },
      });

      const simpleConfig = formatter.getModeConfig('simple');
      expect(simpleConfig.maxSentences).toBe(5);
      expect(simpleConfig.allowTechnicalJargon).toBe(false);

      const techConfig = formatter.getModeConfig('technical');
      expect(techConfig.maxParagraphs).toBe(3);
      expect(techConfig.showSeverity).toBe(true);

      const expertConfig = formatter.getModeConfig('expert');
      expect(expertConfig.maxParagraphs).toBe(5);
      expect(expertConfig.showTraceability).toBe(true);
    });
  });

  describe('Output options presets are compatible with Formatter', () => {
    it('SIMPLE_OUTPUT_OPTIONS works as FormatterOptions', () => {
      const formatter = new Formatter(SIMPLE_OUTPUT_OPTIONS);
      expect(formatter.getOptions().citations.inlineStyle).toBe('numbered');
      expect(formatter.getOptions().modes.simple.maxSentences).toBe(5);
    });

    it('TECHNICAL_OUTPUT_OPTIONS works as FormatterOptions', () => {
      const formatter = new Formatter(TECHNICAL_OUTPUT_OPTIONS);
      expect(formatter.getOptions().citations.sectionStyle).toBe('list');
      expect(formatter.getOptions().modes.technical.maxParagraphs).toBe(3);
    });

    it('EXPERT_OUTPUT_OPTIONS works as FormatterOptions', () => {
      const formatter = new Formatter(EXPERT_OUTPUT_OPTIONS);
      expect(formatter.getOptions().citations.inlineStyle).toBe('bracketed');
      expect(formatter.getOptions().modes.expert.maxParagraphs).toBe(5);
    });
  });

  describe('ModeConfig.format matches DEFAULT_FORMATTER_OPTIONS', () => {
    it('SIMPLE_MODE_CONFIG matches DEFAULT_FORMATTER_OPTIONS simple', () => {
      const simpleConfig = SIMPLE_MODE_CONFIG.format;
      const defaultSimple = DEFAULT_FORMATTER_OPTIONS.modes.simple;

      expect(simpleConfig.maxSentences).toBe(defaultSimple.maxSentences);
      expect(simpleConfig.maxParagraphs).toBe(defaultSimple.maxParagraphs);
      expect(simpleConfig.showSeverity).toBe(defaultSimple.showSeverity);
      expect(simpleConfig.showConfidence).toBe(defaultSimple.showConfidence);
      expect(simpleConfig.showDisclaimer).toBe(defaultSimple.showDisclaimer);
    });

    it('TECHNICAL_MODE_CONFIG matches DEFAULT_FORMATTER_OPTIONS technical', () => {
      const techConfig = TECHNICAL_MODE_CONFIG.format;
      const defaultTech = DEFAULT_FORMATTER_OPTIONS.modes.technical;

      expect(techConfig.maxParagraphs).toBe(defaultTech.maxParagraphs);
      expect(techConfig.showSeverity).toBe(defaultTech.showSeverity);
      expect(techConfig.showSourceLocations).toBe(defaultTech.showSourceLocations);
    });

    it('EXPERT_MODE_CONFIG matches DEFAULT_FORMATTER_OPTIONS expert', () => {
      const expertConfig = EXPERT_MODE_CONFIG.format;
      const defaultExpert = DEFAULT_FORMATTER_OPTIONS.modes.expert;

      expect(expertConfig.maxParagraphs).toBe(defaultExpert.maxParagraphs);
      expect(expertConfig.showTraceability).toBe(defaultExpert.showTraceability);
      expect(expertConfig.showReportMeta).toBe(defaultExpert.showReportMeta);
    });
  });

  describe('Formatter produces mode-aware output', () => {
    it('uses mode config from SIMPLE_MODE_CONFIG for formatting', () => {
      const formatter = new Formatter({
        modes: {
          simple: SIMPLE_MODE_CONFIG.format,
          technical: TECHNICAL_MODE_CONFIG.format,
          expert: EXPERT_MODE_CONFIG.format,
        },
      });

      const input = {
        text: 'The finding [src:finding:fin_abc123] detected a hardcoded key. This is a security risk [src:evidence:ev_def456].',
        mode: 'simple' as ExplanationMode,
        subjectType: 'finding',
        subjectTitle: 'Hardcoded Key',
      };

      const result = formatter.format(input);
      expect(result.sentenceCount).toBeGreaterThan(0);
      expect(result.text).toBeTruthy();
    });

    it('expert mode uses config from EXPERT_MODE_CONFIG', () => {
      const formatter = new Formatter({
        modes: {
          simple: SIMPLE_MODE_CONFIG.format,
          technical: TECHNICAL_MODE_CONFIG.format,
          expert: EXPERT_MODE_CONFIG.format,
        },
      });

      const input = {
        text: 'The finding [src:finding:fin_abc123] detected a hardcoded key. This is a critical issue [src:evidence:ev_def456] found in [src:artifact:art_001]. The [src:rule:secrets/key] matches rule has high severity.',
        mode: 'expert' as ExplanationMode,
        subjectType: 'finding',
        subjectTitle: 'Hardcoded Key',
        severityLevel: 'critical',
        severityScore: 9.0,
        confidence: 0.98,
        sourceLocations: ['src/config.ts:42'],
        ruleName: 'Key Detection',
        riskDimension: 'Secrets',
        riskScore: 8.5,
      };

      const result = formatter.format(input);
      expect(result.text).toContain('Full Traceability');
      expect(result.paragraphCount).toBeGreaterThanOrEqual(1);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. Determinism (100-run)
// ═══════════════════════════════════════════════════════════════════════════

describe('Determinism — 100-run tests', () => {
  describe('isValidMode (100 runs)', () => {
    it('always returns same result for same input', () => {
      const expected = {
        simple: true,
        technical: true,
        expert: true,
        invalid: false,
        '': false,
      };

      for (let i = 0; i < 100; i++) {
        expect(isValidMode('simple')).toBe(expected.simple);
        expect(isValidMode('technical')).toBe(expected.technical);
        expect(isValidMode('expert')).toBe(expected.expert);
        expect(isValidMode('invalid')).toBe(expected.invalid);
        expect(isValidMode('')).toBe(expected['']);
      }
    });
  });

  describe('selectMode (100 runs)', () => {
    it('always returns same result for same input', () => {
      for (let i = 0; i < 100; i++) {
        expect(selectMode('simple')).toBe('simple');
        expect(selectMode('expert', 'technical')).toBe('expert');
        expect(selectMode('bad')).toBe('technical');
        expect(selectMode('bad', 'simple')).toBe('simple');
      }
    });
  });

  describe('compareModes (100 runs)', () => {
    it('always returns same comparison result', () => {
      for (let i = 0; i < 100; i++) {
        expect(compareModes('simple', 'expert')).toBeLessThan(0);
        expect(compareModes('expert', 'simple')).toBeGreaterThan(0);
        expect(compareModes('simple', 'simple')).toBe(0);
      }
    });
  });

  describe('getModeConfig (100 runs)', () => {
    it('always returns same config for same mode', () => {
      for (let i = 0; i < 100; i++) {
        expect(getModeConfig('simple')).toBe(SIMPLE_MODE_CONFIG);
        expect(getModeConfig('technical')).toBe(TECHNICAL_MODE_CONFIG);
        expect(getModeConfig('expert')).toBe(EXPERT_MODE_CONFIG);
      }
    });
  });

  describe('getCitationPolicy (100 runs)', () => {
    it('always returns same policy for same mode', () => {
      for (let i = 0; i < 100; i++) {
        expect(getCitationPolicy('simple')).toBe(SIMPLE_CITATION_POLICY);
        expect(getCitationPolicy('technical')).toBe(TECHNICAL_CITATION_POLICY);
        expect(getCitationPolicy('expert')).toBe(EXPERT_CITATION_POLICY);
      }
    });
  });

  describe('getVerbosity (100 runs)', () => {
    it('always returns same rules for same mode', () => {
      for (let i = 0; i < 100; i++) {
        expect(getVerbosity('simple')).toBe(SIMPLE_VERBOSITY);
        expect(getVerbosity('technical')).toBe(TECHNICAL_VERBOSITY);
        expect(getVerbosity('expert')).toBe(EXPERT_VERBOSITY);
      }
    });
  });

  describe('getOutputOptions (100 runs)', () => {
    it('always returns same options for same mode', () => {
      for (let i = 0; i < 100; i++) {
        expect(getOutputOptions('simple')).toBe(SIMPLE_OUTPUT_OPTIONS);
        expect(getOutputOptions('technical')).toBe(TECHNICAL_OUTPUT_OPTIONS);
        expect(getOutputOptions('expert')).toBe(EXPERT_OUTPUT_OPTIONS);
      }
    });
  });

  describe('Formatter integration (100 runs)', () => {
    it('produces identical output with mode configs', () => {
      const formatter = new Formatter({
        modes: {
          simple: getModeFormat('simple'),
          technical: getModeFormat('technical'),
          expert: getModeFormat('expert'),
        },
      });

      const input = {
        text: 'The finding [src:finding:fin_abc123] detected a hardcoded key. This is a security risk [src:evidence:ev_def456].',
        mode: 'simple' as ExplanationMode,
        subjectType: 'finding',
        subjectTitle: 'Hardcoded Key',
      };

      const firstResult = formatter.format(input);

      for (let i = 0; i < 100; i++) {
        const result = formatter.format(input);
        expect(result.text).toBe(firstResult.text);
        expect(result.sentenceCount).toBe(firstResult.sentenceCount);
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. Edge Cases
// ═══════════════════════════════════════════════════════════════════════════

describe('Edge cases', () => {
  describe('parseMode edge cases', () => {
    it('handles empty string', () => {
      expect(parseMode('')).toBe('technical');
    });

    it('handles whitespace-only string', () => {
      expect(parseMode('   ')).toBe('technical');
    });

    it('handles strings with leading/trailing whitespace as invalid', () => {
      expect(parseMode(' simple')).toBe('technical');
      expect(parseMode('simple ')).toBe('technical');
    });
  });

  describe('validateMode edge cases', () => {
    it('handles empty string', () => {
      expect(() => validateMode('')).toThrow(TypeError);
    });

    it('handles very long strings', () => {
      expect(() => validateMode('a'.repeat(1000))).toThrow(TypeError);
    });
  });

  describe('selectModeByConfidence edge cases', () => {
    it('handles exactly 0.9 confidence', () => {
      expect(selectModeByConfidence('expert', 0.9)).toBe('expert');
    });

    it('handles exactly 0.7 confidence', () => {
      expect(selectModeByConfidence('expert', 0.7)).toBe('technical');
    });

    it('handles NaN confidence', () => {
      expect(selectModeByConfidence('expert', NaN)).toBe('simple');
    });
  });

  describe('maxSentences = 0 (unlimited)', () => {
    it('technical and expert modes allow unlimited sentences', () => {
      expect(TECHNICAL_MODE_CONFIG.format.maxSentences).toBe(0);
      expect(EXPERT_MODE_CONFIG.format.maxSentences).toBe(0);
    });
  });

  describe('Frozen object integrity', () => {
    it('ALL_MODES is frozen', () => {
      expect(Object.isFrozen(ALL_MODES)).toBe(true);
    });

    it('MODE_DEPTH is frozen', () => {
      expect(Object.isFrozen(MODE_DEPTH)).toBe(true);
    });

    it('SIMPLE_MODE_CONFIG is frozen (including format)', () => {
      expect(Object.isFrozen(SIMPLE_MODE_CONFIG)).toBe(true);
      expect(Object.isFrozen(SIMPLE_MODE_CONFIG.format)).toBe(true);
    });

    it('OUTPUT_OPTIONS_PRESETS is frozen', () => {
      expect(Object.isFrozen(OUTPUT_OPTIONS_PRESETS)).toBe(true);
    });

    it('CITATION_POLICIES is frozen', () => {
      expect(Object.isFrozen(CITATION_POLICIES)).toBe(true);
    });

    it('VERBOSITY_RULES is frozen', () => {
      expect(Object.isFrozen(VERBOSITY_RULES)).toBe(true);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. Unused MODE_DESCRIPTIONS export edge case
// ═══════════════════════════════════════════════════════════════════════════

describe('MODE_LABELS / MODE_DESCRIPTIONS / MODE_TAGS', () => {
  it('MODE_LABELS has entries for all modes', () => {
    expect(MODE_LABELS.simple).toBe('Simple');
    expect(MODE_LABELS.technical).toBe('Technical');
    expect(MODE_LABELS.expert).toBe('Expert');
  });

  it('MODE_DESCRIPTIONS has entries for all modes', () => {
    expect(MODE_DESCRIPTIONS.simple).toBeTruthy();
    expect(MODE_DESCRIPTIONS.technical).toBeTruthy();
    expect(MODE_DESCRIPTIONS.expert).toBeTruthy();
  });

  it('MODE_TAGS has entries for all modes', () => {
    expect(MODE_TAGS.simple).toBe('summary');
    expect(MODE_TAGS.technical).toBe('detailed');
    expect(MODE_TAGS.expert).toBe('traceability');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. validateModeIdentifier with errors
// ═══════════════════════════════════════════════════════════════════════════

describe('validateModeIdentifier detailed error checks', () => {
  it('returns error for non-string input', () => {
    const result = validateModeIdentifier(null as unknown as string);
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('returns proper error codes', () => {
    const result = validateModeIdentifier('bad');
    expect(result.issues[0].code).toBe('MODE_INVALID');
    expect(result.issues[0].severity).toBe('error');
  });
});
