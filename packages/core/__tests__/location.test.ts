import { describe, it, expect } from 'vitest';
import { createSourceLocation } from '../src/types/location.js';

describe('SourceLocation', () => {
  it('creates a location with valid coordinates', () => {
    const loc = createSourceLocation({
      startLine: 1,
      startColumn: 0,
      endLine: 1,
      endColumn: 10,
      offset: 0,
      length: 10,
    });
    expect(loc.startLine).toBe(1);
    expect(loc.startColumn).toBe(0);
    expect(loc.endLine).toBe(1);
    expect(loc.endColumn).toBe(10);
    expect(loc.offset).toBe(0);
    expect(loc.length).toBe(10);
  });

  it('supports context snippet', () => {
    const loc = createSourceLocation({
      startLine: 1,
      startColumn: 0,
      endLine: 1,
      endColumn: 5,
      offset: 0,
      length: 5,
      context: 'hello',
    });
    expect(loc.context).toBe('hello');
  });

  it('throws on startLine < 1', () => {
    expect(() =>
      createSourceLocation({
        startLine: 0,
        startColumn: 0,
        endLine: 1,
        endColumn: 5,
        offset: 0,
        length: 5,
      }),
    ).toThrow();
  });

  it('throws on endLine < startLine', () => {
    expect(() =>
      createSourceLocation({
        startLine: 5,
        startColumn: 0,
        endLine: 3,
        endColumn: 5,
        offset: 0,
        length: 5,
      }),
    ).toThrow();
  });

  it('throws on negative offset', () => {
    expect(() =>
      createSourceLocation({
        startLine: 1,
        startColumn: 0,
        endLine: 1,
        endColumn: 5,
        offset: -1,
        length: 5,
      }),
    ).toThrow();
  });

  it('throws on negative length', () => {
    expect(() =>
      createSourceLocation({
        startLine: 1,
        startColumn: 0,
        endLine: 1,
        endColumn: 5,
        offset: 0,
        length: -1,
      }),
    ).toThrow();
  });
});
