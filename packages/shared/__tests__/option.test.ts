import { describe, it, expect } from 'vitest';
import {
  some,
  none,
  fromNullable,
  isSome,
  isNone,
  unwrap,
  unwrapOr,
  map,
  tap,
} from '../src/types/option.js';

describe('Option', () => {
  describe('some / none', () => {
    it('creates Some with a value', () => {
      const opt = some(42);
      expect(isSome(opt)).toBe(true);
      expect(opt.value).toBe(42);
    });

    it('creates None', () => {
      const opt = none();
      expect(isNone(opt)).toBe(true);
    });
  });

  describe('fromNullable', () => {
    it('creates Some for non-null value', () => expect(isSome(fromNullable(42))).toBe(true));
    it('creates None for null', () => expect(isNone(fromNullable(null))).toBe(true));
    it('creates None for undefined', () => expect(isNone(fromNullable(undefined))).toBe(true));
  });

  describe('isSome / isNone', () => {
    it('isSome returns true for Some', () => expect(isSome(some(1))).toBe(true));
    it('isSome returns false for None', () => expect(isSome(none())).toBe(false));
    it('isNone returns true for None', () => expect(isNone(none())).toBe(true));
    it('isNone returns false for Some', () => expect(isNone(some(1))).toBe(false));
  });

  describe('unwrap', () => {
    it('returns value for Some', () => expect(unwrap(some(42))).toBe(42));
    it('throws for None', () => expect(() => unwrap(none())).toThrow());
  });

  describe('unwrapOr', () => {
    it('returns value for Some', () => expect(unwrapOr(some(42), 0)).toBe(42));
    it('returns default for None', () => expect(unwrapOr(none(), 0)).toBe(0));
  });

  describe('map', () => {
    it('transforms Some value', () => {
      const opt = map(some(21), (x) => x * 2);
      expect(isSome(opt) && opt.value).toBe(42);
    });
    it('passes through None', () => {
      const opt = map(none(), (x: number) => x * 2);
      expect(isNone(opt)).toBe(true);
    });
  });

  describe('tap', () => {
    it('applies side effect for Some', () => {
      let called = false;
      tap(some(42), (val) => {
        called = true;
        expect(val).toBe(42);
      });
      expect(called).toBe(true);
    });
    it('does not apply side effect for None', () => {
      let called = false;
      tap(none(), () => {
        called = true;
      });
      expect(called).toBe(false);
    });
  });
});
