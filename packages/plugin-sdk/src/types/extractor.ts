/**
 * Extractor Plugin Contract and Types.
 *
 * @module @veris/plugin-sdk/types/extractor
 */

import type { PluginCancellationToken, PluginLogger } from './context.js';
import type { Plugin, PluginLifecycle } from './lifecycle.js';
import type { PluginManifest } from './manifest.js';

/**
 * Source location within an artifact (e.g. byte offset or line/column coordinates).
 */
export interface SourceLocation {
  readonly offset?: number;
  readonly length?: number;
  readonly line?: number;
  readonly column?: number;
  readonly endLine?: number;
  readonly endColumn?: number;
}

/**
 * Descriptive metadata of an artifact under scan.
 */
export interface ArtifactInfo {
  /** Unique artifact ID assigned by the host discovery stage. */
  readonly id: string;
  /** Normalized path of the target file. */
  readonly path: string;
  /** Base filename. */
  readonly name: string;
  /** Size in bytes. */
  readonly size: number;
  /** Detected MIME type (if classified). */
  readonly mimeType?: string;
  /** Primary artifact category/type. */
  readonly type?: string;
  /** Content hash (SHA-256) computed deterministically. */
  readonly hash?: string;
  /** Additional discovery metadata. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Raw factual feature emitted by an external extractor plugin.
 *
 * CRITICAL INVARIANT:
 * Extractor plugins produce raw observable facts only. Extractors NEVER produce
 * Findings, assign CVEs, evaluate policy, or compute Risk/Confidence scores.
 * Interpretation and correlation is the exclusive responsibility of the downstream rules engine.
 */
export interface PluginRawFeature {
  /** The extractor ID that produced this feature. */
  readonly extractorId: string;

  /** Domain-specific feature type (e.g. "mach-o:dylib", "script:eval-token"). */
  readonly type: string;

  /** Extracted value. Must be JSON-serializable and deterministic. */
  readonly value: unknown;

  /** Extractor confidence in the factual observation [0.0, 1.0]. */
  readonly confidence: number;

  /** Optional source location in the artifact. */
  readonly location?: SourceLocation;

  /** Optional structured metadata dictionary. Must be JSON-serializable. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Context passed to an ExtractorPlugin during artifact analysis.
 */
export interface PluginExtractionContext {
  /** Descriptive metadata for the target artifact. */
  readonly artifact: Readonly<ArtifactInfo>;

  /**
   * Raw artifact content buffer.
   * `null` if the target could not be read or target-read permission was denied.
   */
  readonly content: Uint8Array | null;

  /** Scoped diagnostic logger. */
  readonly logger: PluginLogger;

  /** Scoped configuration dictionary. */
  readonly config: Readonly<Record<string, unknown>>;

  /** Optional cooperative cancellation token. */
  readonly cancellationToken?: PluginCancellationToken;
}

/**
 * Extractor Plugin contract.
 *
 * Implemented by third-party packages to extend VERIS with custom file parsers.
 * Extractors must be referentially transparent, stateless, and deterministic.
 */
export interface ExtractorPlugin extends Plugin {
  readonly type: 'extractor';

  /** Supported artifact types (e.g. ['executable', 'pe', 'archive']). */
  readonly supportedArtifactTypes?: readonly string[];

  /**
   * Fast, synchronous heuristic check whether this extractor applies to the artifact.
   * MUST NOT perform I/O.
   */
  canExtract?(context: PluginExtractionContext): boolean;

  /**
   * Execute extraction and return raw factual features.
   * MUST be deterministic and side-effect free.
   */
  extract(context: PluginExtractionContext): Promise<readonly PluginRawFeature[]>;
}

/**
 * Authoring options for defining an extractor plugin.
 */
export interface ExtractorPluginDefinition {
  readonly manifest: PluginManifest;
  readonly supportedArtifactTypes?: readonly string[];
  readonly lifecycle?: PluginLifecycle;
  canExtract?(context: PluginExtractionContext): boolean;
  extract(context: PluginExtractionContext): Promise<readonly PluginRawFeature[]>;
}
