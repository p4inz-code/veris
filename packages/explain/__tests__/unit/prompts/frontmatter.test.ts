/**
 * Tests for M4 — YAML frontmatter parsing and semver validation.
 *
 * Tests:
 * - Basic frontmatter parsing
 * - Version validation (semver format)
 * - Missing/invalid fields
 * - Edge cases (trailing whitespace, no newline)
 * - Invalid templates
 *
 * @module @veris/explain/__tests__/unit/prompts/frontmatter.test
 */

import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  validateSemver,
  compareSemver,
} from '../../../src/prompts/frontmatter.js';

const VALID_TEMPLATE = `---
id: finding-explain-system-v1
version: 1.0.0
type: system
description: System prompt for explaining a single finding
changed: 2026-07-02
---

Hello, {{finding.title}}!`;

describe('parseFrontmatter', () => {
  it('parses valid frontmatter', () => {
    const result = parseFrontmatter(VALID_TEMPLATE);
    expect(result.frontmatter.id).toBe('finding-explain-system-v1');
    expect(result.frontmatter.version).toBe('1.0.0');
    expect(result.frontmatter.type).toBe('system');
    expect(result.frontmatter.description).toBe('System prompt for explaining a single finding');
    expect(result.frontmatter.changed).toBe('2026-07-02');
    expect(result.content).toContain('Hello, {{finding.title}}!');
  });

  it('throws if template does not start with ---', () => {
    expect(() => parseFrontmatter('no frontmatter here')).toThrow(
      'Template must start with YAML frontmatter',
    );
  });

  it('throws if frontmatter has no closing ---', () => {
    expect(() =>
      parseFrontmatter(
        '---\nid: test\nversion: 1.0.0\ntype: system\ndescription: test\nchanged: 2026-01-01\n',
      ),
    ).toThrow('missing closing');
  });

  it('parses frontmatter with single-quoted values', () => {
    const tmpl = `---
id: 'test-v1'
version: '1.0.0'
type: 'system'
description: 'A test template'
changed: '2026-07-02'
---

Content`;
    const result = parseFrontmatter(tmpl);
    expect(result.frontmatter.id).toBe('test-v1');
    expect(result.frontmatter.version).toBe('1.0.0');
  });

  it('parses frontmatter with double-quoted values', () => {
    const tmpl = `---
id: "test-v1"
version: "1.0.0"
type: "system"
description: "A test template"
changed: "2026-07-02"
---

Content`;
    const result = parseFrontmatter(tmpl);
    expect(result.frontmatter.id).toBe('test-v1');
  });

  it('throws if frontmatter is missing id field', () => {
    const tmpl = `---
version: 1.0.0
type: system
description: Missing ID
changed: 2026-01-01
---

Content`;
    expect(() => parseFrontmatter(tmpl)).toThrow('missing required field: id');
  });

  it('throws if frontmatter is missing version field', () => {
    const tmpl = `---
id: test-v1
type: system
description: Missing version
changed: 2026-01-01
---

Content`;
    expect(() => parseFrontmatter(tmpl)).toThrow('missing required field: version');
  });

  it('throws if frontmatter is missing type field', () => {
    const tmpl = `---
id: test-v1
version: 1.0.0
description: Missing type
changed: 2026-01-01
---

Content`;
    expect(() => parseFrontmatter(tmpl)).toThrow('missing required field: type');
  });

  it('throws if version is not valid semver', () => {
    const tmpl = `---
id: test-v1
version: 1.0
type: system
description: Invalid semver
changed: 2026-01-01
---

Content`;
    expect(() => parseFrontmatter(tmpl)).toThrow('Invalid semver');
  });

  it('throws if type is not a valid TemplateType', () => {
    const tmpl = `---
id: test-v1
version: 1.0.0
type: invalid-type
description: Bad type
changed: 2026-01-01
---

Content`;
    expect(() => parseFrontmatter(tmpl)).toThrow('Invalid template type');
  });

  it('parses context type frontmatter', () => {
    const tmpl = `---
id: finding-context-v1
version: 1.0.0
type: context
description: Context template for findings
changed: 2026-07-02
---

Content`;
    const result = parseFrontmatter(tmpl);
    expect(result.frontmatter.type).toBe('context');
  });

  it('parses format type frontmatter', () => {
    const tmpl = `---
id: technical-format-v1
version: 1.0.0
type: format
description: Technical format template
changed: 2026-07-02
---

Content`;
    const result = parseFrontmatter(tmpl);
    expect(result.frontmatter.type).toBe('format');
  });

  it('handles empty template content', () => {
    const tmpl = `---
id: test-v1
version: 1.0.0
type: system
description: Empty content
changed: 2026-01-01
---
`;
    const result = parseFrontmatter(tmpl);
    expect(result.content.trim()).toBe('');
  });
});

describe('validateSemver', () => {
  it('accepts valid semver versions', () => {
    expect(() => validateSemver('0.0.0')).not.toThrow();
    expect(() => validateSemver('1.0.0')).not.toThrow();
    expect(() => validateSemver('1.2.3')).not.toThrow();
    expect(() => validateSemver('999.999.999')).not.toThrow();
  });

  it('rejects invalid semver versions', () => {
    expect(() => validateSemver('1.0')).toThrow();
    expect(() => validateSemver('1')).toThrow();
    expect(() => validateSemver('1.0.0.0')).toThrow();
    expect(() => validateSemver('v1.0.0')).toThrow();
    expect(() => validateSemver('1.0.0-beta')).toThrow();
    expect(() => validateSemver('abc')).toThrow();
    expect(() => validateSemver('')).toThrow();
  });
});

describe('compareSemver', () => {
  it('returns 0 for equal versions', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
  });

  it('returns negative when a < b', () => {
    expect(compareSemver('1.0.0', '2.0.0')).toBeLessThan(0);
    expect(compareSemver('1.0.0', '1.1.0')).toBeLessThan(0);
    expect(compareSemver('1.0.0', '1.0.1')).toBeLessThan(0);
  });

  it('returns positive when a > b', () => {
    expect(compareSemver('2.0.0', '1.0.0')).toBeGreaterThan(0);
    expect(compareSemver('1.1.0', '1.0.0')).toBeGreaterThan(0);
    expect(compareSemver('1.0.1', '1.0.0')).toBeGreaterThan(0);
  });
});
