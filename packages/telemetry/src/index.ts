/**
 * @veris/telemetry — VERIS metrics, tracing, and diagnostics.
 *
 * Provides counters, gauges, histograms, span-based tracing, and
 * diagnostic event collection.
 *
 * ## Invariants
 * - Telemetry is never required for analysis
 * - Telemetry is always opt-in
 * - No PII or sensitive data is ever collected
 *
 * @module @veris/telemetry
 */

export type {
  DiagLevel,
  DiagEvent,
  Counter,
  Gauge,
  Histogram,
  Span,
  MemorySnapshot,
  TelemetryReporter,
} from './telemetry.js';
export {
  NoopReporter,
  ConsoleReporter,
  DiagnosticsCollector,
  createDiagnosticsCollector,
} from './telemetry.js';
