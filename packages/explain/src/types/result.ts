/**
 * Result types — discriminated union for explanation outcomes.
 *
 * @module @veris/explain/types/result
 */

import type { Explanation } from './explanation.js';

// ── Result Variants ──

/**
 * Successful explanation result.
 */
export interface ExplainSuccess {
  readonly kind: 'success';
  readonly explanation: Explanation;
}

/**
 * Explanation was refused (null-evidence).
 */
export interface ExplainRefused {
  readonly kind: 'refused';
  readonly reason: string;
  readonly subjectId: string;
  readonly subjectType: string;
}

/**
 * Explanation failed (provider error, validation failure).
 */
export interface ExplainError {
  readonly kind: 'error';
  readonly code: string;
  readonly message: string;
  readonly subjectId: string;
  readonly subjectType: string;
  readonly providerError?: string;
  readonly recoverable: boolean;
}

/**
 * Union type for explanation results.
 *
 * Discriminated by the `kind` field:
 * - `"success"` → explanation was generated successfully
 * - `"refused"` → AI refused to explain (null-evidence)
 * - `"error"` → something went wrong (provider down, validation failure)
 */
export type ExplainResult = ExplainSuccess | ExplainRefused | ExplainError;
