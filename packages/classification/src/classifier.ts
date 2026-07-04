/**
 * Multi-signal classification engine for VERIS.
 *
 * Combines multiple signal detectors using weighted voting to produce
 * deterministic artifact classification. Never classifies using extension alone.
 *
 * @module @veris/classification/classifier
 */

import type { DiscoveredArtifact } from '@veris/core';

import {
  detectMagicBytes,
  detectFileSignature,
  detectMimeByExtension,
  detectShebang,
  detectExtension,
  detectBOM,
  detectContentSampling,
} from './signals.js';
import type {
  ClassificationCategory,
  ClassificationConfig,
  ClassificationDiagnostics,
  ClassificationResult,
  SignalContribution,
  SignalResult,
  SignalType,
} from './types.js';
import { ALL_CATEGORIES, DEFAULT_CLASSIFICATION_CONFIG, DEFAULT_SIGNAL_WEIGHTS } from './types.js';

/**
 * VERIS Classification Engine.
 *
 * Provides deterministic, multi-signal artifact classification using
 * weighted voting as specified in SPEC-004 §4.
 *
 * Signals used (in priority order):
 * 1. Magic bytes (highest weight)
 * 2. File signature
 * 3. MIME type
 * 4. Shebang
 * 5. Extension heuristic (never trusted alone)
 * 6. BOM (encoding only)
 * 7. Content sampling (lowest weight)
 */
export class ClassificationEngine {
  private readonly _config: Required<ClassificationConfig>;

  constructor(config: ClassificationConfig = {}) {
    this._config = { ...DEFAULT_CLASSIFICATION_CONFIG, ...config };
  }

  /** Get the current configuration (immutable snapshot). */
  get config(): Required<ClassificationConfig> {
    return { ...this._config };
  }

  /**
   * Classify a single discovered artifact using multi-signal weighted voting.
   * Returns a ClassificationResult with full diagnostic trace.
   */
  async classify(artifact: DiscoveredArtifact): Promise<ClassificationResult> {
    // Run all enabled signal detectors in parallel
    const signalResults = await this._runAllSignals(artifact);

    // Accumulate weighted votes
    const categoryScores: Record<string, number> = {};
    const contributions: SignalContribution[] = [];

    for (const signalResult of signalResults) {
      if (!signalResult.detected || !signalResult.category) continue;

      // Find the weight for this signal
      const weightEntry = DEFAULT_SIGNAL_WEIGHTS.find(
        (w) => w.signal === this._identifySignalType(signalResult),
      );
      const weight = weightEntry?.weight ?? 50;

      // Confidence-adjusted weight = weight * confidence
      const adjustedWeight = weight * signalResult.confidence;

      // Accumulate score for the detected category
      categoryScores[signalResult.category] =
        (categoryScores[signalResult.category] ?? 0) + adjustedWeight;

      contributions.push({
        signal: this._identifySignalType(signalResult),
        category: signalResult.category,
        confidence: signalResult.confidence,
        detail: signalResult.detail,
      });
    }

    // Generate scores for all categories (even non-detected get small scores)
    for (const cat of ALL_CATEGORIES) {
      if (!(cat in categoryScores)) {
        categoryScores[cat] = 0;
      }
    }

    // Find the winning category
    const sortedCategories = Object.entries(categoryScores).sort((a, b) => b[1] - a[1]);
    const winner = sortedCategories[0];
    const winnerCategory = (winner[0] as ClassificationCategory) ?? 'unknown';
    const winnerScore = winner[1];

    // Compute overall confidence based on score distribution
    const totalScore = Object.values(categoryScores).reduce((sum, s) => sum + s, 0);
    const confidence = totalScore > 0 ? Math.min(1, winnerScore / Math.max(totalScore, 1)) : 0;

    // Determine sub-type and MIME from the winning signal
    const winnerSignal = signalResults.find((r) => r.detected && r.category === winnerCategory);
    const subType = winnerSignal?.subType ?? null;

    // Determine MIME type
    let mimeType: string;
    const mimeSignal = signalResults.find((r) => r.detected && r.mimeType);
    if (mimeSignal?.mimeType) {
      mimeType = mimeSignal.mimeType;
    } else {
      mimeType = 'application/octet-stream';
    }

    // Handle directory classification
    if (artifact.isDirectory) {
      const dirResult: ClassificationResult = {
        artifactId: artifact.id,
        absolutePath: artifact.absolutePath,
        category: 'directory',
        subType: null,
        mimeType: 'inode/directory',
        encoding: null,
        confidence: 1.0,
        signals: Object.freeze([
          {
            signal: 'mime',
            category: 'directory',
            confidence: 1.0,
            detail: 'Path is a directory',
          },
        ]),
        diagnostics: Object.freeze({
          finalScore: 100,
          categoryScores: { directory: 100 },
          signalResults: [
            {
              detected: true,
              category: 'directory',
              subType: null,
              confidence: 1.0,
              detail: 'Path is a directory',
              mimeType: 'inode/directory',
            },
          ],
          reasoning: 'Classification: directory (confidence: 100.0%, score: 100.0)',
        }),
      };
      return dirResult;
    }

    // Determine encoding
    const bomSignal = signalResults.find((r) => r.detected && r.encoding);
    const encoding = bomSignal?.encoding ?? null;

    // Build diagnostic trace
    const diagnostics: ClassificationDiagnostics = {
      finalScore: winnerScore,
      categoryScores: { ...categoryScores },
      signalResults: signalResults.map((r) => ({
        detected: r.detected,
        category: r.category,
        subType: r.subType,
        confidence: r.confidence,
        detail: r.detail,
        mimeType: r.mimeType,
        encoding: r.encoding,
      })),
      reasoning: this._buildReasoning(
        winnerCategory,
        subType,
        winnerScore,
        confidence,
        contributions,
      ),
    };

    return {
      artifactId: artifact.id,
      absolutePath: artifact.absolutePath,
      category: winnerCategory,
      subType,
      mimeType,
      encoding,
      confidence: Math.round(confidence * 1000) / 1000,
      signals: Object.freeze(contributions),
      diagnostics: Object.freeze(diagnostics),
    };
  }

  /**
   * Classify multiple artifacts in bulk.
   */
  async classifyMany(
    artifacts: readonly DiscoveredArtifact[],
  ): Promise<readonly ClassificationResult[]> {
    const results: ClassificationResult[] = [];
    for (const artifact of artifacts) {
      results.push(await this.classify(artifact));
    }
    return Object.freeze(results);
  }

  /**
   * Run all enabled signal detectors.
   */
  private async _runAllSignals(artifact: DiscoveredArtifact): Promise<SignalResult[]> {
    const signals: Array<Promise<SignalResult>> = [];

    if (this._config.enableMagicBytes) {
      signals.push(detectMagicBytes(artifact, this._config));
    }
    if (this._config.enableFileSignature) {
      signals.push(detectFileSignature(artifact, this._config));
    }
    if (this._config.enableMime) {
      signals.push(detectMimeByExtension(artifact));
    }
    if (this._config.enableShebang) {
      signals.push(detectShebang(artifact));
    }
    if (this._config.enableExtension) {
      signals.push(detectExtension(artifact));
    }
    if (this._config.enableBom) {
      signals.push(detectBOM(artifact));
    }
    if (this._config.enableContentSampling) {
      signals.push(detectContentSampling(artifact, this._config));
    }

    return Promise.all(signals);
  }

  /**
   * Identify the signal type from a signal result.
   */
  private _identifySignalType(result: SignalResult): SignalType {
    // Match the signal by its detail prefix or characteristics
    if (result.detail.includes('magic bytes') || result.detail.includes('Magic bytes')) {
      return 'magic-bytes';
    }
    if (result.detail.includes('file signature') || result.detail.includes('File signature')) {
      return 'file-signature';
    }
    if (result.detail.includes('MIME') || result.detail.includes('mime')) {
      return 'mime';
    }
    if (result.detail.includes('shebang') || result.detail.includes('Shebang')) {
      return 'shebang';
    }
    if (result.detail.includes('extension') || result.detail.includes('Extension')) {
      return 'extension';
    }
    if (result.detail.includes('BOM') || result.detail.includes('bom')) {
      return 'bom';
    }
    if (result.detail.includes('content') || result.detail.includes('Content')) {
      return 'content-sampling';
    }
    // Fallback heuristic based on confidence level
    if (result.confidence >= 0.9) return 'magic-bytes';
    if (result.confidence >= 0.7) return 'file-signature';
    if (result.confidence >= 0.5) return 'extension';
    return 'content-sampling';
  }

  /**
   * Build a human-readable reasoning string.
   */
  private _buildReasoning(
    category: string,
    subType: string | null,
    score: number,
    confidence: number,
    contributions: SignalContribution[],
  ): string {
    const typeStr = subType ? `${category}/${subType}` : category;
    const lines: string[] = [
      `Classification: ${typeStr} (confidence: ${(confidence * 100).toFixed(1)}%, score: ${score.toFixed(1)})`,
    ];

    if (contributions.length === 0) {
      lines.push('No signals detected — defaulting to unknown.');
      return lines.join('\n');
    }

    lines.push('Contributing signals:');
    for (const c of contributions) {
      lines.push(`  - ${c.signal}: ${c.detail} (confidence: ${(c.confidence * 100).toFixed(1)}%)`);
    }

    return lines.join('\n');
  }
}
