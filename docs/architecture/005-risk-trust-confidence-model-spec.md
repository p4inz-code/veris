# VERIS Risk Engine, Trust Engine & Confidence Model — SPEC-005

**Status:** Frozen  
**Version:** 1.0  
**Applies to:** Risk scoring, trust evaluation, confidence calculation, mathematical model, dimension framework, repository aggregation, explainability.  
**Scope:** V1 through V4 without architectural redesign.

---

## Table of Contents

1. [Core Philosophy](#1-core-philosophy)
2. [Mathematical Foundation](#2-mathematical-foundation)
3. [Confidence Engine](#3-confidence-engine)
4. [Risk Engine](#4-risk-engine)
5. [Trust Engine](#5-trust-engine)
6. [Score Dimensions](#6-score-dimensions)
7. [Repository-Level Scoring](#7-repository-level-scoring)
8. [Explainability](#8-explainability)
9. [Edge Cases](#9-edge-cases)
10. [Diagnostics](#10-diagnostics)
11. [Performance Strategy](#11-performance-strategy)
12. [Future Compatibility](#12-future-compatibility)
13. [Engineering Tradeoffs](#13-engineering-tradeoffs)
14. [Common Mistakes to Avoid](#14-common-mistakes-to-avoid)
15. [Final Recommendations](#15-final-recommendations)

---

## 1. Core Philosophy

### 1.1 First Principles

VERIS evaluates **observable behaviors**, not intent. The scoring system is built on five non-negotiable principles:

1. **Determinism** — Same input, same scores. Every time. No randomness, no LLM approximation, no floating-point non-determinism.
2. **Traceability** — Every point added or removed from any score traces to a specific piece of Evidence. No hidden calculations.
3. **No Magic Numbers** — Every coefficient, weight, and threshold is derived from a documented formula. No arbitrarily chosen constants.
4. **No Exaggeration** — Scores reflect the evidence, not the severity of the finding's title. A low-confidence finding contributes less than a high-confidence one, regardless of how alarming the rule name sounds.
5. **Explainability** — Every score can answer: "Why this value and not higher or lower?"

### 1.2 What VERIS Does Not Do

- VERIS does **not** claim malware. It reports observed behaviors and their risk.
- VERIS does **not** use reputation databases (unless explicitly configured as an optional add-on).
- VERIS does **not** use AI for scoring.
- VERIS does **not** adjust scores based on filenames.
- VERIS does **not** hide score methodology.

### 1.3 Three Independent Engines

```
┌───────────────────┐
│  Confidence       │  "How sure are we that the evidence is real?"
│  Engine           │  Input: Feature confidence, extraction quality,
│                   │         parser recovery, behavior ambiguity
└───────────────────┘
         │
         ▼
┌───────────────────┐
│  Risk Engine      │  "How concerning are the observed behaviors?"
│                   │  Input: Findings + Confidence + Dimensions
└───────────────────┘
         │
         ▼
┌───────────────────┐
│  Trust Engine     │  "How trustworthy is the artifact given its
│                   │   metadata, structure, and provenance?"
│                   │  Input: Artifact metadata + RiskProfile
└───────────────────┘
         │
         ▼
┌───────────────────┐
│  Aggregate        │  "What is the overall assessment?"
│  Scoring          │  Repository-level combination
└───────────────────┘
```

**Invariant:** Each engine operates independently and produces its own score. The aggregate is a composition, not a blending. This ensures each dimension of analysis remains independently explainable.

---

## 2. Mathematical Foundation

### 2.1 Normalization Strategy

All scores use **bounded normalization** to [0.0, 1.0] for intermediate scores and [0.0, 10.0] for final risk scores.

**Normalization function:**

Let `raw_score` be the unnormalized sum of weighted contributions. Let `max_possible` be the maximum theoretical score for the current context.

```
normalized = raw_score / max_possible
```

Where:

- If `max_possible = 0` (no evidence), `normalized = 0`.
- Normalization is **contextual** — the max possible for a single file differs from a repository.
- Normalization uses the actual maximum possible given the current rule set and artifact count, not an arbitrary ceiling.

**Saturation:**

To prevent edge cases from dominating:

```
saturated = tanh(normalized × π / 2)
```

This maps [0.0, ∞) → [0.0, 1.0) with asymptotic behavior. `tanh(0) = 0`, `tanh(π/2) ≈ 1.0`, `tanh(∞) → 1.0`.

**Final scaling:**

```
final_score = saturated × 10.0
```

This produces a [0.0, 10.0] range for the final risk score.

### 2.2 Weighting Strategy

Weights are derived from **evidence density**, not arbitrary importance rankings.

**Base weight formula:**

```
weight(dimension) = evidence_count(dimension) / total_evidence_count
```

This means: a dimension with more evidence contributes proportionally more to the overall score. No dimension is assigned a fixed "importance" — importance is evidence-driven.

**Exception — Severity multiplier:**

Evidence of higher-severity findings is up-weighted:

```
effective_weight = weight × severity_multiplier

where:
  severity_multiplier = 1.0 + (severity_level_weighted × confidence)
  severity_level_weighted = severity.score / 10.0
  confidence = mean_confidence_of_evidence_in_dimension
```

This ensures that a single critical finding with high confidence contributes meaningfully, while a hundred info-level findings do not overwhelm it.

### 2.3 Composite Score Calculation

```
overall_risk = Σ_{d ∈ dimensions} effective_weight(d) × dimension_risk(d)

where:
  dimension_risk(d) = Σ_{e ∈ evidence_in_dimension(d)} confidence(e) × severity(e)
  effective_weight(d) = evidence_weight(d) × severity_multiplier(d)

final_risk = saturate(normalize(overall_risk))
```

**Stability guarantee:**

```
If input A == input B, then score(A) == score(B).
```

This is enforced by:

- Using deterministic floating-point operations (no non-deterministic accumulations).
- Using a fixed evaluation order (sorted by evidence ID).
- Using `tanh` for saturation (stable, deterministic, no branching).

### 2.4 Tie-Breaking

When two findings produce the same risk score, they are ordered by:

1. Confidence (higher first)
2. Evidence count (more first)
3. Rule priority (higher first)
4. Lexicographic rule ID (deterministic final tiebreaker)

### 2.5 Bounds

| Score                     | Minimum | Maximum | Interpretation                                        |
| ------------------------- | ------- | ------- | ----------------------------------------------------- |
| Confidence (per evidence) | 0.0     | 1.0     | 0 = no confidence, 1 = absolute certainty             |
| Confidence (per finding)  | 0.0     | 1.0     | Aggregated from evidence                              |
| Dimension risk            | 0.0     | 1.0     | Normalized per dimension                              |
| Overall risk              | 0.0     | 10.0    | After saturation and scaling                          |
| Trust                     | -1.0    | 1.0     | Negative = untrusted, positive = trusted, 0 = neutral |
| Trust (normalized)        | 0.0     | 1.0     | 0 = untrusted, 1 = fully trusted                      |

---

## 3. Confidence Engine

### 3.1 Purpose

Confidence answers: **"How certain are we that this evidence is real and the finding is valid?"**

Confidence is **not** severity. Severity says "how bad is this if true." Confidence says "how likely is it to be true."

### 3.2 Confidence Inputs

| Input                    | Source                 | Range      | Description                                                                        |
| ------------------------ | ---------------------- | ---------- | ---------------------------------------------------------------------------------- |
| Extraction confidence    | Feature extraction     | [0.0, 1.0] | How reliable was the parser that extracted this feature?                           |
| Parser recovery penalty  | Extraction diagnostics | [0.0, 0.5] | Penalty if parser needed recovery (penalty = recovery_count × 0.01, capped at 0.5) |
| Feature confidence       | Behavior classifier    | [0.0, 1.0] | How clearly does the feature indicate the behavior?                                |
| Behavior confidence      | Knowledge Layer        | [0.0, 1.0] | How clearly does the behavior match the taxonomy node?                             |
| Rule confidence          | Rule Engine matching   | [0.0, 1.0] | How precisely did the rule match the behavior?                                     |
| Match quality            | MatchDetail            | [0.0, 1.0] | Quality of the match (exact = 1.0, regex = 0.9, heuristic = varies)                |
| Evidence completeness    | Evidence count         | [0.0, 1.0] | Ratio of expected evidence to actual evidence                                      |
| Missing evidence penalty | Correlation            | [0.0, 0.3] | Penalty if expected correlating evidence is missing                                |

### 3.3 Confidence Calculation

**Per-Evidence Confidence:**

```
confidence(evidence) = extraction_confidence × feature_confidence × behavior_confidence × rule_confidence

where:
  extraction_confidence = base_extraction_confidence × (1.0 - parser_recovery_penalty)
  match_quality_factor = match_quality(matchDetail)
  feature_confidence = classifier_output.confidence
  behavior_confidence = behavior.confidence
  rule_confidence = match_quality_factor
```

**Explanation of multiplication:** Each factor is a necessary condition. If any factor is low, the overall confidence is low. This is intentional — confidence should degrade gracefully when any link in the chain is weak.

**Per-Finding Confidence:**

```
finding_confidence = mean(confidence(evidence) for evidence in finding.evidenceIds)
                     × completeness_factor

where:
  completeness_factor = actual_evidence_count / expected_evidence_count
  expected_evidence_count = number of behaviors the rule's taxonomyIds matched
  completeness_factor is capped at 1.0 (exceeding expectations doesn't boost confidence)
```

### 3.4 Confidence Levels

| Confidence Range | Level     | Interpretation                                                           |
| ---------------- | --------- | ------------------------------------------------------------------------ |
| 0.9 – 1.0        | Very High | Definite match. Exact pattern, clean extraction, no ambiguity.           |
| 0.7 – 0.9        | High      | Strong match. Minor ambiguity or partial parser recovery.                |
| 0.4 – 0.7        | Medium    | Moderate match. Heuristic match, some extraction issues.                 |
| 0.1 – 0.4        | Low       | Weak match. Significant ambiguity, parser recovery, or missing evidence. |
| 0.0 – 0.1        | Very Low  | Insufficient evidence. Finding likely spurious.                          |

### 3.5 Confidence Explainability

Every confidence score explains its factors:

```typescript
interface ConfidenceExplanation {
  overall: number; // [0.0, 1.0]
  level: 'very-high' | 'high' | 'medium' | 'low' | 'very-low';
  factors: ConfidenceFactor[];
  weakLink: {
    // The factor most limiting confidence
    name: string;
    value: number;
    impact: number; // How much this factor reduced confidence
    explanation: string;
  };
}

interface ConfidenceFactor {
  name: string;
  value: number;
  weight: number; // Contribution to final confidence
  explanation: string; // Human-readable
}
```

### 3.6 Missing Evidence Penalties

| Scenario                                | Penalty                                | Explanation                                               |
| --------------------------------------- | -------------------------------------- | --------------------------------------------------------- |
| Expected correlating behavior not found | -0.1                                   | Multi-behavior rule missing one of its expected behaviors |
| Parser recovered from errors            | Parser recovery count × 0.01 (max 0.5) | Unreliable parsing reduces extraction confidence          |
| Ambiguous taxonomy mapping              | -0.1 to -0.3                           | Feature could map to multiple taxonomy nodes              |
| Truncated extraction                    | -0.2                                   | Artifact limits caused partial extraction                 |

### 3.7 Parser Recovery Penalty

```
parser_recovery_penalty = min(recovery_count × 0.01, 0.5)
```

Where `recovery_count` is the number of parser recoveries during extraction (from SPEC-004).

This means:

- 0 recoveries → penalty = 0.0 (clean parse)
- 10 recoveries → penalty = 0.1 (some minor errors)
- 50 recoveries → penalty = 0.5 (significant errors, likely malformed file)
- More than 50 recoveries → capped at 0.5

---

## 4. Risk Engine

### 4.1 Purpose

Risk answers: **"How concerning are the observed behaviors, given our confidence in the evidence?"**

Risk is derived from: Behavior × Evidence × Correlation × Confidence × Context.

### 4.2 Risk Dimensions

Risk is computed across **independent dimensions** (see Section 6). Each dimension produces a dimension risk score.

```
dimension_risk(d) = Σ_{e ∈ evidence_in_dimension(d)} confidence(e) × severity(e)
                   / max_possible_for_dimension(d)
```

Where:

- `confidence(e)` is the per-evidence confidence (Section 3.3)
- `severity(e)` is the severity score [0.0, 10.0] from the rule that produced this evidence
- `max_possible_for_dimension(d)` is the theoretical maximum if every artifact exhibited the highest-severity behavior in this dimension

### 4.3 Risk Categories

Risk categories map to the output risk levels:

| Score Range | Level      | Label               | Description                                                                           |
| ----------- | ---------- | ------------------- | ------------------------------------------------------------------------------------- |
| 8.0 – 10.0  | Critical   | Immediate attention | Multiple high-confidence, high-severity findings in critical dimensions               |
| 6.0 – 7.9   | High       | Significant risk    | High-confidence findings in important dimensions                                      |
| 4.0 – 5.9   | Medium     | Moderate risk       | Moderate-confidence findings or high-confidence findings in lower-priority dimensions |
| 2.0 – 3.9   | Low        | Minor risk          | Low-confidence findings or informational issues                                       |
| 0.0 – 1.9   | Negligible | Informational       | No significant findings                                                               |

### 4.4 Severity Normalization

Severity scores [0.0, 10.0] are mapped from the finding's severity level:

| Level    | Score Range | Default |
| -------- | ----------- | ------- |
| critical | 8.0 – 10.0  | 9.0     |
| high     | 6.0 – 7.9   | 7.0     |
| medium   | 4.0 – 5.9   | 5.0     |
| low      | 2.0 – 3.9   | 3.0     |
| info     | 0.0 – 1.9   | 1.0     |

The default is used unless the rule specifies a different score. Scores are linear within their range.

### 4.5 Behavior Contribution

Each behavior contributes to risk proportionally to:

- Its confidence
- The severity of the rule it matched
- The weight of its taxonomy dimension

```
behavior_risk(behavior) = confidence(behavior) × severity(matched_rule) × dimension_weight(taxonomy(behavior))
```

### 4.6 Chain Contribution

A BehaviorChain contributes to risk by amplifying the risk of its constituent findings:

```
chain_risk(chain) = Σ_{f ∈ findings_in_chain(chain)} risk(f) × chain_multiplier

where:
  chain_multiplier = 1.0 + (length_of_chain - 1) × 0.05
  chain_multiplier is capped at 1.5
```

This means:

- A chain of 2 findings: multiplier = 1.05 (5% amplification)
- A chain of 5 findings: multiplier = 1.2 (20% amplification)
- A chain of 10+ findings: multiplier = 1.5 (50% amplification, capped)

**Rationale:** A multi-step behavioral sequence is more concerning than the same behaviors occurring independently. The amplification acknowledges correlation without exaggerating.

**Invariant:** Chain risk replaces individual finding risk for findings in the chain. The findings' individual risks are not counted independently (prevents double-counting, see §4.11).

### 4.7 Artifact Contribution

Per-artifact risk is the saturated sum of its findings and chains:

```
artifact_risk(a) = saturate(Σ_{f ∈ findings_of_artifact(a)} risk(f)
                            + Σ_{c ∈ chains_of_artifact(a)} chain_risk(c))
```

### 4.8 Repository Contribution

Repository risk is the aggregation of all artifact risks:

```
repository_risk = saturate(Σ_{a ∈ artifacts} artifact_risk(a) / artifact_count)

Where:
  artifact_risk(a) = per-artifact risk [0.0, 1.0]
  artifact_count = total artifacts analyzed

The division by artifact_count prevents large repositories from having
automatically inflated risk. It measures risk density, not risk volume.
```

### 4.9 Aggregate Risk Calculation

```
1. For each artifact, compute artifact_risk(a)
2. For each dimension, compute dimension_risk(d)
3. Compute overall_risk = Σ(dimension_risk(d) × dimension_weight(d))
4. Scale: final_risk = saturate(overall_risk) × 10.0
5. Map to risk category (critical/high/medium/low/negligible)
```

### 4.10 Risk Propagation Rules

| Propagation                | Direction | Rule                                                       |
| -------------------------- | --------- | ---------------------------------------------------------- |
| Evidence → Finding         | Upward    | Finding risk = mean(evidence risk)                         |
| Finding → BehaviorChain    | Lateral   | Chain risk replaces finding risk for findings in the chain |
| Finding → Artifact         | Upward    | Artifact risk = saturated sum of finding risks             |
| Artifact → Repository      | Upward    | Repository risk = mean artifact risk density               |
| Artifact → Parent Artifact | Upward    | Nested artifacts (archives) contribute to parent risk      |
| Dimension → Overall        | Upward    | Dimension risk weighted by evidence density                |

### 4.11 Risk Double-Counting Prevention

| Scenario                                        | Prevention                                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Same evidence contributing to multiple findings | Evidence is traced to one finding. If two findings reference the same behavior, the evidence is attributed to the first finding only. |
| Finding in a BehaviorChain                      | Finding risk is replaced by chain risk, not added to it.                                                                              |
| Nested artifacts (archive)                      | Child artifact contributes to parent risk, but parent does not recursively re-include child's risk.                                   |
| Duplicate artifacts (same contentHash)          | Only the first occurrence contributes. Subsequent duplicates are marked as "duplicate" and skipped.                                   |
| Correlation rules                               | Correlation rules do not generate new evidence. They reorganize existing evidence into chains.                                        |

---

## 5. Trust Engine

### 5.1 Purpose

Trust answers: **"How trustworthy is this artifact based on its metadata, structure, and provenance?"**

Trust is **independent** of risk. A file can be high-trust and high-risk (a known vulnerable library from an official source). A file can be low-trust and low-risk (an unnamed binary with no findings).

**Trust never eliminates evidence.** It only influences interpretation.

### 5.2 Trust Dimensions

| Dimension              | Signal                                                  | Range       | Weight |
| ---------------------- | ------------------------------------------------------- | ----------- | ------ |
| Digital signing        | Signed binary, valid signature chain, trusted publisher | [-1.0, 1.0] | 0.20   |
| Publisher reputation   | Known publisher, established identity                   | [-0.5, 0.5] | 0.10   |
| Metadata consistency   | Matching author/company/product metadata                | [-0.3, 0.3] | 0.05   |
| Source availability    | Source code present, matches binary                     | [-0.5, 0.5] | 0.15   |
| Build artifact quality | Clean build, no debug symbols, deterministic build      | [-0.3, 0.3] | 0.10   |
| Repository structure   | Standard layout, .gitignore, CI config, license         | [-0.5, 0.5] | 0.10   |
| Configuration quality  | Well-structured config, no default credentials          | [-0.3, 0.3] | 0.05   |
| File integrity         | Checksums match, no truncation, no corruption           | [-0.5, 0.5] | 0.10   |
| Certificate validity   | Valid cert chain, not expired, not self-signed          | [-0.5, 0.5] | 0.10   |
| Expected layout        | Project follows expected conventions                    | [-0.3, 0.3] | 0.05   |

### 5.3 Trust Score Calculation

```
trust_score = Σ(dimension_trust(d) × dimension_weight(d))

where:
  dimension_trust(d) ∈ [-1.0, 1.0]
  Σ(weights) = 1.0
  trust_score ∈ [-1.0, 1.0]

Normalized for output:
  trust_normalized = (trust_score + 1.0) / 2.0
  trust_normalized ∈ [0.0, 1.0]
  (0.0 = fully untrusted, 1.0 = fully trusted)
```

### 5.4 Trust Levels

| Normalized Score | Level          | Interpretation                                                |
| ---------------- | -------------- | ------------------------------------------------------------- |
| 0.8 – 1.0        | Trusted        | Verified publisher, signed, source available, clean structure |
| 0.5 – 0.8        | Likely Trusted | Some trust signals present, no strong red flags               |
| 0.3 – 0.5        | Neutral        | Insufficient information to determine trust                   |
| 0.1 – 0.3        | Suspicious     | Some trust signals missing or inconsistent                    |
| 0.0 – 0.1        | Untrusted      | Multiple trust violations, unsigned, unknown origin           |

### 5.5 Trust Modifiers on Risk

Trust does not change the risk score. It changes how risk is **presented**:

```
presented_risk = base_risk × trust_modifier

where:
  trust_modifier = 1.0 + (0.5 - trust_normalized) × 0.2
  trust_modifier ∈ [0.9, 1.1]

This means:
  trust_normalized = 1.0 (fully trusted) → modifier = 0.9 → risk reduced by 10%
  trust_normalized = 0.5 (neutral) → modifier = 1.0 → no change
  trust_normalized = 0.0 (untrusted) → modifier = 1.1 → risk increased by 10%
```

**Invariant:** The base risk score is always available. Trust is a presentation layer modifier, not a data layer change.

### 5.6 Trust Explainability

Every trust score explains its factors:

```typescript
interface TrustExplanation {
  overall: number; // [-1.0, 1.0]
  normalized: number; // [0.0, 1.0]
  level: 'trusted' | 'likely-trusted' | 'neutral' | 'suspicious' | 'untrusted';
  dimensions: TrustDimensionResult[];
  riskModifier: {
    // How trust affects risk presentation
    originalRisk: number;
    modifiedRisk: number;
    modifier: number;
    explanation: string;
  };
}

interface TrustDimensionResult {
  name: string;
  value: number; // [-1.0, 1.0]
  weight: number;
  contribution: number; // value × weight
  signals: TrustSignal[]; // What signals were observed
  explanation: string;
}

interface TrustSignal {
  name: string;
  positive: boolean; // Positive or negative signal
  strength: number; // [0.0, 1.0]
  detail: string;
}
```

---

## 6. Score Dimensions

### 6.1 Purpose

Dimensions provide the categorization framework for risk scoring. Each dimension is an independent axis of analysis.

### 6.2 Dimension Definitions

| ID    | Name                   | Description                    | Taxonomy Nodes          |
| ----- | ---------------------- | ------------------------------ | ----------------------- |
| D100  | Execution              | Code execution capabilities    | T1000–T1999             |
| D200  | Persistence            | Persistence mechanisms         | T2000–T2999             |
| D300  | Networking             | Network communication          | T3000–T3999             |
| D400  | Credential Access      | Credential theft/access        | T4000–T4999             |
| D500  | Secrets                | Secret/key exposure            | T5000–T5999             |
| D600  | File System            | File system operations         | T6000–T6999             |
| D700  | Registry               | Registry operations            | T7000–T7999             |
| D800  | Process                | Process manipulation           | T8000–T8999             |
| D900  | Archive                | Archive operations             | T9000–T9999             |
| D1000 | Encoding & Obfuscation | Encoding, obfuscation, packing | T10000–T10999           |
| D1100 | Cryptography           | Cryptographic operations       | T11000–T11999           |
| D1200 | Trust & Verification   | Trust boundary violations      | T12000–T12999           |
| D1300 | Configuration          | Security misconfiguration      | T14000–T14999           |
| D1400 | Privilege              | Privilege issues               | T15000–T15999           |
| D1500 | Environment            | Environment manipulation       | T16000–T16999           |
| D1600 | Repository Hygiene     | Repository health signals      | T90000+ (informational) |
| D1700 | Supply Chain           | Supply chain risk              | (TBD — future)          |
| D1800 | Trust (Dimension)      | Trust-related observations     | T12000–T12999           |

### 6.3 Dimension Properties

```typescript
interface ScoreDimension {
  id: DimensionId; // "D100"
  name: string; // "Execution"
  description: string;
  taxonomyIds: TaxonomyId[]; // Associated taxonomy nodes
  severityWeight: number; // How much severity affects this dimension [0.0, 1.0]
  isActive: boolean; // Can be disabled by config
  metadata: {
    sinceVersion: string;
    experimental: boolean;
    supersededBy: DimensionId | null;
  };
}
```

### 6.4 Dimension Aggregation

```
dimension_risk(d) = Σ_{b ∈ behaviors_in_dimension(d)} behavior_risk(b)
                   × Σ_{f ∈ findings_in_dimension(d)} finding_risk(f)
                   / max_possible_for_dimension(d)

Where:
  behaviors_in_dimension = behaviors whose taxonomyId maps to this dimension
  findings_in_dimension = findings whose taxonomyIds map to this dimension
  max_possible = evidence_count × max_severity × max_confidence
```

### 6.5 Adding New Dimensions

New dimensions are additive:

1. Define the dimension ID, name, and taxonomy mapping.
2. No existing dimension or formula changes.
3. The new dimension contributes naturally through evidence density weighting.

This ensures extensibility without redesign.

---

## 7. Repository-Level Scoring

### 7.1 Challenge

A repository may have thousands of files. Naively summing risk across all files inflates the score for large repositories and deflates it for small ones.

### 7.2 Risk Density Model

VERIS uses **risk density** rather than risk volume:

```
risk_density = Σ(artifact_risk) / artifact_count

Where:
  artifact_risk = per-artifact saturated risk [0.0, 1.0]
  artifact_count = total artifacts analyzed
```

This means:

- A 1000-file repo with 10 risky files: density = mean(10 × high + 990 × 0) / 1000 = low density
- A 10-file repo with 5 risky files: density = mean(5 × high + 5 × 0) / 10 = high density

### 7.3 Handling Thousands of Findings

**Binning strategy:**

- Findings are binned by severity × confidence.
- Bins: [critical × high-conf], [critical × med-conf], [high × high-conf], etc.
- Total bins: 5 severity levels × 5 confidence levels = 25 bins.
- Within each bin, only the count matters for scoring, not individual findings.
- This reduces O(n) computation to O(1) per bin.

### 7.4 Handling Duplicate Libraries

- Content-addressed deduplication (same contentHash → same artifact ID).
- Duplicate artifacts contribute once to the score.
- The discovery phase marks duplicates before any extraction occurs.
- A `duplicateCount` field records how many times the artifact appeared.

### 7.5 Vendored Dependencies

- Vendored dependencies are detected by directory structure (`vendor/`, `node_modules/`, `third_party/`).
- Vendored dependencies are analyzed but reported separately from the project's own code.
- They contribute to repository risk with a `vendorMultiplier` of 0.5 (their risk is halved).
- Vendored dependency findings are tagged with `context: "vendored"`.

### 7.6 Nested Archives

```
Archive risk propagation:
  Archive itself: risk = Σ(entry_risk × entry_confidence) / entry_count
  Each entry: contributes to archive risk
  Archive contributes to parent artifact risk
  But: archive risk does not add to its own entries' artifact risks (no feedback loop)
```

### 7.7 Repository-Level Aggregation Formula

```
repository_risk = saturate(
    (project_risk_density × 0.7)
  + (vendored_risk_density × 0.3)
  + (archive_risk_density × 0.5)    // Archives less concerning than project code
)

Where:
  project_risk_density = risk density of non-vendored, non-archive artifacts
  vendored_risk_density = risk density of vendored dependency artifacts
  archive_risk_density = risk density of archive entries
```

---

## 8. Explainability

### 8.1 Score Explanation Model

Every score generates a structured explanation:

```typescript
interface ScoreExplanation {
  type: 'risk' | 'trust' | 'confidence';
  overall: {
    value: number;
    level: string;
    summary: string; // One-line summary
  };
  breakdown: BreakdownEntry[]; // Per-dimension or per-factor breakdown
  topContributors: Contributor[]; // Top 5 contributors
  bottomContributors: Contributor[]; // Bottom 5 (for trust)
  methodology: string; // "How was this score computed?"
}
```

### 8.2 Human-Readable Risk Explanation

**Template-based generation:**

```
"Risk assessment for {artifact_name}:
  Overall risk: {level} ({score}/10)
  Based on {n} findings across {m} dimensions.

  Top risk drivers:
  1. {dimension_name}: {score}/10 — {n} findings, highest severity: {severity}
     Example: {finding_title} at {location}
  2. ...

  Risk is driven by {top_dimension} which accounts for {percentage}% of total risk.
  Confidence in this assessment: {confidence_level} ({confidence_score}).
  {n} findings had reduced confidence due to parser recovery."

"For {other_signals}:
  Trust assessment: {trust_level}
  {n} positive signals: {signals}
  {n} negative signals: {signals}
  Risk modifier: {modifier}× ({modifier_explanation})"
```

### 8.3 Score Traceability

Every point in every score traces to evidence:

```
risk_score = 6.3 (high)
  └─ dimension: execution (D100)
       └─ contribution: 2.1 (33% of total)
            ├─ finding: code-evaluation (confidence: 0.92)
            │    └─ evidence: Python eval() call at src/main.py:42
            │         └─ behavior: code-evaluation (T1120)
            │              └─ feature: function-call "eval" at src/main.py:42
            │                   └─ artifact: src/main.py
            └─ finding: process-creation (confidence: 0.85)
                 └─ evidence: subprocess.run() at src/utils.py:15
                      └─ ...
```

### 8.4 "Why Not Higher/Lower?"

Every explanation answers the counterfactual:

```
Why is risk not higher?
  - Top finding (code-evaluation) has high confidence (0.92) but only 1 instance.
  - No behavior chains detected (would amplify risk by up to 1.5×).
  - Parser recovery was clean (no confidence penalty).

Why is risk not lower?
  - High-severity finding (code-evaluation) with confidence > 0.9.
  - Multiple dimensions affected (execution + file-system + network).
```

---

## 9. Edge Cases

### 9.1 Empty Repository

- No artifacts → no findings → `risk = 0`, `trust = 0.5` (neutral), `confidence = 0`.
- Special message: "No artifacts found to analyze."

### 9.2 Binary-Only Repository

- No source code to analyze → limited Features.
- Binary extractors (PE, ELF) run on any matching files.
- Text fallback still provides entropy, string, and structure analysis.
- Risk may be lower due to fewer features, but trust is also lower (no source verification).
- Diagnostic note: "Limited analysis — no source code detected."

### 9.3 Obfuscated Scripts

- High parser recovery penalty reduces confidence.
- Entropy features may be present (high-entropy strings).
- Capabilities may still be extracted (obfuscated API calls still appear as imports).
- Confidence is explicitly lowered with explanation: "Parser recovery rate: X% — file appears obfuscated."

### 9.4 Mixed Languages

- Each language gets its own extractor.
- Features from all extractors are normalized to the same canonical types.
- Risk is aggregated across languages naturally (evidence density weighting).
- Dimension breakdown shows which languages contributed to which dimensions.

### 9.5 Broken Archives

- Attempt extraction with available decompressors.
- If all fail, produce extraction error diagnostic.
- Artifact is marked as `truncated: true`.
- Partial extraction results are used if available.

### 9.6 Partial Scans

- Cancelled scan → `ScanSession.status = "cancelled"`.
- Partial results are still valid for the artifacts that were fully processed.
- Risk report includes: "Scan was cancelled after processing N of M artifacts. Results are partial."
- Confidence is not reduced for completed artifacts.

### 9.7 Unsupported Formats

- File is classified as `unknown` type.
- `binary-extractor` or `text-extractor` fallback runs.
- Limited features extracted.
- Risk reflects only what could be extracted.
- Diagnostic: "File type could not be classified. Using generic extraction."

### 9.8 Extremely Large Projects

- Risk density model prevents inflation.
- Top-N reporting: only top 10 findings by risk contribution are detailed.
- Bin-based aggregation prevents O(n) performance issues.
- Memory limit for findings: 1,000,000. Beyond that, only bin counts are tracked.

### 9.9 Duplicate Artifacts

- Same contentHash → same artifactId → first occurrence contributes, rest are skipped.
- Skip reason: "Duplicate artifact (same content as {originalArtifactId})."
- `duplicateCount` tracked on the original artifact.

---

## 10. Diagnostics

### 10.1 Score Breakdown

```
Risk Score Breakdown:
┌─────────────────────┬──────────┬────────────┬──────────┬──────────┐
│ Dimension           │ Evidence │ Confidence │ Risk     │ Weight   │
├─────────────────────┼──────────┼────────────┼──────────┼──────────┤
│ Execution (D100)    │ 12       │ 0.85       │ 7.2      │ 0.35     │
│ Networking (D300)   │ 5        │ 0.72       │ 4.1      │ 0.15     │
│ File System (D600)  │ 8        │ 0.91       │ 3.8      │ 0.22     │
│ Secrets (D500)      │ 3        │ 0.95       │ 6.5      │ 0.18     │
│ Configuration (D1300)│ 2        │ 0.60       │ 1.2      │ 0.10     │
└─────────────────────┴──────────┴────────────┴──────────┴──────────┘
Overall Risk: 6.3 (high)
```

### 10.2 Weight Contribution

```
Weight Contribution Analysis:
  Total evidence: 30
  Top contributor: Execution (35% of total weight)
    - 12 evidence items
    - Severity multiplier: 1.8 (mean severity: 7.2)
    - Effective weight: 0.35 × 1.8 = 0.63

  Bottom contributor: Configuration (10% of total weight)
    - 2 evidence items
    - Severity multiplier: 1.2 (mean severity: 3.0)
    - Effective weight: 0.10 × 1.2 = 0.12
```

### 10.3 Risk Trace

```
Risk Trace for finding fin_abc123:
  Rule: secrets/aws-key v1.2.0
  Confidence: 0.92
    - Extraction confidence: 0.98 (clean parse, no recovery)
    - Match quality: 1.0 (exact regex match)
    - Feature confidence: 0.95 (clear string literal detection)
  Severity: 7.0 (high)
  Dimension: Secrets (D500)
    - Dimension weight: 0.18
    - Evidence count in dimension: 3
    - Dimension risk contribution: 0.92 × 7.0 = 6.44 (normalized: 0.64)
  Risk contribution to overall: 0.18 × 0.64 = 0.12 (out of 10.0)
```

### 10.4 Trust Trace

```
Trust Trace for artifact src/main.py:
  Overall trust: 0.7 (likely trusted)
  Normalized: 0.85

  Positive signals:
    - Source available: +0.5 (source code present)
    - Repository structure: +0.3 (standard Python project layout)
    - Configuration quality: +0.2 (pyproject.toml present)
    - File integrity: +0.3 (no corruption detected)

  Negative signals:
    - No digital signature: -0.3 (unsigned Python file)
    - Metadata consistency: -0.1 (no author metadata)

  Net trust: (+0.5 + 0.3 + 0.2 + 0.3) × 0.10 + (-0.3 + -0.1) × 0.05 = 0.07

  Risk modifier: 1.0 + (0.5 - 0.85) × 0.2 = 0.93 (risk reduced by 7%)
```

### 10.5 Confidence Trace

```
Confidence Trace for evidence ev_xyz789:
  Overall: 0.85 (high)

  Factor breakdown:
    Extraction confidence: 0.98 × (1.0 - 0.0) = 0.98    (clean parse)
    Feature confidence:    0.95                            (clear string literal)
    Behavior confidence:   0.96                            (clear taxonomy match)
    Rule confidence:       1.00                            (exact regex match)
    Completeness:          5 / 5 = 1.00                    (all expected behaviors found)

  Product: 0.98 × 0.95 × 0.96 × 1.00 × 1.00 = 0.89
    (Note: slightly lower than the minimum due to multiplication of values close to 1.0)

  Weak link: Feature confidence (0.95) — the most limiting factor
```

### 10.6 Dimension Analysis

```
Dimension Analysis:
  Most impacted: Execution (D100) — risk: 7.2/10
    Key behaviors: code-evaluation (3 instances), process-creation (2 instances)
    Top finding: eval() call at src/main.py:42 (confidence: 0.92)

  Least impacted: Configuration (D1300) — risk: 1.2/10
    Key behaviors: debug-enabled (1 instance), permissive-cors (1 instance)
    Top finding: Debug mode enabled at config.py:10 (confidence: 0.60)
```

### 10.7 Correlation Summary

```
Correlation Summary:
  Behavior chains detected: 2

  Chain 1: Download → Extract → Execute (sequential, 3 behaviors)
    - Length: 3
    - Chain multiplier: 1.10
    - Findings: 2 (http-download, archive-extraction, process-creation)
    - Chain risk: 4.5 (vs individual: 4.1) — 10% amplification

  Chain 2: Credential access → Exfiltration (sequential, 2 behaviors)
    ...
```

### 10.8 Saturation Detection

```
Saturation Detection:
  Maximum possible risk: 10.0
  Achieved risk: 6.3
  Saturation ratio: 0.63

  Dimension saturation:
    Execution: 0.72 (approaching saturation — high evidence density)
    Networking: 0.41 (moderate saturation)
    Secrets:    0.65 (approaching saturation)
```

---

## 11. Performance Strategy

### 11.1 Performance Targets

| Metric                  | Target                    |
| ----------------------- | ------------------------- |
| Score calculation       | ≤ 1ms per 10,000 findings |
| Explanation generation  | ≤ 10ms per finding        |
| Aggregate calculation   | ≤ 100ms for 1M findings   |
| Memory per 10K findings | ≤ 5 MB                    |

### 11.2 Optimization Techniques

| Technique                      | Applied To         | Expected Gain                        |
| ------------------------------ | ------------------ | ------------------------------------ |
| Bin-based aggregation          | Repository scoring | O(n) → O(25)                         |
| Pre-computed dimension mapping | Score calculation  | O(1) taxonomy → dimension            |
| Lazy explanation generation    | Explainability     | Only compute when requested          |
| Cached normalization factors   | Score calculation  | Pre-compute max_possible per session |
| Batch confidence calculation   | Confidence engine  | Process all evidence at once         |

### 11.3 Memory Budget

| Component          | Budget                             |
| ------------------ | ---------------------------------- |
| Dimension weights  | ~1 KB                              |
| Confidence factors | ~10 MB (for 10K evidence)          |
| Risk breakdown     | ~5 MB (for 10K findings)           |
| Explanation cache  | ~50 MB (for detailed explanations) |
| **Total**          | **~66 MB**                         |

---

## 12. Future Compatibility

### 12.1 AI Explanation Consumers

The structured score explanations (`ScoreExplanation`) are designed for AI consumption. An AI service can:

- Read the structured explanation
- Generate natural language summary from the structured data
- Never modify the scores themselves

### 12.2 Organization Policies

Organizations can apply policy modifiers:

```typescript
interface PolicyModifier {
  dimension: DimensionId;
  multiplier: number; // [0.0, 2.0] — Adjust dimension weight
  condition: string; // "regulatory-compliance"
  description: string; // "Financial services: increase credential access weight"
}
```

Policies adjust the presentation, not the base scores. The unmodified base risk is always available.

### 12.3 Compliance Scoring

Compliance frameworks (PCI-DSS, SOC2, HIPAA) are mapped to dimensions:

```typescript
interface ComplianceMapping {
  framework: string; // "PCI-DSS"
  requirement: string; // "Requirement 6.5"
  dimensionIds: DimensionId[]; // Dimensions affected
  threshold: number; // Maximum acceptable risk score
  description: string;
}
```

Compliance scores are computed by projecting the risk profile onto the compliance framework's dimensions.

### 12.4 SBOM Analysis

SBOM (Software Bill of Materials) analysis is a new dimension:

```
Dimension: Supply Chain (D1700)
  Input: SBOM data (packages, versions, licenses)
  Scoring: Version freshness, known vulnerabilities (via advisory feeds),
           license compatibility, dependency count
  This is purely additive — no existing dimension changes.
```

### 12.5 Reputation & Threat Intelligence (Optional)

External reputation and threat intelligence feeds are consumed as **optional trust dimension** inputs:

```typescript
interface ExternalReputationSignal {
  source: string; // "virustotal", "abuseipdb", etc.
  signal: string; // "malicious", "suspicious", "clean"
  confidence: number; // [0.0, 1.0]
  weight: number; // Configurable, default 0.05
}
```

These signals feed into the Trust Engine as additional dimensions. They are **off by default** and must be explicitly enabled and configured.

### 12.6 Historical Comparisons

- Reports are stored with their dimension breakdowns.
- Historical comparison is computed by diffing dimension scores.
- Trend analysis: "Execution risk increased 20% since last scan."

---

## 13. Engineering Tradeoffs

### 13.1 Risk Density vs. Risk Volume

**Tradeoff:** Density (risk per artifact) fairly represents the concentration of issues but can hide the overall magnitude of problems in a large repository. Volume (total risk) highlights magnitude but unfairly penalizes large projects.

**Decision:** Use risk density as the primary metric. Display volume as secondary information: "12 critical findings across 3,000 files (0.4% of files affected)."

### 13.2 Multiplicative vs. Additive Confidence

**Tradeoff:** Multiplicative confidence (product of factors) is strict — one low factor dominantly reduces confidence. Additive confidence (weighted sum) is more forgiving but can mask weak links.

**Decision:** Multiplicative confidence. This ensures that every link in the evidence chain must be strong for confidence to be high. A weak parser recovery in an otherwise perfect match reduces confidence appropriately.

### 13.3 Static vs. Evidence-Driven Weights

**Tradeoff:** Static weights (pre-assigned importance per dimension) are simple but may not reflect actual evidence distribution. Evidence-driven weights (importance proportional to evidence count) reflect reality but can be skewed by over-extraction.

**Decision:** Evidence-driven weights with severity multipliers. This prevents a dimension with many low-severity findings from dominating, while ensuring that dimensions with genuine evidence contribute proportionally.

### 13.4 Saturated vs. Linear Scaling

**Tradeoff:** Linear scaling (raw score / max) is simple but can exceed bounds in edge cases. Saturated scaling (tanh) is bounded but compresses high scores.

**Decision:** Saturated scaling with `tanh`. The compression at high values is acceptable because the difference between a score of 9.5 and 9.8 is rarely meaningful in practice. The bounded output ensures stability.

### 13.5 Per-Finding vs. Aggregate Explanation

**Tradeoff:** Per-finding explanations are detailed but verbose. Aggregate explanations are concise but lose detail.

**Decision:** Both. The default view shows aggregate with top N drivers. Detailed view shows per-finding breakdown. Explanation data is always computed but presentation varies by context.

---

## 14. Common Mistakes to Avoid

### 14.1 Adding Arbitrary Weights

**Mistake:** Assigning fixed importance weights to dimensions (e.g., "Execution is 30% of risk") without mathematical justification.
**Prevention:** Weights are evidence-driven. The importance of a dimension is proportional to the volume and severity of evidence in that dimension.

### 14.2 Double-Counting Evidence

**Mistake:** A finding contributes to a dimension, and its evidence also contributes independently to the same dimension.
**Prevention:** Evidence is the atomic unit. Findings aggregate evidence. Evidence never contributes more than once.

### 14.3 Confusing Confidence with Severity

**Mistake:** A high-severity rule producing a low-confidence match is presented as concerning as a high-confidence match.
**Prevention:** Risk = severity × confidence. A low-confidence finding contributes proportionally less risk regardless of its severity label.

### 14.4 Trust Eliminating Evidence

**Mistake:** A signed binary from a trusted publisher has its findings suppressed because it's "trusted."
**Prevention:** Trust never eliminates evidence. It only influences the presentation modifier (±10%). The base risk is always visible.

### 14.5 Ignoring Parser Quality

**Mistake:** All extractions are treated equally regardless of parser recovery, leading to confident scores from unreliable extraction.
**Prevention:** Parser recovery penalties directly reduce extraction confidence, which propagates to evidence and finding confidence.

### 14.6 Inflating Repository Scores

**Mistake:** Summing all artifact risks for a repository score, making every large repository appear high-risk.
**Prevention:** Risk density (mean artifact risk) prevents size inflation. Volume is reported as secondary information.

### 14.7 Non-Deterministic Floating Point

**Mistake:** Using floating-point accumulations that produce different results depending on evaluation order.
**Prevention:** Use deterministic accumulation (sorted order, fixed precision, no SIMD vectorization that changes accumulation order).

### 14.8 Overfitting to Known Samples

**Mistake:** Adjusting weights and formulas to produce "correct" scores for test samples, creating brittle scoring that doesn't generalize.
**Prevention:** The scoring model is derived from first principles, not tuned to samples. Test samples validate correctness but do not drive formula design.

### 14.9 Hiding the Methodology

**Mistake:** Presenting scores without explaining how they were computed.
**Prevention:** Every score carries a structured explanation answering: how, why, what contributed, what didn't, and why not higher/lower.

### 14.10 Over-Precision

**Mistake:** Reporting scores to many decimal places (e.g., 6.3472/10), implying precision that doesn't exist.
**Prevention:** Report to one decimal place (6.3/10). Confidence to two decimal places (0.85). Stability guarantee: same input produces the same output, not necessarily meaningful differences at the 0.01 level.

---

## 15. Final Recommendations

### 15.1 Implementation Order

| Phase          | Components                                                  | Rationale                                |
| -------------- | ----------------------------------------------------------- | ---------------------------------------- |
| **Phase 1**    | Mathematical primitives (saturation, normalization, bounds) | Foundation — everything depends on these |
| **Phase 2**    | Confidence engine (per-evidence, per-finding)               | Needed before risk can be meaningful     |
| **Phase 3**    | Risk engine (per-dimension, per-artifact, aggregate)        | Core scoring                             |
| **Phase 4**    | Trust engine (per-signal, per-artifact)                     | Independent scoring axis                 |
| **Phase 5**    | Dimension framework and mapping                             | Categorization                           |
| **Phase 6**    | Repository-level aggregation                                | Multi-artifact scoring                   |
| **Phase 7**    | Explainability system (structured explanations)             | Traceability                             |
| **Phase 8**    | Diagnostics system                                          | Debugging and validation                 |
| **Phase 9**    | Edge case handling                                          | Robustness                               |
| **Continuous** | Formula validation against corpus                           | Quality assurance                        |

### 15.2 Critical Success Factors

1. **Test determinism first.** Before testing correctness, test that identical inputs produce identical outputs. This is the most important property.
2. **Explain every formula.** Every coefficient and threshold must have a documented derivation. There are no magic numbers.
3. **Bin-based repository scoring.** For repositories with thousands of findings, bin-based aggregation is essential for performance.
4. **Confidence is multiplicative.** This is the single most important design decision. It ensures that the weakest link in the evidence chain determines overall confidence.
5. **Trust is independent.** Trust never eliminates evidence. This preserves the integrity of the risk assessment.
6. **Edge cases are not afterthoughts.** Empty repos, broken archives, obfuscated scripts, and partial scans are common in practice. Handle them explicitly.

### 15.3 Architectural Invariants

```
1. All scores are deterministic. Same input → same output, every time.
2. Confidence is multiplicative. Every factor is a necessary condition.
3. Risk = severity × confidence × evidence_weight. No magic numbers.
4. Trust never eliminates evidence. It only modifies presentation (±10%).
5. Evidence is the atomic unit of scoring. Evidence contributes exactly once.
6. Repository scoring uses risk density, not risk volume.
7. Every score has a structured explanation answering "why" and "why not."
8. Dimensions are additive. New dimensions require no formula changes.
9. Saturation uses tanh — bounded, smooth, deterministic.
10. No AI in scoring. AI consumes scores, never produces them.
```

---

_End of SPEC-005. This document describes the frozen risk engine, trust engine, and confidence model for VERIS V1 through V4._
