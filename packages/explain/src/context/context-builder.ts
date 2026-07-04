/**
 * Context builder orchestrator — transforms a scope into a frozen ExplainedContext.
 *
 * Coordinates:
 * - FindingContext → builds ExplainedFinding + evidence + rule + artifact
 * - ChainContext → builds ExplainedChain + findings + evidence
 * - RiskContext → builds ExplainedRiskProfile
 * - ReportContext → builds ExplainedReportSummary
 *
 * @module @veris/explain/context/context-builder
 */

import type { CanonicalReport } from '@veris/core';

import type {
  ExplainScope,
  FindingScope,
  ChainScope,
  RiskScope,
  ReportScope,
} from '../engine/scope-manager.js';
import type { ExplainedContext, ContextTokenBudget } from '../types/context.js';

import { buildChainContext } from './chain-context.js';
import { buildFindingContext } from './finding-context.js';
import { buildExplainedReportSummary } from './report-context.js';
import { buildExplainedRiskProfile, buildRiskDimensionContext } from './risk-context.js';
import { deepFreeze, getContextSchemaVersion } from './serializer.js';

// ── ContextBuilder Interface ──

/**
 * Context builder interface.
 */
export interface ContextBuilder {
  /**
   * Build a frozen ExplainedContext from a scope and report.
   *
   * @param scope - The scope (finding, chain, risk, or report).
   * @param report - The canonical report.
   * @param tokenBudget - Optional token budget allocation.
   * @returns A deeply frozen ExplainedContext.
   * @throws {Error} If the scope references non-existent objects.
   */
  build(
    scope: ExplainScope,
    report: CanonicalReport,
    tokenBudget?: ContextTokenBudget,
  ): ExplainedContext;
}

// ── Implementation ──

/**
 * Default ContextBuilder implementation.
 *
 * Stateless and deterministic — same scope + report always produces
 * the same ExplainedContext.
 */
class ContextBuilderImpl implements ContextBuilder {
  build(
    scope: ExplainScope,
    report: CanonicalReport,
    tokenBudget?: ContextTokenBudget,
  ): ExplainedContext {
    switch (scope.type) {
      case 'finding':
        return this.buildFindingContext(scope, report, tokenBudget);
      case 'chain':
        return this.buildChainContext(scope, report, tokenBudget);
      case 'risk':
        return this.buildRiskContext(scope, report, tokenBudget);
      case 'report':
        return this.buildReportContext(scope, report, tokenBudget);
    }
  }

  // ── Finding Context ──

  private buildFindingContext(
    scope: FindingScope,
    report: CanonicalReport,
    tokenBudget?: ContextTokenBudget,
  ): ExplainedContext {
    const finding = report.findings.find((f) => f.id === scope.findingId);
    if (!finding) {
      throw new Error(`Finding not found: ${scope.findingId}`);
    }

    const context = buildFindingContext(finding, report);

    // Build risk context if available
    const risk = scope.riskContribution ? buildExplainedRiskProfile(report) : undefined;

    // Safe: deepFreeze returns the same shape as the input object literal,
    // which structurally matches ExplainedContext. The intermediate cast via
    // unknown is needed because TypeScript can't verify structural compatibility
    // through the generic deepFreeze return type.
    return deepFreeze({
      subject: context.finding,
      evidence: context.evidence,
      rule: context.rule,
      artifact: context.artifact,
      risk,
      tokenBudget: tokenBudget ?? { allocated: 0, used: 0, remaining: 0 },
      contextSchemaVersion: getContextSchemaVersion(),
    }) as unknown as ExplainedContext;
  }

  // ── Chain Context ──

  private buildChainContext(
    scope: ChainScope,
    report: CanonicalReport,
    tokenBudget?: ContextTokenBudget,
  ): ExplainedContext {
    const chain = report.behaviorChains?.find((c) => c.id === scope.chainId);
    if (!chain) {
      throw new Error(`Behavior chain not found: ${scope.chainId}`);
    }

    const chainContext = buildChainContext(chain, report);

    // Flatten evidence from all findings
    const allEvidence = Object.values(chainContext.evidenceByFinding).flat();
    const risk = buildExplainedRiskProfile(report);

    // Safe: see buildFindingContext — same pattern for chain context.
    return deepFreeze({
      subject: chainContext.chain,
      evidence: allEvidence,
      risk,
      tokenBudget: tokenBudget ?? { allocated: 0, used: 0, remaining: 0 },
      contextSchemaVersion: getContextSchemaVersion(),
    }) as unknown as ExplainedContext;
  }

  // ── Risk Context ──

  private buildRiskContext(
    scope: RiskScope,
    report: CanonicalReport,
    tokenBudget?: ContextTokenBudget,
  ): ExplainedContext {
    const risk = buildRiskDimensionContext(scope.dimensionId, report);

    // Safe: see buildFindingContext — same pattern for risk context.
    return deepFreeze({
      subject: risk,
      evidence: [],
      risk,
      tokenBudget: tokenBudget ?? { allocated: 0, used: 0, remaining: 0 },
      contextSchemaVersion: getContextSchemaVersion(),
    }) as unknown as ExplainedContext;
  }

  // ── Report Context ──

  private buildReportContext(
    _scope: ReportScope,
    report: CanonicalReport,
    tokenBudget?: ContextTokenBudget,
  ): ExplainedContext {
    const reportSummary = buildExplainedReportSummary(report);
    const risk = buildExplainedRiskProfile(report);

    // Safe: see buildFindingContext — same pattern for report context.
    return deepFreeze({
      subject: reportSummary,
      evidence: [],
      risk,
      report: reportSummary,
      tokenBudget: tokenBudget ?? { allocated: 0, used: 0, remaining: 0 },
      contextSchemaVersion: getContextSchemaVersion(),
    }) as unknown as ExplainedContext;
  }
}

// ── Factory Function ──

/**
 * Create a ContextBuilder instance.
 *
 * The builder is stateless and can be shared across requests.
 *
 * @returns A new ContextBuilder instance.
 */
export function createContextBuilder(): ContextBuilder {
  return new ContextBuilderImpl();
}
