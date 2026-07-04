/**
 * FeatureNormalizer — normalizes raw extracted features into canonical Feature objects.
 *
 * The normalization pipeline:
 * 1. Canonicalize — Map extractor-specific types to canonical FeatureType
 * 2. Normalize Values — Transform values to canonical FeatureValue format
 * 3. Enrich — Add context (surrounding code, computed metadata)
 * 4. Validate — Schema validation, bounds checking
 * 5. Deduplicate — Remove duplicate features within an artifact
 *
 * @module @veris/knowledge/feature/normalizer
 */

import { deterministicId, type Result, ok, err } from '@veris/shared';

import { FeatureBuilder } from './builder.js';
import type {
  Feature,
  FeatureType,
  FeatureValue,
  Provenance,
  NormalizationError,
  SourceLocation,
} from './types.js';
import { validateFeature } from './validator.js';

/**
 * Raw feature input from an extractor — pre-normalization.
 */
export interface RawFeature {
  /** Extractor-specific feature type (e.g., "python-function-call", "pe-import"). */
  readonly rawType: string;
  /** The extracted value. */
  readonly rawValue: unknown;
  /** Source location in the artifact (with path). */
  readonly location: SourceLocation;
  /** Raw confidence [0.0, 1.0]. */
  readonly confidence: number;
  /** Extractor metadata. */
  readonly metadata?: Record<string, unknown>;
}

/** A normalization rule that maps raw types to canonical types. */
export interface NormalizationRule {
  /** The raw type pattern (glob-style matching supported). */
  readonly rawTypePattern: string;
  /** Target canonical FeatureType. */
  readonly targetType: FeatureType;
  /** Optional value transformer. */
  readonly transform?: (value: unknown) => FeatureValue;
}

/** Configuration for a FeatureNormalizer. */
export interface FeatureNormalizerConfig {
  /** Custom normalization rules (merged with defaults). */
  readonly rules?: NormalizationRule[];
  /** Whether to enrich features with surrounding context. */
  readonly enableEnrichment?: boolean;
  /** Whether to deduplicate features (default: true). */
  readonly enableDeduplication?: boolean;
}

/** Default normalization rules for common extractor patterns. */
const DEFAULT_RULES: readonly NormalizationRule[] = [
  { rawTypePattern: 'string-literal', targetType: 'string-literal' },
  { rawTypePattern: 'numeric-literal', targetType: 'numeric-literal' },
  { rawTypePattern: 'boolean-literal', targetType: 'boolean-literal' },
  { rawTypePattern: 'identifier', targetType: 'identifier' },
  { rawTypePattern: 'function-call', targetType: 'function-call' },
  { rawTypePattern: 'import-statement', targetType: 'import-statement' },
  { rawTypePattern: 'url', targetType: 'url' },
  { rawTypePattern: 'ip-address', targetType: 'ip-address' },
  { rawTypePattern: 'domain-name', targetType: 'domain-name' },
  { rawTypePattern: 'file-path', targetType: 'file-path' },
  { rawTypePattern: 'registry-key', targetType: 'registry-key' },
  { rawTypePattern: 'environment-variable', targetType: 'environment-variable' },
  { rawTypePattern: 'system-call', targetType: 'system-call' },
  { rawTypePattern: 'api-call', targetType: 'api-call' },
  { rawTypePattern: 'control-flow', targetType: 'control-flow' },
  { rawTypePattern: 'data-flow', targetType: 'data-flow' },
  { rawTypePattern: 'string-pattern', targetType: 'string-pattern' },
  { rawTypePattern: 'binary-pattern', targetType: 'binary-pattern' },
  { rawTypePattern: 'section-header', targetType: 'section-header' },
  { rawTypePattern: 'symbol', targetType: 'symbol' },
  { rawTypePattern: 'metadata-field', targetType: 'metadata-field' },
  { rawTypePattern: 'annotation', targetType: 'annotation' },
  // Python-specific patterns
  { rawTypePattern: 'python-function-call', targetType: 'function-call' },
  { rawTypePattern: 'python-import', targetType: 'import-statement' },
  { rawTypePattern: 'python-string', targetType: 'string-literal' },
  // JS-specific patterns
  { rawTypePattern: 'js-function-call', targetType: 'function-call' },
  { rawTypePattern: 'js-import', targetType: 'import-statement' },
  { rawTypePattern: 'js-string', targetType: 'string-literal' },
  // PE-specific patterns
  { rawTypePattern: 'pe-import', targetType: 'import-statement' },
  { rawTypePattern: 'pe-export', targetType: 'export-statement' },
  { rawTypePattern: 'pe-section', targetType: 'section-header' },
  // ELF-specific patterns
  { rawTypePattern: 'elf-import', targetType: 'import-statement' },
  { rawTypePattern: 'elf-symbol', targetType: 'symbol' },
  { rawTypePattern: 'elf-section', targetType: 'section-header' },
];

/**
 * Determines whether a raw type matches a pattern.
 * Supports exact match and prefix match with "*" wildcard.
 */
function matchesPattern(rawType: string, pattern: string): boolean {
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return rawType.startsWith(prefix);
  }
  return rawType === pattern;
}

/**
 * Converts a raw value to a canonical FeatureValue.
 * Tries to infer the kind from the JavaScript type.
 */
function toCanonicalValue(raw: unknown): FeatureValue {
  if (typeof raw === 'string') {
    return { kind: 'string', value: raw };
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return { kind: 'number', value: raw };
  }
  if (typeof raw === 'boolean') {
    return { kind: 'boolean', value: raw };
  }
  if (raw === null || raw === undefined) {
    return { kind: 'string', value: '' };
  }
  if (Array.isArray(raw)) {
    return { kind: 'array', values: raw.map(toCanonicalValue) };
  }
  if (typeof raw === 'object') {
    const entries: Record<string, FeatureValue> = {};
    for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
      entries[key] = toCanonicalValue(val);
    }
    return { kind: 'map', entries };
  }
  return { kind: 'string', value: String(raw) };
}

/**
 * FeatureNormalizer — normalizes raw extracted features into canonical Features.
 */
export class FeatureNormalizer {
  private readonly _rules: readonly NormalizationRule[];
  private readonly _enableEnrichment: boolean;
  private readonly _enableDeduplication: boolean;
  private readonly _seenIds: Set<string>;

  constructor(config?: FeatureNormalizerConfig) {
    this._rules = [...DEFAULT_RULES, ...(config?.rules ?? [])];
    this._enableEnrichment = config?.enableEnrichment ?? false;
    this._enableDeduplication = config?.enableDeduplication ?? true;
    this._seenIds = new Set();
  }

  /**
   * Normalize a single raw feature into a canonical Feature.
   */
  normalize(
    rawFeature: RawFeature,
    artifactId: string,
    sessionId: string,
    provenance: Provenance,
  ): Result<Feature, NormalizationError> {
    // Find matching normalization rule
    const rule = this._rules.find((r) => matchesPattern(rawFeature.rawType, r.rawTypePattern));

    if (!rule) {
      return err({
        code: 'NO_MATCHING_RULE',
        message: `No normalization rule found for raw type: "${rawFeature.rawType}"`,
        raw: rawFeature,
      });
    }

    // Convert value
    const canonicalValue = rule.transform
      ? rule.transform(rawFeature.rawValue)
      : toCanonicalValue(rawFeature.rawValue);

    // Clamp confidence
    const confidence = Math.max(0, Math.min(1, rawFeature.confidence));

    // Enrich if enabled
    const enrichedMetadata: Record<string, unknown> = { ...rawFeature.metadata };
    if (this._enableEnrichment) {
      enrichedMetadata['normalizedRawType'] = rawFeature.rawType;
      if (typeof rawFeature.rawValue === 'string') {
        enrichedMetadata['valueLength'] = rawFeature.rawValue.length;
      }
    }

    // Build the feature
    const builder = new FeatureBuilder();
    const feature = builder
      .withArtifactId(artifactId)
      .withSessionId(sessionId)
      .withType(rule.targetType)
      .withValue(canonicalValue)
      .withLocation(rawFeature.location)
      .withConfidence(confidence)
      .withProvenance(provenance)
      .withMetadata(Object.keys(enrichedMetadata).length > 0 ? enrichedMetadata : {})
      .build();

    // Check for duplicates
    if (this._enableDeduplication) {
      if (this._seenIds.has(feature.id)) {
        return err({
          code: 'DUPLICATE_FEATURE',
          message: `Duplicate feature with ID: "${feature.id}"`,
          feature,
          raw: rawFeature,
        });
      }
      this._seenIds.add(feature.id);
    }

    // Validate the feature
    const validationResult = validateFeature(feature);
    if (!validationResult.ok) {
      return err({
        code: 'VALIDATION_FAILED',
        message: `Feature validation failed: ${validationResult.error.map((e) => e.message).join('; ')}`,
        feature,
        raw: rawFeature,
      });
    }

    return ok(feature);
  }

  /**
   * Normalize a batch of raw features.
   */
  normalizeBatch(
    rawFeatures: readonly RawFeature[],
    artifactId: string,
    sessionId: string,
    provenance: Provenance,
  ): { normalized: Feature[]; errors: NormalizationError[]; deduplicated: number } {
    const normalized: Feature[] = [];
    const errors: NormalizationError[] = [];
    let deduplicated = 0;

    for (const raw of rawFeatures) {
      const result = this.normalize(raw, artifactId, sessionId, provenance);
      if (result.ok) {
        normalized.push(result.value);
      } else {
        if (result.error.code === 'DUPLICATE_FEATURE') {
          deduplicated++;
        }
        errors.push(result.error);
      }
    }

    return { normalized, errors, deduplicated };
  }

  /** Reset the deduplication cache (call between artifacts). */
  resetCache(): void {
    this._seenIds.clear();
  }

  /** Get the current normalization rules. */
  getRules(): readonly NormalizationRule[] {
    return this._rules;
  }
}
