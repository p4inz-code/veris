/**
 * @veris/risk/decision-engine — Deterministic decision engine.
 *
 * ## Responsibility
 *
 * The DecisionEngine takes a completed RiskAssessment and produces an
 * actionable RiskDecision. While the RiskEngine answers "How risky is this?",
 * the DecisionEngine answers "What should I do about it?"
 *
 * ## Why Decisions are Separate from Risk Assessment
 *
 * In earlier milestones, the RiskEngine produced a single RiskAssessment
 * that contained the risk score, verdict, and confidence. However,
 * downstream consumers need more than raw numbers — they need:
 *
 * 1. **Actionable decisions** — "Should I block deployment?" / "Should I
 *    investigate further?" / "Can I ignore this?"
 * 2. **Decision rationale** — why this decision was made, with traceable
 *    evidence.
 * 3. **Confidence-aware recommendations** — recommendations that account
 *    for confidence, not just raw scores.
 * 4. **Prioritization** — which actions to take first.
 *
 * The DecisionEngine adds this layer on top of the RiskAssessment without
 * modifying the assessment itself. This preserves backward compatibility
 * and keeps the risk scoring pipeline pure.
 *
 * ## Decision Types
 *
 * The engine produces one of several decision types based on the verdict:
 *
 * | Verdict         | Decision Type        | Recommended Action                          |
 * |-----------------|----------------------|---------------------------------------------|
 * | malicious       | block                | Block immediately, alert security team      |
 * | likely-malicious| investigate          | Deep investigation, escalate                |
 * | suspicious      | review               | Manual review, gather more evidence         |
 * | likely-benign   | monitor              | Low-priority monitoring                     |
 * | benign          | allow                | No action required                          |
 * | unknown         | insufficient-evidence| Gather more evidence before deciding        |
 *
 * ## Determinism Guarantee
 *
 * Identical inputs always produce identical decisions. The engine is a
 * pure function of its inputs — no randomness, no external state, no
 * hidden heuristics.
 *
 * ## Usage
 *
 * ```typescript
 * const decisionEngine = new DecisionEngine();
 * const decision = decisionEngine.decide(assessment);
 *
 * console.log(decision.action);          // "investigate"
 * console.log(decision.priority);        // "high"
 * console.log(decision.rationale);       // "Risk score 6.4 with confidence 0.85..."
 * ```
 *
 * @module @veris/risk/decision-engine
 */

import { deterministicId } from '@veris/shared';

import type { RiskAssessment, Verdict } from './types.js';
import { VERDICTS } from './types.js';

// ── Decision Types ──

/**
 * The recommended action type for a risk decision.
 *
 * - **block** — immediate action required. Block/quarantine the artifact.
 * - **investigate** — deep investigation needed. Escalate to analyst.
 * - **review** — manual review recommended. Gather more context.
 * - **monitor** — low-priority monitoring. No immediate action.
 * - **allow** — no action required. Safe to proceed.
 * - **insufficient-evidence** — cannot decide. Need more data.
 */
export type DecisionAction =
  'block' | 'investigate' | 'review' | 'monitor' | 'allow' | 'insufficient-evidence';

/**
 * Priority level for a decision.
 */
export type DecisionPriority = 'critical' | 'high' | 'medium' | 'low' | 'none';

/**
 * A single actionable recommendation.
 */
export interface DecisionRecommendation {
  /** Recommendation text. */
  readonly text: string;
  /** Priority of this recommendation. */
  readonly priority: DecisionPriority;
  /** Category of recommendation. */
  readonly category: 'investigation' | 'remediation' | 'monitoring' | 'evidence-gathering';
}

/**
 * The complete output of the decision engine.
 *
 * A RiskDecision wraps a RiskAssessment with actionable decision
 * metadata, providing downstream consumers with clear guidance on
 * what to do next.
 */
export interface RiskDecision {
  /** The original risk assessment that produced this decision. */
  readonly assessment: RiskAssessment;

  /** The recommended action. */
  readonly action: DecisionAction;

  /** Priority of this decision. */
  readonly priority: DecisionPriority;

  /** Human-readable rationale for the decision. */
  readonly rationale: string;

  /** Whether the decision is confidence-limited (low confidence, high score). */
  readonly confidenceLimited: boolean;

  /** Ordered recommendations (highest priority first). */
  readonly recommendations: readonly DecisionRecommendation[];

  /** Deterministic decision ID derived from the assessment ID. */
  readonly decisionId: string;
}

// ── Decision Configuration ──

/**
 * Configuration for the DecisionEngine.
 */
export interface DecisionEngineConfig {
  /**
   * Minimum confidence for "malicious" to produce "block" action.
   * Default: 0.8 (matches VERDICT_THRESHOLDS.maliciousConfidence).
   */
  readonly blockConfidenceThreshold?: number;

  /**
   * Minimum score for "likely-malicious" to produce "investigate" action.
   * Default: 6.0 (matches VERDICT_THRESHOLDS.likelyMaliciousScore).
   */
  readonly investigateScoreThreshold?: number;
}

// ── Action Mapping ──

/**
 * Maps a verdict to a decision action.
 *
 * @param verdict - The assessment verdict.
 * @returns The corresponding decision action.
 */
function verdictToAction(verdict: Verdict): DecisionAction {
  switch (verdict) {
    case VERDICTS.MALICIOUS:
      return 'block';
    case VERDICTS.LIKELY_MALICIOUS:
      return 'investigate';
    case VERDICTS.SUSPICIOUS:
      return 'review';
    case VERDICTS.LIKELY_BENIGN:
      return 'monitor';
    case VERDICTS.BENIGN:
      return 'allow';
    default:
      return 'insufficient-evidence';
  }
}

/**
 * Maps a decision action to a priority level.
 *
 * @param action - The decision action.
 * @returns The corresponding priority.
 */
function actionToPriority(action: DecisionAction): DecisionPriority {
  switch (action) {
    case 'block':
      return 'critical';
    case 'investigate':
      return 'high';
    case 'review':
      return 'medium';
    case 'monitor':
      return 'low';
    case 'allow':
      return 'none';
    case 'insufficient-evidence':
      return 'none';
  }
}

// ── Rationale Builder ──

/**
 * Builds a human-readable rationale for the decision.
 *
 * @param assessment - The risk assessment.
 * @param action     - The decision action.
 * @returns A human-readable rationale string.
 */
function buildRationale(assessment: RiskAssessment, action: DecisionAction): string {
  const score = assessment.riskScore;
  const level = assessment.riskLevel;
  const confidence = assessment.confidence;
  const contributionCount = assessment.totalContributionCount;

  switch (action) {
    case 'block':
      return (
        `Risk score ${score} (${level}) with confidence ${confidence}. ` +
        `Verdict "${assessment.verdict}" indicates confirmed malicious activity. ` +
        `Based on ${contributionCount} contributions. Immediate action required.`
      );
    case 'investigate':
      return (
        `Risk score ${score} (${level}) with confidence ${confidence}. ` +
        `Verdict "${assessment.verdict}" indicates strong indicators of malicious activity. ` +
        `Based on ${contributionCount} contributions. Deep investigation recommended.`
      );
    case 'review':
      return (
        `Risk score ${score} (${level}) with confidence ${confidence}. ` +
        `Verdict "${assessment.verdict}" indicates some concerning indicators. ` +
        `Based on ${contributionCount} contributions. Manual review warranted.`
      );
    case 'monitor':
      return (
        `Risk score ${score} (${level}) with confidence ${confidence}. ` +
        `Verdict "${assessment.verdict}" indicates likely safe with minor concerns. ` +
        `Based on ${contributionCount} contributions. Low-priority monitoring.`
      );
    case 'allow':
      return (
        `Risk score ${score} (${level}) with confidence ${confidence}. ` +
        `Verdict "${assessment.verdict}" indicates safe artifact. ` +
        `Based on ${contributionCount} contributions. No action required.`
      );
    case 'insufficient-evidence':
      return (
        `Risk score ${score} (${level}) but confidence is low (${confidence}). ` +
        `Verdict "${assessment.verdict}" — insufficient evidence for a reliable conclusion. ` +
        `Based on ${contributionCount} contributions. More evidence needed.`
      );
  }
}

// ── Decision ID ──

/**
 * Generates a deterministic decision ID from the assessment ID.
 *
 * Uses the `deterministicId` function from `@veris/shared` with the
 * `"rd"` prefix, ensuring the same assessment always produces the
 * same decision ID regardless of ID format changes.
 *
 * @param assessmentId - The assessment ID.
 * @returns A deterministic decision ID with prefix "rd_".
 */
function generateDecisionId(assessmentId: string): string {
  return deterministicId('rd', assessmentId);
}

// ── Recommendation Builder ──

/**
 * Builds recommendations for a given decision action.
 *
 * Returns at most 3 recommendations, ordered by priority.
 *
 * @param assessment - The risk assessment.
 * @param action     - The decision action.
 * @returns An array of recommendations.
 */
function buildRecommendations(
  assessment: RiskAssessment,
  action: DecisionAction,
): readonly DecisionRecommendation[] {
  const recommendations: DecisionRecommendation[] = [];

  switch (action) {
    case 'block':
      recommendations.push({
        text: 'Quarantine the artifact immediately to prevent execution or further spread.',
        priority: 'critical',
        category: 'remediation',
      });
      recommendations.push({
        text: 'Alert the security team with full assessment details and contribution breakdown.',
        priority: 'critical',
        category: 'investigation',
      });
      recommendations.push({
        text: 'Review correlated artifacts for signs of related malicious activity.',
        priority: 'high',
        category: 'investigation',
      });
      break;

    case 'investigate':
      recommendations.push({
        text: 'Perform deep analysis of the artifact with additional scanning tools.',
        priority: 'high',
        category: 'investigation',
      });
      recommendations.push({
        text: 'Review behavioral chains for patterns of malicious activity.',
        priority: 'high',
        category: 'investigation',
      });
      recommendations.push({
        text: 'Gather additional evidence from correlated findings.',
        priority: 'medium',
        category: 'evidence-gathering',
      });
      break;

    case 'review':
      recommendations.push({
        text: 'Manually review the artifact and its contributing findings.',
        priority: 'medium',
        category: 'investigation',
      });
      recommendations.push({
        text: 'Enable additional analysis dimensions to improve confidence.',
        priority: 'medium',
        category: 'evidence-gathering',
      });
      break;

    case 'monitor':
      recommendations.push({
        text: 'Add the artifact to a monitoring list for future scans.',
        priority: 'low',
        category: 'monitoring',
      });
      break;

    case 'allow':
      recommendations.push({
        text: 'No action required. The artifact is safe.',
        priority: 'none',
        category: 'monitoring',
      });
      break;

    case 'insufficient-evidence':
      recommendations.push({
        text: 'Gather more evidence before making a determination.',
        priority: 'medium',
        category: 'evidence-gathering',
      });
      recommendations.push({
        text: 'Enable additional analysis engines or rule packs.',
        priority: 'medium',
        category: 'evidence-gathering',
      });
      recommendations.push({
        text: 'Consider running a deeper scan with expanded coverage.',
        priority: 'low',
        category: 'evidence-gathering',
      });
      break;
  }

  return Object.freeze(recommendations);
}

// ── DecisionEngine ──

/**
 * Deterministic decision engine.
 *
 * The DecisionEngine consumes RiskAssessment objects and produces
 * actionable RiskDecision objects. It adds the "what to do" layer
 * on top of the risk scoring pipeline.
 *
 * ## Determinism Guarantee
 *
 * Identical assessments always produce identical decisions. The engine
 * is a pure function of its inputs.
 *
 * ## Thread Safety
 *
 * The DecisionEngine has no mutable state. Multiple threads can safely
 * share a single instance.
 *
 * ## Usage
 *
 * ```typescript
 * const decisionEngine = new DecisionEngine();
 * const decision = decisionEngine.decide(assessment);
 *
 * console.log(decision.action);     // "investigate"
 * console.log(decision.priority);   // "high"
 * console.log(decision.rationale);  // "Risk score 6.4..."
 * ```
 */
export class DecisionEngine {
  /** Engine configuration. */
  private readonly config: DecisionEngineConfig;

  /**
   * Creates a new DecisionEngine instance.
   *
   * @param config - Optional configuration overrides.
   */
  constructor(config?: DecisionEngineConfig) {
    this.config = Object.freeze({
      blockConfidenceThreshold: config?.blockConfidenceThreshold ?? 0.8,
      investigateScoreThreshold: config?.investigateScoreThreshold ?? 6.0,
    });
  }

  /**
   * Produces a RiskDecision from a RiskAssessment.
   *
   * ## Pipeline
   *
   * 1. Map verdict → decision action.
   * 2. Compute confidence-limited flag.
   * 3. Build rationale.
   * 4. Generate recommendations.
   * 5. Build and freeze the RiskDecision.
   *
   * ## Determinism
   *
   * Identical assessments always produce identical decisions.
   *
   * @param assessment - The risk assessment to decide on.
   * @returns A frozen, immutable RiskDecision.
   * @throws {TypeError} If assessment is null or undefined.
   */
  decide(assessment: RiskAssessment): RiskDecision {
    if (!assessment) {
      throw new TypeError('RiskAssessment is required');
    }

    // Stage 1 — map verdict to action.
    const action = verdictToAction(assessment.verdict);

    // Stage 2 — compute priority.
    const priority = actionToPriority(action);

    // Stage 3 — determine if decision is confidence-limited.
    const confidenceLimited = this.isConfidenceLimited(assessment);

    // Stage 4 — build rationale.
    const rationale = buildRationale(assessment, action);

    // Stage 5 — build recommendations.
    const recommendations = buildRecommendations(assessment, action);

    // Stage 6 — generate decision ID.
    const decisionId = generateDecisionId(assessment.id);

    // Stage 7 — build and freeze.
    return Object.freeze({
      assessment,
      action,
      priority,
      rationale,
      confidenceLimited,
      recommendations,
      decisionId,
    });
  }

  /**
   * Determines whether a decision is confidence-limited.
   *
   * A decision is confidence-limited when the score qualifies for a
   * high-severity action but the confidence is below the threshold
   * for that action.
   *
   * @param assessment - The risk assessment.
   * @returns True if the decision is confidence-limited.
   */
  private isConfidenceLimited(assessment: RiskAssessment): boolean {
    const score = assessment.riskScore;
    const confidence = assessment.confidence;

    // If score qualifies for "block" but confidence is too low.
    if (
      score >= (this.config.investigateScoreThreshold ?? 6.0) &&
      confidence < (this.config.blockConfidenceThreshold ?? 0.8)
    ) {
      return true;
    }

    return false;
  }
}
