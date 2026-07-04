/**
 * Artifact types for VERIS.
 *
 * An Artifact is a normalized representation of a single input unit
 * (file, archive entry, script, executable, etc.) after extraction.
 *
 * @module @veris/core/types/artifact
 */

/** Normalized artifact type classification — an open enum. */
export type ArtifactType =
  | 'file'
  | 'directory'
  | 'archive'
  | 'executable'
  | 'script'
  | 'document'
  | 'configuration'
  | 'image'
  | 'certificate'
  | 'binary-blob'
  | 'memory-region'
  | 'network-stream'
  | 'repository'
  | 'unknown';

/** Content hash value — hex-encoded SHA-256. */
export interface ContentHash {
  /** Hash algorithm used (e.g., "sha-256"). */
  readonly algorithm: string;
  /** Hex-encoded hash value (lowercase). */
  readonly value: string;
}

/**
 * Canonical Artifact — represents a single input unit after extraction.
 * Immutable after creation.
 */
export interface Artifact {
  /** Content-derived deterministic ID (prefix: "art_"). */
  readonly id: string;
  /** Owning session ID. */
  readonly sessionId: string;
  /** Parent artifact ID if extracted from another artifact (e.g., file inside archive). */
  readonly parentId: string | null;
  /** Normalized type classification. */
  readonly type: ArtifactType;
  /** Further type classification (e.g., "ELF", "PE", "Mach-O"). */
  readonly subType?: string;
  /** Original filesystem path or identifier. */
  readonly originalPath?: string;
  /** Cross-platform normalized path. */
  readonly normalizedPath: string;
  /** Size in bytes. */
  readonly size: number;
  /** SHA-256 (or BLAKE3) content hash. */
  readonly contentHash: ContentHash;
  /** Detected or declared MIME type. */
  readonly mimeType: string;
  /** Detected text encoding (for textual artifacts). */
  readonly encoding?: string;
  /** Extractor-specific metadata. */
  readonly metadata?: Record<string, unknown>;
  /** When the artifact was extracted (ISO 8601). */
  readonly extractedAt: string;
  /** ID of the extractor that produced this artifact. */
  readonly extractorId: string;
  /** Whether this artifact's extraction was truncated (partial result). */
  readonly truncated?: boolean;
}

/**
 * Create an Artifact with required fields and sensible defaults.
 * Does not compute contentHash — that must be provided.
 */
export function createArtifact(params: {
  id: string;
  sessionId: string;
  type: ArtifactType;
  normalizedPath: string;
  size: number;
  contentHash: ContentHash;
  mimeType: string;
  extractedAt: string;
  extractorId: string;
  parentId?: string | null;
  subType?: string;
  originalPath?: string;
  encoding?: string;
  metadata?: Record<string, unknown>;
  truncated?: boolean;
}): Artifact {
  return Object.freeze({
    id: params.id,
    sessionId: params.sessionId,
    parentId: params.parentId ?? null,
    type: params.type,
    subType: params.subType,
    originalPath: params.originalPath,
    normalizedPath: params.normalizedPath,
    size: params.size,
    contentHash: Object.freeze({ ...params.contentHash }),
    mimeType: params.mimeType,
    encoding: params.encoding,
    metadata: params.metadata ? Object.freeze({ ...params.metadata }) : undefined,
    extractedAt: params.extractedAt,
    extractorId: params.extractorId,
    truncated: params.truncated,
  });
}
