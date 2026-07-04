/**
 * Frontmatter parser — YAML frontmatter extraction and validation for prompt templates.
 *
 * Each template file has a YAML frontmatter block delimited by `---` at the top,
 * containing metadata: id, version (semver MAJOR.MINOR.PATCH), type, description, changed.
 *
 * @module @veris/explain/prompts/frontmatter
 */

/** Template type classification. */
export type TemplateType = 'system' | 'context' | 'format';

/** Parsed frontmatter metadata. */
export interface TemplateFrontmatter {
  /** Template identifier (e.g., "finding-explain-system-v1"). */
  readonly id: string;
  /** Semantic version (MAJOR.MINOR.PATCH). */
  readonly version: string;
  /** Template type. */
  readonly type: TemplateType;
  /** Human-readable description. */
  readonly description: string;
  /** ISO 8601 date of last change. */
  readonly changed: string;
}

/** Result of parsing a template file. */
export interface ParsedTemplate {
  /** Parsed frontmatter metadata. */
  readonly frontmatter: TemplateFrontmatter;
  /** Template content (everything after frontmatter). */
  readonly content: string;
}

// ── Constants ──

const FRONTMATTER_DELIMITER = '---\n';

// ── Public API ──

/**
 * Parse YAML frontmatter from a template string.
 *
 * Expects a YAML frontmatter block delimited by `---` at the start of the file:
 *
 * ```
 * ---
 * id: finding-explain-system-v1
 * version: 1.0.0
 * type: system
 * description: System prompt for explaining a single finding
 * changed: 2026-07-02
 * ---
 * ```
 *
 * @param templateString - The full template file content.
 * @returns Parsed frontmatter metadata and content.
 * @throws If frontmatter is missing or malformed.
 */
export function parseFrontmatter(templateString: string): ParsedTemplate {
  if (!templateString.startsWith(FRONTMATTER_DELIMITER)) {
    throw new Error('Template must start with YAML frontmatter (---)');
  }

  const endDelimIndex = templateString.indexOf(FRONTMATTER_DELIMITER, FRONTMATTER_DELIMITER.length);

  if (endDelimIndex === -1) {
    throw new Error('Template frontmatter missing closing --- delimiter');
  }

  const yamlBlock = templateString.slice(FRONTMATTER_DELIMITER.length, endDelimIndex);
  const content = templateString.slice(endDelimIndex + FRONTMATTER_DELIMITER.length);

  const frontmatter = parseYamlBlock(yamlBlock);

  return { frontmatter, content };
}

/**
 * Parse a YAML block into structured frontmatter metadata.
 * Uses a simple line-by-line parser (no js-yaml dependency needed for this simple format).
 *
 * @param yamlBlock - The YAML content between frontmatter delimiters.
 * @returns Parsed frontmatter metadata.
 */
function parseYamlBlock(yamlBlock: string): TemplateFrontmatter {
  const lines = yamlBlock.split('\n').filter((l) => l.trim().length > 0);
  const fields: Record<string, string> = {};

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // Remove surrounding quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    fields[key] = value;
  }

  // Validate required fields
  if (!fields.id) throw new Error('Frontmatter missing required field: id');
  if (!fields.version) throw new Error('Frontmatter missing required field: version');
  if (!fields.type) throw new Error('Frontmatter missing required field: type');
  if (!fields.description) throw new Error('Frontmatter missing required field: description');
  if (!fields.changed) throw new Error('Frontmatter missing required field: changed');

  // Validate version format (semver MAJOR.MINOR.PATCH)
  validateSemver(fields.version);

  // Validate type
  const validTypes: TemplateType[] = ['system', 'context', 'format'];
  if (!validTypes.includes(fields.type as TemplateType)) {
    throw new Error(
      `Invalid template type: "${fields.type}". Must be one of: ${validTypes.join(', ')}`,
    );
  }

  return {
    id: fields.id,
    version: fields.version,
    type: fields.type as TemplateType,
    description: fields.description,
    changed: fields.changed,
  };
}

/**
 * Validate that a version string follows semver MAJOR.MINOR.PATCH format.
 *
 * @param version - Version string to validate.
 * @throws If version does not match semver format.
 */
export function validateSemver(version: string): void {
  const semverRegex = /^\d+\.\d+\.\d+$/;
  if (!semverRegex.test(version)) {
    throw new Error(
      `Invalid semver version: "${version}". Must be MAJOR.MINOR.PATCH (e.g., 1.2.3).`,
    );
  }
}

/**
 * Compare two semver version strings.
 *
 * @returns Negative if a < b, positive if a > b, 0 if equal.
 */
export function compareSemver(a: string, b: string): number {
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const aVal = aParts[i] ?? 0;
    const bVal = bParts[i] ?? 0;
    if (aVal !== bVal) return aVal - bVal;
  }

  return 0;
}
