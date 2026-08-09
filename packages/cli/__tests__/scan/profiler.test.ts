/**
 * Tests for Profiler infrastructure.
 */

import { describe, it, expect } from 'vitest';
import { Profiler, formatStageTiming } from '../../src/scan/profiler.js';

describe('Profiler', () => {
  it('creates a profiler with a unique ID', () => {
    const profiler = new Profiler('2026-07-11T00:00:00.000Z');
    expect(profiler.profilerId).toContain('profiler');
    expect(profiler.startTime).toBeGreaterThan(0);
    expect(profiler.isComplete).toBe(false);
  });

  it('starts and finishes a stage', () => {
    const profiler = new Profiler('2026-07-11T00:00:00.000Z');
    profiler.start('discovery');
    profiler.finish('discovery', { processed: 100 });

    const timing = profiler.getStageTiming('discovery');
    expect(timing).toBeDefined();
    expect(timing!.stage).toBe('discovery');
    expect(timing!.durationMs).toBeGreaterThanOrEqual(0);
    expect(timing!.itemsProcessed).toBe(100);
  });

  it('auto-finishes previous stage when starting a new one', () => {
    const profiler = new Profiler('2026-07-11T00:00:00.000Z');
    profiler.start('discovery');
    profiler.start('classification');

    const discoveryTiming = profiler.getStageTiming('discovery');
    expect(discoveryTiming).toBeDefined();
    expect(discoveryTiming!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('records per-call statistics', () => {
    const profiler = new Profiler('2026-07-11T00:00:00.000Z');
    profiler.start('extraction');
    profiler.finish('extraction', { processed: 10 });
    profiler.start('extraction');
    profiler.finish('extraction', { processed: 20 });

    const stats = profiler.getStageStats('extraction');
    expect(stats.callCount).toBe(2);
    expect(stats.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(stats.totalItemsProcessed).toBe(30);
  });

  it('records file timings', () => {
    const profiler = new Profiler('2026-07-11T00:00:00.000Z');
    profiler.recordFile('/path/to/file.exe', 'extraction', 150, true);

    const fileTimings = profiler.getFileTimings();
    expect(fileTimings.length).toBe(1);
    expect(fileTimings[0].path).toBe('/path/to/file.exe');
    expect(fileTimings[0].durationMs).toBe(150);
    expect(fileTimings[0].success).toBe(true);
  });

  it('identifies slowest and fastest files', () => {
    const profiler = new Profiler('2026-07-11T00:00:00.000Z');
    profiler.recordFile('/path/to/slow.exe', 'extraction', 500, true);
    profiler.recordFile('/path/to/fast.exe', 'extraction', 10, true);
    profiler.recordFile('/path/to/medium.exe', 'extraction', 100, true);

    const slowest = profiler.getSlowestFile();
    expect(slowest).toBeDefined();
    expect(slowest!.durationMs).toBe(500);
    expect(slowest!.path).toContain('slow');

    const fastest = profiler.getFastestFile();
    expect(fastest).toBeDefined();
    expect(fastest!.durationMs).toBe(10);
    expect(fastest!.path).toContain('fast');
  });

  it('returns undefined for slowest/fastest when no files', () => {
    const profiler = new Profiler('2026-07-11T00:00:00.000Z');
    expect(profiler.getSlowestFile()).toBeUndefined();
    expect(profiler.getFastestFile()).toBeUndefined();
  });

  it('produces a snapshot with all timing data', () => {
    const profiler = new Profiler('2026-07-11T00:00:00.000Z');
    profiler.start('discovery');
    profiler.finish('discovery', { processed: 50 });
    profiler.start('classification');
    profiler.finish('classification', { processed: 30 });
    profiler.complete();

    const snapshot = profiler.snapshot();
    expect(snapshot.id).toBe(profiler.profilerId);
    expect(snapshot.completed).toBe(true);
    expect(snapshot.stages.length).toBe(2);
    expect(snapshot.stats.length).toBeGreaterThanOrEqual(2);
    expect(snapshot.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(snapshot.endedAt).toBeGreaterThanOrEqual(snapshot.startedAt);
  });

  it('resets all data', () => {
    const profiler = new Profiler('2026-07-11T00:00:00.000Z');
    profiler.start('discovery');
    profiler.finish('discovery');
    profiler.recordFile('/path/to/file', 'extraction', 100, true);
    profiler.complete();

    profiler.reset();
    expect(profiler.isComplete).toBe(false);
    expect(profiler.getFileTimings().length).toBe(0);
    expect(profiler.getStageTiming('discovery')).toBeUndefined();
  });
});

describe('formatStageTiming', () => {
  it('formats a timing line', () => {
    const timing = Object.freeze({
      stage: 'discovery' as const,
      startMs: 1000,
      endMs: 2000,
      durationMs: 1000,
      itemsProcessed: 50,
      itemsFailed: 2,
    });

    const result = formatStageTiming(timing, 5000, 'discovery');
    expect(result).toContain('discovery');
    expect(result).toContain('1000');
    expect(result).toContain('50 items');
    expect(result).toContain('2 failed');
  });
});
