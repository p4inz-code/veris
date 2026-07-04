/**
 * Tests for M3 — Chain context builder.
 *
 * Tests:
 * - ExplainedChain construction from canonical BehaviorChain
 * - ChainBuildResult with findings and evidence
 * - Edge cases: no findings in chain, empty chain
 *
 * @module @veris/explain/__tests__/unit/context/chain-context.test
 */

import { describe, it, expect } from 'vitest';
import { buildExplainedChain, buildChainContext } from '../../../src/context/chain-context.js';
import { multiFindingReport, testChain } from '../../fixtures/reports/multi-finding.js';

describe('buildExplainedChain', () => {
  it('builds from canonical chain', () => {
    const chain = buildExplainedChain(testChain);
    expect(chain.id).toBe('bc_multi_001');
    expect(chain.findingIds).toContain('fin_multi_001');
    expect(chain.findingIds).toContain('fin_multi_002');
    expect(chain.description).toBeDefined();
  });

  it('uses a default name when description is absent', () => {
    const chainNoDesc = { ...testChain, description: undefined };
    const chain = buildExplainedChain(chainNoDesc);
    expect(chain.name).toContain('bc_multi_001');
    expect(chain.description).toBeUndefined();
  });
});

describe('buildChainContext', () => {
  it('builds complete chain context with findings', () => {
    const ctx = buildChainContext(testChain, multiFindingReport);
    expect(ctx.chain.id).toBe('bc_multi_001');
    expect(ctx.findings.length).toBe(2);
    expect(ctx.findings[0].id).toBe('fin_multi_001');
    expect(ctx.findings[1].id).toBe('fin_multi_002');
  });

  it('includes evidence for each finding', () => {
    const ctx = buildChainContext(testChain, multiFindingReport);
    // Each finding should have evidence entries
    for (const findingId of ctx.chain.findingIds) {
      expect(ctx.evidenceByFinding[findingId]).toBeDefined();
    }
  });

  it('skips missing findings gracefully', () => {
    const chainWithMissing = {
      ...testChain,
      findingIds: ['fin_multi_001', 'fin_nonexistent'],
    };
    const ctx = buildChainContext(chainWithMissing, multiFindingReport);
    expect(ctx.findings.length).toBe(1); // Only the finding that exists
    expect(ctx.findings[0].id).toBe('fin_multi_001');
  });

  it('handles chain with no findings', () => {
    const emptyChain = { ...testChain, findingIds: [] };
    const ctx = buildChainContext(emptyChain, multiFindingReport);
    expect(ctx.findings).toEqual([]);
    expect(Object.keys(ctx.evidenceByFinding)).toEqual([]);
  });
});
