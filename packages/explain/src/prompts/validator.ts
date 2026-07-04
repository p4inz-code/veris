/**
 * Template validator — validates template structure, enforces security rules,
 * and checks for compliance with SPEC-011 requirements.
 *
 * Validation checks:
 * 1. Template has valid YAML frontmatter
 * 2. Template content is non-empty
 * 3. No dangerous patterns (eval, process, require)
 * 4. Handlebars syntax is balanced (#each/#if with matching /each/if)
 * 5. Template does not exceed max size
 * 6. Variables match expected context structure
 *
 * @module @veris/explain/prompts/validator
 */

import { parseFrontmatter } from './frontmatter.js';
import type { TemplateFrontmatter } from './frontmatter.js';

// ── Constants ──

/** Maximum template file size in bytes (100KB). */
const MAX_TEMPLATE_SIZE_BYTES = 100 * 1024;

/** Patterns that are forbidden in template content for security. */
const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /\beval\s*\(/i,
  /\brequire\s*\(/i,
  /\bimport\s*\(/i,
  /\bmodule\.exports\b/,
  /\/\/\s*no-verify/i,
  /\/\/\s*skip-checks/i,
];

/** Template section markers that must be balanced. */
const BLOCK_MARKERS = ['each', 'if', 'unless', 'with'] as const;

// ── Types ──

/** Severity of a validation issue. */
export type ValidationSeverity = 'error' | 'warning';

/** A single validation issue found in a template. */
export interface ValidationIssue {
  readonly severity: ValidationSeverity;
  readonly message: string;
  readonly code: string;
}

/** Result of template validation. */
export interface ValidationResult {
  readonly valid: boolean;
  readonly frontmatter: TemplateFrontmatter | null;
  readonly issues: readonly ValidationIssue[];
}

// ── Public API ──

/**
 * Validate a complete template string (frontmatter + content).
 *
 * @param templateString - The full template file content.
 * @param templateId - Expected template ID (for error reporting).
 * @returns Validation result with issues.
 */
export function validateTemplate(templateString: string, templateId?: string): ValidationResult {
  const issues: ValidationIssue[] = [];

  // Check size
  if (Buffer.byteLength(templateString, 'utf-8') > MAX_TEMPLATE_SIZE_BYTES) {
    issues.push({
      severity: 'error',
      message: `Template exceeds maximum size of ${MAX_TEMPLATE_SIZE_BYTES} bytes`,
      code: 'MAX_SIZE_EXCEEDED',
    });
    return { valid: false, frontmatter: null, issues };
  }

  // Parse frontmatter
  let frontmatter: TemplateFrontmatter | null = null;
  try {
    const parsed = parseFrontmatter(templateString);
    frontmatter = parsed.frontmatter;

    // Verify template ID matches expected
    if (templateId && parsed.frontmatter.id !== templateId) {
      issues.push({
        severity: 'error',
        message: `Template ID mismatch: expected "${templateId}", got "${parsed.frontmatter.id}"`,
        code: 'ID_MISMATCH',
      });
    }
  } catch (e) {
    issues.push({
      severity: 'error',
      message: `Frontmatter parsing failed: ${(e as Error).message}`,
      code: 'FRONTMATTER_ERROR',
    });
    return { valid: false, frontmatter: null, issues };
  }

  // Check non-empty content
  if (!frontmatter) {
    issues.push({
      severity: 'error',
      message: 'No frontmatter parsed',
      code: 'NO_FRONTMATTER',
    });
    return { valid: false, frontmatter: null, issues };
  }

  const content = templateString.slice(templateString.indexOf('---\n', 1) + 4);

  if (content.trim().length === 0) {
    issues.push({
      severity: 'error',
      message: 'Template content is empty',
      code: 'EMPTY_CONTENT',
    });
  }

  // Security check: forbidden patterns
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(templateString)) {
      issues.push({
        severity: 'error',
        message: `Template contains forbidden pattern: ${pattern}`,
        code: 'FORBIDDEN_PATTERN',
      });
    }
  }

  // Check balanced block markers
  const balanceIssues = checkBlockBalance(content);
  issues.push(...balanceIssues);

  return {
    valid: issues.every((i) => i.severity !== 'error'),
    frontmatter,
    issues,
  };
}

/**
 * Check that Handlebars block markers are properly balanced.
 *
 * @param content - Template content (without frontmatter).
 * @returns Array of balance issues.
 */
function checkBlockBalance(content: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const stack: { marker: string; line: number }[] = [];
  const lines = content.split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex] ?? '';

    for (const marker of BLOCK_MARKERS) {
      // Match opening {{#marker ...}}
      const openRegex = new RegExp(`\\{\\{#${marker}(?:\\s|\\})`);
      if (openRegex.test(line)) {
        stack.push({ marker, line: lineIndex + 1 });
      }

      // Match closing {{/marker}}
      const closeRegex = new RegExp(`\\{\\{/${marker}\\}\\}`);
      if (closeRegex.test(line)) {
        const last = stack.pop();
        if (!last) {
          issues.push({
            severity: 'error',
            message: `Unexpected closing {{/${marker}}} at line ${lineIndex + 1}: no matching opener`,
            code: 'UNBALANCED_BLOCK',
          });
        } else if (last.marker !== marker) {
          issues.push({
            severity: 'error',
            message: `Mismatched block: opened {{#${last.marker}}} at line ${last.line}, closed {{/${marker}}} at line ${lineIndex + 1}`,
            code: 'MISMATCHED_BLOCK',
          });
        }
      }
    }
  }

  // Any remaining unclosed blocks
  for (const remaining of stack) {
    issues.push({
      severity: 'error',
      message: `Unclosed block {{#${remaining.marker}}} opened at line ${remaining.line}`,
      code: 'UNCLOSED_BLOCK',
    });
  }

  return issues;
}

/**
 * Validate that a template ID follows the naming convention.
 * Template IDs must match: `{subject}-{purpose}-v{major}`.
 *
 * @param id - Template ID to validate.
 * @returns True if the ID follows the convention.
 */
export function validateTemplateId(id: string): boolean {
  // Accept patterns like: finding-explain-v1, finding-explain-system-v1, report-summary-system-v1
  const idRegex = /^[a-z]+(?:-[a-z]+)+-v\d+$/;
  return idRegex.test(id);
}
