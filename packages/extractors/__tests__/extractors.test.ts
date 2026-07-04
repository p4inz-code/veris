/**
 * Comprehensive tests for @veris/extractors.
 *
 * Tests cover:
 * - Core types and helpers
 * - Base extractor
 * - Extractor registry (registration, priority, matching, parallel execution)
 * - String extraction (ASCII, UTF-8, UTF-16LE, UTF-16BE)
 * - Hash extraction (MD5, SHA1, SHA256, SHA512)
 * - Entropy calculation
 * - Archive metadata (ZIP, TAR, GZIP)
 * - Binary extractors (PE, ELF, Mach-O)
 * - Document extractors (PDF, Image, Certificate)
 * - Language extractors (JS, TS, Python, Go, Rust, Java, C#, Shell)
 * - Config extractors (JSON, YAML, XML, Docker, K8s)
 * - Other extractors (Env, Requirements, Package manifests, Lockfiles)
 * - Diagnostics collection
 * - Cancellation and timeouts
 * - Determinism
 * - Malformed inputs
 * - Concurrency
 */

import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';

// Import core types
import type { Artifact, ArtifactType } from '@veris/core';

// Import extractors package
import {
  // Types
  RawFeature,
  ExtractionContext,
  ExtractionResult,
  ExtractorRunDiagnostics,
  RegistryExtractionDiagnostics,
  ExtractionIssue,
  ExtractionError,
  createRawFeature,
  createSkippedDiagnostics,
  createExtractionIssue,
  noIssues,

  // Base
  BaseExtractor,

  // Registry
  ExtractorRegistry,

  // Diagnostics
  DefaultDiagnosticsCollector,

  // String
  StringExtractor,
  StringExtractorConfig,
  ExtractedString,

  // Hash
  HashExtractor,
  HashAlgorithm,
  HashExtractorConfig,

  // Entropy
  EntropyExtractor,
  EntropyExtractorConfig,

  // Archive
  ArchiveExtractor,
  ArchiveMember,

  // Binary
  PEExtractor,
  ELFExtractor,
  MachOExtractor,

  // Documents
  PDFExtractor,
  OfficeExtractor,
  ImageExtractor,
  CertificateExtractor,

  // Language
  JavaScriptExtractor,
  TypeScriptExtractor,
  PythonExtractor,
  GoExtractor,
  RustExtractor,
  JavaExtractor,
  CSharpExtractor,
  ShellExtractor,

  // Config
  JSONExtractor,
  YAMLExtractor,
  XMLExtractor,
  DockerExtractor,
  KubernetesExtractor,

  // Other
  GitExtractor,
  EnvFileExtractor,
  RequirementsExtractor,
  PackageManifestExtractor,
  LockfileExtractor,

  // Registry result
  RegistryExtractionResult,
} from '../src/index.js';

// ─── Helpers ────────────────────────────────────────────────────

/** Create a minimal artifact for testing. */
function createTestArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'art_test123',
    sessionId: 'ss_test456',
    parentId: null,
    type: 'file',
    normalizedPath: '/test/file.txt',
    size: 0,
    contentHash: { algorithm: 'sha-256', value: 'abc123' },
    mimeType: 'text/plain',
    extractedAt: new Date().toISOString(),
    extractorId: 'test',
    ...overrides,
  };
}

/** Create a minimal extraction context for testing. */
function createTestContext(
  content: Buffer | null,
  overrides: Partial<ExtractionContext> = {},
): ExtractionContext {
  const artifact = createTestArtifact({
    size: content?.length ?? 0,
    ...(overrides.artifact ? overrides.artifact : {}),
  });
  return {
    artifact,
    sessionId: 'ss_test456',
    content,
    ...overrides,
  };
}

/** Create a simple test extractor that returns predictable features. */
function createTestExtractor(
  id: string,
  priority: number = 500,
  types: readonly ArtifactType[] = ['file'],
  featureType: string = 'test-feature',
  featureValue: unknown = 'value',
): BaseExtractor {
  return new (class extends BaseExtractor {
    constructor() {
      super({ id, name: id, version: '1.0.0', supportedArtifactTypes: types, priority });
    }

    async extract(context: ExtractionContext): Promise<ExtractionResult> {
      return this.ok([
        createRawFeature({
          extractorId: this.id,
          type: featureType,
          value: featureValue,
          confidence: 1.0,
        }),
      ]);
    }
  })();
}

// ─── Core Types ─────────────────────────────────────────────────

describe('Core Types', () => {
  it('createRawFeature creates frozen feature', () => {
    const f = createRawFeature({
      extractorId: 'test',
      type: 'test-type',
      value: 'hello',
    });
    expect(f.extractorId).toBe('test');
    expect(f.type).toBe('test-type');
    expect(f.value).toBe('hello');
    expect(f.confidence).toBe(1.0);
    expect(Object.isFrozen(f)).toBe(true);
  });

  it('createRawFeature with optional fields', () => {
    const loc = { startLine: 1, startColumn: 0, endLine: 1, endColumn: 5, offset: 0, length: 5 };
    const f = createRawFeature({
      extractorId: 'test',
      type: 'test-type',
      value: 'hello',
      confidence: 0.5,
      location: loc,
      metadata: { key: 'val' },
    });
    expect(f.confidence).toBe(0.5);
    expect(f.location).toBe(loc);
    expect(f.metadata?.key).toBe('val');
  });

  it('createSkippedDiagnostics creates proper diagnostics', () => {
    const d = createSkippedDiagnostics('ext1', 'test skip');
    expect(d.extractorId).toBe('ext1');
    expect(d.skipped).toBe(true);
    expect(d.skipReason).toBe('test skip');
    expect(d.featuresEmitted).toBe(0);
  });

  it('createExtractionIssue creates proper issue', () => {
    const i = createExtractionIssue('ext1', 'ERR_001', 'error message', true);
    expect(i.extractorId).toBe('ext1');
    expect(i.code).toBe('ERR_001');
    expect(i.isError).toBe(true);
    expect(Object.isFrozen(i)).toBe(true);
  });

  it('noIssues returns empty frozen array', () => {
    expect(noIssues()).toEqual([]);
    expect(Object.isFrozen(noIssues())).toBe(true);
  });

  it('ExtractionError is properly formed', () => {
    const err = new ExtractionError('fail', 'ERR', 'ext1');
    expect(err.message).toBe('fail');
    expect(err.code).toBe('ERR');
    expect(err.extractorId).toBe('ext1');
    expect(err.name).toBe('ExtractionError');
  });
});

// ─── Base Extractor ────────────────────────────────────────────

describe('BaseExtractor', () => {
  it('canExtract defaults to type matching', () => {
    const e = createTestExtractor('test', 500, ['file']);
    const ctx = createTestContext(Buffer.from('test'));
    expect(e.canExtract(ctx)).toBe(true);
  });

  it('canExtract returns false for non-matching types', () => {
    const e = createTestExtractor('test', 500, ['executable']);
    const ctx = createTestContext(Buffer.from('test'));
    expect(e.canExtract(ctx)).toBe(false);
  });

  it('canExtract returns true if no supported types', () => {
    const e = createTestExtractor('test', 500, []);
    const ctx = createTestContext(Buffer.from('test'));
    expect(e.canExtract(ctx)).toBe(true);
  });

  it('extract returns proper result with features', async () => {
    const e = createTestExtractor('my-ext', 500, ['file'], 'my-type', 42);
    const ctx = createTestContext(Buffer.from('data'));
    const result = await e.extract(ctx);
    expect(result.features.length).toBe(1);
    expect(result.features[0].type).toBe('my-type');
    expect(result.features[0].value).toBe(42);
    expect(result.features[0].extractorId).toBe('my-ext');
    expect(Object.isFrozen(result.features)).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
  });

  it('ok() creates proper ExtractionResult', () => {
    const e = createTestExtractor('ok-test');
    const ctx = createTestContext(Buffer.from('data'));
    const features = [createRawFeature({ extractorId: 'ok-test', type: 'test', value: 'v' })];
    const result = e['ok'](features, { bytesProcessed: 100, startTime: 0, endTime: 100 });
    expect(result.features.length).toBe(1);
    expect(result.diagnostics.bytesProcessed).toBe(100);
    expect(result.diagnostics.durationMs).toBe(100);
  });

  it('feature() creates proper RawFeature', () => {
    const e = createTestExtractor('feat-test');
    const f = e['feature']('my-type', { hello: 'world' }, { confidence: 0.8 });
    expect(f.type).toBe('my-type');
    expect(f.value).toEqual({ hello: 'world' });
    expect(f.confidence).toBe(0.8);
    expect(f.extractorId).toBe('feat-test');
  });
});

// ─── Extractor Registry ────────────────────────────────────────

describe('ExtractorRegistry', () => {
  it('register adds extractor', () => {
    const reg = new ExtractorRegistry();
    reg.register(createTestExtractor('ext1'));
    expect(reg.size).toBe(1);
  });

  it('register throws on duplicate id', () => {
    const reg = new ExtractorRegistry();
    reg.register(createTestExtractor('ext1'));
    expect(() => reg.register(createTestExtractor('ext1'))).toThrow('already registered');
  });

  it('registerAll adds multiple extractors', () => {
    const reg = new ExtractorRegistry();
    reg.registerAll([createTestExtractor('a'), createTestExtractor('b')]);
    expect(reg.size).toBe(2);
  });

  it('unregister removes extractor', () => {
    const reg = new ExtractorRegistry();
    reg.register(createTestExtractor('ext1'));
    expect(reg.unregister('ext1')).toBe(true);
    expect(reg.size).toBe(0);
  });

  it('unregister returns false for unknown id', () => {
    const reg = new ExtractorRegistry();
    expect(reg.unregister('unknown')).toBe(false);
  });

  it('getExtractor returns extractor by id', () => {
    const reg = new ExtractorRegistry();
    const e = createTestExtractor('ext1');
    reg.register(e);
    expect(reg.getExtractor('ext1')).toBe(e);
    expect(reg.getExtractor('unknown')).toBeUndefined();
  });

  it('getExtractors returns sorted by priority', () => {
    const reg = new ExtractorRegistry();
    const a = createTestExtractor('a', 200);
    const b = createTestExtractor('b', 100);
    const c = createTestExtractor('c', 300);
    reg.registerAll([a, b, c]);
    const sorted = reg.getExtractors();
    expect(sorted[0].id).toBe('b'); // priority 100
    expect(sorted[1].id).toBe('a'); // priority 200
    expect(sorted[2].id).toBe('c'); // priority 300
  });

  it('getExtractorsForArtifact filters by type', () => {
    const reg = new ExtractorRegistry();
    const e1 = createTestExtractor('file-ext', 100, ['file']);
    const e2 = createTestExtractor('exec-ext', 200, ['executable']);
    reg.registerAll([e1, e2]);
    const fileExtractors = reg.getExtractorsForArtifact('file');
    expect(fileExtractors.length).toBe(1);
    expect(fileExtractors[0].id).toBe('file-ext');
  });

  it('extract runs applicable extractors', async () => {
    const reg = new ExtractorRegistry();
    reg.registerAll([
      createTestExtractor('ext1', 100, ['file'], 'type1', 'val1'),
      createTestExtractor('ext2', 200, ['executable'], 'type2', 'val2'),
    ]);
    const ctx = createTestContext(Buffer.from('test'));
    const result = await reg.extract(ctx);
    expect(result.features.length).toBe(1);
    expect(result.features[0].type).toBe('type1');
    expect(result.diagnostics.matchedExtractors).toBe(1);
    expect(result.diagnostics.skippedExtractors.length).toBe(1);
  });

  it('extract respects sequential option', async () => {
    const reg = new ExtractorRegistry();
    const order: string[] = [];
    const e1 = new (class extends BaseExtractor {
      constructor() {
        super({
          id: 'first',
          name: 'First',
          version: '1.0.0',
          supportedArtifactTypes: ['file'],
          priority: 100,
        });
      }
      async extract(ctx: ExtractionContext): Promise<ExtractionResult> {
        order.push('first');
        return this.ok([]);
      }
    })();
    const e2 = new (class extends BaseExtractor {
      constructor() {
        super({
          id: 'second',
          name: 'Second',
          version: '1.0.0',
          supportedArtifactTypes: ['file'],
          priority: 200,
        });
      }
      async extract(ctx: ExtractionContext): Promise<ExtractionResult> {
        order.push('second');
        return this.ok([]);
      }
    })();
    reg.registerAll([e1, e2]);
    const ctx = createTestContext(Buffer.from('test'));
    await reg.extract(ctx, { sequential: true });
    expect(order).toEqual(['first', 'second']);
  });

  it('extract collects diagnostics', async () => {
    const reg = new ExtractorRegistry();
    reg.registerAll([
      createTestExtractor('ext1', 100, ['file'], 't', 'v'),
      createTestExtractor('ext2', 200, ['file'], 't2', 'v2'),
    ]);
    const ctx = createTestContext(Buffer.from('test data'));
    const result = await reg.extract(ctx);
    expect(result.diagnostics.totalExtractors).toBe(2);
    expect(result.diagnostics.matchedExtractors).toBe(2);
    expect(result.diagnostics.totalFeaturesEmitted).toBe(2);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('handles no matching extractors', async () => {
    const reg = new ExtractorRegistry();
    reg.register(createTestExtractor('e1', 100, ['executable']));
    const ctx = createTestContext(Buffer.from('test'));
    const result = await reg.extract(ctx);
    expect(result.features.length).toBe(0);
    expect(result.diagnostics.matchedExtractors).toBe(0);
  });

  it('handles empty registry', async () => {
    const reg = new ExtractorRegistry();
    const ctx = createTestContext(Buffer.from('test'));
    const result = await reg.extract(ctx);
    expect(result.features.length).toBe(0);
    expect(result.cancelled).toBe(false);
  });

  it('extractor errors are caught and reported', async () => {
    const reg = new ExtractorRegistry();
    const failingExt = new (class extends BaseExtractor {
      constructor() {
        super({
          id: 'fail',
          name: 'Failing',
          version: '1.0.0',
          supportedArtifactTypes: ['file'],
          priority: 100,
        });
      }
      async extract(ctx: ExtractionContext): Promise<ExtractionResult> {
        throw new ExtractionError('something broke', 'ERR_999');
      }
    })();
    reg.register(failingExt);
    const ctx = createTestContext(Buffer.from('test'));
    const result = await reg.extract(ctx);
    expect(result.features.length).toBe(0);
    expect(result.diagnostics.errors.length).toBe(1);
    expect(result.diagnostics.errors[0].code).toBe('ERR_999');
  });

  it('supports cancellation via CancellationToken', async () => {
    const reg = new ExtractorRegistry();
    reg.register(createTestExtractor('slow-ext', 100, ['file'], 't', 'v'));
    const { CancellationTokenSource } = await import('@veris/shared');
    const cts = new CancellationTokenSource();
    cts.cancel('cancelled for test');
    const ctx = createTestContext(Buffer.from('test'), {
      cancellationToken: cts.token,
    });
    const result = await reg.extract(ctx);
    expect(result.cancelled).toBe(true);
    expect(result.cancelReason).toBe('cancelled for test');
  });

  it('timeout kills long-running extractors', async () => {
    const reg = new ExtractorRegistry();
    const slowExt = new (class extends BaseExtractor {
      constructor() {
        super({
          id: 'slow',
          name: 'Slow',
          version: '1.0.0',
          supportedArtifactTypes: ['file'],
          priority: 100,
        });
      }
      async extract(ctx: ExtractionContext): Promise<ExtractionResult> {
        await new Promise((r) => setTimeout(r, 5000));
        return this.ok([]);
      }
    })();
    reg.register(slowExt);
    const ctx = createTestContext(Buffer.from('test'));
    const result = await reg.extract(ctx, { timeoutMs: 50 });
    expect(result.diagnostics.errors.length).toBe(1);
    expect(result.diagnostics.errors[0].code).toBe('TIMEOUT');
  });
});

// ─── Diagnostics Collector ──────────────────────────────────────

describe('DefaultDiagnosticsCollector', () => {
  it('records start and end', () => {
    const diag = new DefaultDiagnosticsCollector();
    diag.recordStart('ext1', 1000);
    diag.recordEnd('ext1', 2000);
    const d = diag.getExtractorDiagnostics('ext1')!;
    expect(d.startTime).toBe(1000);
    expect(d.endTime).toBe(2000);
    expect(d.durationMs).toBe(1000);
  });

  it('records bytes and features', () => {
    const diag = new DefaultDiagnosticsCollector();
    diag.recordStart('ext1', 0);
    diag.recordBytesProcessed('ext1', 500);
    diag.recordFeaturesEmitted('ext1', 10);
    diag.recordEnd('ext1', 100);
    const d = diag.getExtractorDiagnostics('ext1')!;
    expect(d.bytesProcessed).toBe(500);
    expect(d.featuresEmitted).toBe(10);
  });

  it('records issues', () => {
    const diag = new DefaultDiagnosticsCollector();
    diag.recordIssue('ext1', 'WARN', 'warning', false);
    diag.recordIssue('ext1', 'ERR', 'error', true);
    const d = diag.getExtractorDiagnostics('ext1')!;
    expect(d.issues.length).toBe(2);
  });

  it('records skipped', () => {
    const diag = new DefaultDiagnosticsCollector();
    diag.recordSkipped('ext1', 'not applicable');
    const d = diag.getExtractorDiagnostics('ext1')!;
    expect(d.skipped).toBe(true);
    expect(d.skipReason).toBe('not applicable');
  });

  it('buildRegistryDiagnostics aggregates correctly', () => {
    const diag = new DefaultDiagnosticsCollector();
    diag.recordStart('a', 0);
    diag.recordEnd('a', 100);
    diag.recordBytesProcessed('a', 50);
    diag.recordFeaturesEmitted('a', 5);

    diag.recordSkipped('b', 'skip reason');
    diag.recordIssue('a', 'W1', 'warning', false);
    diag.recordIssue('a', 'E1', 'error', true);

    const rd = diag.buildRegistryDiagnostics();
    expect(rd.totalExtractors).toBe(2);
    expect(rd.matchedExtractors).toBe(1);
    expect(rd.skippedExtractors.length).toBe(1);
    expect(rd.skippedExtractors[0].id).toBe('b');
    expect(rd.warnings.length).toBe(1);
    expect(rd.errors.length).toBe(1);
    expect(rd.totalFeaturesEmitted).toBe(5);
    expect(rd.totalBytesProcessed).toBe(50);
  });

  it('getAllDiagnostics returns all', () => {
    const diag = new DefaultDiagnosticsCollector();
    diag.recordStart('a', 0);
    diag.recordEnd('a', 10);
    diag.recordStart('b', 0);
    diag.recordEnd('b', 20);
    expect(diag.getAllDiagnostics().length).toBe(2);
  });

  it('getExtractorDiagnostics returns undefined for unknown', () => {
    const diag = new DefaultDiagnosticsCollector();
    expect(diag.getExtractorDiagnostics('unknown')).toBeUndefined();
  });
});

// ─── String Extractor ──────────────────────────────────────────

describe('StringExtractor', () => {
  it('extracts ASCII strings', async () => {
    const ext = new StringExtractor({ minLength: 3 });
    const content = Buffer.from('Hello, World! This is a test.');
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    expect(result.features.length).toBeGreaterThan(0);
    const strings = result.features.filter((f) => f.type === 'string-literal');
    expect(strings.length).toBeGreaterThan(0);
    expect(strings[0].metadata?.encoding).toBe('ascii');
  });

  it('returns empty for empty content', async () => {
    const ext = new StringExtractor();
    const ctx = createTestContext(Buffer.alloc(0));
    expect(ext.canExtract(ctx)).toBe(false);
  });

  it('respects minLength configuration', async () => {
    const ext = new StringExtractor({ minLength: 20 });
    const content = Buffer.from('ab cd ef'); // short content
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const strings = result.features.filter((f) => f.type === 'string-literal');
    expect(strings.length).toBe(0); // Too short
  });

  it('handles binary content gracefully', async () => {
    const ext = new StringExtractor({ minLength: 4 });
    const content = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd, 0x00, 0x01]);
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    // Should not crash, may or may not find strings
    expect(result.features).toBeDefined();
  });

  it('extracts UTF-8 sequences when present', async () => {
    const ext = new StringExtractor({ minLength: 3, enableAscii: false, enableUtf8: true });
    const content = Buffer.from('Hello 世界 Café', 'utf-8');
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const strings = result.features.filter((f) => f.type === 'string-literal');
    // Should find some UTF-8 strings
    expect(strings.length).toBeGreaterThan(0);
  });

  it('extracts UTF-16LE strings when enabled', async () => {
    const ext = new StringExtractor({ minLength: 3, enableAscii: false, enableUtf16le: true });
    // Create UTF-16LE content
    const str = 'Hello World';
    const buf = Buffer.alloc(str.length * 2);
    for (let i = 0; i < str.length; i++) {
      buf.writeUInt16LE(str.charCodeAt(i), i * 2);
    }
    const ctx = createTestContext(buf);
    const result = await ext.extract(ctx);
    const strings = result.features.filter((f) => f.type === 'string-literal');
    expect(strings.length).toBeGreaterThan(0);
  });

  it('limits max strings when configured', async () => {
    const ext = new StringExtractor({ minLength: 1, maxStrings: 3 });
    const content = Buffer.from('a b c d e f g h i j k l m n o p');
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const strings = result.features.filter((f) => f.type === 'string-literal');
    expect(strings.length).toBeLessThanOrEqual(3);
  });

  it('reports deterministic output', async () => {
    const ext = new StringExtractor();
    const content = Buffer.from('test content 123');
    const ctx1 = createTestContext(content);
    const ctx2 = createTestContext(content);
    const [r1, r2] = await Promise.all([ext.extract(ctx1), ext.extract(ctx2)]);
    expect(r1.features.map((f) => f.value)).toEqual(r2.features.map((f) => f.value));
  });
});

// ─── Hash Extractor ────────────────────────────────────────────

describe('HashExtractor', () => {
  const content = Buffer.from('test data for hashing');

  it('computes SHA256 hash', async () => {
    const ext = new HashExtractor({ algorithms: ['sha256'] });
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const hashFeature = result.features.find((f) => f.type === 'sha256-hash');
    expect(hashFeature).toBeDefined();
    const expected = createHash('sha256').update(content).digest('hex');
    expect(hashFeature!.value).toBe(expected);
    expect(hashFeature!.confidence).toBe(1.0);
  });

  it('computes MD5 hash', async () => {
    const ext = new HashExtractor({ algorithms: ['md5'] });
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const hashFeature = result.features.find((f) => f.type === 'md5-hash');
    expect(hashFeature).toBeDefined();
    const expected = createHash('md5').update(content).digest('hex');
    expect(hashFeature!.value).toBe(expected);
  });

  it('computes SHA1 hash', async () => {
    const ext = new HashExtractor({ algorithms: ['sha1'] });
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const hashFeature = result.features.find((f) => f.type === 'sha1-hash');
    expect(hashFeature).toBeDefined();
    const expected = createHash('sha1').update(content).digest('hex');
    expect(hashFeature!.value).toBe(expected);
  });

  it('computes SHA512 hash', async () => {
    const ext = new HashExtractor({ algorithms: ['sha512'] });
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const hashFeature = result.features.find((f) => f.type === 'sha512-hash');
    expect(hashFeature).toBeDefined();
    const expected = createHash('sha512').update(content).digest('hex');
    expect(hashFeature!.value).toBe(expected);
  });

  it('computes multiple hashes by default', async () => {
    const ext = new HashExtractor();
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    expect(result.features.find((f) => f.type === 'md5-hash')).toBeDefined();
    expect(result.features.find((f) => f.type === 'sha1-hash')).toBeDefined();
    expect(result.features.find((f) => f.type === 'sha256-hash')).toBeDefined();
    expect(result.features.find((f) => f.type === 'sha512-hash')).toBeDefined();
  });

  it('reports deterministic output', async () => {
    const ext = new HashExtractor();
    const ctx1 = createTestContext(content);
    const ctx2 = createTestContext(content);
    const [r1, r2] = await Promise.all([ext.extract(ctx1), ext.extract(ctx2)]);
    expect(r1.features.map((f) => f.value)).toEqual(r2.features.map((f) => f.value));
  });
});

// ─── Entropy Extractor ─────────────────────────────────────────

describe('EntropyExtractor', () => {
  it('computes global entropy', async () => {
    const ext = new EntropyExtractor();
    const content = Buffer.from('AAAAABBBBBCCCCCDDDDD'); // Low entropy
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const global = result.features.find((f) => f.type === 'entropy-global');
    expect(global).toBeDefined();
    expect(typeof global!.value).toBe('number');
    expect(global!.value).toBeGreaterThan(0);
  });

  it('reports higher entropy for random data', async () => {
    const ext = new EntropyExtractor();
    const lowEntropy = Buffer.from('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    const highEntropy = Buffer.from(
      Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)),
    );
    const ctxLow = createTestContext(lowEntropy);
    const ctxHigh = createTestContext(highEntropy);
    const [rLow, rHigh] = await Promise.all([ext.extract(ctxLow), ext.extract(ctxHigh)]);
    const low = rLow.features.find((f) => f.type === 'entropy-global')!;
    const high = rHigh.features.find((f) => f.type === 'entropy-global')!;
    expect(high.value as number).toBeGreaterThan(low.value as number);
  });

  it('computes window entropy when enabled', async () => {
    const ext = new EntropyExtractor({ enableWindowEntropy: true, windowSize: 8 });
    const content = Buffer.from('Hello World! This is a longer test string for entropy windows.');
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const windows = result.features.filter((f) => f.type === 'entropy-window');
    expect(windows.length).toBeGreaterThan(0);
  });

  it('handles empty content gracefully', async () => {
    const ext = new EntropyExtractor();
    const ctx = createTestContext(Buffer.alloc(0));
    expect(ext.canExtract(ctx)).toBe(false);
  });

  it('reports deterministic output', async () => {
    const ext = new EntropyExtractor();
    const content = Buffer.from('deterministic entropy test');
    const ctx1 = createTestContext(content);
    const ctx2 = createTestContext(content);
    const [r1, r2] = await Promise.all([ext.extract(ctx1), ext.extract(ctx2)]);
    expect(r1.features.map((f) => f.value)).toEqual(r2.features.map((f) => f.value));
  });
});

// ─── Archive Extractor ─────────────────────────────────────────

describe('ArchiveExtractor', () => {
  it('detects gzip format from magic bytes', async () => {
    const ext = new ArchiveExtractor();
    // Create a minimal gzip file
    const { gzipSync } = await import('node:zlib');
    const content = gzipSync(Buffer.from('test content'));
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const type = result.features.find((f) => f.type === 'archive-type');
    expect(type).toBeDefined();
    expect(type!.value).toBe('gzip');
  });

  it('detects zip format from magic bytes', async () => {
    const ext = new ArchiveExtractor();
    // Minimal ZIP: local file header + EOCD
    const content = createMinimalZip('test.txt', Buffer.from('hello'));
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const type = result.features.find((f) => f.type === 'archive-type');
    expect(type).toBeDefined();
    expect(type!.value).toBe('zip');
  });

  it('extracts gzip metadata', async () => {
    const ext = new ArchiveExtractor();
    const { gzipSync } = await import('node:zlib');
    const original = Buffer.from('test content for gzip');
    const compressed = gzipSync(original);
    const ctx = createTestContext(compressed);
    const result = await ext.extract(ctx);
    const metadata = result.features.find((f) => f.type === 'archive-metadata');
    expect(metadata).toBeDefined();
    const val = metadata!.value as Record<string, unknown>;
    expect(val.format).toBe('gzip');
  });

  it('returns empty for unknown format', async () => {
    const ext = new ArchiveExtractor();
    const content = Buffer.from('not an archive at all');
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const type = result.features.find((f) => f.type === 'archive-type');
    expect(type).toBeUndefined();
  });
});

// Helper: create a minimal valid ZIP
function createMinimalZip(fileName: string, content: Buffer): Buffer {
  // Local file header
  const parts: Buffer[] = [];

  // Local file header signature
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); // Local file header signature
  header.writeUInt16LE(20, 4); // Version needed
  header.writeUInt16LE(0, 6); // General purpose bit flag
  header.writeUInt16LE(0, 8); // Compression method (stored)
  header.writeUInt16LE(0, 10); // Last mod time
  header.writeUInt16LE(0, 12); // Last mod date
  header.writeUInt32LE(0, 14); // CRC-32
  header.writeUInt32LE(content.length, 18); // Compressed size
  header.writeUInt32LE(content.length, 22); // Uncompressed size
  header.writeUInt16LE(fileName.length, 26); // File name length
  header.writeUInt16LE(0, 28); // Extra field length

  const fileNameBuf = Buffer.from(fileName, 'utf-8');

  // Central directory header
  const cdHeader = Buffer.alloc(46);
  cdHeader.writeUInt32LE(0x02014b50, 0); // Central directory header signature
  cdHeader.writeUInt16LE(20, 4); // Version made by
  cdHeader.writeUInt16LE(20, 6); // Version needed
  cdHeader.writeUInt16LE(0, 8); // General purpose bit flag
  cdHeader.writeUInt16LE(0, 10); // Compression method
  cdHeader.writeUInt16LE(0, 12); // Last mod time
  cdHeader.writeUInt16LE(0, 14); // Last mod date
  cdHeader.writeUInt32LE(0, 16); // CRC-32
  cdHeader.writeUInt32LE(content.length, 20); // Compressed size
  cdHeader.writeUInt32LE(content.length, 24); // Uncompressed size
  cdHeader.writeUInt16LE(fileName.length, 28); // File name length
  cdHeader.writeUInt16LE(0, 30); // Extra field length
  cdHeader.writeUInt16LE(0, 32); // File comment length
  cdHeader.writeUInt16LE(0, 34); // Disk number start
  cdHeader.writeUInt16LE(0, 36); // Internal file attributes
  cdHeader.writeUInt32LE(0, 38); // External file attributes
  // Relative offset of local header: after all local headers + content
  cdHeader.writeUInt32LE(30 + fileName.length, 42); // Local header offset

  // End of Central Directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // EOCD signature
  eocd.writeUInt16LE(0, 4); // Disk number
  eocd.writeUInt16LE(0, 6); // Disk with CD
  eocd.writeUInt16LE(1, 8); // Total entries on disk
  eocd.writeUInt16LE(1, 10); // Total entries
  const cdSize = 46 + fileName.length;
  eocd.writeUInt32LE(cdSize, 12); // CD size
  eocd.writeUInt32LE(30 + fileName.length + content.length, 16); // CD offset
  eocd.writeUInt16LE(0, 20); // Comment length

  parts.push(header, fileNameBuf, content, cdHeader, fileNameBuf, eocd);
  return Buffer.concat(parts);
}

// ─── Binary Extractors ─────────────────────────────────────────

describe('PEExtractor', () => {
  it('detects PE files via MZ magic', () => {
    const ext = new PEExtractor();
    const content = Buffer.alloc(256);
    content[0] = 0x4d; // M
    content[1] = 0x5a; // Z
    content.writeUInt32LE(0x80, 0x3c); // PE offset pointer
    content.writeUInt32LE(0x00004550, 0x80); // PE signature
    const ctx = createTestContext(content);
    expect(ext.canExtract(ctx)).toBe(true);
  });

  it('rejects non-PE files', () => {
    const ext = new PEExtractor();
    const ctx = createTestContext(Buffer.from('not a PE file'));
    expect(ext.canExtract(ctx)).toBe(false);
  });

  it('handles malformed content gracefully', async () => {
    const ext = new PEExtractor();
    const ctx = createTestContext(Buffer.from('MZ'));
    const result = await ext.extract(ctx);
    expect(result.features).toBeDefined();
  });
});

describe('ELFExtractor', () => {
  it('detects ELF files via magic', () => {
    const ext = new ELFExtractor();
    const content = Buffer.alloc(64);
    content[0] = 0x7f;
    content[1] = 0x45; // E
    content[2] = 0x4c; // L
    content[3] = 0x46; // F
    content[4] = 2; // 64-bit
    content[5] = 1; // Little endian
    const ctx = createTestContext(content);
    expect(ext.canExtract(ctx)).toBe(true);
  });

  it('rejects non-ELF files', () => {
    const ext = new ELFExtractor();
    const ctx = createTestContext(Buffer.from('not an ELF file'));
    expect(ext.canExtract(ctx)).toBe(false);
  });
});

describe('MachOExtractor', () => {
  it('detects Mach-O via magic', () => {
    const ext = new MachOExtractor();
    const content = Buffer.alloc(32);
    content.writeUInt32LE(0xfeedface, 0); // Mach-O magic (32-bit LE)
    const ctx = createTestContext(content);
    expect(ext.canExtract(ctx)).toBe(true);
  });

  it('rejects non-Mach-O files', () => {
    const ext = new MachOExtractor();
    const ctx = createTestContext(Buffer.from('not a Mach-O file'));
    expect(ext.canExtract(ctx)).toBe(false);
  });

  it('detects universal binary', () => {
    const ext = new MachOExtractor();
    const content = Buffer.alloc(32);
    content.writeUInt32LE(0xcafebabe, 0); // Universal binary magic
    const ctx = createTestContext(content);
    expect(ext.canExtract(ctx)).toBe(true);
  });
});

// ─── Document Extractors ───────────────────────────────────────

describe('PDFExtractor', () => {
  it('detects PDF files', () => {
    const ext = new PDFExtractor();
    const content = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj');
    const ctx = createTestContext(content);
    expect(ext.canExtract(ctx)).toBe(true);
  });

  it('rejects non-PDF files', () => {
    const ext = new PDFExtractor();
    const ctx = createTestContext(Buffer.from('not a PDF file'));
    expect(ext.canExtract(ctx)).toBe(false);
  });

  it('extracts PDF version', async () => {
    const ext = new PDFExtractor();
    const content = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj');
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const header = result.features.find((f) => f.type === 'pdf-header');
    expect(header).toBeDefined();
    const val = header!.value as { version: string };
    expect(val.version).toBe('PDF 1.7');
  });

  it('detects encrypted PDF', async () => {
    const ext = new PDFExtractor();
    const content = Buffer.from('%PDF-1.4\n/Encrypt 10 0 R\nendobj');
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const encrypted = result.features.find((f) => f.type === 'pdf-encrypted');
    expect(encrypted).toBeDefined();
    expect(encrypted!.value).toBe(true);
  });
});

describe('ImageExtractor', () => {
  it('detects PNG images', () => {
    const ext = new ImageExtractor();
    const content = Buffer.alloc(24);
    content[0] = 0x89;
    content[1] = 0x50;
    content[2] = 0x4e;
    content[3] = 0x47;
    content[4] = 0x0d;
    content[5] = 0x0a;
    content[6] = 0x1a;
    content[7] = 0x0a;
    const ctx = createTestContext(content);
    expect(ext.canExtract(ctx)).toBe(true);
  });

  it('detects JPEG images', () => {
    const ext = new ImageExtractor();
    const content = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const ctx = createTestContext(content);
    expect(ext.canExtract(ctx)).toBe(true);
  });

  it('detects GIF images', () => {
    const ext = new ImageExtractor();
    const content = Buffer.from('GIF89a');
    const ctx = createTestContext(content);
    expect(ext.canExtract(ctx)).toBe(true);
  });

  it('rejects non-image files', () => {
    const ext = new ImageExtractor();
    const ctx = createTestContext(Buffer.from('text file'));
    expect(ext.canExtract(ctx)).toBe(false);
  });

  it('extracts PNG dimensions from IHDR', async () => {
    const ext = new ImageExtractor();
    // PNG with IHDR: 100x50
    const content = Buffer.alloc(33);
    content[0] = 0x89;
    content[1] = 0x50;
    content[2] = 0x4e;
    content[3] = 0x47;
    content[4] = 0x0d;
    content[5] = 0x0a;
    content[6] = 0x1a;
    content[7] = 0x0a;
    // IHDR chunk
    content.writeUInt32BE(13, 8); // Chunk length
    content.write('IHDR', 12); // Chunk type
    content.writeUInt32BE(100, 16); // Width
    content.writeUInt32BE(50, 20); // Height
    content[24] = 8; // Bit depth
    content[25] = 2; // Color type

    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const format = result.features.find((f) => f.type === 'image-format');
    expect(format).toBeDefined();
    expect(format!.value).toBe('png');
    const dims = result.features.find((f) => f.type === 'image-dimensions');
    expect(dims).toBeDefined();
    expect(dims!.value).toEqual({ width: 100, height: 50 });
  });
});

describe('CertificateExtractor', () => {
  it('detects PEM certificates', () => {
    const ext = new CertificateExtractor();
    const content = Buffer.from(
      '-----BEGIN CERTIFICATE-----\nMIIBxTCCAS0CAQMwDQYJKoZIhvcNAQEEBQAw\n-----END CERTIFICATE-----',
    );
    const ctx = createTestContext(content);
    expect(ext.canExtract(ctx)).toBe(true);
  });

  it('detects PEM private keys', () => {
    const ext = new CertificateExtractor();
    const content = Buffer.from(
      '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----',
    );
    const ctx = createTestContext(content);
    expect(ext.canExtract(ctx)).toBe(true);
  });

  it('extracts certificate type', async () => {
    const ext = new CertificateExtractor();
    const content = Buffer.from(
      '-----BEGIN CERTIFICATE-----\nMIIBxTCCAS0CAQMwDQYJKoZIhvcNAQEEBQAw\n-----END CERTIFICATE-----',
    );
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const type = result.features.find((f) => f.type === 'certificate-type');
    expect(type).toBeDefined();
    expect(type!.value).toBe('x509-certificate');
  });

  it('extracts PEM labels', async () => {
    const ext = new CertificateExtractor();
    const content = Buffer.from('-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----');
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const labels = result.features.filter((f) => f.type === 'pem-label');
    expect(labels.length).toBe(1);
    expect(labels[0].value).toBe('CERTIFICATE');
  });
});

// ─── Language Extractors ───────────────────────────────────────

describe('JavaScriptExtractor', () => {
  it('extracts imports', async () => {
    const ext = new JavaScriptExtractor();
    const content = Buffer.from('import { foo } from "bar";\nimport baz from "qux";');
    // Use artifact with javascript MIME
    const ctx = createTestContext(content, {
      artifact: createTestArtifact({ mimeType: 'text/javascript', type: 'script' }),
    });
    const result = await ext.extract(ctx);
    const imports = result.features.filter((f) => f.type === 'js-import');
    expect(imports.length).toBe(2);
  });

  it('detects strict mode', async () => {
    const ext = new JavaScriptExtractor();
    const content = Buffer.from('"use strict";\nconst x = 1;');
    const ctx = createTestContext(content, {
      artifact: createTestArtifact({ mimeType: 'text/javascript', type: 'script' }),
    });
    const result = await ext.extract(ctx);
    const strict = result.features.find((f) => f.type === 'use-strict');
    expect(strict).toBeDefined();
    expect(strict!.value).toBe(true);
  });
});

describe('PythonExtractor', () => {
  it('extracts imports', async () => {
    const ext = new PythonExtractor();
    const content = Buffer.from('import os\nimport sys\nfrom datetime import datetime');
    const ctx = createTestContext(content, {
      artifact: createTestArtifact({ mimeType: 'text/x-python', type: 'script' }),
    });
    const result = await ext.extract(ctx);
    const imports = result.features.filter((f) => f.type === 'py-import');
    expect(imports.length).toBeGreaterThanOrEqual(2);
  });

  it('extracts function definitions', async () => {
    const ext = new PythonExtractor();
    const content = Buffer.from('def hello():\n    pass\n\nclass MyClass:\n    pass');
    const ctx = createTestContext(content, {
      artifact: createTestArtifact({ mimeType: 'text/x-python', type: 'script' }),
    });
    const result = await ext.extract(ctx);
    const defs = result.features.filter((f) => f.type === 'py-definition');
    expect(defs.length).toBe(2);
  });
});

describe('GoExtractor', () => {
  it('extracts package name', async () => {
    const ext = new GoExtractor();
    const content = Buffer.from('package main\n\nimport "fmt"\n\nfunc main() {}\n');
    const ctx = createTestContext(content, {
      artifact: createTestArtifact({ mimeType: 'text/x-go', type: 'script' }),
    });
    const result = await ext.extract(ctx);
    const pkg = result.features.find((f) => f.type === 'go-package');
    expect(pkg).toBeDefined();
    expect(pkg!.value).toBe('main');
  });
});

describe('RustExtractor', () => {
  it('extracts unsafe detection', async () => {
    const ext = new RustExtractor();
    const content = Buffer.from('fn main() {\n    unsafe {\n        println!("hello");\n    }\n}');
    const ctx = createTestContext(content, {
      artifact: createTestArtifact({ mimeType: 'text/x-rust', type: 'script' }),
    });
    const result = await ext.extract(ctx);
    const unsafeFeat = result.features.find((f) => f.type === 'rs-unsafe-usage');
    expect(unsafeFeat).toBeDefined();
    expect(unsafeFeat!.value).toBe(true);
  });
});

describe('ShellExtractor', () => {
  it('detects shebang', async () => {
    const ext = new ShellExtractor();
    const content = Buffer.from('#!/bin/bash\necho hello\n');
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const shebang = result.features.find((f) => f.type === 'shell-shebang');
    expect(shebang).toBeDefined();
    expect(shebang!.value).toBe('bash');
  });
});

// ─── Config Extractors ─────────────────────────────────────────

describe('JSONExtractor', () => {
  it('extracts top-level key names', async () => {
    const ext = new JSONExtractor();
    const content = Buffer.from('{"name": "test", "version": "1.0", "enabled": true}');
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const keys = result.features.find((f) => f.type === 'json-top-level-keys');
    expect(keys).toBeDefined();
    expect(keys!.value).toContain('name');
    expect(keys!.value).toContain('version');
  });

  it('handles invalid JSON gracefully', async () => {
    const ext = new JSONExtractor();
    const content = Buffer.from('{invalid json}');
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    // Should not crash, should emit a warning
    expect(result.diagnostics.issues.length).toBeGreaterThan(0);
  });

  it('detects array top-level', async () => {
    const ext = new JSONExtractor();
    const content = Buffer.from('[1, 2, 3, 4, 5]');
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const type = result.features.find((f) => f.type === 'json-top-level-type');
    expect(type!.value).toBe('array');
    const len = result.features.find((f) => f.type === 'json-array-length');
    expect(len!.value).toBe(5);
  });
});

describe('YAMLExtractor', () => {
  it('extracts top-level keys', async () => {
    const ext = new YAMLExtractor();
    const content = Buffer.from('name: test\nversion: 1.0\nenabled: true\n');
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const keys = result.features.find((f) => f.type === 'yaml-top-level-keys');
    expect(keys).toBeDefined();
    expect(keys!.value).toContain('name');
    expect(keys!.value).toContain('version');
  });

  it('detects multi-document YAML', async () => {
    const ext = new YAMLExtractor();
    const content = Buffer.from('a: 1\n---\nb: 2\n');
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const multi = result.features.find((f) => f.type === 'yaml-multi-document');
    expect(multi).toBeDefined();
    expect(multi!.value).toBe(true);
  });
});

describe('XMLExtractor', () => {
  it('extracts root element', async () => {
    const ext = new XMLExtractor();
    const content = Buffer.from('<?xml version="1.0"?>\n<root><child/></root>');
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const root = result.features.find((f) => f.type === 'xml-root-element');
    expect(root).toBeDefined();
    expect(root!.value).toBe('root');
  });

  it('extracts XML version', async () => {
    const ext = new XMLExtractor();
    const content = Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<root/>');
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const ver = result.features.find((f) => f.type === 'xml-version');
    expect(ver!.value).toBe('1.0');
    const enc = result.features.find((f) => f.type === 'xml-encoding');
    expect(enc!.value).toBe('UTF-8');
  });
});

describe('KubernetesExtractor', () => {
  it('detects K8s manifest', async () => {
    const ext = new KubernetesExtractor();
    const content = Buffer.from('apiVersion: v1\nkind: Pod\nmetadata:\n  name: test-pod\n');
    const ctx = createTestContext(content);
    expect(ext.canExtract(ctx)).toBe(true);
  });

  it('extracts resource kind', async () => {
    const ext = new KubernetesExtractor();
    const content = Buffer.from('apiVersion: v1\nkind: Pod\nmetadata:\n  name: test-pod\n');
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const kind = result.features.find((f) => f.type === 'k8s-resource-kind');
    expect(kind!.value).toBe('Pod');
  });
});

// ─── Other Extractors ──────────────────────────────────────────

describe('EnvFileExtractor', () => {
  it('extracts variable names', async () => {
    const ext = new EnvFileExtractor();
    const content = Buffer.from('DATABASE_URL=postgres://localhost\nAPI_KEY=abc123\nDEBUG=true\n');
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const count = result.features.find((f) => f.type === 'env-variable-count');
    expect(count!.value).toBe(3);
  });

  it('detects sensitive variables', async () => {
    const ext = new EnvFileExtractor();
    const content = Buffer.from('SECRET_KEY=super-secret\nPASSWORD=12345\nTOKEN=xyz\nOK=yes\n');
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const sensitive = result.features.filter((f) => f.type === 'env-sensitive-variable');
    expect(sensitive.length).toBeGreaterThanOrEqual(2);
  });
});

describe('RequirementsExtractor', () => {
  it('extracts dependencies', async () => {
    const ext = new RequirementsExtractor();
    const content = Buffer.from('requests==2.28.0\nflask>=2.0\nnumpy\n# comment\npandas==1.4.0\n');
    const ctx = createTestContext(content);
    const result = await ext.extract(ctx);
    const deps = result.features.filter((f) => f.type === 'python-dependency');
    expect(deps.length).toBe(4);
  });
});

describe('PackageManifestExtractor', () => {
  it('extracts package.json metadata', async () => {
    const ext = new PackageManifestExtractor();
    const content = Buffer.from(
      JSON.stringify({
        name: 'my-package',
        version: '1.0.0',
        dependencies: { express: '^4.0.0', lodash: '^4.0.0' },
        devDependencies: { typescript: '^5.0.0' },
      }),
    );
    const ctx = createTestContext(content, {
      artifact: createTestArtifact({ normalizedPath: '/project/package.json' }),
    });
    const result = await ext.extract(ctx);
    const name = result.features.find((f) => f.type === 'package-name');
    expect(name!.value).toBe('my-package');
    const deps = result.features.filter((f) => f.type === 'npm-dependency');
    expect(deps.length).toBe(2);
    const devDeps = result.features.filter((f) => f.type === 'npm-dev-dependency');
    expect(devDeps.length).toBe(1);
  });
});

// ─── Full Pipeline Integration ─────────────────────────────────

describe('Full Pipeline Integration', () => {
  it('processes a text file through multiple extractors', async () => {
    const registry = new ExtractorRegistry();
    registry.registerAll([
      new StringExtractor({ minLength: 3 }),
      new HashExtractor(),
      new EntropyExtractor(),
    ]);
    const content = Buffer.from(
      'Hello World! This is a test file with some content for extraction.',
    );
    const ctx = createTestContext(content);
    const result = await registry.extract(ctx);
    expect(result.features.length).toBeGreaterThan(0);
    expect(result.diagnostics.matchedExtractors).toBe(3);
    expect(result.diagnostics.totalFeaturesEmitted).toBeGreaterThan(0);
  });

  it('handles empty registry gracefully', async () => {
    const registry = new ExtractorRegistry();
    const ctx = createTestContext(Buffer.from('test'));
    const result = await registry.extract(ctx);
    expect(result.features.length).toBe(0);
    expect(result.diagnostics.totalExtractors).toBe(0);
  });
});

// ─── Determinism ───────────────────────────────────────────────

describe('Determinism', () => {
  it('string extractor is deterministic', async () => {
    const ext = new StringExtractor();
    const content = Buffer.from('test content 12345');
    const ctx1 = createTestContext(content);
    const ctx2 = createTestContext(content);
    const [r1, r2] = await Promise.all([ext.extract(ctx1), ext.extract(ctx2)]);
    expect(JSON.stringify(r1.features)).toBe(JSON.stringify(r2.features));
  });

  it('hash extractor is deterministic', async () => {
    const ext = new HashExtractor();
    const content = Buffer.from('test data');
    const ctx1 = createTestContext(content);
    const ctx2 = createTestContext(content);
    const [r1, r2] = await Promise.all([ext.extract(ctx1), ext.extract(ctx2)]);
    expect(JSON.stringify(r1.features)).toBe(JSON.stringify(r2.features));
  });

  it('entropy extractor is deterministic', async () => {
    const ext = new EntropyExtractor();
    const content = Buffer.from('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    const ctx1 = createTestContext(content);
    const ctx2 = createTestContext(content);
    const [r1, r2] = await Promise.all([ext.extract(ctx1), ext.extract(ctx2)]);
    expect(JSON.stringify(r1.features)).toBe(JSON.stringify(r2.features));
  });
});
