/**
 * Markdown exporter — produces premium Markdown output from ExplanationDocument.
 *
 * Features:
 * - Deterministic section ordering via orderKey
 * - Table of Contents generation (optional)
 * - Citations section (optional)
 * - Stable output across runs
 * - Unicode-safe
 *
 * @module @veris/explain/export/markdown-exporter
 */

import type {
  ExplanationDocument,
  DocumentSection,
  CitationEntry,
} from './explanation-document.js';
import type { ExportOptions } from './export-options.js';

// ── Constants ──

/** Horizontal rule separator. */
const HR = '\n\n---\n\n';

/** Maximum heading level. */
const MAX_HEADING_LEVEL = 6;

// ── Markdown Exporter ──

/**
 * Produces deterministic Markdown output from an ExplanationDocument.
 */
export class MarkdownExporter {
  private readonly options: ExportOptions;

  constructor(options: ExportOptions) {
    this.options = options;
  }

  /**
   * Export an ExplanationDocument as Markdown.
   *
   * @param document - The document to export.
   * @returns The complete Markdown string.
   */
  export(document: ExplanationDocument): string {
    const parts: string[] = [];

    // Title
    parts.push(this.formatTitle(document));
    parts.push('');

    // Metadata
    parts.push(this.formatMetadata(document));

    // Table of Contents (optional)
    if (this.options.includeToc && document.sections.length > 0) {
      parts.push(this.formatToc(document));
    }

    // Main sections (deterministically ordered)
    const sortedSections = this.sortSections(document.sections);
    for (const section of sortedSections) {
      parts.push('');
      parts.push(this.formatSection(section));
    }

    // Citations section (optional)
    if (this.options.includeCitations && document.citations.length > 0) {
      parts.push('');
      parts.push(this.formatCitations(document.citations));
    }

    // Disclaimer (optional)
    if (this.options.includeDisclaimer && document.disclaimer.length > 0) {
      parts.push(HR);
      parts.push(this.formatDisclaimer(document));
    }

    return parts.join('\n');
  }

  // ── Private Formatting ──

  /**
   * Format the document title.
   */
  private formatTitle(document: ExplanationDocument): string {
    const modeLabel =
      document.explanation.mode.charAt(0).toUpperCase() + document.explanation.mode.slice(1);
    return `# ${modeLabel} Explanation: ${document.explanation.subjectId}`;
  }

  /**
   * Format metadata block.
   */
  private formatMetadata(document: ExplanationDocument): string {
    const lines: string[] = [];

    lines.push(`> **Subject:** ${document.explanation.subjectId}`);
    lines.push(`> **Type:** ${document.explanation.subjectType}`);
    lines.push(`> **Mode:** ${document.explanation.mode}`);
    lines.push(`> **Provider:** ${document.provider.id}/${document.provider.model}`);
    lines.push(`> **Exported:** ${document.metadata.exportedAt}`);
    lines.push(`> **Schema:** ${document.metadata.schemaVersion}`);

    if (document.cached) {
      lines.push('> **Cached:** Yes');
    }

    return lines.join('\n');
  }

  /**
   * Format a table of contents.
   */
  private formatToc(document: ExplanationDocument): string {
    const parts: string[] = [];
    parts.push('## Table of Contents\n');

    const sortedSections = this.sortSections(document.sections);
    for (const section of sortedSections) {
      const anchor = this.slugify(section.heading);
      parts.push(`- [${section.heading}](#${anchor})`);

      // Sub-sections
      const sortedSubs = this.sortSections(section.subsections);
      for (const sub of sortedSubs) {
        const subAnchor = this.slugify(sub.heading);
        parts.push(`  - [${sub.heading}](#${subAnchor})`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Format a single document section.
   */
  private formatSection(section: DocumentSection): string {
    const parts: string[] = [];

    // Heading
    const level = Math.min(section.level, MAX_HEADING_LEVEL);
    const heading = `${'#'.repeat(level)} ${section.heading}`;
    parts.push(heading);
    parts.push('');

    // Body
    if (section.body.length > 0) {
      parts.push(section.body);
    }

    // Sub-sections
    const sortedSubs = this.sortSections(section.subsections);
    for (const sub of sortedSubs) {
      parts.push('');
      parts.push(this.formatSection(sub));
    }

    return parts.join('\n');
  }

  /**
   * Format the citations section.
   */
  private formatCitations(citations: readonly CitationEntry[]): string {
    const sorted = [...citations].sort((a, b) => a.id.localeCompare(b.id));
    const parts: string[] = [];

    parts.push('## Citations\n');

    for (const citation of sorted) {
      const status = citation.verified ? '✓' : '✗';
      parts.push(`- **[${citation.id}]** ${citation.label} ${status}`);

      if (citation.sourceId) {
        parts.push(`  - Source: \`${citation.sourceType}:${citation.sourceId}\``);
      }

      if (citation.verificationError) {
        parts.push(`  - ⚠️ ${citation.verificationError}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Format the AI disclaimer.
   */
  private formatDisclaimer(document: ExplanationDocument): string {
    return document.disclaimer;
  }

  // ── Helpers ──

  /**
   * Sort sections deterministically by orderKey.
   */
  private sortSections(sections: readonly DocumentSection[]): readonly DocumentSection[] {
    return [...sections].sort((a, b) => a.orderKey.localeCompare(b.orderKey));
  }

  /**
   * Create a GitHub-style anchor slug from heading text.
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
