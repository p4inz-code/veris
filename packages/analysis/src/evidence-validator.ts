/**
 * EvidenceValidator — validates Evidence objects for correctness.
 *
 * @module @veris/analysis/evidence-validator
 */

import { type Result, ok, err } from '@veris/shared';

import type { Evidence } from './types.js';

/** A single validation error. */
export interface ValidationError {
  readonly code: string;
  readonly message: string;
  readonly field?: string;
  readonly value?: unknown;
}

/** Validation error codes. */
export const ValidationErrorCodes = {
  MISSING_ID: 'MISSING_ID',
  MISSING_ARTIFACT_ID: 'MISSING_ARTIFACT_ID',
  MISSING_CATEGORY: 'MISSING_CATEGORY',
  MISSING_TYPE: 'MISSING_TYPE',
  INVALID_CONFIDENCE: 'INVALID_CONFIDENCE',
  MISSING_EXPLANATION: 'MISSING_EXPLANATION',
  EMPTY_EXPLANATION: 'EMPTY_EXPLANATION',
  MISSING_ANALYZER_ID: 'MISSING_ANALYZER_ID',
  INVALID_ID_FORMAT: 'INVALID_ID_FORMAT',
} as const;

/**
 * Validate a single Evidence item.
 * Returns Ok(evidence) if valid, or Err(errors) if invalid.
 */
export function validateEvidence(evidence: Evidence): Result<Evidence, ValidationError[]> {
  const errors: ValidationError[] = [];

  if (!evidence.id) {
    errors.push({ code: 'MISSING_ID', message: 'Evidence must have an id', field: 'id' });
  } else if (!evidence.id.startsWith('ev_')) {
    errors.push({
      code: 'INVALID_ID_FORMAT',
      message: `Evidence id must start with "ev_", got "${evidence.id}"`,
      field: 'id',
      value: evidence.id,
    });
  }

  if (!evidence.artifactId) {
    errors.push({
      code: 'MISSING_ARTIFACT_ID',
      message: 'Evidence must have an artifactId',
      field: 'artifactId',
    });
  }

  if (!evidence.category) {
    errors.push({
      code: 'MISSING_CATEGORY',
      message: 'Evidence must have a category',
      field: 'category',
    });
  }

  if (!evidence.type) {
    errors.push({
      code: 'MISSING_TYPE',
      message: 'Evidence must have a type',
      field: 'type',
    });
  }

  if (evidence.confidence === undefined || evidence.confidence === null) {
    errors.push({
      code: 'INVALID_CONFIDENCE',
      message: 'Evidence must have a confidence score',
      field: 'confidence',
    });
  } else if (evidence.confidence < 0 || evidence.confidence > 1) {
    errors.push({
      code: 'INVALID_CONFIDENCE',
      message: `Confidence must be in [0.0, 1.0], got ${evidence.confidence}`,
      field: 'confidence',
      value: evidence.confidence,
    });
  }

  if (!evidence.explanation) {
    errors.push({
      code: 'MISSING_EXPLANATION',
      message: 'Evidence must have an explanation',
      field: 'explanation',
    });
  } else if (evidence.explanation.trim().length === 0) {
    errors.push({
      code: 'EMPTY_EXPLANATION',
      message: 'Evidence explanation must not be empty',
      field: 'explanation',
      value: evidence.explanation,
    });
  }

  if (!evidence.analyzerId) {
    errors.push({
      code: 'MISSING_ANALYZER_ID',
      message: 'Evidence must have an analyzerId',
      field: 'analyzerId',
    });
  }

  if (errors.length > 0) {
    return err(errors);
  }

  return ok(evidence);
}

/**
 * Validate a batch of Evidence items.
 * Returns Ok(valid) if all pass, or Err(errorsByIndex) with errors per index.
 */
export function validateEvidenceBatch(
  evidenceList: readonly Evidence[],
): Result<readonly Evidence[], readonly (readonly ValidationError[])[]> {
  const errorsByIndex: ValidationError[][] = [];
  const valid: Evidence[] = [];

  for (let i = 0; i < evidenceList.length; i++) {
    const result = validateEvidence(evidenceList[i]);
    if (result.ok) {
      valid.push(result.value);
    } else {
      errorsByIndex.push(result.error);
    }
  }

  if (errorsByIndex.length > 0) {
    const frozenErrors: readonly (readonly ValidationError[])[] = Object.freeze(
      errorsByIndex.map((e) => Object.freeze(e)),
    );
    return err(frozenErrors);
  }

  return ok(Object.freeze(valid));
}
