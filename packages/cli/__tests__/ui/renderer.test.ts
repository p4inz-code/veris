/**
 * Tests for renderer/symbol system.
 *
 * @module @veris/cli/__tests__/ui
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { getSymbolSet, setSymbolSet, resetSymbolSet, symbol } from '../../src/ui/index.js';

describe('SymbolSet', () => {
  beforeEach(() => {
    resetSymbolSet();
  });

  it('should provide Unicode symbols by default', () => {
    setSymbolSet('unicode');
    const sym = getSymbolSet();
    expect(sym.file).toBeTruthy();
    expect(sym.directory).toBeTruthy();
    expect(sym.critical).toContain('\u{1F534}');
    expect(sym.success).toContain('\u2705');
    expect(sym.hLine).toBe('\u2500');
  });

  it('should provide ASCII fallback symbols', () => {
    setSymbolSet('ascii');
    const sym = getSymbolSet();
    expect(sym.file).toBe('[FILE]');
    expect(sym.directory).toBe('[DIR] ');
    expect(sym.critical).toBe('[CRIT]');
    expect(sym.success).toBe('[OK]  ');
    expect(sym.hLine).toBe('-');
  });

  it('should provide spinner frames', () => {
    setSymbolSet('ascii');
    const sym = getSymbolSet();
    expect(sym.spinner.length).toBeGreaterThan(0);
    expect(sym.spinner).toContain('|');
    expect(sym.spinner).toContain('/');
  });

  it('should provide Unicode spinner frames', () => {
    setSymbolSet('unicode');
    const sym = getSymbolSet();
    expect(sym.spinner.length).toBeGreaterThan(0);
  });

  it('should provide chart symbols', () => {
    setSymbolSet('ascii');
    const sym = getSymbolSet();
    expect(sym.chartFull).toBe('#');
    expect(sym.chartEmpty).toBe('-');
  });
});

describe('symbol()', () => {
  it('should return a single symbol', () => {
    const s = symbol('success');
    expect(s).toBeTypeOf('string');
    expect(s.length).toBeGreaterThan(0);
  });

  it('should return different values for unicode vs ascii', () => {
    setSymbolSet('unicode');
    const unicodeCheck = symbol('check');
    setSymbolSet('ascii');
    const asciiCheck = symbol('check');
    expect(unicodeCheck).not.toBe(asciiCheck);
  });
});
