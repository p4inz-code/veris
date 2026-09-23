/**
 * @veris/cli/ci — VERIS CI Integration Runner and Automated Security Gates.
 *
 * Implements ADR-015:
 * - Deterministic finding fingerprinting across runs
 * - Baseline loader and comparator
 * - Configurable security policy gate evaluator
 * - Canonical ci-summary.json and GitHub step summary generator
 * - Design-system terminal rendering
 *
 * @module @veris/cli/ci
 */

export * from './types.js';
export * from './fingerprint.js';
export * from './baseline.js';
export * from './comparator.js';
export * from './policy.js';
export * from './summary.js';
export * from './renderer.js';
