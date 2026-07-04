/**
 * Chain context builder — transforms a canonical BehaviorChain into Explained types.
 *
 * Builds:
 * - ExplainedChain (chain metadata)
 * - Associated findings and their evidence
 *
 * @module @veris/explain/context/chain-context
 */

import type { CanonicalReport, BehaviorChain } from '@veris/core';

import type { ExplainedChain, ExplainedFinding, ExplainedEvidence } from '../types/context.js';

import { sortExplainedEvidence, limitEvidence } from './evidence-ordering.js';
import { buildExplainedFinding, buildExplainedEvidenceList } from './finding-context.js';

/** Maximum evidence items per finding in chain context. */
const MAX_EVIDENCE_PER_FINDING = 5;

/**
 * Build ExplainedChain from a canonical BehaviorChain.
 *
 * @param chain - The canonical BehaviorChain.
 * @returns ExplainedChain with readonly fields.
 */
export function buildExplainedChain(chain: BehaviorChain): ExplainedChain {
  return {
    id: chain.id,
    name: chain.description?.slice(0, 60) ?? `Chain ${chain.id}`,
    description: chain.description,
    severity: chain.findingIds?.length
      ? { level: 'medium', score: 5.0 } // Severity derived from findings
      : { level: 'info', score: 0.0 },
    findingIds: chain.findingIds ?? [],
  };
}

/**
 * Result of building context for a behavior chain.
 */
export interface ChainBuildResult {
  readonly chain: ExplainedChain;
  readonly findings: readonly ExplainedFinding[];
  readonly evidenceByFinding: Record<string, readonly ExplainedEvidence[]>;
}

/**
 * Build complete context for a behavior chain.
 *
 * Includes the chain metadata, all associated findings,
 * and their evidence (sorted and limited).
 *
 * @param chain - The canonical BehaviorChain.
 * @param report - The canonical report containing findings.
 * @returns ChainBuildResult with chain, findings, and evidence.
 */
export function buildChainContext(chain: BehaviorChain, report: CanonicalReport): ChainBuildResult {
  const explainedChain = buildExplainedChain(chain);
  const findingIds = chain.findingIds ?? [];

  // Build findings and their evidence
  const findings: ExplainedFinding[] = [];
  const evidenceByFinding: Record<string, readonly ExplainedEvidence[]> = {};

  for (const findingId of findingIds) {
    const finding = report.findings.find((f) => f.id === findingId);
    if (!finding) continue;

    const explainedFinding = buildExplainedFinding(finding);
    findings.push(explainedFinding);

    // Build and limit evidence per finding
    const evidence = buildExplainedEvidenceList(finding.evidenceIds ?? [], report);
    evidenceByFinding[findingId] = limitEvidence(
      sortExplainedEvidence(evidence),
      MAX_EVIDENCE_PER_FINDING,
    );
  }

  return {
    chain: explainedChain,
    findings: Object.freeze(findings),
    evidenceByFinding,
  };
}
