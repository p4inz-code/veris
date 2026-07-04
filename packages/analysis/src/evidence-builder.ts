/**
 * EvidenceBuilder — constructs immutable Evidence objects using a builder pattern.
 *
 * @module @veris/analysis/evidence-builder
 */

import type { SourceLocation } from '@veris/core';
import { deterministicId } from '@veris/shared';

import type { Evidence, EvidenceCategory } from './types.js';
import { createEvidence } from './types.js';

/**
 * Builder for constructing immutable Evidence objects.
 *
 * @example
 * ```typescript
 * const evidence = new EvidenceBuilder()
 *   .withArtifactId("art_abc123")
 *   .withCategory("executable")
 *   .withType("pe-import")
 *   .withExplanation("Import table contains CreateRemoteThread from kernel32.dll")
 *   .withConfidence(1.0)
 *   .withAnalyzerId("pe-analyzer")
 *   .withFeatureIds(["feat_import_1"])
 *   .withLocations([{ startLine: 1, startColumn: 0, endLine: 1, endColumn: 10, offset: 0, length: 10 }])
 *   .build();
 * ```
 */
export class EvidenceBuilder {
  private _artifactId: string | null = null;
  private _featureIds: string[] | undefined;
  private _category: EvidenceCategory | null = null;
  private _type: string | null = null;
  private _confidence: number | null = null;
  private _locations: SourceLocation[] | undefined;
  private _explanation: string | null = null;
  private _metadata: Record<string, unknown> | undefined;
  private _analyzerId: string | null = null;

  /** Set the source artifact ID. Required. */
  withArtifactId(id: string): this {
    this._artifactId = id;
    return this;
  }

  /** Set feature IDs that produced this evidence. Optional. */
  withFeatureIds(ids: readonly string[]): this {
    this._featureIds = [...ids];
    return this;
  }

  /** Add a single feature ID. Optional. */
  addFeatureId(id: string): this {
    if (!this._featureIds) this._featureIds = [];
    this._featureIds.push(id);
    return this;
  }

  /** Set the evidence category. Required. */
  withCategory(category: EvidenceCategory): this {
    this._category = category;
    return this;
  }

  /** Set the evidence type. Required. */
  withType(type: string): this {
    this._type = type;
    return this;
  }

  /** Set the confidence score [0.0, 1.0]. Required. */
  withConfidence(confidence: number): this {
    this._confidence = confidence;
    return this;
  }

  /** Set source locations. Optional. */
  withLocations(locations: readonly SourceLocation[]): this {
    this._locations = [...locations];
    return this;
  }

  /** Add a single source location. Optional. */
  addLocation(location: SourceLocation): this {
    if (!this._locations) this._locations = [];
    this._locations.push(location);
    return this;
  }

  /** Set the human-readable explanation. Required. */
  withExplanation(explanation: string): this {
    this._explanation = explanation;
    return this;
  }

  /** Set machine-readable metadata. Optional. */
  withMetadata(metadata: Record<string, unknown>): this {
    this._metadata = metadata;
    return this;
  }

  /** Set the analyzer ID. Required. */
  withAnalyzerId(analyzerId: string): this {
    this._analyzerId = analyzerId;
    return this;
  }

  /**
   * Build the Evidence object.
   * Throws if any required field is missing or invalid.
   */
  build(): Evidence {
    this._validate();

    const artifactId = this._artifactId!;
    const type = this._type!;
    const explanation = this._explanation!;
    const analyzerId = this._analyzerId!;

    // Compute deterministic ID from content
    const idInput = `${artifactId}\0${type}\0${explanation}\0${this._confidence!}\0${analyzerId}`;
    const id = deterministicId('ev', idInput);

    return createEvidence({
      id,
      artifactId,
      featureIds: this._featureIds,
      category: this._category!,
      type,
      confidence: this._confidence!,
      locations: this._locations,
      explanation,
      metadata: this._metadata,
      analyzerId,
    });
  }

  /** Reset the builder to its initial state. */
  reset(): void {
    this._artifactId = null;
    this._featureIds = undefined;
    this._category = null;
    this._type = null;
    this._confidence = null;
    this._locations = undefined;
    this._explanation = null;
    this._metadata = undefined;
    this._analyzerId = null;
  }

  private _validate(): void {
    const missing: string[] = [];
    if (this._artifactId === null) missing.push('artifactId');
    if (this._category === null) missing.push('category');
    if (this._type === null) missing.push('type');
    if (this._confidence === null) missing.push('confidence');
    if (this._explanation === null) missing.push('explanation');
    if (this._analyzerId === null) missing.push('analyzerId');

    if (missing.length > 0) {
      throw new Error(`EvidenceBuilder: missing required fields: ${missing.join(', ')}`);
    }

    if (this._confidence! < 0 || this._confidence! > 1) {
      throw new Error(`EvidenceBuilder: confidence must be in [0.0, 1.0], got ${this._confidence}`);
    }
  }
}
