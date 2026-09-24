/**
 * @veris/cli/dashboard/types — Types and contracts for visual investigation dashboard.
 *
 * Implements ADR-017:
 * - Standalone HTML generator options
 * - Local loopback server configuration
 *
 * @module @veris/cli/dashboard/types
 */

import type { CanonicalReport } from '@veris/core';

/**
 * Options for generating or serving the visual investigation dashboard.
 */
export interface DashboardOptions {
  /** Path to the canonical report.json file. */
  readonly reportPath: string;
  /** Output file path for standalone HTML artifact. */
  readonly output?: string;
  /** Port for local loopback HTTP server (0 for random available port). */
  readonly port?: number;
  /** Disable automatic browser opening when serving. */
  readonly noOpen?: boolean;
  /** Direct output format: "html" | "serve". */
  readonly mode?: 'html' | 'serve';
}

/**
 * Running dashboard server instance controller.
 */
export interface DashboardServerInstance {
  readonly port: number;
  readonly url: string;
  readonly close: () => Promise<void>;
}

/**
 * Structured metrics prepared for dashboard presentation.
 */
export interface DashboardViewModel {
  readonly report: CanonicalReport;
  readonly generatedAt: string;
  readonly severityCounts: {
    readonly critical: number;
    readonly high: number;
    readonly medium: number;
    readonly low: number;
    readonly info: number;
  };
  readonly totalFindings: number;
  readonly riskScore: number;
  readonly riskLevel: string;
  readonly confidenceScore: number;
  readonly trustScore: number;
  readonly artifactCount: number;
  readonly evidenceCount: number;
  readonly targetPath: string;
  readonly durationFormatted: string;
}
