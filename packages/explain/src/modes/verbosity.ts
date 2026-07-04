/**
 * Verbosity rules — tone, depth, and detail level configuration per mode.
 *
 * Defines the writing tone, explanation depth, and structural detail rules
 * for each explanation mode. These rules control how verbose the output is,
 * what language style to use, and how deeply to explain concepts.
 *
 * All verbosity rules are **frozen** and PURELY DETERMINISTIC.
 *
 * @module @veris/explain/modes/verbosity
 */

import type { ExplanationMode } from '../types/explanation.js';

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Writing tone for the explanation.
 *
 * - `"plain"`: Simple, clear language suitable for non-technical readers.
 * - `"technical"`: Standard technical language with domain terminology.
 * - `"academic"`: Formal, precise language with complete technical accuracy.
 */
export type ExplanationTone = 'plain' | 'technical' | 'academic';

/**
 * Depth of explanation detail.
 *
 * - `"summary"`: Brief overview covering only the essential points.
 * - `"detailed"`: Comprehensive coverage with supporting evidence.
 * - `"exhaustive"`: Complete traceability with all available context.
 */
export type ExplanationDepth = 'summary' | 'detailed' | 'exhaustive';

/**
 * Target audience for the explanation.
 *
 * - `"general"`: Non-technical stakeholders, management.
 * - `"technical"": Developers, security engineers, analysts.
 * - `"security-expert"`: Senior security researchers, architects.
 */
export type TargetAudience = 'general' | 'technical' | 'security-expert';

/**
 * Verbosity rules for a single explanation mode.
 *
 * Controls the tone, depth, audience, and structural rules that determine
 * how verbose and detailed the output should be.
 */
export interface ModeVerbosity {
  /** The mode these rules apply to. */
  readonly mode: ExplanationMode;

  /** The writing tone to use. */
  readonly tone: ExplanationTone;

  /** The explanation depth. */
  readonly depth: ExplanationDepth;

  /** The target audience. */
  readonly audience: TargetAudience;

  /** Maximum number of sentences (0 = no limit). */
  readonly maxSentences: number;

  /** Maximum number of paragraphs (0 = no limit). */
  readonly maxParagraphs: number;

  /** Whether to use markdown formatting (headings, lists, tables). */
  readonly useMarkdown: boolean;

  /** Whether to include inline code snippets. */
  readonly showCodeSnippets: boolean;

  /** Whether to expand acronyms on first use (e.g., "CWE (Common Weakness Enumeration)"). */
  readonly expandAcronyms: boolean;

  /** Whether to include citations in the text (inline markers). */
  readonly includeCitations: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// Verbosity Rules — Frozen
// ═══════════════════════════════════════════════════════════════════════════

/** Verbosity rules for **simple** mode. */
export const SIMPLE_VERBOSITY: ModeVerbosity = Object.freeze({
  mode: 'simple',
  tone: 'plain',
  depth: 'summary',
  audience: 'general',
  maxSentences: 5,
  maxParagraphs: 1,
  useMarkdown: false,
  showCodeSnippets: false,
  expandAcronyms: true,
  includeCitations: true,
});

/** Verbosity rules for **technical** mode. */
export const TECHNICAL_VERBOSITY: ModeVerbosity = Object.freeze({
  mode: 'technical',
  tone: 'technical',
  depth: 'detailed',
  audience: 'technical',
  maxSentences: 0,
  maxParagraphs: 3,
  useMarkdown: true,
  showCodeSnippets: true,
  expandAcronyms: true,
  includeCitations: true,
});

/** Verbosity rules for **expert** mode. */
export const EXPERT_VERBOSITY: ModeVerbosity = Object.freeze({
  mode: 'expert',
  tone: 'academic',
  depth: 'exhaustive',
  audience: 'security-expert',
  maxSentences: 0,
  maxParagraphs: 5,
  useMarkdown: true,
  showCodeSnippets: true,
  expandAcronyms: false,
  includeCitations: true,
});

// ═══════════════════════════════════════════════════════════════════════════
// Registry & Accessors
// ═══════════════════════════════════════════════════════════════════════════

/** All verbosity rules indexed by mode. Deep-frozen. */
export const VERBOSITY_RULES: Readonly<Record<ExplanationMode, ModeVerbosity>> = Object.freeze({
  simple: SIMPLE_VERBOSITY,
  technical: TECHNICAL_VERBOSITY,
  expert: EXPERT_VERBOSITY,
});

/**
 * Get the verbosity rules for a given mode.
 *
 * @param mode - The explanation mode.
 * @returns The frozen verbosity rules for that mode.
 */
export function getVerbosity(mode: ExplanationMode): ModeVerbosity {
  return VERBOSITY_RULES[mode];
}

/**
 * Get the writing tone for a mode.
 *
 * @param mode - The explanation mode.
 * @returns The tone string.
 */
export function getTone(mode: ExplanationMode): ExplanationTone {
  return VERBOSITY_RULES[mode].tone;
}

/**
 * Get the explanation depth for a mode.
 *
 * @param mode - The explanation mode.
 * @returns The depth string.
 */
export function getDepth(mode: ExplanationMode): ExplanationDepth {
  return VERBOSITY_RULES[mode].depth;
}

/**
 * Get the target audience for a mode.
 *
 * @param mode - The explanation mode.
 * @returns The audience string.
 */
export function getAudience(mode: ExplanationMode): TargetAudience {
  return VERBOSITY_RULES[mode].audience;
}

/**
 * Get a human-readable description of the verbosity rules for a mode.
 *
 * @param mode - The explanation mode.
 * @returns A description string.
 */
export function describeVerbosity(mode: ExplanationMode): string {
  const v = VERBOSITY_RULES[mode];
  return [
    `${v.tone} tone for ${v.audience} audience`,
    `${v.depth} depth`,
    v.maxSentences > 0 ? `up to ${v.maxSentences} sentences` : 'unlimited sentences',
    v.maxParagraphs > 0 ? `up to ${v.maxParagraphs} paragraphs` : 'unlimited paragraphs',
    v.useMarkdown ? 'markdown formatting' : 'no markdown',
    v.showCodeSnippets ? 'code snippets shown' : 'no code snippets',
    v.expandAcronyms ? 'acronyms expanded' : 'acronyms not expanded',
  ].join(' | ');
}
