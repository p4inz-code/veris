/**
 * CapabilityBuilder — constructs immutable Capability objects using a builder pattern.
 *
 * @module @veris/knowledge/capability/builder
 */

import type { SourceLocation } from '@veris/core';
import { deterministicId } from '@veris/shared';

import type { Capability, CapabilityCategory } from './types.js';

/**
 * Builder for constructing immutable Capability objects.
 *
 * Usage:
 * ```typescript
 * const capability = new CapabilityBuilder()
 *   .withArtifactId("art_abc123")
 *   .withName("read-file")
 *   .withCategory("file-system-read")
 *   .withSource({ startLine: 1, startColumn: 0, endLine: 1, endColumn: 10, offset: 0, length: 10 })
 *   .withConfidence(0.95)
 *   .build();
 * ```
 */
export class CapabilityBuilder {
  private _artifactId: string | null = null;
  private _name: string | null = null;
  private _category: CapabilityCategory | null = null;
  private _source: SourceLocation | null = null;
  private _confidence: number | null = null;
  private _properties: Record<string, unknown> | undefined;

  /** Set the source artifact ID. Required. */
  withArtifactId(id: string): this {
    this._artifactId = id;
    return this;
  }

  /** Set the canonical capability name. Required. */
  withName(name: string): this {
    this._name = name;
    return this;
  }

  /** Set the capability category. Required. */
  withCategory(category: CapabilityCategory): this {
    this._category = category;
    return this;
  }

  /** Set the source location. Required. */
  withSource(source: SourceLocation): this {
    this._source = source;
    return this;
  }

  /** Set the confidence score [0.0, 1.0]. Required. */
  withConfidence(confidence: number): this {
    this._confidence = confidence;
    return this;
  }

  /** Set capability-specific properties. Optional. */
  withProperties(properties: Record<string, unknown>): this {
    this._properties = properties;
    return this;
  }

  /**
   * Build the Capability object.
   * Throws if any required field is missing or invalid.
   */
  build(): Capability {
    this._validate();

    const artifactId = this._artifactId!;
    const name = this._name!;
    const source = this._source!;

    // Compute deterministic ID
    const idInput = `${artifactId}\0${name}\0${source.startLine}\0${source.startColumn}`;
    const id = deterministicId('cap', idInput);

    return Object.freeze({
      id,
      artifactId,
      name,
      category: this._category!,
      source,
      confidence: this._confidence!,
      properties: this._properties ? Object.freeze({ ...this._properties }) : undefined,
    });
  }

  /** Reset the builder. */
  reset(): void {
    this._artifactId = null;
    this._name = null;
    this._category = null;
    this._source = null;
    this._confidence = null;
    this._properties = undefined;
  }

  private _validate(): void {
    const missing: string[] = [];
    if (this._artifactId === null) missing.push('artifactId');
    if (this._name === null) missing.push('name');
    if (this._category === null) missing.push('category');
    if (this._source === null) missing.push('source');
    if (this._confidence === null) missing.push('confidence');

    if (missing.length > 0) {
      throw new Error(`CapabilityBuilder: missing required fields: ${missing.join(', ')}`);
    }

    if (this._confidence! < 0 || this._confidence! > 1) {
      throw new Error(
        `CapabilityBuilder: confidence must be in [0.0, 1.0], got ${this._confidence}`,
      );
    }
  }
}
