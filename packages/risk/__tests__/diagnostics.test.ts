/**
 * Tests for @veris/risk/diagnostics — RiskEngine diagnostics collector.
 *
 * ## Test Coverage
 *
 * ✓ empty evaluation
 * ✓ normal evaluation
 * ✓ truncation
 * ✓ skipped contributions
 * ✓ invalid input
 * ✓ finalize immutability
 * ✓ serialization compatibility
 * ✓ deterministic metadata
 * ✓ stage ordering
 * ✓ repeated execution
 *
 * @module @veris/risk/__tests__/diagnostics
 */

import { describe, it, expect, vi } from 'vitest';
import { RiskDiagnosticsCollector, createNoopDiagnosticsWriter } from '../src/diagnostics.js';
import type { DiagnosticsWriter } from '../src/diagnostics.js';
import { SCHEMA_VERSION, ENGINE_VERSION } from '../src/constants.js';

// ── Helpers ──

/**
 * Advances time by the given number of milliseconds.
 *
 * Used in tests that require non-zero stage durations.
 * We mock performance.now() to return incremental values.
 */
function setupTimeMock(): () => number {
  let now = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => {
    now += 5;
    return now;
  });
  return () => now;
}

// ── DiagnosticsCollector Construction ──

describe('RiskDiagnosticsCollector', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createDiagnostics', () => {
    it('creates a new collector via static factory', () => {
      const collector = RiskDiagnosticsCollector.createDiagnostics();
      expect(collector).toBeInstanceOf(RiskDiagnosticsCollector);
    });

    it('creates independent collectors', () => {
      const a = RiskDiagnosticsCollector.createDiagnostics();
      const b = RiskDiagnosticsCollector.createDiagnostics();

      expect(a).not.toBe(b);
      // Each collector must produce its own finalized diagnostics
      a.setContributionCount(5);
      b.setContributionCount(10);

      const diagA = a.finalizeDiagnostics();
      const diagB = b.finalizeDiagnostics();

      expect(diagA.contributionCount).toBe(5);
      expect(diagB.contributionCount).toBe(10);
    });
  });

  // ── Empty Evaluation ──

  describe('empty evaluation', () => {
    it('handles empty evaluation without errors', () => {
      const collector = RiskDiagnosticsCollector.createDiagnostics();
      const diagnostics = collector.finalizeDiagnostics();

      expect(diagnostics.contributionCount).toBe(0);
      expect(diagnostics.dimensionCount).toBe(0);
      expect(diagnostics.evidenceCount).toBe(0);
      expect(diagnostics.skippedContributions).toBe(0);
      expect(diagnostics.validationFailures).toBe(0);
      expect(diagnostics.stageTimings).toEqual([]);
      expect(diagnostics.truncationInfo).toBeNull();
    });

    it('produces valid version information', () => {
      const collector = RiskDiagnosticsCollector.createDiagnostics();
      const diagnostics = collector.finalizeDiagnostics();

      expect(diagnostics.engineVersion).toBe(ENGINE_VERSION);
      expect(diagnostics.schemaVersion).toBe(SCHEMA_VERSION);
    });
  });

  // ── Normal Evaluation ──

  describe('normal evaluation', () => {
    it('collects all metrics from a typical evaluation', () => {
      const collector = RiskDiagnosticsCollector.createDiagnostics();

      collector.recordStage('build-contributions');
      collector.setContributionCount(3);

      collector.recordStage('aggregate-dimensions');
      collector.setDimensionCount(2);

      collector.recordStage('compute-confidence');
      collector.recordStage('resolve-verdict');
      collector.setEvidenceCount(5);

      const diagnostics = collector.finalizeDiagnostics();

      expect(diagnostics.contributionCount).toBe(3);
      expect(diagnostics.dimensionCount).toBe(2);
      expect(diagnostics.evidenceCount).toBe(5);
      expect(diagnostics.skippedContributions).toBe(0);
      expect(diagnostics.validationFailures).toBe(0);
    });

    it('records stage timings in order', () => {
      const advance = setupTimeMock();

      const collector = RiskDiagnosticsCollector.createDiagnostics();
      collector.recordStage('validate');
      advance();
      collector.recordStage('build');
      advance();
      collector.recordStage('finalize');

      const diagnostics = collector.finalizeDiagnostics();
      const timings = diagnostics.stageTimings;

      expect(timings.length).toBe(3);
      expect(timings[0].name).toBe('validate');
      expect(timings[1].name).toBe('build');
      expect(timings[2].name).toBe('finalize');
    });

    it('records non-zero evaluation duration', () => {
      const advance = setupTimeMock();

      const collector = RiskDiagnosticsCollector.createDiagnostics();
      advance();
      advance();
      collector.recordStage('work');
      advance();
      advance();

      const diagnostics = collector.finalizeDiagnostics();

      expect(diagnostics.evaluationDurationMs).toBeGreaterThan(0);
      expect(typeof diagnostics.evaluationDurationMs).toBe('number');
      expect(Number.isFinite(diagnostics.evaluationDurationMs)).toBe(true);
    });
  });

  // ── Truncation ──

  describe('truncation', () => {
    it('records truncation info when contributions are truncated', () => {
      const collector = RiskDiagnosticsCollector.createDiagnostics();
      collector.setContributionCount(100);
      collector.setTruncationInfo({
        truncated: true,
        originalCount: 100,
        finalCount: 10,
      });

      const diagnostics = collector.finalizeDiagnostics();

      expect(diagnostics.truncationInfo).not.toBeNull();
      expect(diagnostics.truncationInfo!.truncated).toBe(true);
      expect(diagnostics.truncationInfo!.originalCount).toBe(100);
      expect(diagnostics.truncationInfo!.finalCount).toBe(10);
    });

    it('records null truncation info when no truncation', () => {
      const collector = RiskDiagnosticsCollector.createDiagnostics();
      collector.setContributionCount(5);
      collector.setTruncationInfo(null);

      const diagnostics = collector.finalizeDiagnostics();

      expect(diagnostics.truncationInfo).toBeNull();
    });

    it('automatically records no truncation when not set', () => {
      const collector = RiskDiagnosticsCollector.createDiagnostics();
      const diagnostics = collector.finalizeDiagnostics();

      expect(diagnostics.truncationInfo).toBeNull();
    });
  });

  // ── Skipped Contributions ──

  describe('skipped contributions', () => {
    it('records skipped contribution count', () => {
      const collector = RiskDiagnosticsCollector.createDiagnostics();
      collector.setSkippedContributions(3);

      const d = collector.finalizeDiagnostics();
      expect(d.skippedContributions).toBe(3);
    });

    it('defaults skipped contributions to 0', () => {
      const collector = RiskDiagnosticsCollector.createDiagnostics();
      const d = collector.finalizeDiagnostics();
      expect(d.skippedContributions).toBe(0);
    });
  });

  // ── Validation Failures ──

  describe('validation failures', () => {
    it('records validation failures incrementally', () => {
      const collector = RiskDiagnosticsCollector.createDiagnostics();
      collector.addValidationFailure();
      collector.addValidationFailure();
      collector.addValidationFailure();

      const d = collector.finalizeDiagnostics();
      expect(d.validationFailures).toBe(3);
    });

    it('defaults validation failures to 0', () => {
      const collector = RiskDiagnosticsCollector.createDiagnostics();
      const d = collector.finalizeDiagnostics();
      expect(d.validationFailures).toBe(0);
    });
  });

  // ── Finalize Immutability ──

  describe('finalize immutability', () => {
    it('returns a frozen object', () => {
      const collector = RiskDiagnosticsCollector.createDiagnostics();
      const diagnostics = collector.finalizeDiagnostics();

      expect(Object.isFrozen(diagnostics)).toBe(true);
    });

    it('returns frozen stage timings array', () => {
      const collector = RiskDiagnosticsCollector.createDiagnostics();
      collector.recordStage('test');
      const diagnostics = collector.finalizeDiagnostics();

      expect(Object.isFrozen(diagnostics.stageTimings)).toBe(true);
    });

    it('throws on double finalization', () => {
      const collector = RiskDiagnosticsCollector.createDiagnostics();
      collector.finalizeDiagnostics();

      expect(() => collector.finalizeDiagnostics()).toThrow(
        'RiskDiagnosticsCollector has already been finalized',
      );
    });

    it('recording becomes no-op after finalization', () => {
      const collector = RiskDiagnosticsCollector.createDiagnostics();
      collector.setContributionCount(5);
      collector.recordStage('initial');
      const diagnostics = collector.finalizeDiagnostics();

      // These post-finalize calls are silently ignored — no throw expected
      expect(() => {
        collector.recordStage('late');
        collector.setContributionCount(999);
        collector.addValidationFailure();
      }).not.toThrow();

      // The frozen diagnostics must retain their original values
      expect(diagnostics.contributionCount).toBe(5);
      expect(diagnostics.stageTimings.length).toBe(1);
      expect(diagnostics.validationFailures).toBe(0);
    });

    it('finalized diagnostics isolates from further collector mutations', () => {
      const collector = RiskDiagnosticsCollector.createDiagnostics();
      collector.setContributionCount(5);
      const diagnostics1 = collector.finalizeDiagnostics();

      // After finalization, setter calls are no-ops
      collector.setContributionCount(999);
      collector.setDimensionCount(3);

      // Re-finalizing throws, so we need to verify the frozen copy is immutable
      expect(diagnostics1.contributionCount).toBe(5);
      expect(diagnostics1.dimensionCount).toBe(0);
    });
  });

  // ── Serialization Compatibility ──

  describe('serialization compatibility', () => {
    it('is JSON-serializable', () => {
      const collector = RiskDiagnosticsCollector.createDiagnostics();
      collector.recordStage('build');
      collector.setContributionCount(5);
      collector.setDimensionCount(2);
      collector.setEvidenceCount(7);
      collector.setTruncationInfo({ truncated: true, originalCount: 10, finalCount: 5 });

      const diagnostics = collector.finalizeDiagnostics();
      const json = JSON.stringify(diagnostics);
      const parsed = JSON.parse(json);

      expect(parsed.contributionCount).toBe(5);
      expect(parsed.dimensionCount).toBe(2);
      expect(parsed.evidenceCount).toBe(7);
      expect(parsed.skippedContributions).toBe(0);
      expect(parsed.validationFailures).toBe(0);
      expect(parsed.engineVersion).toBe(ENGINE_VERSION);
      expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
      expect(parsed.truncationInfo.truncated).toBe(true);
      expect(parsed.stageTimings.length).toBe(1);
      expect(parsed.stageTimings[0].name).toBe('build');
    });

    it('round-trips through JSON without data loss', () => {
      const collector = RiskDiagnosticsCollector.createDiagnostics();
      collector.setContributionCount(42);
      collector.setDimensionCount(3);
      collector.setEvidenceCount(10);
      collector.setSkippedContributions(1);

      const d1 = collector.finalizeDiagnostics();
      const json = JSON.stringify(d1);
      const d2 = JSON.parse(json);

      // Re-serialize to check round-trip stability
      const roundTrip = JSON.parse(JSON.stringify(d2));

      expect(roundTrip.contributionCount).toBe(42);
      expect(roundTrip.dimensionCount).toBe(3);
      expect(roundTrip.evidenceCount).toBe(10);
      expect(roundTrip.skippedContributions).toBe(1);
      expect(roundTrip.engineVersion).toBe(ENGINE_VERSION);
      expect(roundTrip.schemaVersion).toBe(SCHEMA_VERSION);
    });
  });

  // ── Deterministic Metadata ──

  describe('deterministic metadata', () => {
    it('always includes engine version from constants', () => {
      const c1 = RiskDiagnosticsCollector.createDiagnostics();
      const c2 = RiskDiagnosticsCollector.createDiagnostics();

      const d1 = c1.finalizeDiagnostics();
      const d2 = c2.finalizeDiagnostics();

      expect(d1.engineVersion).toBe(ENGINE_VERSION);
      expect(d2.engineVersion).toBe(ENGINE_VERSION);
    });

    it('always includes schema version from constants', () => {
      const c1 = RiskDiagnosticsCollector.createDiagnostics();
      const c2 = RiskDiagnosticsCollector.createDiagnostics();

      const d1 = c1.finalizeDiagnostics();
      const d2 = c2.finalizeDiagnostics();

      expect(d1.schemaVersion).toBe(SCHEMA_VERSION);
      expect(d2.schemaVersion).toBe(SCHEMA_VERSION);
    });

    it('deterministic counters produce identical outputs', () => {
      const c1 = RiskDiagnosticsCollector.createDiagnostics();
      c1.setContributionCount(10);
      c1.setDimensionCount(2);
      c1.setEvidenceCount(5);
      c1.setSkippedContributions(1);
      c1.addValidationFailure();
      c1.addValidationFailure();

      const c2 = RiskDiagnosticsCollector.createDiagnostics();
      c2.setContributionCount(10);
      c2.setDimensionCount(2);
      c2.setEvidenceCount(5);
      c2.setSkippedContributions(1);
      c2.addValidationFailure();
      c2.addValidationFailure();

      const d1 = c1.finalizeDiagnostics();
      const d2 = c2.finalizeDiagnostics();

      // Non-timing fields should be identical
      expect(d1.contributionCount).toBe(d2.contributionCount);
      expect(d1.dimensionCount).toBe(d2.dimensionCount);
      expect(d1.evidenceCount).toBe(d2.evidenceCount);
      expect(d1.skippedContributions).toBe(d2.skippedContributions);
      expect(d1.validationFailures).toBe(d2.validationFailures);
      expect(d1.engineVersion).toBe(d2.engineVersion);
      expect(d1.schemaVersion).toBe(d2.schemaVersion);
    });
  });

  // ── Stage Ordering ──

  describe('stage ordering', () => {
    it('preserves stage recording order', () => {
      const collector = RiskDiagnosticsCollector.createDiagnostics();
      collector.recordStage('alpha');
      collector.recordStage('beta');
      collector.recordStage('gamma');

      const d = collector.finalizeDiagnostics();
      expect(d.stageTimings.map((s) => s.name)).toEqual(['alpha', 'beta', 'gamma']);
    });

    it('each stage has a name and duration', () => {
      const advance = setupTimeMock();

      const collector = RiskDiagnosticsCollector.createDiagnostics();
      advance();
      collector.recordStage('first');
      advance();
      collector.recordStage('second');

      const d = collector.finalizeDiagnostics();

      expect(d.stageTimings.length).toBe(2);
      for (const stage of d.stageTimings) {
        expect(typeof stage.name).toBe('string');
        expect(stage.name.length).toBeGreaterThan(0);
        expect(typeof stage.durationMs).toBe('number');
        expect(stage.durationMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ── Repeated Execution ──

  describe('repeated execution', () => {
    it('collectors are independent across runs', () => {
      const c1 = RiskDiagnosticsCollector.createDiagnostics();
      c1.setContributionCount(5);
      c1.recordStage('run1');

      const c2 = RiskDiagnosticsCollector.createDiagnostics();
      c2.setContributionCount(8);
      c2.recordStage('run2');

      const d1 = c1.finalizeDiagnostics();
      const d2 = c2.finalizeDiagnostics();

      expect(d1.contributionCount).toBe(5);
      expect(d2.contributionCount).toBe(8);
      expect(d1.stageTimings[0].name).toBe('run1');
      expect(d2.stageTimings[0].name).toBe('run2');
    });

    it('identical recording produces identical (non-timing) fields', () => {
      const record = (c: RiskDiagnosticsCollector) => {
        c.recordStage('build');
        c.setContributionCount(3);
        c.setDimensionCount(2);
        c.setEvidenceCount(4);
        c.setSkippedContributions(0);
        c.setTruncationInfo({ truncated: false, originalCount: 3, finalCount: 3 });
      };

      const c1 = RiskDiagnosticsCollector.createDiagnostics();
      record(c1);
      const d1 = c1.finalizeDiagnostics();

      const c2 = RiskDiagnosticsCollector.createDiagnostics();
      record(c2);
      const d2 = c2.finalizeDiagnostics();

      // Same deterministic fields
      expect(d1.contributionCount).toBe(d2.contributionCount);
      expect(d1.dimensionCount).toBe(d2.dimensionCount);
      expect(d1.evidenceCount).toBe(d2.evidenceCount);
      expect(d1.skippedContributions).toBe(d2.skippedContributions);
      expect(d1.truncationInfo).toEqual(d2.truncationInfo);
    });
  });

  // ── DiagnosticsWriter Interface ──

  describe('DiagnosticsWriter interface', () => {
    it('collector satisfies the DiagnosticsWriter interface', () => {
      const collector = RiskDiagnosticsCollector.createDiagnostics();
      const writer: DiagnosticsWriter = collector;

      // Should compile without error — interface compliance
      writer.recordStage('test');
      writer.setContributionCount(1);
      writer.setDimensionCount(1);
      writer.setEvidenceCount(1);
      writer.setSkippedContributions(0);
      writer.addValidationFailure();
      writer.setTruncationInfo(null);

      const d = collector.finalizeDiagnostics();
      expect(d.stageTimings.length).toBe(1);
      expect(d.contributionCount).toBe(1);
      expect(d.dimensionCount).toBe(1);
      expect(d.evidenceCount).toBe(1);
      expect(d.validationFailures).toBe(1);
    });

    it('no-op writer does nothing', () => {
      const writer = createNoopDiagnosticsWriter();

      // These should not throw
      writer.recordStage('test');
      writer.setContributionCount(99);
      writer.addValidationFailure();
      writer.setTruncationInfo({ truncated: true, originalCount: 10, finalCount: 5 });

      // No-op writer has no state to verify, but it should not throw
      expect(true).toBe(true);
    });
  });

  // ── Edge Cases ──

  describe('edge cases', () => {
    it('handles NaN contribution count gracefully', () => {
      const collector = RiskDiagnosticsCollector.createDiagnostics();
      collector.setContributionCount(NaN);

      const d = collector.finalizeDiagnostics();
      expect(Number.isNaN(d.contributionCount)).toBe(true);
    });

    it('handles negative counts', () => {
      const collector = RiskDiagnosticsCollector.createDiagnostics();
      collector.setContributionCount(-1);

      const d = collector.finalizeDiagnostics();
      expect(d.contributionCount).toBe(-1);
    });

    it('handles many stages', () => {
      const collector = RiskDiagnosticsCollector.createDiagnostics();
      const stageCount = 100;
      for (let i = 0; i < stageCount; i++) {
        collector.recordStage(`stage-${i}`);
      }

      const d = collector.finalizeDiagnostics();
      expect(d.stageTimings.length).toBe(stageCount);
      expect(d.stageTimings[0].name).toBe('stage-0');
      expect(d.stageTimings[99].name).toBe('stage-99');
    });

    it('finalize can be called immediately after creation', () => {
      const collector = RiskDiagnosticsCollector.createDiagnostics();
      const d = collector.finalizeDiagnostics();

      expect(d.evaluationDurationMs).toBeGreaterThanOrEqual(0);
      expect(d.contributionCount).toBe(0);
      expect(d.stageTimings).toEqual([]);
    });
  });
});
