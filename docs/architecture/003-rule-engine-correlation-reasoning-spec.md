# VERIS Rule Engine, Correlation Engine & Reasoning Pipeline — SPEC-003

**Status:** Frozen  
**Version:** 1.0  
**Applies to:** Rule engine architecture, rule lifecycle, correlation engine, trust engine, risk engine, reasoning engine, rule packs, diagnostics, testing.  
**Scope:** V1 through V4 without architectural redesign.

---

## Table of Contents

1. [Engine Pipeline Overview](#1-engine-pipeline-overview)
2. [Design Philosophy](#2-design-philosophy)
3. [Rule Engine](#3-rule-engine)
   - 3.1 Rule Lifecycle
   - 3.2 Rule Execution Pipeline
   - 3.3 Rule Definition (Canonical)
   - 3.4 Rule Metadata & Categories
   - 3.5 Rule Dependencies & Priorities
   - 3.6 Rule Versioning & Compatibility
   - 3.7 Rule Configuration & Enable/Disable Strategy
   - 3.8 Rule Caching
   - 3.9 Rule Matchers
   - 3.10 Rule Evaluator (Safe Sandbox)
   - 3.11 Rule Scheduler
   - 3.12 Rule Execution Diagrams
4. [Correlation Engine](#4-correlation-engine)
   - 4.1 Purpose & Responsibilities
   - 4.2 Correlation Strategies
   - 4.3 Behavioral Sequence Detection
   - 4.4 Duplicate Elimination
   - 4.5 Evidence Grouping
   - 4.6 Provenance Preservation
   - 4.7 Risk Double-Counting Prevention
5. [Trust Engine](#5-trust-engine)
   - 5.1 Purpose & Responsibilities
   - 5.2 Trust Score Computation
   - 5.3 Scoring Factors & Weights
   - 5.4 Normalization Strategy
6. [Risk Engine](#6-risk-engine)
   - 6.1 Purpose & Responsibilities
   - 6.2 Risk Score Computation
   - 6.3 Severity × Likelihood × Impact Model
   - 6.4 Risk Drivers & Prioritization
7. [Reasoning Engine](#7-reasoning-engine)
   - 7.1 Purpose & Responsibilities
   - 7.2 Explanation Generation
   - 7.3 Evidence Summarization
   - 7.4 Recommendation Rationale
   - 7.5 Confidence Justification
   - 7.6 Traceability in Explanations
   - 7.7 AI Consumer Integration Points
8. [Rule Packs](#8-rule-packs)
   - 8.1 Pack Organization
   - 8.2 Pack Manifest
   - 8.3 Pack Dependencies
   - 8.4 Pack Isolation & Loading
9. [Rule Testing](#9-rule-testing)
   - 9.1 Unit Testing
   - 9.2 Golden Tests
   - 9.3 Regression Corpus
   - 9.4 Rule Fixtures
   - 9.5 Performance Benchmarks
   - 9.6 False-Positive Regression Tests
10. [Diagnostics](#10-diagnostics)
    - 10.1 Rule Execution Trace
    - 10.2 Rule Timing
    - 10.3 Cache Hit/Miss Tracking
    - 10.4 Skipped Rules & Dependency Failures
    - 10.5 Invalid Evidence Detection
    - 10.6 Explanation Generation Diagnostics
11. [Performance Strategy](#11-performance-strategy)
12. [Future Compatibility](#12-future-compatibility)
13. [Engineering Tradeoffs](#13-engineering-tradeoffs)
14. [Common Mistakes to Avoid](#14-common-mistakes-to-avoid)
15. [Final Recommendations](#15-final-recommendations)

---

## 1. Engine Pipeline Overview

The VERIS engine pipeline is frozen as:

```
                    ┌─────────────────────┐
                    │     Features         │  (from extractors)
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │     Behaviors        │  (normalized taxonomy)
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │     Evidence         │  (behavior + source context)
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │    ┌─ Rule Engine ─┐│
                    │    │  Scheduler    ││
                    │    │  Matchers     ││
                    │    │  Evaluator    ││
                    │    │  Result Coll. ││
                    │    └───────┬───────┘│
                    └────────────┼────────┘
                                 │ RuleResults
                    ┌────────────▼────────┐
                    │  ┌─ Correlation ──┐ │
                    │  │  Engine        │ │
                    │  │  • Sequence    │ │
                    │  │  • Dedup       │ │
                    │  │  • Group       │ │
                    │  └───────┬───────┘ │
                    └──────────┼─────────┘
                               │ BehaviorChains + Grouped Findings
                    ┌──────────▼─────────┐
                    │  ┌─ Trust Engine ─┐│
                    │  │  • Score calc  ││
                    │  │  • Factors     ││
                    │  │  • Normalize   ││
                    │  └───────┬───────┘│
                    └──────────┼─────────┘
                               │ TrustProfile
                    ┌──────────▼─────────┐
                    │  ┌─ Risk Engine ─┐ │
                    │  │  • Severity   │ │
                    │  │  • Likelihood │ │
                    │  │  • Impact     │ │
                    │  │  • Prioritize │ │
                    │  └───────┬───────┘ │
                    └──────────┼─────────┘
                               │ RiskProfile
                    ┌──────────▼──────────┐
                    │  ┌─ Reasoning ────┐ │
                    │  │  Engine        │ │
                    │  │  • Explanations│ │
                    │  │  • Summaries   │ │
                    │  │  • Rationale   │ │
                    │  └───────┬───────┘ │
                    └──────────┼─────────┘
                               │
                    ┌──────────▼──────────┐
                    │   Canonical Report   │
                    └─────────────────────┘
```

**Invariants:**

- No stage may be skipped.
- No stage may access data from more than one stage ahead.
- Rules never parse files. Rules consume Behaviors only.
- Every stage produces deterministic output given deterministic input.
- Stage boundaries are explicit typed interfaces.

---

## 2. Design Philosophy

### 2.1 Rules as Declarative Matchers

Rules are declarative descriptions of behavioral patterns. They are not programs. Complex logic belongs in the evaluator, not in individual rules. A rule should be readable as data: "match behavior X with properties matching pattern Y."

### 2.2 Evidence-First Findings

Every Finding is rooted in Evidence. No Finding may be produced without at least one Evidence binding a Rule to a Behavior. This is the non-negotiable foundation of explainability.

### 2.3 Composition over Inheritance

Rule matching uses composable matchers (single, multi-behavior, threshold, composite). New matching strategies are added as new matcher types, not by subclassing rules.

### 2.4 Pipeline as Data Flow

Each engine stage is a pure transformation: `(Input) => Output`. Stages have no side effects. All state is passed through explicitly. This enables caching, replay, parallelization, and distributed execution.

### 2.5 Confidence is Truth-Adjacent

Confidence scores reflect how closely the evidence matches the rule pattern, not statistical probability. A regex match on a hardcoded API key gets confidence 1.0. A heuristic match on obfuscated string construction may get 0.6. Confidence is deterministic and reproducible.

### 2.6 Separation of Concerns

| Concern              | Owner                                        |
| -------------------- | -------------------------------------------- |
| What to look for     | Rule packs (`@veris/rules`)                  |
| How to match         | Rule engine matchers (`@veris/rules-engine`) |
| When to run          | Rule scheduler (`@veris/rules-engine`)       |
| Safe expression eval | Evaluator sandbox (`@veris/rules-engine`)    |
| Finding construction | Finding builder (`@veris/analyzer`)          |
| Behavioral sequences | Correlation engine (`@veris/analyzer`)       |
| Trust scoring        | Trust engine (`@veris/analyzer`)             |
| Risk scoring         | Risk engine (`@veris/analyzer`)              |
| Explanations         | Reasoning engine (`@veris/analyzer`)         |

---

## 3. Rule Engine

### 3.1 Rule Lifecycle

```
                      ┌──────────────┐
                      │  Rule Author  │  (human or codegen)
                      └──────┬───────┘
                             │ writes
                      ┌──────▼───────┐
                      │ Rule Source    │  (TypeScript file in rule pack)
                      └──────┬───────┘
                             │ compiled
                      ┌──────▼───────┐
                      │ Rule Artifact  │  (serialized rule definition)
                      └──────┬───────┘
                             │ loaded at scan start
                      ┌──────▼───────┐
                      │ Rule Instance │  (loaded into RuleEngine)
                      └──────┬───────┘
                             │ validated
                      ┌──────▼───────┐
                      │ Validation    │  (schema, deps, taxonomy)
                      └──────┬───────┘
                             │ ready
                      ┌──────▼───────┐
                      │ Eligible?     │───No──→ [Skipped, logged]
                      └──────┬───────┘
                             │ Yes
                      ┌──────▼───────┐
                      │ Execute       │
                      │ (match)       │
                      └──────┬───────┘
                             │ produces
                      ┌──────▼───────┐
                      │ RuleResult(s) │
                      └──────────────┘
```

**Lifecycle states:**

1. **Authored** — Rule source written (human or codegen)
2. **Compiled** — Rule serialized into its definition format
3. **Loaded** — Rule loaded into engine from pack at scan start
4. **Validated** — Rule checked for schema conformance, dependency resolution, taxonomy validity
5. **Eligible** — Rule checked against scan configuration (enabled/disabled, severity filters, artifact type filters)
6. **Executed** — Rule matched against behaviors
7. **Completed** — RuleResult produced (matched or unmatched)

### 3.2 Rule Execution Pipeline

```
For each Artifact:
  For each Rule in the schedule:
    1. Eligibility Check
       - Is the rule enabled?
       - Does the artifact type match the rule's supported types?
       - Does the severity filter allow this rule?
       - Are all rule dependencies satisfied?

    2. Behavior Retrieval
       - Fetch Behaviors matching the rule's taxonomyIds
       - Apply pre-filter (time window, confidence threshold)

    3. Matching
       - Apply the rule's matchLogic against the Behaviors
       - For single-behavior: match each behavior individually
       - For multi-behavior: match sets of behaviors
       - For threshold: aggregate and compare
       - For composite: evaluate sub-rules

    4. Result Construction
       - Create RuleResult for each match
       - Record matchDetail, confidence, executionTimeMs

    5. Collection
       - All RuleResults collected by artifact
       - Pre-matched results cached for re-entrant rules
```

### 3.3 Rule Definition (Canonical)

This extends the Rule object defined in SPEC-002 §3.6 with full detail.

```typescript
interface RuleDefinition {
  // ── Identity ──
  id: RuleId; // "secrets/aws-key" — pack-scoped unique name
  packId: string; // "secrets"
  version: string; // semver, e.g., "1.2.0"
  name: string; // "AWS Access Key Detection"
  description: string; // "Detects hardcoded AWS access key IDs"

  // ── Inputs ──
  requiredBehaviors: TaxonomyId[]; // [T5100]
  requiredEvidence: string[]; // Additional evidence preconditions (optional)
  preconditions: Precondition[]; // Conditions that must be true before matching

  // ── Matching ──
  matchLogic: RuleLogic; // The matching logic (discriminated union)

  // ── Outputs ──
  severity: Severity; // Default severity
  confidence: number; // Base confidence [0.0, 1.0]
  risk: RiskContribution; // Contribution to risk score
  trust: TrustContribution; // Contribution to trust score

  // ── Explanations ──
  explanationTemplates: {
    short: string; // "Hardcoded AWS access key detected"
    detailed: string; // "Found pattern 'AKIA...' matching AWS access key format"
    technical: string; // "Regex /AKIA[0-9A-Z]{16}/ matched at location..."
  };

  // ── Remediation ──
  recommendations: RecommendationTemplate[];
  references: ExternalReference[];

  // ── Metadata ──
  metadata: RuleMetadata;
}
```

**Precondition (discriminated union):**

```typescript
type Precondition =
  | { kind: 'artifact-type'; types: ArtifactType[] }
  | { kind: 'confidence-min'; threshold: number }
  | { kind: 'behavior-count-min'; taxonomyId: TaxonomyId; min: number }
  | { kind: 'feature-exists'; featureType: FeatureType }
  | { kind: 'no-other-rule-matched'; ruleIds: RuleId[] };
```

**RuleLogic (discriminated union — declarative only):**

```typescript
type RuleLogic =
  | { kind: 'single-behavior'; behaviorTaxonomyId: TaxonomyId; propertyMatcher: PropertyMatcher }
  | {
      kind: 'multi-behavior';
      pattern: BehaviorPattern;
      relationship: 'all' | 'any' | 'sequence' | 'graph';
      window?: { timeMs: number; behaviorCount: number };
    }
  | {
      kind: 'threshold';
      metric: string;
      threshold: number;
      direction: 'gt' | 'gte' | 'lt' | 'lte';
      window: { timeMs: number };
    }
  | { kind: 'composite'; subRules: RuleLogic[]; operator: 'and' | 'or'; shortCircuit: boolean }
  | { kind: 'correlation'; sourceRuleIds: RuleId[]; relationship: ChainRelationshipType };
```

**PropertyMatcher (discriminated union):**

```typescript
type PropertyMatcher =
  | { kind: 'exact'; property: string; value: unknown }
  | { kind: 'regex'; property: string; pattern: string }
  | { kind: 'range'; property: string; min?: number; max?: number }
  | { kind: 'set'; property: string; contains: unknown[] }
  | { kind: 'exists'; property: string }
  | { kind: 'not-exists'; property: string }
  | { kind: 'composite'; matchers: PropertyMatcher[]; operator: 'and' | 'or' };
```

**RuleMetadata:**

```typescript
interface RuleMetadata {
  author: string;
  created: ISO8601;
  updated: ISO8601;
  tags: string[];
  category: RuleCategory;
  cweIds: string[];
  owaspCategory: string | null;
  nistControl: string | null;
  references: string[];
  remediation: string;
  falsePositiveRisk: 'low' | 'medium' | 'high';
  testCoverage: {
    positiveTests: number;
    negativeTests: number;
    falsePositiveTests: number;
  };
}
```

**RuleContribution:**

```typescript
interface RiskContribution {
  base: number; // Base risk contribution [0.0, 1.0]
  severityMultiplier: boolean; // Multiply by finding severity?
  behaviorFrequencyMultiplier: boolean; // Multiply by behavior count?
}

interface TrustContribution {
  impact: number; // [-1.0, 1.0] — negative decreases trust
  weight: number; // [0.0, 1.0] — importance in overall trust calc
}
```

### 3.4 Rule Metadata & Categories

**RuleCategory (open):**

```typescript
type RuleCategory =
  | 'credential-leakage'
  | 'injection'
  | 'crypto-misuse'
  | 'file-system-abuse'
  | 'network-threat'
  | 'persistence-mechanism'
  | 'privilege-escalation'
  | 'obfuscation'
  | 'anti-analysis'
  | 'data-exfiltration'
  | 'configuration-misuse'
  | 'trust-violation'
  | 'informational'
  | 'experimental';
```

### 3.5 Rule Dependencies & Priorities

**Dependency types:**

```typescript
interface RuleDependency {
  ruleId: RuleId; // The rule this depends on
  type:
    | 'requires-match' // Rule must have at least one match
    | 'requires-no-match' // Rule must have zero matches
    | 'requires-run-before'; // Rule must execute before this one
  optional: boolean; // If true, dependency is advisory
}
```

**Priority levels:**

| Priority     | Range   | Behavior                                                                                  |
| ------------ | ------- | ----------------------------------------------------------------------------------------- |
| `critical`   | 0–99    | Executed first. Rules that establish base facts (file type detection, entropy detection). |
| `high`       | 100–199 | Executed next. Rules that depend on base facts (secrets detection, crypto detection).     |
| `normal`     | 200–299 | Default. Most rules.                                                                      |
| `low`        | 300–399 | Executed later. Rules that aggregate or analyze.                                          |
| `diagnostic` | 400+    | Executed last. Diagnostic/informational-only rules.                                       |

Rules with the same priority may execute in parallel (within the same artifact context).

### 3.6 Rule Versioning & Compatibility

**Rule version format:** `MAJOR.MINOR.PATCH` (semver)

| Component | Change                                                                             |
| --------- | ---------------------------------------------------------------------------------- |
| **Major** | Breaking change to match behavior. Removing a matching pattern. Changing severity. |
| **Minor** | Adding new matching patterns. Adding new references. Adding new metadata.          |
| **Patch** | Fixing regex false positives. Updating descriptions. Updating remediation text.    |

**Compatibility rules:**

- Engine v2 can load rules written for v1 (backward compatible).
- Rules targeting engine v2 will not load on engine v1 (engine checks `engineVersion` constraint in pack manifest).
- Rule version is resolved at pack load time. Multiple versions of the same rule cannot coexist in a single scan session.

### 3.7 Rule Configuration & Enable/Disable Strategy

**Configuration sources (merged in order, later overrides earlier):**

1. Pack defaults (from manifest)
2. User config file (`.verisrc`)
3. CLI flags
4. Environment variables

```yaml
# .verisrc
rules:
  enabled: true # Globally enable/disable
  packs:
    secrets:
      enabled: true
      severityThreshold: medium # Skip rules below this severity
      rules:
        aws-key:
          enabled: false # Disable specific rule
          severity: critical # Override severity
          confidence: 0.9 # Override confidence threshold
    experimental:
      enabled: false # Disable entire pack
```

**Enable/disable rules:**

- Rules can be enabled/disabled at pack level or individual rule level.
- Disabled rules are not loaded, saving memory.
- Rules can be disabled by severity filter (e.g., only run `critical` and `high`).
- Rules can be disabled by category (e.g., skip all `experimental` rules).

### 3.8 Rule Caching

**Cache levels:**

| Cache                | Scope                   | Invalidated When         | Purpose                                                |
| -------------------- | ----------------------- | ------------------------ | ------------------------------------------------------ |
| Level 1 — Behavior   | Per-artifact            | Artifact changes         | Avoid re-fetching behaviors for shared rules           |
| Level 2 — RuleResult | Per-behavior + per-rule | Behavior or rule changes | Avoid re-matching when same rule runs on same behavior |
| Level 3 — Composite  | Per-session             | Rule pack changes        | Cache composite rule evaluation results                |

**Cache strategy:**

- Deterministic content hash of (behaviorId + rule definition version) is the cache key.
- Cache lives for the duration of the scan session only.
- No cross-session caching (to guarantee reproducibility).
- Cache size limit: 100,000 entries. Eviction: LRU.

### 3.9 Rule Matchers

**Matcher types:**

| Matcher          | Purpose                     | Performance Profile                  |
| ---------------- | --------------------------- | ------------------------------------ |
| `exact`          | Exact string/property match | O(1) — hash lookup                   |
| `regex`          | Regular expression match    | O(n) — depends on pattern complexity |
| `range`          | Numeric range check         | O(1) — comparison                    |
| `set`            | Set membership check        | O(1) — hash set lookup               |
| `exists`         | Property existence check    | O(1) — key lookup                    |
| `threshold`      | Aggregate threshold check   | O(n) — scan behaviors                |
| `multi-behavior` | Cross-behavior pattern      | O(n*m) — behavior set matching       |
| `composite`      | Boolean combination         | Depends on sub-matchers              |
| `correlation`    | Cross-rule correlation      | O(n*m) — finding set matching        |

**Matcher contract:**

```typescript
interface RuleMatcher {
  id: string;
  match(rule: RuleDefinition, behaviors: Behavior[], context: MatchContext): Promise<MatchResult[]>;
}
```

### 3.10 Rule Evaluator (Safe Sandbox)

**Purpose:** Execute safe expressions within rule matching without allowing arbitrary code execution.

**Capabilities:**

- Arithmetic: `+`, `-`, `*`, `/`, `%`
- Comparison: `==`, `!=`, `<`, `>`, `<=`, `>=`
- Logical: `&&`, `||`, `!`
- String: `startsWith`, `endsWith`, `contains`, `matches` (regex)
- Collection: `count`, `sum`, `avg`, `min`, `max`, `contains`
- Property access: `behavior.properties[key]`

**Restrictions (non-negotiable):**

- No variable assignment
- No function/class definitions
- No `eval`, `Function` constructor, `setTimeout`, `setInterval`
- No access to `process`, `global`, `require`, `import`
- No filesystem or network access
- No random number generation
- No Date/Time access
- Maximum expression depth: 20
- Maximum expression length: 10,000 characters
- Maximum execution time: 100ms per expression

### 3.11 Rule Scheduler

**Purpose:** Determine the optimal order of rule execution respecting dependencies and priorities.

**Scheduling algorithm:**

1. Topological sort by dependency graph (Kahn's algorithm).
2. Break ties by priority value.
3. Detect cycles → fail with `RuleDependencyCycleError`.
4. Detect unsatisfied dependencies → log warning, skip rule.
5. Execute rules in batches by parallelizable groups (same priority, no cross-dependencies).

**Parallel execution:**

- Rules at the same priority with no cross-dependencies execute in parallel.
- Parallelism is per-artifact, not global.
- Maximum concurrent rules per artifact: configurable (default 10).

### 3.12 Rule Execution Diagrams

**Single-behavior rule execution flow:**

```
Behavior arrives
       │
       ▼
Rule Eligibility Check
       │
       ▼
Fetch Behaviors by TaxonomyId
       │
       ▼
For each Behavior:
  │
  ├── Check Preconditions
  │   ├── Fail → skip
  │   └── Pass → continue
  │
  ├── Apply PropertyMatcher
  │   ├── No match → next behavior
  │   └── Match → continue
  │
  ├── Compute confidence
  │
  └── Create RuleResult
       │
       ▼
Collect RuleResults
```

**Multi-behavior rule (sequence detection):**

```
All Behaviors for Artifact
       │
       ▼
Filter behaviors by taxonomyIds[0]
       │
       ▼
For each candidate behavior at position 0:
  │
  ├── Look ahead for taxonomyIds[1] behaviors (within time window)
  │   ├── Found → continue
  │   └── Not found → next candidate
  │
  ├── Look ahead for taxonomyIds[2] behaviors (within time window)
  │   ├── Found → sequence matched
  │   └── Not found → next candidate
  │
  └── Create RuleResult with sequence match detail
```

**Composite rule execution:**

```
Rule with operator: "and"
  │
  ├── Execute subRule[0] → matched? → No → short-circuit, RuleResult.matched = false
  │                                    Yes → continue
  │
  ├── Execute subRule[1] → matched? → No → short-circuit, RuleResult.matched = false
  │                                    Yes → continue
  │
  └── ... → all matched → RuleResult.matched = true
```

---

## 4. Correlation Engine

### 4.1 Purpose & Responsibilities

The Correlation Engine transforms independent RuleResults into structured BehaviorChains. It answers the question: "Do these individual findings form a coherent multi-step pattern?"

**Responsibilities:**

- Merge related findings into grouped analyses
- Eliminate duplicate findings
- Detect behavioral sequences across artifacts
- Group evidence under coherent narratives
- Preserve full provenance of every merge/dedup decision
- Prevent double-counting risk contributions

### 4.2 Correlation Strategies

```typescript
type CorrelationStrategy =
  | 'identity-merge' // Same rule + same behavior → single finding
  | 'behavior-chain' // Sequential behaviors → BehaviorChain
  | 'causal-chain' // Causally linked behaviors → BehaviorChain
  | 'co-occurrence' // Co-occurring behaviors → grouped finding
  | 'artifact-group' // Findings across related artifacts → grouped
  | 'temporal-cluster'; // Findings within time window → grouped
```

### 4.3 Behavioral Sequence Detection

**Algorithm:**

1. Collect all RuleResults where `matched === true`, grouped by artifact.
2. For each artifact, sort RuleResults by behavior temporal order (extraction order).
3. Scan for known behavioral sequences defined in rule packs.
4. Sequence knowledge is encoded as correlation rules (RuleLogic.kind: "correlation").

**Example — Download → Extract → Execute → Persist → Cleanup:**

```typescript
// Correlation rule (defined in a rule pack)
{
  id: "malware/download-extract-execute-chain",
  matchLogic: {
    kind: "correlation",
    sourceRuleIds: [
      "network/http-download",      // T3100 — HTTP download
      "archive/archive-extraction", // T9100 — Archive extraction
      "process/process-creation",   // T8100 — Process creation
      "persistence/service-install",// T2300 — Service installation
      "file-system/file-delete"     // T6120 — File deletion (cleanup)
    ],
    relationship: "sequential"
  }
}
```

### 4.4 Duplicate Elimination

**Dedup strategy:**

| Scenario                                     | Strategy                                               |
| -------------------------------------------- | ------------------------------------------------------ |
| Same Rule, same Behavior, same location      | Single Evidence, single Finding                        |
| Same Rule, same Behavior, different location | Single Finding, multiple Evidence                      |
| Same Rule, different Behaviors, same pattern | Single Finding, multiple Evidence                      |
| Different Rules, same Behavior               | Separate Findings (different analytical conclusions)   |
| Same Finding produced by different paths     | Deterministic ID dedup (keep first, discard duplicate) |

**Dedup is deterministic:** Given the same inputs, the same duplicates are always eliminated.

### 4.5 Evidence Grouping

Evidence is grouped under Findings using the following rules:

1. All Evidence referencing the same `ruleId` and `findingId` are grouped under that Finding.
2. Evidence from different behaviors but the same rule belongs to the same Finding (with multiple Evidence entries).
3. Evidence from correlation rules is grouped under the BehaviorChain, not individual Findings.

### 4.6 Provenance Preservation

Every merge, dedup, or grouping decision is recorded in the Finding's `metadata.provenance`:

```typescript
interface ProvenanceEntry {
  action: 'merged' | 'deduped' | 'grouped' | 'promoted' | 'suppressed';
  sourceIds: string[]; // Original IDs before the action
  targetId: string; // Resulting ID after the action
  reason: string; // Why this action was taken
  correlationRuleId: string | null; // Correlation rule that triggered this
  timestamp: ISO8601;
}
```

### 4.7 Risk Double-Counting Prevention

**Rules:**

1. If a Finding is a member of a BehaviorChain, its risk contribution is attributed to the chain, not counted individually.
2. If multiple Findings reference the same Evidence, the risk contribution of that Evidence is counted only once.
3. Correlation rules do not generate additional risk — they reorganize existing Findings. The risk of a chain is the aggregate of its members, not additive.
4. Deduped Findings contribute zero additional risk (their risk was already counted).

---

## 5. Trust Engine

### 5.1 Purpose & Responsibilities

The Trust Engine produces a TrustProfile per artifact, answering: "How trustworthy is this artifact based on what we found?"

**Responsibilities:**

- Compute a normalized trust score [0.0, 1.0]
- Break down trust by severity, taxonomy category, and chain impact
- Provide contributing factors with human-readable explanations
- Support comparison across artifacts and scan sessions

### 5.2 Trust Score Computation

```
trustScore = clamp(1.0 - normalizedRisk, 0.0, 1.0)

Where:
  normalizedRisk = Σ(weight_i × impact_i) / Σ(weight_i)

Factors:
  Factor                    Weight    Impact Range
  ────────────────────────────────────────────────
  critical findings        0.30      [0.0, 1.0]
  high findings            0.20      [0.0, 0.8]
  medium findings          0.15      [0.0, 0.5]
  low findings             0.10      [0.0, 0.3]
  info findings            0.05      [0.0, 0.1]
  behavior chains          0.15      [0.0, 1.0]
  finding density          0.05      [0.0, 0.5]
```

### 5.3 Scoring Factors

```typescript
interface TrustFactor {
  name: string; // e.g., "high-severity-findings"
  category: string; // e.g., "severity"
  impact: number; // [-1.0, 1.0]
  weight: number; // [0.0, 1.0]
  explanation: string; // "3 high severity findings detected"
  findingIds: FindingId[]; // Contributing findings
}
```

### 5.4 Normalization Strategy

- Trust scores are normalized to [0.0, 1.0].
- 0.0 = definitely malicious, 1.0 = definitely trusted.
- Trust is relative to the corpus, not absolute.
- A file with zero findings gets trustScore = 1.0 (trusted by default).
- Trust thresholds: `0.0–0.3 = malicious`, `0.3–0.6 = suspicious`, `0.6–0.9 = likely safe`, `0.9–1.0 = trusted`.

---

## 6. Risk Engine

### 6.1 Purpose & Responsibilities

The Risk Engine builds on the TrustProfile to produce a RiskProfile that answers: "What is the business impact of these findings, and what should be fixed first?"

**Responsibilities:**

- Translate technical findings into business risk context
- Prioritize findings by severity × likelihood × impact
- Provide actionable risk scores
- Generate ordered recommendation priorities

### 6.2 Risk Score Computation

```
riskScore = Σ(finding.severity.score × finding.confidence × exploitability)

Where:
  severity.score = 0.0–10.0 (from Rule)
  confidence = 0.0–1.0 (from matching)
  exploitability = 0.0–1.0 (from knowledge base / rule metadata)

Normalized: riskScore = clamp(riskScore / maxPossibleRisk, 0.0, 10.0)
```

### 6.3 Severity × Likelihood × Impact Model

```typescript
interface RiskCalculation {
  findingId: FindingId;
  severity: number; // Rule severity score [0.0, 10.0]
  confidence: number; // Match confidence [0.0, 1.0]
  exploitability: number; // How easily exploitable [0.0, 1.0]
  businessImpact: number; // Business impact modifier [0.5, 2.0]
  // (default 1.0, configurable per scan)
  riskContribution: number; // severity × confidence × exploitability × businessImpact
  normalizedContribution: number; // Normalized to [0.0, 1.0] across all findings
}
```

### 6.4 Risk Drivers & Prioritization

**Top-N prioritization:**

1. Sort findings by `riskContribution` descending.
2. Take top 10 as `topFindings`.
3. For each top finding, record why it's a driver.
4. Recommendations are ordered by the aggregated risk of their associated findings.

**Risk levels:**

| Score Range | Level      | Label                        | Action                       |
| ----------- | ---------- | ---------------------------- | ---------------------------- |
| 8.0–10.0    | Critical   | Immediate attention required | Fix before deployment        |
| 6.0–7.9     | High       | Significant risk             | Fix in current sprint        |
| 4.0–5.9     | Medium     | Moderate risk                | Schedule for next sprint     |
| 2.0–3.9     | Low        | Minor risk                   | Monitor, fix when convenient |
| 0.0–1.9     | Negligible | Informational                | No action required           |

---

## 7. Reasoning Engine

### 7.1 Purpose & Responsibilities

The Reasoning Engine transforms analysis data into human-readable, traceable explanations. Every sentence must be grounded in deterministic evidence.

**Responsibilities:**

- Generate human-readable finding descriptions
- Generate technical explanations with code references
- Summarize evidence into coherent narratives
- Explain recommendation rationale
- Justify confidence scores
- Provide full traceability from explanation back to evidence

### 7.2 Explanation Generation

**Explanation templates (from Rule definition):**

```typescript
interface Explanation {
  short: string; // One-line summary
  detailed: string; // Paragraph explanation
  technical: string; // Technical description with code references
  traceability: {
    // Trace back to evidence
    ruleId: RuleId;
    evidenceIds: EvidenceId[];
    behaviorIds: BehaviorId[];
    featureIds: FeatureId[];
    artifactIds: ArtifactId[];
    sourceLocations: SourceLocation[];
  };
}
```

**Template rendering:**

- Templates use `{variable}` substitution with values from matched properties.
- Example template: `"Found pattern '{matched.value}' matching {rule.name} at {location.line}:{location.column}"`
- Variables are type-checked at rule compile time.

### 7.3 Evidence Summarization

For findings with multiple Evidence entries, the Reasoning Engine generates:

```typescript
interface EvidenceSummary {
  totalMatches: number; // Total matching instances
  locations: SourceLocation[]; // All matched locations
  uniquePatterns: number; // Distinct patterns matched
  mostSevereLocation: SourceLocation; // Location with highest confidence match
  summary: string; // "Found 5 instances of hardcoded AWS keys across 3 files"
}
```

### 7.4 Recommendation Rationale

Each Recommendation includes:

```typescript
interface RecommendationRationale {
  why: string; // "This finding exposes AWS credentials..."
  impact: string; // "If exploited, an attacker could access..."
  effort: 'minutes' | 'hours' | 'days';
  steps: string[]; // ["Rotate the key", "Remove from source code", "..."]
  references: ExternalReference[];
  codeExamples: CodeExample[]; // Before/after
}
```

### 7.5 Confidence Justification

```typescript
interface ConfidenceJustification {
  overall: number; // [0.0, 1.0]
  factors: {
    name: string; // "regex-match-quality"
    contribution: number; // [0.0, 1.0]
    explanation: string; // "Pattern matched with high specificity regex"
  }[];
  caveats: string[]; // ["Pattern may match test credentials"]
}
```

### 7.6 Traceability in Explanations

Every explanation block carries traceability metadata:

```typescript
interface ExplanationTrace {
  chain: {
    findingId: FindingId;
    ruleId: RuleId;
    evidenceId: EvidenceId;
    behaviorId: BehaviorId;
    featureId: FeatureId;
    artifactId: ArtifactId;
    sessionId: SessionId;
  };
  confidence: number;
  timestamp: ISO8601;
}
```

### 7.7 AI Consumer Integration Points

The Reasoning Engine produces structured data that AI consumers (in `@veris/ai`) can consume. AI never modifies the canonical objects — it consumes the output of the Reasoning Engine.

**Integration points:**

```typescript
// What the Reasoning Engine produces for AI consumers:
interface AIReadyContext {
  session: {
    id: SessionId;
    summary: string;
    findingsCount: number;
  };
  findings: {
    id: FindingId;
    title: string;
    description: string;
    severity: Severity;
    explanation: Explanation;
    evidenceSummary: EvidenceSummary;
  }[];
  chains: BehaviorChain[];
  trustProfile: TrustProfile;
  riskProfile: RiskProfile;
  recommendations: Recommendation[];
}

// AI consumers (in @veris/ai) take AIReadyContext and produce:
interface AIExplanation {
  naturalLanguageSummary: string; // AI-generated summary
  recommendations: string[]; // AI-enhanced recommendations
  contextNotes: string[]; // AI context analysis
  disclaimer: string; // "This analysis is AI-assisted..."
}
```

**Invariant:** AI explanations are appended to the report as optional metadata, never injected into canonical Finding or Evidence objects.

---

## 8. Rule Packs

### 8.1 Pack Organization

```
packages/rules/src/packs/
├── core/                               # Always-on foundational rules
│   ├── rules/
│   │   ├── file-type-detection.ts
│   │   ├── entropy-detection.ts
│   │   └── platform-detection.ts
│   ├── index.ts
│   └── manifest.json
│
├── scripts/                            # Script-specific rules
│   ├── rules/
│   │   ├── eval-usage.ts
│   │   ├── shell-execution.ts
│   │   ├── base64-decode.ts
│   │   └── obfuscated-string.ts
│   ├── index.ts
│   └── manifest.json
│
├── executables/                        # Executable/binary rules
│   ├── rules/
│   │   ├── weak-crypto.ts
│   │   ├── packing-detection.ts
│   │   ├── anti-debug.ts
│   │   └── suspicious-imports.ts
│   ├── index.ts
│   └── manifest.json
│
├── repositories/                       # Repository-level rules
│   ├── rules/
│   │   ├── exposed-secrets.ts
│   │   ├── misconfigured-ci.ts
│   │   ├── outdated-dependencies.ts
│   │   └── large-binary-blobs.ts
│   ├── index.ts
│   └── manifest.json
│
├── archives/                           # Archive-specific rules
│   ├── rules/
│   │   ├── zip-bomb-detection.ts
│   │   ├── path-traversal-archive.ts
│   │   ├── encrypted-archive.ts
│   │   └── nested-archive-depth.ts
│   ├── index.ts
│   └── manifest.json
│
├── secrets/                            # Secret detection
│   ├── rules/
│   │   ├── aws-key.ts
│   │   ├── github-token.ts
│   │   ├── generic-api-key.ts
│   │   ├── private-key.ts
│   │   ├── slack-token.ts
│   │   ├── connection-string.ts
│   │   └── jwt-token.ts
│   ├── index.ts
│   └── manifest.json
│
├── configuration/                      # Configuration misconfiguration
│   ├── rules/
│   │   ├── debug-enabled.ts
│   │   ├── permissive-cors.ts
│   │   ├── world-writable.ts
│   │   ├── unencrypted-communication.ts
│   │   └── default-credentials.ts
│   ├── index.ts
│   └── manifest.json
│
├── experimental/                       # Experimental/community rules
│   ├── rules/
│   ├── index.ts
│   └── manifest.json
│
├── enterprise/                         # Enterprise-only (future)
│   ├── rules/
│   ├── index.ts
│   └── manifest.json
│
└── marketplace/                        # Marketplace plugins (future)
    ├── index.ts
    └── manifest.json
```

### 8.2 Pack Manifest

```typescript
interface PackManifest {
  id: string; // "secrets"
  version: string; // Pack version (semver)
  name: string; // "Secret Detection Pack"
  description: string;
  author: string;
  license: string;
  minEngineVersion: string; // Minimum engine version required
  maxEngineVersion: string | null; // Maximum engine version (null = no max)
  dependencies: PackDependency[];
  category: PackCategory;
  metadata: {
    tags: string[];
    severityRange: { min: number; max: number };
    ruleCount: number;
    totalFalsePositiveRate: 'low' | 'medium' | 'high';
    requiresNetwork: boolean; // Does this pack require network?
    requiresPlugin: string[]; // Required plugin IDs
  };
}

interface PackDependency {
  packId: string;
  version: string; // "^1.0.0"
  optional: boolean;
  description: string; // "Adds additional context for secret detection"
}
```

### 8.3 Pack Dependencies

- `secrets` may depend on `core` (for file-type detection).
- `scripts` may depend on `core`.
- `experimental` has no dependencies beyond `core`.
- `enterprise` may depend on `secrets` + `configuration`.
- Dependency cycles between packs are forbidden (enforced at load time).

### 8.4 Pack Isolation & Loading

1. Packs are loaded from `@veris/rules` at scan start.
2. Dependency graph is resolved: `core → scripts → executables → ...`
3. Each pack is validated independently:
   - Manifest schema validation
   - All rule IDs unique within pack
   - All taxonomy IDs valid
   - All dependency pack IDs resolvable
4. Failed packs are logged and skipped (scan continues with remaining packs).

---

## 9. Rule Testing

### 9.1 Unit Testing

```typescript
// Testing convention (using Vitest)
import { describe, it, expect } from 'vitest';
import { awsKeyRule } from '../packs/secrets/rules/aws-key';

describe('aws-key rule', () => {
  it('matches valid AWS access key format', () => {
    const behavior = createTestBehavior({
      taxonomyId: 'T5100',
      properties: { value: 'AKIAIOSFODNN7EXAMPLE' },
    });
    const result = awsKeyRule.match(behavior);
    expect(result.matched).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it('does not match non-AWS key patterns', () => {
    const behavior = createTestBehavior({
      taxonomyId: 'T5100',
      properties: { value: 'sk_live_1234567890abcdef' },
    });
    const result = awsKeyRule.match(behavior);
    expect(result.matched).toBe(false);
  });
});
```

### 9.2 Golden Tests

Golden tests capture full rule outputs against known inputs:

```
packages/rules/__tests__/golden/
├── secrets/
│   ├── aws-key.golden.json          # Expected RuleResult for aws-key
│   ├── github-token.golden.json
│   └── ...
└── injection/
    ├── sql-injection.golden.json
    └── command-injection.golden.json
```

- Golden files are committed to the repository.
- CI runs `pnpm test:golden` to catch unexpected changes.
- Golden updates are intentional (documented in PR).

### 9.3 Regression Corpus

```
fixtures/
├── rules/
│   ├── secrets/
│   │   ├── known-true-positives/    # Files known to contain secrets
│   │   │   ├── aws-credentials.env
│   │   │   ├── github-token.json
│   │   │   └── ...
│   │   └── known-true-negatives/    # Files known NOT to contain secrets
│   │       ├── safe-config.json
│   │       └── ...
│   └── injection/
│       └── ...
```

### 9.4 Rule Fixtures

```
packages/rules/__tests__/fixtures/
├── behaviors/
│   ├── test-behavior-factory.ts     # createTestBehavior()
│   ├── create-aws-key-behavior.ts   # Pre-built test behaviors
│   └── create-eval-behavior.ts
├── contexts/
│   ├── test-context-factory.ts      # createTestMatchContext()
│   └── ...
└── artifacts/
    ├── test-artifact-factory.ts
    └── ...
```

### 9.5 Performance Benchmarks

```
packages/rules-engine/benchmark/
├── matchers/
│   ├── regex-matcher.bench.ts       # Benchmark regex matching throughput
│   ├── exact-matcher.bench.ts
│   └── composite-matcher.bench.ts
├── scheduler/
│   └── dependency-resolution.bench.ts
└── full-pipeline/
    └── 1000-rules.bench.ts          # Benchmark 1000 rules against 10k behaviors
```

**Benchmark metrics:**

- Rules per second (throughput)
- P50/P95/P99 rule execution time
- Memory allocation per rule match
- Cache hit ratio

### 9.6 False-Positive Regression Tests

```typescript
// false-positive-regression.test.ts
// When users report false positives, a test is added here
describe('false positive regression suite', () => {
  it('does not flag example.com in comments (FP-2024-001)', () => {
    // FP-2024-001: URL in comment was flagged as API endpoint
  });
  it("does not flag 'password' as password in variable name (FP-2024-002)", () => {
    // FP-2024-002: variable `overridePassword` was flagged
  });
});
```

---

## 10. Diagnostics

### 10.1 Rule Execution Trace

The engine can produce a detailed trace for debugging:

```typescript
interface RuleTrace {
  ruleId: RuleId;
  artifactId: ArtifactId;
  startTime: ISO8601;
  endTime: ISO8601;
  durationMs: number;
  status: 'matched' | 'not-matched' | 'skipped' | 'error' | 'cached';
  skipReason?: string;
  behaviorsChecked: number;
  behaviorsMatched: number;
  preconditions: {
    precondition: string;
    passed: boolean;
    detail: string;
  }[];
  matchDetail?: MatchDetail;
  cacheHit: boolean;
  error?: {
    message: string;
    stack?: string;
  };
}
```

### 10.2 Rule Timing

```
Rule Timing Report (aggregate):
┌────────────────────────┬──────────┬──────────┬──────────┬──────────┐
│ Rule                   │ Count    │ P50(ms)  │ P95(ms)  │ P99(ms)  │
├────────────────────────┼──────────┼──────────┼──────────┼──────────┤
│ secrets/aws-key        │ 1,234    │ 0.12     │ 0.45     │ 1.23     │
│ scripts/eval-usage     │ 567      │ 0.89     │ 3.45     │ 12.34    │
│ injection/sql-injection│ 89       │ 45.67    │ 123.45   │ 345.67   │
└────────────────────────┴──────────┴──────────┴──────────┴──────────┘

Slowest rules:
1. injection/sql-injection    avg: 45.67ms
2. executables/packing-detect avg: 23.45ms
3. scripts/obfuscated-string  avg: 12.34ms
```

**Triggering:** Traces and timing are produced when `--diagnostics` flag is passed to CLI or `diagnostics: true` is set in config.

### 10.3 Cache Hit/Miss Tracking

```
Cache Report:
  Level 1 (Behavior cache):   hits: 8,432   misses: 1,234   ratio: 87.2%
  Level 2 (RuleResult cache): hits: 3,211   misses: 4,567   ratio: 41.3%
  Level 3 (Composite cache):  hits: 234     misses: 89      ratio: 72.4%
```

### 10.4 Skipped Rules & Dependency Failures

```
Skipped Rules:
  - secrets/jwt-token          skipped: dependency unmet (core/entropy-detection not loaded)
  - injection/command-injection skipped: artifact type not supported (type: "executable")
  - experimental/ai-prompt     skipped: pack "experimental" disabled

Dependency Failures:
  - core/dependency-cycle      error: circular dependency detected (A→B→C→A)
```

### 10.5 Invalid Evidence Detection

```
Invalid Evidence:
  - Finding fin_abc123 contains ev_xyz789 which references
    behavior beh_def456 that does not exist in this session.
    → Evidence excluded from Finding.
  - Finding fin_def456 has zero valid evidence after filtering.
    → Finding marked as invalid (not included in report).
```

### 10.6 Explanation Generation Diagnostics

```
Explanation Diagnostics:
  - secrets/aws-key: template rendered successfully (3/3 variables resolved)
  - scripts/eval-usage: template warning: variable {matched.functionName} not found
    → Fallback description used
```

---

## 11. Performance Strategy

### 11.1 Performance Targets

| Metric                   | Target                          | Measurement       |
| ------------------------ | ------------------------------- | ----------------- |
| Rule throughput          | ≥ 50,000 rules/sec per artifact | Benchmark         |
| P95 rule execution       | ≤ 10ms per rule                 | Benchmark         |
| P99 rule execution       | ≤ 100ms per rule                | Benchmark         |
| Cache hit ratio (L1)     | ≥ 80%                           | Runtime telemetry |
| Memory per 10k behaviors | ≤ 50 MB                         | Benchmark         |
| Pipeline overhead        | ≤ 5% of total execution         | Profiling         |

### 11.2 Optimization Techniques

| Technique                                   | Applied To         | Expected Gain                      |
| ------------------------------------------- | ------------------ | ---------------------------------- |
| Behavior pre-filtering by taxonomyId        | All rules          | 10x–100x fewer behaviors to check  |
| Regex compilation cache                     | Regex matchers     | ~10x speedup for repeated patterns |
| Rule dependency topological sort            | Scheduler          | Eliminates redundant matching      |
| Parallel artifact processing                | Pipeline           | Nx speedup for N artifacts         |
| Early termination (composite short-circuit) | Composite matchers | 2x–5x for `and` composites         |
| Pre-computed behavior index                 | All rules          | O(1) taxonomyId lookup             |

### 11.3 Memory Budget

| Component                      | Budget      |
| ------------------------------ | ----------- |
| Loaded rules (10,000)          | ~50 MB      |
| Behaviors (100,000)            | ~100 MB     |
| RuleResults (500,000)          | ~200 MB     |
| Cache (L1 + L2 + L3)           | ~100 MB     |
| Correlation engine working set | ~50 MB      |
| **Total per scan session**     | **~500 MB** |

---

## 12. Future Compatibility

### 12.1 Plugin-Based Rules (V2+)

- External rules are loaded via the plugin system (`@veris/plugins`).
- Plugin rules implement the same `RuleDefinition` contract.
- Plugin rules are sandboxed (no filesystem/network access).
- Plugin rules declare `minEngineVersion` and are validated at load time.

### 12.2 Marketplace (V3+)

- Rules are distributed as `.vrpack` files (signed + versioned).
- Marketplace packs include manifest, rules, and test fixtures.
- The engine validates pack signatures before loading.

### 12.3 AI Explanation Consumers

- AI consumers read `AIReadyContext` (produced by Reasoning Engine).
- AI never modifies the analysis pipeline.
- New AI providers are added to `@veris/ai` without engine changes.
- AI explanations are stored separately from canonical findings.

### 12.4 Custom Rule Packs

- Custom packs follow the same manifest contract.
- Stored in user-configurable directories (e.g., `~/.veris/rules/custom/`).
- Loaded via the plugin system or directly through config.
- Pack ID must be unique (no conflict with built-in packs).

### 12.5 Organization-Specific Rules

- Organizations can create private rule packs.
- Private packs follow the same contract as built-in packs.
- Private packs can disable built-in rules.
- Private packs can override severities.

### 12.6 Distributed Analysis

The engine pipeline is designed for distributed execution:

1. Artifact extraction is parallelizable (map over artifacts).
2. Rule matching is per-artifact (embarrassingly parallel).
3. Correlation engine requires cross-artifact state → single node.
4. Trust/Risk/Reasoning engines are per-session → single node.

**Distribution boundary:** After extraction and per-artifact rule matching, results are merged at the correlation engine.

### 12.7 Incremental Scans

- Deterministic IDs enable diffing.
- The scheduler skips artifacts whose content hashes haven't changed.
- Rules whose dependencies haven't changed are cached.
- Only changed artifacts and dependent rules are re-executed.

---

## 13. Engineering Tradeoffs

### 13.1 Declarative Rules vs. Programmable Rules

**Tradeoff:** Declarative rules (data-driven, limited expression) are safer, more testable, and more portable but less powerful than programmable rules (full scripting language).

**Decision:** Declarative rules with a safe sandbox evaluator. If a rule needs complex logic, it belongs in the evaluator (a shared component), not in individual rules. This ensures all rules benefit from improved matching capabilities.

### 13.2 Per-Artifact Parallelism vs. Global State

**Tradeoff:** Per-artifact parallelism is simple and scalable but prevents cross-artifact analysis at rule matching time.

**Decision:** Rule matching is per-artifact parallel. Cross-artifact analysis is deferred to the Correlation Engine, which has access to all artifacts. This keeps the Rule Engine simple and scalable.

### 13.3 Caching Complexity vs. Performance

**Tradeoff:** Multi-level caching adds complexity, cache invalidation logic, and memory pressure but significantly improves performance for repeated rule applications.

**Decision:** Implement three-level caching with deterministic content-hash keys. Cache is per-session only (no cross-session persistence). This guarantees reproducibility while providing performance benefits within a session.

### 13.4 Strict Dependency Resolution vs. Best-Effort

**Tradeoff:** Strict dependency resolution guarantees correct execution ordering but may fail entirely if a dependency is missing. Best-effort execution maximizes results but may miss relevant findings.

**Decision:** Strict dependency resolution for required dependencies. Best-effort for optional dependencies. Missing required dependency → rule is skipped with a diagnostic message.

### 13.5 Explanation Template Simplicity vs. Richness

**Tradeoff:** Simple templates (string interpolation) are easy to maintain but produce less natural explanations. Rich templates (NLG, AI) produce better text but add nondeterminism and latency.

**Decision:** Simple templates for deterministic explanations. AI-generated explanations are layered on top as an optional enhancement, never replacing the deterministic explanation.

---

## 14. Common Mistakes to Avoid

### 14.1 Rules That Parse Files

**Mistake:** Writing rules that directly inspect file content, bypassing the Feature/Behavior pipeline.
**Prevention:** Rules must never reference raw file content. All input comes through Behaviors. If a rule needs information not in the Behavior's properties, add it to the Feature extraction phase.

### 14.2 Overly Complex Match Logic

**Mistake:** Single rules with dozens of sub-matchers, deeply nested composites, and complex preconditions.
**Prevention:** A rule should match one pattern. Complex patterns belong in the Correlation Engine. If a rule has more than 5 sub-matchers, split it into multiple rules with a correlation rule chaining them.

### 14.3 Non-Deterministic Rules

**Mistake:** Rules using random numbers, time-based conditions, or external data sources.
**Prevention:** All matchers and evaluators must be pure functions. Random, time, and network access are forbidden in the rule engine.

### 14.4 Over-Caching

**Mistake:** Caching aggressively across sessions, leading to stale results that don't match the current input.
**Prevention:** Cache is per-session only. Content-hash keys ensure correctness. Cross-session caching is never implemented.

### 14.5 Confusing Correlation with Rule Matching

**Mistake:** Using rules to detect behavioral sequences that should be handled by the Correlation Engine.
**Prevention:** Rules detect atomic behavioral patterns. The Correlation Engine detects sequences. A correlation rule references source rule IDs, not behavior taxonomy IDs.

### 14.6 Risk Double-Counting

**Mistake:** Summing risk scores of individual findings and their containing behavior chains independently, overstating the actual risk.
**Prevention:** A finding's risk is counted once. If it belongs to a chain, the chain's risk incorporates but does not duplicate the finding's risk.

### 14.7 Ignoring False Positive Tests

**Mistake:** Adding rules without corresponding false-positive regression tests.
**Prevention:** Every rule must have at least one positive test, one negative test, and one false-positive regression test.

### 14.8 Hardcoded Severities

**Mistake:** Every rule has a fixed severity that cannot be overridden by user configuration.
**Prevention:** Severity has a default in the rule definition but is overridable in user config. The engine resolves severity at load time.

### 14.9 Not Recording Provenance

**Mistake:** Merging or deduplicating findings without recording why, making debugging impossible.
**Prevention:** Every merge/dedup/group action records a ProvenanceEntry with action, source IDs, target ID, reason, and timestamp.

### 14.10 AI in the Analysis Pipeline

**Mistake:** Using AI (LLM, embedding) to determine whether a rule matched.
**Prevention:** AI is a consumer of analysis results, never a participant in the analysis. AI lives in `@veris/ai`, imported only by `@veris/cli` and `@veris/api`.

---

## 15. Final Recommendations

### 15.1 Implementation Order

| Phase          | Components                                                                | Rationale                                        |
| -------------- | ------------------------------------------------------------------------- | ------------------------------------------------ |
| **Phase 1**    | Rule interfaces, RuleDefinition, RuleMatcher, RuleRegistry                | Foundation — needed before any rules can execute |
| **Phase 2**    | PropertyMatchers (exact, regex, range), RuleScheduler, RuleLoader         | Core matching and scheduling                     |
| **Phase 3**    | Safe evaluator sandbox, composite matchers, threshold matchers            | Advanced matching capabilities                   |
| **Phase 4**    | Rule caching (3 levels), diagnostic system                                | Performance and debuggability                    |
| **Phase 5**    | Correlation Engine (dedup, grouping, sequence detection)                  | Higher-order analysis                            |
| **Phase 6**    | Trust Engine, Risk Engine                                                 | Scoring and prioritization                       |
| **Phase 7**    | Reasoning Engine (templates, traceability)                                | Explainability                                   |
| **Phase 8**    | Rule packs (core, secrets, scripts, executables, archives, configuration) | Shipped rules                                    |
| **Continuous** | Benchmarks, golden tests, regression corpus, false-positive tests         | Quality assurance                                |

### 15.2 Critical Success Factors

1. **Write rules as data.** A rule definition should be readable by someone who doesn't know TypeScript. If a rule requires code, it's too complex — push logic to the evaluator.
2. **Test traceability first.** Before optimizing, verify that every Finding can trace back to its Evidence, Behavior, Feature, and Artifact.
3. **Cache last.** Build the engine without caching first. Add caching only when profiling identifies specific bottlenecks.
4. **Parallelism at artifact level.** The simplest and most impactful parallelism is processing multiple artifacts simultaneously. Optimize this before in-process parallelism.
5. **Diagnose everything.** The diagnostic system is not optional. It is essential for debugging false positives, performance issues, and rule development.
6. **Correlation is the differentiator.** Basic rule matching is table stakes. The Correlation Engine — detecting multi-step behavioral sequences — is what makes VERIS different.

### 15.3 Architectural Invariants

```
1. Rules never parse files. Rules consume Behaviors only.
2. All matchers are pure functions. No side effects, no nondeterminism.
3. Every Finding has at least one Evidence.
4. Every Evidence traces to a Rule and a Behavior.
5. Correlation preserves provenance of every merge/dedup decision.
6. Trust and Risk are computed, never configured.
7. Reasoning templates are deterministic. AI explanations are layered on top.
8. Cache is per-session only. No cross-session caching.
9. Dependency cycles between rules are forbidden.
10. AI is never in the analysis pipeline.
```

---

_End of SPEC-003. This document describes the frozen rule engine, correlation engine, and reasoning pipeline for VERIS V1 through V4._
