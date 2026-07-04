/**
 * Tests for M3 — Context builder orchestrator.
 *
 * Tests:
 * - Finding context building from scope
 * - Chain context building from scope
 * - Risk context building from scope
 * - Report context building from scope
 * - Frozen context (immutability)
 * - contextSchemaVersion presence
 * - Error handling for missing objects
 *
 * @module @veris/explain/__tests__/unit/context/context-builder.test
 */

import { describe, it, expect } from 'vitest';
import { createContextBuilder } from '../../../src/context/context-builder.js';
import { simpleFindingReport } from '../../fixtures/reports/simple-finding.js';
import { multiFindingReport } from '../../fixtures/reports/multi-finding.js';
import { zeroEvidenceReport } from '../../fixtures/reports/edge-cases.js';
import type {
  FindingScope,
  ChainScope,
  RiskScope,
  ReportScope,
} from '../../../src/engine/scope-manager.js';
import type { ExplainedContext } from '../../../src/types/context.js';

describe('ContextBuilder', () => {
  const builder = createContextBuilder();

  describe('build finding context', () => {
    const scope: FindingScope = {
      type: 'finding',
      findingId: 'fin_simple_001',
      evidenceIds: ['ev_simple_001'],
      ruleId: 'secrets/aws-key',
      artifactIds: ['art_simple_001'],
    };

    it('builds frozen ExplainedContext', () => {
      const ctx = builder.build(scope, simpleFindingReport);
      expect(ctx.subject).toBeDefined();
      expect(ctx.evidence).toBeDefined();
      expect(ctx.rule).toBeDefined();
      expect(ctx.artifact).toBeDefined();
    });

    it('includes contextSchemaVersion', () => {
      const ctx = builder.build(scope, simpleFindingReport);
      expect(ctx.contextSchemaVersion).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('is deeply frozen', () => {
      const ctx = builder.build(scope, simpleFindingReport);
      expect(Object.isFrozen(ctx)).toBe(true);
      expect(Object.isFrozen(ctx.subject as Record<string, unknown>)).toBe(true);
    });

    it('includes token budget', () => {
      const ctx = builder.build(scope, simpleFindingReport);
      expect(ctx.tokenBudget).toBeDefined();
      expect(typeof ctx.tokenBudget.allocated).toBe('number');
    });

    it('throws for non-existent finding', () => {
      const badScope: FindingScope = {
        type: 'finding',
        findingId: 'fin_nonexistent',
        evidenceIds: [],
        ruleId: '',
        artifactIds: [],
      };
      expect(() => builder.build(badScope, simpleFindingReport)).toThrow();
    });
  });

  describe('build chain context', () => {
    const scope: ChainScope = {
      type: 'chain',
      chainId: 'bc_multi_001',
      findingIds: ['fin_multi_001', 'fin_multi_002'],
    };

    it('builds chain context with findings', () => {
      const ctx = builder.build(scope, multiFindingReport);
      expect(ctx.subject).toBeDefined();
      expect(ctx.evidence).toBeDefined();
      expect(ctx.risk).toBeDefined();
      expect(ctx.contextSchemaVersion).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('is deeply frozen', () => {
      const ctx = builder.build(scope, multiFindingReport);
      expect(Object.isFrozen(ctx)).toBe(true);
    });

    it('throws for non-existent chain', () => {
      const badScope: ChainScope = { type: 'chain', chainId: 'bc_nonexistent', findingIds: [] };
      expect(() => builder.build(badScope, multiFindingReport)).toThrow();
    });
  });

  describe('build risk context', () => {
    const scope: RiskScope = {
      type: 'risk',
      dimensionId: 'fin_multi_001',
    };

    it('builds risk context with dimensions', () => {
      const ctx = builder.build(scope, multiFindingReport);
      expect(ctx.subject).toBeDefined();
      expect(ctx.risk).toBeDefined();
      expect(ctx.evidence).toEqual([]);
    });

    it('is deeply frozen', () => {
      const ctx = builder.build(scope, multiFindingReport);
      expect(Object.isFrozen(ctx)).toBe(true);
    });
  });

  describe('build report context', () => {
    const scope: ReportScope = { type: 'report' };

    it('builds report summary', () => {
      const ctx = builder.build(scope, multiFindingReport);
      expect(ctx.subject).toBeDefined();
      expect(ctx.report).toBeDefined();
      expect(ctx.report!.totalFindings).toBe(3);
    });

    it('includes risk context', () => {
      const ctx = builder.build(scope, multiFindingReport);
      expect(ctx.risk).toBeDefined();
      expect(ctx.risk!.overallScore).toBe(9.0);
    });

    it('is deeply frozen', () => {
      const ctx = builder.build(scope, multiFindingReport);
      expect(Object.isFrozen(ctx)).toBe(true);
    });
  });
});
