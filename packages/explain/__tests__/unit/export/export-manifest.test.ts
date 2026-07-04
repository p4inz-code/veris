/**
 * Tests for ManifestBuilder — export manifest generation.
 */

import { describe, it, expect } from 'vitest';
import { ManifestBuilder } from '../../../src/export/export-manifest.js';

const FIXED_CLOCK = { now: () => new Date('2026-07-04T00:00:00.000Z') };

describe('ManifestBuilder', () => {
  const builder = new ManifestBuilder(FIXED_CLOCK, '1.0.0');

  it('builds a manifest from file entries', () => {
    const manifest = builder.build(
      [
        {
          absolutePath: '/tmp/output/fin_001.md',
          hash: 'abc123',
          size: 1024,
          format: 'markdown',
          subjectId: 'fin_001',
        },
        {
          absolutePath: '/tmp/output/fin_002.md',
          hash: 'def456',
          size: 2048,
          format: 'markdown',
          subjectId: 'fin_002',
        },
      ],
      '/tmp/output',
    );

    expect(manifest.manifestVersion).toBe('1.0.0');
    expect(manifest.totalFiles).toBe(2);
    expect(manifest.totalSize).toBe(3072);
    expect(manifest.files[0].relativePath).toBe('fin_001.md');
    expect(manifest.files[1].relativePath).toBe('fin_002.md');
  });

  it('sorts entries by relative path', () => {
    const manifest = builder.build(
      [
        {
          absolutePath: '/tmp/output/z_file.md',
          hash: 'z',
          size: 100,
          format: 'markdown',
          subjectId: 'fin_Z',
        },
        {
          absolutePath: '/tmp/output/a_file.md',
          hash: 'a',
          size: 100,
          format: 'markdown',
          subjectId: 'fin_A',
        },
      ],
      '/tmp/output',
    );

    expect(manifest.files[0].relativePath).toBe('a_file.md');
    expect(manifest.files[1].relativePath).toBe('z_file.md');
  });

  it('builds an empty manifest', () => {
    const manifest = builder.buildEmpty('/tmp/output');
    expect(manifest.totalFiles).toBe(0);
    expect(manifest.totalSize).toBe(0);
    expect(manifest.files).toHaveLength(0);
  });

  it('computes SHA-256 hash of content', () => {
    const hash = builder.computeHash('hello');
    // SHA-256 of "hello" (known value)
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('computes deterministic hashes', () => {
    const hash1 = builder.computeHash('same content');
    const hash2 = builder.computeHash('same content');
    expect(hash1).toBe(hash2);
  });

  it('different content produces different hashes', () => {
    const hash1 = builder.computeHash('content A');
    const hash2 = builder.computeHash('content B');
    expect(hash1).not.toBe(hash2);
  });

  it('uses forward slashes for relative paths', () => {
    const manifest = builder.build(
      [
        {
          absolutePath: 'C:\\Users\\test\\output\\report.md',
          hash: 'hash',
          size: 100,
          format: 'markdown',
          subjectId: 'fin_001',
        },
      ],
      'C:\\Users\\test\\output',
    );

    expect(manifest.files[0].relativePath).toBe('report.md');
  });

  it('includes metadata in manifest', () => {
    const manifest = builder.build(
      [
        {
          absolutePath: '/tmp/out.md',
          hash: 'hash',
          size: 100,
          format: 'markdown',
          subjectId: 'fin_001',
        },
      ],
      '/tmp',
    );

    expect(manifest.manifestVersion).toBe('1.0.0');
    expect(manifest.schemaVersion).toBe('1.0.0');
    expect(manifest.exportedAt).toBe('2026-07-04T00:00:00.000Z');
  });

  it('is deterministic across 100 runs', () => {
    const entries = [
      {
        absolutePath: '/tmp/out/fin_001.md',
        hash: 'abc',
        size: 100,
        format: 'markdown',
        subjectId: 'fin_001',
      },
    ];

    const first = builder.build(entries, '/tmp/out');
    for (let i = 0; i < 100; i++) {
      const manifest = builder.build(entries, '/tmp/out');
      expect(manifest.files).toEqual(first.files);
      expect(manifest.totalSize).toBe(first.totalSize);
    }
  });
});
