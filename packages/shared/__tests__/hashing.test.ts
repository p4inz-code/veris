import { describe, it, expect } from 'vitest';
import {
  sha256,
  computeContentHash,
  hashString,
  hashBuffer,
  deterministicId,
} from '../src/hashing/hashing.js';

describe('Hashing', () => {
  it('computes SHA-256 hash of a string', () => {
    const hash = hashString('hello');
    expect(hash).toHaveLength(64); // 256 bits = 64 hex chars
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('SHA-256 is deterministic', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
  });

  it('different inputs produce different hashes', () => {
    expect(hashString('hello')).not.toBe(hashString('world'));
  });

  it('computeContentHash combines multiple parts', () => {
    const hash1 = computeContentHash('part1', 'part2');
    const hash2 = computeContentHash('part1', 'part2');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('different order of parts produces different hash', () => {
    expect(computeContentHash('a', 'b')).not.toBe(computeContentHash('b', 'a'));
  });

  it('deterministicId creates prefixed ID', () => {
    const id = deterministicId('art', 'content');
    expect(id).toMatch(/^art_[a-f0-9]{64}$/);
  });

  it('different prefixes produce different IDs', () => {
    expect(deterministicId('art', 'content')).not.toBe(deterministicId('fin', 'content'));
  });

  it('sha256 raw function works', () => {
    const hash = sha256('test input');
    expect(hash).toHaveLength(64);
  });

  it('hashBuffer works on buffers', () => {
    const buf = Buffer.from('buffer content');
    const hash = hashBuffer(buf);
    expect(hash).toHaveLength(64);
  });
});
