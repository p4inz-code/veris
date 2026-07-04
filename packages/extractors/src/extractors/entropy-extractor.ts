/**
 * EntropyExtractor — computes Shannon entropy of artifact content.
 *
 * Entropy is a measure of randomness/uncertainty in the data.
 * High entropy often indicates compressed, encrypted, or obfuscated content.
 *
 * Provides:
 * - Per-file/global entropy
 * - Per-section entropy (for executable sections)
 *
 * @module @veris/extractors/extractors/entropy-extractor
 */

import { BaseExtractor } from '../base-extractor.js';
import type { ExtractionContext, ExtractionResult } from '../types.js';
import { createRawFeature } from '../types.js';

/** Configuration for EntropyExtractor. */
export interface EntropyExtractorConfig {
  /** Window size in bytes for sliding window entropy (default: 4096). 0 = whole file only. */
  readonly windowSize?: number;
  /** Whether to compute per-window entropy (default: false). */
  readonly enableWindowEntropy?: boolean;
  /** Maximum number of window entropy values to report (default: 100). */
  readonly maxWindows?: number;
}

const DEFAULT_CONFIG: Required<EntropyExtractorConfig> = {
  windowSize: 4096,
  enableWindowEntropy: false,
  maxWindows: 100,
};

/**
 * Computes Shannon entropy of artifact content.
 * Deterministic: same content → same entropy values.
 */
export class EntropyExtractor extends BaseExtractor {
  private readonly _config: Required<EntropyExtractorConfig>;

  constructor(config?: EntropyExtractorConfig) {
    super({
      id: 'entropy-extractor',
      name: 'Entropy Extractor',
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
        'unknown',
      ],
      priority: 150,
    });
    this._config = { ...DEFAULT_CONFIG, ...config };
  }

  canExtract(context: ExtractionContext): boolean {
    return context.content !== null && context.content.length > 0;
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const features = this._computeEntropyFeatures(buffer);
    const endTime = Date.now();

    return this.ok(features, {
      bytesProcessed: buffer.length,
      startTime,
      endTime,
    });
  }

  private _computeEntropyFeatures(buffer: Buffer): ReturnType<typeof createRawFeature>[] {
    const features: ReturnType<typeof createRawFeature>[] = [];
    const totalLength = buffer.length;

    // Global Shannon entropy
    const globalEntropy = this._shannonEntropy(buffer);
    features.push(
      createRawFeature({
        extractorId: this.id,
        type: 'entropy-global',
        value: globalEntropy,
        confidence: 1.0,
        metadata: {
          bytesAnalyzed: totalLength,
          maxPossibleEntropy: 8.0,
        },
      }),
    );

    // Window entropy (if enabled)
    if (this._config.enableWindowEntropy && this._config.windowSize > 0) {
      const windowFeatures = this._computeWindowEntropy(buffer);
      features.push(...windowFeatures);
    }

    return features;
  }

  /**
   * Compute Shannon entropy over the entire buffer.
   * H(X) = -Σ p(x) * log2(p(x))
   *
   * Returns a value in [0.0, 8.0] where:
   * - 0.0 = perfectly predictable (all same byte)
   * - 8.0 = maximum uncertainty (uniform distribution)
   */
  private _shannonEntropy(data: Buffer): number {
    if (data.length === 0) return 0;

    // Count byte frequencies
    const frequencies = new Float64Array(256);
    for (let i = 0; i < data.length; i++) {
      frequencies[data[i]]++;
    }

    // Compute entropy
    const len = data.length;
    let entropy = 0;

    for (let i = 0; i < 256; i++) {
      if (frequencies[i] > 0) {
        const p = frequencies[i] / len;
        entropy -= p * Math.log2(p);
      }
    }

    // Round to 6 decimal places for determinism
    return Math.round(entropy * 1_000_000) / 1_000_000;
  }

  /**
   * Compute sliding window entropy.
   */
  private _computeWindowEntropy(buffer: Buffer): ReturnType<typeof createRawFeature>[] {
    const features: ReturnType<typeof createRawFeature>[] = [];
    const windowSize = this._config.windowSize;
    const maxWindows = this._config.maxWindows;
    const totalWindows = Math.ceil(buffer.length / windowSize);
    const step = Math.max(1, Math.ceil(totalWindows / maxWindows));

    for (let i = 0; i < buffer.length && features.length < maxWindows; i += windowSize * step) {
      const end = Math.min(i + windowSize, buffer.length);
      const slice = buffer.subarray(i, end);
      const windowEntropy = this._shannonEntropy(slice);

      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'entropy-window',
          value: windowEntropy,
          confidence: 1.0,
          metadata: {
            offset: i,
            windowSize: end - i,
          },
        }),
      );
    }

    return features;
  }
}
