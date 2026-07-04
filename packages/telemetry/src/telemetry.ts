/**
 * Diagnostics, metrics, and tracing framework for VERIS.
 *
 * Provides:
 * - Diagnostic events (timing, counters, gauges)
 * - Pipeline spans (performance tracing)
 * - Memory snapshots
 * - Performance collectors
 *
 * ## Invariants
 * - Telemetry is never required for analysis
 * - Telemetry is always opt-in
 * - No PII or sensitive data is ever collected
 *
 * @module @veris/telemetry/telemetry
 */

/** Diagnostic event severity. */
export type DiagLevel = 'info' | 'warn' | 'error';

/** A single diagnostic event. */
export interface DiagEvent {
  readonly timestamp: string;
  readonly level: DiagLevel;
  readonly category: string;
  readonly code: string;
  readonly message: string;
  readonly data?: Record<string, unknown>;
}

/** Counter metric — a monotonically increasing integer. */
export interface Counter {
  readonly name: string;
  readonly value: number;
}

/** Gauge metric — a value that can go up and down. */
export interface Gauge {
  readonly name: string;
  readonly value: number;
}

/** Histogram metric — a distribution of values. */
export interface Histogram {
  readonly name: string;
  readonly count: number;
  readonly sum: number;
  readonly min: number;
  readonly max: number;
  readonly avg: number;
}

/** A timed operation span. */
export interface Span {
  readonly name: string;
  readonly startTime: string;
  readonly endTime?: string;
  readonly durationMs?: number;
  readonly attributes: Record<string, unknown>;
  readonly status: 'ok' | 'error';
  readonly error?: string;
}

/** Memory snapshot data. */
export interface MemorySnapshot {
  readonly timestamp: string;
  readonly heapUsed: number;
  readonly heapTotal: number;
  readonly external: number;
  readonly rss: number;
  readonly arrayBuffers: number;
}

/** Reporter interface — pluggable destination for telemetry data. */
export interface TelemetryReporter {
  /** Report a diagnostic event. */
  reportEvent(event: DiagEvent): void;
  /** Report a metric value. */
  reportMetric(metric: Counter | Gauge | Histogram): void;
  /** Report a completed span. */
  reportSpan(span: Span): void;
  /** Flush any buffered data. */
  flush(): Promise<void>;
}

/** No-op reporter that discards all telemetry data. */
export class NoopReporter implements TelemetryReporter {
  reportEvent(_event: DiagEvent): void {}
  reportMetric(_metric: Counter | Gauge | Histogram): void {}
  reportSpan(_span: Span): void {}
  async flush(): Promise<void> {}
}

/** Console reporter that outputs telemetry data to stdout/stderr. */
export class ConsoleReporter implements TelemetryReporter {
  reportEvent(event: DiagEvent): void {
    const prefix = `[${event.level.toUpperCase()}] [${event.category}]`;
    process.stderr.write(`${prefix} ${event.message}\n`);
  }

  reportMetric(metric: Counter | Gauge | Histogram): void {
    if ('count' in metric) {
      process.stdout.write(
        `[METRIC] ${metric.name}: avg=${metric.avg.toFixed(2)} count=${metric.count}\n`,
      );
    } else {
      process.stdout.write(`[METRIC] ${metric.name}: ${metric.value}\n`);
    }
  }

  reportSpan(span: Span): void {
    const dur = span.durationMs ? `${span.durationMs.toFixed(2)}ms` : 'in-progress';
    process.stdout.write(`[SPAN] ${span.name}: ${dur} ${span.status}\n`);
  }

  async flush(): Promise<void> {}
}

/**
 * Diagnostic collector — the primary interface for recording diagnostics.
 */
export class DiagnosticsCollector {
  private readonly events: DiagEvent[] = [];
  private readonly counters: Map<string, number> = new Map();
  private readonly gauges: Map<string, number> = new Map();
  private readonly histograms: Map<string, number[]> = new Map();
  private readonly reporter: TelemetryReporter;

  constructor(reporter?: TelemetryReporter) {
    this.reporter = reporter ?? new NoopReporter();
  }

  /** Record a diagnostic event. */
  event(
    level: DiagLevel,
    category: string,
    code: string,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    const event: DiagEvent = {
      timestamp: new Date().toISOString(),
      level,
      category,
      code,
      message,
      data,
    };
    this.events.push(event);
    this.reporter.reportEvent(event);
  }

  /** Increment a counter by the given value (default 1). */
  incrementCounter(name: string, value = 1): void {
    const current = this.counters.get(name) ?? 0;
    this.counters.set(name, current + value);
    this.reporter.reportMetric({ name, value: current + value });
  }

  /** Set a gauge to a specific value. */
  setGauge(name: string, value: number): void {
    this.gauges.set(name, value);
    this.reporter.reportMetric({ name, value });
  }

  /** Get all gauge values. */
  getGauges(): Record<string, number> {
    return Object.fromEntries(this.gauges);
  }

  /** Record a value in a histogram. */
  recordHistogram(name: string, value: number): void {
    const values = this.histograms.get(name) ?? [];
    values.push(value);
    this.histograms.set(name, values);
  }

  /** Create a timing span. */
  startSpan(name: string, attributes?: Record<string, unknown>): Span {
    return {
      name,
      startTime: new Date().toISOString(),
      attributes: attributes ?? {},
      status: 'ok',
    };
  }

  /** End a timing span and record it. Returns the completed span. */
  endSpan(span: Span, error?: string): Span {
    const endMs = Date.now();
    const startMs = new Date(span.startTime).getTime();
    const ended: Span = {
      name: span.name,
      startTime: span.startTime,
      endTime: new Date(endMs).toISOString(),
      durationMs: Math.max(0, endMs - startMs),
      attributes: span.attributes,
      status: error ? 'error' : 'ok',
      error,
    };
    this.reporter.reportSpan(ended);
    return ended;
  }

  /** Get a memory snapshot. */
  getMemorySnapshot(): MemorySnapshot {
    const usage = process.memoryUsage();
    return {
      timestamp: new Date().toISOString(),
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
      arrayBuffers: usage.arrayBuffers ?? 0,
    };
  }

  /** Get all collected events. */
  getEvents(): readonly DiagEvent[] {
    return [...this.events];
  }

  /** Get all collected counter values. */
  getCounters(): Record<string, number> {
    return Object.fromEntries(this.counters);
  }

  /** Get histogram statistics. */
  getHistogram(name: string): Histogram | null {
    const values = this.histograms.get(name);
    if (!values || values.length === 0) return null;

    const sum = values.reduce((a, b) => a + b, 0);
    return {
      name,
      count: values.length,
      sum,
      min: Math.min(...values),
      max: Math.max(...values),
      avg: sum / values.length,
    };
  }

  /** Reset all collected data. */
  reset(): void {
    this.events.length = 0;
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  /** Flush all data to the reporter. */
  async flush(): Promise<void> {
    await this.reporter.flush();
  }
}

/** Create a default diagnostics collector. */
export function createDiagnosticsCollector(reporter?: TelemetryReporter): DiagnosticsCollector {
  return new DiagnosticsCollector(reporter);
}
