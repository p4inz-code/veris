/**
 * Tests for M4 — Built-in Handlebars helpers.
 *
 * @module @veris/explain/__tests__/unit/prompts/helpers.test
 */

import { describe, it, expect } from 'vitest';
import { createBuiltinHelpers } from '../../../src/prompts/helpers.js';

const helpers = createBuiltinHelpers();

describe('severity-label', () => {
  const fn = helpers['severity-label'] as (level: string) => string;

  it('maps valid severity levels', () => {
    expect(fn('critical')).toBe('Critical');
    expect(fn('high')).toBe('High');
    expect(fn('medium')).toBe('Medium');
    expect(fn('low')).toBe('Low');
    expect(fn('negligible')).toBe('Negligible');
  });

  it('passes through unknown levels unrecognized by the label map', () => {
    // Unknown level passes through as-is
    expect(fn('unknown')).toBe('unknown');
    // Case variations are normalized via toLowerCase — "CRITICAL" maps to existing key
    expect(fn('CRITICAL')).toBe('Critical');
  });
});

describe('format-confidence', () => {
  const fn = helpers['format-confidence'] as (confidence: number) => string;

  it('formats as percentage', () => {
    expect(fn(0.95)).toBe('95%');
    expect(fn(1.0)).toBe('100%');
    expect(fn(0.0)).toBe('0%');
  });

  it('handles non-numbers', () => {
    expect(fn(undefined as unknown as number)).toBe('0%');
  });
});

describe('format-score', () => {
  const fn = helpers['format-score'] as (score: number) => string;

  it('formats to one decimal place', () => {
    expect(fn(9.5)).toBe('9.5');
    expect(fn(7.0)).toBe('7.0');
    expect(fn(5)).toBe('5.0');
  });
});

describe('eq', () => {
  const fn = helpers.eq as (a: unknown, b: unknown) => boolean;

  it('returns true for equal values', () => {
    expect(fn(1, 1)).toBe(true);
    expect(fn('a', 'a')).toBe(true);
  });

  it('returns false for unequal values', () => {
    expect(fn(1, 2)).toBe(false);
    expect(fn('a', 'b')).toBe(false);
  });
});

describe('gt', () => {
  const fn = helpers.gt as (a: number, b: number) => boolean;

  it('returns true when a > b', () => {
    expect(fn(5, 3)).toBe(true);
  });

  it('returns false when a <= b', () => {
    expect(fn(3, 5)).toBe(false);
    expect(fn(5, 5)).toBe(false);
  });
});

describe('lt', () => {
  const fn = helpers.lt as (a: number, b: number) => boolean;

  it('returns true when a < b', () => {
    expect(fn(3, 5)).toBe(true);
  });
});

describe('and / or / not', () => {
  it('and returns logical AND', () => {
    expect(helpers.and(true, true)).toBe(true);
    expect(helpers.and(true, false)).toBe(false);
  });

  it('or returns logical OR', () => {
    expect(helpers.or(true, false)).toBe(true);
    expect(helpers.or(false, false)).toBe(false);
  });

  it('not returns logical NOT', () => {
    expect(helpers.not(true)).toBe(false);
    expect(helpers.not(false)).toBe(true);
  });
});

describe('json', () => {
  const fn = helpers.json as (value: unknown) => string;

  it('serializes objects to JSON', () => {
    const result = fn({ a: 1, b: 'hello' });
    expect(result).toContain('"a"');
    expect(result).toContain('hello');
  });
});

describe('pluralize', () => {
  const fn = helpers.pluralize as (count: number, singular: string, plural?: string) => string;

  it('returns singular for count 1', () => {
    expect(fn(1, 'finding')).toBe('1 finding');
  });

  it('returns plural for count != 1', () => {
    expect(fn(0, 'finding')).toBe('0 findings');
    expect(fn(3, 'finding')).toBe('3 findings');
  });

  it('uses custom plural if provided', () => {
    expect(fn(2, 'child', 'children')).toBe('2 children');
  });
});

describe('concat', () => {
  it('concatenates values', () => {
    // The Handlebars options object is appended as last arg, so pass it
    const fn = helpers.concat as (...args: unknown[]) => string;
    const result = fn('hello', ' ', 'world', {} as Record<string, unknown>);
    expect(result).toBe('hello world');
  });
});
