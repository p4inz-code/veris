/**
 * Tests for utility functions.
 *
 * @module @veris/cli/__tests__/ui
 */

import { describe, it, expect } from 'vitest';
import {
  truncate,
  truncateStart,
  truncateMiddle,
  wrapText,
  wrapParagraphs,
  alignText,
  padLeft,
  padRight,
  padCenter,
} from '../../src/ui/index.js';

describe('truncate', () => {
  it('should not truncate short strings', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('should truncate long strings with ellipsis', () => {
    const result = truncate('hello world', 8);
    expect(result).toBe('hello w…');
    expect(result.length).toBe(8);
  });

  it('should not modify strings at exact length', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });
});

describe('truncateStart', () => {
  it('should truncate at the start', () => {
    const result = truncateStart('hello world', 10);
    expect(result).toBe('…llo world');
    expect(result.length).toBe(10);
  });

  it('should not truncate short strings', () => {
    expect(truncateStart('hello', 10)).toBe('hello');
  });
});

describe('truncateMiddle', () => {
  it('should truncate in the middle', () => {
    const result = truncateMiddle('abcdefghijklmnopqrstuvwxyz', 20);
    expect(result.length).toBe(20);
    expect(result).toBe('abcdefghi…qrstuvwxyz');
  });
});

describe('wrapText', () => {
  it('should not wrap short text', () => {
    const lines = wrapText('hello', 10);
    expect(lines).toEqual(['hello']);
  });

  it('should wrap at word boundaries', () => {
    const lines = wrapText('hello world foo bar', 10);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0].length).toBeLessThanOrEqual(10);
  });

  it('should indent wrapped lines', () => {
    const lines = wrapText('hello world foo bar', 10, '>');
    expect(lines.every((l) => l.startsWith('>'))).toBe(true);
  });

  it('should handle empty text', () => {
    const lines = wrapText('', 10);
    expect(lines).toEqual(['']);
  });
});

describe('wrapParagraphs', () => {
  it('should handle single paragraph', () => {
    const lines = wrapParagraphs('hello world', 10);
    expect(lines.length).toBeGreaterThan(0);
  });

  it('should handle multiple paragraphs', () => {
    const lines = wrapParagraphs('first paragraph.\n\nsecond paragraph.', 20);
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });
});

describe('alignText', () => {
  it('should left-align text', () => {
    const result = alignText('hello', 10, 'left');
    expect(result).toBe('hello     ');
  });

  it('should right-align text', () => {
    const result = alignText('hello', 10, 'right');
    expect(result).toBe('     hello');
  });

  it('should center-align text', () => {
    const result = alignText('hello', 11, 'center');
    expect(result).toBe('   hello   ');
  });
});

describe('padLeft', () => {
  it('should pad to the left', () => {
    expect(padLeft('hello', 8)).toBe('hello   ');
  });
});

describe('padRight', () => {
  it('should pad to the right', () => {
    expect(padRight('hello', 8)).toBe('   hello');
  });
});

describe('padCenter', () => {
  it('should center pad', () => {
    const result = padCenter('hello', 9);
    expect(result).toBe('  hello  ');
  });
});
