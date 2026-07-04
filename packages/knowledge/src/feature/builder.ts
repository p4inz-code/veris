/**
 * FeatureBuilder — constructs immutable Feature objects using a builder pattern.
 *
 * @module @veris/knowledge/feature/builder
 */

import { deterministicId } from '@veris/shared';

import type { Feature, FeatureType, FeatureValue, Provenance, SourceLocation } from './types.js';

/**
 * Builder for constructing immutable Feature objects.
 *
 * Usage:
 * ```typescript
 * const feature = new FeatureBuilder()
 *   .withArtifactId("art_abc123")
 *   .withSessionId("ss_xyz789")
 *   .withType("string-literal")
 *   .withValue({ kind: "string", value: "hello" })
 *   .withLocation({ startLine: 1, startColumn: 0, endLine: 1, endColumn: 5, offset: 0, length: 5 })
 *   .withConfidence(0.95)
 *   .withProvenance({ extractorId: "test", extractorVersion: "1.0.0", extractedAt: new Date().toISOString(), normalizedAt: new Date().toISOString(), normalizedBy: "test" })
 *   .build();
 * ```
 */
export class FeatureBuilder {
  private _artifactId: string | null = null;
  private _sessionId: string | null = null;
  private _type: FeatureType | null = null;
  private _value: FeatureValue | null = null;
  private _location: SourceLocation | null = null;
  private _confidence: number | null = null;
  private _provenance: Provenance | null = null;
  private _metadata: Record<string, unknown> | undefined;

  /** Set the source artifact ID. Required. */
  withArtifactId(id: string): this {
    this._artifactId = id;
    return this;
  }

  /** Set the owning session ID. Required. */
  withSessionId(id: string): this {
    this._sessionId = id;
    return this;
  }

  /** Set the feature type. Required. */
  withType(type: FeatureType): this {
    this._type = type;
    return this;
  }

  /** Set the extracted value. Required. */
  withValue(value: FeatureValue): this {
    this._value = value;
    return this;
  }

  /** Set the source location. Required. */
  withLocation(location: SourceLocation): this {
    this._location = location;
    return this;
  }

  /** Set the confidence score [0.0, 1.0]. Required. */
  withConfidence(confidence: number): this {
    this._confidence = confidence;
    return this;
  }

  /** Set the provenance tracking. Required. */
  withProvenance(provenance: Provenance): this {
    this._provenance = provenance;
    return this;
  }

  /** Set extractor-specific metadata. Optional. */
  withMetadata(metadata: Record<string, unknown>): this {
    this._metadata = metadata;
    return this;
  }

  /**
   * Build the Feature object.
   * Throws if any required field is missing or invalid.
   */
  build(): Feature {
    this._validate();

    const artifactId = this._artifactId!;
    const type = this._type!;
    const location = this._location!;
    const value = this._value!;

    // Compute deterministic ID from artifact + type + location + value hash
    const valueHash = this._computeValueHash(value);
    const idInput = `${artifactId}\0${type}\0${location.startLine}\0${location.startColumn}\0${location.offset}\0${location.length}\0${valueHash}`;
    const id = deterministicId('feat', idInput);

    return Object.freeze({
      id,
      artifactId,
      sessionId: this._sessionId!,
      type,
      value,
      location,
      confidence: this._confidence!,
      provenance: this._provenance!,
      metadata: this._metadata ? Object.freeze({ ...this._metadata }) : undefined,
    });
  }

  /** Reset the builder to its initial state. */
  reset(): void {
    this._artifactId = null;
    this._sessionId = null;
    this._type = null;
    this._value = null;
    this._location = null;
    this._confidence = null;
    this._provenance = null;
    this._metadata = undefined;
  }

  /** Get the current state (useful for debugging). */
  getCurrentState() {
    return {
      artifactId: this._artifactId,
      sessionId: this._sessionId,
      type: this._type,
      value: this._value,
      location: this._location,
      confidence: this._confidence,
      provenance: this._provenance,
      hasMetadata: this._metadata !== undefined,
    };
  }

  private _validate(): void {
    const missing: string[] = [];
    if (this._artifactId === null) missing.push('artifactId');
    if (this._sessionId === null) missing.push('sessionId');
    if (this._type === null) missing.push('type');
    if (this._value === null) missing.push('value');
    if (this._location === null) missing.push('location');
    if (this._confidence === null) missing.push('confidence');
    if (this._provenance === null) missing.push('provenance');

    if (missing.length > 0) {
      throw new Error(`FeatureBuilder: missing required fields: ${missing.join(', ')}`);
    }

    if (this._confidence! < 0 || this._confidence! > 1) {
      throw new Error(`FeatureBuilder: confidence must be in [0.0, 1.0], got ${this._confidence}`);
    }

    // Validate location
    const loc = this._location!;
    if (loc.startLine < 1) throw new Error('FeatureBuilder: startLine must be >= 1');
    if (loc.endLine < loc.startLine)
      throw new Error('FeatureBuilder: endLine must be >= startLine');
    if (loc.startColumn < 0) throw new Error('FeatureBuilder: startColumn must be >= 0');
    if (loc.endColumn < 0) throw new Error('FeatureBuilder: endColumn must be >= 0');
    if (loc.offset < 0) throw new Error('FeatureBuilder: offset must be >= 0');
    if (loc.length < 0) throw new Error('FeatureBuilder: length must be >= 0');
  }

  private _computeValueHash(value: FeatureValue): string {
    switch (value.kind) {
      case 'string':
        return `str:${value.value}`;
      case 'number':
        return `num:${value.value}`;
      case 'boolean':
        return `bool:${value.value}`;
      case 'bytes':
        return `bytes:${value.encoding}:${value.value}`;
      case 'array':
        return `arr:[${value.values.map((v) => this._computeValueHash(v)).join(',')}]`;
      case 'map':
        const keys = Object.keys(value.entries).sort();
        return `map:{${keys.map((k) => `${k}:${this._computeValueHash(value.entries[k])}`).join(',')}}`;
      case 'regex-match':
        return `regex:${value.pattern}:${value.match}`;
      case 'ast-node':
        return `ast:${value.nodeType}`;
    }
  }
}
