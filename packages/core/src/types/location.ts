/**
 * Source location types for VERIS.
 *
 * Represents a location within a source file or binary artifact.
 *
 * @module @veris/core/types/location
 */

/**
 * A specific location within an artifact.
 * All coordinates are 1-based for lines, 0-based for columns.
 */
export interface SourceLocation {
  /** 1-based start line number. */
  readonly startLine: number;
  /** 0-based start column number. */
  readonly startColumn: number;
  /** 1-based end line number. Must be >= startLine. */
  readonly endLine: number;
  /** 0-based end column number. */
  readonly endColumn: number;
  /** Byte offset from the start of the artifact (0-based). */
  readonly offset: number;
  /** Length in bytes. */
  readonly length: number;
  /** Optional surrounding context snippet. */
  readonly context?: string;
}

/**
 * Create a SourceLocation with validation.
 * Ensures endLine >= startLine and non-negative coordinates.
 */
export function createSourceLocation(params: {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  offset: number;
  length: number;
  context?: string;
}): SourceLocation {
  const { startLine, startColumn, endLine, endColumn, offset, length, context } = params;

  if (startLine < 1) throw new Error('startLine must be >= 1');
  if (endLine < startLine) throw new Error('endLine must be >= startLine');
  if (startColumn < 0) throw new Error('startColumn must be >= 0');
  if (endColumn < 0) throw new Error('endColumn must be >= 0');
  if (offset < 0) throw new Error('offset must be >= 0');
  if (length < 0) throw new Error('length must be >= 0');

  return { startLine, startColumn, endLine, endColumn, offset, length, context };
}

/** A lightweight reference to an artifact at a specific location. */
export interface ArtifactRef {
  /** The artifact ID being referenced. */
  readonly artifactId: string;
  /** Specific location within the artifact. */
  readonly location: SourceLocation;
  /** How this artifact relates to the finding. */
  readonly relationship: 'primary' | 'related' | 'contextual';
}
