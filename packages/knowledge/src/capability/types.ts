/**
 * Capability types for VERIS Knowledge Layer.
 *
 * A Capability is a discrete action or resource access that an artifact
 * is observed to possess. Capabilities are extracted during the Feature
 * phase and used to build Behaviors.
 *
 * @see SPEC-002 §3.14
 * @module @veris/knowledge/capability/types
 */

import type { SourceLocation } from '@veris/core';

/**
 * Canonical capability category — an open enum.
 * Categories represent the type of action or resource access.
 */
export type CapabilityCategory =
  | 'file-system-read'
  | 'file-system-write'
  | 'file-system-delete'
  | 'network-connect'
  | 'network-listen'
  | 'process-exec'
  | 'process-create'
  | 'process-terminate'
  | 'registry-read'
  | 'registry-write'
  | 'environment-read'
  | 'environment-write'
  | 'crypto-encrypt'
  | 'crypto-decrypt'
  | 'crypto-hash'
  | 'code-evaluation'
  | 'privilege-escalation'
  | 'persistence-mechanism'
  | 'obfuscation'
  | 'anti-debug'
  | 'encoding'
  | 'decoding'
  | 'string-construction'
  | 'http-request'
  | 'dns-resolution'
  | 'socket-creation';

/**
 * A discrete action or resource access that an artifact possesses.
 *
 * Capabilities represent "what can this artifact do?" at a granular
 * level below Behavior. They are extracted during feature extraction
 * and consumed by the Behavior classifier.
 */
export interface Capability {
  /** Deterministic ID (prefix: "cap_"). */
  readonly id: string;
  /** Source artifact ID. */
  readonly artifactId: string;
  /** Canonical capability name. */
  readonly name: string;
  /** Category of capability. */
  readonly category: CapabilityCategory;
  /** Capability-specific properties. */
  readonly properties?: Readonly<Record<string, unknown>>;
  /** Where in the artifact this was found. */
  readonly source: SourceLocation;
  /** Confidence [0.0, 1.0]. */
  readonly confidence: number;
}

/** Helper to create a frozen Capability. */
export function createCapability(params: {
  id: string;
  artifactId: string;
  name: string;
  category: CapabilityCategory;
  source: SourceLocation;
  confidence: number;
  properties?: Record<string, unknown>;
}): Capability {
  return Object.freeze({
    id: params.id,
    artifactId: params.artifactId,
    name: params.name,
    category: params.category,
    source: params.source,
    confidence: params.confidence,
    properties: params.properties ? Object.freeze({ ...params.properties }) : undefined,
  });
}
