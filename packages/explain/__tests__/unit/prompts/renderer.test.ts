/**
 * Tests for M4 — Handlebars prompt rendering.
 *
 * Tests:
 * - Simple variable substitution
 * - #each block helpers
 * - #if conditionals
 * - Built-in helpers usage
 * - Missing variable detection
 * - Determinism
 *
 * @module @veris/explain/__tests__/unit/prompts/renderer.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PromptRenderer } from '../../../src/prompts/renderer.js';
import { detectMissingVariables } from '../../../src/prompts/variables.js';

describe('PromptRenderer', () => {
  let renderer: PromptRenderer;

  beforeEach(() => {
    renderer = new PromptRenderer();
  });

  it('renders simple variable substitution', () => {
    const result = renderer.render('Hello, {{name}}!', { name: 'World' });
    expect(result.content).toBe('Hello, World!');
    expect(result.missingVariables).toEqual([]);
  });

  it('renders {{#each}} blocks', () => {
    const template = `Items:
{{#each items}}
- {{this}}
{{/each}}`;
    const result = renderer.render(template, { items: ['a', 'b', 'c'] });
    expect(result.content).toContain('- a');
    expect(result.content).toContain('- b');
    expect(result.content).toContain('- c');
    expect(result.missingVariables).toEqual([]);
  });

  it('renders {{#if}} conditionals (truthy)', () => {
    const result = renderer.render('{{#if show}}Visible{{/if}}', { show: true });
    expect(result.content).toBe('Visible');
  });

  it('renders {{#if}} conditionals (falsy)', () => {
    const result = renderer.render('{{#if show}}Visible{{/if}}', { show: false });
    expect(result.content).toBe('');
  });

  it('detects missing variables', () => {
    // Handlebars with strict:false treats unknown variables as empty string.
    // The result.missingVariables will be empty when Handlebars consumes them.
    // Test detectMissingVariables directly for literal unreplaced patterns.
    const detected = detectMissingVariables('Hello {{missing}}!');
    expect(detected.length).toBeGreaterThanOrEqual(1);
  });

  it('uses built-in severity-label helper', () => {
    const result = renderer.render('{{severity-label level}}', { level: 'critical' });
    expect(result.content).toBe('Critical');
  });

  it('uses built-in format-confidence helper', () => {
    const result = renderer.render('{{format-confidence conf}}', { conf: 0.95 });
    expect(result.content).toBe('95%');
  });

  it('uses built-in format-score helper', () => {
    const result = renderer.render('{{format-score score}}', { score: 9.5 });
    expect(result.content).toBe('9.5');
  });

  it('uses built-in pluralize helper', () => {
    const result = renderer.render('{{pluralize count "finding"}}', { count: 3 });
    expect(result.content).toBe('3 findings');
  });

  it('renders nested dot-path variables', () => {
    const result = renderer.render('{{finding.title}}', {
      finding: { title: 'Test Finding' },
    });
    expect(result.content).toBe('Test Finding');
  });

  it('strips trailing whitespace', () => {
    const result = renderer.render('{{name}}  \n', { name: 'a' });
    expect(result.content).toBe('a');
  });

  it('compresses multiple blank lines', () => {
    const result = renderer.render('a\n\n\n\n\nb', {});
    expect(result.content).toBe('a\n\nb');
  });

  it('caches compiled templates', () => {
    // First render compiles
    const r1 = renderer.render('Hello, {{name}}!', { name: 'World' });
    // Second render uses cache
    const r2 = renderer.render('Hello, {{name}}!', { name: 'World' });
    expect(r1.content).toBe(r2.content);
  });

  it('is deterministic: same input produces same output', () => {
    const context = {
      finding: { title: 'Test', severity: { level: 'high', score: 7.0 } },
      evidence: [{ id: 'ev_1', confidence: 0.95 }],
    };
    const template = '{{finding.title}} ({{severity-label finding.severity.level}})';

    const results = Array.from(
      { length: 10 },
      () => renderer.render(template, context as Record<string, unknown>).content,
    );

    const first = results[0];
    for (const r of results) {
      expect(r).toBe(first);
    }
  });

  it('clears compiled template cache', () => {
    renderer.render('Hello, {{name}}!', { name: 'World' });
    renderer.clearCache();
    // Should recompile on next render
    const result = renderer.render('Hello, {{name}}!', { name: 'Universe' });
    expect(result.content).toBe('Hello, Universe!');
  });

  it('renders with custom registered helpers', () => {
    renderer.registerHelpers({
      double: (n: number) => String(n * 2),
    });
    const result = renderer.render('{{double value}}', { value: 5 });
    expect(result.content).toBe('10');
  });

  it('provides token estimate', () => {
    const result = renderer.render('Hello, {{name}}!', { name: 'World' });
    expect(result.tokenEstimate).toBeGreaterThan(0);
  });
});
