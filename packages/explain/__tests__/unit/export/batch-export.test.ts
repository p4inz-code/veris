/**
 * Tests for BatchExporter — multi-explanation batch export.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Exporter } from '../../../src/export/exporter.js';
import { BatchExporter } from '../../../src/export/batch-export.js';
import type { Explanation } from '../../../src/types/explanation.js';

const FIXED_CLOCK = { now: () => new Date('2026-07-04T00:00:00.000Z') };

const BASE_EXPLANATION: Explanation = {
  id: 'exp_fin_001_a1b2c3',
  subjectId: 'fin_001',
  subjectType: 'finding',
  mode: 'technical',
  text: 'Test explanation content.',
  citations: [],
  citationValidation: {
    valid: true,
    totalCitations: 0,
    verifiedCitations: 0,
    failedCitations: 0,
    citations: [],
  },
  provider: { id: 'test-provider', model: 'test-model' },
  promptVersion: '1.0.0',
  tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  cached: false,
  refused: false,
  generatedAt: '2026-07-04T00:00:00.000Z',
  disclaimer: 'AI-generated.',
};

describe('BatchExporter', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'veris-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exports multiple explanations', () => {
    const exporter = new Exporter({ clock: FIXED_CLOCK });
    const batch = new BatchExporter(exporter, {}, FIXED_CLOCK);

    const entries = [
      {
        explanation: { ...BASE_EXPLANATION, subjectId: 'fin_001' },
        filePath: path.join(tmpDir, 'fin_001.md'),
      },
      {
        explanation: { ...BASE_EXPLANATION, id: 'exp_002', subjectId: 'fin_002' },
        filePath: path.join(tmpDir, 'fin_002.md'),
      },
    ];

    const result = batch.exportAll(entries);

    expect(result.totalCount).toBe(2);
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(0);
    expect(result.allSuccessful).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'fin_001.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'fin_002.md'))).toBe(true);
  });

  it('stops on first error when continueOnError is false', () => {
    const exporter = new Exporter({ clock: FIXED_CLOCK });
    const batch = new BatchExporter(exporter, { continueOnError: false }, FIXED_CLOCK);

    // Second entry uses an invalid path (empty string)
    const entries = [
      {
        explanation: { ...BASE_EXPLANATION, subjectId: 'fin_001' },
        filePath: path.join(tmpDir, 'fin_001.md'),
      },
      {
        explanation: { ...BASE_EXPLANATION, id: 'exp_002', subjectId: 'fin_002' },
        filePath: '',
      },
    ];

    const result = batch.exportAll(entries);

    expect(result.successCount).toBeLessThan(2);
    expect(result.failureCount).toBeGreaterThan(0);
  });

  it('continues on error when continueOnError is true', () => {
    const exporter = new Exporter({ clock: FIXED_CLOCK });
    const batch = new BatchExporter(exporter, { continueOnError: true }, FIXED_CLOCK);

    const entries = [
      {
        explanation: { ...BASE_EXPLANATION, subjectId: 'fin_001' },
        filePath: path.join(tmpDir, 'fin_001.md'),
      },
      {
        explanation: { ...BASE_EXPLANATION, id: 'exp_002', subjectId: 'fin_002' },
        filePath: '',
      },
      {
        explanation: { ...BASE_EXPLANATION, id: 'exp_003', subjectId: 'fin_003' },
        filePath: path.join(tmpDir, 'fin_003.md'),
      },
    ];

    const result = batch.exportAll(entries);

    expect(result.totalCount).toBe(3);
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(1);
    expect(fs.existsSync(path.join(tmpDir, 'fin_001.md'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'fin_003.md'))).toBe(true);
  });

  it('sorts entries by subjectId', () => {
    const exporter = new Exporter({ clock: FIXED_CLOCK });
    const batch = new BatchExporter(exporter, {}, FIXED_CLOCK);

    const entries = [
      {
        explanation: { ...BASE_EXPLANATION, id: 'exp_003', subjectId: 'fin_C' },
        filePath: path.join(tmpDir, 'fin_C.md'),
      },
      {
        explanation: { ...BASE_EXPLANATION, id: 'exp_001', subjectId: 'fin_A' },
        filePath: path.join(tmpDir, 'fin_A.md'),
      },
    ];

    const result = batch.exportAll(entries);

    expect(result.items[0].subjectId).toBe('fin_A');
    expect(result.items[1].subjectId).toBe('fin_C');
  });

  it('fires progress callbacks', () => {
    const exporter = new Exporter({ clock: FIXED_CLOCK });
    const progressEvents: string[] = [];

    const batch = new BatchExporter(
      exporter,
      {
        onProgress: (p) => {
          progressEvents.push(`${p.phase}:${p.subjectId}`);
        },
      },
      FIXED_CLOCK,
    );

    batch.exportAll([
      {
        explanation: { ...BASE_EXPLANATION, subjectId: 'fin_001' },
        filePath: path.join(tmpDir, 'fin_001.md'),
      },
    ]);

    expect(progressEvents.length).toBeGreaterThanOrEqual(2);
    expect(progressEvents[0]).toContain('fin_001');
    expect(progressEvents[progressEvents.length - 1]).toContain('complete');
  });

  it('exportOne exports a single explanation', () => {
    const exporter = new Exporter({ clock: FIXED_CLOCK });
    const batch = new BatchExporter(exporter, {}, FIXED_CLOCK);

    const filePath = path.join(tmpDir, 'single.md');
    const result = batch.exportOne(BASE_EXPLANATION, filePath);

    expect(result.success).toBe(true);
    expect(result.subjectId).toBe('fin_001');
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('is deterministic across runs', () => {
    const exporter = new Exporter({ clock: FIXED_CLOCK, overwrite: true });

    const entries = [
      {
        explanation: { ...BASE_EXPLANATION, subjectId: 'fin_A' },
        filePath: path.join(tmpDir, 'a.md'),
      },
      {
        explanation: { ...BASE_EXPLANATION, id: 'exp_B', subjectId: 'fin_B' },
        filePath: path.join(tmpDir, 'b.md'),
      },
    ];

    const run1 = new BatchExporter(exporter, {}, FIXED_CLOCK).exportAll(entries);
    const run2 = new BatchExporter(exporter, {}, FIXED_CLOCK).exportAll(entries);

    expect(run1.items.map((i) => i.subjectId)).toEqual(run2.items.map((i) => i.subjectId));
    expect(run1.successCount).toBe(run2.successCount);
  });
});
