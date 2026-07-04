/**
 * Output option presets — pre-configured `FormatterOptions` for each mode.
 *
 * Each preset provides a complete `FormatterOptions` object that can be
 * passed directly to `createFormatter()` or merged into an existing
 * formatter configuration. These presets build on top of the mode-level
 * `ModeFormatConfig` and extend them with citation, paragraph, list,
 * and global formatting options tailored to each mode.
 *
 * All presets are **frozen** at creation time. Every preset is
 * PURELY DETERMINISTIC — the same mode always produces the same options.
 *
 * @module @veris/explain/modes/output-options
 */

import type { FormatterOptions } from '../output/formatter-options.js';
import { DEFAULT_PARAGRAPH_OPTIONS, DEFAULT_LIST_OPTIONS } from '../output/formatter-options.js';
import type { ExplanationMode } from '../types/explanation.js';

import { MODE_CONFIGS } from './mode-config.js';

// ═══════════════════════════════════════════════════════════════════════════
// Preset Output Options
// ═══════════════════════════════════════════════════════════════════════════

/** Output options preset for **simple** mode. */
export const SIMPLE_OUTPUT_OPTIONS: FormatterOptions = Object.freeze({
  modes: Object.freeze({
    simple: MODE_CONFIGS.simple.format,
    technical: MODE_CONFIGS.technical.format,
    expert: MODE_CONFIGS.expert.format,
  }),
  citations: Object.freeze({
    inlineStyle: 'numbered',
    sectionStyle: 'compact',
    showSourceIds: true,
    showVerificationStatus: false,
    sectionHeading: 'Citations',
  }),
  paragraphs: DEFAULT_PARAGRAPH_OPTIONS,
  lists: DEFAULT_LIST_OPTIONS,
  headingStyle: 'atx',
  summaryHeadingLevel: 2,
  normalizeWhitespace: true,
  stableOrdering: true,
  jsonOutput: false,
  jsonIndent: 2,
  includeRawCitations: false,
});

/** Output options preset for **technical** mode. */
export const TECHNICAL_OUTPUT_OPTIONS: FormatterOptions = Object.freeze({
  modes: Object.freeze({
    simple: MODE_CONFIGS.simple.format,
    technical: MODE_CONFIGS.technical.format,
    expert: MODE_CONFIGS.expert.format,
  }),
  citations: Object.freeze({
    inlineStyle: 'numbered',
    sectionStyle: 'list',
    showSourceIds: true,
    showVerificationStatus: true,
    sectionHeading: 'Citations',
  }),
  paragraphs: DEFAULT_PARAGRAPH_OPTIONS,
  lists: DEFAULT_LIST_OPTIONS,
  headingStyle: 'atx',
  summaryHeadingLevel: 2,
  normalizeWhitespace: true,
  stableOrdering: true,
  jsonOutput: false,
  jsonIndent: 2,
  includeRawCitations: false,
});

/** Output options preset for **expert** mode. */
export const EXPERT_OUTPUT_OPTIONS: FormatterOptions = Object.freeze({
  modes: Object.freeze({
    simple: MODE_CONFIGS.simple.format,
    technical: MODE_CONFIGS.technical.format,
    expert: MODE_CONFIGS.expert.format,
  }),
  citations: Object.freeze({
    inlineStyle: 'bracketed',
    sectionStyle: 'table',
    showSourceIds: true,
    showVerificationStatus: true,
    sectionHeading: 'Citation References',
  }),
  paragraphs: Object.freeze({
    maxWidth: 0,
    preserveLineBreaks: true,
    separator: '\n\n',
  }),
  lists: DEFAULT_LIST_OPTIONS,
  headingStyle: 'atx',
  summaryHeadingLevel: 2,
  normalizeWhitespace: true,
  stableOrdering: true,
  jsonOutput: false,
  jsonIndent: 2,
  includeRawCitations: false,
});

// ═══════════════════════════════════════════════════════════════════════════
// Registry & Accessors
// ═══════════════════════════════════════════════════════════════════════════

/** All output option presets indexed by mode. Deep-frozen. */
export const OUTPUT_OPTIONS_PRESETS: Readonly<Record<ExplanationMode, FormatterOptions>> =
  Object.freeze({
    simple: SIMPLE_OUTPUT_OPTIONS,
    technical: TECHNICAL_OUTPUT_OPTIONS,
    expert: EXPERT_OUTPUT_OPTIONS,
  });

/**
 * Get the output options preset for a given mode.
 *
 * @param mode - The explanation mode.
 * @returns The frozen output options for that mode.
 */
export function getOutputOptions(mode: ExplanationMode): FormatterOptions {
  return OUTPUT_OPTIONS_PRESETS[mode];
}

/**
 * Get a deep-merged copy of the output options preset with overrides.
 *
 * This allows callers to customize the preset without mutating the frozen
 * original. The returned object is NOT frozen.
 *
 * @param mode - The explanation mode.
 * @param overrides - Partial overrides to merge into the preset.
 * @returns A new options object with overrides applied.
 */
export function mergeOutputOptions(
  mode: ExplanationMode,
  overrides?: Partial<FormatterOptions>,
): FormatterOptions {
  const base = OUTPUT_OPTIONS_PRESETS[mode];

  if (!overrides) {
    return {
      modes: {
        simple: { ...base.modes.simple },
        technical: { ...base.modes.technical },
        expert: { ...base.modes.expert },
      },
      citations: { ...base.citations },
      paragraphs: { ...base.paragraphs },
      lists: { ...base.lists },
      headingStyle: base.headingStyle,
      summaryHeadingLevel: base.summaryHeadingLevel,
      normalizeWhitespace: base.normalizeWhitespace,
      stableOrdering: base.stableOrdering,
      jsonOutput: base.jsonOutput,
      jsonIndent: base.jsonIndent,
      includeRawCitations: base.includeRawCitations,
    };
  }

  return {
    modes: {
      simple: { ...base.modes.simple, ...overrides.modes?.simple },
      technical: { ...base.modes.technical, ...overrides.modes?.technical },
      expert: { ...base.modes.expert, ...overrides.modes?.expert },
    },
    citations: { ...base.citations, ...overrides.citations },
    paragraphs: { ...base.paragraphs, ...overrides.paragraphs },
    lists: { ...base.lists, ...overrides.lists },
    headingStyle: overrides.headingStyle ?? base.headingStyle,
    summaryHeadingLevel: overrides.summaryHeadingLevel ?? base.summaryHeadingLevel,
    normalizeWhitespace: overrides.normalizeWhitespace ?? base.normalizeWhitespace,
    stableOrdering: overrides.stableOrdering ?? base.stableOrdering,
    jsonOutput: overrides.jsonOutput ?? base.jsonOutput,
    jsonIndent: overrides.jsonIndent ?? base.jsonIndent,
    includeRawCitations: overrides.includeRawCitations ?? base.includeRawCitations,
  };
}
