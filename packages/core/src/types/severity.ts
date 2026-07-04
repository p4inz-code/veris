/**
 * Canonical severity types for VERIS.
 *
 * Severity is used across Finding, Rule, and RiskProfile to indicate
 * the importance or urgency of a result.
 *
 * @module @veris/core/types/severity
 */

/** Severity level string — an open enum (extensible via string union). */
export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

/** All valid severity levels in descending order. */
export const SEVERITY_LEVELS: readonly SeverityLevel[] = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
] as const;

/** Numeric threshold for each severity level. */
export const SEVERITY_THRESHOLDS: Record<SeverityLevel, number> = {
  critical: 9.0,
  high: 7.0,
  medium: 5.0,
  low: 3.0,
  info: 0.0,
} as const;

/**
 * Canonical severity value object.
 * Immutable after creation.
 */
export interface Severity {
  /** Human-readable severity level. */
  readonly level: SeverityLevel;
  /** Numeric score in [0.0, 10.0]. */
  readonly score: number;
}

/** Ordered list of severity levels from highest to lowest impact. */
export const SEVERITY_ORDER: readonly SeverityLevel[] = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
] as const;

/**
 * Resolve a numeric score to a severity level.
 * Uses the thresholds defined in SEVERITY_THRESHOLDS.
 */
export function severityLevelFromScore(score: number): SeverityLevel {
  if (score >= SEVERITY_THRESHOLDS.critical) return 'critical';
  if (score >= SEVERITY_THRESHOLDS.high) return 'high';
  if (score >= SEVERITY_THRESHOLDS.medium) return 'medium';
  if (score >= SEVERITY_THRESHOLDS.low) return 'low';
  return 'info';
}

/**
 * Create a Severity value object.
 * Clamps score to [0.0, 10.0].
 */
export function createSeverity(level: SeverityLevel, score: number): Severity {
  const clamped = Math.max(0, Math.min(10, score));
  return { level, score: clamped };
}

/** Compare two severities. Returns positive if a > b, negative if a < b, 0 if equal. */
export function compareSeverity(a: Severity, b: Severity): number {
  return a.score - b.score;
}
