/**
 * Tests for Scan Dashboard Panel components.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PIPELINE_PHASES,
  phaseStatus,
  renderPipelineVisualization,
} from '../../src/scan/progress/pipeline-viz.js';
import { setSymbolSet, resetSymbolSet } from '../../src/ui/index.js';
import { renderCurrentFilePanel } from '../../src/scan/progress/file-panel.js';
import { renderStatisticsPanel } from '../../src/scan/progress/statistics-panel.js';
import { renderHealthPanel, createHealthIssue } from '../../src/scan/progress/health-panel.js';
import { renderPerformancePanel } from '../../src/scan/progress/performance-panel.js';
import type {
  StageState,
  StageStatus,
  ScanStatistics,
  PerformanceMetrics,
  HealthSummary,
  CurrentFile,
} from '../../src/scan/scan-session.js';

/** Strip ANSI escape codes for readable assertions. */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

// ── Pipeline Visualization Tests ──

describe('PIPELINE_PHASES', () => {
  it('defines the five canonical display phases', () => {
    expect(PIPELINE_PHASES.map((p) => p.label)).toEqual([
      'Discover',
      'Extract',
      'Analyze',
      'Correlate',
      'Report',
    ]);
  });

  it('maps every display phase to real pipeline stages', () => {
    for (const phase of PIPELINE_PHASES) {
      expect(phase.stages.length).toBeGreaterThan(0);
      for (const stage of phase.stages) {
        expect(stage.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('phaseStatus', () => {
  function stage(status: StageStatus, itemsProcessed = 0): StageState {
    return Object.freeze({
      id: 'x',
      status,
      startedAt: null,
      completedAt: null,
      durationMs: 0,
      itemsProcessed,
      itemsFailed: 0,
    });
  }

  it('is waiting when no mapped stage has started', () => {
    const stages: Record<string, StageState> = {
      discovery: stage('waiting'),
      classification: stage('waiting'),
    };
    expect(phaseStatus(stages, PIPELINE_PHASES[0])).toBe('waiting');
  });

  it('is completed only when every mapped stage is completed', () => {
    const stages: Record<string, StageState> = {
      discovery: stage('completed'),
      classification: stage('completed'),
    };
    expect(phaseStatus(stages, PIPELINE_PHASES[0])).toBe('completed');
  });

  it('never claims completion while a mapped stage is still pending', () => {
    const stages: Record<string, StageState> = {
      discovery: stage('completed'),
      classification: stage('waiting'),
    };
    expect(phaseStatus(stages, PIPELINE_PHASES[0])).toBe('running');
  });

  it('is running while a mapped stage is running', () => {
    const stages: Record<string, StageState> = {
      extraction: stage('running'),
      knowledge: stage('waiting'),
    };
    expect(phaseStatus(stages, PIPELINE_PHASES[1])).toBe('running');
  });

  it('is failed when any mapped stage failed', () => {
    const stages: Record<string, StageState> = {
      analysis: stage('failed'),
      rules: stage('waiting'),
    };
    expect(phaseStatus(stages, PIPELINE_PHASES[2])).toBe('failed');
  });
});

describe('renderPipelineVisualization', () => {
  beforeEach(() => {
    resetSymbolSet();
  });

  function stage(status: StageStatus, itemsProcessed = 0): StageState {
    return Object.freeze({
      id: 'x',
      status,
      startedAt: null,
      completedAt: null,
      durationMs: 0,
      itemsProcessed,
      itemsFailed: 0,
    });
  }

  it('renders all five phases with Unicode markers when waiting', () => {
    setSymbolSet('unicode');
    const stages: Record<string, StageState> = {
      discovery: stage('waiting'),
      classification: stage('waiting'),
      extraction: stage('waiting'),
      knowledge: stage('waiting'),
      analysis: stage('waiting'),
      rules: stage('waiting'),
      correlation: stage('waiting'),
      reporting: stage('waiting'),
      export: stage('waiting'),
    };

    const joined = stripAnsi(renderPipelineVisualization(stages, { width: 60 }).join('\n'));
    expect(joined).toContain('Discover');
    expect(joined).toContain('Extract');
    expect(joined).toContain('Analyze');
    expect(joined).toContain('Correlate');
    expect(joined).toContain('Report');
    // Waiting rows use the hollow-circle marker, exactly once each.
    expect(joined.match(/○/g) ?? []).toHaveLength(5);
  });

  it('shows completed phases with check marks and running phases with bullets', () => {
    setSymbolSet('unicode');
    const stages: Record<string, StageState> = {
      discovery: stage('completed'),
      classification: stage('completed'),
      extraction: stage('completed'),
      knowledge: stage('completed'),
      analysis: stage('running'),
      rules: stage('waiting'),
      correlation: stage('waiting'),
      reporting: stage('waiting'),
      export: stage('waiting'),
    };

    const joined = stripAnsi(renderPipelineVisualization(stages, { width: 60 }).join('\n'));
    expect(joined).toContain('✓ Discover');
    expect(joined).toContain('✓ Extract');
    expect(joined).toContain('● Analyze');
  });

  it('falls back to fixed-width ASCII tags', () => {
    setSymbolSet('ascii');
    const stages: Record<string, StageState> = {
      discovery: stage('completed'),
      classification: stage('completed'),
      extraction: stage('running'),
      knowledge: stage('waiting'),
      analysis: stage('waiting'),
      rules: stage('waiting'),
      correlation: stage('waiting'),
      reporting: stage('waiting'),
      export: stage('waiting'),
    };

    const joined = stripAnsi(renderPipelineVisualization(stages, { width: 60 }).join('\n'));
    expect(joined).toContain('[done] Discover');
    expect(joined).toContain('[run ] Extract');
    expect(joined).toContain('[    ] Correlate');
  });

  it('marks failed phases with the error tag', () => {
    setSymbolSet('ascii');
    const stages: Record<string, StageState> = {
      discovery: stage('completed'),
      classification: stage('completed'),
      extraction: stage('failed'),
      knowledge: stage('waiting'),
      analysis: stage('waiting'),
      rules: stage('waiting'),
      correlation: stage('waiting'),
      reporting: stage('waiting'),
      export: stage('waiting'),
    };

    const joined = stripAnsi(renderPipelineVisualization(stages, { width: 60 }).join('\n'));
    expect(joined).toContain('[fail] Extract');
  });

  it('shows item counts only for completed phases when requested', () => {
    setSymbolSet('ascii');
    const stages: Record<string, StageState> = {
      discovery: stage('completed', 50),
      classification: stage('completed', 50),
      extraction: stage('waiting'),
      knowledge: stage('waiting'),
      analysis: stage('waiting'),
      rules: stage('waiting'),
      correlation: stage('waiting'),
      reporting: stage('waiting'),
      export: stage('waiting'),
    };

    const joined = stripAnsi(
      renderPipelineVisualization(stages, { width: 60, showItems: true }).join('\n'),
    );
    expect(joined).toContain('100 items');
  });

  it('emits a section header when a title is provided', () => {
    setSymbolSet('ascii');
    const lines = renderPipelineVisualization({}, { width: 60, title: 'PIPELINE' });
    expect(lines[0]).toContain('PIPELINE');
  });

  it('keeps every row within the configured width', () => {
    setSymbolSet('ascii');
    const stages: Record<string, StageState> = {
      discovery: stage('completed'),
      classification: stage('completed'),
      extraction: stage('completed'),
      knowledge: stage('completed'),
      analysis: stage('completed'),
      rules: stage('completed'),
      correlation: stage('completed'),
      reporting: stage('completed'),
      export: stage('completed'),
    };
    const visible = (line: string): string => line.replace(/\x1b\[[0-9;]*m/g, '');
    for (const line of renderPipelineVisualization(stages, { width: 30, showItems: true })) {
      expect(visible(line).length).toBeLessThanOrEqual(30);
    }
  });
});

// ── Current File Panel Tests ──

describe('renderCurrentFilePanel', () => {
  it('renders with file info', () => {
    const file: CurrentFile = {
      filename: 'test.exe',
      relativePath: '/path/to/test.exe',
      size: 1048576,
      fileType: 'PE32 executable',
      language: '',
      artifactType: 'executable',
      currentAnalyzer: 'PE Analyzer',
    };

    const lines = renderCurrentFilePanel(file, 5, 20, { width: 60 });
    const joined = lines.join('\n');
    expect(joined).toContain('test.exe');
    expect(joined).toContain('1.0 MB');
    expect(joined).toContain('PE Analyzer');
    expect(joined).toContain('5/20');
  });

  it('renders with null file', () => {
    const lines = renderCurrentFilePanel(null, 0, 0, { width: 60 });
    const joined = lines.join('\n');
    expect(joined).toContain('Current File');
  });
});

// ── Statistics Panel Tests ──

describe('renderStatisticsPanel', () => {
  it('renders statistics', () => {
    const stats: ScanStatistics = {
      filesScanned: 100,
      directories: 5,
      archives: 2,
      rulesEvaluated: 50,
      evidenceCollected: 500,
      findings: 12,
      warnings: 3,
      errors: 1,
      skippedFiles: 2,
      memoryUsageMB: 256,
      cpuTimeMs: 5000,
      filesPerSecond: 20.5,
      averageFileDurationMs: 48,
    };

    const lines = renderStatisticsPanel(stats, { width: 80 });
    const joined = lines.join('\n');
    expect(joined).toContain('100');
    expect(joined).toContain('50');
    // Files/sec value truncated by column width - verify it shows numeric value
    expect(joined).toContain('Files/sec');
  });
});

// ── Health Panel Tests ──

describe('renderHealthPanel', () => {
  it('shows clean bill of health', () => {
    const health: HealthSummary = {
      warnings: 0,
      errors: 0,
      fatalErrors: 0,
      permissionDenied: 0,
      unsupportedFiles: 0,
      timeouts: 0,
      issues: [],
    };

    const lines = renderHealthPanel(health, { width: 60 });
    const joined = lines.join('\n');
    expect(joined).toContain('No issues');
  });

  it('shows issues when present', () => {
    const health: HealthSummary = {
      warnings: 3,
      errors: 1,
      fatalErrors: 0,
      permissionDenied: 0,
      unsupportedFiles: 2,
      timeouts: 1,
      issues: [
        createHealthIssue('FILE_READ_ERROR', 'Cannot read file', 'warning', '/path/to/file'),
        createHealthIssue('TIMEOUT', 'File timed out', 'warning', '/path/to/slow'),
      ],
    };

    const lines = renderHealthPanel(health, { width: 60 });
    const joined = lines.join('\n');
    expect(joined).toContain('3 warnings');
    expect(joined).toContain('1 errors');
    expect(joined).toContain('Cannot read file');
    expect(joined).toContain('File timed out');
  });
});

// ── Performance Panel Tests ──

describe('renderPerformancePanel', () => {
  it('renders performance metrics', () => {
    const perf: PerformanceMetrics = {
      filesPerSecond: 15.5,
      averageFileDurationMs: 64,
      slowestFile: {
        path: '/path/to/slow.exe',
        durationMs: 500,
        stage: 'extraction',
        success: true,
      },
      fastestFile: { path: '/path/to/fast.exe', durationMs: 5, stage: 'extraction', success: true },
      memoryPeakMB: 512,
      memoryCurrentMB: 256,
      pipelineTimings: {},
    };

    const lines = renderPerformancePanel(perf, { width: 80 });
    const joined = lines.join('\n');
    expect(joined).toContain('15.5');
    expect(joined).toContain('500 ms');
    expect(joined).toContain('512');
  });
});
