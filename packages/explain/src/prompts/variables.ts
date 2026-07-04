/**
 * Variable extraction and validation for prompt templates.
 *
 * Extracts Handlebars variable references from template content and validates
 * them against the ExplainedContext type structure. This ensures that templates
 * only reference variables that exist in the context data.
 *
 * @module @veris/explain/prompts/variables
 */

// ── Types ──

/** A single variable reference found in a template. */
export interface TemplateVariable {
  /** Full variable path (e.g., "finding.title", "evidence.0.id"). */
  readonly path: string;
  /** The variable name without path (e.g., "finding", "evidence"). */
  readonly root: string;
  /** Whether this variable was detected as possibly missing from context. */
  readonly optional: boolean;
}

/** Result of variable validation. */
export interface VariableValidationResult {
  /** Whether all referenced variables exist in the context. */
  readonly valid: boolean;
  /** Variables found in the template. */
  readonly found: readonly TemplateVariable[];
  /** Variables referenced but missing from the provided context keys. */
  readonly missing: readonly string[];
  /** Warnings about potentially unused context keys. */
  readonly warnings: readonly string[];
}

/** Set of root-level context keys that templates may reference. */
const VALID_ROOT_KEYS = new Set([
  'finding',
  'evidence',
  'rule',
  'artifact',
  'risk',
  'report',
  'tokenBudget',
  'contextSchemaVersion',
  'subject',
  'mode',
]);

// ── Public API ──

/**
 * Extract Handlebars variable references from template content.
 *
 * Matches `{{variableName}}`, `{{path.to.variable}}`, `{{#each list}}`,
 * `{{#if condition}}`, `{{helperName arg}}`, and `{{this.property}}`.
 *
 * @param content - Template content string.
 * @returns Array of extracted variable references.
 */
export function extractVariables(content: string): TemplateVariable[] {
  const variables: TemplateVariable[] = [];
  const seen = new Set<string>();

  // Match {{variable}} patterns, excluding helpers and section markers
  const varRegex = /\{\{([#/]?[\w.]+)\}\}/g;
  let match: RegExpExecArray | null;
  let bodyMatch: RegExpExecArray | null;

  while ((match = varRegex.exec(content)) !== null) {
    const raw = match[1] ?? '';
    const clean = raw.replace(/^[#/]/, '');

    // Skip block helpers ({{#each}}, {{/each}}, {{#if}}, {{/if}})
    if (raw.startsWith('#') || raw.startsWith('/')) continue;

    // Skip helper invocations (e.g., (severity-label ...))
    if (clean.includes('(')) continue;

    const root = clean.split('.')[0] ?? clean;

    if (!seen.has(clean)) {
      seen.add(clean);
      variables.push({
        path: clean,
        root,
        optional: false,
      });
    }
  }

  // Extract dot-path variables from complex expressions like {{helperName arg.field}}
  // This regex matches patterns like "finding.severity.level" inside {{...}}
  const dotVarRegex = /([a-zA-Z]\w*(?:\.[a-zA-Z]\w*)+)/g;
  const bodyRegex = /\{\{([^}]+)\}\}/g;
  while ((bodyMatch = bodyRegex.exec(content)) !== null) {
    const body = bodyMatch[1] ?? '';
    if (body.startsWith('#') || body.startsWith('/') || body.includes('(')) continue;
    // Reset and run dotVarRegex on the body
    dotVarRegex.lastIndex = 0;
    let dotMatch: RegExpExecArray | null;
    while ((dotMatch = dotVarRegex.exec(body)) !== null) {
      const raw = dotMatch[1];
      if (!seen.has(raw)) {
        seen.add(raw);
        const root = raw.split('.')[0] ?? raw;
        variables.push({ path: raw, root, optional: false });
      }
    }
  }

  return variables;
}

/**
 * Validate that all variables referenced in a template are valid for
 * the provided set of context root keys.
 *
 * @param content - Template content to validate.
 * @param providedKeys - Set of root-level keys that the context provides.
 * @returns Validation result with missing/warning information.
 */
export function validateVariables(
  content: string,
  providedKeys: Set<string> = VALID_ROOT_KEYS,
): VariableValidationResult {
  const variables = extractVariables(content);
  const foundRoots = new Set(variables.map((v) => v.root));
  const missing: string[] = [];

  for (const variable of variables) {
    if (!providedKeys.has(variable.root)) {
      missing.push(variable.path);
    }
  }

  const warnings: string[] = [];
  for (const key of providedKeys) {
    if (!foundRoots.has(key)) {
      warnings.push(`Context key "${key}" is provided but not used by the template`);
    }
  }

  return {
    valid: missing.length === 0,
    found: variables,
    missing,
    warnings,
  };
}

/**
 * Detect missing variables from a rendered template output.
 * Scans the rendered output for unreplaced {{variable}} patterns.
 *
 * @param rendered - The rendered template output.
 * @returns List of unreplaced variable patterns found.
 */
export function detectMissingVariables(rendered: string): string[] {
  const missing: string[] = [];
  const regex = /\{\{[^}]+\}\}/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(rendered)) !== null) {
    const raw = match[0];
    // Skip if it's just whitespace insides
    const inner = raw.slice(2, -2).trim();
    if (inner.length > 0 && !inner.startsWith('#') && !inner.startsWith('/')) {
      missing.push(raw);
    }
  }

  return missing;
}
