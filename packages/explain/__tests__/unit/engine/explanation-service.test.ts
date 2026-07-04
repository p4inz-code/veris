/**
 * Tests for ExplanationService — higher-level service wrapping the Explainer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExplanationService } from '../../../src/engine/explanation-service.js';
import type { Explainer } from '../../../src/engine/explainer.js';
import type { CanonicalReport } from '@veris/core';

describe('ExplanationService', () => {
  let mockEngine: Explainer;
  let service: ExplanationService;
  let report: CanonicalReport;

  beforeEach(() => {
    mockEngine = {
      explainFinding: vi.fn().mockResolvedValue({
        kind: 'success',
        explanation: { id: 'exp_1', subjectId: 'F1', text: 'Finding explanation' },
      }),
      explainChain: vi.fn().mockResolvedValue({
        kind: 'success',
        explanation: { id: 'exp_2', subjectId: 'C1', text: 'Chain explanation' },
      }),
      explainRiskDimension: vi.fn().mockResolvedValue({
        kind: 'success',
        explanation: { id: 'exp_3', subjectId: 'D1', text: 'Risk explanation' },
      }),
      summarizeReport: vi.fn().mockResolvedValue({
        kind: 'success',
        explanation: { id: 'exp_4', subjectId: 'report', text: 'Report summary' },
      }),
      clearCacheForReport: vi.fn().mockResolvedValue(undefined),
    };

    service = new ExplanationService(mockEngine);

    report = {
      metadata: {
        id: 'report-1',
        scanStartedAt: new Date().toISOString(),
        scanCompletedAt: new Date().toISOString(),
        scannerVersion: '1.0.0',
      },
      findings: [],
      artifacts: [],
      riskProfile: { overall: { level: 'low', score: 1.0 }, dimensions: [], riskDrivers: [] },
      summary: {
        totalFindings: 0,
        findingsBySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      },
    } as unknown as CanonicalReport;
  });

  it('explains a finding via explain()', async () => {
    const result = await service.explain({ type: 'finding', id: 'F1' }, report);
    expect(result.kind).toBe('success');
    expect(mockEngine.explainFinding).toHaveBeenCalledWith('F1', report, undefined);
  });

  it('explains a chain via explain()', async () => {
    const result = await service.explain({ type: 'chain', id: 'C1' }, report);
    expect(result.kind).toBe('success');
    expect(mockEngine.explainChain).toHaveBeenCalledWith('C1', report, undefined);
  });

  it('explains a risk dimension via explain()', async () => {
    const result = await service.explain({ type: 'risk', id: 'D1' }, report);
    expect(result.kind).toBe('success');
    expect(mockEngine.explainRiskDimension).toHaveBeenCalledWith('D1', report, undefined);
  });

  it('summarizes a report via explain()', async () => {
    const result = await service.explain({ type: 'report' }, report);
    expect(result.kind).toBe('success');
    expect(mockEngine.summarizeReport).toHaveBeenCalledWith(report, undefined);
  });

  it('passes mode to explain methods', async () => {
    await service.explain({ type: 'finding', id: 'F1' }, report, 'technical');
    expect(mockEngine.explainFinding).toHaveBeenCalledWith('F1', report, 'technical');
  });

  it('handles batch explanations', async () => {
    const results = await service.explainBatch(
      {
        requests: [
          { target: { type: 'finding', id: 'F1' } },
          { target: { type: 'chain', id: 'C1' } },
          { target: { type: 'report' } },
        ],
      },
      report,
    );

    expect(results).toHaveLength(3);
    expect(results[0].kind).toBe('success');
    expect(results[1].kind).toBe('success');
    expect(results[2].kind).toBe('success');
  });

  it('clears the cache', async () => {
    await service.clearCache();
    expect(mockEngine.clearCacheForReport).toHaveBeenCalled();
  });

  it('returns metrics snapshot when engine supports it', () => {
    const mockEngineWithMetrics = {
      ...mockEngine,
      getMetrics: vi.fn().mockReturnValue({
        snapshot: vi.fn().mockReturnValue({ totalRequests: 5 }),
      }),
    };
    const serviceWithMetrics = new ExplanationService(
      mockEngineWithMetrics as unknown as Explainer,
    );
    const metrics = serviceWithMetrics.getMetrics();
    expect(metrics).toBeDefined();
  });

  it('returns undefined for metrics when engine does not support it', () => {
    const metrics = service.getMetrics();
    expect(metrics).toBeUndefined();
  });
});
