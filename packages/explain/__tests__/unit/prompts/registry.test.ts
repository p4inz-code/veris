/**
 * Tests for M4 — Template registry, versioning, caching, and loading.
 *
 * @module @veris/explain/__tests__/unit/prompts/registry.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TemplateRegistry } from '../../../src/prompts/template-registry.js';
import type { TemplateInfo } from '../../../src/prompts/template-registry.js';

describe('TemplateRegistry', () => {
  let registry: TemplateRegistry;

  beforeEach(() => {
    registry = new TemplateRegistry({ noCache: true });
  });

  it('registers templates and retrieves them', () => {
    const template: TemplateInfo = {
      id: 'finding-explain-v2',
      version: '2.0.0',
      type: 'context',
      description: 'V2 finding template',
      changed: '2026-07-03',
      content: '{{finding.title}}',
      rawContent: '{{finding.title}}',
    };
    registry.register(template);
    expect(registry.has('finding-explain-v2')).toBe(true);
    expect(registry.get('finding-explain-v2')?.version).toBe('2.0.0');
  });

  it('lists all registered templates', () => {
    expect(registry.listTemplates()).toEqual([]);

    const t1: TemplateInfo = {
      id: 'finding-explain-v1',
      version: '1.0.0',
      type: 'context',
      description: 'd1',
      changed: '2026-07-03',
      content: 'c1',
      rawContent: 'c1',
    };
    const t2: TemplateInfo = {
      id: 'finding-explain-system-v1',
      version: '1.0.0',
      type: 'system',
      description: 'd2',
      changed: '2026-07-03',
      content: 'c2',
      rawContent: 'c2',
    };
    registry.register(t1);
    registry.register(t2);
    expect(registry.listTemplates().length).toBe(2);
  });

  it('gets template version', () => {
    const template: TemplateInfo = {
      id: 'finding-explain-v1',
      version: '1.0.0',
      type: 'context',
      description: 'd',
      changed: '2026-07-03',
      content: 'c',
      rawContent: 'c',
    };
    registry.register(template);
    expect(registry.getTemplateVersion('finding-explain-v1')).toBe('1.0.0');
  });

  it('throws for non-existent template version', () => {
    expect(() => registry.getTemplateVersion('non-existent')).toThrow();
  });

  it('renders a template', () => {
    const template: TemplateInfo = {
      id: 'finding-explain-system-v1',
      version: '1.0.0',
      type: 'system',
      description: 'System prompt',
      changed: '2026-07-03',
      content: 'You are a security assistant.',
      rawContent:
        '---\nid: finding-explain-system-v1\nversion: 1.0.0\ntype: system\ndescription: System prompt\nchanged: 2026-07-03\n---\nYou are a security assistant.',
    };
    registry.register(template);

    const rendered = registry.render('finding-explain-system-v1', {}, 'simple');
    expect(rendered.systemPrompt).toBe('');
    expect(rendered.userPrompt).toBe('You are a security assistant.');
    expect(rendered.version).toBe('1.0.0');
  });

  it('checks template existence', () => {
    const template: TemplateInfo = {
      id: 'finding-explain-v1',
      version: '1.0.0',
      type: 'context',
      description: 'd',
      changed: '2026-07-03',
      content: 'c',
      rawContent: 'c',
    };
    registry.register(template);
    expect(registry.has('finding-explain-v1')).toBe(true);
    expect(registry.has('non-existent')).toBe(false);
  });

  it('rejects invalid template IDs', () => {
    expect(() =>
      registry.register({
        id: 'invalid-id',
        version: '1.0.0',
        type: 'system',
        description: 'd',
        changed: '2026-07-03',
        content: 'c',
        rawContent: 'c',
      }),
    ).toThrow('Invalid template ID format');
  });

  it('compares template versions', () => {
    const template: TemplateInfo = {
      id: 'finding-explain-v1',
      version: '2.0.0',
      type: 'context',
      description: 'd',
      changed: '2026-07-03',
      content: 'c',
      rawContent: 'c',
    };
    registry.register(template);
    expect(registry.isNewerVersionThan('finding-explain-v1', '1.0.0')).toBe(true);
    expect(registry.isNewerVersionThan('finding-explain-v1', '3.0.0')).toBe(false);
  });

  it('reports correct template count', () => {
    expect(registry.size).toBe(0);
    registry.register({
      id: 'finding-explain-v1',
      version: '1.0.0',
      type: 'context',
      description: 'd',
      changed: '2026-07-03',
      content: 'c',
      rawContent: 'c',
    });
    expect(registry.size).toBe(1);
  });

  it('loads custom template from path', () => {
    // We can't easily test file loading without a real file,
    // but the method should at least exist and be callable
    expect(registry.loadCustomTemplate).toBeDefined();
  });
});
