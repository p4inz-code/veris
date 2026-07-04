export type { SeverityLevel, Severity } from './severity.js';
export {
  SEVERITY_LEVELS,
  SEVERITY_THRESHOLDS,
  SEVERITY_ORDER,
  severityLevelFromScore,
  createSeverity,
  compareSeverity,
} from './severity.js';

export type { SourceLocation, ArtifactRef } from './location.js';
export { createSourceLocation } from './location.js';

export type { ArtifactType, ContentHash, Artifact } from './artifact.js';
export { createArtifact } from './artifact.js';

export type {
  SessionStatus,
  SessionConfig,
  EnvironmentInfo,
  SessionError,
  ScanSession,
} from './analysis.js';
export { SessionErrorCodes } from './analysis.js';

export type { TaxonomyId, TaxonomyNode, TaxonomyNodeMetadata, Behavior } from './taxonomy.js';

export type {
  RuleId,
  PackId,
  Rule,
  RuleMetadata,
  RuleLogic,
  PropertyMatcher,
  BehaviorPattern,
  MatchDetail,
  RuleResult,
  RulePack,
} from './rule.js';

export type {
  EvidenceId,
  FindingId,
  BehaviorChainId,
  RecommendationId,
  Evidence,
  Finding,
  ChainRelationshipType,
  BehaviorChain,
  RecommendationPriority,
  RemediationEffort,
  CodeExample,
  ExternalReference,
  Recommendation,
} from './finding.js';

export type {
  ReportId,
  ReportSummary,
  TrustFactor,
  TrustProfile,
  RiskDriver,
  RiskProfile,
  CanonicalReport,
} from './report.js';

export type {
  SymlinkMetadata,
  JunctionMetadata,
  ArtifactDiscoveryDiagnostics,
  DiscoveredArtifact,
  ArtifactNode,
} from './discovery.js';
