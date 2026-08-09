/**
 * Tests for terminal capability detection.
 *
 * @module @veris/cli/__tests__/ui
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectTerminal,
  isInteractive,
  resetTerminalCache,
  hasCapability,
  contentWidth,
  contentHeight,
} from '../../src/ui/index.js';

describe('TerminalCapabilities', () => {
  beforeEach(() => {
    resetTerminalCache();
  });

  it('should detect a basic set of capabilities', () => {
    const caps = detectTerminal();
    expect(caps).toBeDefined();
    expect(typeof caps.width).toBe('number');
    expect(typeof caps.height).toBe('number');
    expect(caps.width).toBeGreaterThan(0);
    expect(caps.height).toBeGreaterThan(0);
    expect(caps.isWindows).toBeTypeOf('boolean');
    expect(caps.isTty).toBeTypeOf('boolean');
    expect(caps.isCi).toBeTypeOf('boolean');
    expect(caps.colorDepth).toBeTypeOf('string');
    expect(caps.unicode).toBeTypeOf('boolean');
    expect(caps.nodeVersion).toBeInstanceOf(Array);
  });

  it('should detect color depth as one of the valid values', () => {
    const caps = detectTerminal();
    const validDepths = ['none', 'ansi', 'ansi256', 'truecolor'];
    expect(validDepths).toContain(caps.colorDepth);
  });

  it('should detect terminal emulator', () => {
    const caps = detectTerminal();
    const validEmulators = [
      'windows-terminal',
      'vscode',
      'iterm2',
      'kitty',
      'alacritty',
      'wezterm',
      'ghostty',
      'tmux',
      'screen',
      'xterm',
      'unknown',
    ];
    expect(validEmulators).toContain(caps.emulator);
  });

  it('should detect CI environment', () => {
    const caps = detectTerminal();
    const validCis = [
      'github-actions',
      'gitlab-ci',
      'circle-ci',
      'jenkins',
      'azure-devops',
      'none',
    ];
    expect(validCis).toContain(caps.ciEnvironment);
  });

  it('should detect Node.js version', () => {
    const caps = detectTerminal();
    expect(caps.nodeVersion[0]).toBeGreaterThanOrEqual(18);
    expect(caps.nodeVersion[1]).toBeGreaterThanOrEqual(0);
  });

  it('should detect prefersReducedMotion', () => {
    const caps = detectTerminal();
    expect(caps.prefersReducedMotion).toBeTypeOf('boolean');
  });

  it('should detect isVsCode', () => {
    const caps = detectTerminal();
    expect(caps.isVsCode).toBeTypeOf('boolean');
  });
});

describe('isInteractive', () => {
  it('should return a boolean', () => {
    const result = isInteractive();
    expect(result).toBeTypeOf('boolean');
  });
});

describe('hasCapability', () => {
  it('should check color support', () => {
    const caps = detectTerminal();
    const result = hasCapability(caps, { color: true });
    expect(result).toBeTypeOf('boolean');
  });

  it('should check truecolor support', () => {
    const caps = detectTerminal();
    const result = hasCapability(caps, { truecolor: true });
    expect(result).toBeTypeOf('boolean');
  });

  it('should check unicode support', () => {
    const caps = detectTerminal();
    const result = hasCapability(caps, { unicode: true });
    expect(result).toBeTypeOf('boolean');
  });

  it('should check interactive support', () => {
    const caps = detectTerminal();
    const result = hasCapability(caps, { interactive: true });
    expect(result).toBeTypeOf('boolean');
  });
});

describe('contentWidth / contentHeight', () => {
  it('should return a positive integer', () => {
    expect(contentWidth()).toBeGreaterThan(0);
    expect(contentHeight()).toBeGreaterThan(0);
  });

  it('should respect padding', () => {
    const caps = detectTerminal();
    const withoutPadding = contentWidth(caps, 0);
    const withPadding = contentWidth(caps, 10);
    expect(withPadding).toBe(withoutPadding - 10);
  });
});
