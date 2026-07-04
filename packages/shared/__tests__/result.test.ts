import { describe, it, expect } from 'vitest';
import {
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  unwrapOrElse,
  map,
  mapErr,
  andThen,
  tryCatch,
  tryCatchAsync,
  collect,
} from '../src/result/result.js';

describe('Result', () => {
  describe('ok / err', () => {
    it('creates an Ok result', () => {
      const r = ok(42);
      expect(r.ok).toBe(true);
      expect(r.value).toBe(42);
    });

    it('creates an Err result', () => {
      const r = err(new Error('fail'));
      expect(r.ok).toBe(false);
      expect(r.error.message).toBe('fail');
    });
  });

  describe('isOk / isErr', () => {
    it('isOk returns true for Ok', () => expect(isOk(ok(1))).toBe(true));
    it('isOk returns false for Err', () => expect(isOk(err('e'))).toBe(false));
    it('isErr returns true for Err', () => expect(isErr(err('e'))).toBe(true));
    it('isErr returns false for Ok', () => expect(isErr(ok(1))).toBe(false));
  });

  describe('unwrap', () => {
    it('returns value for Ok', () => expect(unwrap(ok(42))).toBe(42));
    it('throws for Err', () => expect(() => unwrap(err('e'))).toThrow());
  });

  describe('unwrapOr', () => {
    it('returns value for Ok', () => expect(unwrapOr(ok(42), 0)).toBe(42));
    it('returns default for Err', () => expect(unwrapOr(err('e'), 0)).toBe(0));
  });

  describe('unwrapOrElse', () => {
    it('returns value for Ok', () => expect(unwrapOrElse(ok(42), (e) => e.length)).toBe(42));
    it('computes from error for Err', () =>
      expect(unwrapOrElse(err('fail'), (e) => e.length)).toBe(4));
  });

  describe('map', () => {
    it('transforms Ok value', () => {
      const r = map(ok(42), (x) => x * 2);
      expect(isOk(r) && r.value).toBe(84);
    });
    it('passes through Err', () => {
      const r = map(err('e'), (x: number) => x * 2);
      expect(isErr(r)).toBe(true);
    });
  });

  describe('mapErr', () => {
    it('passes through Ok', () => expect(isOk(mapErr(ok(42), (e) => e.length))).toBe(true));
    it('transforms Err', () => {
      const r = mapErr(err('fail'), (e) => e.length);
      expect(isErr(r) && r.error).toBe(4);
    });
  });

  describe('andThen', () => {
    it('chains Ok results', () => {
      const r = andThen(ok(42), (x) => ok(x * 2));
      expect(isOk(r) && r.value).toBe(84);
    });
    it('short-circuits on Err', () => {
      const r = andThen(err('fail'), (x: number) => ok(x * 2));
      expect(isErr(r)).toBe(true);
    });
  });

  describe('tryCatch', () => {
    it('returns Ok for successful function', () => {
      const r = tryCatch(() => 42);
      expect(isOk(r) && r.value).toBe(42);
    });
    it('returns Err for throwing function', () => {
      const r = tryCatch(() => {
        throw new Error('fail');
      });
      expect(isErr(r)).toBe(true);
    });
  });

  describe('tryCatchAsync', () => {
    it('returns Ok for successful promise', async () => {
      const r = await tryCatchAsync(async () => 42);
      expect(isOk(r) && r.value).toBe(42);
    });
    it('returns Err for rejected promise', async () => {
      const r = await tryCatchAsync(async () => {
        throw new Error('fail');
      });
      expect(isErr(r)).toBe(true);
    });
  });

  describe('collect', () => {
    it('collects all Ok values', () => {
      const r = collect([ok(1), ok(2), ok(3)]);
      expect(isOk(r) && r.value).toEqual([1, 2, 3]);
    });
    it('returns first Err', () => {
      const r = collect([ok(1), err('fail'), ok(3)]);
      expect(isErr(r)).toBe(true);
    });
  });
});
