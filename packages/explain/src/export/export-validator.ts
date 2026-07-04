/**
 * Export validator — validates exported documents for correctness.
 *
 * Validates:
 * - Markdown structure (headings, sections, citations)
 * - JSON schema conformance
 * - Required metadata fields
 * - Citation verification integrity
 * - Deterministic ordering
 *
 * @module @veris/explain/export/export-validator
 */

import type { Explanation } from '../types/explanation.js';

import type { ExplanationDocument, DocumentSection } from './explanation-document.js';

// ── Validation Severity ──

/** Severity of a validation issue. */
export type ValidationSeverity = 'error' | 'warning' | 'info';

// ── Validation Issue ──

/** A single validation issue. */
export interface ValidationIssue {
  readonly severity: ValidationSeverity;
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

// ── Validation Result ──

/** Result of validating an exported document. */
export interface ValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ValidationIssue[];
  readonly totalChecks: number;
  readonly errors: number;
  readonly warnings: number;
}

// ── Validator ──

/**
 * Validates exported ExplanationDocuments for correctness.
 *
 * All checks are purely deterministic and offline-first.
 */
export class ExportValidator {
  /**
   * Validate a complete ExplanationDocument.
   *
   * Runs all validation checks and returns aggregated results.
   *
   * @param document - The document to validate.
   * @returns Validation result with all issues.
   */
  validateDocument(document: ExplanationDocument): ValidationResult {
    const issues: ValidationIssue[] = [];
    let totalChecks = 0;

    // Metadata checks
    totalChecks++;
    if (!document.metadata.exportedAt) {
      issues.push({
        severity: 'error',
        code: 'MISSING_EXPORTED_AT',
        message: 'Document is missing exportedAt timestamp.',
        path: 'metadata.exportedAt',
      });
    }

    totalChecks++;
    if (!document.metadata.schemaVersion) {
      issues.push({
        severity: 'error',
        code: 'MISSING_SCHEMA_VERSION',
        message: 'Document is missing schemaVersion.',
        path: 'metadata.schemaVersion',
      });
    }

    totalChecks++;
    if (!document.metadata.engineVersion) {
      issues.push({
        severity: 'warning',
        code: 'MISSING_ENGINE_VERSION',
        message: 'Document is missing engineVersion.',
        path: 'metadata.engineVersion',
      });
    }

    // Explanation checks
    totalChecks++;
    if (!document.explanation.id) {
      issues.push({
        severity: 'error',
        code: 'MISSING_EXPLANATION_ID',
        message: 'Document is missing explanation id.',
        path: 'explanation.id',
      });
    }

    totalChecks++;
    if (!document.explanation.subjectId) {
      issues.push({
        severity: 'error',
        code: 'MISSING_SUBJECT_ID',
        message: 'Document is missing subjectId.',
        path: 'explanation.subjectId',
      });
    }

    totalChecks++;
    if (!document.explanation.subjectType) {
      issues.push({
        severity: 'warning',
        code: 'MISSING_SUBJECT_TYPE',
        message: 'Document is missing subjectType.',
        path: 'explanation.subjectType',
      });
    }

    // Provider checks
    totalChecks++;
    if (!document.provider.id) {
      issues.push({
        severity: 'warning',
        code: 'MISSING_PROVIDER_ID',
        message: 'Document is missing provider id.',
        path: 'provider.id',
      });
    }

    totalChecks++;
    if (!document.provider.model) {
      issues.push({
        severity: 'warning',
        code: 'MISSING_PROVIDER_MODEL',
        message: 'Document is missing provider model.',
        path: 'provider.model',
      });
    }

    // Section checks
    const sectionIssues = this.validateSections(document.sections);
    issues.push(...sectionIssues);
    totalChecks += sectionIssues.length > 0 ? sectionIssues.length : 1;

    // Citation checks
    const citationIssues = this.validateCitations(document);
    issues.push(...citationIssues);
    totalChecks += citationIssues.length > 0 ? citationIssues.length : 1;

    // Disclaimer check
    totalChecks++;
    if (!document.disclaimer) {
      issues.push({
        severity: 'info',
        code: 'MISSING_DISCLAIMER',
        message: 'Document is missing AI disclaimer.',
        path: 'disclaimer',
      });
    }

    // Deterministic ordering check
    const orderingIssues = this.validateOrdering(document);
    issues.push(...orderingIssues);
    totalChecks += orderingIssues.length > 0 ? orderingIssues.length : 1;

    const errors = issues.filter((i) => i.severity === 'error');
    const warnings = issues.filter((i) => i.severity === 'warning');

    return {
      valid: errors.length === 0,
      issues,
      totalChecks,
      errors: errors.length,
      warnings: warnings.length,
    };
  }

  /**
   * Validate that sections have deterministic ordering.
   *
   * @param sections - The sections to validate.
   * @returns Any ordering issues found.
   */
  validateOrdering(document: ExplanationDocument): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (let i = 1; i < document.sections.length; i++) {
      const prev = document.sections[i - 1];
      const curr = document.sections[i];
      if (prev.orderKey.localeCompare(curr.orderKey) > 0) {
        issues.push({
          severity: 'error',
          code: 'SECTION_ORDER_VIOLATION',
          message: `Sections are not in orderKey order: "${prev.orderKey}" > "${curr.orderKey}".`,
          path: `sections[${i}]`,
        });
        break; // One violation is enough
      }
    }

    return issues;
  }

  /**
   * Validate that sections have required fields.
   *
   * @param sections - The sections to validate.
   * @returns Any issues found.
   */
  private validateSections(sections: readonly DocumentSection[]): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];

      if (!section.heading) {
        issues.push({
          severity: 'error',
          code: 'SECTION_MISSING_HEADING',
          message: `Section at index ${i} is missing a heading.`,
          path: `sections[${i}].heading`,
        });
      }

      if (section.level < 1 || section.level > 6) {
        issues.push({
          severity: 'warning',
          code: 'SECTION_INVALID_LEVEL',
          message: `Section "${section.heading}" has invalid level ${section.level}.`,
          path: `sections[${i}].level`,
        });
      }

      if (!section.orderKey) {
        issues.push({
          severity: 'error',
          code: 'SECTION_MISSING_ORDER_KEY',
          message: `Section "${section.heading}" is missing orderKey.`,
          path: `sections[${i}].orderKey`,
        });
      }

      // Recurse into subsections
      if (section.subsections.length > 0) {
        const subIssues = this.validateSections(section.subsections);
        issues.push(...subIssues);
      }
    }

    return issues;
  }

  /**
   * Validate citations within a document.
   *
   * @param document - The document to validate.
   * @returns Any citation issues found.
   */
  private validateCitations(document: ExplanationDocument): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    for (let i = 0; i < document.citations.length; i++) {
      const citation = document.citations[i];

      if (!citation.id) {
        issues.push({
          severity: 'error',
          code: 'CITATION_MISSING_ID',
          message: `Citation at index ${i} is missing an id.`,
          path: `citations[${i}].id`,
        });
      }

      if (!citation.label) {
        issues.push({
          severity: 'warning',
          code: 'CITATION_MISSING_LABEL',
          message: `Citation "${citation.id}" is missing a label.`,
          path: `citations[${i}].label`,
        });
      }

      if (!citation.sourceType) {
        issues.push({
          severity: 'warning',
          code: 'CITATION_MISSING_SOURCE_TYPE',
          message: `Citation "${citation.id}" is missing sourceType.`,
          path: `citations[${i}].sourceType`,
        });
      }
    }

    // Check for duplicate citation IDs
    const seen = new Set<string>();
    for (const citation of document.citations) {
      if (seen.has(citation.id)) {
        issues.push({
          severity: 'error',
          code: 'DUPLICATE_CITATION_ID',
          message: `Duplicate citation id: "${citation.id}".`,
          path: `citations`,
        });
      }
      seen.add(citation.id);
    }

    return issues;
  }

  /**
   * Validate that a markdown string has valid structure.
   *
   * @param markdown - The markdown content to validate.
   * @returns Any issues found.
   */
  validateMarkdown(markdown: string): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Must start with a heading
    if (!markdown.startsWith('#')) {
      issues.push({
        severity: 'error',
        code: 'MARKDOWN_MISSING_TITLE',
        message: 'Markdown content must start with a heading.',
      });
    }

    // Count heading levels
    const headings = markdown.match(/^#+/gm);
    if (!headings || headings.length < 2) {
      issues.push({
        severity: 'warning',
        code: 'MARKDOWN_FEW_HEADINGS',
        message: 'Markdown content should have at least 2 headings.',
      });
    }

    return issues;
  }

  /**
   * Validate that a JSON string parses correctly and has required fields.
   *
   * @param json - The JSON content to validate.
   * @returns Any issues found.
   */
  validateJson(json: string): readonly ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    try {
      const parsed = JSON.parse(json);

      if (!parsed.metadata) {
        issues.push({
          severity: 'error',
          code: 'JSON_MISSING_METADATA',
          message: "JSON output is missing 'metadata' field.",
          path: 'metadata',
        });
      }

      if (!parsed.explanation) {
        issues.push({
          severity: 'error',
          code: 'JSON_MISSING_EXPLANATION',
          message: "JSON output is missing 'explanation' field.",
          path: 'explanation',
        });
      }

      if (!parsed.provider) {
        issues.push({
          severity: 'warning',
          code: 'JSON_MISSING_PROVIDER',
          message: "JSON output is missing 'provider' field.",
          path: 'provider',
        });
      }
    } catch {
      issues.push({
        severity: 'error',
        code: 'JSON_PARSE_ERROR',
        message: 'Content is not valid JSON.',
      });
    }

    return issues;
  }
}

// ── Convenience Function ──

/**
 * Quick-check whether an ExplanationDocument is valid.
 *
 * @param document - The document to check.
 * @returns True if no errors found.
 */
export function isDocumentValid(document: ExplanationDocument): boolean {
  const validator = new ExportValidator();
  return validator.validateDocument(document).valid;
}
