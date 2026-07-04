/**
 * Feature reference type for @veris/analysis.
 *
 * A FeatureReference is a lightweight pointer to a feature extracted by
 * the Knowledge Engine, used by analyzers to reference features without
 * requiring the full Feature type as a dependency.
 *
 * @module @veris/analysis/types-client
 */

import type { SourceLocation } from '@veris/core';

/**
 * Lightweight reference to a feature used during analysis.
 */
export interface FeatureReference {
  /** Feature ID. */
  readonly id: string;
  /** Feature type (e.g., "string-literal", "import-statement"). */
  readonly type: string;
  /** The extracted value. */
  readonly value: unknown;
  /** Confidence score [0.0, 1.0]. */
  readonly confidence: number;
  /** Source location in the artifact. */
  readonly location?: SourceLocation;
  /** Feature metadata. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}
