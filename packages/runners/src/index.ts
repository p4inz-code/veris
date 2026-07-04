/**
 * @veris/runners — VERIS execution environment adapters.
 *
 * ## Runner types
 * - LocalRunner — Local filesystem scanning
 * - CiRunner — CI integration (stdin/stdout)
 * - DaemonRunner — Watch mode / persistent
 *
 * ## Invariants
 * - Runners delegate all analysis to @veris/analyzer
 * - Runners handle environment-specific concerns only
 */
export {};
