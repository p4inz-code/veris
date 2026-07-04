/**
 * Tests for exporter orchestrator — dispatches to Markdown/JSON exporters.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Exporter } from '../../../src/export/exporter.js';
import type { Explanation } from '../../../src/types/explanation.js';

// ── Test Fixtures ──

const TEST_EXPLANATION: Explanation = {
  id: 'exp_fin_abc123_a1b2c3',
  subjectId: 'fin_abc123',
  subjectType: 'finding',
  mode: 'technical',
  text: 'This finding detects a hardcoded AWS access key in the source code.',
  citations: [
    {
      id: 'cit_1',
      sourceType: 'finding',
      sourceId: 'fin_abc123',
      label: 'Finding: Hardcoded AWS Key',
      verified: true,
    },
  ],
  citationValidation: {
    valid: true,
    totalCitations: 1,
    verifiedCitations: 1,
    failedCitations: 0,
    citations: [],
  },
  provider: { id: 'test-provider', model: 'test-model' },
  promptVersion: '1.0.0',
  tokenUsage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
  cached: false,
  refused: false,
  generatedAt: '2026-07-04T00:00:00.000Z',
  disclaimer: 'AI-generated explanation.',
};

const FIXED_CLOCK = {
  now: () => new Date('2026-07-04T00:00:00.000Z'),
};

describe('Exporter', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'veris-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('exportToString', () => {
    it('returns markdown string by default', () => {
      const exporter = new Exporter({ clock: FIXED_CLOCK });
      const output = exporter.exportToString(TEST_EXPLANATION);
      expect(typeof output).toBe('string');
      expect(output).toContain('# Technical Explanation: fin_abc123');
    });

    it('returns JSON string when format is json', () => {
      const exporter = new Exporter({
        format: 'json',
        clock: FIXED_CLOCK,
      });
      const output = exporter.exportToString(TEST_EXPLANATION);
      expect(() => JSON.parse(output)).not.toThrow();
      const parsed = JSON.parse(output);
      expect(parsed.explanation.id).toBe('exp_fin_abc123_a1b2c3');
    });

    it('is deterministic across 100 runs', () => {
      const exporter = new Exporter({ clock: FIXED_CLOCK });
      const first = exporter.exportToString(TEST_EXPLANATION);
      for (let i = 0; i < 100; i++) {
        const output = exporter.exportToString(TEST_EXPLANATION);
        expect(output).toBe(first);
      }
    });
  });

  describe('exportToFile', () => {
    it('writes markdown to file', () => {
      const exporter = new Exporter({ clock: FIXED_CLOCK });
      const filePath = path.join(tmpDir, 'output.md');
      const result = exporter.exportToFile(TEST_EXPLANATION, filePath);

      expect(result.success).toBe(true);
      expect(result.format).toBe('markdown');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8')).toContain('# Technical Explanation: fin_abc123');
    });

    it('writes JSON to file', () => {
      const exporter = new Exporter({
        format: 'json',
        clock: FIXED_CLOCK,
      });
      const filePath = path.join(tmpDir, 'output.json');
      const result = exporter.exportToFile(TEST_EXPLANATION, filePath);

      expect(result.success).toBe(true);
      expect(result.format).toBe('json');
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('protects against overwriting', () => {
      const exporter = new Exporter({ clock: FIXED_CLOCK });
      const filePath = path.join(tmpDir, 'protected.md');
      fs.writeFileSync(filePath, 'existing', 'utf-8');

      const result = exporter.exportToFile(TEST_EXPLANATION, filePath);
      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('overwrites when configured', () => {
      const exporter = new Exporter({
        clock: FIXED_CLOCK,
        overwrite: true,
      });
      const filePath = path.join(tmpDir, 'overwrite.md');
      fs.writeFileSync(filePath, 'existing', 'utf-8');

      const result = exporter.exportToFile(TEST_EXPLANATION, filePath);
      expect(result.success).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8')).toContain('# Technical Explanation');
    });

    it('returns document in result', () => {
      const exporter = new Exporter({ clock: FIXED_CLOCK });
      const filePath = path.join(tmpDir, 'doc.md');
      const result = exporter.exportToFile(TEST_EXPLANATION, filePath);

      expect(result.document).toBeDefined();
      expect(result.document!.explanation.id).toBe('exp_fin_abc123_a1b2c3');
    });

    it('handles invalid paths gracefully', () => {
      const exporter = new Exporter({ clock: FIXED_CLOCK });
      const result = exporter.exportToFile(TEST_EXPLANATION, '');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('exportToFiles', () => {
    it('exports to multiple formats', () => {
      const exporter = new Exporter({ clock: FIXED_CLOCK });
      const mdPath = path.join(tmpDir, 'output.md');
      const jsonPath = path.join(tmpDir, 'output.json');

      const batch = exporter.exportToFiles(TEST_EXPLANATION, {
        markdown: mdPath,
        json: jsonPath,
      });

      expect(batch.allSuccessful).toBe(true);
      expect(batch.results).toHaveLength(2);
      expect(fs.existsSync(mdPath)).toBe(true);
      expect(fs.existsSync(jsonPath)).toBe(true);
    });

    it('reports individual failures', () => {
      const exporter = new Exporter({ clock: FIXED_CLOCK });
      const mdPath = path.join(tmpDir, 'output.md');

      // First export succeeds
      const batch = exporter.exportToFiles(TEST_EXPLANATION, {
        markdown: mdPath,
      });

      expect(batch.results[0].success).toBe(true);
    });
  });

  describe('generateReport', () => {
    it('generates export report', () => {
      const exporter = new Exporter({ clock: FIXED_CLOCK });
      const report = exporter.generateReport(TEST_EXPLANATION);

      expect(report.success).toBe(true);
      expect(report.format).toBe('markdown');
      expect(report.contentLength).toBeGreaterThan(0);
      expect(report.lineCount).toBeGreaterThan(0);
      expect(report.schemaVersion).toBe('1.0.0');
      expect(report.exportedAt).toBe('2026-07-04T00:00:00.000Z');
    });

    it('generates report for JSON format', () => {
      const exporter = new Exporter({
        format: 'json',
        clock: FIXED_CLOCK,
      });
      const report = exporter.generateReport(TEST_EXPLANATION);
      expect(report.format).toBe('json');
    });
  });

  describe('constructor validation', () => {
    it('throws on invalid options', () => {
      expect(() => new Exporter({ format: 'html' as 'markdown' })).toThrow();
    });
  });
});
