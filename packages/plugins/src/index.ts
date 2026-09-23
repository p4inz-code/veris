/**
 * @veris/plugins — VERIS V2 Plugin Host, Contracts, and Architecture Guardrails.
 *
 * ## Architecture
 * - types.ts — Stable extension contracts for Extractor and Rule plugins
 * - manifest.ts — Manifest schema validation and deterministic sorting
 * - lifecycle.ts — Lifecycle state machine and quarantine error containment
 *
 * ## Invariants (from SPEC-007 and SPEC-010):
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
