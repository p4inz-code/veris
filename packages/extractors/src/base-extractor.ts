/**
 * BaseExtractor — abstract base class for VERIS extractors.
 *
 * Provides convenience methods and enforces the Extractor contract.
 * Extend this class to create new extractors with minimal boilerplate.
 *
 * @module @veris/extractors/base-extractor
 */

import type { ArtifactType } from '@veris/core';

import type {
  Extractor,
  ExtractionContext,
  ExtractionResult,
  RawFeature,
  ExtractorRunDiagnostics,
  ExtractionIssue,
} from './types.js';
import { createRawFeature, createExtractionIssue, noIssues } from './types.js';

/** Configuration options for the base extractor. */
export interface BaseExtractorOptions {
  /** Unique extractor identifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Semver version string. */
  readonly version: string;
  /** Supported artifact types. */
  readonly supportedArtifactTypes: readonly ArtifactType[];
  /** Priority (lower = runs first, default: 500). */
  readonly priority?: number;
}

/**
 * Abstract base class for all VERIS extractors.
 *
 * @example
 * ```typescript
 * class MyExtractor extends BaseExtractor {
 *   constructor() {
 *     super({
 *       id: "my-extractor",
 *       name: "My Extractor",
 *       version: "0.1.0",
 *       supportedArtifactTypes: ["file", "binary-blob"],
 *       priority: 100,
 *     });
 *   }
 *
 *   canExtract(context: ExtractionContext): boolean {
 *     return context.artifact.size > 0;
 *   }
 *
 *   async extract(context: ExtractionContext): Promise<ExtractionResult> {
 *     return this.ok([]);
 *   }
 * }
 * ```
 */
export abstract class BaseExtractor implements Extractor {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly supportedArtifactTypes: readonly ArtifactType[];
  readonly priority: number;

  constructor(options: BaseExtractorOptions) {
    this.id = options.id;
    this.name = options.name;
    this.version = options.version;
    this.supportedArtifactTypes = Object.freeze([...options.supportedArtifactTypes]);
    this.priority = options.priority ?? 500;
  }

  /**
   * Check whether this extractor can process the given context.
   * Override to add custom matching logic.
   * Default implementation checks supportedArtifactTypes.
   */
  canExtract(context: ExtractionContext): boolean {
    return (
      this.supportedArtifactTypes.length === 0 ||
      this.supportedArtifactTypes.includes(context.artifact.type)
    );
  }

  /**
   * Extract features from the artifact.
   * MUST be overridden by subclasses.
   */
  abstract extract(context: ExtractionContext): Promise<ExtractionResult>;

  /**
   * Convenience: create a successful ExtractionResult with features.
   */
  protected ok(
    features: readonly RawFeature[],
    options?: {
      bytesProcessed?: number;
      startTime?: number;
      endTime?: number;
      issues?: readonly ExtractionIssue[];
    },
  ): ExtractionResult {
    const now = Date.now();
    return Object.freeze({
      features: Object.freeze([...features]),
      diagnostics: Object.freeze({
        extractorId: this.id,
        skipped: false,
        startTime: options?.startTime ?? now,
        endTime: options?.endTime ?? now,
        durationMs: (options?.endTime ?? now) - (options?.startTime ?? now),
        bytesProcessed: options?.bytesProcessed ?? 0,
        featuresEmitted: features.length,
        issues: options?.issues ? Object.freeze([...options.issues]) : noIssues(),
      }),
    });
  }

  /**
   * Convenience: create a single RawFeature.
   */
  protected feature(
    type: string,
    value: unknown,
    options?: {
      confidence?: number;
      metadata?: Record<string, unknown>;
    },
  ): RawFeature {
    return createRawFeature({
      extractorId: this.id,
      type,
      value,
      confidence: options?.confidence,
      metadata: options?.metadata,
    });
  }

  /**
   * Convenience: create an issue (error or warning).
   */
  protected issue(code: string, message: string, isError: boolean): ExtractionIssue {
    return createExtractionIssue(this.id, code, message, isError);
  }

  /**
   * Convenience: create an error issue.
   */
  protected error(code: string, message: string): ExtractionIssue {
    return createExtractionIssue(this.id, code, message, true);
  }

  /**
   * Convenience: create a warning issue.
   */
  protected warning(code: string, message: string): ExtractionIssue {
    return createExtractionIssue(this.id, code, message, false);
  }

  /**
   * Check cancellation or abort signal.
   * Throws if cancelled.
   */
  protected checkCancelled(context: ExtractionContext): void {
    context.cancellationToken?.throwIfCancelled();
  }
}
