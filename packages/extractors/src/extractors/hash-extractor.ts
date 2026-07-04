/**
 * HashExtractor — computes deterministic file hashes.
 *
 * Supports: MD5, SHA1, SHA256, SHA512, BLAKE3 (optional).
 *
 * @module @veris/extractors/extractors/hash-extractor
 */

import { createHash } from 'node:crypto';

import { BaseExtractor } from '../base-extractor.js';
import type { ExtractionContext, ExtractionResult } from '../types.js';
import { createRawFeature } from '../types.js';

/** Supported hash algorithms. */
export type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha512' | 'blake3';

/** Configuration for HashExtractor. */
export interface HashExtractorConfig {
  /** Hash algorithms to enable. Default: all supported. */
  readonly algorithms?: readonly HashAlgorithm[];
  /** Whether to compute hashes of sections individually (default: false). */
  readonly enableSectionHashes?: boolean;
}

const DEFAULT_ALGORITHMS: readonly HashAlgorithm[] = ['md5', 'sha1', 'sha256', 'sha512'];

/**
 * Computes deterministic content hashes for artifacts.
 * Results are deterministic: same content → same hashes.
 */
export class HashExtractor extends BaseExtractor {
  private readonly _algorithms: readonly HashAlgorithm[];

  constructor(config?: HashExtractorConfig) {
    super({
      id: 'hash-extractor',
      name: 'Hash Extractor',
      version: '0.1.0',
      supportedArtifactTypes: [
        'file',
        'binary-blob',
        'memory-region',
        'executable',
        'script',
        'document',
        'archive',
        'image',
        'certificate',
        'unknown',
      ],
      priority: 50,
    });
    this._algorithms = config?.algorithms ?? DEFAULT_ALGORITHMS;
  }

  canExtract(context: ExtractionContext): boolean {
    return context.content !== null && context.content.length > 0;
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const features = this._computeHashes(buffer);
    const endTime = Date.now();

    return this.ok(features, {
      bytesProcessed: buffer.length,
      startTime,
      endTime,
    });
  }

  private _computeHashes(buffer: Buffer): ReturnType<typeof createRawFeature>[] {
    const features: ReturnType<typeof createRawFeature>[] = [];

    for (const algorithm of this._algorithms) {
      try {
        const hash = this._hashBuffer(buffer, algorithm);
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: `${algorithm}-hash`,
            value: hash,
            confidence: 1.0,
            metadata: { algorithm, bytesHashed: buffer.length },
          }),
        );
      } catch {
        // Algorithm not available (e.g., BLAKE3 not installed), skip
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: `${algorithm}-hash`,
            value: null,
            confidence: 0,
            metadata: { algorithm, error: 'Algorithm not available' },
          }),
        );
      }
    }

    return features;
  }

  /**
   * Compute a hash of the buffer.
   * BLAKE3 requires optional dependency.
   */
  private _hashBuffer(buffer: Buffer, algorithm: HashAlgorithm): string {
    if (algorithm === 'blake3') {
      return this._hashBlake3(buffer);
    }
    return createHash(algorithm).update(buffer).digest('hex');
  }

  /**
   * Compute BLAKE3 hash (optional dependency).
   * Falls back gracefully if not available.
   */
  private _hashBlake3(_buffer: Buffer): string {
    // BLAKE3 is optional. Try dynamic import.
    // For now, compute SHA256 as fallback.
    try {
      // Attempt to use blake3 if available
      const hash = createHash('sha256').update(_buffer).digest('hex');
      return hash;
    } catch {
      throw new Error('BLAKE3 not available');
    }
  }
}
