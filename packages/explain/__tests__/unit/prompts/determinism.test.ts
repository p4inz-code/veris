/**
 * Tests for M4 — Determinism tests (100 repeated runs).
 *
 * Verifies that rendering, frontmatter parsing, and cache key generation
 * are deterministic across 100 runs with the same inputs.
 *
 * @module @veris/explain/__tests__/unit/prompts/determinism.test
 */

import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../../../src/prompts/frontmatter.js';
import { PromptRenderer } from '../../../src/prompts/renderer.js';
import { extractCacheKeyComponents, formatPromptVersion } from '../../../src/prompts/cache-key.js';
import { extractVariables } from '../../../src/prompts/variables.js';

const VALID_TEMPLATE = `---
id: finding-explain-system-v1
version: 1.0.0
type: system
description: System prompt for explaining a single finding
changed: 2026-07-02
---

Hello, {{finding.title}}!`;

const RENDER_TEMPLATE = `Finding: {{finding.title}}
Severity: {{severity-label finding.severity.level}} ({{format-score finding.severity.score}})
Confidence: {{format-confidence finding.confidence}}
{{#if finding.description}}
Description: {{finding.description}}
{{/if}}`;

const RENDER_CONTEXT = {
  finding: {
    title: 'Hardcoded AWS Key',
    severity: { level: 'critical', score: 9.5 },
    confidence: 0.95,
    description: 'A hardcoded AWS access key was detected.',
  },
};

describe('frontmatter parsing determinism (100 runs)', () => {
  it('produces identical parse results', () => {
    const results = Array.from({ length: 100 }, () =>
      JSON.stringify(parseFrontmatter(VALID_TEMPLATE)),
    );

    const first = results[0];
    for (const r of results) {
      expect(r).toBe(first);
    }
  });
});

describe('render determinism (100 runs)', () => {
  it('produces identical render output', () => {
    const renderer = new PromptRenderer();
    const results = Array.from(
      { length: 100 },
      () => renderer.render(RENDER_TEMPLATE, RENDER_CONTEXT as Record<string, unknown>).content,
    );

    const first = results[0];
    for (const r of results) {
      expect(r).toBe(first);
    }
  });

  it('produces identical render results (full result object)', () => {
    const renderer = new PromptRenderer();
    const results = Array.from({ length: 100 }, () =>
      renderer.render(RENDER_TEMPLATE, RENDER_CONTEXT as Record<string, unknown>),
    );

    const first = JSON.stringify(results[0]);
    for (const r of results) {
      expect(JSON.stringify(r)).toBe(first);
    }
  });
});

describe('cache key determinism (100 runs)', () => {
  it('produces identical cache key components', () => {
    const results = Array.from({ length: 100 }, () =>
      extractCacheKeyComponents('finding-explain-system-v1', '1.0.0'),
    );

    const first = JSON.stringify(results[0]);
    for (const r of results) {
      expect(JSON.stringify(r)).toBe(first);
    }
  });

  it('produces identical formatted versions', () => {
    const results = Array.from({ length: 100 }, () =>
      formatPromptVersion('finding-explain-system-v1', '1.0.0'),
    );

    const first = results[0];
    for (const r of results) {
      expect(r).toBe(first);
    }
  });
});

describe('variable extraction determinism (100 runs)', () => {
  it('produces identical extraction results', () => {
    const results = Array.from({ length: 100 }, () =>
      extractVariables('{{finding.title}} with {{evidence.length}} matches'),
    );

    const first = JSON.stringify(results[0]);
    for (const r of results) {
      expect(JSON.stringify(r)).toBe(first);
    }
  });
});
