/**
 * Tests for M3 — Risk context builder.
 *
 * Tests:
 * - ExplainedRiskProfile construction from canonical RiskProfile
 * - Dimension breakdown from risk drivers
 * - Risk dimension context (specific dimension lookup)
 * - Edge cases: no risk drivers, no trust score
 *
 * @module @veris/explain/__tests__/unit/context/risk-context.test
 */

import { describe, it, expect } from 'vitest';
import {
  buildExplainedRiskProfile,
  buildRiskDimensionContext,
} from '../../../src/context/risk-context.js';
import { simpleFindingReport } from '../../fixtures/reports/simple-finding.js';
import { multiFindingReport } from '../../fixtures/reports/multi-finding.js';

describe('buildExplainedRiskProfile', () => {
  it('builds from simple report', () => {
    const risk = buildExplainedRiskProfile(simpleFindingReport);
    expect(risk.overallScore).toBe(8.5);
    expect(risk.overallLevel).toBe('critical');
    expect(risk.trustScore).toBe(0.3);
  });

  it('builds dimensions from risk drivers', () => {
    const risk = buildExplainedRiskProfile(multiFindingReport);
    expect(risk.dimensions).toBeDefined();
    expect(risk.dimensions!.length).toBe(2);
  });

  it('includes dimension names from findings', () => {
    const risk = buildExplainedRiskProfile(multiFindingReport);
    const dim = risk.dimensions?.find((d) => d.id === 'fin_multi_001');
    expect(dim?.name).toBe('Hardcoded AWS Key');
    expect(dim?.contribution).toBe(0.7);
  });

  it('handles missing risk drivers', () => {
    const reportNoDrivers = {
      ...simpleFindingReport,
      riskProfile: {
        ...simpleFindingReport.riskProfile,
        riskDrivers: [],
      },
    };
    const risk = buildExplainedRiskProfile(reportNoDrivers);
    expect(risk.dimensions).toBeUndefined();
  });
});

describe('buildRiskDimensionContext', () => {
  it('filters to specific dimension', () => {
    const dim = buildRiskDimensionContext('fin_multi_001', multiFindingReport);
    expect(dim.dimensions?.length).toBe(1);
    expect(dim.dimensions![0].id).toBe('fin_multi_001');
    expect(dim.dimensions![0].name).toBe('Hardcoded AWS Key');
  });

  it('returns full profile for unknown dimension', () => {
    const dim = buildRiskDimensionContext('unknown_dim', multiFindingReport);
    // Should fall back to full profile
    expect(dim.overallScore).toBe(9.0);
  });
});
