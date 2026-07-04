import { describe, it, expect } from 'vitest';
import {
  TrackingMap,
  uniqueBy,
  groupBy,
  unique,
  partition,
} from '../src/collections/collections.js';

describe('TrackingMap', () => {
  it('stores and retrieves values', () => {
    const map = new TrackingMap<string, number>();
    const m2 = map.set('a', 1);
    expect(m2.get('a')).toBe(1);
  });

  it('is immutable — set returns a new instance', () => {
    const m1 = new TrackingMap<string, number>();
    const m2 = m1.set('a', 1);
    expect(m1.get('a')).toBeUndefined();
    expect(m2.get('a')).toBe(1);
  });

  it('tracks hits and misses', () => {
    const map = new TrackingMap<string, number>().set('a', 1);
    map.get('a'); // hit
    map.get('b'); // miss
    expect(map.hits).toBe(1);
    expect(map.misses).toBe(1);
  });

  it('computes hit ratio', () => {
    const map = new TrackingMap<string, number>().set('a', 1);
    map.get('a'); // hit
    expect(map.hitRatio).toBe(1);
    map.get('b'); // miss
    expect(map.hitRatio).toBe(0.5);
  });

  it('empty map has 0 hit ratio', () => {
    const map = new TrackingMap<string, number>();
    expect(map.hitRatio).toBe(0);
  });

  it('delete returns new instance without the key', () => {
    const m1 = new TrackingMap<string, number>().set('a', 1);
    const m2 = m1.delete('a');
    expect(m1.has('a')).toBe(true);
    expect(m2.has('a')).toBe(false);
  });
});

describe('uniqueBy', () => {
  it('deduplicates items by key function', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'a' }];
    expect(() => uniqueBy(items, (x) => x.id)).toThrow('Duplicate key');
  });

  it('keeps unique items unchanged', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    const result = uniqueBy(items, (x) => x.id);
    expect(result).toHaveLength(2);
  });
});

describe('groupBy', () => {
  it('groups items by key', () => {
    const items = [{ cat: 'a' }, { cat: 'a' }, { cat: 'b' }];
    const groups = groupBy(items, (x) => x.cat);
    expect(groups.a).toHaveLength(2);
    expect(groups.b).toHaveLength(1);
  });

  it('returns frozen groups', () => {
    const items = [{ cat: 'a' }];
    const groups = groupBy(items, (x) => x.cat);
    expect(Object.isFrozen(groups)).toBe(true);
  });
});

describe('partition', () => {
  it('splits items by predicate', () => {
    const [even, odd] = partition([1, 2, 3, 4], (x) => x % 2 === 0);
    expect(even).toEqual([2, 4]);
    expect(odd).toEqual([1, 3]);
  });

  it('returns frozen arrays', () => {
    const [pass] = partition([1], () => true);
    expect(Object.isFrozen(pass)).toBe(true);
  });
});
