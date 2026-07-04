import { describe, it, expect } from 'vitest';
import { createSourceLocation } from '@veris/core';
import type { Artifact } from '@veris/core';
import { createKnowledgeLocation } from '../src/index.js';
import { FeatureBuilder } from '../src/index.js';
import { FeatureNormalizer } from '../src/index.js';
import type { RawFeature } from '../src/index.js';
import { FeatureRegistry } from '../src/index.js';
import { CapabilityBuilder, KnowledgeEngine } from '../src/index.js';
import {
  validateFeature,
  validateFeatureBatch,
  isKnownFeatureType,
  getKnownFeatureTypes,
  createProvenance,
  createKnowledgeDiagnostics,
  createCapability,
} from '../src/index.js';

// ── Test Helpers ──

function makeLocation(
  overrides?: Partial<ReturnType<typeof createSourceLocation>> & { path?: string },
) {
  const core = createSourceLocation({
    startLine: 1,
    startColumn: 0,
    endLine: 1,
    endColumn: 5,
    offset: 0,
    length: 5,
    ...overrides,
  });
  return createKnowledgeLocation(core, overrides?.path ?? '/test/file.py');
}

function makeProvenance(overrides?: Record<string, string>) {
  return createProvenance({
    extractorId: 'test-extractor',
    extractorVersion: '1.0.0',
    ...overrides,
  });
}

function makeArtifact(overrides?: Partial<Artifact>): Artifact {
  return {
    id: overrides?.id ?? 'art_test_001',
    sessionId: overrides?.sessionId ?? 'ss_test_001',
    parentId: overrides?.parentId ?? null,
    type: overrides?.type ?? 'script',
    subType: 'Python',
    originalPath: '/test/script.py',
    normalizedPath: '/test/script.py',
    size: 100,
    contentHash: { algorithm: 'sha-256', value: 'abc123' },
    mimeType: 'text/x-python',
    encoding: 'utf-8',
    metadata: {},
    extractedAt: new Date().toISOString(),
    extractorId: 'test-extractor',
    truncated: false,
    ...overrides,
  };
}

function makeRawFeature(overrides?: Partial<RawFeature>): RawFeature {
  return {
    rawType: overrides?.rawType ?? 'string-literal',
    rawValue: overrides !== undefined && 'rawValue' in overrides ? overrides.rawValue : 'hello',
    location: overrides?.location ?? makeLocation(),
    confidence: overrides?.confidence ?? 0.95,
    metadata: overrides?.metadata,
  };
}

// ── Tests ──

describe('FeatureBuilder', () => {
  it('should build a valid feature', () => {
    const feature = new FeatureBuilder()
      .withArtifactId('art_001')
      .withSessionId('ss_001')
      .withType('string-literal')
      .withValue({ kind: 'string', value: 'hello' })
      .withLocation(makeLocation())
      .withConfidence(0.95)
      .withProvenance(makeProvenance())
      .build();

    expect(feature.id).toMatch(/^feat_[a-f0-9]+$/);
    expect(feature.artifactId).toBe('art_001');
    expect(feature.sessionId).toBe('ss_001');
    expect(feature.type).toBe('string-literal');
    expect(feature.value).toEqual({ kind: 'string', value: 'hello' });
    expect(feature.confidence).toBe(0.95);
    expect(feature.provenance.extractorId).toBe('test-extractor');
    expect(Object.isFrozen(feature)).toBe(true);
  });

  it('should generate deterministic IDs from same inputs', () => {
    const f1 = new FeatureBuilder()
      .withArtifactId('art_001')
      .withSessionId('ss_001')
      .withType('string-literal')
      .withValue({ kind: 'string', value: 'hello' })
      .withLocation(makeLocation())
      .withConfidence(0.95)
      .withProvenance(makeProvenance())
      .build();

    const f2 = new FeatureBuilder()
      .withArtifactId('art_001')
      .withSessionId('ss_001')
      .withType('string-literal')
      .withValue({ kind: 'string', value: 'hello' })
      .withLocation(makeLocation())
      .withConfidence(0.95)
      .withProvenance(makeProvenance())
      .build();

    expect(f1.id).toBe(f2.id);
  });

  it('should generate different IDs for different values', () => {
    const f1 = new FeatureBuilder()
      .withArtifactId('art_001')
      .withSessionId('ss_001')
      .withType('string-literal')
      .withValue({ kind: 'string', value: 'hello' })
      .withLocation(makeLocation())
      .withConfidence(0.95)
      .withProvenance(makeProvenance())
      .build();

    const f2 = new FeatureBuilder()
      .withArtifactId('art_001')
      .withSessionId('ss_001')
      .withType('string-literal')
      .withValue({ kind: 'string', value: 'world' })
      .withLocation(makeLocation())
      .withConfidence(0.95)
      .withProvenance(makeProvenance())
      .build();

    expect(f1.id).not.toBe(f2.id);
  });

  it('should throw when missing required fields', () => {
    expect(() => new FeatureBuilder().build()).toThrow('missing required fields');
  });

  it('should throw when confidence is out of range', () => {
    expect(() =>
      new FeatureBuilder()
        .withArtifactId('art_001')
        .withSessionId('ss_001')
        .withType('string-literal')
        .withValue({ kind: 'string', value: 'hello' })
        .withLocation(makeLocation())
        .withConfidence(1.5)
        .withProvenance(makeProvenance())
        .build(),
    ).toThrow('confidence must be in [0.0, 1.0]');
  });

  it('should throw on negative confidence', () => {
    expect(() =>
      new FeatureBuilder()
        .withArtifactId('art_001')
        .withSessionId('ss_001')
        .withType('string-literal')
        .withValue({ kind: 'string', value: 'hello' })
        .withLocation(makeLocation())
        .withConfidence(-0.1)
        .withProvenance(makeProvenance())
        .build(),
    ).toThrow('confidence must be in [0.0, 1.0]');
  });

  it('should validate location coordinates', () => {
    expect(() =>
      new FeatureBuilder()
        .withArtifactId('art_001')
        .withSessionId('ss_001')
        .withType('string-literal')
        .withValue({ kind: 'string', value: 'hello' })
        .withLocation(
          createSourceLocation({
            startLine: 0,
            startColumn: 0,
            endLine: 1,
            endColumn: 5,
            offset: 0,
            length: 5,
          }),
        )
        .withConfidence(0.95)
        .withProvenance(makeProvenance())
        .build(),
    ).toThrow('startLine must be >= 1');
  });

  it('should validate endLine >= startLine', () => {
    expect(() =>
      new FeatureBuilder()
        .withArtifactId('art_001')
        .withSessionId('ss_001')
        .withType('string-literal')
        .withValue({ kind: 'string', value: 'hello' })
        .withLocation(
          createSourceLocation({
            startLine: 5,
            startColumn: 0,
            endLine: 3,
            endColumn: 5,
            offset: 0,
            length: 5,
          }),
        )
        .withConfidence(0.95)
        .withProvenance(makeProvenance())
        .build(),
    ).toThrow('endLine must be >= startLine');
  });

  it('should support reset()', () => {
    const builder = new FeatureBuilder();
    builder
      .withArtifactId('art_001')
      .withSessionId('ss_001')
      .withType('string-literal')
      .withValue({ kind: 'string', value: 'hello' })
      .withLocation(makeLocation())
      .withConfidence(0.95)
      .withProvenance(makeProvenance())
      .build();

    builder.reset();
    expect(() => builder.build()).toThrow('missing required fields');
  });

  it('should include metadata when provided', () => {
    const feature = new FeatureBuilder()
      .withArtifactId('art_001')
      .withSessionId('ss_001')
      .withType('string-literal')
      .withValue({ kind: 'string', value: 'hello' })
      .withLocation(makeLocation())
      .withConfidence(0.95)
      .withProvenance(makeProvenance())
      .withMetadata({ source: 'parser', lineCount: 42 })
      .build();

    expect(feature.metadata).toBeDefined();
    expect(feature.metadata!['source']).toBe('parser');
    expect(Object.isFrozen(feature.metadata!)).toBe(true);
  });
});

describe('FeatureValidator', () => {
  it('should validate a correct feature', () => {
    const feature = new FeatureBuilder()
      .withArtifactId('art_001')
      .withSessionId('ss_001')
      .withType('string-literal')
      .withValue({ kind: 'string', value: 'hello' })
      .withLocation(makeLocation())
      .withConfidence(0.95)
      .withProvenance(makeProvenance())
      .build();

    const result = validateFeature(feature);
    expect(result.ok).toBe(true);
  });

  it('should reject unknown feature type', () => {
    const feature = new FeatureBuilder()
      .withArtifactId('art_001')
      .withSessionId('ss_001')
      .withType('unknown-type' as any)
      .withValue({ kind: 'string', value: 'hello' })
      .withLocation(makeLocation())
      .withConfidence(0.95)
      .withProvenance(makeProvenance())
      .build();

    const result = validateFeature(feature);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.some((e) => e.code === 'UNKNOWN_TYPE')).toBe(true);
    }
  });

  it('should reject missing artifactId', () => {
    const feature = new FeatureBuilder()
      .withArtifactId('art_001')
      .withSessionId('ss_001')
      .withType('string-literal')
      .withValue({ kind: 'string', value: 'hello' })
      .withLocation(makeLocation())
      .withConfidence(0.95)
      .withProvenance(makeProvenance())
      .build();

    // Manually corrupt the frozen object's reference — freeze prevents this
    // Instead test via validateFeature on a manually constructed invalid feature
    const invalid = { ...feature, artifactId: '' };
    const result = validateFeature(invalid);
    expect(result.ok).toBe(false);
  });

  it('should reject invalid FeatureValue kinds', () => {
    const feature = new FeatureBuilder()
      .withArtifactId('art_001')
      .withSessionId('ss_001')
      .withType('string-literal')
      .withValue({ kind: 'invalid' as any, value: 'test' })
      .withLocation(makeLocation())
      .withConfidence(0.95)
      .withProvenance(makeProvenance())
      .build();

    const result = validateFeature(feature);
    expect(result.ok).toBe(false);
  });

  it('should validate bytes encoding', () => {
    const feature = new FeatureBuilder()
      .withArtifactId('art_001')
      .withSessionId('ss_001')
      .withType('binary-pattern')
      .withValue({ kind: 'bytes', value: 'abcdef', encoding: 'invalid' as any })
      .withLocation(makeLocation())
      .withConfidence(0.95)
      .withProvenance(makeProvenance())
      .build();

    const result = validateFeature(feature);
    expect(result.ok).toBe(false);
  });

  it('should validate batch of features', () => {
    const f1 = new FeatureBuilder()
      .withArtifactId('art_001')
      .withSessionId('ss_001')
      .withType('string-literal')
      .withValue({ kind: 'string', value: 'a' })
      .withLocation(makeLocation())
      .withConfidence(0.95)
      .withProvenance(makeProvenance())
      .build();
    const f2 = new FeatureBuilder()
      .withArtifactId('art_001')
      .withSessionId('ss_001')
      .withType('url')
      .withValue({ kind: 'string', value: 'http://example.com' })
      .withLocation(makeLocation({ offset: 10, length: 20 }))
      .withConfidence(0.8)
      .withProvenance(makeProvenance())
      .build();

    const result = validateFeatureBatch([f1, f2]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
    }
  });
});

describe('FeatureNormalizer', () => {
  it('should normalize a raw feature', () => {
    const normalizer = new FeatureNormalizer();
    const raw = makeRawFeature();
    const result = normalizer.normalize(raw, 'art_001', 'ss_001', makeProvenance());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toMatch(/^feat_[a-f0-9]+$/);
      expect(result.value.type).toBe('string-literal');
      expect(result.value.value).toEqual({ kind: 'string', value: 'hello' });
    }
  });

  it('should reject unknown raw types', () => {
    const normalizer = new FeatureNormalizer();
    const raw = makeRawFeature({ rawType: 'nonexistent-pattern' });
    const result = normalizer.normalize(raw, 'art_001', 'ss_001', makeProvenance());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NO_MATCHING_RULE');
    }
  });

  it('should normalize Python-specific patterns', () => {
    const normalizer = new FeatureNormalizer();
    const raw = makeRawFeature({ rawType: 'python-function-call', rawValue: 'eval' });
    const result = normalizer.normalize(raw, 'art_001', 'ss_001', makeProvenance());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('function-call');
    }
  });

  it('should normalize PE-specific patterns', () => {
    const normalizer = new FeatureNormalizer();
    const raw = makeRawFeature({ rawType: 'pe-import', rawValue: 'CreateFile' });
    const result = normalizer.normalize(raw, 'art_001', 'ss_001', makeProvenance());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.type).toBe('import-statement');
    }
  });

  it('should detect duplicates', () => {
    const normalizer = new FeatureNormalizer();
    const raw = makeRawFeature();

    // First normalization should succeed
    const r1 = normalizer.normalize(raw, 'art_001', 'ss_001', makeProvenance());
    expect(r1.ok).toBe(true);

    // Second normalization with same inputs should be duplicate
    const r2 = normalizer.normalize(raw, 'art_001', 'ss_001', makeProvenance());
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.error.code).toBe('DUPLICATE_FEATURE');
    }
  });

  it('should accept same feature for different artifacts', () => {
    const normalizer = new FeatureNormalizer();
    const raw = makeRawFeature();

    const r1 = normalizer.normalize(raw, 'art_001', 'ss_001', makeProvenance());
    expect(r1.ok).toBe(true);

    // Reset cache for different artifact
    normalizer.resetCache();

    const r2 = normalizer.normalize(raw, 'art_002', 'ss_001', makeProvenance());
    expect(r2.ok).toBe(true);
    if (r2.ok && r1.ok) {
      expect(r1.value.id).not.toBe(r2.value.id);
    }
  });

  it('should normalize a batch of features', () => {
    const normalizer = new FeatureNormalizer();
    const rawFeatures: RawFeature[] = [
      makeRawFeature({ rawType: 'string-literal', rawValue: 'hello' }),
      makeRawFeature({
        rawType: 'url',
        rawValue: 'http://example.com',
        location: makeLocation({ offset: 10, length: 20 }),
      }),
      makeRawFeature({
        rawType: 'numeric-literal',
        rawValue: 42,
        location: makeLocation({ offset: 30, length: 2 }),
      }),
    ];

    const result = normalizer.normalizeBatch(rawFeatures, 'art_001', 'ss_001', makeProvenance());
    expect(result.normalized).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
    expect(result.deduplicated).toBe(0);
  });

  it('should handle non-string raw values', () => {
    const normalizer = new FeatureNormalizer();

    const numeric = normalizer.normalize(
      makeRawFeature({ rawType: 'numeric-literal', rawValue: 42 }),
      'art_001',
      'ss_001',
      makeProvenance(),
    );
    expect(numeric.ok).toBe(true);
    if (numeric.ok) {
      expect(numeric.value.value).toEqual({ kind: 'number', value: 42 });
    }

    const boolean = normalizer.normalize(
      makeRawFeature({ rawType: 'boolean-literal', rawValue: true }),
      'art_001',
      'ss_001',
      makeProvenance(),
    );
    expect(boolean.ok).toBe(true);
    if (boolean.ok) {
      expect(boolean.value.value).toEqual({ kind: 'boolean', value: true });
    }

    const nullVal = normalizer.normalize(
      makeRawFeature({ rawType: 'string-literal', rawValue: null }),
      'art_001',
      'ss_001',
      makeProvenance(),
    );
    expect(nullVal.ok).toBe(true);
    if (nullVal.ok) {
      expect(nullVal.value.value).toEqual({ kind: 'string', value: '' });
    }
  });

  it('should clamp confidence to [0.0, 1.0]', () => {
    const normalizer = new FeatureNormalizer();

    const over = normalizer.normalize(
      makeRawFeature({ rawType: 'string-literal', rawValue: 'test', confidence: 2.0 }),
      'art_001',
      'ss_001',
      makeProvenance(),
    );
    expect(over.ok).toBe(true);
    if (over.ok) {
      expect(over.value.confidence).toBe(1.0);
    }

    // Use different location to avoid dedup collision
    normalizer.resetCache();

    const under = normalizer.normalize(
      makeRawFeature({
        rawType: 'string-literal',
        rawValue: 'test',
        confidence: -1.0,
        location: makeLocation({ offset: 100, length: 2 }),
      }),
      'art_001',
      'ss_001',
      makeProvenance(),
    );
    expect(under.ok).toBe(true);
    if (under.ok) {
      expect(under.value.confidence).toBe(0.0);
    }
  });

  it('should handle array raw values', () => {
    const normalizer = new FeatureNormalizer();
    const raw = makeRawFeature({
      rawType: 'metadata-field',
      rawValue: ['a', 'b', 'c'],
    });
    const result = normalizer.normalize(raw, 'art_001', 'ss_001', makeProvenance());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value.kind).toBe('array');
      if (result.value.value.kind === 'array') {
        expect(result.value.value.values).toHaveLength(3);
      }
    }
  });
});

describe('FeatureRegistry', () => {
  it('should register and retrieve handlers', () => {
    const registry = new FeatureRegistry();
    const handler = (f: any) => f;

    registry.register('string-literal', handler);
    expect(registry.hasHandlers('string-literal')).toBe(true);
    expect(registry.getHandlers('string-literal')).toHaveLength(1);
  });

  it('should process features through handlers', () => {
    const registry = new FeatureRegistry();
    registry.register('string-literal', (f) => {
      // Enrich with additional metadata
      return { ...f, metadata: { ...f.metadata, enriched: true } };
    });

    const feature = new FeatureBuilder()
      .withArtifactId('art_001')
      .withSessionId('ss_001')
      .withType('string-literal')
      .withValue({ kind: 'string', value: 'test' })
      .withLocation(makeLocation())
      .withConfidence(0.95)
      .withProvenance(makeProvenance())
      .build();

    const processed = registry.processFeature(feature);
    expect(processed).not.toBeNull();
    expect(processed!.metadata).toBeDefined();
    expect(processed!.metadata!['enriched']).toBe(true);
  });

  it('should filter features by returning null from handler', () => {
    const registry = new FeatureRegistry();
    registry.register('string-literal', () => null);

    const feature = new FeatureBuilder()
      .withArtifactId('art_001')
      .withSessionId('ss_001')
      .withType('string-literal')
      .withValue({ kind: 'string', value: 'test' })
      .withLocation(makeLocation())
      .withConfidence(0.95)
      .withProvenance(makeProvenance())
      .build();

    const processed = registry.processFeature(feature);
    expect(processed).toBeNull();
  });

  it('should sort handlers by priority', () => {
    const registry = new FeatureRegistry();
    const order: number[] = [];

    registry.register(
      'string-literal',
      (f) => {
        order.push(2);
        return f;
      },
      { priority: 200 },
    );
    registry.register(
      'string-literal',
      (f) => {
        order.push(1);
        return f;
      },
      { priority: 100 },
    );

    const feature = new FeatureBuilder()
      .withArtifactId('art_001')
      .withSessionId('ss_001')
      .withType('string-literal')
      .withValue({ kind: 'string', value: 'test' })
      .withLocation(makeLocation())
      .withConfidence(0.95)
      .withProvenance(makeProvenance())
      .build();

    registry.processFeature(feature);
    expect(order).toEqual([1, 2]);
  });

  it('should clear all handlers', () => {
    const registry = new FeatureRegistry();
    registry.register('string-literal', (f) => f);
    registry.clear();
    expect(registry.size).toBe(0);
  });
});

describe('CapabilityBuilder', () => {
  it('should build a valid capability', () => {
    const cap = new CapabilityBuilder()
      .withArtifactId('art_001')
      .withName('read-file')
      .withCategory('file-system-read')
      .withSource(makeLocation())
      .withConfidence(0.95)
      .build();

    expect(cap.id).toMatch(/^cap_[a-f0-9]+$/);
    expect(cap.artifactId).toBe('art_001');
    expect(cap.name).toBe('read-file');
    expect(cap.category).toBe('file-system-read');
    expect(Object.isFrozen(cap)).toBe(true);
  });

  it('should throw on missing required fields', () => {
    expect(() => new CapabilityBuilder().build()).toThrow('missing required fields');
  });

  it('should generate deterministic IDs', () => {
    const c1 = new CapabilityBuilder()
      .withArtifactId('art_001')
      .withName('read-file')
      .withCategory('file-system-read')
      .withSource(makeLocation())
      .withConfidence(0.95)
      .build();

    const c2 = new CapabilityBuilder()
      .withArtifactId('art_001')
      .withName('read-file')
      .withCategory('file-system-read')
      .withSource(makeLocation())
      .withConfidence(0.95)
      .build();

    expect(c1.id).toBe(c2.id);
  });
});

describe('KnowledgeEngine', () => {
  it('should process a single artifact', async () => {
    const engine = new KnowledgeEngine();
    const artifact = makeArtifact();
    const rawFeatures: RawFeature[] = [
      makeRawFeature({ rawType: 'string-literal', rawValue: 'hello' }),
      makeRawFeature({
        rawType: 'url',
        rawValue: 'http://example.com',
        location: makeLocation({ offset: 10, length: 20 }),
      }),
    ];

    const result = await engine.processArtifact(artifact, 'ss_001', rawFeatures);

    expect(result.artifactId).toBe(artifact.id);
    expect(result.featureSet.features).toHaveLength(2);
    expect(result.diagnostics.featuresExtracted).toBe(2);
    expect(result.diagnostics.artifactsProcessed).toBe(1);
    expect(Object.isFrozen(result.featureSet)).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
  });

  it('should handle empty raw features', async () => {
    const engine = new KnowledgeEngine();
    const artifact = makeArtifact();

    const result = await engine.processArtifact(artifact, 'ss_001', []);

    expect(result.featureSet.features).toHaveLength(0);
    expect(result.diagnostics.featuresExtracted).toBe(0);
    expect(result.diagnostics.errors).toHaveLength(0);
  });

  it('should deduplicate identical features', async () => {
    const engine = new KnowledgeEngine();
    const artifact = makeArtifact();
    const rawFeatures: RawFeature[] = [
      makeRawFeature({ rawType: 'string-literal', rawValue: 'hello' }),
      makeRawFeature({ rawType: 'string-literal', rawValue: 'hello' }), // Duplicate
    ];

    const result = await engine.processArtifact(artifact, 'ss_001', rawFeatures);

    // Dedup removes the duplicate
    expect(result.diagnostics.featuresDeduplicated).toBe(1);
    expect(result.featureSet.features).toHaveLength(1);
  });

  it('should process batch of artifacts', async () => {
    const engine = new KnowledgeEngine();
    const items = [
      {
        artifact: makeArtifact({ id: 'art_001' }),
        sessionId: 'ss_001',
        rawFeatures: [makeRawFeature({ rawType: 'string-literal', rawValue: 'a' })],
      },
      {
        artifact: makeArtifact({ id: 'art_002' }),
        sessionId: 'ss_001',
        rawFeatures: [
          makeRawFeature({
            rawType: 'url',
            rawValue: 'http://test.com',
            location: makeLocation({ offset: 10, length: 20 }),
          }),
        ],
      },
    ];

    const result = await engine.processBatch(items);
    expect(result.results).toHaveLength(2);
    expect(result.diagnostics.artifactsProcessed).toBe(2);
    expect(result.diagnostics.featuresExtracted).toBe(2);
  });

  it('should respect maxFeaturesPerArtifact limit', async () => {
    const engine = new KnowledgeEngine({ maxFeaturesPerArtifact: 2 });
    const artifact = makeArtifact();
    const rawFeatures: RawFeature[] = [
      makeRawFeature({ rawType: 'string-literal', rawValue: 'a' }),
      makeRawFeature({
        rawType: 'string-literal',
        rawValue: 'b',
        location: makeLocation({ offset: 10, length: 2 }),
      }),
      makeRawFeature({
        rawType: 'string-literal',
        rawValue: 'c',
        location: makeLocation({ offset: 20, length: 2 }),
      }),
      makeRawFeature({
        rawType: 'string-literal',
        rawValue: 'd',
        location: makeLocation({ offset: 30, length: 2 }),
      }),
    ];

    const result = await engine.processArtifact(artifact, 'ss_001', rawFeatures);
    expect(result.featureSet.features).toHaveLength(2);
    expect(result.diagnostics.warnings.some((w) => w.includes('truncated'))).toBe(true);
  });

  it('should produce deterministic outputs for same inputs', async () => {
    const engine = new KnowledgeEngine();
    const artifact = makeArtifact();
    const rawFeatures: RawFeature[] = [
      makeRawFeature({ rawType: 'string-literal', rawValue: 'hello' }),
      makeRawFeature({
        rawType: 'url',
        rawValue: 'http://example.com',
        location: makeLocation({ offset: 10, length: 20 }),
      }),
    ];

    const r1 = await engine.processArtifact(artifact, 'ss_001', rawFeatures);
    const r2 = await engine.processArtifact(artifact, 'ss_001', rawFeatures);

    expect(r1.featureSet.features[0].id).toBe(r2.featureSet.features[0].id);
    expect(r1.featureSet.features[1].id).toBe(r2.featureSet.features[1].id);
    expect(r1.diagnostics.featuresExtracted).toBe(r2.diagnostics.featuresExtracted);
  });

  it('should support custom normalization rules', async () => {
    const engine = new KnowledgeEngine({
      normalizationRules: [{ rawTypePattern: 'custom-type', targetType: 'annotation' }],
    });
    const artifact = makeArtifact();
    const rawFeatures: RawFeature[] = [
      makeRawFeature({ rawType: 'custom-type', rawValue: 'custom data' }),
    ];

    const result = await engine.processArtifact(artifact, 'ss_001', rawFeatures);
    expect(result.featureSet.features).toHaveLength(1);
    expect(result.featureSet.features[0].type).toBe('annotation');
  });
});

describe('Provenance and Timestamps', () => {
  it('should create provenance with required fields', () => {
    const provenance = createProvenance({ extractorId: 'test-extractor' });
    expect(provenance.extractorId).toBe('test-extractor');
    expect(provenance.extractorVersion).toBe('0.1.0');
    expect(provenance.extractedAt).toBeTruthy();
    expect(provenance.normalizedAt).toBeTruthy();
    expect(provenance.normalizedBy).toBe('knowledge-engine');
    expect(Object.isFrozen(provenance)).toBe(true);
  });

  it('should preserve custom provenance fields', () => {
    const provenance = createProvenance({
      extractorId: 'test-extractor',
      extractorVersion: '2.0.0',
      normalizedBy: 'custom-normalizer',
    });
    expect(provenance.extractorVersion).toBe('2.0.0');
    expect(provenance.normalizedBy).toBe('custom-normalizer');
  });
});

describe('createCapability', () => {
  it('should create a frozen capability', () => {
    const cap = createCapability({
      id: 'cap_test_001',
      artifactId: 'art_001',
      name: 'network-connect',
      category: 'network-connect',
      source: makeLocation(),
      confidence: 0.9,
    });
    expect(Object.isFrozen(cap)).toBe(true);
    expect(cap.id).toBe('cap_test_001');
  });

  it('should freeze properties when provided', () => {
    const cap = createCapability({
      id: 'cap_test_001',
      artifactId: 'art_001',
      name: 'read-env',
      category: 'environment-read',
      source: makeLocation(),
      confidence: 0.8,
      properties: { varName: 'PATH' },
    });
    expect(Object.isFrozen(cap.properties!)).toBe(true);
  });
});

describe('isKnownFeatureType / getKnownFeatureTypes', () => {
  it('should recognize known types', () => {
    expect(isKnownFeatureType('string-literal')).toBe(true);
    expect(isKnownFeatureType('url')).toBe(true);
    expect(isKnownFeatureType('function-call')).toBe(true);
  });

  it('should reject unknown types', () => {
    expect(isKnownFeatureType('nonexistent')).toBe(false);
    expect(isKnownFeatureType('')).toBe(false);
  });

  it('should return sorted list of known types', () => {
    const types = getKnownFeatureTypes();
    expect(types.length).toBeGreaterThan(20);
    expect(types[0]).toBe('annotation');
    expect(types[types.length - 1]).toBe('url');
  });
});

describe('createKnowledgeDiagnostics', () => {
  it('should create empty diagnostics', () => {
    const diag = createKnowledgeDiagnostics();
    expect(diag.artifactsProcessed).toBe(0);
    expect(diag.featuresExtracted).toBe(0);
    expect(diag.errors).toEqual([]);
    expect(diag.warnings).toEqual([]);
    expect(Object.isFrozen(diag)).toBe(true);
    expect(Object.isFrozen(diag.errors)).toBe(true);
    expect(Object.isFrozen(diag.warnings)).toBe(true);
  });

  it('should create diagnostics with values', () => {
    const diag = createKnowledgeDiagnostics({
      artifactsProcessed: 5,
      featuresExtracted: 100,
      errors: [{ code: 'TEST_ERR', message: 'test error' }],
      warnings: ['warning 1'],
      durationMs: 150,
    });
    expect(diag.artifactsProcessed).toBe(5);
    expect(diag.featuresExtracted).toBe(100);
    expect(diag.errors).toHaveLength(1);
    expect(diag.warnings).toHaveLength(1);
    expect(diag.durationMs).toBe(150);
  });
});

describe('Edge Cases', () => {
  it('should handle missing metadata gracefully', () => {
    const feature = new FeatureBuilder()
      .withArtifactId('art_001')
      .withSessionId('ss_001')
      .withType('identifier')
      .withValue({ kind: 'string', value: 'x' })
      .withLocation(makeLocation())
      .withConfidence(0.5)
      .withProvenance(makeProvenance())
      .build();

    expect(feature.metadata).toBeUndefined();
  });

  it('should handle zero confidence', () => {
    const feature = new FeatureBuilder()
      .withArtifactId('art_001')
      .withSessionId('ss_001')
      .withType('string-literal')
      .withValue({ kind: 'string', value: 'test' })
      .withLocation(makeLocation())
      .withConfidence(0)
      .withProvenance(makeProvenance())
      .build();

    expect(feature.confidence).toBe(0);
    const valid = validateFeature(feature);
    expect(valid.ok).toBe(true);
  });

  it('should handle nested FeatureValue arrays', () => {
    const value = {
      kind: 'array' as const,
      values: [
        { kind: 'string' as const, value: 'a' },
        {
          kind: 'array' as const,
          values: [
            { kind: 'number' as const, value: 1 },
            { kind: 'number' as const, value: 2 },
          ],
        },
      ],
    };

    const feature = new FeatureBuilder()
      .withArtifactId('art_001')
      .withSessionId('ss_001')
      .withType('metadata-field')
      .withValue(value)
      .withLocation(makeLocation())
      .withConfidence(0.8)
      .withProvenance(makeProvenance())
      .build();

    expect(feature.id).toMatch(/^feat_/);
    const valid = validateFeature(feature);
    expect(valid.ok).toBe(true);
  });

  it('should handle empty string values', () => {
    const feature = new FeatureBuilder()
      .withArtifactId('art_001')
      .withSessionId('ss_001')
      .withType('string-literal')
      .withValue({ kind: 'string', value: '' })
      .withLocation(makeLocation())
      .withConfidence(0.5)
      .withProvenance(makeProvenance())
      .build();

    expect(feature.value).toEqual({ kind: 'string', value: '' });
    const valid = validateFeature(feature);
    expect(valid.ok).toBe(true);
  });

  it('should handle NaN raw values gracefully', () => {
    const normalizer = new FeatureNormalizer();
    const result = normalizer.normalize(
      makeRawFeature({ rawType: 'numeric-literal', rawValue: NaN }),
      'art_001',
      'ss_001',
      makeProvenance(),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      // NaN gets converted to string since it's not a finite number
      expect(result.value.value.kind).toBe('string');
    }
  });
});

describe('Concurrent Extraction', () => {
  it('should handle multiple artifacts sequentially', async () => {
    const engine = new KnowledgeEngine();
    const results = [];

    for (let i = 0; i < 5; i++) {
      const artifact = makeArtifact({ id: `art_${i}` });
      const rawFeatures: RawFeature[] = [
        makeRawFeature({ rawType: 'string-literal', rawValue: `value_${i}` }),
      ];
      results.push(await engine.processArtifact(artifact, 'ss_001', rawFeatures));
    }

    expect(results).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(results[i].featureSet.features[0].value).toEqual({
        kind: 'string',
        value: `value_${i}`,
      });
    }
  });

  it('should reset dedup cache between artifacts', async () => {
    const engine = new KnowledgeEngine();
    const artifact1 = makeArtifact({ id: 'art_001' });
    const artifact2 = makeArtifact({ id: 'art_002' });
    const rawFeatures: RawFeature[] = [
      makeRawFeature({ rawType: 'string-literal', rawValue: 'same_value' }),
    ];

    const r1 = await engine.processArtifact(artifact1, 'ss_001', rawFeatures);
    const r2 = await engine.processArtifact(artifact2, 'ss_001', rawFeatures);

    expect(r1.diagnostics.featuresExtracted).toBe(1);
    expect(r2.diagnostics.featuresExtracted).toBe(1);
    expect(r1.featureSet.features[0].id).not.toBe(r2.featureSet.features[0].id);
  });
});
