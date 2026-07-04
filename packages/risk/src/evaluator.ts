/**
 * @veris/risk/evaluator — Top-level risk evaluation facade.
 *
 * ## Responsibility
 *
 * The RiskEvaluator is the primary entry point for risk evaluation. It
 * transforms upstream pipeline outputs (rule matches, correlations,
 * evidence) into the lightweight `RiskInput` format and executes the
 * full evaluation pipeline through `RiskEngine`.
 *
 * ## Why a Separate Evaluator Layer?
 *
 * Before this milestone, users had to manually construct `RiskInput` objects
 * from domain types (e.g., `RuleMatch` from `@veris/rules`, `Correlation`
 * from `@veris/correlation`). The evaluator automates this transformation,
 * providing:
 *
 * 1. **Integration helpers** — functions to convert domain types to
 *    `RiskRuleMatch`, `RiskCorrelation`, `RiskEvidence`.
 * 2. **Single entry point** — call `evaluate()` with upstream results
 *    and get a complete `RiskAssessment`.
 * 3. **Validation pipeline** — input validation before evaluation.
 * 4. **Flexible configuration** — weight profiles, threshold profiles,
 *    and engine options.
 *
 * ## Pipeline
 *
 * ```
 * Upstream Results (RuleMatch[], Correlation[], Evidence[])
 *   ↓
 * transformToRiskInput()
 *   ↓
 * validateInput()
 *   ↓
 * RiskEngine.evaluate()
 *   ↓
 * RiskAssessment
 * ```
 *
 * ## Usage
 *
 * ```typescript
 * const evaluator = new RiskEvaluator();
 *
 * const assessment = evaluator.evaluate({
 *   ruleMatches: ruleEngineResult.matches,
 *   correlations: correlationEngineResult.correlations,
 *   evidence: evidenceList,
 *   artifactId: "art-main.exe",
 *   sessionId: "session-001",
 * });
 *
 * console.log(assessment.riskScore);  // e.g., 6.40
 * console.log(assessment.verdict);    // e.g., "likely-malicious"
 * ```
 *
 * @module @veris/risk/evaluator
 */

import type { Severity } from '@veris/core';

import { RiskEngine } from './engine.js';
import { DEFAULT_THRESHOLD_PROFILE } from './thresholds.js';
import type { ThresholdProfile } from './thresholds.js';
import type {
  RiskInput,
  RiskRuleMatch,
  RiskCorrelation,
  RiskEvidence,
  RiskAssessment,
  RiskEngineOptions,
} from './types.js';
import { DEFAULT_WEIGHT_PROFILE } from './weighting.js';
import type { WeightProfile } from './weighting.js';

// ── Evaluator Input Types ──

/**
 * Upstream source types that the evaluator can consume.
 *
 * These are the raw upstream types that need to be transformed into
 * the lightweight RiskInput format. Each source type corresponds to
 * a converter function in the evaluator.
 */

/**
 * A source rule match from the rules/correlation pipeline.
 *
 * This is the domain type that the evaluator transforms into
 * `RiskRuleMatch`. It accepts both `@veris/rules` RuleMatch and
 * `@veris/correlation` Correlation types.
 */
export interface SourceRuleMatch {
  /** The rule ID that matched. */
  readonly ruleId: string;
  /** Severity score [0.0, 10.0]. */
  readonly severityScore: number;
  /** Severity level string. */
  readonly severityLevel: string;
  /** Match confidence [0.0, 1.0]. */
  readonly confidence: number;
  /** Evidence IDs supporting this match. */
  readonly evidenceIds: readonly string[];
  /** Taxonomy IDs this rule relates to. */
  readonly taxonomyIds?: readonly string[];
}

/**
 * A source correlation from the correlation pipeline.
 */
export interface SourceCorrelation {
  /** Correlation ID. */
  readonly correlationId: string;
  /** Number of behaviors in the chain. */
  readonly chainLength: number;
  /** Confidence in the correlation [0.0, 1.0]. */
  readonly confidence: number;
  /** Evidence IDs that form this correlation. */
  readonly evidenceIds: readonly string[];
}

/**
 * A source evidence reference.
 */
export interface SourceEvidence {
  /** Evidence ID. */
  readonly id: string;
  /** Confidence score [0.0, 1.0]. */
  readonly confidence: number;
  /** Evidence category (e.g., "executable", "obfuscation"). */
  readonly category: string;
  /** Artifact this evidence relates to. */
  readonly artifactId: string;
}

/**
 * Input for the evaluator's evaluate() method.
 *
 * This accepts full upstream domain objects and transforms them
 * into the lightweight RiskInput format internally.
 */
export interface EvaluatorInput {
  /** Rule matches from the rules engine. */
  readonly ruleMatches?: readonly SourceRuleMatch[];
  /** Correlations from the correlation engine. */
  readonly correlations?: readonly SourceCorrelation[];
  /** Evidence references. */
  readonly evidence?: readonly SourceEvidence[];
  /** Artifact ID (null for repository-level assessment). */
  readonly artifactId: string | null;
  /** Owning session ID. */
  readonly sessionId: string;
}

/**
 * Configuration for the RiskEvaluator.
 */
export interface EvaluatorConfig {
  /** Weight profile for dimension and category weights. */
  readonly weightProfile?: WeightProfile;
  /** Threshold profile for verdict and risk level thresholds. */
  readonly thresholdProfile?: ThresholdProfile;
  /** Default engine options. */
  readonly engineOptions?: RiskEngineOptions;
}

// ── Transformation Functions ──

/**
 * Transforms a SourceRuleMatch into a RiskRuleMatch.
 *
 * @param match - The source rule match.
 * @returns A lightweight RiskRuleMatch.
 */
function toRiskRuleMatch(match: SourceRuleMatch): RiskRuleMatch {
  return Object.freeze({
    ruleId: match.ruleId,
    severity: Object.freeze({
      level: match.severityLevel as Severity['level'],
      score: match.severityScore,
    }),
    confidence: match.confidence,
    evidenceIds: Object.freeze([...match.evidenceIds]),
    taxonomyIds: Object.freeze([...(match.taxonomyIds ?? [])]),
  });
}

/**
 * Transforms a SourceCorrelation into a RiskCorrelation.
 *
 * @param correlation - The source correlation.
 * @returns A lightweight RiskCorrelation.
 */
function toRiskCorrelation(correlation: SourceCorrelation): RiskCorrelation {
  return Object.freeze({
    correlationId: correlation.correlationId,
    chainLength: correlation.chainLength,
    confidence: correlation.confidence,
    evidenceIds: Object.freeze([...correlation.evidenceIds]),
  });
}

/**
 * Transforms a SourceEvidence into a RiskEvidence.
 *
 * @param evidence - The source evidence.
 * @returns A lightweight RiskEvidence.
 */
function toRiskEvidence(evidence: SourceEvidence): RiskEvidence {
  return Object.freeze({
    id: evidence.id,
    confidence: evidence.confidence,
    category: evidence.category,
    artifactId: evidence.artifactId,
  });
}

// ── Input Validation ──

/**
 * Validates an EvaluatorInput before processing.
 *
 * Checks:
 * - sessionId is present and non-empty.
 * - All numeric fields are finite.
 * - All required fields are present.
 *
 * @param input - The evaluator input to validate.
 * @returns An array of error messages (empty if valid).
 */
export function validateEvaluatorInput(input: EvaluatorInput): readonly string[] {
  const errors: string[] = [];

  if (!input) {
    return ['EvaluatorInput is required'];
  }

  if (!input.sessionId || typeof input.sessionId !== 'string') {
    errors.push('sessionId is required and must be a string');
  }

  // Validate rule matches.
  if (input.ruleMatches) {
    if (!Array.isArray(input.ruleMatches)) {
      errors.push('ruleMatches must be an array');
    } else {
      for (let i = 0; i < input.ruleMatches.length; i++) {
        const m = input.ruleMatches[i];
        if (!m.ruleId) errors.push(`ruleMatches[${i}].ruleId is required`);
        if (typeof m.severityScore !== 'number' || !isFinite(m.severityScore)) {
          errors.push(`ruleMatches[${i}].severityScore is not finite`);
        }
        if (typeof m.confidence !== 'number' || !isFinite(m.confidence)) {
          errors.push(`ruleMatches[${i}].confidence is not finite`);
        }
      }
    }
  }

  // Validate correlations.
  if (input.correlations) {
    if (!Array.isArray(input.correlations)) {
      errors.push('correlations must be an array');
    } else {
      for (let i = 0; i < input.correlations.length; i++) {
        const c = input.correlations[i];
        if (!c.correlationId) errors.push(`correlations[${i}].correlationId is required`);
        if (typeof c.confidence !== 'number' || !isFinite(c.confidence)) {
          errors.push(`correlations[${i}].confidence is not finite`);
        }
        if (typeof c.chainLength !== 'number' || !isFinite(c.chainLength)) {
          errors.push(`correlations[${i}].chainLength is not finite`);
        }
      }
    }
  }

  // Validate evidence.
  if (input.evidence) {
    if (!Array.isArray(input.evidence)) {
      errors.push('evidence must be an array');
    } else {
      for (let i = 0; i < input.evidence.length; i++) {
        const e = input.evidence[i];
        if (!e.id) errors.push(`evidence[${i}].id is required`);
        if (typeof e.confidence !== 'number' || !isFinite(e.confidence)) {
          errors.push(`evidence[${i}].confidence is not finite`);
        }
      }
    }
  }

  return Object.freeze(errors);
}

// ── RiskEvaluator ──

/**
 * Top-level risk evaluation facade.
 *
 * The RiskEvaluator is the primary entry point for risk evaluation in
 * the VERIS pipeline. It accepts upstream pipeline outputs, transforms
 * them into the lightweight RiskInput format, validates the input, and
 * executes the full evaluation pipeline.
 *
 * ## Thread Safety
 *
 * The RiskEvaluator has no mutable state beyond its configuration.
 * Multiple threads can safely share a single instance. The underlying
 * RiskEngine is also stateless.
 *
 * ## Determinism Guarantee
 *
 * Identical inputs always produce identical outputs when the same
 * configuration is used. The only potential non-determinism is the
 * `computedAt` timestamp, which can be overridden via engine options.
 *
 * ## Usage
 *
 * ```typescript
 * const evaluator = new RiskEvaluator();
 *
 * const assessment = evaluator.evaluate({
 *   ruleMatches: [{ ruleId: "RULE-001", severityScore: 8.0, severityLevel: "high", confidence: 0.9, evidenceIds: ["ev-001"] }],
 *   correlations: [],
 *   evidence: [{ id: "ev-001", confidence: 0.9, category: "pe-import", artifactId: "art-main.exe" }],
 *   artifactId: "art-main.exe",
 *   sessionId: "session-001",
 * });
 *
 * console.log(assessment.riskScore);  // 6.40
 * ```
 */
export class RiskEvaluator {
  /** The underlying risk engine. */
  private readonly engine: RiskEngine;

  /**
   * Internal configuration with required profiles (always populated
   * by the constructor defaults).
   */
  private readonly config: {
    readonly weightProfile: WeightProfile;
    readonly thresholdProfile: ThresholdProfile;
    readonly engineOptions: RiskEngineOptions | undefined;
  };

  /**
   * Creates a new RiskEvaluator instance.
   *
   * @param config - Optional evaluator configuration.
   */
  constructor(config?: EvaluatorConfig) {
    const weightProfile = config?.weightProfile ?? DEFAULT_WEIGHT_PROFILE;
    const thresholdProfile = config?.thresholdProfile ?? DEFAULT_THRESHOLD_PROFILE;

    this.config = Object.freeze({
      weightProfile: Object.freeze({ ...weightProfile }),
      thresholdProfile: Object.freeze({ ...thresholdProfile }),
      engineOptions: config?.engineOptions,
    });

    this.engine = new RiskEngine(config?.engineOptions);
  }

  /**
   * Evaluates upstream pipeline outputs and produces a RiskAssessment.
   *
   * ## Pipeline
   *
   * 1. **Transformation** — converts Source types to RiskInput types.
   * 2. **Validation** — validates the transformed input.
   * 3. **Evaluation** — runs the RiskEngine's evaluate() method.
   *
   * ## Parameters
   *
   * @param input   - The evaluator input with upstream pipeline results.
   * @param options - Optional per-call options that override engine-level defaults.
   * @returns A frozen, immutable RiskAssessment.
   * @throws {TypeError} If input is null or undefined.
   * @throws {Error} If input validation fails.
   */
  evaluate(input: EvaluatorInput, options?: RiskEngineOptions): RiskAssessment {
    if (!input) {
      throw new TypeError('EvaluatorInput is required');
    }

    // Stage 1 — validate input.
    const validationErrors = validateEvaluatorInput(input);
    if (validationErrors.length > 0) {
      throw new Error(`RiskEvaluator input validation failed: ${validationErrors.join('; ')}`);
    }

    // Stage 2 — transform upstream types to RiskInput.
    const riskInput = this.transformInput(input);

    // Stage 3 — delegate to the engine.
    return this.engine.evaluate(riskInput, options);
  }

  /**
   * Transforms EvaluatorInput into RiskInput.
   *
   * This is the core transformation logic. It converts domain types
   * (SourceRuleMatch, SourceCorrelation, SourceEvidence) into the
   * lightweight types consumed by the RiskEngine.
   *
   * @param input - The evaluator input.
   * @returns A frozen RiskInput.
   */
  private transformInput(input: EvaluatorInput): RiskInput {
    // Convert rule matches.
    const matches: RiskRuleMatch[] = [];
    if (input.ruleMatches) {
      for (let i = 0; i < input.ruleMatches.length; i++) {
        matches.push(toRiskRuleMatch(input.ruleMatches[i]));
      }
    }

    // Convert correlations.
    const correlations: RiskCorrelation[] = [];
    if (input.correlations) {
      for (let i = 0; i < input.correlations.length; i++) {
        correlations.push(toRiskCorrelation(input.correlations[i]));
      }
    }

    // Convert evidence.
    const evidence: RiskEvidence[] = [];
    if (input.evidence) {
      for (let i = 0; i < input.evidence.length; i++) {
        evidence.push(toRiskEvidence(input.evidence[i]));
      }
    }

    return Object.freeze({
      matches: Object.freeze(matches),
      correlations: Object.freeze(correlations),
      evidence: Object.freeze(evidence),
      artifactId: input.artifactId,
      sessionId: input.sessionId,
    });
  }

  // ── Configuration Accessors ──

  /**
   * Returns the evaluator's weight profile.
   */
  getWeightProfile(): WeightProfile {
    return this.config.weightProfile;
  }

  /**
   * Returns the evaluator's threshold profile.
   */
  getThresholdProfile(): ThresholdProfile {
    return this.config.thresholdProfile;
  }

  /**
   * Returns the underlying RiskEngine instance.
   */
  getEngine(): RiskEngine {
    return this.engine;
  }
}
