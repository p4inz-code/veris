/**
 * Tests verifying determinism invariants and reproducible outputs in the SDK.
 */

import { describe, expect, it } from 'vitest';

import { customTokenExtractor } from '../examples/custom-extractor.js';
import { DETERMINISM_INVARIANTS, DETERMINISM_RULES } from '../src/index.js';

describe('SDK Determinism Contract', () => {
  it('exposes all foundational determinism invariants', () => {
    expect(DETERMINISM_INVARIANTS.NO_RANDOMNESS).toBeDefined();
    expect(DETERMINISM_INVARIANTS.NO_WALL_CLOCK_TIME).toBeDefined();
    expect(DETERMINISM_INVARIANTS.NO_FILESYSTEM_RACES).toBeDefined();
    expect(DETERMINISM_INVARIANTS.NO_NETWORK).toBeDefined();
    expect(DETERMINISM_INVARIANTS.DECLARATIVE_RULES).toBeDefined();
    expect(DETERMINISM_INVARIANTS.STABLE_ORDERING).toBeDefined();

    expect(DETERMINISM_RULES.length).toBeGreaterThanOrEqual(6);
  });

  it('guarantees 100% deterministic output across 100 repeated executions', async () => {
    const content = new TextEncoder().encode(
      'export const A = "SEC-TOKEN-1111222233334444";\nexport const B = "SEC-TOKEN-AAAABBBBCCCCDDDD";\n',
    );

    const mockContext = {
      artifact: {
        id: 'art-det-1',
        path: '/test/tokens.ts',
        name: 'tokens.ts',
        size: content.length,
      },
      content,
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      config: {},
    };

    const firstRun = await customTokenExtractor.extract(mockContext);
    const baselineJson = JSON.stringify(firstRun);

    for (let i = 0; i < 100; i++) {
      const run = await customTokenExtractor.extract(mockContext);
      const runJson = JSON.stringify(run);
      expect(runJson).toBe(baselineJson);
    }
  });
});
