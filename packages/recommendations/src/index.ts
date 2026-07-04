/**
 * @veris/recommendations — VERIS recommendation engine.
 *
 * Transforms deterministic risk assessments into actionable,
 * evidence-backed recommendations with full traceability.
 *
 * ## Pipeline Position
 * Rules → Correlation → Risk → **Recommendations** → AI Assistant
 *
 * ## Core Invariants
 * - No AI — every recommendation comes from deterministic logic over concrete evidence.
 * - No invented advice — every recommendation references at least one source.
 * - Fully explainable — every recommendation traces to rules, correlations, evidence, or docs.
 * - Immutable outputs — every object is frozen, every array is readonly.
 * - AI may later explain recommendations, but AI NEVER creates them.
 *
 * @module @veris/recommendations
 */

// Types
export type {
  RecommendationId,
  RecommendationPriority,
  RecommendationCategory,
  RecommendationAction,
  RecommendationSource,
  RecommendationReference,
  DocumentationReference,
  RecommendationAssessment,
  Recommendation,
  RecommendationInput,
  RecommendationResult,
  RecommendationCollection,
} from './types.js';

// Branded values from types.ts
export { CATEGORIES, ACTIONS, SOURCE_TYPES } from './types.js';

// Constants
export {
  // Versioning
  SCHEMA_VERSION,
  ENGINE_VERSION,

  // ID prefixes
  RECOMMENDATION_ID_PREFIX,

  // Priority
  PRIORITY_ORDER,
  PRIORITY_RANK,
  PRIORITY_LABELS,

  // Categories
  CATEGORY_LABELS,

  // Actions
  ACTION_LABELS,

  // Priority-to-action
  PRIORITY_DEFAULT_ACTIONS,

  // Defaults
  DEFAULT_MAX_RECOMMENDATIONS,
  DEFAULT_MIN_PRIORITY,
  DEFAULT_TIMEOUT_MS,

  // Assessment bounds
  IMPACT_MIN,
  IMPACT_MAX,
  EFFORT_MIN,
  EFFORT_MAX,

  // Assessment thresholds
  ASSESSMENT_THRESHOLDS,

  // Source types
  SOURCE_TYPE_LABELS,
  SOURCE_TYPE_ORDER,
} from './constants.js';

// Types from constants.ts
export type { AssessmentThresholdsConfig } from './constants.js';

// Registry
export { createRecommendationRegistry } from './registry.js';

export type {
  RecommendationRegistry,
  RegistryValidationFinding,
  RegistryValidationResult,
  ValidationSeverity,
} from './registry.js';

// Engine
export { createRecommendationEngine } from './engine.js';

export type { RecommendationEngine, RecommendationEngineOptions } from './engine.js';

// Explainer
export {
  explainRecommendation,
  explainCategory,
  breakdownByCategory,
  topRecommendations,
} from './explainer.js';

export type {
  RecommendationExplanation,
  CategoryExplanation,
  CategoryBreakdown,
} from './explainer.js';

// Documentation
export { createDocumentationRegistry } from './documentation.js';

export type {
  DocumentationRegistry,
  DocumentationEntry,
  DocumentationValidationResult,
  DocumentationValidationFinding,
  DocumentationValidationSeverity,
} from './documentation.js';

// Built-in recommendations
export {
  BUILT_IN_RECOMMENDATIONS,
  TR01_TROJAN_REMOVAL,
  TR02_QUARANTINE_SUSPICIOUS_FILE,
  PE01_PACKED_EXECUTABLE_REVIEW,
  PE02_SUSPICIOUS_PACKER,
  PS01_REVIEW_POWERSHELL_ACTIVITY,
  PS02_POWERSHELL_OBFUSCATION,
  CR01_CREDENTIAL_EXPOSURE_REVIEW,
  CR02_HARDCODED_CREDENTIAL_REMOVAL,
  AU01_PERSISTENCE_AUDIT,
  AU02_SUSPICIOUS_AUTOSTART,
  JS01_JAVASCRIPT_REVIEW,
  DOC01_OFFICE_DOCUMENT_INSPECTION,
  CERT01_CERTIFICATE_VALIDATION,
  NET01_NETWORK_CONFIGURATION_REVIEW,
  OB01_OBFUSCATED_CODE_ANALYSIS,
} from './built-in-recommendations.js';
