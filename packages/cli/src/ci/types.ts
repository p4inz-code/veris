/**
 * @veris/cli/ci/types — Type definitions for CI runner and security gates.
 *
 * Implements the contracts defined in ADR-015:
 * - Deterministic finding fingerprinting
 * - Baseline model and differential finding taxonomy
 * - Configurable security policy gates
 * - Canonical ci-summary.json and GitHub step summary schemas
 *
 * @module @veris/cli/ci/types
 */

import type { SeverityLevel } from '../ui/theme/index.js';
export type { SeverityLevel };

/** Numeric ranking of severity levels for threshold comparisons. */
export const SEVERITY_RANKS: Readonly<Record<SeverityLevel, number>> = Object.freeze({
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
});

/** Security policy configuration for CI execution. */
export interface CiPolicy {
  /**
   * Minimum finding severity that causes gate failure.
   * If any finding meets or exceeds this severity, gate fails.
   */
  readonly failOn?: SeverityLevel;

  /**
   * Fail if ANY new findings are introduced compared to baseline.
   */
  readonly failOnNew?: boolean;

  /**
   * Fail if existing findings regress in severity or risk score increases.
   */
  readonly failOnRegressions?: boolean;

  /**
   * Maximum acceptable overall risk score [0.0 - 10.0].
   */
  readonly maxRisk?: number;

  /**
   * Maximum allowed newly introduced findings (default: 0 when failOnNew is true).
   */
  readonly maxNew?: number;

  /**
   * Fail if any loaded plugin failed or was quarantined during scan.
   */
  readonly failOnPluginQuarantine?: boolean;
}

/** CLI options for the `veris ci` command. */
export interface CiRunnerOptions {
  /** Target directory or file to scan (default: '.'). */
  readonly target: string;

  /** Path to baseline scan report or ci-summary.json. */
  readonly baseline?: string;

  /** Evaluated security policy. */
  readonly policy: CiPolicy;

  /** Output directory for scan and CI artifacts (default: './veris-output'). */
  readonly outputDir: string;

  /** Output report format(s): json, markdown, sarif, junit. */
  readonly format?: readonly string[];

  /** Path to write ci-summary.json (defaults to '<outputDir>/ci-summary.json'). */
  readonly summaryFile?: string;

  /** Force writing GitHub Actions step summary markdown file. */
  readonly githubStepSummary?: boolean;

  /** Injected timestamp for deterministic output (ISO 8601). */
  readonly computedAt?: string;

  /** Suppress non-essential progress output. */
  readonly silent?: boolean;

  /** Verbose diagnostic output. */
  readonly verbose?: boolean;

  /** Explicit directory to search for plugins. */
  readonly pluginDir?: string;

  /** Plugin IDs to disable. */
  readonly disabledPlugins?: readonly string[];

  /** Whether plugins are enabled (default: true). */
  readonly enablePlugins?: boolean;
}

/** Stable, cross-run finding fingerprint. */
export interface FindingFingerprint {
  /** Deterministic fingerprint hash (`fp_<sha256>`). */
  readonly hash: string;
  /** Rule ID that produced the finding. */
  readonly ruleId: string;
  /** Normalized, cross-platform relative path of affected artifact. */
  readonly artifactPath: string;
  /** Finding title. */
  readonly title: string;
}

/** Normalized finding representation from baseline report. */
export interface BaselineFinding {
  readonly fingerprint: string;
  readonly ruleId: string;
  readonly artifactPath: string;
  readonly title: string;
  readonly severity: SeverityLevel;
  readonly score: number;
  readonly confidence: number;
  readonly evidenceCount: number;
  readonly originalFindingId?: string;
}

/** Parsed and sanitized baseline data. */
export interface BaselineData {
  readonly sourcePath: string;
  readonly riskScore: number;
  readonly findings: readonly BaselineFinding[];
  readonly generatedAt?: string;
}

/** Differential status of a finding relative to baseline. */
export type FindingDiffStatus = 'unchanged' | 'new' | 'regressed' | 'evidence_changed' | 'resolved';

/** A single finding comparison entry. */
export interface FindingDiffEntry {
  readonly fingerprint: string;
  readonly ruleId: string;
  readonly artifactPath: string;
  readonly title: string;
  readonly status: FindingDiffStatus;
  readonly currentSeverity?: SeverityLevel;
  readonly baselineSeverity?: SeverityLevel;
  readonly currentScore?: number;
  readonly baselineScore?: number;
  readonly currentFindingId?: string;
  readonly baselineFindingId?: string;
  readonly changeDetails?: string;
}

/** Complete result of differential finding comparison. */
export interface FindingDiffResult {
  readonly totalCurrent: number;
  readonly totalBaseline: number;
  readonly newCount: number;
  readonly regressedCount: number;
  readonly evidenceChangedCount: number;
  readonly unchangedCount: number;
  readonly resolvedCount: number;
  readonly currentRiskScore: number;
  readonly baselineRiskScore?: number;
  readonly riskScoreDelta: number;
  readonly diffs: readonly FindingDiffEntry[];
}

/** Individual security gate evaluation record. */
export interface GateEvaluation {
  readonly gate: string;
  readonly name: string;
  readonly passed: boolean;
  readonly threshold: string | number | boolean;
  readonly actual: string | number | boolean;
  readonly details: string;
  readonly violatingItems?: readonly string[];
}

/** Overall outcome of policy gate evaluations. */
export interface CiGateResult {
  readonly passed: boolean;
  readonly exitCode: number;
  readonly evaluations: readonly GateEvaluation[];
  readonly violations: readonly GateEvaluation[];
}

/** High-level metrics for CI summary. */
export interface CiSummaryMetrics {
  readonly currentRiskScore: number;
  readonly baselineRiskScore?: number;
  readonly riskScoreDelta: number;
  readonly currentFindingCount: number;
  readonly baselineFindingCount?: number;
  readonly newFindingCount: number;
  readonly regressedFindingCount: number;
  readonly evidenceChangedFindingCount: number;
  readonly unchangedFindingCount: number;
  readonly resolvedFindingCount: number;
  readonly findingsBySeverity: Readonly<Record<string, number>>;
}

/** Machine-readable canonical CI summary (`ci-summary.json`). */
export interface CiSummary {
  readonly schemaVersion: '1.0.0';
  readonly status: 'passed' | 'failed';
  readonly exitCode: number;
  readonly timestamp: string;
  readonly target: string;
  readonly baselinePath?: string;
  readonly policy: CiPolicy;
  readonly gateResult: CiGateResult;
  readonly metrics: CiSummaryMetrics;
  readonly diffs: readonly FindingDiffEntry[];
  readonly outputFiles: readonly string[];
}
