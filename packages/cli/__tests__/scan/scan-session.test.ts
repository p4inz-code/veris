/**
 * Tests for Scan Session Model.
 */

import { describe, it, expect } from 'vitest';
import {
  createScanSession,
  updateSession,
  PIPELINE_STAGE_LABELS,
  type ScanConfig,
  type ScanSession,
} from '../../src/scan/scan-session.js';

function createTestConfig(overrides?: Partial<ScanConfig>): ScanConfig {
  return Object.freeze({
    target: '/test/path',
    preset: 'default',
    enabledAnalyzers: ['PE', 'ELF', 'String'],
    enabledFormats: ['json', 'markdown'],
    workerCount: 2,
    maxFindings: 500,
    maxFiles: 10000,
    maxDepth: 20,
    includeHidden: false,
    ...overrides,
  });
}

describe('ScanSession', () => {
  it('creates an initial session with correct defaults', () => {
    const config = createTestConfig();
    const session = createScanSession(config, '2026-07-11T00:00:00.000Z');

    expect(session.id).toBeDefined();
    expect(session.id).toContain('scan');
    expect(session.config.target).toBe('/test/path');
    expect(session.startedAt).toBeGreaterThan(0);
    expect(session.endedAt).toBeNull();
    expect(session.progress).toBe(0);
    expect(session.currentStage).toBe('discovery');
    expect(session.filesProcessed).toBe(0);
    expect(session.totalFiles).toBe(0);
    expect(session.completed).toBe(false);
    expect(session.cancelled).toBe(false);
    expect(session.currentFile).toBeNull();
    expect(session.summary).toBeNull();
    expect(session.diagnostics).toEqual([]);
  });

  it('initializes all pipeline stages to waiting', () => {
    const config = createTestConfig();
    const session = createScanSession(config);

    const stageIds = [
      'discovery',
      'classification',
      'extraction',
      'knowledge',
      'analysis',
      'rules',
      'correlation',
      'risk',
      'reporting',
      'export',
    ];
    for (const id of stageIds) {
      const stage = session.stages[id];
      expect(stage).toBeDefined();
      expect(stage!.status).toBe('waiting');
      expect(stage!.startedAt).toBeNull();
      expect(stage!.completedAt).toBeNull();
      expect(stage!.durationMs).toBe(0);
    }
  });

  it('creates immutable session objects', () => {
    const config = createTestConfig();
    const session = createScanSession(config);

    // Verify the session is frozen
    expect(Object.isFrozen(session)).toBe(true);
  });

  it('updateSession creates a new snapshot', () => {
    const config = createTestConfig();
    const session = createScanSession(config);

    const updated = updateSession(session, { progress: 0.5, filesProcessed: 10, totalFiles: 20 });

    // Original is unchanged
    expect(session.progress).toBe(0);
    expect(session.filesProcessed).toBe(0);

    // Updated has new values
    expect(updated.progress).toBe(0.5);
    expect(updated.filesProcessed).toBe(10);
    expect(updated.totalFiles).toBe(20);

    // Shared values still match
    expect(updated.id).toBe(session.id);
    expect(updated.config).toBe(session.config);
  });

  it('updateSession updates statistics', () => {
    const config = createTestConfig();
    const session = createScanSession(config);

    const updated = updateSession(session, {
      filesProcessed: 5,
      statistics: { filesScanned: 5, warnings: 2, memoryUsageMB: 128 },
    });

    expect(updated.statistics.filesScanned).toBe(5);
    expect(updated.statistics.warnings).toBe(2);
    expect(updated.statistics.memoryUsageMB).toBe(128);
    // Default values still present
    expect(updated.statistics.errors).toBe(0);
  });

  it('updateSession adds diagnostics', () => {
    const config = createTestConfig();
    const session = createScanSession(config);

    const updated = updateSession(session, { diagnostic: 'Test warning' });
    expect(updated.diagnostics).toContain('Test warning');
  });

  it('updateSession sets completed and endedAt', () => {
    const config = createTestConfig();
    const session = createScanSession(config);

    const updated = updateSession(session, { completed: true });
    expect(updated.completed).toBe(true);
    expect(updated.endedAt).not.toBeNull();
    expect(updated.endedAt!).toBeGreaterThanOrEqual(updated.startedAt);
  });

  it('updateSession calculates elapsed time', () => {
    const config = createTestConfig();
    const session = createScanSession(config);

    const updated = updateSession(session, { progress: 0.25 });
    expect(updated.elapsedMs).toBeGreaterThanOrEqual(0);
    // ETA is 0 when elapsed is 0 (can't divide by zero)
    expect(updated.etaMs).toBeGreaterThanOrEqual(0);
  });

  it('updateSession calculates throughput', () => {
    const config = createTestConfig();
    const session = createScanSession(config);

    const updated = updateSession(session, { filesProcessed: 50, progress: 0.5 });
    // throughput = filesProcessed / (elapsedSec)
    expect(updated.throughput).toBeGreaterThanOrEqual(0);
    expect(typeof updated.throughput).toBe('number');
  });

  it('PIPELINE_STAGE_LABELS has all stages', () => {
    expect(PIPELINE_STAGE_LABELS.discovery).toBe('Discovery');
    expect(PIPELINE_STAGE_LABELS.classification).toBe('Classification');
    expect(PIPELINE_STAGE_LABELS.extraction).toBe('Extraction');
    expect(PIPELINE_STAGE_LABELS.knowledge).toBe('Knowledge');
    expect(PIPELINE_STAGE_LABELS.analysis).toBe('Analysis');
    expect(PIPELINE_STAGE_LABELS.rules).toBe('Rules');
    expect(PIPELINE_STAGE_LABELS.correlation).toBe('Correlation');
    expect(PIPELINE_STAGE_LABELS.risk).toBe('Risk Assessment');
    expect(PIPELINE_STAGE_LABELS.reporting).toBe('Reporting');
    expect(PIPELINE_STAGE_LABELS.export).toBe('Export');
  });
});
