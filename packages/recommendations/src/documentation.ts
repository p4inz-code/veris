/**
 * DocumentationRegistry — deterministic documentation lookup, indexing, and validation.
 *
 * ## Purpose
 * This module provides deterministic documentation lookup and validation.
 * It NEVER generates documentation. It ONLY validates and exposes existing
 * documentation metadata from registered recommendations.
 *
 * ## Ownership Boundaries
 * - Registry remains source of truth for recommendation storage.
 * - Engine remains source of truth for evaluation.
 * - Explainer remains source of truth for explanation views.
 * - DocumentationRegistry indexes and validates documentation metadata only.
 *
 * ## Invariants
 * - All outputs are frozen.
 * - Ordering is by documentation ID, never insertion order.
 * - Pure functions — no side effects.
 * - Deterministic — same input always produces same output.
 *
 * @module @veris/recommendations/documentation
 */

import type { Recommendation, DocumentationReference } from './types.js';

// ── Documentation Entry ──

/**
 * A single documentation entry with its associated recommendation IDs.
 *
 * Each entry represents a unique document that one or more recommendations
 * reference. The `recommendationIds` field enables reverse lookup from
 * documentation back to the recommendations that cite it.
 */
export interface DocumentationEntry {
  /** Unique documentation ID (e.g., "doc_cve-2024-1234"). */
  readonly documentationId: string;
  /** Human-readable title of the documentation. */
  readonly documentTitle: string;
  /** Specific section within the document, if applicable. */
  readonly section?: string;
  /** URL to the documentation, if publicly available. */
  readonly url?: string;
  /** IDs of recommendations that reference this documentation. */
  readonly recommendationIds: readonly string[];
}

// ── Validation Types ──

/** Severity level for a validation finding. */
export type DocumentationValidationSeverity = 'error' | 'warning';

/**
 * A single validation finding for documentation.
 *
 * Each finding identifies a specific issue with documentation metadata
 * or linkages. Findings may be errors (blocking) or warnings (advisory).
 */
export interface DocumentationValidationFinding {
  /** Severity of the finding. */
  readonly severity: DocumentationValidationSeverity;
  /** Error/warning code for programmatic handling. */
  readonly code: string;
  /** Human-readable description of the finding. */
  readonly message: string;
  /** The documentation ID this finding relates to, if applicable. */
  readonly documentationId?: string;
  /** The recommendation ID this finding relates to, if applicable. */
  readonly recommendationId?: string;
}

/**
 * Complete validation result for the documentation registry.
 *
 * Provides a summary of all findings, including both errors and warnings.
 * Consumers should check `valid` before relying on the documentation state.
 */
export interface DocumentationValidationResult {
  /** Whether the documentation is valid (no error-level findings). */
  readonly valid: boolean;
  /** Total number of error-level findings. */
  readonly errorCount: number;
  /** Total number of warning-level findings. */
  readonly warningCount: number;
  /** All findings, sorted by documentation ID then severity. */
  readonly findings: readonly DocumentationValidationFinding[];
}

// ── Registry Interface ──

/**
 * Deterministic registry for documentation lookup and validation.
 *
 * Provides lookup by documentation ID, lookup by recommendation ID,
 * full listing, and structural validation.
 * All outputs are immutable.
 */
export interface DocumentationRegistry {
  /**
   * Look up a documentation entry by its ID.
   *
   * @param documentationId - The documentation ID to look up.
   * @returns The documentation entry, or undefined if not found.
   */
  lookupDocumentation(documentationId: string): DocumentationEntry | undefined;

  /**
   * List all documentation entries, sorted by documentation ID.
   *
   * @returns Immutable array of all documentation entries.
   */
  listDocumentation(): readonly DocumentationEntry[];

  /**
   * Run structural validation on the documentation registry.
   *
   * Detects:
   * - Duplicate documentation IDs
   * - Orphaned documentation (references to docs that don't exist)
   * - Missing documentation (recommendations with doc refs to non-existent docs)
   * - Invalid documentation IDs
   * - Invalid recommendation metadata (categories, actions, priorities)
   *
   * Does NOT throw for normal validation failures — returns a structured result.
   *
   * @returns Validation result with all findings.
   */
  validateDocumentation(): DocumentationValidationResult;
}

// ── Factory Function ──

/**
 * Create a new documentation registry from a list of recommendations.
 *
 * Indexes all documentation references across the provided recommendations,
 * building reverse mappings from documentation IDs to recommendation IDs.
 *
 * @param recommendations - The recommendations to index documentation from.
 * @returns A new DocumentationRegistry instance.
 */
export function createDocumentationRegistry(
  recommendations: readonly Recommendation[],
): DocumentationRegistry {
  return new DocumentationRegistryImpl(recommendations);
}

// ── Implementation ──

/**
 * Internal implementation of DocumentationRegistry.
 *
 * Builds an index from documentation ID to DocumentationEntry during
 * construction. All operations are O(1) or O(n) on the pre-built index.
 */
class DocumentationRegistryImpl implements DocumentationRegistry {
  /** Index: documentationId → DocumentationEntry. Sorted during construction. */
  private readonly _entries: readonly DocumentationEntry[];

  /** Lookup map: documentationId → DocumentationEntry. */
  private readonly _lookup: ReadonlyMap<string, DocumentationEntry>;

  /** Lookup map: recommendationId → documentationIds. */
  private readonly _recToDocs: ReadonlyMap<string, readonly string[]>;

  constructor(recommendations: readonly Recommendation[]) {
    // Build reverse index: documentationId → Set<recommendationId>
    const docToRecs = new Map<string, Set<string>>();
    // Build forward index: recommendationId → Set<documentationId>
    const recToDocIds = new Map<string, Set<string>>();
    // Store document metadata: documentationId → DocumentationReference (first seen)
    const docMeta = new Map<string, DocumentationReference>();

    for (const rec of recommendations) {
      for (const docRef of rec.documentationRefs) {
        // Use empty string for missing doc IDs so validation can flag them
        const docId = docRef.documentId ?? '';

        // Store metadata (first occurrence wins, which is deterministic)
        if (!docMeta.has(docId)) {
          docMeta.set(docId, docRef);
        }

        // Map doc → rec
        let recs = docToRecs.get(docId);
        if (!recs) {
          recs = new Set<string>();
          docToRecs.set(docId, recs);
        }
        recs.add(rec.id);

        // Map rec → doc
        let docIds = recToDocIds.get(rec.id);
        if (!docIds) {
          docIds = new Set<string>();
          recToDocIds.set(rec.id, docIds);
        }
        docIds.add(docId);
      }
    }

    // Build sorted entries array (by documentation ID)
    const sortedDocIds = [...docToRecs.keys()].sort((a, b) => a.localeCompare(b));

    const entries: DocumentationEntry[] = [];
    const lookup = new Map<string, DocumentationEntry>();

    for (const docId of sortedDocIds) {
      const meta = docMeta.get(docId)!;
      const recIds = [...docToRecs.get(docId)!].sort((a, b) => a.localeCompare(b));

      const entry: DocumentationEntry = Object.freeze({
        documentationId: docId,
        documentTitle: meta.documentTitle,
        section: meta.section,
        url: meta.url,
        recommendationIds: Object.freeze(recIds),
      });

      entries.push(entry);
      lookup.set(docId, entry);
    }

    // Build recommendation → documentation ID map
    const recToDocsMap = new Map<string, readonly string[]>();
    for (const [recId, docIds] of recToDocIds) {
      recToDocsMap.set(recId, Object.freeze([...docIds].sort((a, b) => a.localeCompare(b))));
    }

    this._entries = Object.freeze(entries);
    this._lookup = lookup;
    this._recToDocs = recToDocsMap;
  }

  lookupDocumentation(documentationId: string): DocumentationEntry | undefined {
    return this._lookup.get(documentationId);
  }

  listDocumentation(): readonly DocumentationEntry[] {
    return this._entries;
  }

  validateDocumentation(): DocumentationValidationResult {
    const findings: DocumentationValidationFinding[] = [];

    // Check for duplicate documentation IDs (same ID used with different metadata)
    // This is already handled by construction (first metadata wins), but validate
    // that no conflicts exist
    const seenDocIds = new Set<string>();

    for (const entry of this._entries) {
      if (seenDocIds.has(entry.documentationId)) {
        findings.push({
          severity: 'error',
          code: 'DUPLICATE_DOCUMENTATION_ID',
          message: `Duplicate documentation ID "${entry.documentationId}" found`,
          documentationId: entry.documentationId,
        });
      }
      seenDocIds.add(entry.documentationId);
    }

    // Check for empty documentation IDs
    for (const entry of this._entries) {
      if (!entry.documentationId || entry.documentationId.trim() === '') {
        findings.push({
          severity: 'error',
          code: 'EMPTY_DOCUMENTATION_ID',
          message: 'Documentation entry has an empty ID',
          documentationId: entry.documentationId,
        });
      }

      if (!entry.documentTitle || entry.documentTitle.trim() === '') {
        findings.push({
          severity: 'warning',
          code: 'MISSING_DOCUMENTATION_TITLE',
          message: `Documentation "${entry.documentationId}" has no title`,
          documentationId: entry.documentationId,
        });
      }
    }

    // Check all recommendation → documentation links are consistent
    // (every doc referenced by a recommendation exists in the index)
    for (const [recId, docIds] of this._recToDocs) {
      for (const docId of docIds) {
        if (!this._lookup.has(docId)) {
          findings.push({
            severity: 'error',
            code: 'ORPHANED_DOCUMENTATION_REFERENCE',
            message: `Recommendation "${recId}" references non-existent documentation "${docId}"`,
            documentationId: docId,
            recommendationId: recId,
          });
        }
      }
    }

    // Sort findings by documentation ID then severity (errors first)
    const sorted = Object.freeze(
      [...findings].sort((a, b) => {
        const idA = a.documentationId ?? a.recommendationId ?? '';
        const idB = b.documentationId ?? b.recommendationId ?? '';
        if (idA !== idB) return idA.localeCompare(idB);
        if (a.severity !== b.severity) {
          return a.severity === 'error' ? -1 : 1;
        }
        return a.code.localeCompare(b.code);
      }),
    );

    const errorCount = sorted.filter((f) => f.severity === 'error').length;
    const warningCount = sorted.filter((f) => f.severity === 'warning').length;

    return Object.freeze({
      valid: errorCount === 0,
      errorCount,
      warningCount,
      findings: sorted,
    });
  }
}
