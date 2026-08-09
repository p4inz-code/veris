/**
 * Tests for Knowledge Pack Cache.
 */

import { describe, it, expect } from 'vitest';
import { PackCache } from '../../src/packs/cache.js';
import { MALWARE_FAMILIES_PACK } from '../../src/packs/data/malware-families.js';
import { LOBINS_PACK } from '../../src/packs/data/lolbins-pack.js';

function createPackWithHash(id: string, hash: string) {
  const pack = id === 'malware-families' ? MALWARE_FAMILIES_PACK : LOBINS_PACK;
  return { ...pack, contentHash: hash };
}

describe('PackCache', () => {
  it('starts empty', () => {
    const cache = new PackCache();
    expect(cache.size).toBe(0);
    expect(cache.hits).toBe(0);
    expect(cache.misses).toBe(0);
  });

  it('stores and retrieves packs', () => {
    const cache = new PackCache();
    const pack = createPackWithHash('malware-families', 'hash-1');
    cache.set(pack);
    expect(cache.size).toBe(1);

    const retrieved = cache.get('hash-1');
    expect(retrieved).toBeDefined();
    expect(retrieved!.metadata.id).toBe('malware-families');
  });

  it('returns miss for unknown hash', () => {
    const cache = new PackCache();
    const result = cache.get('nonexistent');
    expect(result).toBeUndefined();
    expect(cache.misses).toBe(1);
  });

  it('tracks hits and misses', () => {
    const cache = new PackCache();
    cache.set(createPackWithHash('malware-families', 'hash-a'));
    cache.get('hash-a'); // hit
    cache.get('unknown-hash'); // miss
    expect(cache.hits).toBe(1);
    expect(cache.misses).toBe(1);
  });

  it('computes hit ratio', () => {
    const cache = new PackCache();
    cache.set(createPackWithHash('malware-families', 'hash-b'));
    cache.get('hash-b'); // hit
    cache.get('miss'); // miss
    expect(cache.hitRatio).toBe(0.5);
  });

  it('handles empty hit ratio', () => {
    const cache = new PackCache();
    expect(cache.hitRatio).toBe(0);
  });

  it('checks if hash is cached', () => {
    const cache = new PackCache();
    cache.set(createPackWithHash('malware-families', 'hash-c'));
    expect(cache.has('hash-c')).toBe(true);
    expect(cache.has('unknown')).toBe(false);
  });

  it('invalidates specific entry', () => {
    const cache = new PackCache();
    cache.set(createPackWithHash('malware-families', 'hash-d'));
    expect(cache.invalidate('hash-d')).toBe(true);
    expect(cache.size).toBe(0);
  });

  it('invalidates unknown entry', () => {
    const cache = new PackCache();
    expect(cache.invalidate('unknown')).toBe(false);
  });

  it('invalidates all entries for a pack ID', () => {
    const cache = new PackCache();
    cache.set(createPackWithHash('malware-families', 'hash-1'));
    cache.set(createPackWithHash('malware-families', 'hash-2'));
    cache.set(createPackWithHash('lolbins', 'hash-3'));
    const count = cache.invalidatePack('malware-families');
    expect(count).toBe(2);
    expect(cache.size).toBe(1);
  });

  it('clears all entries', () => {
    const cache = new PackCache();
    cache.set(createPackWithHash('malware-families', 'hash-a'));
    cache.set(createPackWithHash('lolbins', 'hash-b'));
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('returns stats', () => {
    const cache = new PackCache({ maxPacks: 10 });
    cache.set(createPackWithHash('malware-families', 'hash-s'));
    const stats = cache.getStats();
    expect(stats.size).toBe(1);
    expect(stats.maxPacks).toBe(10);
  });

  it('does not duplicate existing entries', () => {
    const cache = new PackCache();
    const pack = createPackWithHash('malware-families', 'hash-dup');
    cache.set(pack);
    cache.set(pack);
    expect(cache.size).toBe(1);
  });

  it('evicts oldest when max size exceeded', () => {
    const cache = new PackCache({ maxPacks: 1 });
    cache.set(createPackWithHash('malware-families', 'hash-old'));
    cache.set(createPackWithHash('lolbins', 'hash-new'));
    // Should have evicted the first pack
    expect(cache.size).toBe(1);
    expect(cache.has('hash-old')).toBe(false);
    expect(cache.has('hash-new')).toBe(true);
  });
});
