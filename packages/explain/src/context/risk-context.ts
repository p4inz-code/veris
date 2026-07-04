/**
 * Risk context builder — transforms a canonical RiskProfile into Explained types.
 *
 * Builds:
 * - ExplainedRiskProfile with overall score, level, and dimension breakdown
 * - Trust score context
 *
 * @module @veris/explain/context/risk-context
 */

import type { CanonicalReport } from '@veris/core';

import type { ExplainedRiskProfile } from '../types/context.js';

/**
 * Build ExplainedRiskProfile from a canonical CanonicalReport.
 *
 * Extracts:
 * - Overall risk score and level
 * - Dimension breakdown (from risk drivers)
 * - Trust score
 *
 * @param report - The canonical report containing risk profile.
 * @returns ExplainedRiskProfile with readonly fields.
 */
export function buildExplainedRiskProfile(report: CanonicalReport): ExplainedRiskProfile {
  const riskProfile = report.riskProfile;

  // Build dimensions from risk drivers
  const dimensions = riskProfile.riskDrivers?.map((driver) => {
    // Map each risk driver to a dimension entry
    const finding = report.findings.find((f) => f.id === driver.findingId);
    return {
      id: driver.findingId,
      name: finding?.title ?? `Finding ${driver.findingId}`,
      score: finding?.severity.score ?? riskProfile.riskScore,
      contribution: driver.contribution,
    };
  });

  return {
    overallScore: riskProfile.riskScore,
    overallLevel: riskProfile.riskLevel,
    dimensions: dimensions?.length ? dimensions : undefined,
    trustScore: report.trustProfile?.trustScore,
  };
}

/**
 * Get a risk context summary for a specific dimension.
 *
 * @param dimensionId - The dimension ID to look up.
 * @param report - The canonical report.
 * @returns A risk profile focused on the specific dimension, or the full profile if not found.
 */
export function buildRiskDimensionContext(
  dimensionId: string,
  report: CanonicalReport,
): ExplainedRiskProfile {
  const fullProfile = buildExplainedRiskProfile(report);

  // If dimensions exist, filter to the requested one
  if (fullProfile.dimensions) {
    const dimension = fullProfile.dimensions.find((d) => d.id === dimensionId);
    if (dimension) {
      return {
        overallScore: dimension.score,
        overallLevel: scoreToLevel(dimension.score),
        dimensions: [dimension],
        trustScore: fullProfile.trustScore,
      };
    }
  }

  return fullProfile;
}

/**
 * Convert a numeric score to a risk level string.
 */
function scoreToLevel(score: number): 'critical' | 'high' | 'medium' | 'low' | 'negligible' {
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 5.0) return 'medium';
  if (score >= 3.0) return 'low';
  return 'negligible';
}
