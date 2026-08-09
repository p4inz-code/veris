/**
 * Tests for theme system.
 *
 * @module @veris/cli/__tests__/ui
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_THEME,
  getResolvedTheme,
  getSeverityColor,
  getStatusColor,
  severityFromScore,
  resolveColor,
  resolveTheme,
  AnsiWriter,
  resetAnsiWriter,
  resetTerminalCache,
} from '../../src/ui/index.js';

describe('ThemeDefinition', () => {
  it('should have a default theme with all required fields', () => {
    expect(DEFAULT_THEME.name).toBe('veris-dark');
    expect(DEFAULT_THEME.version).toBe('1.0.0');
    expect(DEFAULT_THEME.severity).toBeDefined();
    expect(DEFAULT_THEME.severity.critical).toBeDefined();
    expect(DEFAULT_THEME.severity.high).toBeDefined();
    expect(DEFAULT_THEME.severity.medium).toBeDefined();
    expect(DEFAULT_THEME.severity.low).toBeDefined();
    expect(DEFAULT_THEME.severity.info).toBeDefined();
    expect(DEFAULT_THEME.status).toBeDefined();
    expect(DEFAULT_THEME.status.success).toBeDefined();
    expect(DEFAULT_THEME.status.warning).toBeDefined();
    expect(DEFAULT_THEME.status.error).toBeDefined();
    expect(DEFAULT_THEME.status.pending).toBeDefined();
    expect(DEFAULT_THEME.ui).toBeDefined();
    expect(DEFAULT_THEME.ui.brand).toBeDefined();
    expect(DEFAULT_THEME.ui.text).toBeDefined();
    expect(DEFAULT_THEME.ui.textDim).toBeDefined();
    expect(DEFAULT_THEME.ui.border).toBeDefined();
    expect(DEFAULT_THEME.ui.surface).toBeDefined();
  });
});

describe('resolveColor', () => {
  it('should resolve truecolor to a 24-bit ANSI escape', () => {
    const result = resolveColor(
      { truecolor: '#ef4444', ansi256: 196, ansi: '\x1b[31m' },
      'truecolor',
    );
    expect(result).toBe('\x1b[38;2;239;68;68m');
  });

  it('should resolve ANSI 256 color', () => {
    const result = resolveColor(
      { truecolor: '#ef4444', ansi256: 196, ansi: '\x1b[31m' },
      'ansi256',
    );
    expect(result).toContain('\x1b[38;5;196m');
  });

  it('should resolve ANSI 16 color', () => {
    const result = resolveColor({ truecolor: '#ef4444', ansi256: 196, ansi: '\x1b[31m' }, 'ansi');
    expect(result).toBe('\x1b[31m');
  });

  it('should resolve to empty string for no color', () => {
    const result = resolveColor({ truecolor: '#ef4444', ansi256: 196, ansi: '\x1b[31m' }, 'none');
    expect(result).toBe('');
  });
});

describe('resolveTheme', () => {
  it('should resolve a complete theme', () => {
    const resolved = resolveTheme(DEFAULT_THEME, 'truecolor');
    expect(resolved.name).toBe('veris-dark');
    expect(resolved.severity.critical).toBe('\x1b[38;2;239;68;68m');
    expect(resolved.status.success).toBe('\x1b[38;2;34;197;94m');
    expect(resolved.ui.brand).toBe('\x1b[38;2;0;212;170m');
    expect(resolved.ui.text).toBe('\x1b[38;2;229;231;235m');
  });

  it('should resolve at ansi256 depth', () => {
    const resolved = resolveTheme(DEFAULT_THEME, 'ansi256');
    expect(resolved.severity.critical).toContain('\x1b[38;5;');
  });
});

describe('getResolvedTheme', () => {
  it('should return a resolved theme', () => {
    const theme = getResolvedTheme();
    expect(theme.name).toBe('veris-dark');
    expect(theme.severity.critical).toBeTypeOf('string');
    expect(theme.status.success).toBeTypeOf('string');
  });
});

describe('getSeverityColor', () => {
  it('should return a string for each severity level', () => {
    expect(getSeverityColor('critical')).toBeTypeOf('string');
    expect(getSeverityColor('high')).toBeTypeOf('string');
    expect(getSeverityColor('medium')).toBeTypeOf('string');
    expect(getSeverityColor('low')).toBeTypeOf('string');
    expect(getSeverityColor('info')).toBeTypeOf('string');
  });
});

describe('getStatusColor', () => {
  it('should return a string for each status', () => {
    expect(getStatusColor('success')).toBeTypeOf('string');
    expect(getStatusColor('warning')).toBeTypeOf('string');
    expect(getStatusColor('error')).toBeTypeOf('string');
    expect(getStatusColor('pending')).toBeTypeOf('string');
  });
});

describe('severityFromScore', () => {
  it('should classify critical scores', () => {
    expect(severityFromScore(9.5)).toBe('critical');
    expect(severityFromScore(10.0)).toBe('critical');
  });

  it('should classify high scores', () => {
    expect(severityFromScore(7.5)).toBe('high');
    expect(severityFromScore(8.9)).toBe('high');
  });

  it('should classify medium scores', () => {
    expect(severityFromScore(5.0)).toBe('medium');
    expect(severityFromScore(6.0)).toBe('medium');
  });

  it('should classify low scores', () => {
    expect(severityFromScore(2.0)).toBe('low');
    expect(severityFromScore(3.0)).toBe('low');
  });

  it('should classify info scores', () => {
    expect(severityFromScore(0.5)).toBe('info');
    expect(severityFromScore(0.0)).toBe('info');
  });
});

describe('AnsiWriter', () => {
  it('should create a writer with color depth', () => {
    const writer = new AnsiWriter('truecolor');
    expect(writer.colorDepth).toBe('truecolor');
    expect(writer.supported).toBe(true);
  });

  it('should handle no-color mode', () => {
    const writer = new AnsiWriter('none');
    expect(writer.supported).toBe(false);
    expect(writer.bold('test')).toBe('test');
    expect(writer.style('test', '1')).toBe('test');
  });

  it('should wrap text in ANSI codes', () => {
    const writer = new AnsiWriter('ansi');
    const result = writer.style('test', '1');
    expect(result).toContain('test');
    expect(result).toContain('\x1b[');
    expect(result).toContain('0m');
  });

  it('should apply bold formatting', () => {
    const writer = new AnsiWriter('ansi');
    const result = writer.bold('test');
    expect(result).toContain('test');
    expect(result).toContain('\x1b[1m');
  });

  it('should apply dim formatting', () => {
    const writer = new AnsiWriter('ansi');
    const result = writer.dim('test');
    expect(result).toContain('\x1b[2m');
  });

  it('should apply underline formatting', () => {
    const writer = new AnsiWriter('ansi');
    const result = writer.underline('test');
    expect(result).toContain('\x1b[4m');
  });
});
