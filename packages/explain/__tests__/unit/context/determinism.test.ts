/**
 * Determinism tests for M3 — Context building.
 *
 * Tests that context building is 100% deterministic:
 * - Same report + same scope → identical ExplainedContext
 * - Across 100 repeated runs
 * - All subject types (finding, chain, risk, report)
 *
 * @module @veris/explain/__tests__/unit/context/determinism.test
 */

import { describe, it, expect } from 'vitest';
import { createContextBuilder } from '../../../src/context/context-builder.js';
import { hashContext } from '../../../src/context/serializer.js';
import { simpleFindingReport } from '../../fixtures/reports/simple-finding.js';
import { multiFindingReport } from '../../fixtures/reports/multi-finding.js';
import type {
  FindingScope,
  ChainScope,
  RiskScope,
  ReportScope,
  ExplainScope,
} from '../../../src/engine/scope-manager.js';

const RUNS = 100;

describe('Context determinism', () => {
  const builder = createContextBuilder();

  it('finding context is deterministic across 100 runs', () => {
    const scope: ExplainScope = {
      type: 'finding',
      findingId: 'fin_simple_001',
      evidenceIds: ['ev_simple_001'],
      ruleId: 'secrets/aws-key',
      artifactIds: ['art_simple_001'],
    };

    const first = hashContext(builder.build(scope, simpleFindingReport));

    for (let i = 0; i < RUNS; i++) {
      const ctx = builder.build(scope, simpleFindingReport);
      expect(hashContext(ctx)).toBe(first);
    }
  });

  it('chain context is deterministic across 100 runs', () => {
    const scope: ExplainScope = {
      type: 'chain',
      chainId: 'bc_multi_001',
      findingIds: ['fin_multi_001', 'fin_multi_002'],
    };

    const first = hashContext(builder.build(scope, multiFindingReport));

    for (let i = 0; i < RUNS; i++) {
      const ctx = builder.build(scope, multiFindingReport);
      expect(hashContext(ctx)).toBe(first);
    }
  });

  it('risk context is deterministic across 100 runs', () => {
    const scope: ExplainScope = {
      type: 'risk',
      dimensionId: 'fin_multi_001',
    };

    const first = hashContext(builder.build(scope, multiFindingReport));

    for (let i = 0; i < RUNS; i++) {
      const ctx = builder.build(scope, multiFindingReport);
      expect(hashContext(ctx)).toBe(first);
    }
  });

  it('report context is deterministic across 100 runs', () => {
    const scope: ExplainScope = { type: 'report' };

    const first = hashContext(builder.build(scope, multiFindingReport));

    for (let i = 0; i < RUNS; i++) {
      const ctx = builder.build(scope, multiFindingReport);
      expect(hashContext(ctx)).toBe(first);
    }
  });
});
