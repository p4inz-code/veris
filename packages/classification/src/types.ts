/**
 * Classification types for @veris/classification.
 *
 * @module @veris/classification/types
 */

import type { DiscoveredArtifact } from '@veris/core';

/** Classification category string. */
export type ClassificationCategory =
  | 'script'
  | 'executable'
  | 'source-code'
  | 'archive'
  | 'configuration'
  | 'binary'
  | 'certificate'
  | 'document'
  | 'image'
  | 'directory'
  | 'unknown';

/** All classification categories in a frozen array. */
export const ALL_CATEGORIES: readonly ClassificationCategory[] = [
  'script',
  'executable',
  'source-code',
  'archive',
  'configuration',
  'binary',
  'certificate',
  'document',
  'image',
  'directory',
  'unknown',
] as const;

/** Classification signal type. */
export type SignalType =
  'magic-bytes' | 'file-signature' | 'mime' | 'extension' | 'shebang' | 'bom' | 'content-sampling';

/** A single signal's contribution to a classification. */
export interface SignalContribution {
  /** The signal type. */
  readonly signal: SignalType;
  /** The detected classification category. */
  readonly category: string;
  /** The confidence contributed by this signal [0.0, 1.0]. */
  readonly confidence: number;
  /** A human-readable description of what was detected. */
  readonly detail: string;
}

/** The result of a single signal detector. */
export interface SignalResult {
  /** Whether the signal could be detected. */
  readonly detected: boolean;
  /** The detected category or null if not detected. */
  readonly category: string | null;
  /** The sub-type (e.g., "ELF64", "Python3") or null. */
  readonly subType: string | null;
  /** Confidence in this detection [0.0, 1.0]. */
  readonly confidence: number;
  /** A human-readable detail string. */
  readonly detail: string;
  /** Whether the MIME type was detected (for MIME signal). */
  readonly mimeType?: string;
  /** Whether the encoding was detected. */
  readonly encoding?: string;
}

/** The weight of a signal type in the voting process. */
export interface SignalWeight {
  readonly signal: SignalType;
  readonly weight: number;
}

/** Default signal weights by priority (from SPEC-004 §4.1). */
export const DEFAULT_SIGNAL_WEIGHTS: readonly SignalWeight[] = [
  { signal: 'magic-bytes', weight: 100 },
  { signal: 'file-signature', weight: 90 },
  { signal: 'mime', weight: 80 },
  { signal: 'shebang', weight: 75 },
  { signal: 'bom', weight: 40 },
  { signal: 'extension', weight: 50 },
  { signal: 'content-sampling', weight: 25 },
] as const;

/** Classification result for a single artifact. */
export interface ClassificationResult {
  /** The artifact ID that was classified. */
  readonly artifactId: string;
  /** The artifact's absolute path (for reference). */
  readonly absolutePath: string;
  /** The primary classification category. */
  readonly category: ClassificationCategory;
  /** The sub-type classification (e.g., "ELF64", "PE32+", "Python3"). */
  readonly subType: string | null;
  /** The detected MIME type. */
  readonly mimeType: string;
  /** The detected text encoding, if applicable. */
  readonly encoding: string | null;
  /** Overall classification confidence [0.0, 1.0]. */
  readonly confidence: number;
  /** All signals that contributed to this classification. */
  readonly signals: readonly SignalContribution[];
  /** Diagnostic trace of the classification reasoning. */
  readonly diagnostics: ClassificationDiagnostics;
}

/** Diagnostic trace for a classification decision. */
export interface ClassificationDiagnostics {
  /** The final weighted score for the chosen category. */
  readonly finalScore: number;
  /** Scores for each candidate category. */
  readonly categoryScores: Record<string, number>;
  /** Which signals fired and their contributions. */
  readonly signalResults: readonly SignalResult[];
  /** Reasoning metadata explaining the classification. */
  readonly reasoning: string;
}

/** Magic byte patterns for file format detection. */
export interface MagicBytePattern {
  /** Byte offset to check. */
  readonly offset: number;
  /** The byte sequence to match (as hex string, e.g., "7f454c46"). */
  readonly bytes: string;
  /** Mask to apply before matching (hex string, e.g., "ffffffff"). */
  readonly mask?: string;
  /** The detected category. */
  readonly category: ClassificationCategory;
  /** The detected sub-type. */
  readonly subType: string | null;
  /** The MIME type. */
  readonly mimeType: string;
  /** Weight/confidence of this match. */
  readonly confidence: number;
  /** Human-readable name of the format. */
  readonly name: string;
}

/** Configuration for the classification engine. */
export interface ClassificationConfig {
  /** Whether to enable magic bytes detection. Default: true. */
  readonly enableMagicBytes?: boolean;
  /** Whether to enable file signature detection. Default: true. */
  readonly enableFileSignature?: boolean;
  /** Whether to enable MIME detection. Default: true. */
  readonly enableMime?: boolean;
  /** Whether to enable extension heuristics. Default: true. */
  readonly enableExtension?: boolean;
  /** Whether to enable shebang detection. Default: true. */
  readonly enableShebang?: boolean;
  /** Whether to enable BOM detection. Default: true. */
  readonly enableBom?: boolean;
  /** Whether to enable content sampling. Default: true. */
  readonly enableContentSampling?: boolean;
  /** Minimum confidence threshold for classification [0.0, 1.0]. Default: 0.1. */
  readonly minConfidence?: number;
  /** Maximum bytes to read for magic byte detection. Default: 64. */
  readonly maxMagicBytesRead?: number;
  /** Maximum bytes to read for content sampling. Default: 4096. */
  readonly maxContentSampleBytes?: number;
}

/** Default classification configuration. */
export const DEFAULT_CLASSIFICATION_CONFIG: Required<ClassificationConfig> = {
  enableMagicBytes: true,
  enableFileSignature: true,
  enableMime: true,
  enableExtension: true,
  enableShebang: true,
  enableBom: true,
  enableContentSampling: true,
  minConfidence: 0.1,
  maxMagicBytesRead: 64,
  maxContentSampleBytes: 4096,
} as const;
