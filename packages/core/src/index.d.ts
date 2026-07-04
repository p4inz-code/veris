/**
 * @veris/core — VERIS canonical domain types, error hierarchy, and constants.
 *
 * This is the foundational package with zero production dependencies.
 * Every other VERIS package depends on the types defined here.
 *
 * ## Package invariants (from SPEC-010 §3):
 * - F1: @veris/core imports nothing from the monorepo
 * - D1: All objects are immutable after creation
 * - D2: IDs are deterministic for content-derived objects
 * - D5: Every serialized object includes schemaVersion
 */
export * from './types/analysis.js';
export * from './types/artifact.js';
export * from './types/discovery.js';
export * from './types/finding.js';
export * from './types/severity.js';
export * from './types/location.js';
export * from './types/taxonomy.js';
export * from './types/report.js';
export * from './types/rule.js';
export * from './errors/veris-error.js';
export * from './errors/parse-error.js';
export * from './errors/extract-error.js';
export * from './errors/rule-error.js';
export * from './constants/limits.js';
export * from './constants/platform.js';
//# sourceMappingURL=index.d.ts.map
