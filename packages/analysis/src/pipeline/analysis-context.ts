/**
 * BinaryAnalysisContext — immutable analysis context for the Binary Intelligence Pipeline.
 *
 * Carries all data needed throughout the analysis pipeline:
 * - Artifact metadata (path, size, type)
 * - Content hashes (SHA-256, MD5)
 * - MIME type and classification
 * - Parser outputs (cached after first parse)
 * - Shared evidence collection
 * - Pipeline configuration
 *
 * All fields are readonly and the context is frozen after creation.
 * Modifications produce a new context instance (immutable updates).
 *
 * @module @veris/analysis/pipeline/analysis-context
 */

import { createHash } from 'node:crypto';

import type { Artifact, SourceLocation } from '@veris/core';

import type { Evidence, EvidenceCategory } from '../types.js';

import type { ArtifactClassification } from './classification.js';
import type { PipelineConfig } from './config.js';

/** Parsed representation of an artifact's binary structure. */
export interface ParserOutput {
  /** The parser that produced this output (e.g., "pe-parser", "elf-parser"). */
  readonly parserId: string;
  /** Whether parsing succeeded. */
  readonly valid: boolean;
  /** Error message if parsing failed. */
  readonly error?: string;
  /** Parsed artifact data (schema varies by parser type). */
  readonly data: Record<string, unknown>;
}

/** Content hashes for an artifact. */
export interface ArtifactHashes {
  readonly sha256: string;
  readonly md5: string;
  readonly sha1: string;
}

/** Stage timing information. */
export interface StageTiming {
  readonly stageId: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly durationMs: number;
  readonly status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
}

/**
 * BinaryAnalysisContext — immutable context for the binary analysis pipeline.
 *
 * Created once per artifact and passed through all pipeline stages.
 * Each stage produces a new context via `with*` methods.
 */
export class BinaryAnalysisContext {
  /** The artifact being analyzed. */
  readonly artifact: Artifact;
  /** Owning session ID. */
  readonly sessionId: string;
  /** Raw binary content (null if not available). */
  readonly content: Buffer | null;
  /** Content hashes. */
  readonly hashes: Readonly<ArtifactHashes> | null;
  /** Detected MIME type. */
  readonly mimeType: string;
  /** Artifact classification (executable, script, archive, etc.). */
  readonly classification: Readonly<ArtifactClassification> | null;
  /** Parser outputs (keyed by parser ID). */
  readonly parserOutputs: Readonly<Record<string, ParserOutput>>;
  /** All evidence collected so far (deterministically ordered). */
  readonly evidence: readonly Evidence[];
  /** Pipeline configuration. */
  readonly config: Readonly<PipelineConfig>;
  /** Stage timings. */
  readonly stageTimings: Readonly<Record<string, StageTiming>>;
  /** Pipeline-level metadata (freeform, for extensibility). */
  readonly metadata: Readonly<Record<string, unknown>>;
  /** Whether this context is frozen (immutable). */
  readonly frozen: boolean;

  constructor(params: {
    artifact: Artifact;
    sessionId: string;
    content?: Buffer | null;
    hashes?: ArtifactHashes | null;
    mimeType?: string;
    classification?: ArtifactClassification | null;
    parserOutputs?: Record<string, ParserOutput>;
    evidence?: readonly Evidence[];
    config?: PipelineConfig;
    stageTimings?: Record<string, StageTiming>;
    metadata?: Record<string, unknown>;
    frozen?: boolean;
  }) {
    this.artifact = params.artifact;
    this.sessionId = params.sessionId;
    this.content = params.content ?? null;
    this.hashes = params.hashes ?? null;
    this.mimeType = params.mimeType ?? 'application/octet-stream';
    this.classification = params.classification ?? null;
    this.parserOutputs = Object.freeze({ ...(params.parserOutputs ?? {}) });
    this.evidence = Object.freeze([...(params.evidence ?? [])]);
    this.config = Object.freeze({ ...(params.config ?? {}) }) as PipelineConfig;
    this.stageTimings = Object.freeze({ ...(params.stageTimings ?? {}) });
    this.metadata = Object.freeze({ ...(params.metadata ?? {}) });
    this.frozen = true;
  }

  /** Compute content hashes from binary data. */
  static computeHashes(content: Buffer): ArtifactHashes {
    const sha256 = createHash('sha256').update(content).digest('hex');
    const md5 = createHash('md5').update(content).digest('hex');
    const sha1 = createHash('sha1').update(content).digest('hex');
    return Object.freeze({ sha256, md5, sha1 });
  }

  /** Create a new context with added evidence. */
  withEvidence(newEvidence: readonly Evidence[]): BinaryAnalysisContext {
    return new BinaryAnalysisContext({
      artifact: this.artifact,
      sessionId: this.sessionId,
      content: this.content,
      hashes: this.hashes ? { ...this.hashes } : null,
      mimeType: this.mimeType,
      classification: this.classification ? { ...this.classification } : null,
      parserOutputs: { ...this.parserOutputs },
      evidence: [...this.evidence, ...newEvidence],
      config: { ...this.config },
      stageTimings: { ...this.stageTimings },
      metadata: { ...this.metadata },
    });
  }

  /** Create a new context with a parser output. */
  withParserOutput(parserId: string, output: ParserOutput): BinaryAnalysisContext {
    return new BinaryAnalysisContext({
      artifact: this.artifact,
      sessionId: this.sessionId,
      content: this.content,
      hashes: this.hashes ? { ...this.hashes } : null,
      mimeType: this.mimeType,
      classification: this.classification ? { ...this.classification } : null,
      parserOutputs: { ...this.parserOutputs, [parserId]: output },
      evidence: [...this.evidence],
      config: { ...this.config },
      stageTimings: { ...this.stageTimings },
      metadata: { ...this.metadata },
    });
  }

  /** Create a new context with updated classification. */
  withClassification(classification: ArtifactClassification): BinaryAnalysisContext {
    return new BinaryAnalysisContext({
      artifact: this.artifact,
      sessionId: this.sessionId,
      content: this.content,
      hashes: this.hashes ? { ...this.hashes } : null,
      mimeType: classification.mimeType ?? this.mimeType,
      classification,
      parserOutputs: { ...this.parserOutputs },
      evidence: [...this.evidence],
      config: { ...this.config },
      stageTimings: { ...this.stageTimings },
      metadata: { ...this.metadata },
    });
  }

  /** Create a new context with updated stage timing. */
  withStageTiming(stageId: string, timing: StageTiming): BinaryAnalysisContext {
    return new BinaryAnalysisContext({
      artifact: this.artifact,
      sessionId: this.sessionId,
      content: this.content,
      hashes: this.hashes ? { ...this.hashes } : null,
      mimeType: this.mimeType,
      classification: this.classification ? { ...this.classification } : null,
      parserOutputs: { ...this.parserOutputs },
      evidence: [...this.evidence],
      config: { ...this.config },
      stageTimings: { ...this.stageTimings, [stageId]: timing },
      metadata: { ...this.metadata },
    });
  }

  /** Create a new context with metadata. */
  withMetadata(key: string, value: unknown): BinaryAnalysisContext {
    return new BinaryAnalysisContext({
      artifact: this.artifact,
      sessionId: this.sessionId,
      content: this.content,
      hashes: this.hashes ? { ...this.hashes } : null,
      mimeType: this.mimeType,
      classification: this.classification ? { ...this.classification } : null,
      parserOutputs: { ...this.parserOutputs },
      evidence: [...this.evidence],
      config: { ...this.config },
      stageTimings: { ...this.stageTimings },
      metadata: { ...this.metadata, [key]: value },
    });
  }

  /** Check if a parser output exists. */
  hasParserOutput(parserId: string): boolean {
    return parserId in this.parserOutputs;
  }

  /** Get a parser output by ID. */
  getParserOutput(parserId: string): ParserOutput | undefined {
    return this.parserOutputs[parserId];
  }

  /** Get evidence filtered by category. */
  getEvidenceByCategory(category: EvidenceCategory): readonly Evidence[] {
    return this.evidence.filter((e) => e.category === category);
  }

  /** Get evidence filtered by analyzer. */
  getEvidenceByAnalyzer(analyzerId: string): readonly Evidence[] {
    return this.evidence.filter((e) => e.analyzerId === analyzerId);
  }
}

/** Create a new BinaryAnalysisContext from an artifact and content. */
export function createAnalysisContext(
  artifact: Artifact,
  sessionId: string,
  content: Buffer | null,
  config?: PipelineConfig,
): BinaryAnalysisContext {
  const hashes = content ? BinaryAnalysisContext.computeHashes(content) : null;
  return new BinaryAnalysisContext({
    artifact,
    sessionId,
    content,
    hashes,
    config: config ?? {},
  });
}
