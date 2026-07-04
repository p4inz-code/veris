/**
 * Tests for M4 — Template validation, security, and structural checks.
 *
 * @module @veris/explain/__tests__/unit/prompts/validator.test
 */

import { describe, it, expect } from 'vitest';
import { validateTemplate, validateTemplateId } from '../../../src/prompts/validator.js';

const VALID_TEMPLATE = `---
id: finding-explain-system-v1
version: 1.0.0
type: system
description: Test template for validation
changed: 2026-07-02
---

Hello, World!`;

describe('validateTemplate', () => {
  it('validates a correct template', () => {
    const result = validateTemplate(VALID_TEMPLATE, 'finding-explain-system-v1');
    expect(result.valid).toBe(true);
    expect(result.frontmatter?.id).toBe('finding-explain-system-v1');
    expect(result.issues).toEqual([]);
  });

  it('returns issues for missing frontmatter', () => {
    const result = validateTemplate('no frontmatter');
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('detects ID mismatch', () => {
    const result = validateTemplate(VALID_TEMPLATE, 'wrong-id');
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues.some((i) => i.code === 'ID_MISMATCH')).toBe(true);
  });

  it('detects forbidden patterns (eval)', () => {
    const tmpl = `---
id: test-v1
version: 1.0.0
type: system
description: test
changed: 2026-01-01
---

Hello, eval(something)`;
    const result = validateTemplate(tmpl);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'FORBIDDEN_PATTERN')).toBe(true);
  });

  it('detects forbidden patterns (require)', () => {
    const tmpl = `---
id: test-v1
version: 1.0.0
type: system
description: test
changed: 2026-01-01
---

const x = require('fs')`;
    const result = validateTemplate(tmpl);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'FORBIDDEN_PATTERN')).toBe(true);
  });

  it('detects unbalanced blocks', () => {
    const tmpl = `---
id: test-v1
version: 1.0.0
type: system
description: test
changed: 2026-01-01
---

{{#each items}}`;
    const result = validateTemplate(tmpl);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'UNCLOSED_BLOCK')).toBe(true);
  });

  it('detects unexpected closing blocks', () => {
    const tmpl = `---
id: test-v1
version: 1.0.0
type: system
description: test
changed: 2026-01-01
---

{{/each}}`;
    const result = validateTemplate(tmpl);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'UNBALANCED_BLOCK')).toBe(true);
  });

  it('detects mismatched blocks', () => {
    const tmpl = `---
id: test-v1
version: 1.0.0
type: system
description: test
changed: 2026-01-01
---

{{#each items}}{{/if}}`;
    const result = validateTemplate(tmpl);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'MISMATCHED_BLOCK')).toBe(true);
  });

  it('detects empty template content', () => {
    const tmpl = `---
id: test-v1
version: 1.0.0
type: system
description: test
changed: 2026-01-01
---
`;
    const result = validateTemplate(tmpl);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'EMPTY_CONTENT')).toBe(true);
  });

  it('detects oversized templates', () => {
    const largeContent = 'x'.repeat(200 * 1024); // 200KB
    const tmpl = `---
id: test-v1
version: 1.0.0
type: system
description: test
changed: 2026-01-01
---

${largeContent}`;
    const result = validateTemplate(tmpl);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'MAX_SIZE_EXCEEDED')).toBe(true);
  });
});

describe('validateTemplateId', () => {
  it('accepts valid template IDs', () => {
    expect(validateTemplateId('finding-explain-v1')).toBe(true);
    expect(validateTemplateId('system-prompt-v2')).toBe(true);
    expect(validateTemplateId('a-b-v999')).toBe(true);
  });

  it('rejects invalid template IDs', () => {
    expect(validateTemplateId('')).toBe(false);
    expect(validateTemplateId('no-version')).toBe(false);
    expect(validateTemplateId('-v1')).toBe(false);
    expect(validateTemplateId('finding-v1-no-purpose')).toBe(false);
  });
});
