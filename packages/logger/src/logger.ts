/**
 * Structured logging framework for VERIS.
 *
 * Provides deterministic, structured logging with:
 * - Multiple log levels (trace, debug, info, warn, error, fatal)
 * - Pluggable transports (console, file, JSON, silent)
 * - Pluggable formatters (structured, pretty, JSON-lines)
 * - Context propagation with correlation IDs
 * - Timing scopes for performance measurement
 *
 * @module @veris/logger/logger
 */

/** Log level enum from most to least verbose. */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/** Numeric values for log levels (lower = more verbose). */
export const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
} as const;

/** All log levels in order. */
export const LOG_LEVELS: readonly LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

/** A single log entry — the atomic unit of logging. */
export interface LogEntry {
  /** ISO 8601 timestamp. */
  readonly timestamp: string;
  /** Log level. */
  readonly level: LogLevel;
  /** Logger name (package or module). */
  readonly logger: string;
  /** Trace ID for correlation. */
  readonly traceId?: string;
  /** Span ID for timing. */
  readonly spanId?: string;
  /** Log message. */
  readonly message: string;
  /** Structured context data. */
  readonly context?: Record<string, unknown>;
  /** Error information (if applicable). */
  readonly error?: {
    readonly name: string;
    readonly message: string;
    readonly code?: string;
    readonly stack?: string;
  };
}

/** Transport interface — pluggable output destination. */
export interface Transport {
  /** Write a log entry to the transport. */
  write(entry: LogEntry): void;
  /** Flush any buffered entries. */
  flush?(): Promise<void>;
  /** Close the transport, releasing any resources. */
  close?(): Promise<void>;
}

/** Formatter interface — converts LogEntry to output string. */
export interface Formatter {
  /** Format a log entry into a string. */
  format(entry: LogEntry): string;
}

/** Logger configuration. */
export interface LoggerConfig {
  /** Minimum log level to emit. */
  readonly level: LogLevel;
  /** Logger name identifier. */
  readonly name: string;
  /** Transports to write to. */
  readonly transports?: Transport[];
  /** Context to include in every log entry. */
  readonly defaultContext?: Record<string, unknown>;
}

/**
 * Structured logger implementation.
 * Immutable configuration — create a new instance to change settings.
 */
export class Logger {
  private readonly config: LoggerConfig;

  constructor(config: LoggerConfig) {
    this.config = {
      ...config,
      transports: config.transports ?? [new ConsoleTransport()],
    };
  }

  /** Create a child logger with additional default context. */
  child(context: Record<string, unknown>): Logger {
    return new Logger({
      ...this.config,
      defaultContext: { ...this.config.defaultContext, ...context },
    });
  }

  /** Create a child logger with a different name. */
  named(name: string): Logger {
    return new Logger({ ...this.config, name });
  }

  /** Log at trace level. */
  trace(message: string, context?: Record<string, unknown>): void {
    this.emit('trace', message, context);
  }

  /** Log at debug level. */
  debug(message: string, context?: Record<string, unknown>): void {
    this.emit('debug', message, context);
  }

  /** Log at info level. */
  info(message: string, context?: Record<string, unknown>): void {
    this.emit('info', message, context);
  }

  /** Log at warn level. */
  warn(message: string, context?: Record<string, unknown>): void {
    this.emit('warn', message, context);
  }

  /** Log at error level. */
  error(
    message: string,
    errorOrContext?: Error | Record<string, unknown>,
    context?: Record<string, unknown>,
  ): void {
    let error: Error | undefined;
    let ctx: Record<string, unknown> | undefined;

    if (errorOrContext instanceof Error) {
      error = errorOrContext;
      ctx = context;
    } else {
      ctx = errorOrContext;
    }

    this.emit('error', message, ctx, error);
  }

  /** Log at fatal level. */
  fatal(
    message: string,
    errorOrContext?: Error | Record<string, unknown>,
    context?: Record<string, unknown>,
  ): void {
    let error: Error | undefined;
    let ctx: Record<string, unknown> | undefined;

    if (errorOrContext instanceof Error) {
      error = errorOrContext;
      ctx = context;
    } else {
      ctx = errorOrContext;
    }

    this.emit('fatal', message, ctx, error);
  }

  /** Check if a log level is enabled. */
  isEnabled(level: LogLevel): boolean {
    return LOG_LEVEL_VALUES[level] >= LOG_LEVEL_VALUES[this.config.level];
  }

  /** Flush all transports. */
  async flush(): Promise<void> {
    for (const transport of this.config.transports ?? []) {
      await transport.flush?.();
    }
  }

  /** Close all transports. */
  async close(): Promise<void> {
    for (const transport of this.config.transports ?? []) {
      await transport.close?.();
    }
  }

  /** Create a timing scope that logs duration on completion. */
  time(spanName: string, context?: Record<string, unknown>): TimingScope {
    return new TimingScope(this, spanName, context);
  }

  private emit(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error,
  ): void {
    if (!this.isEnabled(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      logger: this.config.name,
      message,
      context: { ...this.config.defaultContext, ...context },
      error: error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : undefined,
    };

    for (const transport of this.config.transports ?? []) {
      transport.write(entry);
    }
  }
}

/**
 * Timing scope — logs start and end times for performance measurement.
 */
export class TimingScope {
  private readonly logger: Logger;
  private readonly name: string;
  private readonly startTime: bigint;
  private readonly context?: Record<string, unknown>;

  constructor(logger: Logger, name: string, context?: Record<string, unknown>) {
    this.logger = logger;
    this.name = name;
    this.startTime = process.hrtime.bigint();
    this.context = context;
    logger.debug(`[start] ${name}`, { ...context, spanName: name });
  }

  /** Complete the timing scope and log the duration. */
  end(extraContext?: Record<string, unknown>): number {
    const endTime = process.hrtime.bigint();
    const durationNs = Number(endTime - this.startTime);
    const durationMs = durationNs / 1_000_000;

    this.logger.debug(`[end] ${this.name}`, {
      ...this.context,
      ...extraContext,
      spanName: this.name,
      durationMs,
    });

    return durationMs;
  }
}

// ─── Built-in Transports ────────────────────────────────────────

/** Console transport — writes to stdout/stderr. */
export class ConsoleTransport implements Transport {
  private readonly stderrLevels: Set<LogLevel>;
  private readonly formatter: Formatter;

  constructor(options?: { stderrLevels?: LogLevel[]; formatter?: Formatter }) {
    this.stderrLevels = new Set(options?.stderrLevels ?? ['warn', 'error', 'fatal']);
    this.formatter = options?.formatter ?? new PrettyFormatter();
  }

  write(entry: LogEntry): void {
    const output = this.formatter.format(entry);
    if (this.stderrLevels.has(entry.level)) {
      process.stderr.write(output + '\n');
    } else {
      process.stdout.write(output + '\n');
    }
  }
}

/** JSON-lines transport — writes structured JSON to a stream. */
export class JsonLinesTransport implements Transport {
  private readonly stream: NodeJS.WritableStream;

  constructor(stream: NodeJS.WritableStream = process.stdout) {
    this.stream = stream;
  }

  write(entry: LogEntry): void {
    this.stream.write(JSON.stringify(entry) + '\n');
  }
}

/** Silent transport — discards all log entries. */
export class SilentTransport implements Transport {
  write(_entry: LogEntry): void {
    // Discard all log entries
  }
}

// ─── Built-in Formatters ────────────────────────────────────────

/** Pretty formatter — human-readable with colors (ANSI). */
export class PrettyFormatter implements Formatter {
  private readonly colors: Record<LogLevel, string> = {
    trace: '\x1b[90m', // Gray
    debug: '\x1b[36m', // Cyan
    info: '\x1b[32m', // Green
    warn: '\x1b[33m', // Yellow
    error: '\x1b[31m', // Red
    fatal: '\x1b[35m', // Magenta
  };
  private readonly reset = '\x1b[0m';
  private readonly useColor: boolean;

  constructor(useColor = true) {
    this.useColor = useColor;
  }

  format(entry: LogEntry): string {
    const level = entry.level.toUpperCase().padEnd(5);
    const color = this.useColor ? this.colors[entry.level] : '';
    const reset = this.useColor ? this.reset : '';

    let output = `${color}[${level}]${reset} [${entry.logger}] ${entry.message}`;

    if (entry.context && Object.keys(entry.context).length > 0) {
      output += ` ${color}${JSON.stringify(entry.context)}${reset}`;
    }

    if (entry.error) {
      output += `\n  ${color}Error: ${entry.error.message}${reset}`;
    }

    return output;
  }
}

/** Structured JSON formatter. */
export class StructuredFormatter implements Formatter {
  format(entry: LogEntry): string {
    return JSON.stringify(entry);
  }
}

// ─── Factory ────────────────────────────────────────────────────

/**
 * Create a default logger instance.
 */
export function createLogger(
  name: string,
  options?: {
    level?: LogLevel;
    transports?: Transport[];
    defaultContext?: Record<string, unknown>;
  },
): Logger {
  return new Logger({
    name,
    level: options?.level ?? 'info',
    transports: options?.transports ?? [new ConsoleTransport()],
    defaultContext: options?.defaultContext,
  });
}
