/**
 * Tests for compatibility flags.
 *
 * @module @veris/cli/__tests__/ui
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseCompatibilityFlags,
  COMPATIBILITY_FLAGS,
  resetTerminalCache,
} from '../../src/ui/index.js';

describe('CompatibilityFlags', () => {
  beforeEach(() => {
    delete process.env.VERIS_COLOR;
    delete process.env.NO_COLOR;
    delete process.env.VERIS_UNICODE;
    delete process.env.VERIS_NO_ANIMATION;
    resetTerminalCache();
  });

  it('should parse --no-color flag', () => {
    const args = ['scan', '--no-color', 'some/path'];
    const result = parseCompatibilityFlags(args);
    expect(result.noColor).toBe(true);
    expect(result.noUnicode).toBe(false);
    expect(result.noAnimation).toBe(false);
    // Should have removed the flag from args
    expect(args).not.toContain('--no-color');
    expect(args).toContain('scan');
    expect(args).toContain('some/path');
  });

  it('should parse --no-unicode flag', () => {
    const args = ['scan', '--no-unicode'];
    const result = parseCompatibilityFlags(args);
    expect(result.noUnicode).toBe(true);
    expect(process.env.VERIS_UNICODE).toBe('0');
  });

  it('should parse --no-animation flag', () => {
    const args = ['--no-animation', 'scan'];
    const result = parseCompatibilityFlags(args);
    expect(result.noAnimation).toBe(true);
  });

  it('should parse all flags together', () => {
    const args = ['--no-color', '--no-unicode', '--no-animation', 'scan'];
    const result = parseCompatibilityFlags(args);
    expect(result.noColor).toBe(true);
    expect(result.noUnicode).toBe(true);
    expect(result.noAnimation).toBe(true);
    expect(args).toEqual(['scan']);
  });

  it('should handle no flags', () => {
    const args = ['scan', '--help'];
    const result = parseCompatibilityFlags(args);
    expect(result.noColor).toBe(false);
    expect(result.noUnicode).toBe(false);
    expect(result.noAnimation).toBe(false);
    expect(args).toEqual(['scan', '--help']);
  });

  it('should handle empty args', () => {
    const args: string[] = [];
    const result = parseCompatibilityFlags(args);
    expect(result.noColor).toBe(false);
    expect(result.noUnicode).toBe(false);
    expect(result.noAnimation).toBe(false);
    expect(args).toEqual([]);
  });

  it('should list COMPATIBILITY_FLAGS', () => {
    expect(COMPATIBILITY_FLAGS).toContain('--no-color');
    expect(COMPATIBILITY_FLAGS).toContain('--no-unicode');
    expect(COMPATIBILITY_FLAGS).toContain('--no-animation');
  });
});
