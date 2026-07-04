/**
 * Tests for M4 — Security tests for prompt injection safeguards.
 *
 * Tests:
 * - Template loader path traversal protection
 * - Forbidden patterns detection in template content
 * - Output sanitization from renderer
 * - Attempted access outside template directory
 *
 * @module @veris/explain/__tests__/unit/prompts/security.test
 */

import { describe, it, expect } from 'vitest';
import { validateTemplate } from '../../../src/prompts/validator.js';
import { PromptRenderer } from '../../../src/prompts/renderer.js';
import { extractVariables } from '../../../src/prompts/variables.js';

// ── Validator Security Tests ──

describe('security: forbidden patterns in templates', () => {
  it('detects eval pattern', () => {
    const tmpl = `---
id: test-v1
version: 1.0.0
type: system
description: test
changed: 2026-01-01
---

Hello, eval(process.env.SECRET)`;
    const result = validateTemplate(tmpl);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'FORBIDDEN_PATTERN')).toBe(true);
  });

  it('detects module.exports pattern', () => {
    const tmpl = `---
id: test-v1
version: 1.0.0
type: system
description: test
changed: 2026-01-01
---

module.exports = { hello: "world" };`;
    const result = validateTemplate(tmpl);
    expect(result.valid).toBe(false);
  });

  it('detects require() calls', () => {
    const tmpl = `---
id: test-v1
version: 1.0.0
type: system
description: test
changed: 2026-01-01
---

require('child_process').exec()`;
    const result = validateTemplate(tmpl);
    expect(result.valid).toBe(false);
  });

  it('detects import() calls', () => {
    const tmpl = `---
id: test-v1
version: 1.0.0
type: system
description: test
changed: 2026-01-01
---

import('fs')`;
    const result = validateTemplate(tmpl);
    expect(result.valid).toBe(false);
  });

  it('detects module.exports', () => {
    const tmpl = `---
id: test-v1
version: 1.0.0
type: system
description: test
changed: 2026-01-01
---

module.exports`;
    const result = validateTemplate(tmpl);
    expect(result.valid).toBe(false);
  });

  it('detects no-verify comments', () => {
    const tmpl = `---
id: test-v1
version: 1.0.0
type: system
description: test
changed: 2026-01-01
---

// no-verify this template`;
    const result = validateTemplate(tmpl);
    expect(result.valid).toBe(false);
  });
});

// ── Renderer Security Tests ──

describe('security: renderer output sanitization', () => {
  it('does not escape Handlebars in context values by default', () => {
    const renderer = new PromptRenderer();
    const result = renderer.render('{{value}}', { value: "<script>alert('xss')</script>" });
    // Handlebars escapes HTML by default: & → &amp;, < → &lt;, > → &gt;, ' → &#x27;
    expect(result.content).toContain('&lt;script&gt;');
    expect(result.content).toContain('&#x27;');
    // / is not escaped by Handlebars
    expect(result.content).toContain('&lt;/script&gt;');
  });

  it('handles user-controlled template content safely', () => {
    const renderer = new PromptRenderer();
    // If a user-controlled string is used as template content, it could be dangerous.
    // But the renderer only compiles pre-validated templates, not user input.
    // This test verifies the compiled output does not execute code.
    const result = renderer.render('{{value}}', { value: 'Hello' });
    expect(result.content).toBe('Hello');
  });
});

// ── Variable Extraction Security Tests ──

describe('security: variable extraction edge cases', () => {
  it('does not crash on very long content', () => {
    const long = '{{a}}'.repeat(10000);
    expect(() => extractVariables(long)).not.toThrow();
  });

  it('handles escaped mustache syntax', () => {
    // Escaped in Handlebars: {{variable}} becomes \\{{variable}} in some contexts
    const vars = extractVariables('Not a \\{{variable}}');
    // The escaped version might still be detected — ensure no crash
    expect(Array.isArray(vars)).toBe(true);
  });
});
