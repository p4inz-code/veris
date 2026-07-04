/**
 * @veris/classification — VERIS deterministic multi-signal artifact classification engine.
 *
 * Provides artifact type classification using weighted voting from multiple signals:
 * magic bytes, file signatures, MIME type, extension, shebang, BOM, and content sampling.
 *
 * ## Invariants
 * - Never classifies using extension alone
 * - Deterministic: same artifact produces the same classification
 * - Multi-signal: always uses ≥ 3 signals when available
 * - Diagnostic: every decision includes full reasoning trace
 *
 * @module @veris/classification
 */

// Types
export type {
  ClassificationCategory,
  SignalType,
  SignalContribution,
  SignalResult,
  SignalWeight,
  ClassificationResult,
  ClassificationDiagnostics,
  ClassificationConfig,
  MagicBytePattern,
} from './types.js';
export { DEFAULT_SIGNAL_WEIGHTS, DEFAULT_CLASSIFICATION_CONFIG, ALL_CATEGORIES } from './types.js';

// Categories

// Engine
export { ClassificationEngine } from './classifier.js';

// Signal detectors
export {
  detectMagicBytes,
  detectFileSignature,
  detectMimeByExtension,
  detectShebang,
  detectExtension,
  detectBOM,
  detectContentSampling,
} from './signals.js';

// Magic byte database
export {
  MAGIC_BYTE_PATTERNS,
  SHEBANG_PATTERNS,
  BOM_PATTERNS,
  EXTENSION_MIME_MAP,
  EXTENSION_CATEGORY_MAP,
} from './magic-bytes.js';
