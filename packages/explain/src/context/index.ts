/**
 * Context module barrel export.
 *
 * @module @veris/explain/context
 */

export type { ContextBuilder } from './context-builder.js';
export { createContextBuilder } from './context-builder.js';

export {
  buildExplainedFinding,
  buildExplainedEvidenceList,
  buildExplainedRule,
  buildExplainedArtifact,
  buildFindingContext,
} from './finding-context.js';

export { buildExplainedChain, buildChainContext } from './chain-context.js';
export type { ChainBuildResult } from './chain-context.js';

export { buildExplainedRiskProfile, buildRiskDimensionContext } from './risk-context.js';

export { buildExplainedReportSummary, calculateSeverityPercentages } from './report-context.js';

export {
  sortExplainedEvidence,
  sortCanonicalEvidence,
  limitEvidence,
} from './evidence-ordering.js';

export {
  serializeContext,
  hashContext,
  deepFreeze,
  getContextSchemaVersion,
} from './serializer.js';
