/**
 * ScopeManager — Determines what context to include for an explanation.
 *
 * The scope determines which parts of a CanonicalReport are relevant
 * for a given explanation request. This is always deterministic.
 *
 * @module @veris/explain/engine/scope-manager
 */

import type { CanonicalReport } from '@veris/core';

// ── Scope Types ──

/** The scope of context to include when explaining a finding. */
export interface FindingScope {
  readonly type: 'finding';
  readonly findingId: string;
  readonly evidenceIds: readonly string[];
  readonly ruleId: string;
  readonly artifactIds: readonly string[];
  readonly riskContribution?: {
    readonly dimensionId: string;
    readonly weight: number;
  };
}

/** The scope of context to include when explaining a behavior chain. */
export interface ChainScope {
  readonly type: 'chain';
  readonly chainId: string;
  readonly findingIds: readonly string[];
}

/** The scope of context to include when explaining a risk dimension. */
export interface RiskScope {
  readonly type: 'risk';
  readonly dimensionId: string;
}

/** The scope of context to include when summarizing a report. */
export interface ReportScope {
  readonly type: 'report';
}

/** Union of all possible scope types. */
export type ExplainScope = FindingScope | ChainScope | RiskScope | ReportScope;

// ── ScopeManager Interface ──

/**
 * Determines what context to include for a given explanation request.
 *
 * For a single finding: include that finding, its evidence, the rule that
 * matched, the artifact, and relevant risk context.
 *
 * For a behavior chain: include all findings in the chain, their evidence,
 * and the chain metadata.
 *
 * For a risk dimension: include the dimension score, contributing findings,
 * and top evidence.
 *
 * For the full report: include summary statistics, top findings, and risk overview.
 *
 * Never includes: raw file contents, full artifact lists, internal diagnostics.
 */
export interface ScopeManager {
  /**
   * Determine the scope for explaining a single finding.
   * @param findingId - The ID of the finding to explain.
   * @param report - The canonical report containing the finding.
   * @returns The scope of context to include.
   */
  determineScope(findingId: string, report: CanonicalReport): FindingScope;

  /**
   * Determine the scope for explaining a behavior chain.
   * @param chainId - The ID of the chain to explain.
   * @param report - The canonical report containing the chain.
   * @returns The scope of context to include.
   */
  determineChainScope(chainId: string, report: CanonicalReport): ChainScope;

  /**
   * Determine the scope for explaining a risk dimension.
   * @param dimensionId - The ID of the risk dimension to explain.
   * @param report - The canonical report containing the risk profile.
   * @returns The scope of context to include.
   */
  determineRiskScope(dimensionId: string, report: CanonicalReport): RiskScope;

  /**
   * Determine the scope for summarizing a report.
   * @param report - The canonical report to summarize.
   * @returns The scope for the report summary.
   */
  determineReportScope(report: CanonicalReport): ReportScope;
}

// ── Default ScopeManager Implementation ──

/**
 * Default implementation of ScopeManager.
 *
 * This is a stateless, deterministic implementation that extracts scope
 * based on the canonical report structure.
 *
 * Fully implemented in M3.
 */
export function createScopeManager(): ScopeManager {
  return {
    determineScope(findingId: string, report: CanonicalReport): FindingScope {
      const finding = report.findings.find((f) => f.id === findingId);
      if (!finding) {
        throw new Error(`Finding not found: ${findingId}`);
      }
      return {
        type: 'finding',
        findingId: finding.id,
        evidenceIds: finding.evidenceIds ?? [],
        ruleId: finding.ruleId,
        artifactIds: finding.affectedArtifacts?.map((a) => a.artifactId) ?? [],
        riskContribution: findRiskContribution(findingId, report),
      };
    },

    determineChainScope(chainId: string, report: CanonicalReport): ChainScope {
      const chain = report.behaviorChains?.find((c) => c.id === chainId);
      if (!chain) {
        throw new Error(`Behavior chain not found: ${chainId}`);
      }
      return {
        type: 'chain',
        chainId: chain.id,
        findingIds: chain.findingIds ?? [],
      };
    },

    determineRiskScope(dimensionId: string, report: CanonicalReport): RiskScope {
      // Validate that the dimension (risk driver finding) exists
      const driver = report.riskProfile.riskDrivers?.find((d) => d.findingId === dimensionId);
      if (!driver) {
        // Allow unknown dimension IDs — they'll produce a partial context
      }
      return {
        type: 'risk',
        dimensionId,
      };
    },

    determineReportScope(_report: CanonicalReport): ReportScope {
      return { type: 'report' };
    },
  };
}

// ── Helpers ──

/**
 * Find the risk contribution for a specific finding.
 * Returns undefined if the finding is not a top risk driver.
 */
function findRiskContribution(
  findingId: string,
  report: CanonicalReport,
): { dimensionId: string; weight: number } | undefined {
  const driver = report.riskProfile.riskDrivers?.find((d) => d.findingId === findingId);
  if (!driver) return undefined;

  return {
    dimensionId: findingId,
    weight: driver.contribution,
  };
}
