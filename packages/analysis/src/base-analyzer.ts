/**
 * BaseAnalyzer — abstract base class for VERIS analyzers.
 *
 * Provides convenience methods and enforces the Analyzer contract.
 * Extend this class to create new analyzers with minimal boilerplate.
 *
 * @module @veris/analysis/base-analyzer
 */

import type { SourceLocation } from '@veris/core';
import { deterministicId } from '@veris/shared';

import type {
  Analyzer,
  AnalysisContext,
  AnalysisResult,
  Evidence,
  AnalysisIssue,
  EvidenceCategory,
} from './types.js';
import { createEvidence, createAnalysisIssue, noIssues } from './types.js';

/** Configuration options for the base analyzer. */
export interface BaseAnalyzerOptions {
  /** Unique analyzer identifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Semver version string. */
  readonly version: string;
  /** Supported artifact types. */
  readonly supportedArtifactTypes: readonly string[];
  /** Priority (lower = runs first, default: 500). */
  readonly priority?: number;
}

/**
 * Abstract base class for all VERIS analyzers.
 *
 * @example
 * ```typescript
 * class MyAnalyzer extends BaseAnalyzer {
 *   constructor() {
 *     super({
 *       id: "my-analyzer",
 *       name: "My Analyzer",
 *       version: "0.1.0",
 *       supportedArtifactTypes: ["executable", "file"],
 *       priority: 100,
 *     });
 *   }
 *
 *   canAnalyze(context: AnalysisContext): boolean {
 *     return context.artifact.size > 0;
 *   }
 *
 *   async analyze(context: AnalysisContext): Promise<AnalysisResult> {
 *     return this.ok([]);
 *   }
 * }
 * ```
 */
export abstract class BaseAnalyzer implements Analyzer {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly supportedArtifactTypes: readonly string[];
  readonly priority: number;

  constructor(options: BaseAnalyzerOptions) {
    this.id = options.id;
    this.name = options.name;
    this.version = options.version;
    this.supportedArtifactTypes = Object.freeze([...options.supportedArtifactTypes]);
    this.priority = options.priority ?? 500;
  }

  /**
   * Check whether this analyzer can process the given context.
   * Override to add custom matching logic.
   * Default implementation checks supportedArtifactTypes.
   */
  canAnalyze(context: AnalysisContext): boolean {
    return (
      this.supportedArtifactTypes.length === 0 ||
      this.supportedArtifactTypes.includes(context.artifact.type)
    );
  }

  /**
   * Analyze the artifact and produce evidence.
   * MUST be overridden by subclasses.
   */
  abstract analyze(context: AnalysisContext): Promise<AnalysisResult>;

  /**
   * Convenience: create a successful AnalysisResult with evidence.
   */
  protected ok(
    evidence: readonly Evidence[],
    options?: {
      startTime?: number;
      endTime?: number;
      issues?: readonly AnalysisIssue[];
    },
  ): AnalysisResult {
    const now = Date.now();
    return Object.freeze({
      evidence: Object.freeze([...evidence]),
      diagnostics: Object.freeze({
        analyzerId: this.id,
        skipped: false,
        startTime: options?.startTime ?? now,
        endTime: options?.endTime ?? now,
        durationMs: (options?.endTime ?? now) - (options?.startTime ?? now),
        evidenceEmitted: evidence.length,
        issues: options?.issues ? Object.freeze([...options.issues]) : noIssues(),
      }),
    });
  }

  /**
   * Convenience: create a single Evidence item with a deterministic ID.
   *
   * @param artifactId - The artifact this evidence relates to
   * @param category - Evidence category
   * @param type - Evidence type string
   * @param explanation - Human-readable WHY explanation
   * @param options - Optional fields
   */
  protected makeEvidence(
    artifactId: string,
    category: EvidenceCategory,
    type: string,
    explanation: string,
    options?: {
      confidence?: number;
      featureIds?: readonly string[];
      locations?: readonly SourceLocation[];
      metadata?: Record<string, unknown>;
    },
  ): Evidence {
    const idInput = `${artifactId}\0${type}\0${explanation}\0${options?.confidence ?? 1.0}\0${this.id}`;
    const id = deterministicId('ev', idInput);

    return createEvidence({
      id,
      artifactId,
      featureIds: options?.featureIds,
      category,
      type,
      confidence: options?.confidence ?? 1.0,
      locations: options?.locations,
      explanation,
      metadata: options?.metadata,
      analyzerId: this.id,
    });
  }

  /**
   * Convenience: create an issue (error or warning).
   */
  protected issue(code: string, message: string, isError: boolean): AnalysisIssue {
    return createAnalysisIssue(this.id, code, message, isError);
  }

  /**
   * Convenience: create an error issue.
   */
  protected error(code: string, message: string): AnalysisIssue {
    return createAnalysisIssue(this.id, code, message, true);
  }

  /**
   * Convenience: create a warning issue.
   */
  protected warning(code: string, message: string): AnalysisIssue {
    return createAnalysisIssue(this.id, code, message, false);
  }

  /**
   * Check cancellation or abort signal.
   * Throws if cancelled.
   */
  protected checkCancelled(context: AnalysisContext): void {
    context.cancellationToken?.throwIfCancelled();
  }
}
