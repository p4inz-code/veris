/**
 * Tests for @veris/recommendations documentation registry.
 *
 * @module @veris/recommendations/__tests__/documentation
 */

import { describe, it, expect } from 'vitest';
import {
  createDocumentationRegistry,
  createRecommendationRegistry,
  BUILT_IN_RECOMMENDATIONS,
  SCHEMA_VERSION,
  ENGINE_VERSION,
  CATEGORIES,
  ACTIONS,
  SOURCE_TYPES,
} from '../src/index.js';

import type { Recommendation, DocumentationReference } from '../src/types.js';
import { makeRec } from './helpers.js';

// ── Empty Registry ──

describe('empty registry', () => {
  it('creates an empty documentation registry', () => {
    const docReg = createDocumentationRegistry([]);
    expect(docReg.listDocumentation()).toEqual([]);
  });

  it('lookup returns undefined for empty registry', () => {
    const docReg = createDocumentationRegistry([]);
    expect(docReg.lookupDocumentation('nonexistent')).toBeUndefined();
  });

  it('validate returns valid for empty registry', () => {
    const docReg = createDocumentationRegistry([]);
    const result = docReg.validateDocumentation();
    expect(result.valid).toBe(true);
    expect(result.errorCount).toBe(0);
    expect(result.findings).toEqual([]);
  });

  it('creates empty registry from recommendations with no doc refs', () => {
    const recs = [makeRec({ id: 'NO-DOCS' })];
    const docReg = createDocumentationRegistry(recs);
    expect(docReg.listDocumentation()).toEqual([]);
  });
});

// ── Lookup ──

describe('lookup', () => {
  it('looks up documentation by ID', () => {
    const docRef = Object.freeze({ documentId: 'doc-001', documentTitle: 'Document One' });
    const rec = makeRec({
      id: 'REC-001',
      documentationRefs: Object.freeze([docRef]),
    });
    const docReg = createDocumentationRegistry([rec]);
    const entry = docReg.lookupDocumentation('doc-001');
    expect(entry).toBeDefined();
    expect(entry!.documentationId).toBe('doc-001');
    expect(entry!.documentTitle).toBe('Document One');
  });

  it('returns undefined for missing documentation', () => {
    const docReg = createDocumentationRegistry([]);
    expect(docReg.lookupDocumentation('doc-nonexistent')).toBeUndefined();
  });

  it('includes recommendation IDs in the entry', () => {
    const docRef = Object.freeze({ documentId: 'doc-001', documentTitle: 'Doc One' });
    const rec = makeRec({
      id: 'REC-001',
      documentationRefs: Object.freeze([docRef]),
    });
    const docReg = createDocumentationRegistry([rec]);
    const entry = docReg.lookupDocumentation('doc-001');
    expect(entry!.recommendationIds).toContain('REC-001');
  });

  it('preserves section and url fields', () => {
    const docRef = Object.freeze({
      documentId: 'doc-001',
      documentTitle: 'Doc One',
      section: 'Section 2.1',
      url: 'https://example.com/docs/1',
    });
    const rec = makeRec({
      id: 'REC-001',
      documentationRefs: Object.freeze([docRef]),
    });
    const docReg = createDocumentationRegistry([rec]);
    const entry = docReg.lookupDocumentation('doc-001');
    expect(entry!.section).toBe('Section 2.1');
    expect(entry!.url).toBe('https://example.com/docs/1');
  });
});

// ── Listing ──

describe('list documentation', () => {
  it('lists all documentation entries', () => {
    const recs = [
      makeRec({
        id: 'REC-A',
        documentationRefs: Object.freeze([
          Object.freeze({ documentId: 'doc-a', documentTitle: 'Doc A' }),
        ]),
      }),
      makeRec({
        id: 'REC-B',
        documentationRefs: Object.freeze([
          Object.freeze({ documentId: 'doc-b', documentTitle: 'Doc B' }),
        ]),
      }),
    ];
    const docReg = createDocumentationRegistry(recs);
    const entries = docReg.listDocumentation();
    expect(entries.length).toBe(2);
    expect(entries.map((e) => e.documentationId)).toContain('doc-a');
    expect(entries.map((e) => e.documentationId)).toContain('doc-b');
  });

  it('lists entries sorted by documentation ID', () => {
    const recs = [
      makeRec({
        id: 'REC-Z',
        documentationRefs: Object.freeze([
          Object.freeze({ documentId: 'zzz-doc', documentTitle: 'Z Doc' }),
        ]),
      }),
      makeRec({
        id: 'REC-A',
        documentationRefs: Object.freeze([
          Object.freeze({ documentId: 'aaa-doc', documentTitle: 'A Doc' }),
        ]),
      }),
    ];
    const docReg = createDocumentationRegistry(recs);
    const entries = docReg.listDocumentation();
    expect(entries[0].documentationId).toBe('aaa-doc');
    expect(entries[1].documentationId).toBe('zzz-doc');
  });

  it('aggregates multiple recommendations referencing the same doc', () => {
    const docRef = Object.freeze({ documentId: 'doc-shared', documentTitle: 'Shared Doc' });
    const recs = [
      makeRec({ id: 'REC-001', documentationRefs: Object.freeze([docRef]) }),
      makeRec({ id: 'REC-002', documentationRefs: Object.freeze([docRef]) }),
    ];
    const docReg = createDocumentationRegistry(recs);
    const entries = docReg.listDocumentation();
    expect(entries.length).toBe(1);
    expect(entries[0].recommendationIds.length).toBe(2);
    expect(entries[0].recommendationIds).toContain('REC-001');
    expect(entries[0].recommendationIds).toContain('REC-002');
  });

  it('recommendation IDs are sorted within entry', () => {
    const docRef = Object.freeze({ documentId: 'doc-shared', documentTitle: 'Shared Doc' });
    const recs = [
      makeRec({ id: 'Z-REC', documentationRefs: Object.freeze([docRef]) }),
      makeRec({ id: 'A-REC', documentationRefs: Object.freeze([docRef]) }),
    ];
    const docReg = createDocumentationRegistry(recs);
    const entries = docReg.listDocumentation();
    expect(entries[0].recommendationIds).toEqual(['A-REC', 'Z-REC']);
  });
});

// ── Duplicate IDs ──

describe('duplicate IDs', () => {
  it('deduplicates same doc ID from multiple recommendations', () => {
    const recs = [
      makeRec({
        id: 'REC-A',
        documentationRefs: Object.freeze([
          Object.freeze({ documentId: 'doc-001', documentTitle: 'Doc One' }),
        ]),
      }),
      makeRec({
        id: 'REC-B',
        documentationRefs: Object.freeze([
          Object.freeze({ documentId: 'doc-001', documentTitle: 'Doc One' }),
        ]),
      }),
    ];
    const docReg = createDocumentationRegistry(recs);
    const entries = docReg.listDocumentation();
    expect(entries.length).toBe(1);
    expect(entries[0].recommendationIds.length).toBe(2);
  });

  it('first metadata wins for duplicate doc IDs with different metadata', () => {
    const recs = [
      makeRec({
        id: 'REC-A',
        documentationRefs: Object.freeze([
          Object.freeze({ documentId: 'doc-001', documentTitle: 'First Title' }),
        ]),
      }),
      makeRec({
        id: 'REC-B',
        documentationRefs: Object.freeze([
          Object.freeze({ documentId: 'doc-001', documentTitle: 'Second Title' }),
        ]),
      }),
    ];
    const docReg = createDocumentationRegistry(recs);
    const entry = docReg.lookupDocumentation('doc-001');
    expect(entry!.documentTitle).toBe('First Title');
  });
});

// ── Validation ──

describe('validation', () => {
  it('validates a clean registry as valid', () => {
    const recs = [
      makeRec({
        id: 'REC-A',
        documentationRefs: Object.freeze([
          Object.freeze({ documentId: 'doc-a', documentTitle: 'Doc A' }),
        ]),
      }),
    ];
    const docReg = createDocumentationRegistry(recs);
    const result = docReg.validateDocumentation();
    expect(result.valid).toBe(true);
    expect(result.errorCount).toBe(0);
  });

  it('detects missing document titles', () => {
    const recs = [
      makeRec({
        id: 'REC-A',
        documentationRefs: Object.freeze([
          Object.freeze({ documentId: 'doc-001', documentTitle: '' }),
        ]),
      }),
    ];
    const docReg = createDocumentationRegistry(recs);
    const result = docReg.validateDocumentation();
    const missing = result.findings.filter((f) => f.code === 'MISSING_DOCUMENTATION_TITLE');
    expect(missing.length).toBeGreaterThanOrEqual(1);
  });

  it('detects empty documentation IDs', () => {
    const recs = [
      makeRec({
        id: 'REC-A',
        documentationRefs: Object.freeze([
          Object.freeze({ documentId: '', documentTitle: 'Empty ID' }),
        ]),
      }),
    ];
    const docReg = createDocumentationRegistry(recs);
    const result = docReg.validateDocumentation();
    const empty = result.findings.filter((f) => f.code === 'EMPTY_DOCUMENTATION_ID');
    expect(empty.length).toBeGreaterThanOrEqual(1);
  });

  it('validate result is frozen', () => {
    const docReg = createDocumentationRegistry([]);
    const result = docReg.validateDocumentation();
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.findings)).toBe(true);
  });
});

// ── Stable Ordering ──

describe('stable ordering', () => {
  it('list ordering is deterministic across repeated calls', () => {
    const recs = [
      makeRec({
        id: 'REC-B',
        documentationRefs: Object.freeze([
          Object.freeze({ documentId: 'doc-b', documentTitle: 'B' }),
        ]),
      }),
      makeRec({
        id: 'REC-A',
        documentationRefs: Object.freeze([
          Object.freeze({ documentId: 'doc-a', documentTitle: 'A' }),
        ]),
      }),
    ];
    const docReg = createDocumentationRegistry(recs);
    const first = docReg.listDocumentation().map((e) => e.documentationId);
    const second = docReg.listDocumentation().map((e) => e.documentationId);
    expect(first).toEqual(second);
  });
});

// ── Frozen Outputs ──

describe('frozen outputs', () => {
  it('listDocumentation returns frozen array', () => {
    const docReg = createDocumentationRegistry([]);
    expect(Object.isFrozen(docReg.listDocumentation())).toBe(true);
  });

  it('documentation entries are frozen', () => {
    const rec = makeRec({
      id: 'REC-A',
      documentationRefs: Object.freeze([
        Object.freeze({ documentId: 'doc-001', documentTitle: 'Doc One' }),
      ]),
    });
    const docReg = createDocumentationRegistry([rec]);
    const entries = docReg.listDocumentation();
    expect(Object.isFrozen(entries[0])).toBe(true);
  });

  it('recommendationIds arrays are frozen', () => {
    const rec = makeRec({
      id: 'REC-A',
      documentationRefs: Object.freeze([
        Object.freeze({ documentId: 'doc-001', documentTitle: 'Doc One' }),
      ]),
    });
    const docReg = createDocumentationRegistry([rec]);
    const entries = docReg.listDocumentation();
    expect(Object.isFrozen(entries[0].recommendationIds)).toBe(true);
  });
});

// ── Serialization ──

describe('serialization', () => {
  it('list serializes to JSON', () => {
    const rec = makeRec({
      id: 'JSON-REC',
      documentationRefs: Object.freeze([
        Object.freeze({ documentId: 'doc-json', documentTitle: 'JSON Doc' }),
      ]),
    });
    const docReg = createDocumentationRegistry([rec]);
    const serialized = JSON.parse(JSON.stringify(docReg.listDocumentation()));
    expect(serialized.length).toBe(1);
    expect(serialized[0].documentationId).toBe('doc-json');
    expect(serialized[0].recommendationIds).toEqual(['JSON-REC']);
  });

  it('validation result serializes to JSON', () => {
    const rec = makeRec({
      id: 'JSON-VAL',
      documentationRefs: Object.freeze([
        Object.freeze({ documentId: '', documentTitle: 'Empty ID' }),
      ]),
    });
    const docReg = createDocumentationRegistry([rec]);
    const result = docReg.validateDocumentation();
    const serialized = JSON.parse(JSON.stringify(result));
    expect(serialized.valid).toBe(false);
    expect(serialized.findings.length).toBeGreaterThan(0);
  });
});

// ── Registry Compatibility ──

describe('registry compatibility', () => {
  it('works with RecommendationRegistry', () => {
    const registry = createRecommendationRegistry();
    registry.registerMany(BUILT_IN_RECOMMENDATIONS);
    const docReg = createDocumentationRegistry(registry.list());
    expect(docReg.listDocumentation()).toEqual([]);
  });

  it('indexes documentation from registered recommendations', () => {
    const registry = createRecommendationRegistry();
    const docRef = Object.freeze({ documentId: 'reg-doc', documentTitle: 'Reg Doc' });
    registry.register(
      makeRec({
        id: 'REG-REC',
        documentationRefs: Object.freeze([docRef]),
      }),
    );
    const docReg = createDocumentationRegistry(registry.list());
    const entry = docReg.lookupDocumentation('reg-doc');
    expect(entry).toBeDefined();
    expect(entry!.recommendationIds).toContain('REG-REC');
  });
});

// ── Recommendation Compatibility ──

describe('recommendation compatibility', () => {
  it('indexes multiple doc refs from a single recommendation', () => {
    const rec = makeRec({
      id: 'MULTI-DOC',
      documentationRefs: Object.freeze([
        Object.freeze({ documentId: 'doc-001', documentTitle: 'Doc One' }),
        Object.freeze({ documentId: 'doc-002', documentTitle: 'Doc Two' }),
      ]),
    });
    const docReg = createDocumentationRegistry([rec]);
    expect(docReg.listDocumentation().length).toBe(2);
    expect(docReg.lookupDocumentation('doc-001')!.recommendationIds).toContain('MULTI-DOC');
    expect(docReg.lookupDocumentation('doc-002')!.recommendationIds).toContain('MULTI-DOC');
  });

  it('recommendations with no doc refs produce empty doc entries', () => {
    const recs = [
      makeRec({ id: 'NO-DOC' }),
      makeRec({
        id: 'HAS-DOC',
        documentationRefs: Object.freeze([
          Object.freeze({ documentId: 'doc-001', documentTitle: 'Doc One' }),
        ]),
      }),
    ];
    const docReg = createDocumentationRegistry(recs);
    expect(docReg.listDocumentation().length).toBe(1);
  });
});

// ── Determinism (10,000 cumulative executions) ──

describe('determinism (10,000 cumulative executions)', () => {
  it('lookup is deterministic across 10,000 runs', () => {
    const recs = [
      makeRec({
        id: 'REC-A',
        documentationRefs: Object.freeze([
          Object.freeze({ documentId: 'doc-001', documentTitle: 'Doc One' }),
        ]),
      }),
    ];

    for (let i = 0; i < 10000; i++) {
      const docReg = createDocumentationRegistry(recs);
      const entry = docReg.lookupDocumentation('doc-001');
      expect(entry).toBeDefined();
      expect(entry!.documentTitle).toBe('Doc One');
      expect(entry!.recommendationIds).toEqual(['REC-A']);
    }
  });

  it('list is deterministic across 10,000 runs', () => {
    const recs = [
      makeRec({
        id: 'B-REC',
        documentationRefs: Object.freeze([
          Object.freeze({ documentId: 'b-doc', documentTitle: 'B Doc' }),
        ]),
      }),
      makeRec({
        id: 'A-REC',
        documentationRefs: Object.freeze([
          Object.freeze({ documentId: 'a-doc', documentTitle: 'A Doc' }),
        ]),
      }),
    ];

    const first = createDocumentationRegistry(recs)
      .listDocumentation()
      .map((e) => e.documentationId);
    for (let i = 0; i < 10000; i++) {
      const current = createDocumentationRegistry(recs)
        .listDocumentation()
        .map((e) => e.documentationId);
      expect(current).toEqual(first);
    }
  });

  it('validation is deterministic across 10,000 runs', () => {
    const recs = [
      makeRec({
        id: 'REC-A',
        documentationRefs: Object.freeze([
          Object.freeze({ documentId: 'doc-001', documentTitle: '' }),
        ]),
      }),
    ];

    const first = createDocumentationRegistry(recs).validateDocumentation();
    const firstJson = JSON.stringify(first);

    for (let i = 0; i < 10000; i++) {
      const current = createDocumentationRegistry(recs).validateDocumentation();
      expect(JSON.stringify(current)).toBe(firstJson);
    }
  });
});

// ── Validation Result Correctness ──

describe('validation result correctness', () => {
  it('detects empty title as warning', () => {
    const recs = [
      makeRec({
        id: 'REC-A',
        documentationRefs: Object.freeze([
          Object.freeze({ documentId: 'doc-001', documentTitle: '' }),
        ]),
      }),
    ];
    const docReg = createDocumentationRegistry(recs);
    const result = docReg.validateDocumentation();
    const missingTitle = result.findings.find((f) => f.code === 'MISSING_DOCUMENTATION_TITLE');
    expect(missingTitle).toBeDefined();
    expect(missingTitle!.severity).toBe('warning');
  });

  it('findings are sorted by documentation ID', () => {
    const recs = [
      makeRec({
        id: 'REC-B',
        documentationRefs: Object.freeze([
          Object.freeze({ documentId: 'b-doc', documentTitle: '' }),
        ]),
      }),
      makeRec({
        id: 'REC-A',
        documentationRefs: Object.freeze([
          Object.freeze({ documentId: 'a-doc', documentTitle: '' }),
        ]),
      }),
    ];
    const docReg = createDocumentationRegistry(recs);
    const result = docReg.validateDocumentation();
    const docIds = result.findings.map((f) => f.documentationId);
    expect(docIds).toEqual(['a-doc', 'b-doc']);
  });

  it('valid flag is false when errors exist', () => {
    const recs = [
      makeRec({
        id: 'REC-A',
        documentationRefs: Object.freeze([
          Object.freeze({ documentId: '', documentTitle: 'Empty ID' }),
        ]),
      }),
    ];
    const docReg = createDocumentationRegistry(recs);
    const result = docReg.validateDocumentation();
    expect(result.valid).toBe(false);
    expect(result.errorCount).toBeGreaterThan(0);
  });
});
