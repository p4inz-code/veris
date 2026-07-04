import { describe, it, expect } from 'vitest';
import { DiagnosticsCollector, NoopReporter } from '../src/telemetry.js';

describe('DiagnosticsCollector', () => {
  it('records diagnostic events', () => {
    const diag = new DiagnosticsCollector();
    diag.event('info', 'test', 'CODE_001', 'Test event', { key: 'value' });
    const events = diag.getEvents();
    expect(events).toHaveLength(1);
    expect(events[0].code).toBe('CODE_001');
    expect(events[0].data?.key).toBe('value');
  });

  it('increments counters', () => {
    const diag = new DiagnosticsCollector();
    diag.incrementCounter('files.processed');
    diag.incrementCounter('files.processed');
    diag.incrementCounter('files.processed', 3);
    const counters = diag.getCounters();
    expect(counters['files.processed']).toBe(5);
  });

  it('sets gauge value', () => {
    const diag = new DiagnosticsCollector();
    diag.setGauge('memory.usage', 456);
    expect(diag.getGauges()['memory.usage']).toBe(456);
  });

  it('records histograms', () => {
    const diag = new DiagnosticsCollector();
    diag.recordHistogram('extraction.time', 100);
    diag.recordHistogram('extraction.time', 200);
    diag.recordHistogram('extraction.time', 300);

    const hist = diag.getHistogram('extraction.time');
    expect(hist).not.toBeNull();
    expect(hist!.count).toBe(3);
    expect(hist!.avg).toBe(200);
    expect(hist!.min).toBe(100);
    expect(hist!.max).toBe(300);
  });

  it('returns null for empty histogram', () => {
    const diag = new DiagnosticsCollector();
    expect(diag.getHistogram('nonexistent')).toBeNull();
  });

  it('creates and ends timing spans', () => {
    const diag = new DiagnosticsCollector();
    const span = diag.startSpan('test-operation', { file: 'test.ts' });
    expect(span.name).toBe('test-operation');
    expect(span.status).toBe('ok');

    const ended = diag.endSpan(span);
    expect(ended.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('records error span', () => {
    const diag = new DiagnosticsCollector();
    const span = diag.startSpan('failing-operation');
    const ended = diag.endSpan(span, 'Something went wrong');
    expect(ended.status).toBe('error');
    expect(ended.error).toBe('Something went wrong');
  });

  it('takes memory snapshots', () => {
    const diag = new DiagnosticsCollector();
    const snapshot = diag.getMemorySnapshot();
    expect(snapshot.heapUsed).toBeGreaterThan(0);
    expect(snapshot.rss).toBeGreaterThan(0);
    expect(snapshot.timestamp).toBeTruthy();
  });

  it('resets all collected data', () => {
    const diag = new DiagnosticsCollector();
    diag.event('info', 'test', 'C1', 'Event 1');
    diag.incrementCounter('counter1');
    diag.recordHistogram('hist1', 100);
    expect(diag.getEvents()).toHaveLength(1);

    diag.reset();
    expect(diag.getEvents()).toHaveLength(0);
    expect(diag.getCounters()).toEqual({});
    expect(diag.getHistogram('hist1')).toBeNull();
  });
});
