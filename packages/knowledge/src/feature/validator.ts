/**
 * FeatureValidator — validates Feature objects against schema rules.
 *
 * Validates:
 * - Required fields are present and non-empty
 * - Confidence is in [0.0, 1.0]
 * - Location coordinates are valid
 * - FeatureType is a known type
 * - FeatureValue matches its kind
 * - Provenance is complete
 *
 * @module @veris/knowledge/feature/validator
 */

import { type Result, ok, err } from '@veris/shared';

import type { Feature, FeatureType, FeatureValue, ValidationError } from './types.js';

/** All known canonical feature types. */
const KNOWN_FEATURE_TYPES: ReadonlySet<string> = new Set([
  'string-literal',
  'numeric-literal',
  'boolean-literal',
  'identifier',
  'function-call',
  'import-statement',
  'export-statement',
  'url',
  'ip-address',
  'domain-name',
  'file-path',
  'registry-key',
  'environment-variable',
  'permission',
  'capability',
  'system-call',
  'api-call',
  'control-flow',
  'data-flow',
  'string-pattern',
  'binary-pattern',
  'section-header',
  'symbol',
  'metadata-field',
  'annotation',
]);

/**
 * Validates a single Feature.
 * Returns Ok(feature) or Err(ValidationError[]).
 */
export function validateFeature(feature: Feature): Result<Feature, ValidationError[]> {
  const errors: ValidationError[] = [];

  // Check required fields are non-empty
  if (!feature.id || typeof feature.id !== 'string') {
    errors.push({ code: 'MISSING_ID', message: 'Feature must have a non-empty id', field: 'id' });
  }

  if (!feature.artifactId || typeof feature.artifactId !== 'string') {
    errors.push({
      code: 'MISSING_ARTIFACT_ID',
      message: 'Feature must have a non-empty artifactId',
      field: 'artifactId',
    });
  }

  if (!feature.sessionId || typeof feature.sessionId !== 'string') {
    errors.push({
      code: 'MISSING_SESSION_ID',
      message: 'Feature must have a non-empty sessionId',
      field: 'sessionId',
    });
  }

  // Validate type
  if (!feature.type) {
    errors.push({ code: 'MISSING_TYPE', message: 'Feature must have a type', field: 'type' });
  } else if (!KNOWN_FEATURE_TYPES.has(feature.type)) {
    errors.push({
      code: 'UNKNOWN_TYPE',
      message: `Unknown feature type: "${feature.type}"`,
      field: 'type',
      value: feature.type,
    });
  }

  // Validate value
  if (!feature.value) {
    errors.push({ code: 'MISSING_VALUE', message: 'Feature must have a value', field: 'value' });
  } else {
    const valueErrors = validateFeatureValue(feature.value);
    errors.push(...valueErrors);
  }

  // Validate location
  if (!feature.location) {
    errors.push({
      code: 'MISSING_LOCATION',
      message: 'Feature must have a location',
      field: 'location',
    });
  } else {
    const loc = feature.location;
    if (loc.startLine < 1)
      errors.push({
        code: 'INVALID_START_LINE',
        message: 'startLine must be >= 1',
        field: 'location.startLine',
        value: loc.startLine,
      });
    if (loc.endLine < loc.startLine)
      errors.push({
        code: 'INVALID_END_LINE',
        message: 'endLine must be >= startLine',
        field: 'location.endLine',
        value: loc.endLine,
      });
    if (loc.startColumn < 0)
      errors.push({
        code: 'INVALID_START_COLUMN',
        message: 'startColumn must be >= 0',
        field: 'location.startColumn',
        value: loc.startColumn,
      });
    if (loc.endColumn < 0)
      errors.push({
        code: 'INVALID_END_COLUMN',
        message: 'endColumn must be >= 0',
        field: 'location.endColumn',
        value: loc.endColumn,
      });
    if (loc.offset < 0)
      errors.push({
        code: 'INVALID_OFFSET',
        message: 'offset must be >= 0',
        field: 'location.offset',
        value: loc.offset,
      });
    if (loc.length < 0)
      errors.push({
        code: 'INVALID_LENGTH',
        message: 'length must be >= 0',
        field: 'location.length',
        value: loc.length,
      });
  }

  // Validate confidence
  if (feature.confidence === undefined || feature.confidence === null) {
    errors.push({
      code: 'MISSING_CONFIDENCE',
      message: 'Feature must have a confidence',
      field: 'confidence',
    });
  } else if (
    typeof feature.confidence !== 'number' ||
    feature.confidence < 0 ||
    feature.confidence > 1
  ) {
    errors.push({
      code: 'INVALID_CONFIDENCE',
      message: `Confidence must be in [0.0, 1.0], got ${feature.confidence}`,
      field: 'confidence',
      value: feature.confidence,
    });
  }

  // Validate provenance
  if (!feature.provenance) {
    errors.push({
      code: 'MISSING_PROVENANCE',
      message: 'Feature must have provenance',
      field: 'provenance',
    });
  } else {
    if (!feature.provenance.extractorId)
      errors.push({
        code: 'MISSING_EXTRACTOR_ID',
        message: 'Provenance must have extractorId',
        field: 'provenance.extractorId',
      });
    if (!feature.provenance.extractorVersion)
      errors.push({
        code: 'MISSING_EXTRACTOR_VERSION',
        message: 'Provenance must have extractorVersion',
        field: 'provenance.extractorVersion',
      });
    if (!feature.provenance.extractedAt)
      errors.push({
        code: 'MISSING_EXTRACTED_AT',
        message: 'Provenance must have extractedAt',
        field: 'provenance.extractedAt',
      });
    if (!feature.provenance.normalizedAt)
      errors.push({
        code: 'MISSING_NORMALIZED_AT',
        message: 'Provenance must have normalizedAt',
        field: 'provenance.normalizedAt',
      });
    if (!feature.provenance.normalizedBy)
      errors.push({
        code: 'MISSING_NORMALIZED_BY',
        message: 'Provenance must have normalizedBy',
        field: 'provenance.normalizedBy',
      });
  }

  if (errors.length > 0) {
    return err(errors);
  }

  return ok(feature);
}

/**
 * Validate a FeatureValue structure.
 */
function validateFeatureValue(value: FeatureValue): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!value.kind) {
    errors.push({
      code: 'MISSING_VALUE_KIND',
      message: 'FeatureValue must have a kind',
      field: 'value.kind',
    });
    return errors;
  }

  switch (value.kind) {
    case 'string':
      if (typeof value.value !== 'string') {
        errors.push({
          code: 'INVALID_STRING_VALUE',
          message: 'string value must be a string',
          field: 'value.value',
        });
      }
      break;
    case 'number':
      if (typeof value.value !== 'number' || !Number.isFinite(value.value)) {
        errors.push({
          code: 'INVALID_NUMBER_VALUE',
          message: 'number value must be a finite number',
          field: 'value.value',
        });
      }
      break;
    case 'boolean':
      if (typeof value.value !== 'boolean') {
        errors.push({
          code: 'INVALID_BOOLEAN_VALUE',
          message: 'boolean value must be a boolean',
          field: 'value.value',
        });
      }
      break;
    case 'bytes':
      if (typeof value.value !== 'string')
        errors.push({
          code: 'INVALID_BYTES_VALUE',
          message: 'bytes value must be a string',
          field: 'value.value',
        });
      if (value.encoding !== 'base64' && value.encoding !== 'hex') {
        errors.push({
          code: 'INVALID_BYTES_ENCODING',
          message: "bytes encoding must be 'base64' or 'hex'",
          field: 'value.encoding',
          value: value.encoding,
        });
      }
      break;
    case 'array':
      if (!Array.isArray(value.values)) {
        errors.push({
          code: 'INVALID_ARRAY_VALUE',
          message: 'array values must be an array',
          field: 'value.values',
        });
      } else {
        for (let i = 0; i < value.values.length; i++) {
          errors.push(...validateFeatureValue(value.values[i]));
        }
      }
      break;
    case 'map':
      if (typeof value.entries !== 'object' || value.entries === null) {
        errors.push({
          code: 'INVALID_MAP_VALUE',
          message: 'map entries must be an object',
          field: 'value.entries',
        });
      } else {
        for (const [key, val] of Object.entries(value.entries)) {
          if (typeof key !== 'string') {
            errors.push({
              code: 'INVALID_MAP_KEY',
              message: 'map keys must be strings',
              field: 'value.entries',
            });
          }
          errors.push(...validateFeatureValue(val));
        }
      }
      break;
    case 'regex-match':
      if (typeof value.pattern !== 'string')
        errors.push({
          code: 'INVALID_REGEX_PATTERN',
          message: 'regex pattern must be a string',
          field: 'value.pattern',
        });
      if (typeof value.match !== 'string')
        errors.push({
          code: 'INVALID_REGEX_MATCH',
          message: 'regex match must be a string',
          field: 'value.match',
        });
      if (typeof value.groups !== 'object' || value.groups === null) {
        errors.push({
          code: 'INVALID_REGEX_GROUPS',
          message: 'regex groups must be an object',
          field: 'value.groups',
        });
      }
      break;
    case 'ast-node':
      if (typeof value.nodeType !== 'string' || !value.nodeType) {
        errors.push({
          code: 'INVALID_AST_NODE_TYPE',
          message: 'ast-node nodeType must be a non-empty string',
          field: 'value.nodeType',
        });
      }
      break;
    default:
      errors.push({
        code: 'UNKNOWN_VALUE_KIND',
        message: `Unknown FeatureValue kind: "${(value as { kind: string }).kind}"`,
        field: 'value.kind',
        value: (value as { kind: string }).kind,
      });
  }

  return errors;
}

/**
 * Validates a batch of Features.
 * Returns Ok with all valid features, and collects errors per feature.
 */
export function validateFeatureBatch(
  features: readonly Feature[],
): Result<Feature[], ValidationError[][]> {
  const allErrors: ValidationError[][] = [];
  const valid: Feature[] = [];

  for (const feature of features) {
    const result = validateFeature(feature);
    if (result.ok) {
      valid.push(result.value);
    } else {
      allErrors.push(result.error);
    }
  }

  if (allErrors.length > 0) {
    return err(allErrors);
  }

  return ok(valid);
}

/**
 * Check if a FeatureType string is a known canonical type.
 */
export function isKnownFeatureType(type: string): type is FeatureType {
  return KNOWN_FEATURE_TYPES.has(type);
}

/**
 * Get all known feature types.
 */
export function getKnownFeatureTypes(): readonly string[] {
  return Array.from(KNOWN_FEATURE_TYPES).sort();
}
