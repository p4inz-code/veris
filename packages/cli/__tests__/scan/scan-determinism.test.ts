/**
 * CLI scan determinism regression test.
 *
 * The existing determinism contract (README / docs / RELEASE): identical
 * inputs produce byte-for-byte identical analysis results — findings,
 * evidence, ordering, and risk scores. Report files additionally record run
 * metadata (IDs, timestamps, and wall-clock duration) as part of the report
 * contract.
 *
 * This test runs the real `runScan` twice with an identical target and an
 * identical `computedAt`, then proves the analysis payload (everything except
 * the documented run metadata) is identical across the two runs.
 */
import { describe, expect, it } from 'vitest';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { runScan } from '../../src/commands/scan.js';

/** Fixed timestamp so all timestamp-derived IDs are identical across runs. */
const COMPUTED_AT = '2026-08-09T00:00:00.000Z';

/** Fields that legitimately vary per-run: wall-clock runtime metadata only. */
const RUNTIME_METADATA_FIELDS = new Set(['scanDurationMs', 'startedAt', 'completedAt']);

/** Recursively drop wall-clock runtime metadata from a parsed report. */
function withoutRuntimeMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutRuntimeMetadata);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (RUNTIME_METADATA_FIELDS.has(key)) continue;
      out[key] = withoutRuntimeMetadata(child);
    }
    return out;
  }
  return value;
}

async function scanOnce(target: string, output: string): Promise<void> {
  const { exitCode } = await runScan({
    target,
    progress: 'silent',
    computedAt: COMPUTED_AT,
    format: ['json'],
    output,
  });
  expect(exitCode).toBe(0);
}

describe('scan command determinism', () => {
  it('produces an identical analysis payload across repeated scans with the same computedAt', async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'veris-determinism-'));
    // The scan target and the output directories must not overlap: run A's
    // report.json would otherwise become part of run B's input, changing the
    // input between runs.
    const target = path.join(root, 'target');
    const outA = path.join(root, 'out-a');
    const outB = path.join(root, 'out-b');
    await fsp.mkdir(target, { recursive: true });
    try {
      for (let i = 0; i < 5; i++) {
        await fsp.writeFile(path.join(target, `f${i}.js`), `var v${i} = ${i};\n`);
      }

      await scanOnce(target, outA);
      await scanOnce(target, outB);

      const first = JSON.parse(
        await fsp.readFile(path.join(outA, 'report.json'), 'utf-8'),
      ) as unknown;
      const second = JSON.parse(
        await fsp.readFile(path.join(outB, 'report.json'), 'utf-8'),
      ) as unknown;

      // Identical timestamp-derived IDs (sessionId, reportId, artifact IDs…)
      // plus byte-identical findings/evidence/ordering/risk payload.
      expect(withoutRuntimeMetadata(first)).toEqual(withoutRuntimeMetadata(second));
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });
});
