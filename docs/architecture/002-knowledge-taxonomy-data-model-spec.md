# VERIS Knowledge Taxonomy & Canonical Data Model — SPEC-002

**Status:** Frozen  
**Version:** 1.0  
**Applies to:** Canonical object model, object identity, behavior taxonomy, validation rules, versioning.  
**Scope:** V1 through V4 without breaking compatibility.

---

## Table of Contents

1. [Pipeline Overview](#1-pipeline-overview)
2. [Design Philosophy](#2-design-philosophy)
3. [Canonical Objects](#3-canonical-objects)
   - 3.1 ScanSession
   - 3.2 Artifact
   - 3.3 Feature
   - 3.4 Behavior
   - 3.5 Evidence
   - 3.6 Rule
   - 3.7 RuleResult
   - 3.8 Finding
   - 3.9 BehaviorChain
   - 3.10 TrustProfile
   - 3.11 RiskProfile
   - 3.12 Recommendation
   - 3.13 CanonicalReport
   - 3.14 Capability
4. [Knowledge Taxonomy](#4-knowledge-taxonomy)
   - 4.1 Normalized Behavior Taxonomy
   - 4.2 Taxonomy Hierarchy
   - 4.3 Behavior Definitions
   - 4.4 Language-Agnostic Normalization Rules
   - 4.5 CWE / OWASP / NIST Mappings
5. [Object Relationships](#5-object-relationships)
   - 5.1 Parent-Child Hierarchy
   - 5.2 Reference Graph
   - 5.3 Lineage Chains
6. [Object Identity](#6-object-identity)
   - 6.1 Stable ID Strategy
   - 6.2 ID Naming Conventions
   - 6.3 UUID vs Deterministic IDs
   - 6.4 Cross-Report References
   - 6.5 Merge Behavior
   - 6.6 Replay Compatibility
7. [Object Lifecycle](#7-object-lifecycle)
8. [Validation Rules](#8-validation-rules)
   - 8.1 Object-Level Invariants
   - 8.2 Cross-Object Invariants
   - 8.3 Pipeline Invariants
9. [Versioning Strategy](#9-versioning-strategy)
   - 9.1 Schema Versioning
   - 9.2 Forward/Backward Compatibility
   - 9.3 Migration Strategy
10. [Serialization Concerns](#10-serialization-concerns)
11. [Engineering Tradeoffs](#11-engineering-tradeoffs)
12. [Common Mistakes to Avoid](#12-common-mistakes-to-avoid)
13. [Final Recommendations](#13-final-recommendations)

---

## 1. Pipeline Overview

The VERIS analysis pipeline is frozen as:

```
  ScanSession
      │
      ▼
  Artifact(s)
      │
      ▼
  Feature(s)
      │
      ▼
  Behavior(s)
      │
      ▼
  Evidence
      │
      ▼
  Rule(s)
      │
      ▼
  Finding(s)
      │
      ▼
  BehaviorChain(s)
      │
      ▼
  TrustProfile
      │
      ▼
  RiskProfile
      │
      ▼
  Recommendation(s)
      │
      ▼
  CanonicalReport
```

**Invariant:** Every stage consumes the output of its immediate predecessor. No stage may be skipped. No stage may reach ahead.

**Invariant:** The engine never operates on raw files after extraction. All downstream subsystems consume normalized objects exclusively.

---

## 2. Design Philosophy

### 2.1 Deterministic Analysis

Given the same input (same files, same rules, same taxonomy), the engine must produce the same output. No randomness, no non-determinism, no AI approximation in the analysis pipeline.

### 2.2 Explainability

Every Finding must be able to answer "why was this flagged?" through a traceable chain: **Finding → Rule → Evidence → Behavior → Feature → Artifact → ScanSession**.

### 2.3 Immutability

Once produced, objects are immutable. Modification is done by producing a new version. This enables caching, replay, diffing, and distributed analysis.

### 2.4 Traceability

Every object carries provenance metadata (when, by what version, from what input) sufficient to reconstruct the entire analysis lineage.

### 2.5 Extensibility

New behaviors, rules, and extractors can be added without modifying existing objects. Objects use open enums (string unions) with registries, not closed enumerations.

### 2.6 Performance

Objects are designed for zero-copy serialization (structured cloneable), indexed lookups (Map/dictionary-friendly), and streaming (generator-friendly) consumption.

### 2.7 Testability

Every object has a factory function for test construction. Factories produce valid objects with minimal required inputs and sensible defaults.

---

## 3. Canonical Objects

### 3.1 ScanSession

**Purpose:** Represents a single invocation of the VERIS analyzer. The root container for all analysis data.

**Responsibilities:**

- Uniquely identifies a scan run
- Carries metadata about the environment, configuration, and engine version
- Provides temporal context (start/end/duration)
- Ties all downstream objects into a coherent session

**Fields:**

| Field           | Type                     | Required | Description                                           |
| --------------- | ------------------------ | -------- | ----------------------------------------------------- |
| `id`            | `SessionId`              | ✓        | Globally unique session identifier                    |
| `schemaVersion` | `string`                 | ✓        | Data model schema version (semver)                    |
| `engineVersion` | `string`                 | ✓        | VERIS engine version that produced this session       |
| `startedAt`     | `ISO8601`                | ✓        | Start timestamp                                       |
| `completedAt`   | `ISO8601`                | ✓        | Completion timestamp                                  |
| `durationMs`    | `number`                 | ✓        | `completedAt - startedAt`                             |
| `config`        | `SessionConfig`          | ✓        | Snapshot of scan configuration                        |
| `environment`   | `EnvironmentInfo`        | ✓        | OS, platform, runtime metadata                        |
| `artifactCount` | `number`                 | ✓        | Total artifacts processed                             |
| `findingCount`  | `number`                 | ✓        | Total findings generated                              |
| `status`        | `SessionStatus`          | ✓        | `"completed" \| "partial" \| "failed" \| "cancelled"` |
| `errors`        | `SessionError[]`         |          | Non-fatal errors during scan                          |
| `tags`          | `Record<string, string>` |          | User-defined tags for categorization                  |

**Relationships:**

- **Parent of:** `Artifact[]` (via `sessionId`)
- **Owned by:** User/CI system (external ownership)

**Lifecycle:**

1. Created at scan start (`startedAt` set, status: `"running"` internally)
2. Completed at scan end (`completedAt` set, status finalized)
3. Immutable after completion

**Serialization:** Top-level envelope in all output formats.

**Versioning:** `schemaVersion` is the canonical indicator. Breaking changes to ScanSession increment major version.

**Immutability:** Fully immutable after `completedAt` is set.

---

### 3.2 Artifact

**Purpose:** A normalized representation of a single input unit (file, archive entry, repository file, script, executable, memory region) after extraction.

**Responsibilities:**

- Provides a stable, content-addressed reference to the input
- Carries type classification and basic metadata
- Stores content hash for deduplication and replay
- Remains the single source of truth for "what was analyzed"

**Fields:**

| Field            | Type                      | Required | Description                                                           |
| ---------------- | ------------------------- | -------- | --------------------------------------------------------------------- |
| `id`             | `ArtifactId`              | ✓        | Content-derived deterministic ID                                      |
| `sessionId`      | `SessionId`               | ✓        | Owning session                                                        |
| `parentId`       | `ArtifactId \| null`      | ✓        | Parent artifact if extracted from another (e.g., file inside archive) |
| `type`           | `ArtifactType`            | ✓        | Normalized type classification                                        |
| `subType`        | `string`                  |          | Further classification (e.g., "ELF", "PE", "Mach-O" for executables)  |
| `originalPath`   | `string`                  |          | Original filesystem path or identifier                                |
| `normalizedPath` | `string`                  | ✓        | Cross-platform normalized path                                        |
| `size`           | `number`                  | ✓        | Size in bytes                                                         |
| `contentHash`    | `ContentHash`             | ✓        | SHA-256 hash of content (or BLAKE3)                                   |
| `mimeType`       | `string`                  | ✓        | Detected or declared MIME type                                        |
| `encoding`       | `string`                  |          | Detected text encoding (for textual artifacts)                        |
| `metadata`       | `Record<string, unknown>` |          | Extractor-specific metadata (e.g., ELF sections, PE imports)          |
| `extractedAt`    | `ISO8601`                 | ✓        | When the artifact was extracted                                       |
| `extractorId`    | `string`                  | ✓        | ID of the extractor that produced this artifact                       |

**ArtifactType enum (open):**

```
"file" | "directory" | "archive" | "executable" | "script"
| "document" | "configuration" | "binary-blob" | "memory-region"
| "network-stream" | "repository" | "unknown"
```

**Relationships:**

- **Child of:** `ScanSession` (via `sessionId`)
- **Parent of:** `Feature[]` (via `artifactId`)
- **Sibling of:** Other Artifacts sharing the same `sessionId` and `parentId`

**Lifecycle:**

1. Created by an Extractor during extraction
2. Passed to Feature extraction stage
3. Immutable after Feature extraction begins

**Serialization:** Content hash is stored; actual content is optionally stored (for inline reports) or referenced by hash (for external blob stores).

**Versioning:** `ArtifactType` enum is open — new types are additive. Removal of a type is major.

**Immutability:** Fully immutable after creation.

---

### 3.3 Feature

**Purpose:** A discrete, atomic piece of data extracted from an Artifact. Features are the lowest-level analytical unit — the "atoms" that behaviors are built from.

**Responsibilities:**

- Represent a single extractable characteristic of the artifact
- Be language-agnostic and type-agnostic
- Carry enough context for downstream behavior classification
- Maintain a direct link to the source location in the artifact

**Fields:**

| Field        | Type                      | Required | Description                                              |
| ------------ | ------------------------- | -------- | -------------------------------------------------------- |
| `id`         | `FeatureId`               | ✓        | Deterministic ID derived from artifact + location + type |
| `artifactId` | `ArtifactId`              | ✓        | Source artifact                                          |
| `sessionId`  | `SessionId`               | ✓        | Owning session                                           |
| `type`       | `FeatureType`             | ✓        | Classification of the feature                            |
| `value`      | `FeatureValue`            | ✓        | The extracted value                                      |
| `location`   | `SourceLocation`          | ✓        | Source location in the artifact                          |
| `confidence` | `number`                  | ✓        | Confidence score [0.0, 1.0]                              |
| `metadata`   | `Record<string, unknown>` |          | Extractor-specific context                               |

**FeatureType enum (open):**

```
"string-literal" | "numeric-literal" | "identifier" | "function-call"
| "import-statement" | "export-statement" | "url" | "ip-address"
| "domain-name" | "file-path" | "registry-key" | "environment-variable"
| "permission" | "capability" | "system-call" | "api-call"
| "control-flow" | "data-flow" | "string-pattern" | "binary-pattern"
| "section-header" | "symbol" | "metadata-field" | "annotation"
```

**FeatureValue (discriminated union):**

```typescript
type FeatureValue =
  | { kind: 'string'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'bytes'; value: string; encoding: 'base64' | 'hex' }
  | { kind: 'array'; values: FeatureValue[] }
  | { kind: 'map'; entries: Record<string, FeatureValue> }
  | { kind: 'regex-match'; pattern: string; match: string; groups: Record<string, string> }
  | { kind: 'ast-node'; nodeType: string; properties: Record<string, unknown> };
```

**SourceLocation:**

| Field         | Type     | Description                    |
| ------------- | -------- | ------------------------------ |
| `startLine`   | `number` | 1-based start line             |
| `startColumn` | `number` | 0-based start column           |
| `endLine`     | `number` | 1-based end line               |
| `endColumn`   | `number` | 0-based end column             |
| `offset`      | `number` | Byte offset from start         |
| `length`      | `number` | Length in bytes                |
| `context`     | `string` | Surrounding code/bytes snippet |

**Relationships:**

- **Child of:** `Artifact` (via `artifactId`)
- **Parent of:** `Behavior` (via `featureIds[]`)
- **Peer of:** Other Features from the same Artifact

**Lifecycle:**

1. Created by Feature extractor phase
2. Consumed by Behavior classifier
3. Immutable after behavior classification

**Versioning:** `FeatureType` is open. New feature types are additive.

**Immutability:** Fully immutable.

---

### 3.4 Behavior

**Purpose:** A normalized, language-agnostic behavioral observation derived from one or more Features. Behaviors use the canonical taxonomy vocabulary — all language/format-specific details are abstracted away.

**Responsibilities:**

- Map one or more Features to a normalized taxonomy node
- Abstract away language/format specifics
- Carry confidence and context for downstream rule matching
- Support composition (behaviors from multiple features)

**Fields:**

| Field        | Type                      | Required | Description                          |
| ------------ | ------------------------- | -------- | ------------------------------------ |
| `id`         | `BehaviorId`              | ✓        | Deterministic ID                     |
| `artifactId` | `ArtifactId`              | ✓        | Source artifact                      |
| `sessionId`  | `SessionId`               | ✓        | Owning session                       |
| `taxonomyId` | `TaxonomyId`              | ✓        | Canonical taxonomy node identifier   |
| `featureIds` | `FeatureId[]`             | ✓        | Features that produced this behavior |
| `confidence` | `number`                  | ✓        | Combined confidence [0.0, 1.0]       |
| `properties` | `Record<string, unknown>` |          | Behavior-specific properties         |
| `metadata`   | `Record<string, unknown>` |          | Classifier metadata                  |

**Relationships:**

- **Child of:** `Artifact` (via `artifactId`)
- **Derived from:** `Feature[]` (via `featureIds`)
- **Parent of:** `Evidence` (via `behaviorId`)
- **Consumed by:** `BehaviorChain` (via `behaviorIds[]`)

**Lifecycle:**

1. Created by Behavior classifier from one or more Features
2. Consumed by Rule engine (matched against Rule patterns)
3. Immutable after rule matching

**Immutability:** Fully immutable.

**Taxonomy coverage:** Every Behavior must map to exactly one TaxonomyId. Mapping is many-to-one from features to behaviors.

---

### 3.5 Evidence

**Purpose:** The binding between a Behavior and the specific Rule that matched it. Evidence is the "because" — the concrete proof that a rule triggered.

**Responsibilities:**

- Record exactly which behavior matched which rule
- Capture the matched portion of the behavior's properties
- Provide context for human-readable explanations
- Enable traceability from Finding back to raw artifact

**Fields:**

| Field               | Type                      | Required | Description                                                |
| ------------------- | ------------------------- | -------- | ---------------------------------------------------------- |
| `id`                | `EvidenceId`              | ✓        | Deterministic ID                                           |
| `ruleId`            | `RuleId`                  | ✓        | The Rule that matched                                      |
| `behaviorId`        | `BehaviorId`              | ✓        | The Behavior that was matched                              |
| `findingId`         | `FindingId`               | ✓        | The Finding this evidence supports                         |
| `sessionId`         | `SessionId`               | ✓        | Owning session                                             |
| `matchedProperties` | `Record<string, unknown>` | ✓        | The subset of behavior properties that triggered the match |
| `matchDetail`       | `MatchDetail`             | ✓        | How the rule matched (pattern, heuristic, composite)       |
| `confidence`        | `number`                  | ✓        | Confidence contributed to the finding [0.0, 1.0]           |

**MatchDetail (discriminated union):**

```typescript
type MatchDetail =
  | { kind: 'exact'; pattern: string; matched: string }
  | { kind: 'regex'; pattern: string; matched: string }
  | { kind: 'heuristic'; rule: string; score: number; threshold: number }
  | {
      kind: 'threshold';
      metric: string;
      value: number;
      threshold: number;
      direction: 'gt' | 'gte' | 'lt' | 'lte';
    }
  | { kind: 'composite'; subMatches: MatchDetail[]; operator: 'and' | 'or' | 'sequence' };
```

**Relationships:**

- **Child of:** `Finding` (via `findingId`)
- **References:** `Behavior` (via `behaviorId`) and `Rule` (via `ruleId`)
- **Peer of:** Other Evidence under the same Finding

**Lifecycle:**

1. Created when a Rule matches a Behavior
2. Attached to a Finding
3. Immutable

**Immutability:** Fully immutable.

---

### 3.6 Rule

**Purpose:** A declarative matching pattern that, when applied to Behaviors, produces Evidence. Rules are the "what to look for."

**Responsibilities:**

- Declaratively describe a pattern of behaviors
- Carry metadata for categorization and severity
- Be independently versioned and testable
- Be loadable from rule packs

**Fields:**

| Field         | Type           | Required | Description                               |
| ------------- | -------------- | -------- | ----------------------------------------- |
| `id`          | `RuleId`       | ✓        | Unique, human-readable, stable identifier |
| `packId`      | `string`       | ✓        | Rule pack it belongs to                   |
| `version`     | `string`       | ✓        | Rule version (semver)                     |
| `name`        | `string`       | ✓        | Human-readable name                       |
| `description` | `string`       | ✓        | What this rule detects                    |
| `severity`    | `Severity`     | ✓        | Severity level                            |
| `taxonomyIds` | `TaxonomyId[]` | ✓        | Behavior taxonomy nodes this rule matches |
| `matchLogic`  | `RuleLogic`    | ✓        | The matching logic                        |
| `metadata`    | `RuleMetadata` |          | Author, references, tags, CWE mappings    |

**Severity:**

```typescript
type Severity = {
  level: 'critical' | 'high' | 'medium' | 'low' | 'info';
  score: number; // 0.0 - 10.0
};
```

**RuleLogic (discriminated union — declarative only):**

```typescript
type RuleLogic =
  | { kind: 'single-behavior'; behaviorTaxonomyId: TaxonomyId; propertyMatcher: PropertyMatcher }
  | {
      kind: 'multi-behavior';
      pattern: BehaviorPattern;
      relationship: 'all' | 'any' | 'sequence' | 'graph';
    }
  | { kind: 'threshold'; metric: string; threshold: number; window: string }
  | { kind: 'composite'; subRules: RuleLogic[]; operator: 'and' | 'or' };
```

**RuleMetadata:**

| Field           | Type       | Description             |
| --------------- | ---------- | ----------------------- |
| `author`        | `string`   | Rule author             |
| `tags`          | `string[]` | Categorization tags     |
| `cweIds`        | `string[]` | Related CWE identifiers |
| `owaspCategory` | `string`   | Related OWASP category  |
| `nistControl`   | `string`   | Related NIST control    |
| `references`    | `string[]` | External reference URLs |
| `remediation`   | `string`   | Remediation guidance    |

**Relationships:**

- **Referenced by:** `Evidence` (via `ruleId`)
- **Owned by:** `RulePack`
- **N/A:** Rules are not created during a scan session; they are loaded from rule packs

**Lifecycle:**

1. Defined in a rule pack
2. Loaded into the RuleEngine at scan start
3. Applied against Behaviors during analysis
4. Not modified during scan (immutable at rest)

**Versioning:** Rules are versioned independently. A RuleId includes the pack and name; the specific version is resolved at load time.

**Immutability:** Immutable at rest. A new version of a rule is a new object.

---

### 3.7 RuleResult

**Purpose:** The output of applying a single Rule against a single Behavior or set of Behaviors. RuleResult is the intermediate object between Rule application and Finding construction.

**Responsibilities:**

- Record whether a rule matched
- Capture the match detail
- Track rule execution metadata (timing, confidence)
- Support multi-behavior rule results

**Fields:**

| Field             | Type                  | Required | Description                        |
| ----------------- | --------------------- | -------- | ---------------------------------- |
| `id`              | `RuleResultId`        | ✓        | Deterministic ID                   |
| `ruleId`          | `RuleId`              | ✓        | The rule that was applied          |
| `behaviorIds`     | `BehaviorId[]`        | ✓        | Behaviors involved in the match    |
| `matched`         | `boolean`             | ✓        | Whether the rule matched           |
| `confidence`      | `number`              | ✓        | Confidence in the match [0.0, 1.0] |
| `matchDetail`     | `MatchDetail \| null` |          | Match detail if matched            |
| `executionTimeMs` | `number`              | ✓        | How long the rule took to execute  |
| `sessionId`       | `SessionId`           | ✓        | Owning session                     |

**Relationships:**

- **References:** `Rule` (via `ruleId`), `Behavior[]` (via `behaviorIds`)
- **Consumed by:** Finding builder (matched results become Evidence)

**Lifecycle:**

1. Created when a rule is applied
2. If matched, contributes to a Finding via Evidence
3. If not matched, may be logged for debugging/auditing
4. Short-lived intermediate object — not persisted in reports

**Immutability:** Fully immutable.

---

### 3.8 Finding

**Purpose:** A completed analytical conclusion — a potential security concern with supporting evidence, severity, and traceability. Findings are the primary output consumers care about.

**Responsibilities:**

- Represent a complete analytical conclusion
- Aggregate all supporting Evidence (one per matched behavior)
- Carry severity, confidence, and risk context
- Provide human-readable explanation
- Maintain full traceability chain

**Fields:**

| Field               | Type                      | Required | Description                            |
| ------------------- | ------------------------- | -------- | -------------------------------------- |
| `id`                | `FindingId`               | ✓        | Deterministic ID                       |
| `sessionId`         | `SessionId`               | ✓        | Owning session                         |
| `ruleId`            | `RuleId`                  | ✓        | The rule that produced this finding    |
| `behaviorChainId`   | `BehaviorChainId \| null` |          | Associated behavior chain              |
| `title`             | `string`                  | ✓        | Human-readable title                   |
| `description`       | `string`                  | ✓        | Detailed description                   |
| `severity`          | `Severity`                | ✓        | Severity level                         |
| `confidence`        | `number`                  | ✓        | Overall confidence [0.0, 1.0]          |
| `evidenceIds`       | `EvidenceId[]`            | ✓        | Supporting evidence                    |
| `affectedArtifacts` | `ArtifactRef[]`           | ✓        | Artifacts involved                     |
| `recommendationIds` | `RecommendationId[]`      |          | Remediation recommendations            |
| `taxonomyIds`       | `TaxonomyId[]`            | ✓        | Taxonomy nodes this finding relates to |
| `properties`        | `Record<string, unknown>` |          | Finding-specific properties            |
| `createdAt`         | `ISO8601`                 | ✓        | When the finding was created           |

**ArtifactRef:**

| Field          | Type                                     | Description                             |
| -------------- | ---------------------------------------- | --------------------------------------- |
| `artifactId`   | `ArtifactId`                             | Referenced artifact                     |
| `location`     | `SourceLocation`                         | Specific location in the artifact       |
| `relationship` | `"primary" \| "related" \| "contextual"` | How the artifact relates to the finding |

**Relationships:**

- **Child of:** `ScanSession` (via `sessionId`)
- **Contains:** `Evidence[]` (via `evidenceIds`)
- **References:** `Rule` (via `ruleId`)
- **Optionally in:** `BehaviorChain` (via `behaviorChainId`)
- **May produce:** `Recommendation` (via `recommendationIds`)

**Lifecycle:**

1. Created by the Finding builder from matched RuleResults
2. Attached to a BehaviorChain if applicable
3. Consumed by the Report builder
4. Immutable after report generation

**Immutability:** Fully immutable.

**Validation:** Every Finding must have at least one Evidence. Every Evidence must trace back to a Behavior, Feature, and Artifact.

---

### 3.9 BehaviorChain

**Purpose:** A sequence or graph of related Behaviors that, taken together, represent a multi-step pattern. Chains capture tactics — sequences of behaviors that are individually benign but collectively suspicious.

**Responsibilities:**

- Group related behaviors into a coherent narrative
- Capture temporal or causal ordering
- Support graph-based behavioral patterns
- Enable higher-order analysis (e.g., "download then execute")

**Fields:**

| Field              | Type                      | Required | Description                             |
| ------------------ | ------------------------- | -------- | --------------------------------------- |
| `id`               | `BehaviorChainId`         | ✓        | Deterministic ID                        |
| `sessionId`        | `SessionId`               | ✓        | Owning session                          |
| `relationshipType` | `ChainRelationshipType`   | ✓        | How behaviors relate                    |
| `behaviorIds`      | `BehaviorId[]`            | ✓        | Behaviors in the chain (ordered)        |
| `findingIds`       | `FindingId[]`             |          | Findings produced from this chain       |
| `trustImpact`      | `number`                  |          | Impact on trust score [-1.0, 1.0]       |
| `description`      | `string`                  |          | Human-readable description of the chain |
| `metadata`         | `Record<string, unknown>` |          | Chain-specific metadata                 |

**ChainRelationshipType (open):**

```typescript
type ChainRelationshipType =
  | 'sequential' // A → B → C in temporal order
  | 'causal' // A causes B which causes C
  | 'conditional' // If A then B, or B only when A
  | 'correlated' // A and B co-occur but order isn't significant
  | 'graph' // Complex graph relationship
  | 'parent-child' // A spawns B which spawns C
  | 'data-flow'; // Data moves from A to B to C
```

**Relationships:**

- **Contains:** `Behavior[]` (via `behaviorIds`)
- **Contains:** `Finding[]` (via `findingIds`) — findings produced from chain analysis
- **Consumed by:** TrustProfile builder

**Lifecycle:**

1. Created during chain analysis (post-finding, pre-trust)
2. Consumed by TrustProfile builder
3. Immutable after TrustProfile construction

**Immutability:** Fully immutable.

---

### 3.10 TrustProfile

**Purpose:** An aggregate assessment of trustworthiness for an artifact or set of artifacts, derived from the density, severity, and nature of findings and behavior chains.

**Responsibilities:**

- Compute a normalized trust score
- Summarize the overall security posture
- Support comparison across scans
- Provide breakdown by taxonomy category

**Fields:**

| Field                 | Type                            | Required | Description                                              |
| --------------------- | ------------------------------- | -------- | -------------------------------------------------------- |
| `id`                  | `TrustProfileId`                | ✓        | Deterministic ID                                         |
| `sessionId`           | `SessionId`                     | ✓        | Owning session                                           |
| `artifactId`          | `ArtifactId`                    | ✓        | The artifact this trust profile applies to               |
| `trustScore`          | `number`                        | ✓        | Normalized trust score [0.0 (malicious) – 1.0 (trusted)] |
| `findingDensity`      | `number`                        | ✓        | Findings per KB of analyzed content                      |
| `severityBreakdown`   | `Record<SeverityLevel, number>` | ✓        | Count of findings per severity level                     |
| `taxonomyBreakdown`   | `Record<TaxonomyId, number>`    |          | Findings per taxonomy node                               |
| `chainImpact`         | `number`                        |          | Impact of behavior chains on trust [-1.0, 1.0]           |
| `contributingFactors` | `TrustFactor[]`                 |          | Factors that influenced the score                        |
| `computedAt`          | `ISO8601`                       | ✓        | When the profile was computed                            |

**TrustFactor:**

| Field         | Type     | Description                                                     |
| ------------- | -------- | --------------------------------------------------------------- |
| `factor`      | `string` | Factor name (e.g., "high-severity-findings", "behavior-chains") |
| `impact`      | `number` | Directional impact [-1.0, 1.0]                                  |
| `weight`      | `number` | Weight in the overall calculation                               |
| `explanation` | `string` | Human-readable explanation                                      |

**Relationships:**

- **Child of:** `ScanSession`
- **References:** `Artifact` (via `artifactId`)
- **Derived from:** `Finding[]`, `BehaviorChain[]`
- **Consumed by:** RiskProfile builder

**Lifecycle:**

1. Created after all findings and chains are produced
2. Consumed by RiskProfile builder
3. Immutable after risk profile construction

**Immutability:** Fully immutable.

---

### 3.11 RiskProfile

**Purpose:** A prioritized, business-context-aware risk assessment that builds on the TrustProfile by incorporating severity, exploitability, impact, and recommendation urgency.

**Responsibilities:**

- Translate technical findings into business risk
- Prioritize findings by severity * likelihood * impact
- Provide actionable risk scores
- Support filtering by minimum risk threshold

**Fields:**

| Field                      | Type                                                        | Required | Description                     |
| -------------------------- | ----------------------------------------------------------- | -------- | ------------------------------- |
| `id`                       | `RiskProfileId`                                             | ✓        | Deterministic ID                |
| `sessionId`                | `SessionId`                                                 | ✓        | Owning session                  |
| `trustProfileId`           | `TrustProfileId`                                            | ✓        | Source trust profile            |
| `riskScore`                | `number`                                                    | ✓        | Overall risk score [0.0 – 10.0] |
| `riskLevel`                | `"critical" \| "high" \| "medium" \| "low" \| "negligible"` | ✓        | Categorized risk level          |
| `maxSeverity`              | `Severity`                                                  | ✓        | Highest severity finding        |
| `topFindings`              | `FindingId[]`                                               |          | Highest-risk findings (top 10)  |
| `riskDrivers`              | `RiskDriver[]`                                              |          | Factors driving the risk score  |
| `recommendationPriorities` | `RecommendationId[]`                                        |          | Ordered recommendations         |
| `computedAt`               | `ISO8601`                                                   | ✓        | When computed                   |

**RiskDriver:**

| Field          | Type        | Description                           |
| -------------- | ----------- | ------------------------------------- |
| `findingId`    | `FindingId` | Finding driving the risk              |
| `contribution` | `number`    | Contribution to risk score [0.0, 1.0] |
| `reason`       | `string`    | Why this finding drives risk          |

**Relationships:**

- **Derived from:** `TrustProfile` (via `trustProfileId`)
- **References:** `Finding[]` (via `topFindings`)
- **References:** `Recommendation[]` (via `recommendationPriorities`)
- **Consumed by:** CanonicalReport builder

**Lifecycle:**

1. Created after TrustProfile
2. Consumed by CanonicalReport builder
3. Immutable after report generation

**Immutability:** Fully immutable.

---

### 3.12 Recommendation

**Purpose:** Actionable remediation guidance linked to specific findings, ordered by priority.

**Responsibilities:**

- Provide concrete steps to remediate a finding
- Reference affected code locations
- Link to external references (CWE, OWASP, documentation)
- Support automated fix suggestions (future)

**Fields:**

| Field              | Type                                        | Required | Description                            |
| ------------------ | ------------------------------------------- | -------- | -------------------------------------- |
| `id`               | `RecommendationId`                          | ✓        | Deterministic ID                       |
| `sessionId`        | `SessionId`                                 | ✓        | Owning session                         |
| `findingIds`       | `FindingId[]`                               | ✓        | Findings this recommendation addresses |
| `title`            | `string`                                    | ✓        | Short action title                     |
| `description`      | `string`                                    | ✓        | Steps to remediate                     |
| `priority`         | `"critical" \| "high" \| "medium" \| "low"` | ✓        | Remediation priority                   |
| `effort`           | `"minutes" \| "hours" \| "days"`            | ✓        | Estimated remediation effort           |
| `autoFixAvailable` | `boolean`                                   |          | Whether an automated fix exists        |
| `references`       | `ExternalReference[]`                       |          | CWE, OWASP, documentation links        |
| `codeExamples`     | `CodeExample[]`                             |          | Before/after code examples             |

**CodeExample:**

| Field      | Type     | Description          |
| ---------- | -------- | -------------------- |
| `language` | `string` | Programming language |
| `before`   | `string` | Vulnerable code      |
| `after`    | `string` | Remediated code      |

**Relationships:**

- **References:** `Finding[]` (via `findingIds`)
- **Contained in:** `RiskProfile` (via `recommendationPriorities`)
- **Contained in:** `CanonicalReport`

**Lifecycle:**

1. Created from rule metadata + finding context
2. Linked to findings
3. Immutable after report generation

**Immutability:** Fully immutable.

---

### 3.13 CanonicalReport

**Purpose:** The complete, self-contained output of a VERIS scan session. The canonical model that all exporters, renderers, and consumers operate on.

**Responsibilities:**

- Aggregate all session data into a single coherent structure
- Provide both summary and detailed views
- Be self-contained (no external references needed to interpret)
- Support multiple output formats through exporters
- Support incremental diffing across scans

**Fields:**

| Field             | Type               | Required | Description                           |
| ----------------- | ------------------ | -------- | ------------------------------------- |
| `id`              | `ReportId`         | ✓        | Deterministic ID                      |
| `session`         | `ScanSession`      | ✓        | Session metadata                      |
| `artifacts`       | `Artifact[]`       | ✓        | All artifacts analyzed                |
| `findings`        | `Finding[]`        | ✓        | All findings (with embedded evidence) |
| `behaviorChains`  | `BehaviorChain[]`  |          | Detected behavior chains              |
| `trustProfile`    | `TrustProfile`     | ✓        | Trust assessment                      |
| `riskProfile`     | `RiskProfile`      | ✓        | Risk assessment                       |
| `recommendations` | `Recommendation[]` |          | Remediation recommendations           |
| `summary`         | `ReportSummary`    | ✓        | High-level summary                    |
| `errors`          | `SessionError[]`   |          | Errors encountered during analysis    |
| `generatedAt`     | `ISO8601`          | ✓        | Report generation timestamp           |

**ReportSummary:**

| Field                | Type                            | Description                   |
| -------------------- | ------------------------------- | ----------------------------- |
| `totalArtifacts`     | `number`                        | Total artifacts analyzed      |
| `totalFindings`      | `number`                        | Total findings                |
| `findingsBySeverity` | `Record<SeverityLevel, number>` | Findings by severity          |
| `findingsByCategory` | `Record<TaxonomyId, number>`    | Findings by taxonomy category |
| `riskScore`          | `number`                        | Overall risk score            |
| `trustScore`         | `number`                        | Overall trust score           |
| `scanDurationMs`     | `number`                        | Total scan duration           |
| `rulesApplied`       | `number`                        | Number of rules applied       |
| `behaviorsDetected`  | `number`                        | Number of behaviors detected  |

**Relationships:**

- **Contains:** Everything (aggregate root)
- **Consumed by:** All exporters and renderers
- **Diffable with:** Another CanonicalReport (for incremental scans)

**Lifecycle:**

1. Created by ReportBuilder after all analysis stages complete
2. Serialized by Exporters into target formats
3. Immutable — diffs are computed between two reports, not within one

**Versioning:** The `session.schemaVersion` field dictates the schema version of the entire report.

**Immutability:** Fully immutable after creation.

---

### 3.14 Capability

**Purpose:** A discrete action or resource access that an artifact is observed to possess. Capabilities are extracted during the Feature phase and used to build Behaviors. They represent "what can this artifact do?"

**Responsibilities:**

- Catalog individual capabilities (API calls, system calls, file access patterns)
- Support capability-based behavior matching
- Enable capability-driven rule composition
- Provide granularity below the Behavior level

**Fields:**

| Field        | Type                      | Required | Description                          |
| ------------ | ------------------------- | -------- | ------------------------------------ |
| `id`         | `CapabilityId`            | ✓        | Deterministic ID                     |
| `artifactId` | `ArtifactId`              | ✓        | Source artifact                      |
| `name`       | `string`                  | ✓        | Canonical capability name            |
| `category`   | `CapabilityCategory`      | ✓        | Category of capability               |
| `properties` | `Record<string, unknown>` |          | Capability-specific properties       |
| `source`     | `SourceLocation`          | ✓        | Where in the artifact this was found |
| `confidence` | `number`                  | ✓        | Confidence [0.0, 1.0]                |

**CapabilityCategory (open):**

```typescript
type CapabilityCategory =
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
```

**Relationships:**

- **Child of:** `Artifact` (via `artifactId`)
- **Consumed by:** Behavior classifier (capabilities → behaviors)

**Lifecycle:**

1. Created during feature extraction
2. Consumed by behavior classifier
3. Immutable after behavior classification

**Immutability:** Fully immutable.

---

## 4. Knowledge Taxonomy

### 4.1 Design Principles

The taxonomy is:

- **Normalized** — Language/format/OS-specific details are abstracted away
- **Hierarchical** — Categories have subcategories, max depth 3
- **Open** — New nodes can be added without breaking existing ones
- **Mapped** — Every node maps to CWE, OWASP, and/or NIST controls
- **Stable** — Taxonomy node IDs are permanent; once assigned, never repurposed

### 4.2 Taxonomy Hierarchy

```
T1000 ── Execution
│  ├── T1100 ── Command Execution
│  ├── T1110 ── Script Execution
│  ├── T1120 ── Code Evaluation
│  ├── T1130 ── Process Injection
│  └── T1190 ── Indirect Execution (WMI, COM, etc.)
│
T2000 ── Persistence
│  ├── T2100 ── Boot/Loader Manipulation
│  ├── T2200 ── Scheduled Task / Cron
│  ├── T2300 ── Service Installation
│  ├── T2400 ── Startup Folder/Registry
│  └── T2900 ── Other Persistence
│
T3000 ── Network
│  ├── T3100 ── HTTP/HTTPS Communication
│  ├── T3110 ── DNS Communication
│  ├── T3120 ── Raw Socket Communication
│  ├── T3130 ── SSL/TLS Manipulation
│  ├── T3140 ── Network Service Exposure
│  ├── T3150 ── Proxy/Tunnel
│  └── T3190 ── C2 Communication Pattern
│
T4000 ── Credential Access
│  ├── T4100 ── Credential Dumping
│  ├── T4110 ── Credential Theft (Browser, Store)
│  ├── T4120 ── Keylogging
│  ├── T4130 ── Token Manipulation
│  └── T4190 ── Credential in Plaintext
│
T5000 ── Secrets
│  ├── T5100 ── Hardcoded Credentials
│  ├── T5110 ── API Token Exposure
│  ├── T5120 ── Private Key Exposure
│  ├── T5130 ── Cryptographic Key Exposure
│  └── T5190 ── Secrets in Configuration
│
T6000 ── Filesystem
│  ├── T6100 ── File Read
│  ├── T6110 ── File Write
│  ├── T6120 ── File Delete
│  ├── T6130 ── File Permission Modification
│  ├── T6140 ── Temporary File Creation
│  ├── T6150 ── Symlink/Shortcut Manipulation
│  └── T6190 ── Path Traversal
│
T7000 ── Registry
│  ├── T7100 ── Registry Read
│  ├── T7110 ── Registry Write
│  ├── T7120 ── Registry Delete
│  └── T7190 ── Registry Permission Modification
│
T8000 ── Process
│  ├── T8100 ── Process Creation
│  ├── T8110 ── Process Termination
│  ├── T8120 ── Process Hollowing
│  ├── T8130 ── DLL/SO Injection
│  └── T8190 ── Process Enumeration
│
T9000 ── Archive
│  ├── T9100 ── Archive Extraction
│  ├── T9110 ── Archive Creation
│  ├── T9120 ── Embedded Archive
│  └── T9190 ── Encrypted/Packed Archive
│
T10000 ── Encoding & Obfuscation
│   ├── T10100 ── Base64 Encoding/Decoding
│   ├── T10110 ── Hex Encoding/Decoding
│   ├── T10120 ── URL Encoding/Decoding
│   ├── T10130 ── String Concatenation/Construction
│   ├── T10140 ── Character Encoding Manipulation
│   ├── T10150 ── XOR/Rot/Simple Cipher
│   ├── T10160 ── Packing/Compression
│   └── T10990 ── Custom Obfuscation
│
T11000 ── Cryptography
│   ├── T11100 ── Weak Hashing Algorithm (MD5, SHA-1)
│   ├── T11110 ── Weak Encryption Algorithm (DES, RC4)
│   ├── T11120 ── Hardcoded Cryptographic Key
│   ├── T11130 ── Hardcoded IV/Nonce
│   ├── T11140 ── Custom Cryptographic Implementation
│   └── T11990 ── Cryptographic Misuse
│
T12000 ── Trust
│   ├── T12100 ── Certificate Validation Bypass
│   ├── T12110 ── Insecure TLS/SSL Configuration
│   ├── T12120 ── Signature Validation Bypass
│   ├── T12130 ── Trust Boundary Violation
│   └── T12990 ── Other Trust Issues
│
T13000 ── Metadata
│   ├── T13100 ── Author/Publisher Information
│   ├── T13110 ── Compilation Timestamps
│   ├── T13120 ── Digital Signature Status
│   ├── T13130 ── File Origin Metadata
│   └── T13990 ── Other Metadata
│
T14000 ── Configuration
│   ├── T14100 ── Debug Mode Enabled
│   ├── T14110 ── Insecure Default Configuration
│   ├── T14120 ── Permissive CORS/Policy
│   ├── T14130 ── World-Writable Resources
│   ├── T14140 ── Unencrypted Communication Configuration
│   └── T14990 ── Other Misconfiguration
│
T15000 ── Privilege
│   ├── T15100 ── Privilege Escalation
│   ├── T15110 ── Privilege Abuse
│   ├── T15120 ── Excessive Permissions
│   └── T15990 ── Other Privilege Issues
│
T16000 ── Environment
│   ├── T16100 ── Environment Variable Access
│   ├── T16110 ── Environment Variable Manipulation
│   ├── T16120 ── Working Directory Manipulation
│   ├── T16130 ── Path Manipulation
│   └── T16990 ── Other Environment Manipulation
│
T90000 ── ── Informational
│   ├── T90100 ── File Type Detection
│   ├── T90110 ── Entropy Detection
│   ├── T90120 ── Language/Platform Detection
│   └── T90990 ── Other Informational
```

### 4.3 Taxonomy Node Specification

Each taxonomy node is defined as:

```typescript
interface TaxonomyNode {
  id: TaxonomyId; // e.g., "T6100"
  name: string; // e.g., "File Read"
  parentId: TaxonomyId | null; // e.g., "T6000"
  description: string;
  severity: Severity | null; // Default severity if unmitigated
  cweIds: string[]; // Related CWE IDs
  owaspCategory: string | null;
  nistControl: string | null;
  keywords: string[]; // Search keywords for matching
  metadata: {
    depth: 0 | 1 | 2 | 3; // Depth in hierarchy
    isAbstract: boolean; // Can behaviors map directly to this node?
    sinceVersion: string; // Taxonomy version when introduced
    deprecated: boolean; // Is this node deprecated?
    supersededBy: TaxonomyId | null; // If deprecated, replacement
  };
}
```

### 4.4 Language-Agnostic Normalization Rules

Every extractor maps language-specific constructs to the taxonomy:

| Language Construct                                        | Normalized Taxonomy Node               |
| --------------------------------------------------------- | -------------------------------------- |
| Python `eval()`, JS `eval()`, Ruby `eval()`               | T1120 — Code Evaluation                |
| PowerShell `Invoke-Expression`                            | T1120 — Code Evaluation                |
| Bash `eval`, `source`                                     | T1110 — Script Execution               |
| Python `open()`, JS `fs.readFileSync()`                   | T6100 — File Read                      |
| Python `os.system()`, `subprocess.run()`                  | T8100 — Process Creation               |
| C `CreateFile()`, `fopen()`                               | T6100 — File Read / T6110 — File Write |
| API key pattern `sk-[a-zA-Z0-9]{20,}`                     | T5110 — API Token Exposure             |
| `btoa()`, `base64.b64encode()`                            | T10100 — Base64 Encoding               |
| `MD5` class reference, `MessageDigest.getInstance("MD5")` | T11100 — Weak Hashing                  |
| URL with `http://` in code                                | T14140 — Unencrypted Communication     |
| `SSL_set_verify(..., SSL_VERIFY_NONE)`                    | T12100 — Certificate Validation Bypass |

**Invariant:** After normalization, downstream consumers (rules, behaviors, findings) operate exclusively on taxonomy IDs, never on language-specific names.

### 4.5 CWE / OWASP / NIST Mappings

Each taxonomy node maps to:

- **CWE:** Common Weakness Enumeration IDs (e.g., T6100 → CWE-73, CWE-22)
- **OWASP:** OWASP Top 10 / ASVS categories (e.g., T5000 → OWASP-A2:2021)
- **NIST:** NIST SP 800-53 controls (e.g., T12000 → SC-8, SC-12)

These mappings are stored in `@veris/knowledge` and are versioned independently.

---

## 5. Object Relationships

### 5.1 Parent-Child Hierarchy

```
ScanSession
└── Artifact (0..N)
    ├── Capability (0..N)
    └── Feature (0..N)
        └── Behavior (0..N)  [derived from 1..N Features]
            └── Evidence (0..N)  [matched by Rule]
                └── Finding (1)  [owning Finding]
```

### 5.2 Reference Graph

```
ScanSession
  ├── id referenced by: Artifact, Feature, Behavior, Evidence,
  │                     Finding, BehaviorChain, TrustProfile,
  │                     RiskProfile, Recommendation, CanonicalReport
  │
Artifact
  ├── id referenced by: Feature (artifactId), Behavior (artifactId),
  │                     Evidence (via Behavior → Feature → Artifact),
  │                     TrustProfile (artifactId)
  │
Feature
  ├── id referenced by: Behavior (featureIds[])
  │
Behavior
  ├── id referenced by: Evidence (behaviorId), BehaviorChain (behaviorIds[]),
  │                     RuleResult (behaviorIds[])
  │
Evidence
  ├── id referenced by: Finding (evidenceIds[])
  │
Rule
  ├── id referenced by: Evidence (ruleId), RuleResult (ruleId),
  │                     Finding (ruleId)
  │
Finding
  ├── id referenced by: Recommendation (findingIds[]),
  │                     BehaviorChain (findingIds[]),
  │                     RiskProfile (topFindings[], riskDrivers[].findingId)
  │
BehaviorChain
  ├── id referenced by: Finding (behaviorChainId)
  │
TrustProfile
  ├── id referenced by: RiskProfile (trustProfileId)
  │
CanonicalReport
  └── Contains all objects as value aggregates
```

### 5.3 Lineage Chains

**Finding Traceability (full chain):**

```
Finding
  → evidenceIds[].Evidence
    → behaviorId.Behavior
      → featureIds[].Feature
        → artifactId.Artifact
          → sessionId.ScanSession
```

**Trust Traceability:**

```
TrustProfile (trustScore)
  → contributingFactors[].factor
    → Finding (via severity/count)
    → BehaviorChain (via chainImpact)
      → Behavior (via behaviorIds)
        → Feature (via featureIds)
```

**Risk Traceability:**

```
RiskProfile (riskScore)
  → riskDrivers[].findingId
    → Finding.severity
    → Finding.evidenceIds[].Evidence.confidence
    → Finding.ruleId.Rule.severity
```

---

## 6. Object Identity

### 6.1 Stable ID Strategy

**Principle:** All IDs must be deterministic and reproducible from the same input. This enables:

- Deduplication across scan runs
- Cross-report references
- Incremental scanning (diffing)
- Distributed analysis (sorted merge)

### 6.2 ID Format

```
<ObjectPrefix>_<SHA256-of-canonical-content>
```

| Object          | Prefix | Content Basis                                                     |
| --------------- | ------ | ----------------------------------------------------------------- |
| ScanSession     | `ss`   | Random session token + timestamp                                  |
| Artifact        | `art`  | Content hash + path normalized                                    |
| Feature         | `feat` | ArtifactId + location + feature type + value hash                 |
| Behavior        | `beh`  | TaxonomyId + all FeatureIds sorted + properties hash              |
| Evidence        | `ev`   | RuleId + BehaviorId + matched properties hash                     |
| Rule            | `rule` | PackId + RuleName (human-readable, not hashed)                    |
| RuleResult      | `rr`   | RuleId + all BehaviorIds sorted                                   |
| Finding         | `fin`  | RuleId + BehaviorChainId (if applicable) + all EvidenceIds sorted |
| BehaviorChain   | `bc`   | All BehaviorIds sorted + relationship type                        |
| TrustProfile    | `tp`   | ArtifactId + session context                                      |
| RiskProfile     | `rp`   | TrustProfileId                                                    |
| Recommendation  | `rec`  | All FindingIds sorted + rule pack metadata                        |
| CanonicalReport | `rep`  | SessionId                                                         |
| Capability      | `cap`  | ArtifactId + capability name + location                           |

**Example:**

```
art_a1b2c3d4e5f6...
feat_7890abcd...
```

### 6.3 UUID vs Deterministic IDs

| When to use UUID                  | When to use Deterministic Hash                  |
| --------------------------------- | ----------------------------------------------- |
| ScanSession (one-time, no replay) | Artifact (content-addressed)                    |
| Temporary internal objects        | Feature (same artifact → same features)         |
| Error/correlation IDs             | Behavior (same features → same behaviors)       |
|                                   | Finding (same evidence → same finding)          |
|                                   | Evidence (same rule + behavior → same evidence) |

**Rule:** Objects that should produce the same output on repeated analysis use deterministic IDs. Objects that are inherently one-per-session use UUIDs.

### 6.4 Cross-Report References

- All deterministic IDs are stable across scan sessions on the same input.
- A Finding ID is stable if the same artifact produces the same matching behaviors.
- Cross-report references use the deterministic ID of the target object.
- A cross-report reference map is computed during report diff.

### 6.5 Merge Behavior

When merging two reports from the same session or overlapping artifacts:

| Scenario                                 | Strategy                                                     |
| ---------------------------------------- | ------------------------------------------------------------ |
| Same deterministic ID, same content      | Deduplicate (keep first)                                     |
| Same deterministic ID, different content | Conflict — use most recent timestamp, flag as inconsistency  |
| Different IDs                            | Keep both                                                    |
| Incremental scan                         | Old findings with no new evidence are marked as `"resolved"` |

### 6.6 Replay Compatibility

A report produced by engine version X can be:

- **Read by** engine version Y where Y >= X (same schema major version)
- **Diffed against** any other report (IDs are deterministic, so matching IDs across versions is valid as long as the algorithm is stable)
- **Upgraded** via a migration script if schema major version changes

---

## 7. Object Lifecycle

```
                        ┌────────────┐
                        │  RULE PACK │ (loaded at startup, immutable)
                        └─────┬──────┘
                              │
┌─────────────┐              │
│ SCAN SESSION│─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ┐
└──────┬──────┘              │             │
       │                     ▼             │
       │              ┌──────────┐         │
       │              │ BEHAVIOR │◄──┐    │
       │              │ CHAIN    │   │    │
       │              └────┬─────┘   │    │
       ▼                   │         │    │
┌──────────┐               │         │    │
│ ARTIFACT │               │         │    │
└────┬─────┘               │         │    │
     │                     │         │    │
     ▼                     │         │    │
┌──────────┐               │         │    │
│ FEATURE  │               │         │    │
└────┬─────┘               │         │    │
     │                     │         │    │
     ▼                     │         │    │
┌──────────┐               │         │    │
│ BEHAVIOR │───────────────┘         │    │
└────┬─────┘                         │    │
     │                               │    │
     ▼                               │    │
┌──────────┐     ┌──────┐           │    │
│ EVIDENCE │◄────│ RULE │           │    │
└────┬─────┘     └──────┘           │    │
     │                               │    │
     ▼                               │    │
┌──────────┐                         │    │
│ FINDING  │─────────────────────────┘    │
└────┬─────┘                              │
     │                                    │
     ▼                                    │
┌──────────────┐                          │
│ TRUST PROFILE│                          │
└──────┬───────┘                          │
       │                                  │
       ▼                                  │
┌──────────────┐                          │
│  RISK PROFILE│                          │
└──────┬───────┘                          │
       │                                  │
       ▼                                  │
┌──────────────┐                          │
│RECOMMENDATION│                          │
└──────┬───────┘                          │
       │                                  │
       ▼                                  │
┌─────────────────┐                       │
│ CANONICAL REPORT│───────────────────────┘
└─────────────────┘
```

**Lifecycle principles:**

1. **Forward flow only.** Once an object is produced, it is consumed by the next stage. No stage revisits previous objects.
2. **All objects are immutable after creation.** No in-place modifications.
3. **Stage boundaries are explicit.** Each stage has a well-defined input type and output type.
4. **Errors are captured at stage boundaries.** If a stage fails, the error is recorded in the ScanSession, and analysis continues with available data.
5. **Pipeline is cancellable.** A stage can be cancelled (via config or timeout) and downstream stages will operate on partial data.

---

## 8. Validation Rules

### 8.1 Object-Level Invariants

| Object            | Invariant                                                                |
| ----------------- | ------------------------------------------------------------------------ |
| **All Objects**   | `id` must be non-empty and unique within its type for the session        |
| **All Objects**   | `sessionId` must match the owning ScanSession                            |
| **ScanSession**   | `completedAt >= startedAt`                                               |
| **ScanSession**   | `durationMs === completedAt - startedAt`                                 |
| **Artifact**      | `size >= 0`                                                              |
| **Artifact**      | `contentHash` must be a valid hex string of the expected hash length     |
| **Artifact**      | If `parentId` is set, the parent Artifact must exist in the same session |
| **Feature**       | `confidence` must be in [0.0, 1.0]                                       |
| **Feature**       | `location` must have valid line/column coordinates                       |
| **Behavior**      | `confidence` must be in [0.0, 1.0]                                       |
| **Behavior**      | `taxonomyId` must be a valid node in the loaded taxonomy                 |
| **Behavior**      | `featureIds` must have at least 1 entry                                  |
| **Evidence**      | `confidence` must be in [0.0, 1.0]                                       |
| **Evidence**      | `ruleId` and `behaviorId` must reference existing objects                |
| **Rule**          | `severity.score` must be in [0.0, 10.0]                                  |
| **Rule**          | `version` must be valid semver                                           |
| **Finding**       | `confidence` must be in [0.0, 1.0]                                       |
| **Finding**       | `evidenceIds` must have at least 1 entry                                 |
| **Finding**       | `severity.score` must be in [0.0, 10.0]                                  |
| **BehaviorChain** | `behaviorIds` must have at least 2 entries                               |
| **TrustProfile**  | `trustScore` must be in [0.0, 1.0]                                       |
| **TrustProfile**  | `findingDensity >= 0`                                                    |
| **RiskProfile**   | `riskScore` must be in [0.0, 10.0]                                       |
| **Capability**    | `confidence` must be in [0.0, 1.0]                                       |

### 8.2 Cross-Object Invariants

| #   | Invariant                                                                               | Rationale                                                          |
| --- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| I1  | Every Finding must have at least one Evidence                                           | A finding without evidence is an assertion, not an analysis result |
| I2  | Every Evidence must reference an existing Behavior                                      | Evidence is the binding between a rule and a behavior              |
| I3  | Every Behavior must have at least one Feature                                           | Behaviors are derived from features                                |
| I4  | Every Feature must reference an existing Artifact                                       | Features are extracted from artifacts                              |
| I5  | Every Artifact must reference an existing ScanSession                                   | Artifacts are scoped to a session                                  |
| I6  | Every Evidence must reference an existing Rule                                          | Evidence proves a rule matched                                     |
| I7  | Every Finding must reference the Rule that produced it                                  | Traceability requires rule source                                  |
| I8  | Every Recommendation must reference at least one Finding                                | Recommendations address findings                                   |
| I9  | Every TrustProfile must reference an Artifact                                           | Trust is per-artifact                                              |
| I10 | Every RiskProfile must reference a TrustProfile                                         | Risk builds on trust                                               |
| I11 | Every Behavior's taxonomyId must exist in the loaded taxonomy                           | No orphan taxonomy references                                      |
| I12 | Every Finding's taxonomyIds must be a subset of the taxonomy loaded                     | No unknown taxonomy mappings                                       |
| I13 | All IDs in a Finding's evidenceIds must resolve to Evidence objects in the same session | No dangling references                                             |
| I14 | Every artifact's contentHash must match a deterministic recomputation                   | Integrity guarantee                                                |

### 8.3 Pipeline Invariants

| #   | Invariant                                                                                                   | Enforcement                                                 |
| --- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| P1  | Raw files are never passed past the Artifact stage                                                          | Type enforcement at pipeline boundaries                     |
| P2  | The AnalysisPipeline must not access AI providers                                                           | Architecture boundary enforced via package dependency graph |
| P3  | Rule matching produces RuleResults, never Findings directly                                                 | Finding construction is a separate stage                    |
| P4  | Feature → Behavior mapping must be injective in practice (one Feature may contribute to multiple Behaviors) | No restriction on mapping cardinality                       |
| P5  | All Behaviors must be classified before Rule matching begins                                                | Stage ordering enforced by pipeline scheduler               |
| P6  | Chain analysis must not begin until all Findings are produced                                               | Stage ordering enforced by pipeline scheduler               |
| P7  | TrustProfile must not be computed until all Chains and Findings are produced                                | Stage ordering enforced by pipeline scheduler               |
| P8  | RiskProfile must not be computed until TrustProfile is produced                                             | Stage ordering enforced by pipeline scheduler               |
| P9  | A RuleResult must not be created without a corresponding Rule loaded                                        | Rule engine validates rule existence                        |
| P10 | No system may produce a Finding without passing through the full pipeline                                   | Architecture boundary enforcement                           |

---

## 9. Versioning Strategy

### 9.1 Schema Versioning

**Schema version format:** `MAJOR.MINOR.PATCH` (semver)

| Component | Changes that increment it                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Major** | Removing a field from a canonical object. Changing a field type incompatibly. Changing the pipeline ordering. Removing a taxonomy top-level category. |
| **Minor** | Adding a new optional field. Adding a new taxonomy node. Adding a new ArtifactType. Adding a new FeatureType. Adding a new ChainRelationshipType.     |
| **Patch** | Adding new validation rules. Relaxing existing validation. Adding new taxonomic mappings. Documentation clarifications.                               |

**Current schema version:** `1.0.0`

### 9.2 Forward/Backward Compatibility

| Scenario                      | Compatibility         | Strategy                                                                |
| ----------------------------- | --------------------- | ----------------------------------------------------------------------- |
| Engine v1.1 reads report v1.0 | ✅ Full backward      | Older schema is a subset of newer                                       |
| Engine v1.0 reads report v1.1 | ✅ Forward (strict)   | New fields are optional; unknown fields are preserved but not processed |
| Engine v2.0 reads report v1.x | ❌ Requires migration | Migration script converts v1 → v2                                       |
| Engine v1.x reads report v2.0 | ❌ Not supported      | Engine refuses to load unknown major version                            |

**Forward compatibility rules:**

- All new fields must be optional (or have sensible defaults).
- No existing field may change type or semantics.
- New taxonomy nodes must not change the meaning of existing nodes.
- The `schemaVersion` field is always the first field in every serialized object.

### 9.3 Migration Strategy

**Automatic migrations:**

- Patch and minor version upgrades are transparent — no migration needed.
- Forward compatibility logic handles new optional fields.

**Scripted migrations (major version bumps):**

- Migration scripts live in `tools/codegen/migrations/`.
- Named `v1-to-v2.ts`, `v2-to-v3.ts`, etc.
- Each script is a pure function: `(ReportV1) => ReportV2`
- Migrations are run offline (not during a scan).
- A report file includes its source schema version so the correct migration can be selected.

**No in-place upgrades:**

- Migration produces a new report file.
- The original is preserved.

---

## 10. Serialization Concerns

### 10.1 Format Strategy

| Concern                         | Decision                                                |
| ------------------------------- | ------------------------------------------------------- |
| **Primary canonical format**    | JSON (for debugging, interoperability)                  |
| **Performance-critical format** | MessagePack (binary, faster, smaller)                   |
| **Streaming format**            | JSON Lines (for large sessions with many artifacts)     |
| **Storage format**              | SQLite (for workspace/database persistence)             |
| **Schema enforcement**          | Zod (runtime validation on deserialization)             |
| **Documentation**               | TypeScript types (compile-time) with JSON Schema export |

### 10.2 Serialization Rules

1. **No circular references.** All relationships are forward-only ID references.
2. **Dates as ISO 8601 strings.** Always in UTC with explicit `Z` suffix.
3. **Hashes as lowercase hex strings.** No Base64 for hashes.
4. **Enums as strings.** Open enums are serialized as plain strings, never integers.
5. **Big numbers as strings.** Numbers > 2^53 are serialized as strings in JSON.
6. **Binary data as base64** (JSON) or raw bytes (MessagePack).
7. **Unknown fields preserved.** Deserializers preserve unrecognized fields for forward compatibility.
8. **Schema version included.** Every serialized object includes `schemaVersion` at the top level.

### 10.3 Size Considerations

| Object                            | Typical Size (JSON)  | Compression Ratio (gzip) |
| --------------------------------- | -------------------- | ------------------------ |
| ScanSession                       | ~1 KB                | 3:1                      |
| Artifact (no content)             | ~512 B               | 3:1                      |
| Artifact (with content)           | Content size + 512 B | Depends on content       |
| Feature                           | ~256 B               | 3:1                      |
| Behavior                          | ~256 B               | 3:1                      |
| Evidence                          | ~384 B               | 3:1                      |
| Finding                           | ~1 KB                | 3:1                      |
| CanonicalReport (100 findings)    | ~500 KB              | 5:1                      |
| CanonicalReport (10,000 findings) | ~50 MB               | 5:1                      |

---

## 11. Engineering Tradeoffs

### 11.1 Deterministic IDs vs. UUIDs

**Tradeoff:** Deterministic IDs require hashing all input content, which adds CPU overhead. UUIDs are cheaper but prevent deduplication and cross-session diffing.

**Decision:** Use deterministic IDs for content-derived objects (Artifact, Feature, Behavior, Evidence, Finding). Use UUIDs only for session-scoped objects (ScanSession, temporary intermediates).

### 11.2 Deep Object Hierarchy vs. Flat Structure

**Tradeoff:** A deep hierarchy (ScanSession → Artifact → Feature → Behavior → Evidence → Finding) provides clear boundaries and traceability but adds indirection and memory overhead.

**Decision:** Accept the overhead. The hierarchy is critical for explainability and traceability. Optimize with:

- Lazy loading of sub-objects in streaming scenarios
- Batch loading in in-memory scenarios
- Index maps for O(1) lookups

### 11.3 Open Enums vs. Closed Enums

**Tradeoff:** Open enums (string unions + registries) are extensible but lose compile-time exhaustiveness checking. Closed enums (TypeScript union types) have full type safety but require code changes to extend.

**Decision:** Use open enums for all taxonomy categories (ArtifactType, FeatureType, Behavior taxonomy, ChainRelationshipType, CapabilityCategory). Coupled with:

- A registry pattern for validation
- TypeScript branded types for type safety at compile time
- Zod schemas for runtime validation

### 11.4 Rich Objects vs. Lean Objects

**Tradeoff:** Rich objects with embedded context reduce indirection (fewer lookups) but increase memory and serialization size. Lean objects with ID-based references are smaller but require more lookups.

**Decision:** Lean objects with ID references. Rich context is provided through:

- The `properties` map (extensible)
- The line of sight up the parent chain via IDs
- Batch resolvers that resolve multiple IDs in one pass

### 11.5 Full Report vs. Incremental Report

**Tradeoff:** Full reports are self-contained but large. Incremental reports are smaller but require a base report for context.

**Decision:** Always produce full canonical reports. Incremental diffs are computed at the exporter/renderer level, not at the data model level. This keeps the data model simple.

---

## 12. Common Mistakes to Avoid

### 12.1 Behaviors as Findings

**Mistake:** Treating every Behavior as a Finding. Behaviors are normalized observations; Findings are analytical conclusions with evidence and severity.

**Prevention:** A Behavior becomes a Finding only when a Rule matches. No direct Behavior → Finding path.

### 12.2 Over-Taxonomizing

**Mistake:** Creating taxonomy nodes for every possible pattern, resulting in thousands of nodes and an unmaintainable taxonomy.

**Prevention:** Max depth 3. Max ~100 nodes per category. A node should represent a meaningful behavioral category that rules map to. If a pattern is too specific, it belongs in a rule, not the taxonomy.

### 12.3 Circular Object References

**Mistake:** Objects directly containing their parent objects (e.g., Feature containing an Artifact object), creating circular references during serialization.

**Prevention:** All references are forward-only IDs. No object contains another object. The CanonicalReport is the single aggregate root.

### 12.4 Inline Content in Artifacts

**Mistake:** Storing the full file content in every Artifact object, making reports enormous.

**Prevention:** Artifacts store `contentHash` only. Actual content is stored separately (inline for small files in self-contained reports, referenced for large files).

### 12.5 Mixing AI into Analysis Objects

**Mistake:** Adding AI-specific fields to analysis objects (e.g., `aiConfidence`, `llmExplanation` on Findings), polluting the deterministic model.

**Prevention:** AI outputs live in a separate parallel structure consumed by renderers, never in the canonical data model.

### 12.6 Mutable Objects for Performance

**Mistake:** Making objects mutable to avoid allocation overhead, breaking traceability and replay.

**Prevention:** All objects are immutable. Use builders/factories for construction. Memory is cheaper than debugging non-determinism.

### 12.7 Taxonomy Inconsistency

**Mistake:** Different extractors mapping the same behavior to different taxonomy nodes, breaking cross-language analysis.

**Prevention:** Every extractor implementation must include taxonomy mapping tests that assert the correct taxonomy ID for known patterns. These tests are run in CI.

### 12.8 Ignoring Schema Version

**Mistake:** Not including schema version in serialized objects, making future migrations impossible.

**Prevention:** Every serialized object must include `schemaVersion` as the first field. Deserialization validates it.

---

## 13. Final Recommendations

### 13.1 Implementation Order

| Phase          | Objects                                                          | Rationale                                                 |
| -------------- | ---------------------------------------------------------------- | --------------------------------------------------------- |
| **Phase 1**    | `Artifact`, `Feature`, `Behavior`, `Capability`, `TaxonomyNode`  | Foundation — needed by extractors and behavior classifier |
| **Phase 2**    | `Rule`, `RuleResult`, `Evidence`, `Finding`                      | Core analysis objects                                     |
| **Phase 3**    | `BehaviorChain`, `TrustProfile`, `RiskProfile`, `Recommendation` | Higher-order analysis                                     |
| **Phase 4**    | `ScanSession`, `CanonicalReport`                                 | Aggregation and serialization                             |
| **Continuous** | Taxonomy updates, validation rules, migration scripts            | V1 refinement                                             |

### 13.2 Critical Success Factors

1. **Factory functions first.** Before implementing any analysis logic, write factory functions for every canonical object with full validation. This catches design flaws early.
2. **Taxonomy before extractors.** Finalize the taxonomy tree before writing any extractor. Extractors map to the taxonomy; if the taxonomy isn't stable, extractors will churn.
3. **Test the complete chain.** End-to-end tests should exercise the full pipeline: artifact → feature → behavior → evidence → finding → report.
4. **Immutable from day one.** Enforce immutability in TypeScript with `readonly` modifiers and `ReadonlyArray`. The performance cost is negligible.
5. **Schema version on every object.** This is the single most important future-proofing decision in the data model.
6. **Traceability is the killer feature.** Every design decision should be evaluated against "can we answer 'why was this flagged?' for every finding?"

### 13.3 Architectural Invariants

```
1. All objects are immutable after creation.
2. IDs are deterministic for content-derived objects.
3. Every Finding traces back to Evidence → Behavior → Feature → Artifact.
4. Behaviors use taxonomy vocabulary only — no language-specific terms.
5. No circular references. All relationships are forward-only IDs.
6. Every serialized object carries schemaVersion.
7. AI is never in the analysis pipeline or canonical objects.
8. Taxonomy is open and extensible, never closed.
9. Pipeline stages are ordered and non-skippable.
10. Everything works offline with no network dependencies.
```

---

_End of SPEC-002. This document describes the frozen canonical data model and knowledge taxonomy for VERIS V1 through V4._
