/**
 * Feature types for VERIS Knowledge Layer.
 *
 * Features are the atomic units of extracted knowledge — discrete,
 * deterministic pieces of data extracted from Artifacts. They are
 * language-agnostic and type-agnostic.
 *
 * @module @veris/knowledge/feature/types
 */

import type { SourceLocation as CoreSourceLocation } from '@veris/core';

// ── Extended Source Location ──

/**
 * Extended source location for Knowledge Layer features.
 *
 * Extends the core SourceLocation with:
 * - path: the file/artifact path where the feature was found
 * - section: optional section/function/region name
 * - archivePath: path within an archive if the artifact was extracted from one
 * - repositoryPath: path within a repository (relative to repo root)
 */
export interface SourceLocation extends CoreSourceLocation {
  /** Path to the file/artifact where the feature was found. */
  readonly path: string;
  /** Optional section/function/region name. */
  readonly section?: string;
  /** Path within an archive if the artifact was extracted from one. */
  readonly archivePath?: string;
  /** Path within a repository (relative to repo root). */
  readonly repositoryPath?: string;
}

/** Helper to create an extended SourceLocation from core location + path. */
export function createKnowledgeLocation(
  core: CoreSourceLocation,
  path: string,
  options?: { section?: string; archivePath?: string; repositoryPath?: string },
): SourceLocation {
  return Object.freeze({
    ...core,
    path,
    section: options?.section,
    archivePath: options?.archivePath,
    repositoryPath: options?.repositoryPath,
  });
}

// ── Feature Type (Open Enum) ──

/**
 * Canonical feature type classification.
 * Open enum — new types can be added without breaking existing code.
 */
export type FeatureType =
  | 'string-literal'
  | 'numeric-literal'
  | 'boolean-literal'
  | 'identifier'
  | 'function-call'
  | 'import-statement'
  | 'export-statement'
  | 'url'
  | 'ip-address'
  | 'domain-name'
  | 'file-path'
  | 'registry-key'
  | 'environment-variable'
  | 'permission'
  | 'capability'
  | 'system-call'
  | 'api-call'
  | 'control-flow'
  | 'data-flow'
  | 'string-pattern'
  | 'binary-pattern'
  | 'section-header'
  | 'symbol'
  | 'metadata-field'
  | 'annotation';

// ── Feature Value (Discriminated Union) ──

/** The extracted value of a feature, in canonical form. */
export type FeatureValue =
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'bytes'; readonly value: string; readonly encoding: 'base64' | 'hex' }
  | { readonly kind: 'array'; readonly values: readonly FeatureValue[] }
  | { readonly kind: 'map'; readonly entries: Readonly<Record<string, FeatureValue>> }
  | {
      readonly kind: 'regex-match';
      readonly pattern: string;
      readonly match: string;
      readonly groups: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: 'ast-node';
      readonly nodeType: string;
      readonly properties: Readonly<Record<string, unknown>>;
    };

// ── Provenance ──

/**
 * Provenance metadata for a Feature.
 * Tracks the complete extraction lineage.
 */
export interface Provenance {
  /** ID of the extractor that produced this feature. */
  readonly extractorId: string;
  /** Version of the extractor. */
  readonly extractorVersion: string;
  /** When the feature was extracted (ISO 8601). */
  readonly extractedAt: string;
  /** When the feature was normalized (ISO 8601). */
  readonly normalizedAt: string;
  /** ID of the normalizer/pipeline stage. */
  readonly normalizedBy: string;
}

// ── Feature ──

/**
 * A discrete, atomic piece of knowledge extracted from an Artifact.
 *
 * Features are the lowest-level analytical unit — the "atoms" that
 * behaviors are built from. They are deterministic, immutable, and
 * carry complete provenance.
 *
 * @see SPEC-002 §3.3
 */
export interface Feature {
  /** Deterministic ID (prefix: "feat_"). */
  readonly id: string;
  /** Source artifact ID. */
  readonly artifactId: string;
  /** Owning session ID. */
  readonly sessionId: string;
  /** Classification of the feature. */
  readonly type: FeatureType;
  /** The extracted value in canonical form. */
  readonly value: FeatureValue;
  /** Source location in the artifact. */
  readonly location: SourceLocation;
  /** Confidence score [0.0, 1.0]. */
  readonly confidence: number;
  /** Provenance tracking. */
  readonly provenance: Provenance;
  /** Extractor-specific context. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ── FeatureSet ──

/**
 * A collection of features extracted from a single artifact.
 */
export interface FeatureSet {
  /** Deterministic ID (prefix: "fs_"). */
  readonly id: string;
  /** Source artifact ID. */
  readonly artifactId: string;
  /** Owning session ID. */
  readonly sessionId: string;
  /** All features extracted from this artifact. */
  readonly features: readonly Feature[];
  /** When this feature set was produced (ISO 8601). */
  readonly extractedAt: string;
  /** Extractor-specific metadata. */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

// ── Validation & Normalization ──

/** Errors that can occur during feature validation. */
export interface ValidationError {
  readonly code: string;
  readonly message: string;
  readonly field?: string;
  readonly value?: unknown;
}

/** Errors that can occur during feature normalization. */
export interface NormalizationError {
  readonly code: string;
  readonly message: string;
  readonly feature?: Partial<Feature>;
  readonly raw?: unknown;
}

// ── Knowledge Diagnostics ──

/** Aggregate diagnostics for a knowledge extraction operation. */
export interface KnowledgeDiagnostics {
  /** Total artifacts processed. */
  readonly artifactsProcessed: number;
  /** Total features extracted. */
  readonly featuresExtracted: number;
  /** Features that passed normalization. */
  readonly featuresNormalized: number;
  /** Features that passed validation. */
  readonly featuresValidated: number;
  /** Features rejected during validation. */
  readonly featuresRejected: number;
  /** Features removed as duplicates. */
  readonly featuresDeduplicated: number;
  /** Errors encountered. */
  readonly errors: readonly KnowledgeError[];
  /** Warnings issued. */
  readonly warnings: readonly string[];
  /** Total elapsed time in milliseconds. */
  readonly durationMs: number;
}

/** A single error during knowledge extraction. */
export interface KnowledgeError {
  readonly code: string;
  readonly message: string;
  readonly artifactId?: string;
  readonly featureId?: string;
}

// ── Factory Helpers ──

/** Helper to create a frozen Provenance. */
export function createProvenance(params: {
  extractorId: string;
  extractorVersion?: string;
  extractedAt?: string;
  normalizedAt?: string;
  normalizedBy?: string;
}): Provenance {
  const now = new Date().toISOString();
  return Object.freeze({
    extractorId: params.extractorId,
    extractorVersion: params.extractorVersion ?? '0.1.0',
    extractedAt: params.extractedAt ?? now,
    normalizedAt: params.normalizedAt ?? now,
    normalizedBy: params.normalizedBy ?? 'knowledge-engine',
  });
}

/** Helper to create a frozen KnowledgeDiagnostics from counters. */
export function createKnowledgeDiagnostics(params?: {
  artifactsProcessed?: number;
  featuresExtracted?: number;
  featuresNormalized?: number;
  featuresValidated?: number;
  featuresRejected?: number;
  featuresDeduplicated?: number;
  errors?: KnowledgeError[];
  warnings?: string[];
  durationMs?: number;
}): KnowledgeDiagnostics {
  return Object.freeze({
    artifactsProcessed: params?.artifactsProcessed ?? 0,
    featuresExtracted: params?.featuresExtracted ?? 0,
    featuresNormalized: params?.featuresNormalized ?? 0,
    featuresValidated: params?.featuresValidated ?? 0,
    featuresRejected: params?.featuresRejected ?? 0,
    featuresDeduplicated: params?.featuresDeduplicated ?? 0,
    errors: Object.freeze([...(params?.errors ?? [])]),
    warnings: Object.freeze([...(params?.warnings ?? [])]),
    durationMs: params?.durationMs ?? 0,
  });
}
