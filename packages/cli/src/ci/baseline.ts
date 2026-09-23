/**
 * @veris/cli/ci/baseline — Hardened baseline parser and loader.
 *
 * Implements Section 5 & Section 9 of ADR-015:
 * - Safe JSON parsing with prototype pollution defense
 * - 50MB file size ceiling to prevent heap exhaustion
 * - Schema validation for CanonicalReport and CiSummary baselines
 * - Deterministic baseline finding extraction
 *
 * @module @veris/cli/ci/baseline
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import type { Artifact, Finding } from '@veris/core';

import { CliError, ExitCode } from '../wirer.js';

import { computeFindingFingerprint } from './fingerprint.js';
import type { BaselineData, BaselineFinding, CiSummary, SeverityLevel } from './types.js';

/** Maximum permitted baseline file size (50 MB). */
export const MAX_BASELINE_SIZE_BYTES = 50 * 1024 * 1024;

/** Dangerous property names forbidden during JSON deserialization. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Recursively sanitize parsed JSON values to prevent prototype pollution.
 * Drops forbidden keys and constructs null-prototype objects.
 */
function sanitizeJsonValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return Object.freeze(value.map(sanitizeJsonValue));
  }

  const clean: Record<string, unknown> = Object.create(null);
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key)) {
      continue; // Drop dangerous prototype keys
    }
    clean[key] = sanitizeJsonValue(val);
  }

  return Object.freeze(clean);
}

/**
 * Safely parse a JSON string with prototype pollution defenses.
 *
 * @param jsonText - Raw JSON text.
 * @returns Sanitized object hierarchy.
 * @throws CliError with ExitCode.INVALID_BASELINE if parsing fails.
 */
export function safeJsonParse<T = unknown>(jsonText: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CliError(`Malformed baseline JSON: ${msg}`, ExitCode.INVALID_BASELINE);
  }

  return sanitizeJsonValue(parsed) as T;
}

/**
 * Type guard for CanonicalReport structure.
 */
function isCanonicalReport(obj: Record<string, unknown>): obj is Record<string, unknown> & {
  findings: readonly Finding[];
  artifacts?: readonly Artifact[];
} {
  return Array.isArray(obj.findings);
}

/**
 * Type guard for CiSummary structure.
 */
function isCiSummary(obj: Record<string, unknown>): obj is Record<string, unknown> & {
  metrics: { currentRiskScore: number };
  diffs?: readonly unknown[];
} {
  return (
    typeof obj.metrics === 'object' &&
    obj.metrics !== null &&
    typeof (obj.metrics as { currentRiskScore?: unknown }).currentRiskScore === 'number'
  );
}

/**
 * Load and validate a baseline file from disk.
 *
 * Supports:
 * 1. CanonicalReport (`report.json`)
 * 2. CiSummary (`ci-summary.json`)
 *
 * @param baselinePath - Path to the baseline file.
 * @param workspaceDir - Optional workspace root for relative resolution.
 * @returns Validated BaselineData.
 * @throws CliError with ExitCode.INVALID_BASELINE if baseline is missing or invalid.
 */
export async function loadBaseline(
  baselinePath: string,
  workspaceDir?: string,
): Promise<BaselineData> {
  if (!baselinePath || typeof baselinePath !== 'string') {
    throw new CliError('Baseline file path must be specified', ExitCode.INVALID_BASELINE);
  }

  const root = workspaceDir ? path.resolve(workspaceDir) : process.cwd();
  const resolvedPath = path.isAbsolute(baselinePath)
    ? path.resolve(baselinePath)
    : path.resolve(root, baselinePath);

  // Check file stats
  let stat;
  try {
    stat = await fsp.stat(resolvedPath);
  } catch {
    throw new CliError(
      `Baseline file not found or unreadable: ${resolvedPath}`,
      ExitCode.INVALID_BASELINE,
    );
  }

  if (stat.isDirectory()) {
    throw new CliError(
      `Baseline path is a directory, expected a file: ${resolvedPath}`,
      ExitCode.INVALID_BASELINE,
    );
  }

  if (stat.size > MAX_BASELINE_SIZE_BYTES) {
    throw new CliError(
      `Baseline file exceeds maximum size limit (50 MB): ${(stat.size / (1024 * 1024)).toFixed(1)} MB`,
      ExitCode.INVALID_BASELINE,
    );
  }

  // Read and parse
  let content: string;
  try {
    content = await fsp.readFile(resolvedPath, 'utf-8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CliError(`Failed to read baseline file: ${msg}`, ExitCode.INVALID_BASELINE);
  }

  const data = safeJsonParse<Record<string, unknown>>(content);

  if (!data || typeof data !== 'object') {
    throw new CliError(
      'Baseline file does not contain a valid JSON object',
      ExitCode.INVALID_BASELINE,
    );
  }

  // ── Strategy 1: CanonicalReport (report.json) ──
  if (isCanonicalReport(data)) {
    const artifactsById = new Map<string, Artifact>();
    if (Array.isArray(data.artifacts)) {
      for (const art of data.artifacts as Artifact[]) {
        if (art && art.id) {
          artifactsById.set(art.id, art);
        }
      }
    }

    const baselineFindings: BaselineFinding[] = [];
    for (const f of data.findings) {
      if (!f || typeof f !== 'object') continue;
      const fp = computeFindingFingerprint(f, artifactsById);
      const severityLevel = (f.severity?.level ?? 'info') as SeverityLevel;
      const score = typeof f.severity?.score === 'number' ? f.severity.score : 0;
      const confidence = typeof f.confidence === 'number' ? f.confidence : 0.5;
      const evidenceCount = Array.isArray(f.evidenceIds) ? f.evidenceIds.length : 0;

      baselineFindings.push(
        Object.freeze({
          fingerprint: fp.hash,
          ruleId: fp.ruleId,
          artifactPath: fp.artifactPath,
          title: fp.title,
          severity: severityLevel,
          score,
          confidence,
          evidenceCount,
          originalFindingId: f.id,
        }),
      );
    }

    const riskProfile = data.riskProfile as { riskScore?: number } | undefined;
    const summary = data.summary as { riskScore?: number } | undefined;
    const riskScore =
      typeof riskProfile?.riskScore === 'number'
        ? riskProfile.riskScore
        : typeof summary?.riskScore === 'number'
          ? summary.riskScore
          : 0;

    const generatedAt =
      typeof data.generatedAt === 'string'
        ? data.generatedAt
        : typeof (data.session as { startedAt?: string })?.startedAt === 'string'
          ? (data.session as { startedAt: string }).startedAt
          : undefined;

    return Object.freeze({
      sourcePath: resolvedPath,
      riskScore,
      findings: Object.freeze(baselineFindings),
      generatedAt,
    });
  }

  // ── Strategy 2: CiSummary (ci-summary.json) ──
  if (isCiSummary(data)) {
    const summary = data as unknown as CiSummary;
    const baselineFindings: BaselineFinding[] = [];

    // Extract findings from diffs in previous CI summary
    if (Array.isArray(summary.diffs)) {
      for (const entry of summary.diffs) {
        if (!entry || entry.status === 'resolved') continue;
        const severity = (entry.currentSeverity ?? 'info') as SeverityLevel;
        const score = typeof entry.currentScore === 'number' ? entry.currentScore : 0;

        baselineFindings.push(
          Object.freeze({
            fingerprint: entry.fingerprint,
            ruleId: entry.ruleId,
            artifactPath: entry.artifactPath,
            title: entry.title,
            severity,
            score,
            confidence: 0.8,
            evidenceCount: 1,
            originalFindingId: entry.currentFindingId,
          }),
        );
      }
    }

    return Object.freeze({
      sourcePath: resolvedPath,
      riskScore: summary.metrics.currentRiskScore,
      findings: Object.freeze(baselineFindings),
      generatedAt: summary.timestamp,
    });
  }

  throw new CliError(
    'Baseline file format unrecognized. Expected VERIS CanonicalReport or CiSummary JSON.',
    ExitCode.INVALID_BASELINE,
  );
}
