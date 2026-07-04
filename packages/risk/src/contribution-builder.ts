/**
 * @veris/risk/contribution-builder — Deterministic Contribution Builder.
 *
 * ## What is a Contribution?
 *
 * A Contribution is the atomic unit of explainability in the risk engine.
 * Every upstream deterministic result (rule match, correlation, evidence)
 * produces exactly one Contribution. The array of Contributions is the
 * complete, ordered set of risk-significant inputs.
 *
 * ## Ownership Boundaries
 *
 * This builder is the **only** place where upstream pipeline results are
 * transformed into contributions. It sits AFTER Correlation and BEFORE
 * risk aggregation / verdict computation in the pipeline:
 *
 *   Rules → Correlation → **Risk: Contribution Builder** → Aggregation → Verdict
 *
 * Future milestones will consume the output of this builder to compute
 * dimension scores, aggregate risk, and determine verdicts. This builder
 * is intentionally limited to deterministic contribution construction.
 *
 * ## Why No Aggregation Here
 *
 * Aggregation requires combining contributions (e.g., per-dimension scoring,
 * risk score computation, confidence aggregation). These responsibilities
 * belong to the risk aggregation milestone, not this builder. Keeping them
 * separate ensures:
 *
 * - Each contribution is independently verifiable.
 * - Aggregation strategies can change without rebuilding contributions.
 * - The builder remains pure and testable.
 *
 * ## Ordering Guarantees
 *
 * The returned contributions are ordered as follows:
 *
 * 1. **Rule match contributions** — in the order they appear in `matches`.
 * 2. **Correlation contributions** — in the order they appear in `correlations`.
 * 3. **Evidence contributions** — in the order they appear in `evidence`.
 *
 * Within each group, the original array order is preserved. This ordering
 * is stable: identical inputs always produce identically ordered outputs.
 *
 * ## Traceability Guarantees
 *
 * Every Contribution is fully traceable to its upstream input:
 *
 * - `id` is a deterministic hash of the source type and source identifier.
 * - `sourceType` / `sourceId` directly reference the upstream object.
 * - `evidenceIds` are directly from the upstream object — never invented.
 * - `severity` is present for rule matches, `null` otherwise.
 * - `baseValue` is computed deterministically from upstream numeric fields.
 * - `formula` captures every computation step for auditor verification.
 *
 * ## Relationship to Future Milestones
 *
 * - **Aggregation** consumes these contributions to compute dimension scores.
 * - **Verdict computation** uses the aggregated dimension scores.
 * - **Explainers** use the formula, multipliers, and metadata to produce
 *   human-readable explanations.
 *
 * @module @veris/risk/contribution-builder
 */

import { deterministicId } from '@veris/shared';

import { CONTRIBUTION_ID_PREFIX, RISK_SCORE_MIN, RISK_SCORE_MAX } from './constants.js';
import { computeContributionValue, clamp, round6 } from './scoring.js';
import type {
  Contribution,
  RiskRuleMatch,
  RiskCorrelation,
  RiskEvidence,
  RiskInput,
  FormulaSteps,
  FormulaStep,
} from './types.js';
import { SOURCE_TYPES } from './types.js';

// ── Constants ──

/** Default dimension weight for standalone rule matches (no correlation context). */
const DEFAULT_DIMENSION_WEIGHT = 1.0;

// ── Formula Builders ──

/**
 * Builds formula steps for a computed contribution value.
 *
 * Uses the same evaluation order as `computeContributionValue`:
 * 1. Multiply severity × confidence.
 * 2. Multiply result × dimensionWeight.
 * 3. Clamp to [0.0, 10.0] (via `clamp` from scoring.ts).
 * 4. Round to 6 decimal places (via `round6` from scoring.ts).
 *
 * @param severity       - The severity score.
 * @param confidence     - The confidence score.
 * @param dimensionWeight - The dimension weight.
 * @param finalValue     - The final baseValue (from computeContributionValue).
 * @returns The structured formula representation.
 */
function buildFormula(
  severity: number,
  confidence: number,
  dimensionWeight: number,
  finalValue: number,
): FormulaSteps {
  // Evaluate in the same fixed left-to-right order as computeContributionValue:
  // (severity × confidence) × dimensionWeight.
  const sevTimesConf = severity * confidence;
  const product = sevTimesConf * dimensionWeight;
  const clamped = clamp(product, RISK_SCORE_MIN, RISK_SCORE_MAX);
  const rounded = round6(clamped);

  const steps: FormulaStep[] = [
    {
      operation: 'multiply',
      operands: [
        { name: 'severity', value: severity },
        { name: 'confidence', value: confidence },
      ],
      result: sevTimesConf,
    },
    {
      operation: 'multiply',
      operands: [
        { name: 'intermediate', value: sevTimesConf },
        { name: 'dimensionWeight', value: dimensionWeight },
      ],
      result: product,
    },
    {
      operation: 'clamp',
      operands: [
        { name: 'value', value: product },
        { name: 'min', value: RISK_SCORE_MIN },
        { name: 'max', value: RISK_SCORE_MAX },
      ],
      result: clamped,
    },
    {
      operation: 'round',
      operands: [
        { name: 'value', value: clamped },
        { name: 'precision', value: 6 },
      ],
      result: rounded,
    },
  ];

  const display = `${severity} × ${confidence} × ${dimensionWeight} = ${finalValue} (clamped to [${RISK_SCORE_MIN}, ${RISK_SCORE_MAX}], rounded to 6dp)`;

  return {
    display,
    steps: Object.freeze(steps),
  };
}

/**
 * Builds a zero-value formula for contributions without severity.
 *
 * @returns A formula showing the contribution is zero due to missing severity.
 */
function buildZeroFormula(): FormulaSteps {
  const steps: FormulaStep[] = [
    {
      operation: 'constant',
      operands: [{ name: 'value', value: 0 }],
      result: 0,
    },
  ];

  return {
    display: '0 (no severity — contribution value cannot be computed without severity)',
    steps: Object.freeze(steps),
  };
}

// ── Contribution Builders ──

/**
 * Builds a single Contribution from a RiskRuleMatch.
 *
 * @param match - The rule match to transform.
 * @returns An immutable Contribution.
 */
function buildRuleContribution(match: RiskRuleMatch): Contribution {
  const sourceId = match.ruleId;
  const id = deterministicId(
    CONTRIBUTION_ID_PREFIX,
    SOURCE_TYPES.RULE,
    sourceId,
    ...match.evidenceIds,
  );
  const confidence = match.confidence;
  const severityScore = match.severity.score;
  const dimensionWeight = DEFAULT_DIMENSION_WEIGHT;

  // Compute base value using the standard formula.
  const baseValue = computeContributionValue(severityScore, confidence, dimensionWeight);

  // No multipliers at this stage — they are added during aggregation.
  const multipliers: readonly import('./types.js').MultiplierItem[] = Object.freeze([]);
  const effectiveValue = baseValue;

  // Build formula steps.
  const formula = buildFormula(severityScore, confidence, dimensionWeight, baseValue);

  return Object.freeze({
    id,
    sourceType: SOURCE_TYPES.RULE,
    sourceId,
    sourceName: sourceId,
    baseValue,
    effectiveValue,
    confidence,
    severity: match.severity,
    evidenceIds: Object.freeze([...match.evidenceIds]),
    explanation: sourceId,
    formula,
    multipliers,
    metadata: Object.freeze({
      taxonomyIds: Object.freeze([...match.taxonomyIds]),
    }),
  });
}

/**
 * Builds a single Contribution from a RiskCorrelation.
 *
 * Correlations represent behavioral chains. They do not have a severity,
 * so their baseValue is 0. The chain amplification metadata is captured
 * for downstream aggregation, where it will amplify related rule match
 * contributions.
 *
 * @param correlation - The correlation to transform.
 * @returns An immutable Contribution.
 */
function buildCorrelationContribution(correlation: RiskCorrelation): Contribution {
  const sourceId = correlation.correlationId;
  const id = deterministicId(
    CONTRIBUTION_ID_PREFIX,
    SOURCE_TYPES.CORRELATION,
    sourceId,
    ...correlation.evidenceIds,
  );
  const confidence = correlation.confidence;

  // No severity — cannot compute a meaningful base value.
  const baseValue = 0;
  const multipliers: readonly import('./types.js').MultiplierItem[] = Object.freeze([]);
  const effectiveValue = baseValue;
  const formula = buildZeroFormula();

  return Object.freeze({
    id,
    sourceType: SOURCE_TYPES.CORRELATION,
    sourceId,
    sourceName: sourceId,
    baseValue,
    effectiveValue,
    confidence,
    severity: null,
    evidenceIds: Object.freeze([...correlation.evidenceIds]),
    explanation: sourceId,
    formula,
    multipliers,
    metadata: Object.freeze({
      chainLength: correlation.chainLength,
    }),
  });
}

/**
 * Builds a single Contribution from a RiskEvidence.
 *
 * Direct evidence contributions carry no severity or dimension weight,
 * so their baseValue is 0. They exist to ensure every piece of evidence
 * is represented in the contribution set for downstream traceability.
 *
 * @param evidence - The evidence reference to transform.
 * @returns An immutable Contribution.
 */
function buildEvidenceContribution(evidence: RiskEvidence): Contribution {
  const sourceId = evidence.id;
  const id = deterministicId(CONTRIBUTION_ID_PREFIX, SOURCE_TYPES.EVIDENCE, sourceId);
  const confidence = evidence.confidence;

  // No severity — cannot compute a meaningful base value.
  const baseValue = 0;
  const multipliers: readonly import('./types.js').MultiplierItem[] = Object.freeze([]);
  const effectiveValue = baseValue;
  const formula = buildZeroFormula();

  return Object.freeze({
    id,
    sourceType: SOURCE_TYPES.EVIDENCE,
    sourceId,
    sourceName: sourceId,
    baseValue,
    effectiveValue,
    confidence,
    severity: null,
    evidenceIds: Object.freeze([sourceId]),
    explanation: sourceId,
    formula,
    multipliers,
    metadata: Object.freeze({
      category: evidence.category,
      artifactId: evidence.artifactId,
    }),
  });
}

// ── Input Validation ──

/**
 * Result of input validation.
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/**
 * Validates the inputs to buildContributions.
 *
 * Checks for:
 * - NaN or Infinity in numeric fields (invalid inputs).
 * - Null or undefined arrays.
 * - Non-finite values in confidence or severity scores.
 *
 * @param input - The risk input to validate.
 * @returns Validation result with errors, if any.
 */
export function validateContributionInput(input: RiskInput): ValidationResult {
  const errors: string[] = [];

  if (!input) {
    return { valid: false, errors: ['Input is null or undefined'] };
  }

  if (!Array.isArray(input.matches)) {
    errors.push('matches must be an array');
  } else {
    for (let i = 0; i < input.matches.length; i++) {
      const m = input.matches[i];
      if (!isFinite(m.confidence)) {
        errors.push(`matches[${i}].confidence is not finite: ${m.confidence}`);
      }
      const sevScore = m.severity.score;
      if (!isFinite(sevScore)) {
        errors.push(`matches[${i}].severity.score is not finite: ${sevScore}`);
      }
    }
  }

  if (!Array.isArray(input.correlations)) {
    errors.push('correlations must be an array');
  } else {
    for (let i = 0; i < input.correlations.length; i++) {
      const c = input.correlations[i];
      if (!isFinite(c.confidence)) {
        errors.push(`correlations[${i}].confidence is not finite: ${c.confidence}`);
      }
      if (!isFinite(c.chainLength)) {
        errors.push(`correlations[${i}].chainLength is not finite: ${c.chainLength}`);
      }
    }
  }

  if (!Array.isArray(input.evidence)) {
    errors.push('evidence must be an array');
  } else {
    for (let i = 0; i < input.evidence.length; i++) {
      const e = input.evidence[i];
      if (!isFinite(e.confidence)) {
        errors.push(`evidence[${i}].confidence is not finite: ${e.confidence}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: Object.freeze(errors),
  };
}

// ── Main Builder ──

/**
 * Transforms upstream deterministic results into immutable Contribution objects.
 *
 * This is the only function that should be used to create Contribution arrays.
 * It enforces all invariants: immutability, determinism, ordering, traceability.
 *
 * ## Usage
 * ```typescript
 * const contributions = buildContributions(input);
 * ```
 *
 * ## What This Function Does
 * - Converts each RiskRuleMatch into a Contribution with computed baseValue.
 * - Converts each RiskCorrelation into a Contribution with metadata for chain amplification.
 * - Converts each RiskEvidence into a Contribution for traceability.
 * - Freezes every object and array in the output.
 * - Preserves input ordering within each source type.
 *
 * ## What This Function Does NOT Do
 * - Does NOT aggregate contributions.
 * - Does NOT compute dimension scores.
 * - Does NOT compute risk scores or verdicts.
 * - Does NOT generate human-readable explanations.
 * - Does NOT mutate upstream objects.
 * - Does NOT deduplicate or filter contributions.
 *
 * ## Ordering Guarantee
 * The returned array is ordered: rule matches first (in input order),
 * then correlations (in input order), then evidence (in input order).
 * This ordering is stable: identical inputs always produce identically
 * ordered outputs.
 *
 * ## Determinism Guarantee
 * Identical inputs always produce identical outputs, including:
 * - Same number of contributions.
 * - Same ordering.
 * - Same IDs (deterministic hash-based).
 * - Same computed values.
 * - Same frozen object references (structural equality).
 *
 * @param input - The risk engine input containing matches, correlations, and evidence.
 * @returns An frozen array of immutable Contribution objects.
 * @throws {TypeError} If input is null or undefined.
 */
export function buildContributions(input: RiskInput): readonly Contribution[] {
  if (!input) {
    throw new TypeError('RiskInput is required');
  }

  const { matches, correlations, evidence } = input;

  // Pre-allocate capacity to avoid growth allocations.
  // We know the exact size from the input arrays.
  const totalSize = (matches?.length ?? 0) + (correlations?.length ?? 0) + (evidence?.length ?? 0);

  const contributions: Contribution[] = new Array(totalSize);
  let index = 0;

  // Phase 1: Rule matches — in input order.
  if (matches) {
    for (let i = 0; i < matches.length; i++) {
      contributions[index++] = buildRuleContribution(matches[i]);
    }
  }

  // Phase 2: Correlations — in input order.
  if (correlations) {
    for (let i = 0; i < correlations.length; i++) {
      contributions[index++] = buildCorrelationContribution(correlations[i]);
    }
  }

  // Phase 3: Evidence — in input order.
  if (evidence) {
    for (let i = 0; i < evidence.length; i++) {
      contributions[index++] = buildEvidenceContribution(evidence[i]);
    }
  }

  return Object.freeze(contributions);
}
