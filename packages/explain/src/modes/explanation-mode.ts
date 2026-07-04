/**
 * Explanation mode type handling — core type, constants, and helpers for
 * the three explanation detail levels.
 *
 * ## Modes
 *
 * - **simple**: One-paragraph summary, essential citations only, no jargon.
 * - **technical**: Multi-paragraph with evidence and risk context.
 * - **expert**: Full traceability chain with all evidence and source locations.
 *
 * ## Determinism
 *
 * All helper functions are PURELY DETERMINISTIC — they always return the same
 * output for the same input. Mode ordering and comparison are pre-defined
 * constants, never derived from runtime state.
 *
 * @module @veris/explain/modes/explanation-mode
 */

import type { ExplanationMode } from '../types/explanation.js';

// ═══════════════════════════════════════════════════════════════════════════
// Constants — Frozen, Immutable
// ═══════════════════════════════════════════════════════════════════════════

/** All valid explanation modes in order of increasing depth. */
export const ALL_MODES: readonly ExplanationMode[] = Object.freeze([
  'simple',
  'technical',
  'expert',
]);

/** Human-readable labels for each mode. */
export const MODE_LABELS: Readonly<Record<ExplanationMode, string>> = Object.freeze({
  simple: 'Simple',
  technical: 'Technical',
  expert: 'Expert',
});

/** Short descriptions for each mode. */
export const MODE_DESCRIPTIONS: Readonly<Record<ExplanationMode, string>> = Object.freeze({
  simple: 'One paragraph summary with essential citations only, no technical jargon.',
  technical: 'Detailed explanation with evidence, severity, and risk context.',
  expert: 'Full traceability chain with all evidence, source locations, and metadata.',
});

/** Brief one-word descriptors for each mode. */
export const MODE_TAGS: Readonly<Record<ExplanationMode, string>> = Object.freeze({
  simple: 'summary',
  technical: 'detailed',
  expert: 'traceability',
});

/**
 * Depth ranking for each mode (higher = more detailed).
 * Used for comparison: `simple = 1`, `technical = 2`, `expert = 3`.
 */
export const MODE_DEPTH: Readonly<Record<ExplanationMode, number>> = Object.freeze({
  simple: 1,
  technical: 2,
  expert: 3,
});

/**
 * Default explanation mode when none is specified.
 */
export const DEFAULT_MODE: ExplanationMode = 'technical';

// ═══════════════════════════════════════════════════════════════════════════
// Public API — Deterministic Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Type guard that checks whether a string is a valid {@link ExplanationMode}.
 *
 * @param value - The value to check.
 * @returns `true` if the value is a valid `ExplanationMode`.
 *
 * @example
 * ```ts
 * isValidMode("simple");   // true
 * isValidMode("invalid");  // false
 * ```
 */
export function isValidMode(value: string): value is ExplanationMode {
  if (typeof value !== 'string') {
    return false;
  }
  return value === 'simple' || value === 'technical' || value === 'expert';
}

/**
 * Get the default explanation mode.
 *
 * @returns The default mode (`"technical"`).
 */
export function getDefaultMode(): ExplanationMode {
  return DEFAULT_MODE;
}

/**
 * Compare two explanation modes by depth.
 *
 * Returns:
 * - negative if `a` is less detailed than `b`
 * - zero if `a` and `b` are the same mode
 * - positive if `a` is more detailed than `b`
 *
 * @param a - First mode.
 * @param b - Second mode.
 * @returns A negative, zero, or positive number.
 *
 * @example
 * ```ts
 * compareModes("simple", "expert");    // -2
 * compareModes("expert", "simple");    // 2
 * compareModes("technical", "technical"); // 0
 * ```
 */
export function compareModes(a: ExplanationMode, b: ExplanationMode): number {
  return MODE_DEPTH[a] - MODE_DEPTH[b];
}

/**
 * Check if mode `a` is more detailed than mode `b`.
 *
 * @param a - The mode to check.
 * @param b - The baseline mode.
 * @returns `true` if `a` is more detailed than `b`.
 */
export function isMoreDetailed(a: ExplanationMode, b: ExplanationMode): boolean {
  return compareModes(a, b) > 0;
}

/**
 * Check if mode `a` is less detailed than mode `b`.
 *
 * @param a - The mode to check.
 * @param b - The baseline mode.
 * @returns `true` if `a` is less detailed than `b`.
 */
export function isLessDetailed(a: ExplanationMode, b: ExplanationMode): boolean {
  return compareModes(a, b) < 0;
}

/**
 * Get the human-readable label for a mode.
 *
 * @param mode - The explanation mode.
 * @returns The human-readable label.
 */
export function getModeLabel(mode: ExplanationMode): string {
  return MODE_LABELS[mode];
}

/**
 * Get the description for a mode.
 *
 * @param mode - The explanation mode.
 * @returns The description string.
 */
export function getModeDescription(mode: ExplanationMode): string {
  return MODE_DESCRIPTIONS[mode];
}

/**
 * Get all valid explanation modes in order of increasing depth.
 *
 * @returns An array of all modes: `["simple", "technical", "expert"]`.
 */
export function getAllModes(): readonly ExplanationMode[] {
  return ALL_MODES;
}

/**
 * Parse a string into an {@link ExplanationMode}, returning the default
 * mode if the string is not a valid mode.
 *
 * @param value - The string to parse.
 * @param defaultMode - The fallback mode (default: `"technical"`).
 * @returns The parsed or default mode.
 *
 * @example
 * ```ts
 * parseMode("simple");      // "simple"
 * parseMode("invalid");     // "technical" (default)
 * parseMode("expert", "simple"); // "expert"
 * ```
 */
export function parseMode(
  value: string,
  defaultMode: ExplanationMode = DEFAULT_MODE,
): ExplanationMode {
  if (isValidMode(value)) {
    return value;
  }
  return defaultMode;
}

export type { ExplanationMode };
