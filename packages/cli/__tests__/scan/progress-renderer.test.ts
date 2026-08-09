/**
 * Tests for Progress Renderers: JSON, Silent, Error Presentation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JsonProgressRenderer, SilentRenderer } from '../../src/scan/progress/index.js';
import {
  formatError,
  getErrorDefinition,
  formatErrorLine,
  errorFromException,
  formatHealthIssue,
} from '../../src/scan/progress/error-presentation.js';
import { createScanSession, type ScanConfig } from '../../src/scan/scan-session.js';
import { createHealthIssue } from '../../src/scan/progress/health-panel.js';
import type { ErrorInfo } from '../../src/scan/progress/renderer.js';

// ── Test Helpers ──

function createTestConfig(): ScanConfig {
  return Object.freeze({
    target: '/test/path',
    preset: 'default',
    enabledAnalyzers: ['PE', 'String'],
    enabledFormats: ['json'],
    workerCount: 1,
    maxFindings: 500,
    maxFiles: 10000,
    maxDepth: 20,
    includeHidden: false,
  });
}

// ── JSON Renderer Tests ──

describe('JsonProgressRenderer', () => {
  let renderer: JsonProgressRenderer;
  let outputLines: string[];
  let origWrite: typeof process.stdout.write;

  beforeEach(() => {
    renderer = new JsonProgressRenderer();
    outputLines = [];
    origWrite = process.stdout.write.bind(process.stdout);

    // Capture stdout
    process.stdout.write = (str: string) => {
      outputLines.push(str);
      return true;
    };
  });

  afterEach(() => {
    process.stdout.write = origWrite;
  });

  it('emits JSON on start', () => {
    const session = createScanSession(createTestConfig(), '2026-07-11T00:00:00.000Z');
    renderer.onStart(session);

    expect(outputLines.length).toBe(1);
    const parsed = JSON.parse(outputLines[0]);
    expect(parsed.type).toBe('start');
    expect(parsed.session).toBeDefined();
    expect(parsed.session.id).toBe(session.id);
  });

  it('emits JSON on progress', () => {
    const session = createScanSession(createTestConfig(), '2026-07-11T00:00:00.000Z');
    renderer.onStart(session);
    outputLines = []; // Clear start output

    renderer.onProgress({
      stage: 'extraction',
      filesProcessed: 10,
      totalFiles: 100,
      queueSize: 90,
    });

    expect(outputLines.length).toBe(1);
    const parsed = JSON.parse(outputLines[0]);
    expect(parsed.type).toBe('progress');
    expect(parsed.filesProcessed).toBe(10);
    expect(parsed.totalFiles).toBe(100);
  });

  it('emits JSON on stage change', () => {
    renderer.onStageChange('discovery', 'running');

    expect(outputLines.length).toBe(1);
    const parsed = JSON.parse(outputLines[0]);
    expect(parsed.type).toBe('stage');
    expect(parsed.id).toBe('discovery');
    expect(parsed.status).toBe('running');
  });

  it('emits JSON on file events', () => {
    renderer.onFileStart({
      filename: 'test.exe',
      relativePath: '/test/test.exe',
      size: 1024,
      fileType: 'PE32',
      language: '',
      artifactType: 'executable',
      currentAnalyzer: 'PE',
    });

    expect(outputLines.length).toBe(1);
    const parsed = JSON.parse(outputLines[0]);
    expect(parsed.type).toBe('file');
    expect(parsed.status).toBe('start');
    expect(parsed.filename).toBe('test.exe');
  });

  it('emits JSON on error', () => {
    renderer.onError({
      code: 'FILE_READ_ERROR',
      message: 'Cannot read file',
      artifactPath: '/test/file.exe',
    });

    expect(outputLines.length).toBe(1);
    const parsed = JSON.parse(outputLines[0]);
    expect(parsed.type).toBe('error');
    expect(parsed.code).toBe('FILE_READ_ERROR');
  });

  it('emits JSON on complete', () => {
    const session = createScanSession(createTestConfig(), '2026-07-11T00:00:00.000Z');
    const summary = Object.freeze({
      durationMs: 1000,
      filesScanned: 50,
      artifacts: 50,
      rulesExecuted: 10,
      evidenceCollected: 200,
      findingsBySeverity: { high: 5, medium: 3 },
      riskScore: 4.5,
      confidence: 0.85,
      outputFiles: ['/output/report.json'],
      warnings: 2,
      errors: 0,
      skippedFiles: 1,
      cancelled: false,
    });

    renderer.onComplete(session, summary);

    expect(outputLines.length).toBe(1);
    const parsed = JSON.parse(outputLines[0]);
    expect(parsed.type).toBe('complete');
    expect(parsed.summary.filesScanned).toBe(50);
  });

  it('does not support animation', () => {
    expect(renderer.supportsAnimation).toBe(false);
  });

  it('returns empty final summary', () => {
    expect(renderer.getFinalSummary()).toBe('');
  });
});

// ── Silent Renderer Tests ──

describe('SilentRenderer', () => {
  let renderer: SilentRenderer;

  beforeEach(() => {
    renderer = new SilentRenderer();
  });

  it('does not support animation', () => {
    expect(renderer.supportsAnimation).toBe(false);
  });

  it('produces complete summary on complete', () => {
    const session = createScanSession(createTestConfig(), '2026-07-11T00:00:00.000Z');
    const summary = Object.freeze({
      durationMs: 5000,
      filesScanned: 100,
      artifacts: 100,
      rulesExecuted: 20,
      evidenceCollected: 500,
      findingsBySeverity: { critical: 1, high: 5 },
      riskScore: 6.5,
      confidence: 0.9,
      outputFiles: ['/output/report.json'],
      warnings: 3,
      errors: 0,
      skippedFiles: 2,
      cancelled: false,
    });

    renderer.onComplete(session, summary);
    const result = renderer.getFinalSummary();
    expect(result).toContain('Scan Complete');
    expect(result).toContain('100');
    expect(result).toContain('6.5');
  });

  it('marks the summary as failed when errors exist', () => {
    const session = createScanSession(createTestConfig(), '2026-07-11T00:00:00.000Z');
    const summary = Object.freeze({
      durationMs: 5000,
      filesScanned: 100,
      artifacts: 100,
      rulesExecuted: 20,
      evidenceCollected: 500,
      findingsBySeverity: { high: 2 },
      riskScore: 7.2,
      confidence: 0.9,
      outputFiles: [],
      warnings: 0,
      errors: 1,
      skippedFiles: 0,
      cancelled: false,
    });

    renderer.onComplete(session, summary);
    const result = renderer.getFinalSummary();
    expect(result).toContain('Scan Failed');
    expect(result).toContain('Errors');
  });

  it('produces cancelled summary on cancel', () => {
    const session = createScanSession(createTestConfig(), '2026-07-11T00:00:00.000Z');
    renderer.onCancel(session);
    const result = renderer.getFinalSummary();
    expect(result).toContain('cancelled');
  });

  it('writes fatal errors to stderr', () => {
    // Capture stderr
    const stderrLines: string[] = [];
    const origErr = process.stderr.write.bind(process.stderr);
    process.stderr.write = (str: string) => {
      stderrLines.push(str);
      return true;
    };

    renderer.onHealthIssue({
      code: 'PIPELINE_ERROR',
      message: 'Pipeline failed',
      severity: 'fatal',
      recoverable: false,
      timestamp: Date.now(),
    });

    process.stderr.write = origErr;
    expect(stderrLines.length).toBeGreaterThan(0);
    expect(stderrLines[0]).toContain('Pipeline failed');
  });
});

// ── Error Presentation Tests ──

describe('Error Presentation', () => {
  it('getErrorDefinition returns known errors', () => {
    const def = getErrorDefinition('FILE_READ_ERROR');
    expect(def.problem).toBe('Cannot read file');
    expect(def.severity).toBe('warning');
  });

  it('getErrorDefinition returns UNKNOWN for unknown codes', () => {
    const def = getErrorDefinition('NONEXISTENT_ERROR');
    expect(def.problem).toBe('Unknown error');
    expect(def.severity).toBe('error');
  });

  it('formatError returns formatted string', () => {
    const error: ErrorInfo = {
      code: 'PERMISSION_DENIED',
      message: 'Access denied',
      artifactPath: '/secret/file',
    };

    const result = formatError(error);
    expect(result).toContain('Permission denied');
    expect(result).toContain('Reason:');
    expect(result).toContain('Action:');
  });

  it('formatError includes stack trace in verbose mode', () => {
    const error: ErrorInfo = {
      code: 'UNKNOWN_ERROR',
      message: 'Something broke',
      stackTrace: 'Error: Something broke\n    at foo.js:1:1',
    };

    const result = formatError(error, true);
    expect(result).toContain('Stack:');
    expect(result).toContain('foo.js:1:1');
  });

  it('formatError does not include stack trace by default', () => {
    const error: ErrorInfo = {
      code: 'UNKNOWN_ERROR',
      message: 'Something broke',
      stackTrace: 'Error: Something broke\n    at foo.js:1:1',
    };

    const result = formatError(error);
    expect(result).not.toContain('Stack:');
  });

  it('formatErrorLine returns one-line format', () => {
    const error: ErrorInfo = {
      code: 'FILE_READ_ERROR',
      message: 'Cannot read file',
      artifactPath: '/test/file.exe',
    };

    const result = formatErrorLine(error);
    expect(result).toContain('/test/file.exe');
  });

  it('errorFromException creates ErrorInfo from exception', () => {
    const error = new Error('Test error');
    const info = errorFromException(error, 'FILE_READ_ERROR', '/test/file.exe');

    expect(info.code).toBe('FILE_READ_ERROR');
    expect(info.message).toBe('Test error');
    expect(info.artifactPath).toBe('/test/file.exe');
    expect(info.stackTrace).toBeDefined();
  });

  it('errorFromException handles non-Error objects', () => {
    const info = errorFromException('string error', 'UNKNOWN_ERROR');
    expect(info.message).toBe('string error');
    expect(info.code).toBe('UNKNOWN_ERROR');
  });

  it('formatHealthIssue formats health issue', () => {
    const issue = createHealthIssue('TIMEOUT', 'File took too long', 'warning', '/slow/file');

    const result = formatHealthIssue(issue);
    expect(result).toContain('Processing timed out');
    expect(result).toContain('The file took too long to process');
    expect(result).toContain('/slow/file');
  });
});
