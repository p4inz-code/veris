/**
 * Tests for help renderer.
 *
 * @module @veris/cli/__tests__/ui
 */

import { describe, it, expect } from 'vitest';
import {
  renderHelpPage,
  renderUsageHint,
  resetSymbolSet,
  setSymbolSet,
} from '../../src/ui/index.js';

describe('HelpRenderer', () => {
  beforeEach(() => {
    setSymbolSet('ascii');
  });

  afterAll(() => {
    resetSymbolSet();
  });

  it('should render a complete help page', () => {
    const result = renderHelpPage({
      title: 'Test Command',
      description: 'A test command for testing',
      usage: ['veris test [options]'],
      arguments: [
        { name: 'input', description: 'Input file path', required: true },
        { name: 'output', description: 'Output file path', default: './out' },
      ],
      options: [
        { flags: '--verbose', description: 'Enable verbose output' },
        { flags: '--format <fmt>', description: 'Output format', default: 'json' },
      ],
      examples: [
        { command: 'veris test input.txt', description: 'Test a file' },
        { command: 'veris test input.txt --format html', description: 'Test with HTML output' },
      ],
      exitCodes: [
        { code: 0, description: 'Success' },
        { code: 1, description: 'General error' },
      ],
      notes: ['This is a test command.'],
      seeAlso: ['veris scan', 'veris report'],
    });

    expect(result).toContain('Test Command');
    expect(result).toContain('A test command for testing');
    expect(result).toContain('veris test [options]');
    expect(result).toContain('Input file path');
    expect(result).toContain('Output file path');
    expect(result).toContain('--verbose');
    expect(result).toContain('--format <fmt>');
    expect(result).toContain('0');
    expect(result).toContain('Success');
    expect(result).toContain('veris scan');
  });

  it('should render minimum help page', () => {
    const result = renderHelpPage({
      title: 'Minimal',
      description: 'A minimal help page',
    });
    expect(result).toContain('Minimal');
    expect(result).toContain('A minimal help page');
  });

  it('should render empty options gracefully', () => {
    const result = renderHelpPage({
      title: 'Empty',
      description: 'No options test',
      options: [],
    });
    expect(result).toContain('Empty');
  });
});

describe('renderUsageHint', () => {
  it('should render a usage hint', () => {
    const result = renderUsageHint('veris test', '<input> [options]');
    expect(result).toContain('veris test');
    expect(result).toContain('<input> [options]');
  });
});
