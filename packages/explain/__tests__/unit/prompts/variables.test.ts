/**
 * Tests for M4 — Variable extraction, validation, and missing-variable detection.
 *
 * @module @veris/explain/__tests__/unit/prompts/variables.test
 */

import { describe, it, expect } from 'vitest';
import {
  extractVariables,
  validateVariables,
  detectMissingVariables,
} from '../../../src/prompts/variables.js';

describe('extractVariables', () => {
  it('extracts simple variables', () => {
    const vars = extractVariables('Hello, {{name}}!');
    expect(vars.length).toBeGreaterThanOrEqual(1);
    expect(vars[0]?.path).toBe('name');
  });

  it('extracts dot-path variables', () => {
    const vars = extractVariables('{{finding.title}} has severity {{finding.severity.level}}');
    const paths = vars.map((v) => v.path);
    expect(paths).toContain('finding.title');
    expect(paths).toContain('finding.severity.level');
  });

  it('extracts root names from dot-paths', () => {
    const vars = extractVariables('{{finding.title}}');
    expect(vars[0]?.root).toBe('finding');
  });

  it('does not extract block helpers as variables', () => {
    const vars = extractVariables('{{#each evidence}}{{this.id}}{{/each}}');
    const paths = vars.map((v) => v.path);
    expect(paths).not.toContain('#each');
    expect(paths).not.toContain('/each');
  });

  it('does not extract helper invocations', () => {
    const vars = extractVariables('{{severity-label finding.severity.level}}');
    const paths = vars.map((v) => v.path);
    // "severity-label" with the parenthesized argument should be skipped by regex
    expect(paths).toContain('finding.severity.level');
  });

  it('handles empty content', () => {
    const vars = extractVariables('');
    expect(vars).toEqual([]);
  });

  it('extracts variables from complex template', () => {
    const template = `{{finding.title}} with {{evidence.length}} matches.
{{#each evidence}}
### Match {{@index}}
- Location: {{this.sourceLocation.path}}
{{/each}}`;
    const vars = extractVariables(template);
    const paths = vars.map((v) => v.path);
    expect(paths).toContain('finding.title');
    expect(paths).toContain('evidence.length');
    expect(paths).toContain('this.sourceLocation.path');
  });
});

describe('validateVariables', () => {
  it('returns valid for template with valid keys', () => {
    const result = validateVariables('{{finding.title}}', new Set(['finding']));
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('returns missing for template with unknown keys', () => {
    const result = validateVariables('{{nonexistent.field}}', new Set(['finding']));
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('nonexistent.field');
  });

  it('returns warnings for unused context keys', () => {
    const result = validateVariables('{{finding.title}}', new Set(['finding', 'evidence', 'rule']));
    expect(result.warnings.length).toBeGreaterThanOrEqual(2);
    expect(result.warnings.some((w) => w.includes('evidence'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('rule'))).toBe(true);
  });

  it('handles empty template', () => {
    const result = validateVariables('', new Set(['finding']));
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('uses default valid keys when none provided', () => {
    const result = validateVariables('{{finding.title}} {{evidence.length}}');
    expect(result.valid).toBe(true);
  });
});

describe('detectMissingVariables', () => {
  it('detects unreplaced variables', () => {
    const missing = detectMissingVariables('Hello, {{name}}!');
    expect(missing).toContain('{{name}}');
  });

  it('returns empty for fully rendered output', () => {
    const missing = detectMissingVariables('Hello, World!');
    expect(missing).toEqual([]);
  });

  it('detects multiple unreplaced variables', () => {
    const missing = detectMissingVariables('{{a}} and {{b}} and {{c}}');
    expect(missing.length).toBeGreaterThanOrEqual(3);
  });

  it('ignores block markers', () => {
    const missing = detectMissingVariables('{{#each items}}{{/each}}');
    expect(missing).toEqual([]);
  });
});
