/**
 * @veris/logger — VERIS structured logging.
 *
 * Provides deterministic, structured logging with pluggable transports
 * and formatters.
 *
 * ## Invariants
 * - Logger is never used for analysis logic
 * - Log output is deterministic for the same input
 *
 * @module @veris/logger
 */

export type { LogLevel, LogEntry, Transport, Formatter, LoggerConfig } from './logger.js';
export {
  LOG_LEVEL_VALUES,
  LOG_LEVELS,
  Logger,
  TimingScope,
  ConsoleTransport,
  JsonLinesTransport,
  SilentTransport,
  PrettyFormatter,
  StructuredFormatter,
  createLogger,
} from './logger.js';
