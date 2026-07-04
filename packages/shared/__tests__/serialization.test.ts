import { describe, it, expect } from 'vitest';
import {
  toJSON,
  toJSONPretty,
  tryParseJSON,
  deepMerge,
  isPlainObject,
} from '../src/serialization/serialization.js';

describe('Serialization', () => {
  describe('toJSON', () => {
    it('serializes a value to JSON string', () => {
      const json = toJSON({ a: 1, b: 'hello' });
      expect(json).toBe('{"a":1,"b":"hello"}');
    });

    it('serializes Date to ISO string', () => {
      const date = new Date('2024-01-01T00:00:00.000Z');
      const json = toJSON({ date });
      expect(json).toBe('{"date":"2024-01-01T00:00:00.000Z"}');
    });
  });

  describe('toJSONPretty', () => {
    it('produces pretty-printed JSON', () => {
      const json = toJSONPretty({ a: 1 });
      expect(json).toContain('\n');
    });
  });

  describe('tryParseJSON', () => {
    it('parses valid JSON', () => {
      const result = tryParseJSON('{"a":1}');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual({ a: 1 });
    });

    it('returns error for invalid JSON', () => {
      const result = tryParseJSON('not json');
      expect(result.ok).toBe(false);
    });
  });

  describe('deepMerge', () => {
    it('merges two flat objects', () => {
      const merged = deepMerge({ a: 1, b: 2 }, { b: 3, c: 4 });
      expect(merged).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('deeply merges nested objects', () => {
      const merged = deepMerge({ outer: { inner: 1, other: 2 } }, { outer: { inner: 10 } });
      expect(merged.outer).toEqual({ inner: 10, other: 2 });
    });

    it('replaces arrays (does not merge)', () => {
      const merged = deepMerge({ items: [1, 2] }, { items: [3, 4, 5] });
      expect(merged.items).toEqual([3, 4, 5]);
    });
  });

  describe('isPlainObject', () => {
    it('returns true for objects', () => expect(isPlainObject({})).toBe(true));
    it('returns false for arrays', () => expect(isPlainObject([])).toBe(false));
    it('returns false for null', () => expect(isPlainObject(null)).toBe(false));
    it('returns false for primitives', () => expect(isPlainObject(42)).toBe(false));
  });
});
