/**
 * Mode selector — deterministic mode selection and resolution helpers.
 *
 * Provides functions for parsing, validating, and selecting explanation modes
 * from user input, configuration, or automated context analysis.
 *
 * All selection logic is PURELY DETERMINISTIC — the same inputs always produce
 * the same output. No random or state-dependent behavior.
 *
 * @module @veris/explain/modes/mode-selector
 */

import type { ExplanationMode } from '../types/explanation.js';

import { isValidMode, DEFAULT_MODE, ALL_MODES, MODE_DEPTH } from './explanation-mode.js';

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Select a mode from a user-provided string, with a fallback default.
 *
 * If the string is a valid mode name, it is returned as-is. Otherwise,
 * the `defaultMode` (or `"technical"` if not specified) is returned.
 *
 * Leading/trailing whitespace is trimmed before matching. Matching is
 * case-sensitive and exact.
 *
 * @param input - The user-provided mode string.
 * @param defaultMode - Optional fallback mode (default: `"technical"`).
 * @returns The selected mode.
 *
 * @example
 * ```ts
 * selectMode("simple");       // "simple"
 * selectMode("SIMPLE");       // "technical" (case-sensitive)
 * selectMode("invalid");      // "technical"
 * selectMode("", "expert");   // "expert"
 * ```
 */
export function selectMode(
  input: string,
  defaultMode: ExplanationMode = DEFAULT_MODE,
): ExplanationMode {
  const trimmed = input.trim();
  if (isValidMode(trimmed)) {
    return trimmed;
  }
  return defaultMode;
}

/**
 * Resolve an optional mode specification, falling back to a default.
 *
 * Accepts both `ExplanationMode` and `string` values. If `mode` is:
 * - `undefined` or `null`: returns `defaultMode`
 * - A valid `ExplanationMode`: returned as-is
 * - A valid mode string: returned as the corresponding `ExplanationMode`
 * - An invalid string: `defaultMode` is returned
 *
 * @param mode - The optional mode value to resolve.
 * @param defaultMode - The fallback mode (default: `"technical"`).
 * @returns The resolved mode.
 */
export function resolveMode(
  mode?: ExplanationMode | string | null,
  defaultMode: ExplanationMode = DEFAULT_MODE,
): ExplanationMode {
  if (mode == null) {
    return defaultMode;
  }
  if (typeof mode === 'string' && isValidMode(mode)) {
    return mode;
  }
  return defaultMode;
}

/**
 * Validate that a string is a valid mode, throwing an error if not.
 *
 * @param value - The value to validate.
 * @returns The validated `ExplanationMode`.
 * @throws {TypeError} If the value is not a valid mode.
 */
export function validateMode(value: string): ExplanationMode {
  if (isValidMode(value)) {
    return value;
  }
  const valid = ALL_MODES.map((m) => `"${m}"`).join(', ');
  throw new TypeError(`Invalid explanation mode: "${value}". Valid modes are: ${valid}.`);
}

/**
 * Select the best mode for a given context based on confidence and depth.
 *
 * - If `confidence >= 0.9`: return the requested mode (or default).
 * - If `confidence >= 0.7`: cap at `technical`.
 * - If `confidence < 0.7`: cap at `simple`.
 *
 * This ensures that low-confidence findings are not explained in expert
 * mode, where detailed claims would be misleading.
 *
 * @param requestedMode - The mode requested by the user/caller.
 * @param confidence - The confidence level (0.0 to 1.0).
 * @returns The selected mode based on confidence.
 */
export function selectModeByConfidence(
  requestedMode: ExplanationMode,
  confidence: number,
): ExplanationMode {
  // Guard: non-finite or NaN confidence is treated as low confidence
  if (!Number.isFinite(confidence)) {
    return 'simple';
  }

  // Clamp confidence to valid range
  const clampedConfidence = Math.max(0, Math.min(1, confidence));

  if (clampedConfidence >= 0.9) {
    return requestedMode;
  }
  if (clampedConfidence >= 0.7) {
    // Cap at technical
    if (MODE_DEPTH[requestedMode] > MODE_DEPTH['technical']) {
      return 'technical';
    }
    return requestedMode;
  }
  // Low confidence — cap at simple
  return 'simple';
}

/**
 * Check if a mode is "above" (more detailed than) a threshold mode.
 *
 * @param mode - The mode to check.
 * @param threshold - The threshold mode.
 * @returns `true` if `mode` is more detailed than `threshold`.
 */
export function isAboveMode(mode: ExplanationMode, threshold: ExplanationMode): boolean {
  return MODE_DEPTH[mode] > MODE_DEPTH[threshold];
}

/**
 * Check if a mode is "below" (less detailed than) a threshold mode.
 *
 * @param mode - The mode to check.
 * @param threshold - The threshold mode.
 * @returns `true` if `mode` is less detailed than `threshold`.
 */
export function isBelowMode(mode: ExplanationMode, threshold: ExplanationMode): boolean {
  return MODE_DEPTH[mode] < MODE_DEPTH[threshold];
}
