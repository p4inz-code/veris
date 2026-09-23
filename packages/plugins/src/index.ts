/**
 * @veris/plugins — VERIS V2 Plugin Host, Contracts, and Architecture Guardrails.
 *
 * ## Architecture
 * - types.ts — Stable extension contracts for Extractor and Rule plugins
 * - manifest.ts — Manifest schema validation and deterministic sorting
 * - lifecycle.ts — Lifecycle state machine and quarantine error containment
 * - diagnostics.ts — Structured diagnostic records and collection
 * - discovery.ts — Filesystem plugin discovery and path traversal guards
 * - loader.ts — Safe ESM dynamic loading and declarative AST purity verification
 * - adapters/ — Adapters to ExtractorRegistry and IRuleRegistry
 * - host.ts — Central PluginHost orchestrator
 *
 * ## Invariants (from SPEC-007, SPEC-010, and ADR-014):
 * - Extractor plugins produce raw features only (never Findings or Risk scores)
 * - Rule plugins provide declarative rule packs only (no arbitrary code execution)
 * - Plugins are offline-first and zero-telemetry
 * - Plugin ordering and output payloads are strictly deterministic
 *
 * @module @veris/plugins
 */

export * from './types.js';
export * from './manifest.js';
export * from './lifecycle.js';
export * from './diagnostics.js';
export * from './discovery.js';
export * from './loader.js';
export * from './adapters/extractor-adapter.js';
export * from './adapters/rule-adapter.js';
export * from './host.js';
