/**
 * @veris/plugin-sdk — Public Developer SDK for authoring VERIS V2 Plugins.
 *
 * Provides type-safe contracts, pure builders, and constants for authoring:
 * - Extractor Plugins (custom parsers emitting factual RawFeature[] records)
 * - Rule Pack Plugins (declarative AST rule packs evaluated by VERIS rules engine)
 *
 * ## Invariants (ADR-014):
 * - ZERO runtime dependencies. Standalone package for npm.
 * - Offline-first: network and process spawning denied by default.
 * - Deterministic: no unseeded randomness, no wall-clock timestamps in features.
 * - Raw features only: extractors NEVER emit findings, risk scores, or report objects.
 * - Declarative rule packs: no arbitrary executable code or lambdas in rules.
 *
 * @module @veris/plugin-sdk
 */

export * from './constants/index.js';
export * from './types/index.js';
export * from './builders/index.js';
export * from './errors/index.js';
