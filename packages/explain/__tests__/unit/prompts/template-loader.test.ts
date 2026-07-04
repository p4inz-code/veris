/**
 * Tests for M4 — Template loader with security path validation.
 *
 * @module @veris/explain/__tests__/unit/prompts/template-loader.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TemplateLoader } from '../../../src/prompts/template-loader.js';

describe('TemplateLoader', () => {
  let loader: TemplateLoader;

  beforeEach(() => {
    loader = new TemplateLoader({ noCache: true });
  });

  it('loads a shipped template', () => {
    // The shipped templates are in packages/explain/prompts/
    const parsed = loader.load('finding-explain-system-v1');
    expect(parsed.frontmatter).toBeDefined();
    expect(parsed.frontmatter.id).toBeTruthy();
  });

  it('loads a finding template', () => {
    const parsed = loader.load('finding-explain-v1');
    expect(parsed.frontmatter).toBeDefined();
    expect(parsed.frontmatter.type).toBe('context');
  });

  it('throws for non-existent template', () => {
    expect(() => loader.load('non-existent-template')).toThrow();
  });

  it('checks template existence', () => {
    expect(loader.exists('finding-explain-system-v1')).toBe(true);
    expect(loader.exists('non-existent')).toBe(false);
  });

  it('caches loaded templates', () => {
    const loader2 = new TemplateLoader({ noCache: false });
    const first = loader2.load('finding-explain-system-v1');
    const second = loader2.load('finding-explain-system-v1');
    expect(first.frontmatter.id).toBe(second.frontmatter.id);
    expect(first.content).toBe(second.content);
  });

  it('invalidates cache for specific template', () => {
    const testLoader = new TemplateLoader({ noCache: false });
    testLoader.load('finding-explain-system-v1');
    testLoader.invalidateCache('finding-explain-system-v1');
    // Should be able to reload (no crash)
    const reloaded = testLoader.load('finding-explain-system-v1');
    expect(reloaded.frontmatter.id).toBe('finding-explain-system-v1');
  });

  it('clears all cache on invalidateCache with no args', () => {
    const testLoader = new TemplateLoader({ noCache: false });
    testLoader.load('finding-explain-system-v1');
    testLoader.invalidateCache();
    const reloaded = testLoader.load('finding-explain-system-v1');
    expect(reloaded.frontmatter).toBeDefined();
  });

  it('validates all shipped templates load correctly', () => {
    const names = [
      'finding-explain-system-v1',
      'finding-explain-v1',
      'chain-explain-system-v1',
      'report-summary-system-v1',
      'risk-explain-system-v1',
      'validation-system-v1',
    ];
    for (const name of names) {
      expect(() => loader.load(name)).not.toThrow();
    }
  });
});
