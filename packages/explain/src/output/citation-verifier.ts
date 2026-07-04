/**
 * CitationVerifier — Deterministic citation validation against ExplainedContext.
 *
 * Runs THIRD in the M6a validation pipeline (after StructuralValidator).
 *
 * Responsibilities:
 * - Verify every citation exists in ExplainedContext
 * - Verify citation type matches the object type
 * - Verify IDs match expected format patterns
 * - Reject orphan citations (references to non-existent objects)
 * - Reject malformed citations (invalid format)
 * - Reject duplicate references (same sourceId+sourceType pair)
 * - Verify bidirectional traceability (each citation maps to an existing object)
 *
 * @module @veris/explain/output/citation-verifier
 */

import type {
  CitationVerifier as CitationVerifierInterface,
  CitationVerificationResult,
  ValidationIssue,
} from './validation-result.js';

// ── Constants ──

/** Pattern for extracting [src:type:id] citation markers. */
const SRC_CITATION_PATTERN = /\[src:([a-z-]+):([a-zA-Z0-9_:./\\-]+)\]/g;

/** Pattern for extracting [ref:type:id] citation markers (legacy format). */
const REF_CITATION_PATTERN = /\[ref:([a-z-]+):([a-zA-Z0-9_:./\\-]+)\]/g;

/** Map of source type to ID prefix patterns. */
const SOURCE_ID_PATTERNS: Record<string, RegExp> = {
  finding: /^fin_/,
  evidence: /^ev_/,
  rule: /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/,
  behavior: /^beh_/,
  artifact: /^art_/,
  chain: /^bc_/,
  'risk-dimension': /^D\d+$/,
  recommendation: /^rec_/,
  'rule-prop': /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+:[a-zA-Z0-9_-]+$/,
  'report-meta': /^report:/,
};

/** Set of all valid source types. */
const VALID_SOURCE_TYPES = new Set(Object.keys(SOURCE_ID_PATTERNS));

// ── CitationVerifier Implementation ──

/**
 * Deterministic citation verifier that validates every citation in an
 * explanation against the provided context.
 *
 * No LLM provider is ever called. All checks are pure deterministic.
 */
export class CitationVerifier implements CitationVerifierInterface {
  readonly name = 'CitationVerifier';

  /**
   * Verify all citations in the explanation against the context.
   *
   * Performs the following checks in order for each citation:
   * 1. Parse citation markers from content
   * 2. Validate source type is a known type
   * 3. Validate ID format matches expected pattern
   * 4. Check object exists in context
   * 5. Check type consistency (source type vs actual object type)
   * 6. Detect orphan citations (non-existent objects)
   * 7. Detect duplicate references
   * 8. Verify bidirectional traceability
   *
   * @param content - The explanation text containing citation markers.
   * @param context - The ExplainedContext object. Must have a `subject` field
   *                  and may have `evidence`, `rule`, `artifact`, `risk`, `report` fields.
   * @returns Citation verification result.
   */
  verify(
    content: string,
    context: { readonly evidence?: readonly unknown[]; readonly [key: string]: unknown },
  ): CitationVerificationResult {
    const issues: ValidationIssue[] = [];
    const orphanCitations: string[] = [];
    const duplicateCitations: string[] = [];
    const seenPairs = new Set<string>();
    const allContextObjects = this.collectContextObjects(context);

    // Skip if content is empty
    if (!content || content.trim().length === 0) {
      return {
        valid: true,
        issues: [],
        totalCitations: 0,
        verifiedCitations: 0,
        failedCitations: 0,
        orphanCitations: [],
        duplicateCitations: [],
        bidirectionalTraceability: true,
      };
    }

    // Extract all citations from both [src:type:id] and [ref:type:id] formats
    const citations = this.extractAllCitations(content);
    let verifiedCount = 0;
    let failedCount = 0;

    for (const citation of citations) {
      const { sourceType, sourceId, citationStr } = citation;
      let citationFailed = false;

      // Step 2: Validate source type
      if (!VALID_SOURCE_TYPES.has(sourceType)) {
        issues.push({
          code: 'INVALID_SOURCE_TYPE',
          message: `Unknown citation source type: "${sourceType}".`,
          severity: 'error',
          field: sourceType,
          value: sourceId,
        });
        failedCount++;
        orphanCitations.push(citationStr);
        continue;
      }

      // Step 3: Validate ID format
      const idPattern = SOURCE_ID_PATTERNS[sourceType];
      if (idPattern && !idPattern.test(sourceId)) {
        issues.push({
          code: 'INVALID_CITATION_ID_FORMAT',
          message: `Citation ID "${sourceId}" does not match expected format for type "${sourceType}".`,
          severity: 'error',
          field: sourceType,
          value: sourceId,
        });
        citationFailed = true;
      }

      // Step 4: Check object exists in context
      const exists = this.objectExistsInContext(sourceType, sourceId, allContextObjects);

      if (!exists) {
        issues.push({
          code: 'CITATION_OBJECT_NOT_FOUND',
          message: `Citation references non-existent object: ${sourceType}:${sourceId}.`,
          severity: 'error',
          field: sourceType,
          value: sourceId,
        });
        orphanCitations.push(citationStr);
        citationFailed = true;
      }

      // Step 5: Check type consistency (for subject objects)
      if (!citationFailed && sourceType === 'finding' && context.subject) {
        const subject = context.subject as {
          readonly id?: string;
          readonly [key: string]: unknown;
        };
        if (subject.id !== sourceId) {
          // The citation references a different finding, check if it exists in the report
          // We mark this as a warning since multiple findings may exist
          issues.push({
            code: 'SUBJECT_MISMATCH',
            message: `Citation references finding "${sourceId}" but the context subject is "${String(subject.id)}".`,
            severity: 'warning',
            field: sourceType,
            value: sourceId,
          });
        }
      }

      // Step 6: Detect duplicate references
      const pairKey = `${sourceType}:${sourceId}`;
      if (seenPairs.has(pairKey)) {
        duplicateCitations.push(pairKey);
        issues.push({
          code: 'DUPLICATE_CITATION',
          message: `Duplicate citation reference: ${pairKey}.`,
          severity: 'warning',
          field: sourceType,
          value: sourceId,
        });
      }
      seenPairs.add(pairKey);

      if (citationFailed) {
        failedCount++;
      } else {
        verifiedCount++;
      }
    }

    // Step 8: Verify bidirectional traceability
    // Each citation maps to an existing object — this is verified above
    const bidirectionalTraceability = failedCount === 0;

    if (!bidirectionalTraceability) {
      issues.push({
        code: 'BIDIRECTIONAL_TRACEABILITY_FAILED',
        message: `${failedCount} citation(s) could not be traced to existing objects.`,
        severity: 'error',
        value: `${failedCount} failed`,
      });
    }

    return {
      valid: failedCount === 0,
      issues,
      totalCitations: citations.length,
      verifiedCitations: verifiedCount,
      failedCitations: failedCount,
      orphanCitations,
      duplicateCitations,
      bidirectionalTraceability,
    };
  }

  /**
   * Extract all citation markers from content.
   * Supports both [src:type:id] and [ref:type:id] formats.
   */
  private extractAllCitations(content: string): Array<{
    sourceType: string;
    sourceId: string;
    citationStr: string;
  }> {
    const citations: Array<{ sourceType: string; sourceId: string; citationStr: string }> = [];

    // Extract [src:type:id] markers
    const srcRegex = new RegExp(SRC_CITATION_PATTERN.source, 'g');
    let srcMatch: RegExpExecArray | null;
    while ((srcMatch = srcRegex.exec(content)) !== null) {
      citations.push({
        sourceType: srcMatch[1],
        sourceId: srcMatch[2],
        citationStr: srcMatch[0],
      });
    }

    // Extract [ref:type:id] markers (legacy format)
    const refRegex = new RegExp(REF_CITATION_PATTERN.source, 'g');
    let refResult: RegExpExecArray | null;
    while ((refResult = refRegex.exec(content)) !== null) {
      const refType = refResult[1];
      const refId = refResult[2];
      const refStr = refResult[0];
      // Avoid duplicates — check if this citation was already captured
      const alreadyExists = citations.some((c) => c.sourceType === refType && c.sourceId === refId);
      if (!alreadyExists) {
        citations.push({
          sourceType: refType,
          sourceId: refId,
          citationStr: refStr,
        });
      }
    }

    return citations;
  }

  /**
   * Collect all objects from context into a flat map for lookup.
   * Key format: "type:id"
   */
  private collectContextObjects(context: {
    readonly evidence?: readonly unknown[];
    readonly [key: string]: unknown;
  }): Map<string, unknown> {
    const objects = new Map<string, unknown>();

    // Subject (Finding, Chain, RiskProfile, or ReportSummary)
    if (context.subject) {
      const subject = context.subject as { readonly id?: string; readonly [key: string]: unknown };
      // Determine subject type from fields
      let subjectType = 'finding';
      if ('findingIds' in subject) {
        subjectType = 'chain';
      } else if ('overallScore' in subject) {
        subjectType = 'risk-dimension';
      } else if ('totalFindings' in subject) {
        subjectType = 'report-meta';
      }

      if (subject.id) {
        objects.set(`${subjectType}:${subject.id}`, subject);
        // Also store under the subject type-agnostic "subject" key
        objects.set(`subject:${subject.id}`, subject);
      } else if (subjectType === 'report-meta') {
        // ExplainedReportSummary has no id field, store under "report-meta:report" key
        objects.set('report-meta:report', subject);
      }
    }

    // Evidence array
    if (context.evidence) {
      for (const ev of context.evidence) {
        const evidence = ev as { readonly id?: string; readonly [key: string]: unknown };
        if (evidence.id) {
          objects.set(`evidence:${evidence.id}`, evidence);
        }
      }
    }

    // Rule
    if (context.rule) {
      const rule = context.rule as { readonly id?: string; readonly [key: string]: unknown };
      if (rule.id) {
        objects.set(`rule:${rule.id}`, rule);
      }
    }

    // Artifact
    if (context.artifact) {
      const artifact = context.artifact as {
        readonly id?: string;
        readonly [key: string]: unknown;
      };
      if (artifact.id) {
        objects.set(`artifact:${artifact.id}`, artifact);
      }
    }

    // Risk dimensions
    if (context.risk) {
      const risk = context.risk as {
        readonly dimensions?: ReadonlyArray<{
          readonly id: string;
          readonly [key: string]: unknown;
        }>;
        readonly [key: string]: unknown;
      };
      if (risk.dimensions) {
        for (const dim of risk.dimensions) {
          if (dim.id) {
            objects.set(`risk-dimension:${dim.id}`, dim);
          }
        }
      }
    }

    return objects;
  }

  /**
   * Check if an object exists in the collected context objects.
   */
  private objectExistsInContext(
    sourceType: string,
    sourceId: string,
    allObjects: Map<string, unknown>,
  ): boolean {
    // Direct key lookup
    const key = `${sourceType}:${sourceId}`;
    if (allObjects.has(key)) {
      return true;
    }

    // For "rule-prop", check if the base rule exists
    if (sourceType === 'rule-prop' && sourceId.includes(':')) {
      const ruleId = sourceId.split(':')[0];
      return allObjects.has(`rule:${ruleId}`);
    }

    // For "report-meta", check if any report context exists
    if (sourceType === 'report-meta' && sourceId.startsWith('report:')) {
      return contextHasReport(allObjects);
    }

    return false;
  }
}

/**
 * Check if the context has any report-related objects.
 */
function contextHasReport(allObjects: Map<string, unknown>): boolean {
  for (const key of allObjects.keys()) {
    if (key.startsWith('report-meta:') || key === 'report-meta:report') {
      return true;
    }
  }
  return false;
}
