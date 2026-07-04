# VERIS Architecture Constitution, Production Readiness & Scope Freeze — SPEC-010

**Status:** Final — Constitutional Document  
**Version:** 1.0  
**Applies to:** Architecture governance, scope freeze, technical debt register, ADR/RFC policy, release readiness, success metrics, long-term evolution rules.  
**Scope:** V1 through V4. This document is the single source of truth for what is and is not part of VERIS.

---

## Table of Contents

1. [Architecture Audit](#1-architecture-audit)
2. [Cross-Spec Validation Matrix](#2-cross-spec-validation-matrix)
3. [Permanent Architectural Invariants](#3-permanent-architectural-invariants)
4. [Scope Freeze](#4-scope-freeze)
5. [Technical Debt Register](#5-technical-debt-register)
6. [Known Limitations](#6-known-limitations)
7. [Architecture Decision Record (ADR) Policy](#7-architecture-decision-record-adr-policy)
8. [RFC Process](#8-rfc-process)
9. [Release Readiness Checklist](#9-release-readiness-checklist)
10. [Success Metrics](#10-success-metrics)
11. [Long-Term Evolution Rules](#11-long-term-evolution-rules)
12. [Final Principal Engineer Assessment](#12-final-principal-engineer-assessment)

---

## 1. Architecture Audit

### 1.1 Audit Methodology

Each of the 9 prior specifications (SPEC-001 through SPEC-009) was audited against 10 dimensions:

| Dimension                  | Description                                                     |
| -------------------------- | --------------------------------------------------------------- |
| **Dependency consistency** | Do declared dependencies match actual usage across specs?       |
| **Layer isolation**        | Are layer boundaries respected in all cross-package references? |
| **Pipeline ordering**      | Does the analysis pipeline have a single, unambiguous order?    |
| **Data flow**              | Is data flow unidirectional and typed at every stage?           |
| **Object ownership**       | Does every canonical object have a clear owner?                 |
| **Package boundaries**     | Are package responsibilities non-overlapping?                   |
| **Plugin boundaries**      | What can and cannot plugins do? Is this unambiguous?            |
| **Renderer boundaries**    | Do renderers only consume reports, never analyze?               |
| **AI boundaries**          | Is AI strictly a consumer, never an analyst?                    |
| **Determinism guarantees** | Are all sources of non-determinism identified and prohibited?   |

### 1.2 Audit Results by Specification

#### SPEC-001 — Repository Architecture

| Dimension              | Verdict | Issues                                                               |
| ---------------------- | ------- | -------------------------------------------------------------------- |
| Dependency consistency | ✅ PASS | All package dependency tables match the dependency diagram           |
| Layer isolation        | ✅ PASS | L0–L7 layers are strictly defined with downward-only dependencies    |
| Pipeline ordering      | ✅ PASS | Pipeline is abstract (not detailed) but references SPEC-002 ordering |
| Data flow              | ✅ PASS | Interfaces at every boundary, DI at composition root                 |
| Object ownership       | ✅ PASS | Every package owns its types and exports                             |
| Package boundaries     | ✅ PASS | No overlapping responsibilities                                      |
| Plugin boundaries      | ✅ PASS | Layer 7 is explicitly marked as "future" — thin V1 shell             |
| Renderer boundaries    | ✅ PASS | Renderers are assigned to Layer 4 (Report & Output)                  |
| AI boundaries          | ✅ PASS | AI is explicitly Layer 1 (Framework) — consumer only                 |
| Determinism guarantees | ✅ PASS | Determinism is stated as a principle but enforced in SPEC-008        |

**Findings:** None. SPEC-001 is internally consistent.

---

#### SPEC-002 — Canonical Data Model & Knowledge Taxonomy

| Dimension              | Verdict  | Issues                                                                                                                            |
| ---------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Dependency consistency | ✅ PASS  | All 14 canonical objects reference each other via IDs only — no circular references                                               |
| Layer isolation        | ✅ PASS  | Objects belong to data model layer; no leakage into analysis logic                                                                |
| Pipeline ordering      | ✅ PASS  | Pipeline overview (§1) and lifecycle (§7) both show same order                                                                    |
| Data flow              | ✅ PASS  | Unidirectional: ScanSession → Artifact → Feature → Behavior → Evidence → Finding → Chain → Trust → Risk → Recommendation → Report |
| Object ownership       | ✅ PASS  | Every object has an owning package (core for types, analyzer for engines)                                                         |
| Package boundaries     | ✅ PASS  | Data model is in core; engines are in analyzer                                                                                    |
| Plugin boundaries      | ✅ PASS  | Objects are immutable — plugins cannot modify them                                                                                |
| Renderer boundaries    | ✅ PASS  | Renderers consume CanonicalReport, never produce it                                                                               |
| AI boundaries          | ✅ PASS  | §3.12 Recommendation and §3.13 Report explicitly exclude AI from canonical objects                                                |
| Determinism guarantees | ⚠️ MINOR | §2.1 states determinism but §6.2 uses SHA-256 for IDs — hash choice should be documented as a permanent decision                  |

**Issue I-001:** Hash algorithm for deterministic IDs is not documented as a permanent choice. SPEC-002 §6.2 lists SHA-256 as the primary hash but doesn't specify whether this is frozen or subject to change (e.g., to BLAKE3).

**Resolution:** Freeze SHA-256 as the deterministic ID hash for V1. Documentation update required in SPEC-002 §6.2 to mark the hash algorithm as permanent. BLAKE3 may be added as an alternative in V2 but SHA-256 remains the canonical hash.

---

#### SPEC-003 — Rule Engine, Correlation Engine & Reasoning Engine

| Dimension              | Verdict | Issues                                                                            |
| ---------------------- | ------- | --------------------------------------------------------------------------------- |
| Dependency consistency | ✅ PASS | Rule engine depends on knowledge (types only), which aligns with SPEC-001         |
| Layer isolation        | ✅ PASS | Rule engine is Layer 2, correlation/trust/risk are Layer 3 — clear separation     |
| Pipeline ordering      | ✅ PASS | §1 pipeline diagram matches SPEC-002 ordering                                     |
| Data flow              | ✅ PASS | Unidirectional: Behavior → Evidence → RuleResult → Finding → Chain                |
| Object ownership       | ✅ PASS | Rule engine owns RuleResult; analyzer owns Finding construction                   |
| Package boundaries     | ✅ PASS | `@veris/rules-engine` vs `@veris/rules` — engine vs content — correctly separated |
| Plugin boundaries      | ✅ PASS | §8.4 packs are loadable; §12.1 plugin rules are future                            |
| Renderer boundaries    | ✅ PASS | No renderer dependencies                                                          |
| AI boundaries          | ✅ PASS | §7.7 AI consumers read `AIReadyContext` — never modify canonical objects          |
| Determinism guarantees | ✅ PASS | §14.3 explicitly prohibits non-deterministic rules (random, time, network)        |

**Findings:** None. SPEC-003 is internally consistent. The rule logic discriminated union (§3.3) is comprehensive and declarative.

---

#### SPEC-004 — Extraction Framework

| Dimension              | Verdict | Issues                                                                                      |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------- |
| Dependency consistency | ✅ PASS | Extractors depend on core, shared, logger, config — per SPEC-001                            |
| Layer isolation        | ✅ PASS | Extractors are Layer 2; they produce Features, never Findings                               |
| Pipeline ordering      | ✅ PASS | §1 pipeline matches SPEC-002 ordering                                                       |
| Data flow              | ✅ PASS | Unidirectional: RawArtifact → ClassifiedArtifact → ExtractionResult → Feature[]             |
| Object ownership       | ✅ PASS | ExtractorRegistry owns extractor lifecycle; ExtractionResult is per-extractor               |
| Package boundaries     | ✅ PASS | Built-in extractors are flat under `builtins/`; each extractor is independently replaceable |
| Plugin boundaries      | ✅ PASS | §11.4 plugin extractors follow same `Extractor` interface                                   |
| Renderer boundaries    | ✅ PASS | No renderer dependencies                                                                    |
| AI boundaries          | ✅ PASS | No AI references                                                                            |
| Determinism guarantees | ✅ PASS | §2.6 explicitly states determinism: "same file, same extractor version = same Features"     |

**Finding I-002:** SPEC-004 §6.1 lists supported script extractors (Python, JS, TS, PowerShell, Bash, Batch, VBScript) but §11.1 (Future Compatibility) adds Rust, Go, Java, C#, C++, Lua, Ruby, Swift, Kotlin. There is no explicit guidance on how to prioritize which language extractors to build first after V1.

**Resolution:** Add prioritization criteria: (1) community demand signals, (2) security incident frequency in the language ecosystem, (3) parser library availability. Python and JavaScript are V1. Rust and Go are V2. Java and C# follow in V2. C++ is V3 due to parser complexity.

---

#### SPEC-005 — Risk, Trust & Confidence Model

| Dimension              | Verdict | Issues                                                                       |
| ---------------------- | ------- | ---------------------------------------------------------------------------- |
| Dependency consistency | ✅ PASS | Risk engine builds on trust engine, which builds on findings — correct       |
| Layer isolation        | ✅ PASS | All scoring engines are within `@veris/analyzer` — Layer 3                   |
| Pipeline ordering      | ✅ PASS | Confidence → Risk → Trust order from SPEC-003 §1 confirmed                   |
| Data flow              | ✅ PASS | Evidence → Confidence → Risk → Trust — unidirectional                        |
| Object ownership       | ✅ PASS | RiskProfile, TrustProfile, ConfidenceExplanation are owned by analyzer       |
| Package boundaries     | ✅ PASS | Scoring is in analyzer, not a separate package — correct for V1              |
| Plugin boundaries      | ✅ PASS | §12.2 Policy modifiers adjust presentation, never base scores                |
| Renderer boundaries    | ✅ PASS | Renderers consume scores as part of CanonicalReport                          |
| AI boundaries          | ✅ PASS | §1.2 explicitly: "VERIS does not use AI for scoring"                         |
| Determinism guarantees | ✅ PASS | §2.4 "If input A == input B, then score(A) == score(B)" — explicit guarantee |

**Findings:** None. SPEC-005 is the most mathematically rigorous spec. The multiplicative confidence formula, tanh saturation, and risk density model are all well-specified.

---

#### SPEC-006 — Terminal UX, Rendering & Report System

| Dimension              | Verdict  | Issues                                                                                                                                                               |
| ---------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency consistency | ✅ PASS  | Renderers depend on report model, core types — per SPEC-001                                                                                                          |
| Layer isolation        | ✅ PASS  | Renderers are cross-cutting; they consume CanonicalReport                                                                                                            |
| Pipeline ordering      | ✅ PASS  | Rendering is the final stage — after report construction                                                                                                             |
| Data flow              | ✅ PASS  | Unidirectional: CanonicalReport → Renderer → Output                                                                                                                  |
| Object ownership       | ✅ PASS  | `@veris/renderers` owns all renderer implementations                                                                                                                 |
| Package boundaries     | ✅ PASS  | Renderers are separate from exporters; renderers produce visual output, exporters produce data interchange formats                                                   |
| Plugin boundaries      | ✅ PASS  | §4.5 renderer plugins implement same `Renderer` interface                                                                                                            |
| Renderer boundaries    | ✅ PASS  | SPEC-006 §1.3: "Renderers consume the Canonical Report only. No renderer performs analysis." — explicit                                                              |
| AI boundaries          | ✅ PASS  | §14 AI Context Export is read-only for AI services                                                                                                                   |
| Determinism guarantees | ⚠️ MINOR | §16 performance budgets reference frame rates and render times, but the spec doesn't explicitly state that visual output must be deterministic given the same report |

**Issue I-003:** SPEC-006 does not explicitly guarantee that the same CanonicalReport produces identical visual output. While the spec implies determinism (no randomness), it's not stated as an invariant.

**Resolution:** Add determinism guarantee: "Given the same CanonicalReport and same render options, every renderer must produce byte-identical output." This affects HTML, Markdown, and AI Context exporters. JSON/SARIF/CSV are already deterministic by nature.

---

#### SPEC-007 — Plugin SDK, Configuration & Extension Architecture

| Dimension              | Verdict | Issues                                                                              |
| ---------------------- | ------- | ----------------------------------------------------------------------------------- |
| Dependency consistency | ✅ PASS | Plugin host depends on core, shared, logger, config — per SPEC-001                  |
| Layer isolation        | ✅ PASS | Plugins are Layer 7 — above all core layers                                         |
| Pipeline ordering      | ✅ PASS | Plugins hook into pipeline via approved extension points, never reorder stages      |
| Data flow              | ✅ PASS | Plugins read canonical objects, never write them                                    |
| Object ownership       | ✅ PASS | `@veris/plugins` owns plugin lifecycle; `@veris/plugin-sdk` is published separately |
| Package boundaries     | ✅ PASS | Plugin host is separate from plugin SDK — clear boundary                            |
| Plugin boundaries      | ✅ PASS | §1.1: "The Core is Inviolable" — explicit list of what plugins cannot do            |
| Renderer boundaries    | ✅ PASS | §4.5 renderer plugins implement `Renderer` interface                                |
| AI boundaries          | ✅ PASS | §4.6 AI Consumer plugins consume `AIReadyContext` — never produce it                |
| Determinism guarantees | ✅ PASS | §1.3 "Plugins must not introduce non-determinism" — explicit                        |

**Finding I-004:** SPEC-007 §3.2 defines `PluginLifecycle` but does not define what happens when a plugin is installed mid-scan (hot-reload). The spec assumes plugins are loaded at startup only.

**Resolution:** V1 does not support hot-reload. Document this as a known limitation. V2 may add hot-reload support. The lifecycle interface is designed to support it but the host does not implement it in V1.

---

#### SPEC-008 — Testing, Performance & Security Hardening

| Dimension              | Verdict | Issues                                                                 |
| ---------------------- | ------- | ---------------------------------------------------------------------- |
| Dependency consistency | ✅ PASS | Testing infra depends on all packages — correct                        |
| Layer isolation        | ✅ PASS | Testing is infrastructure, not part of the production dependency graph |
| Pipeline ordering      | ✅ PASS | Tests follow the pipeline order for integration tests                  |
| Data flow              | ✅ PASS | Tests validate data flow, they don't participate in it                 |
| Object ownership       | ✅ PASS | Testing infrastructure is in `tools/`, not in `packages/`              |
| Package boundaries     | ✅ PASS | Tests are colocated with packages (`__tests__/`)                       |
| Plugin boundaries      | ✅ PASS | §6.1.13 includes plugin abuse hardening                                |
| Renderer boundaries    | ✅ PASS | Hardening §6.1.9 covers terminal escape injection                      |
| AI boundaries          | ✅ PASS | No AI references in testing                                            |
| Determinism guarantees | ✅ PASS | §2.8 double-run validation is explicit and thorough                    |

**Findings:** None. SPEC-008 is comprehensive. The hardening specifications (§6.1) covering zip bombs, tar bombs, billion laughs, symlink loops, infinite recursion, malformed headers, path traversal, resource exhaustion, terminal escape injection, and unicode spoofing are thorough and well-structured.

---

#### SPEC-009 — Implementation Blueprint

| Dimension              | Verdict | Issues                                                                  |
| ---------------------- | ------- | ----------------------------------------------------------------------- |
| Dependency consistency | ✅ PASS | Sprint plan respects package dependency order                           |
| Layer isolation        | ✅ PASS | Sprints build layers in order (L0 → L1 → L2 → L3 → L4 → L5 → L6 → L7)   |
| Pipeline ordering      | ✅ PASS | Pipeline is built as a whole entity in Sprint 7                         |
| Data flow              | ✅ PASS | Sprint plan builds components in data-flow order                        |
| Object ownership       | ✅ PASS | Package responsibilities are preserved from SPEC-001                    |
| Package boundaries     | ✅ PASS | Each sprint builds specific packages — no boundary violations           |
| Plugin boundaries      | ✅ PASS | Plugins are Sprint 12 (thin V1 shell) — correct prioritization          |
| Renderer boundaries    | ✅ PASS | Renderers are Sprint 10 — after report/export (Sprint 9)                |
| AI boundaries          | ✅ PASS | AI is listed as Continuous (throughout) after analysis stable — correct |
| Determinism guarantees | ✅ PASS | Every sprint includes determinism validation gates                      |

**Findings:** None. SPEC-009 is consistent with all prior specs.

### 1.3 Audit Summary

| Spec                                  | Result  | Issues Found                    |
| ------------------------------------- | ------- | ------------------------------- |
| SPEC-001 — Repository Architecture    | ✅ PASS | 0                               |
| SPEC-002 — Data Model & Taxonomy      | ✅ PASS | 1 (I-001: hash algorithm)       |
| SPEC-003 — Rule Engine & Correlation  | ✅ PASS | 0                               |
| SPEC-004 — Extraction Framework       | ✅ PASS | 1 (I-002: extractor priority)   |
| SPEC-005 — Risk, Trust & Confidence   | ✅ PASS | 0                               |
| SPEC-006 — Terminal UX & Rendering    | ✅ PASS | 1 (I-003: renderer determinism) |
| SPEC-007 — Plugin SDK & Configuration | ✅ PASS | 1 (I-004: hot-reload)           |
| SPEC-008 — Testing & Security         | ✅ PASS | 0                               |
| SPEC-009 — Implementation Blueprint   | ✅ PASS | 0                               |

**Total Issues:** 4 (all minor, all resolved in this document)

---

## 2. Cross-Spec Validation Matrix

### 2.1 Spec Dependency Graph

```
SPEC-001 (Repo Architecture)
  │
  ├── SPEC-002 (Data Model) ── provides types used by all downstream specs
  │     │
  │     ├── SPEC-003 (Rule Engine) ── uses canonical Rule, Behavior, Evidence, Finding
  │     │     │
  │     │     ├── SPEC-005 (Risk/Trust) ── uses Finding, Behavior, Evidence, TrustProfile, RiskProfile
  │     │     │     │
  │     │     │     └── SPEC-006 (UX/Reports) ── consumes CanonicalReport
  │     │     │
  │     │     └── SPEC-004 (Extraction) ── produces Feature, Behavior (consumed by SPEC-003)
  │     │
  │     ├── SPEC-007 (Plugins) ── uses core types, extends with plugin contracts
  │     │
  │     └── SPEC-008 (Testing) ── validates all specs
  │
  ├── SPEC-009 (Blueprint) ── organizes implementation order of all specs
  │
  └── SPEC-010 (Constitution) ── governs all specs
```

### 2.2 Full Cross-Spec Validation Matrix

| #   | Contract / Object                         | Defined In                                           | Used By                                      | Validated In | Extension Point                 |
| --- | ----------------------------------------- | ---------------------------------------------------- | -------------------------------------------- | ------------ | ------------------------------- |
| C01 | Canonical types (Artifact, Feature, etc.) | SPEC-002 §3                                          | All specs                                    | SPEC-008 §2  | Open enums via registry         |
| C02 | Error hierarchy (VerisError)              | SPEC-001 §2                                          | SPEC-003, SPEC-004, SPEC-007                 | SPEC-008 §2  | Subclass via @veris/core/errors |
| C03 | Constants (limits, platform)              | SPEC-001 §2                                          | SPEC-004, SPEC-008                           | SPEC-008 §2  | New constants additive          |
| C04 | Result<T,E> monad                         | SPEC-001 §7                                          | SPEC-003, SPEC-004, SPEC-005                 | SPEC-008 §2  | None (utility)                  |
| C05 | Logger interface                          | SPEC-001 §3                                          | SPEC-003, SPEC-004, SPEC-005, SPEC-007       | SPEC-008 §9  | New transports                  |
| C06 | Config schema                             | SPEC-007 §7                                          | All packages                                 | SPEC-008 §2  | New config sections             |
| C07 | Knowledge taxonomy                        | SPEC-002 §4                                          | SPEC-003, SPEC-004                           | SPEC-008 §4  | New taxonomy nodes              |
| C08 | Extractor interface                       | SPEC-004 §5                                          | SPEC-003 (via Features), SPEC-007 (plugins)  | SPEC-008 §2  | New extractor types             |
| C09 | RuleDefinition                            | SPEC-003 §3                                          | SPEC-005 (scoring), SPEC-007 (plugins)       | SPEC-008 §4  | New matcher types               |
| C10 | RuleMatcher                               | SPEC-003 §9                                          | SPEC-003 engine                              | SPEC-008 §2  | New matcher implementations     |
| C11 | Evaluation sandbox                        | SPEC-003 §10                                         | SPEC-003 engine                              | SPEC-008 §5  | Restricted — no extension       |
| C12 | RuleScheduler                             | SPEC-003 §11                                         | SPEC-003 engine                              | SPEC-008 §2  | Configurable priority           |
| C13 | CorrelationEngine                         | SPEC-003 §4                                          | SPEC-005 (scoring)                           | SPEC-008 §2  | New correlation strategies      |
| C14 | TrustEngine                               | SPEC-005 §5                                          | SPEC-005 (Risk)                              | SPEC-008 §2  | New trust dimensions            |
| C15 | RiskEngine                                | SPEC-005 §4                                          | SPEC-006 (report)                            | SPEC-008 §2  | New risk dimensions             |
| C16 | ConfidenceEngine                          | SPEC-005 §3                                          | SPEC-005 (Risk, Trust)                       | SPEC-008 §2  | None — frozen formula           |
| C17 | CanonicalReport                           | SPEC-002 §3                                          | SPEC-006 (all renderers), SPEC-007 (plugins) | SPEC-008 §4  | New optional fields             |
| C18 | ReportBuilder                             | SPEC-001 §3 (sketch) / SPEC-006 §12                  | SPEC-006 (exporters)                         | SPEC-008 §2  | None — internal                 |
| C19 | Renderer interface                        | SPEC-006 §2                                          | SPEC-007 (plugins)                           | SPEC-008 §2  | New renderer types              |
| C20 | Exporter interface                        | SPEC-006 §13                                         | SPEC-007 (plugins)                           | SPEC-008 §2  | New export formats              |
| C21 | Plugin interface                          | SPEC-007 §4                                          | Plugin host                                  | SPEC-008 §2  | New plugin types (V2+)          |
| C22 | PluginManifest                            | SPEC-007 §6                                          | Plugin host                                  | SPEC-008 §2  | New manifest fields             |
| C23 | Config hierarchy                          | SPEC-007 §7                                          | All packages                                 | SPEC-008 §2  | New config levels (rare)        |
| C24 | Policy engine                             | SPEC-007 §9                                          | CLI                                          | SPEC-008 §2  | New policy rules                |
| C25 | ScanProfile                               | SPEC-007 §8                                          | CLI                                          | SPEC-008 §2  | New profiles                    |
| C26 | Permission model                          | SPEC-007 §10                                         | Plugin host                                  | SPEC-008 §2  | New permission IDs              |
| C27 | Pipeline stages                           | SPEC-002 §1, SPEC-003 §1, SPEC-004 §1, SPEC-009 §4.4 | All analysis                                 | SPEC-008 §2  | None — frozen order             |
| C28 | Thread model                              | SPEC-008 §7                                          | Analyzer                                     | SPEC-008 §8  | Configurable pool size          |

### 2.3 Invariant Cross-References

| Invariant                                  | Source         | Re-enforced In                                   | Validated By  |
| ------------------------------------------ | -------------- | ------------------------------------------------ | ------------- |
| Deterministic analysis                     | SPEC-002 §2.1  | SPEC-003 §2, SPEC-005 §1.1, SPEC-009 §1.2        | SPEC-008 §2.8 |
| AI never participates in analysis          | SPEC-001 §17.4 | SPEC-002 §13.5, SPEC-003 §14.10, SPEC-005 §14.10 | SPEC-007 §4.6 |
| Immutable canonical objects                | SPEC-002 §2.3  | SPEC-002 §7                                      | SPEC-008 §2.3 |
| Extractors produce Features only           | SPEC-004 §2.1  | SPEC-004 §13.1                                   | SPEC-008 §2.5 |
| Rules consume Behaviors only               | SPEC-003 §2.1  | SPEC-003 §14.1                                   | SPEC-008 §2.5 |
| Renderers never analyze                    | SPEC-006 §1.3  | SPEC-006 §2.2                                    | SPEC-008 §2.5 |
| Plugins never modify canonical reports     | SPEC-007 §1.1  | SPEC-007 §4.2                                    | SPEC-008 §2.9 |
| Risk, Trust, Confidence remain independent | SPEC-005 §1.3  | SPEC-005 §4.1                                    | SPEC-008 §2.6 |
| Every finding must be explainable          | SPEC-002 §2.2  | SPEC-003 §2.2                                    | SPEC-008 §2.6 |
| Every score must be reproducible           | SPEC-005 §1.1  | SPEC-005 §2.4                                    | SPEC-008 §2.8 |

### 2.4 Forbidden Dependencies

| Forbidden Pattern                            | Source         | Enforcement                         |
| -------------------------------------------- | -------------- | ----------------------------------- |
| `@veris/core` importing any monorepo package | SPEC-001 §5.1  | TypeScript project references + CI  |
| Circular package imports                     | SPEC-001 §5.1  | `madge` in CI                       |
| Extractors importing Findings                | SPEC-004 §13.1 | TypeScript type enforcement         |
| Rules importing raw file content             | SPEC-003 §14.1 | Interface design                    |
| Renderers importing analysis logic           | SPEC-006 §1.3  | Package boundary + code review      |
| Plugins modifying canonical objects          | SPEC-007 §1.1  | Interface design + permission model |
| AI in analysis pipeline                      | SPEC-001 §17.4 | Package dependency graph            |
| L0 packages importing L1+ packages           | SPEC-001 §5.2  | TypeScript project references       |
| Upward dependencies (L3 → L2 reversed)       | SPEC-001 §5.2  | `madge` in CI                       |

---

## 3. Permanent Architectural Invariants

### 3.1 The Constitution of VERIS

The following invariants are **permanent**. They cannot be changed without a new major architecture specification. They apply to V1 through V4.

### 3.2 Invariant Categories

| Category               | Count | Scope                              |
| ---------------------- | ----- | ---------------------------------- |
| **Foundation**         | 5     | Core properties of the system      |
| **Data Model**         | 5     | Object lifecycle and relationships |
| **Analysis**           | 5     | Pipeline behavior                  |
| **Extraction**         | 3     | Extractor boundaries               |
| **Scoring**            | 5     | Risk, Trust, Confidence            |
| **UX & Rendering**     | 3     | Output boundaries                  |
| **Plugins**            | 3     | Extension boundaries               |
| **Testing & Security** | 3     | Quality enforcement                |
| **Evolution**          | 3     | How VERIS may change               |

### 3.3 Definitive Invariant List

#### FOUNDATION — Core Properties

```
F1. @veris/core imports nothing from the monorepo. It has zero production dependencies.
    Rationale: Every package depends on core. If core had dependencies, all packages would share them,
    creating implicit coupling. Core must remain dependency-free to preserve layer isolation.

F2. Dependencies flow downward only. A package may only depend on packages in its own layer or lower.
    No upward or lateral dependencies between sibling packages unless mediated by a lower-layer interface.
    Rationale: Upward dependencies create cycles. Lateral dependencies between siblings create implicit
    coupling that bypasses layer architecture.

F3. No circular dependencies between packages. This is enforced by tooling (madge) in CI.
    Rationale: Circular dependencies make the system impossible to reason about, test, or deploy
    incrementally. They are the primary source of architectural rot.

F4. All analysis is deterministic. Given the same input (files, rules, taxonomy, configuration),
    the engine must produce identical output. No randomness, no non-determinism, no AI approximation.
    Rationale: Determinism is VERIS's core value proposition. Without it, findings cannot be reproduced,
    audits cannot be trusted, and regression testing is meaningless.

F5. Everything works fully offline. All core analysis paths must function without network access.
    AI, telemetry, reputation services, and remote plugins are optional enhancements that gracefully
    degrade when unavailable.
    Rationale: VERIS analyzes untrusted code. Network access during analysis is a security risk and
    a reliability liability. Offline-first is non-negotiable.
```

#### DATA MODEL — Object Lifecycle and Relationships

```
D1. Canonical objects are immutable after creation. No object may be modified after it is produced.
    Modification requires producing a new version of the object.
    Rationale: Immutability enables caching, replay, diffing, distributed analysis, and thread safety.
    Mutable objects are the #1 source of non-determinism and concurrency bugs.

D2. IDs are deterministic for content-derived objects (Artifact, Feature, Behavior, Evidence, Finding).
    UUIDs are used only for session-scoped objects (ScanSession).
    Rationale: Deterministic IDs enable deduplication across scan runs, cross-report references,
    incremental scanning, and distributed analysis. SHA-256 is the canonical hash algorithm.

D3. Every Finding must trace back through Evidence → Behavior → Feature → Artifact → ScanSession.
    This traceability chain is non-negotiable. A Finding without a complete chain is invalid.
    Rationale: Explainability requires full provenance. Every finding must answer "why was this flagged?"
    through a complete, verifiable chain of evidence.

D4. Taxonomy nodes are permanent. Once assigned, a taxonomy ID (T1000, T6100, etc.) is never
    repurposed, deleted, or redefined. Deprecated nodes are marked as deprecated and supersededBy
    points to the replacement.
    Rationale: Taxonomy IDs are referenced by rules, findings, reports, and integrations. Repurposing
    an ID silently breaks all references.

D5. Every serialized object includes schemaVersion as its first field. Schema version follows semver.
    Rationale: Forward/backward compatibility requires explicit versioning. Without schema version,
    migration between engine versions is impossible.
```

#### ANALYSIS — Pipeline Behavior

```
A1. The analysis pipeline has a frozen order:
    Discovery → Classification → Extraction → Normalization → Behavior Classification →
    Rule Matching → Correlation → Trust Scoring → Risk Scoring → Reasoning → Report Construction.
    No stage may be skipped. No stage may reach ahead to downstream data.
    Rationale: Each stage depends on the output of its predecessor. Skipping stages or reaching ahead
    breaks the data flow contract and invalidates traceability.

A2. Extractors produce Features and Capabilities only. They never produce Findings, Behaviors, or Evidence.
    Rationale: Extraction is observation, not analysis. Allowing extractors to produce findings would
    bypass the Knowledge Layer and Rule Engine, breaking determinism and traceability.

A3. Rules consume Behaviors only. They never access raw file content, Features directly, or Artifact metadata.
    Rationale: Rules operate on normalized, language-agnostic Behaviors. Direct file access would make
    rules language-specific, non-portable, and impossible to test in isolation.

A4. AI is strictly a consumer of analysis results. It never participates in the analysis pipeline.
    AI lives in @veris/ai, imported only by @veris/cli and @veris/api. It is never imported by
    @veris/analyzer or any domain package.
    Rationale: AI is non-deterministic, unversioned, and unverifiable. Using AI for analysis would
    violate VERIS's core principle of explainable deterministic analysis.

A5. The pipeline is resilient to partial failure. A failure in extraction does not abort the pipeline.
    A single corrupted artifact produces a partial result and a diagnostic entry. The pipeline continues.
    Rationale: Security tools process untrusted, malformed input. Brittle pipelines that abort on
    the first error are unusable in production.
```

#### EXTRACTION — Extractor Boundaries

```
E1. Every extractor declares explicit boundaries: max file size, max nesting depth, max string length,
    max extraction time. Exceeding any boundary produces a partial result, not a crash.
    Rationale: Unbounded extraction is a security risk (resource exhaustion) and a reliability risk
    (OOM crashes). Boundaries must be explicit, configurable, and enforced.

E2. Every extractor implements parser recovery. A syntax error in one function does not prevent extraction
    from the rest of the file. Recovery is counted and reported in diagnostics.
    Rationale: Malformed files are common. Extractors that fail on the first error produce zero useful
    output from files that are 99% valid.

E3. Artifact classification uses ≥ 3 signals. Extension alone is insufficient. Magic bytes, MIME type,
    shebang, and content sampling must all be considered. Conflicts are resolved by weighted voting.
    Rationale: Single-signal classification is trivially bypassed by file renaming. Multi-signal
    classification provides defense-in-depth against misclassification.
```

#### SCORING — Risk, Trust, Confidence

```
S1. Confidence is multiplicative. Every factor (extraction quality, match precision, behavior confidence)
    is a necessary condition, and confidence = product of all factors. A single weak factor appropriately
    reduces overall confidence.
    Rationale: Multiplicative confidence ensures that every link in the evidence chain must be strong.
    Additive confidence would allow weak factors to be compensated by strong ones, producing inflated
    confidence in unreliable evidence.

S2. Risk = severity × confidence × evidence_weight. No magic numbers. Every coefficient, weight, and
    threshold is derived from a documented formula.
    Rationale: Arbitrary weights make scores untrustworthy and impossible to audit. Every component of
    the risk formula must be traceable to a documented derivation.

S3. Trust never eliminates evidence. Trust modifies the presentation of risk (±10% max), never the
    underlying risk score. The base risk score is always available and never modified by trust.
    Rationale: Trust is about provenance, not correctness. A signed binary from a trusted publisher can
    still contain vulnerabilities. Trust must not suppress findings.

S4. Evidence is the atomic unit of scoring. Evidence contributes exactly once to the overall score.
    Double-counting prevention (SPEC-005 §4.11) is enforced at every aggregation level.
    Rationale: Double-counting is the most common scoring error. It systematically inflates risk scores
    and makes them non-comparable across scans.

S5. Repository scoring uses risk density (mean artifact risk), not risk volume (total risk).
    Volume is reported as secondary information.
    Rationale: Risk density prevents large repositories from having automatically inflated scores.
    A 10,000-file repo with 10 risky files should not score higher than a 10-file repo with 5 risky files.
```

#### UX & RENDERING — Output Boundaries

```
U1. Renderers consume the Canonical Report only. No renderer performs analysis, accesses the pipeline,
    or modifies the report. The renderer contract is read-only on analysis data.
    Rationale: Renderers are presentation layers. Allowing them to perform analysis would create implicit
    coupling between output format and analysis logic, violating separation of concerns.

U2. Every screen follows a header → content → footer layout model. No exceptions.
    Rationale: Consistent layout across screens enables muscle-memory navigation. Users should never
    guess where to find the current screen name, available actions, or navigation hints.

U3. Every interactive element is keyboard-reachable. Mouse is optional. All global shortcuts are
    consistent across all screens. Escape always goes to the parent screen. q always quits.
    Rationale: Security analysis is a keyboard-intensive workflow. Mouse dependence breaks flow
    and accessibility.
```

#### PLUGINS — Extension Boundaries

```
P1. The core engine is inviolable. Plugins cannot modify the analysis pipeline order, canonical data model,
    rule execution, score calculation, or report structure. Plugins add functionality through approved
    extension points only.
    Rationale: If plugins could modify core behavior, the system would be non-deterministic across
    different plugin configurations. Core invariants must hold regardless of which plugins are installed.

P2. Plugins are extensions, not modifications. If a plugin is removed, the system behaves exactly as
    before the plugin was installed. Plugin data is stored in the metadata field of canonical objects
    as opaque JSON — never in the canonical fields.
    Rationale: Plugins must be safe to install and remove. Side effects from plugin removal indicate
    architectural boundary violations.

P3. Plugin crash isolation. A plugin crash must never crash the host process. Plugin crashes are caught,
    logged, and isolated. The analysis continues without the failed plugin. After 3 crashes in 60 seconds,
    the plugin is quarantined until the next scan.
    Rationale: Third-party code running in-process is a reliability risk. Process isolation ensures
    that a buggy or malicious plugin cannot take down the entire analysis.
```

#### TESTING & SECURITY — Quality Enforcement

```
T1. Every test that claims determinism must be validated by double-run comparison. A single run is
    insufficient to prove determinism.
    Rationale: Non-determinism can be intermittent. Double-run validation catches non-determinism that
    single-run tests miss. NonDeterminismError is a test failure.

T2. The security corpus is versioned and never has samples removed. Old samples are deprecated,
    never deleted. Every sample has an expected.json file defining expected analysis output.
    Rationale: Removing samples from the regression corpus is the fastest way to introduce undetected
    regressions. Samples are additive only.

T3. Every hardening measure (zip bomb, path traversal, terminal escape, etc.) has a corresponding test
    that validates detection, mitigation, diagnostics, and recovery. All four phases must be tested.
    Rationale: A hardening measure that isn't tested will inevitably regress. Detection without
    mitigation, or mitigation without recovery, is incomplete.
```

#### EVOLUTION — How VERIS May Change

```
V1. Backward compatibility is the default. Breaking changes require a major version bump (for packages)
    or a new major spec (for architecture). Breaking changes must be announced at least one minor version
    in advance with a deprecation notice and migration guide.
    Rationale: Surprise breaking changes destroy user trust. Semantic versioning without deprecation
    windows is insufficient for an analysis platform where findings must be reproducible across versions.

V2. New extension points are additive. No new extension point may change the behavior of existing
    extension points. A new plugin type (e.g., PanelPlugin in V2) must not change how existing
    plugin types (ExtractorPlugin, RulePackPlugin) work.
    Rationale: Additive extension ensures that existing plugins continue to work without modification
    when new extension types are introduced.

V3. The data model evolves through additive schema changes. New fields are optional with defaults.
    New taxonomy nodes do not change existing node meanings. New optional components do not change
    existing behavior. Breaking changes require a new major schema version and a migration script.
    Rationale: The canonical data model is the contract between all components. Breaking it without
    migration would orphan all existing reports and integrations.
```

---

## 4. Scope Freeze

### 4.1 V1.0 — Must Ship

The following capabilities are required for V1.0 stable release. No V1.0 release without all of these.

| Package / Capability                                              | Spec Reference    | Priority | Rationale                               |
| ----------------------------------------------------------------- | ----------------- | -------- | --------------------------------------- |
| `@veris/core` — All canonical types                               | SPEC-002 §3       | P0       | Foundation — everything depends on this |
| `@veris/shared` — Utilities, Result monad                         | SPEC-001 §7       | P0       | Required by all packages                |
| `@veris/logger` — Structured logging                              | SPEC-001 §3       | P0       | Observability                           |
| `@veris/config` — Hierarchical config                             | SPEC-007 §7       | P0       | Required by CLI and all packages        |
| `@veris/knowledge` — Taxonomy + CWE/OWASP                         | SPEC-002 §4       | P0       | Required by rules and extractors        |
| `@veris/rules-engine` — Scheduler, matchers, sandbox              | SPEC-003 §3–11    | P0       | Core analysis engine                    |
| `@veris/rules` — Secrets, scripts, config, archives packs         | SPEC-003 §8       | P0       | Shipped analysis content                |
| `@veris/extractors` — Python, JS, Bash text/binary, ZIP/TAR       | SPEC-004 §5–6     | P0       | Input processing                        |
| `@veris/analyzer` — Pipeline, correlation, trust, risk, reasoning | SPEC-003 §1, 4–7  | P0       | Analysis orchestration                  |
| `@veris/report` — Report builder, diff, summary                   | SPEC-006 §12      | P0       | Output construction                     |
| `@veris/exporters` — JSON, SARIF, Markdown, CSV                   | SPEC-006 §13      | P0       | Data export                             |
| `@veris/renderers` — HTML, AI Context                             | SPEC-006 §13–14   | P0       | Visual output                           |
| `@veris/cli` — scan, report, init commands + TUI                  | SPEC-006 §1–11    | P0       | Primary user interface                  |
| `@veris/api` — Programmatic API                                   | SPEC-001 §2       | P0       | Integration interface                   |
| `@veris/runners` — Local runner, CI runner                        | SPEC-001 §2       | P0       | Execution modes                         |
| `@veris/plugins` — Thin host shell (process isolation only)       | SPEC-007 §2–3     | P0       | Extension foundation                    |
| `@veris/plugin-sdk` — Contracts + helpers (published)             | SPEC-007 §5       | P0       | Third-party development                 |
| `tools/perf` — Benchmark suite                                    | SPEC-008 §8       | P0       | Performance validation                  |
| `tools/security` — Corpus, fuzzing, adversarial tests             | SPEC-008 §3, 5, 6 | P0       | Security validation                     |
| Documentation — Architecture, API, CLI, guides                    | SPEC-009 §8       | P0       | Developer experience                    |
| CI/CD — GitHub Actions (Gates 1–7)                                | SPEC-008 §10      | P0       | Quality enforcement                     |

### 4.2 V1.x — Should Ship

These capabilities should ship in V1.x (first year after V1.0) but are not required for V1.0.

| Capability                                               | Spec Reference | Priority | Rationale                          |
| -------------------------------------------------------- | -------------- | -------- | ---------------------------------- |
| AI Consumer plugins (OpenAI, Anthropic, Ollama adapters) | SPEC-007 §4.6  | P1       | AI-assisted explanation generation |
| Diff mode (side-by-side report comparison)               | SPEC-006 §19.2 | P1       | Incremental scanning UX            |
| PowerShell, Batch, VBScript extractors                   | SPEC-004 §6.1  | P1       | Secondary script languages         |
| Rust, Go extractors                                      | SPEC-004 §11.1 | P1       | Growing language demand            |
| Compliance scoring (PCI-DSS, SOC2, HIPAA)                | SPEC-005 §12.3 | P1       | Enterprise requirement             |
| Report baselines                                         | SPEC-006 §19.3 | P1       | Incremental analysis               |
| Enterprise rule packs                                    | SPEC-003 §8.1  | P1       | Enterprise requirements            |

### 4.3 V2 — Could Ship

These capabilities are planned for V2 but are not committed.

| Capability                               | Spec Reference     | Priority | Rationale                    |
| ---------------------------------------- | ------------------ | -------- | ---------------------------- |
| Full plugin sandbox (VM-level isolation) | SPEC-007 §11       | P2       | Deep plugin isolation        |
| Plugin marketplace                       | SPEC-007 §16.1     | P2       | Ecosystem growth             |
| Multi-pane workspace TUI                 | SPEC-006 §19.1     | P2       | Advanced UX                  |
| Historical comparison (SQLite-backed)    | SPEC-006 §19.4     | P2       | Trend analysis               |
| Java, C# extractors                      | SPEC-004 §11.1     | P2       | Enterprise languages         |
| Mobile app extractors (APK, IPA)         | SPEC-004 §11.3     | P2       | Mobile security              |
| Docker, Terraform, K8s extractors        | SPEC-004 §11.2     | P2       | Infrastructure analysis      |
| Panel, Theme, Policy plugin types        | SPEC-007 §4.7–4.10 | P2       | Plugin ecosystem             |
| Plugin signing                           | SPEC-007 §14.3     | P2       | Supply chain security        |
| Organization plugin repositories         | SPEC-007 §16.2     | P2       | Enterprise plugin management |
| SBOM analysis                            | SPEC-005 §12.4     | P2       | Supply chain visibility      |
| Remote sessions                          | SPEC-006 §19.5     | P2       | Distributed analysis         |

### 4.4 V3+ — Deferred

These capabilities are deferred to V3 or later. They require significant architecture or infrastructure investment.

| Capability                                      | Target | Rationale                                                              |
| ----------------------------------------------- | ------ | ---------------------------------------------------------------------- |
| C++, Swift, Kotlin extractors                   | V3     | Parser complexity is very high                                         |
| Firmware analysis                               | V3     | Specialized domain requiring binary reverse engineering expertise      |
| Full document analysis (PDF OLE, Office macros) | V3     | Requires deep format-specific parser investment                        |
| Process monitoring (runtime analysis)           | V4     | Requires OS-level hooks — fundamentally different from static analysis |
| Memory inspection                               | V4     | Runtime analysis — outside VERIS's static analysis scope               |
| Enterprise dashboard                            | V4     | Requires server infrastructure and user management                     |
| SaaS / Cloud offering                           | V4     | Requires server infrastructure, multi-tenancy, billing                 |

### 4.5 Rejected (Will Never Ship)

These capabilities are explicitly rejected from VERIS's scope. No amount of community demand will change this.

| Capability                               | Rationale                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **AI in the analysis pipeline**          | Violates determinism, explainability, and reproducibility — VERIS's core value proposition. AI is strictly a consumer of analysis results. |
| **Dynamic analysis / Malware execution** | Requires sandboxed execution environment — fundamentally different problem from static analysis. Out of scope.                             |
| **Reputation-based scoring**             | Introduces non-determinism (reputation data changes over time) and network dependency. Optional add-on only, never core.                   |
| **Automatic vulnerability remediation**  | Safety and liability risk. VERIS recommends, never modifies code automatically.                                                            |
| **Malware attribution**                  | Requires threat intelligence beyond VERIS's scope. Attribution is a function of threat intelligence platforms, not static analysis tools.  |
| **Network monitoring / IDS**             | VERIS analyzes stored artifacts, not network traffic. Different product category.                                                          |
| **Cloud-based analysis (SaaS-only)**     | VERIS must remain usable offline. Cloud features may be added as optional enhancements but the core must always work locally.              |

---

## 5. Technical Debt Register

### 5.1 Intentional Technical Debt for V1

The following items are intentionally deferred from V1 to enable faster delivery. Each item is documented with its reason, impact, mitigation, target release, and priority.

| ID    | Item                                                                     | Reason                                                                                         | Impact                                                                                      | Mitigation                                                                               | Target  | Priority |
| ----- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------- | -------- |
| TD-01 | Plugin sandbox uses child process isolation (not VM-level)               | VM-level isolation (Firecracker, gVisor) adds significant infrastructure complexity            | Plugin isolation is weaker — malicious plugin may leak memory or use more CPU than declared | Per-plugin resource limits (128MB memory, 30s timeout), crash quarantine after 3 crashes | V2      | High     |
| TD-02 | Only 3 script extractors (Python, JS, Bash) + 2 binary (PE, ELF)         | Building all promised extractors would triple Sprint 4                                         | Limited language coverage — some files fall back to text/binary extractors                  | Text and binary fallbacks provide basic extraction for unsupported languages             | V1.x    | Medium   |
| TD-03 | TUI uses Ink (React) — higher memory profile than raw terminal control   | Ink accelerates development; raw terminal control would require building all UI infrastructure | Higher memory usage (~50MB vs ~10MB for raw terminal)                                       | Virtual scrolling, memoization, lazy component loading                                   | Ongoing | Medium   |
| TD-04 | Golden snapshot coverage starts with core components, not all edge cases | Full golden coverage would delay release by 2+ sprints                                         | Some behavioral changes may go undetected for edge cases                                    | Prioritize golden tests for: (1) all extractors, (2) all rules, (3) all export formats   | V1.x    | Medium   |
| TD-05 | Security corpus starts at 1,000 samples (not 10,000)                     | Curating 10,000 samples with expected.json is a months-long effort                             | Reduced regression detection for rare file types                                            | Corpus grows organically with each reported false positive; aim for 5,000 by V1.x        | V1.x    | Medium   |
| TD-06 | AI Consumer plugins marked as optional in V1                             | AI provider integration is premature until core analysis is proven                             | Users cannot use AI-assisted explanations                                                   | Core reasoning engine produces deterministic explanations; AI is additive                | V1.x    | Low      |
| TD-07 | @veris/telemetry is implemented but off by default                       | Telemetry infrastructure is built but requires user trust before enabling by default           | No usage metrics without explicit opt-in                                                    | Telemetry is transparent, privacy-preserving, and clearly documented                     | V1.x    | Low      |
| TD-08 | Configuration validation uses Zod but error messages are basic           | Comprehensive error messages with suggested fixes are a UX improvement                         | Users may struggle to fix invalid configuration                                             | Include field path in error messages; add suggestions in V1.x                            | V1.x    | Low      |
| TD-09 | No hot-reload support for plugins                                        | Requires significant plugin host complexity                                                    | Plugin changes require restart                                                              | Documented in known limitations; plugin host lifecycle supports hot-reload interface     | V2      | Low      |
| TD-10 | Report diff uses in-memory comparison only                               | Persistent diff storage requires SQLite integration                                            | Diff state lost between sessions                                                            | Reports can be re-diffed from stored JSON; persistent diff is V2                         | V2      | Low      |
| TD-11 | No BLAKE3 hash support (SHA-256 only)                                    | SHA-256 is sufficient for V1; BLAKE3 adds implementation complexity                            | Slightly slower hashing for large files                                                     | SHA-256 is frozen as canonical; BLAKE3 may be added as optional in V2                    | V2      | Low      |
| TD-12 | Batch/VBScript extractors use tokenizer (not AST)                        | Full AST parsing for these languages requires parser libraries that don't exist                | Lower extraction quality for Batch/VBScript files                                           | Tokenizer covers the most common patterns; AST support if demand justifies               | V2      | Low      |

### 5.2 Debt Management Policy

| Policy                       | Rule                                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Maximum debt per release** | No more than 5 new TD items per release                                                                                |
| **Debt aging**               | Any TD item unresolved for 3 releases is escalated to P1                                                               |
| **Debt repayment**           | Each minor release must resolve at least 2 TD items                                                                    |
| **Critical debt**            | TD items with "High" priority must be resolved within 2 releases                                                       |
| **New debt approval**        | New TD items require maintainer approval and must document all 5 fields (reason, impact, mitigation, target, priority) |

---

## 6. Known Limitations

### 6.1 V1 Limitations

The following are expected limitations of VERIS V1. They are not bugs — they are deliberate scope boundaries.

| Limitation                          | Explanation                                                                                                                                                                                                        | Future Direction                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| **No dynamic analysis**             | VERIS is a static analysis platform. It does not execute or sandbox files to observe runtime behavior. Dynamic analysis is a fundamentally different problem that requires OS-level hooks and execution sandboxes. | V4+ with process monitoring (if at all) |
| **No memory inspection**            | VERIS analyzes file content, not memory. Memory analysis requires runtime access to process address space, which VERIS does not have.                                                                              | V4+ (deferred indefinitely)             |
| **No reputation services**          | VERIS does not maintain or query reputation databases (VirusTotal, AbuseIPDB, etc.). Reputation data introduces non-determinism and network dependency.                                                            | Optional plugin in V2+                  |
| **No cloud analysis**               | All analysis runs locally on the user's machine. No data is sent to external servers. Cloud-based analysis is an optional enhancement, never the primary mode.                                                     | Optional SaaS offering in V4            |
| **No automatic remediation**        | VERIS recommends fixes (via the Reasoning Engine) but never modifies code automatically. Automatic remediation is a safety and liability risk.                                                                     | Will never ship                         |
| **No malware attribution**          | VERIS reports observed behaviors and their risk. It does not attribute malware to actors, families, or campaigns. Attribution is a function of threat intelligence.                                                | Will never ship                         |
| **No network traffic analysis**     | VERIS analyzes stored files and artifacts. It does not capture or analyze network traffic.                                                                                                                         | Will never ship                         |
| **Limited language coverage (V1)**  | V1 ships extractors for Python, JavaScript/TypeScript, Bash, PE executables, ELF executables. Rust, Go, Java, C#, C++, and other languages are V2+.                                                                | V2+                                     |
| **No incremental scan persistence** | Incremental scans work within a session but the diff state is not persisted. Re-running a scan re-analyzes all files. Persistent diff storage is V2.                                                               | V2                                      |
| **Plugin hot-reload not supported** | Plugin changes require a restart of the scan session. Hot-reload is V2+.                                                                                                                                           | V2                                      |
| **No browser-based UI**             | The primary UI is the terminal (Ink-based TUI). HTML reports are static. No browser-based interactive dashboard exists in V1.                                                                                      | V4 (Enterprise dashboard)               |
| **No multi-user support**           | VERIS is a single-user CLI tool. Multi-user features (RBAC, audit logging, organizational reporting) are not supported.                                                                                            | V4 (Enterprise)                         |
| **No SBOM analysis**                | Software Bill of Materials analysis is not included in V1.                                                                                                                                                         | V2                                      |
| **No compliance reporting**         | Compliance frameworks (PCI-DSS, SOC2, HIPAA) are not mapped in V1.                                                                                                                                                 | V1.x                                    |
| **Limited archive format support**  | V1 supports ZIP, TAR, GZip, BZip2. RAR, 7z, ISO support is V2+.                                                                                                                                                    | V2                                      |
| **No streaming of stdin archives**  | V1 reads archives from filesystem only. Streaming archive detection from stdin is V2+.                                                                                                                             | V2                                      |

### 6.2 Non-Limitations (What VERIS V1 Does Well)

| Capability                                                              | V1 Status                |
| ----------------------------------------------------------------------- | ------------------------ |
| Static analysis of scripts (Python, JS, TS, Bash)                       | ✅ Full support          |
| Static analysis of executables (PE, ELF)                                | ✅ Full support          |
| Archive extraction and analysis (ZIP, TAR, GZip)                        | ✅ Full support          |
| Secret detection (AWS keys, GitHub tokens, private keys, API keys)      | ✅ Full support          |
| Configuration misconfiguration detection                                | ✅ Full support          |
| Script behavioral analysis (eval, shell exec, obfuscation)              | ✅ Full support          |
| Deterministic analysis — same input always produces same output         | ✅ Guaranteed            |
| Explainable findings — every finding traces to specific evidence        | ✅ Built into data model |
| Offline operation — all analysis works without network                  | ✅ Guaranteed            |
| Interactive TUI with keyboard navigation                                | ✅ Full support          |
| Multiple export formats (JSON, SARIF, HTML, Markdown, CSV)              | ✅ Full support          |
| Rule pack system with enable/disable/override                           | ✅ Full support          |
| Plugin system for third-party extensions (extractors, rules, renderers) | ✅ Thin V1 shell         |
| Multi-signal artifact classification                                    | ✅ Full support          |
| Error-tolerant parsing with recovery                                    | ✅ Built into extractors |
| Risk-based scoring with explanation                                     | ✅ Full support          |
| Trust-based assessment with independent scoring                         | ✅ Full support          |

---

## 7. Architecture Decision Record (ADR) Policy

### 7.1 When an ADR is Required

An ADR is required when:

| Trigger                           | Examples                                                             |
| --------------------------------- | -------------------------------------------------------------------- |
| **New architecture dependency**   | Adding a new package dependency, introducing a new external service  |
| **Cross-package boundary change** | Changing a public interface in a way that affects other packages     |
| **Data model change**             | Adding, removing, or changing a canonical object field               |
| **Pipeline change**               | Adding, removing, or reordering pipeline stages                      |
| **Scoring formula change**        | Changing the risk, trust, or confidence calculation                  |
| **Plugin contract change**        | Changing a plugin interface or the plugin lifecycle                  |
| **Build system change**           | Changing the build toolchain, CI/CD architecture, or release process |
| **Policy change**                 | Changing the invariants listed in Section 3 of this document         |
| **Technical debt approval**       | Adding a new item to the technical debt register                     |
| **Scope decision**                | Adding or removing a feature from the scope freeze                   |

An ADR is **not** required for:

- Bug fixes
- Performance optimizations (without behavior change)
- Adding new rules to existing rule packs
- Adding new extractors (follows existing `Extractor` interface)
- Documentation updates
- Test additions
- Refactoring within a package (no public API change)

### 7.2 ADR Lifecycle

```
  ┌─────────────────────────────────────────────┐
  │                PROPOSED                      │  Created as PR
  └──────────────────┬──────────────────────────┘
                     │ review period (min 3 days)
  ┌──────────────────▼──────────────────────────┐
  │               REVIEWING                      │  At least 2 maintainer reviews
  └──────────────────┬──────────────────────────┘
                     │ decision
          ┌──────────┴──────────┐
          ▼                     ▼
  ┌──────────────┐    ┌──────────────────┐
  │  ACCEPTED    │    │    REJECTED      │  Recorded as rejected for posterity
  └──────┬───────┘    └──────────────────┘
         │ implemented
  ┌──────▼───────┐
  │  IMPLEMENTED │  Code change referencing ADR merged
  └──────┬───────┘
         │ new information
  ┌──────▼───────┐
  │ SUPERSEDED   │  New ADR references existing ADR as superseded
  └──────┬───────┘
         │
  ┌──────▼───────┐
  │  DEPRECATED  │  Marked as deprecated (not removed)
  └──────────────┘
```

### 7.3 ADR Format

Every ADR follows this template:

```markdown
# ADR-{NNN}: {Title}

**Status:** {Proposed | Accepted | Rejected | Deprecated | Superseded}
**Date:** {YYYY-MM-DD}
**Author:** {Name}
**Supersedes:** {ADR-NNN} (optional)
**Superseded by:** {ADR-NNN} (optional)

## Context

{What is the issue that we're trying to decide? What constraints exist?
What is the motivation for this decision?}

## Decision

{What did we decide? Be specific. Include code examples, interface definitions,
or configuration snippets as appropriate.}

## Consequences

{What are the tradeoffs? What becomes easier? What becomes harder?
What new dependencies or constraints are introduced?}

## Alternatives Considered

{What other options were considered and why were they rejected?
Include at least 2 alternatives with brief rationale for rejection.}

## Compliance

{How will this decision be enforced? (CI checks, code review, documentation)}

## References

{Link to related ADRs, spec sections, or external resources.}
```

### 7.4 ADR Directory Structure

```
docs/architecture/
├── ADR-000-template.md           # Template (above)
├── ADR-001-monorepo-structure.md # Already defined in SPEC-001
├── ADR-002-dependency-inversion.md
├── ADR-003-report-model.md
├── ADR-004-plugin-system.md
├── ADR-005-immutable-objects.md
├── ADR-006-deterministic-ids.md
├── ADR-007-scoring-model.md
├── ADR-008-config-hierarchy.md
├── ADR-009-testing-philosophy.md
├── ADR-010-hash-algorithm.md    # Hash algorithm freeze (resolves I-001)
└── ...
```

### 7.5 Approval Process

| Scope                           | Reviewers                   | Approval Required           | Min Period |
| ------------------------------- | --------------------------- | --------------------------- | ---------- |
| Package-internal change         | Package maintainer          | 1 maintainer                | 1 day      |
| Cross-package interface change  | Both package maintainers    | 2 maintainers               | 3 days     |
| Data model change               | Architecture team           | 2 maintainers + 1 architect | 5 days     |
| Pipeline/Scoring change         | Architecture team           | 2 maintainers + 1 architect | 5 days     |
| Invariant change (Section 3)    | All maintainers + architect | Full consensus              | 2 weeks    |
| Scope freeze change (Section 4) | All maintainers + architect | Full consensus              | 2 weeks    |

### 7.6 Superseding ADRs

- A superseding ADR must reference the ADR it supersedes.
- The superseded ADR is marked with `Superseded by: ADR-NNN`.
- Superseded ADRs are not deleted — they remain in the repository for history.
- Superseding requires the same approval process as the original.

### 7.7 Emergency Decisions

In critical situations (security vulnerability, blocking bug, production outage), an ADR may be fast-tracked:

1. Decision is made with minimum required approvals (1 maintainer).
2. ADR is created with status "Emergency" after the fact.
3. Full review process is completed within 7 days.
4. If rejected during review, the decision is reversed and the system is migrated back.

---

## 8. RFC Process

### 8.1 When an RFC is Required

An RFC is required for changes that are too large for an ADR:

| Trigger                             | Examples                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------------------ |
| **New major feature**               | Adding a new analysis pipeline stage, new type of analysis (e.g., SBOM)              |
| **New plugin type**                 | Adding a plugin type not previously defined (e.g., PanelPlugin)                      |
| **New extractor category**          | Adding a fundamentally new category of extractor (e.g., runtime analysis)            |
| **New export format category**      | Adding a new category of export format (e.g., streaming protocol)                    |
| **Architecture change**             | Changing layer architecture, dependency rules, or pipeline ordering                  |
| **New external dependency**         | Adding a significant external dependency (database, message queue, external service) |
| **Deprecation of major capability** | Removing a major capability from the scope                                           |

### 8.2 RFC Lifecycle

```
  ┌──────────────────────────────────────────────────────┐
  │                     DRAFT                             │  Author writes initial proposal
  └──────────────────────┬───────────────────────────────┘
                         │ submit for review
  ┌──────────────────────▼───────────────────────────────┐
  │                    REVIEW                             │  Minimum 2 weeks review period
  │  • Architecture team review                          │  Public comment period
  │  • Community feedback (if applicable)                │
  │  • Impact assessment                                 │
  └──────────────────────┬───────────────────────────────┘
                         │ decision
              ┌──────────┴──────────┐
              ▼                     ▼
  ┌────────────────────┐   ┌────────────────────────┐
  │     ACCEPTED       │   │       REJECTED         │
  │  • Assigned to     │   │  • Recorded for history│
  │    milestone       │   │  • Rationale documented│
  │  • Implementation  │   └────────────────────────┘
  │    tracking        │
  └────────────────────┘
```

### 8.3 RFC Template

```markdown
# RFC-{NNN}: {Title}

**Status:** {Draft | Review | Accepted | Rejected | Implemented}
**Author:** {Name}
**Date:** {YYYY-MM-DD}
**Target Version:** {V1.x | V2 | V3 | V4}

## Summary

{One paragraph summary of the proposal.}

## Motivation

{Why is this change needed? What problem does it solve? What user or developer
need does it address?}

## Design

{Detailed design of the proposed change. Include:

- Architecture changes
- Interface changes
- Data model changes
- Pipeline changes
- Migration path
- Performance implications
- Security implications}

## Compatibility

{How does this affect existing:

- Reports (forward/backward compatibility)
- Rules (will existing rules break?)
- Plugins (will existing plugins break?)
- Export formats (will output format change?)
- Data model (migration needed?)}

## Migration Strategy

{How will users migrate from the current behavior to the new behavior?
Include:

- Automatic migration (if applicable)
- Manual migration steps
- Deprecation window
- Feature flags or toggles}

## Drawbacks

{What are the downsides or risks of this proposal? Why might we NOT want to do this?}

## Alternatives

{What alternatives were considered and why were they rejected?}

## Implementation Plan

{High-level implementation plan:

- Phases or milestones
- Estimated effort (weeks/months)
- Dependencies
- Risks and mitigations}

## Unresolved Questions

{What questions are still open? What needs further investigation?}
```

### 8.4 RFC Review Stages

| Stage              | Duration        | Activity                                         |
| ------------------ | --------------- | ------------------------------------------------ |
| **Draft**          | Author-defined  | Author writes and refines the RFC                |
| **Review**         | Minimum 2 weeks | Architecture team reviews; public comment period |
| **Decision**       | 1 week          | Architecture team votes; decision documented     |
| **Implementation** | Per milestone   | RFC is assigned to a milestone and tracked       |

### 8.5 Acceptance Criteria

An RFC is accepted when:

1. **Architecture compliance** — The proposal does not violate any permanent invariant (Section 3).
2. **Compatibility** — The proposal includes a clear migration strategy.
3. **Implementation feasibility** — The proposal can be implemented within the target version's timeline.
4. **Consensus** — The architecture team has reached consensus (not necessarily unanimity, but no blocking objections).
5. **Documentation** — The proposal includes documentation for the change.

### 8.6 RFC Numbering

RFCs are numbered sequentially: RFC-001, RFC-002, etc.

The number is assigned when the RFC enters the Review stage.

### 8.7 RFC Directory

```
docs/rfcs/
├── RFC-template.md
├── RFC-001-sbom-analysis.md
├── RFC-002-compliance-scoring.md
└── ...
```

---

## 9. Release Readiness Checklist

### 9.1 Production Readiness Gates

Each gate must pass before a V1.0 release candidate can be cut.

#### Architecture Readiness

| #   | Check                                               | Verification      | Pass/Fail |
| --- | --------------------------------------------------- | ----------------- | --------- |
| A1  | All package boundaries are implemented per SPEC-001 | Code review       |
| A2  | No circular dependencies exist                      | `madge` CI gate   |
| A3  | Dependency direction rules are enforced             | `madge` CI gate   |
| A4  | All canonical types are implemented per SPEC-002    | Code review       |
| A5  | All object invariants are validated (SPEC-002 §8)   | Unit tests        |
| A6  | Pipeline ordering matches SPEC-002 §1               | Integration tests |
| A7  | AI is not imported by any analysis package          | Dependency audit  |
| A8  | Plugin host isolates plugin crashes                 | Integration tests |
| A9  | Configuration hierarchy is deterministic            | Unit tests        |
| A10 | All 9 architecture specs are internally consistent  | Audit (Section 1) |

#### Implementation Readiness

| #   | Check                                                                   | Verification      | Pass/Fail |
| --- | ----------------------------------------------------------------------- | ----------------- | --------- |
| I1  | All V1.0 packages are implemented                                       | Sprint completion |
| I2  | All public APIs are documented with TSDoc                               | Doc generation    |
| I3  | All packages have a single public entry point (`index.ts`)              | Code review       |
| I4  | Factory functions exist for all canonical objects                       | Unit test access  |
| I5  | All CLI commands work (`scan`, `report`, `init`, `validate`, `version`) | E2E tests         |
| I6  | TUI renders all screens without error                                   | Integration tests |
| I7  | Keyboard navigation works for all screens                               | Integration tests |
| I8  | Command palette works                                                   | Integration tests |
| I9  | All export flags produce correct output                                 | E2E tests         |
| I10 | `veris scan .` works end-to-end                                         | E2E tests         |

#### Testing Readiness

| #   | Check                                                  | Verification        | Pass/Fail |
| --- | ------------------------------------------------------ | ------------------- | --------- |
| T1  | 100% of unit tests pass                                | CI test gate        |
| T2  | 100% of component tests pass                           | CI test gate        |
| T3  | 100% of integration tests pass (IT-001 through IT-010) | CI integration gate |
| T4  | 100% of pipeline tests pass                            | CI pipeline gate    |
| T5  | 100% of E2E smoke tests pass                           | CI E2E gate         |
| T6  | All golden tests pass (no unexpected drift)            | CI golden gate      |
| T7  | Coverage thresholds met per package (SPEC-008 §2.3)    | CI coverage gate    |
| T8  | Determinism double-run validation passes for all tests | CI determinism gate |
| T9  | Corpus regression tests pass (≥ 99%)                   | CI nightly gate     |
| T10 | All adversarial tests pass                             | CI nightly gate     |

#### Security Readiness

| #   | Check                                                            | Verification      | Pass/Fail |
| --- | ---------------------------------------------------------------- | ----------------- | --------- |
| S1  | Fuzzing: no critical/high crashes after 60 min per target        | Fuzz report       |
| S2  | Zip bomb detection works (compression ratio, total decompressed) | Hardening tests   |
| S3  | Tar bomb detection works (max entry count)                       | Hardening tests   |
| S4  | Path traversal detection works (all archive types)               | Hardening tests   |
| S5  | Symlink loop detection works                                     | Hardening tests   |
| S6  | Terminal escape injection sanitization works                     | Hardening tests   |
| S7  | Unicode spoofing detection works                                 | Hardening tests   |
| S8  | Plugin sandbox isolation works (crash doesn't affect host)       | Integration tests |
| S9  | Permission model enforces all permission IDs                     | Unit tests        |
| S10 | No `eval()` or `new Function()` in production code               | Code audit        |

#### Performance Readiness

| #   | Check                                                            | Verification      | Pass/Fail |
| --- | ---------------------------------------------------------------- | ----------------- | --------- |
| P1  | Extraction throughput ≥ 1,000 files/sec (small files)            | Benchmark         |
| P2  | Rule throughput ≥ 50,000 rules/sec                               | Benchmark         |
| P3  | P95 rule execution ≤ 10ms                                        | Benchmark         |
| P4  | P95 extraction time ≤ 100ms                                      | Benchmark         |
| P5  | Peak memory ≤ 1.2 GB (medium repo, 10K files)                    | Memory benchmark  |
| P6  | TUI startup ≤ 2 seconds                                          | Performance test  |
| P7  | TUI scan view ≥ 30fps                                            | Performance test  |
| P8  | HTML export ≤ 5s per 10K findings                                | Benchmark         |
| P9  | No memory leaks (3 consecutive scans without monotonic increase) | Memory regression |
| P10 | Total plugin overhead ≤ 10% of scan time                         | Benchmark         |

#### Documentation Readiness

| #   | Check                                                      | Verification    | Pass/Fail |
| --- | ---------------------------------------------------------- | --------------- | --------- |
| D1  | API reference generated from TSDoc                         | Doc generation  |
| D2  | CLI reference matches `--help` output                      | Doc generation  |
| D3  | Getting started tutorial is complete                       | Manual review   |
| D4  | Contributing guide is complete                             | Manual review   |
| D5  | Writing rules guide has at least one complete example      | Manual review   |
| D6  | Writing extractors guide has at least one complete example | Manual review   |
| D7  | All architecture specs are published                       | Manual review   |
| D8  | ADRs exist for all significant decisions                   | ADR inventory   |
| D9  | Changelog is complete for all packages                     | Changelog audit |
| D10 | README with quick-start example is accurate                | Manual review   |

#### UX Readiness

| #   | Check                                                               | Verification   | Pass/Fail |
| --- | ------------------------------------------------------------------- | -------------- | --------- |
| U1  | TUI works on Windows Terminal, iTerm2, Kitty, VS Code terminal      | Manual testing |
| U2  | TUI works at 80-column terminal width                               | Manual testing |
| U3  | Color works at true color, 256-color, and 16-color levels           | Automated test |
| U4  | Monochrome mode is functional                                       | Automated test |
| U5  | Empty states display correctly (no findings, no chains, empty repo) | Unit tests     |
| U6  | Error states display correctly (scan failure, partial results)      | Unit tests     |
| U7  | Loading states display correctly                                    | Unit tests     |
| U8  | Scan cancellation produces partial report                           | E2E test       |

#### Accessibility Readiness

| #   | Check                                                              | Verification      | Pass/Fail |
| --- | ------------------------------------------------------------------ | ----------------- | --------- |
| AC1 | All interactive elements are keyboard-reachable                    | Integration tests |
| AC2 | Focus is visible at all times                                      | Integration tests |
| AC3 | Severity is indicated by color + symbol + text (never color alone) | Code review       |
| AC4 | All text/background pairs meet WCAG AA contrast ratio              | Automated check   |
| AC5 | `--screen-reader` flag outputs findings as plain text              | E2E test          |
| AC6 | All animations respect `prefers-reduced-motion`                    | Integration test  |
| AC7 | `--no-animation` flag disables all animations                      | Integration test  |

#### Packaging Readiness

| #   | Check                                                             | Verification     | Pass/Fail |
| --- | ----------------------------------------------------------------- | ---------------- | --------- |
| PK1 | All packages build with `pnpm build`                              | CI build gate    |
| PK2 | All packages have correct `package.json` (name, version, exports) | Audit            |
| PK3 | Dual CJS/ESM output works for all packages                        | Build test       |
| PK4 | npm publish dry-run succeeds for all packages                     | Release workflow |
| PK5 | All external dependencies are pinned                              | Lockfile audit   |
| PK6 | No dependency has known critical vulnerabilities                  | `pnpm audit`     |
| PK7 | Package licenses are compatible with MIT                          | License audit    |

#### Cross-Platform Readiness

| #   | Check                                              | Verification           | Pass/Fail |
| --- | -------------------------------------------------- | ---------------------- | --------- |
| CP1 | All tests pass on Linux (x64)                      | CI cross-platform gate |
| CP2 | All tests pass on macOS (arm64)                    | CI cross-platform gate |
| CP3 | All tests pass on Windows (x64)                    | CI cross-platform gate |
| CP4 | Path handling works on all platforms (/, \, mixed) | Unit tests             |
| CP5 | Archive extraction works on all platforms          | Integration tests      |
| CP6 | TUI renders correctly on all platforms             | Manual testing         |

#### CI/CD Readiness

| #   | Check                                         | Verification      | Pass/Fail |
| --- | --------------------------------------------- | ----------------- | --------- |
| CI1 | PR CI (Gates 1–4) completes in ≤ 15 minutes   | CI timing         |
| CI2 | Nightly CI (Gates 5–6) completes in ≤ 2 hours | CI timing         |
| CI3 | Release workflow produces signed artifacts    | Release test      |
| CI4 | Benchmark comparison against baseline works   | CI benchmark gate |
| CI5 | Golden drift detection works                  | CI golden gate    |
| CI6 | Code coverage reporting works                 | CI coverage gate  |
| CI7 | All CI secrets are properly configured        | Security audit    |

### 9.2 Release Criteria Summary

| Category       | Total Checks | Must Pass (V1.0)                   |
| -------------- | ------------ | ---------------------------------- |
| Architecture   | 10           | 10                                 |
| Implementation | 10           | 10                                 |
| Testing        | 10           | 10                                 |
| Security       | 10           | 10                                 |
| Performance    | 10           | 8 (P9, P10 may be waived for V1.0) |
| Documentation  | 10           | 8 (D8, D10 may be waived for V1.0) |
| UX             | 8            | 8                                  |
| Accessibility  | 7            | 7                                  |
| Packaging      | 7            | 7                                  |
| Cross-Platform | 6            | 6                                  |
| CI/CD          | 7            | 7                                  |
| **Total**      | **95**       | **91 (96%)**                       |

---

## 10. Success Metrics

### 10.1 Determinism

| Metric                       | Target | Measurement                                            | Frequency |
| ---------------------------- | ------ | ------------------------------------------------------ | --------- |
| Determinism pass rate        | 100%   | Double-run comparison across all test suites           | Every PR  |
| Non-deterministic test count | 0      | Count of NonDeterminismError failures                  | Every PR  |
| Cross-platform determinism   | 100%   | Same input on Linux/macOS/Windows produces same output | Weekly    |

### 10.2 False Positive Rate

| Metric                                | Target                | Measurement                                               | Frequency  |
| ------------------------------------- | --------------------- | --------------------------------------------------------- | ---------- |
| FP rate (benign corpus)               | ≤ 1%                  | Unexpected findings of severity ≥ medium on benign corpus | Nightly    |
| FP rate (benign code in mixed corpus) | ≤ 0.5%                | Unexpected findings on benign portions of mixed corpus    | Nightly    |
| User-reported FP resolution time      | ≤ 7 days              | Time from FP report to fix or documented known limitation | Per-ticket |
| FP regression test coverage           | ≥ 95% of reported FPs | Known FPs have regression tests                           | Per-FP     |

### 10.3 Crash Rate

| Metric                      | Target                  | Measurement                             | Frequency         |
| --------------------------- | ----------------------- | --------------------------------------- | ----------------- |
| Parser crash rate           | 0% on valid inputs      | Crashes on any parser with valid input  | Nightly           |
| Parser crash rate (fuzzing) | 0 critical/high crashes | Fuzzing results after 60 min per target | Nightly           |
| Pipeline crash rate         | 0%                      | Crashes during full pipeline execution  | Nightly           |
| TUI crash rate              | 0%                      | Crashes during TUI usage                | Manual test suite |
| Plugin crash isolation      | 100%                    | Plugin crash never crashes host         | Integration tests |

### 10.4 Performance

| Metric                         | Target             | Measurement                  | Frequency |
| ------------------------------ | ------------------ | ---------------------------- | --------- |
| Single file scan (Python)      | ≤ 100ms            | Wall clock, `scan hello.py`  | Weekly    |
| Medium repo scan (10K files)   | ≤ 120s             | Wall clock, balanced profile | Weekly    |
| Extraction throughput          | ≥ 1,000 files/sec  | Small files, warm cache      | Weekly    |
| Rule throughput                | ≥ 50,000 rules/sec | Benchmark                    | Weekly    |
| P50 rule execution             | ≤ 1ms              | Rule profiling               | Weekly    |
| P95 rule execution             | ≤ 10ms             | Rule profiling               | Weekly    |
| P50 extraction time            | ≤ 10ms             | Extractor profiling          | Weekly    |
| P95 extraction time            | ≤ 100ms            | Extractor profiling          | Weekly    |
| Classification cache hit ratio | ≥ 80%              | Cache statistics             | Weekly    |
| HTML export (10K findings)     | ≤ 5s               | Wall clock                   | Weekly    |

### 10.5 Memory Usage

| Metric                               | Target                | Measurement             | Frequency |
| ------------------------------------ | --------------------- | ----------------------- | --------- |
| Peak memory (medium repo)            | ≤ 1.2 GB              | `process.memoryUsage()` | Weekly    |
| Peak memory (large repo, 100K files) | ≤ 4 GB                | `process.memoryUsage()` | Weekly    |
| Browser leak (3 consecutive scans)   | No monotonic increase | Memory regression       | Weekly    |
| Plugin memory (per plugin)           | ≤ 128 MB              | Per-process tracking    | Weekly    |
| Cache memory                         | ≤ 100 MB              | Cache statistics        | Weekly    |

### 10.6 Startup Time

| Metric                | Target          | Measurement           | Frequency |
| --------------------- | --------------- | --------------------- | --------- |
| CLI startup to prompt | ≤ 500ms         | `veris --help`        | Weekly    |
| TUI splash to ready   | ≤ 2s            | `veris scan .`        | Weekly    |
| First scan warmup     | ≤ 5s            | First file extraction | Weekly    |
| Plugin load time      | ≤ 1s per plugin | Plugin host timing    | Weekly    |

### 10.7 Report Quality

| Metric                            | Target | Measurement                                                         | Frequency |
| --------------------------------- | ------ | ------------------------------------------------------------------- | --------- |
| Finding traceability completeness | 100%   | Every Finding has complete Evidence→Behavior→Feature→Artifact chain | Nightly   |
| Score explainability              | 100%   | Every score has structured explanation                              | Nightly   |
| Explanation template coverage     | 100%   | All rules have all 3 explanation templates                          | PR gate   |
| Report schema conformance         | 100%   | All reports validate against canonical schema                       | Nightly   |
| SARIF spec compliance             | 100%   | SARIF output passes Microsoft validator                             | Nightly   |

### 10.8 Documentation Coverage

| Metric                    | Target                     | Measurement                                                  | Frequency |
| ------------------------- | -------------------------- | ------------------------------------------------------------ | --------- |
| Public API TSDoc coverage | 100%                       | All exported symbols have TSDoc                              | PR gate   |
| CLI command documentation | 100%                       | All commands documented in `docs/api/cli.md`                 | Release   |
| Guide completeness        | 100%                       | Contributing, writing rules, writing extractors guides exist | Release   |
| Getting started tutorial  | 100%                       | Tutorial exists and is accurate                              | Release   |
| ADR coverage              | 100% of required decisions | ADR inventory matches decision log                           | Quarterly |

### 10.9 Test Coverage

| Metric                                 | Target             | Measurement                      | Frequency |
| -------------------------------------- | ------------------ | -------------------------------- | --------- |
| Branch coverage (domain packages)      | ≥ 90%              | Istanbul/Vitest coverage         | PR gate   |
| Branch coverage (application packages) | ≥ 80%              | Istanbul/Vitest coverage         | PR gate   |
| Line coverage (domain packages)        | ≥ 95%              | Istanbul/Vitest coverage         | PR gate   |
| Mutation score (domain packages)       | ≥ 80%              | Stryker mutation testing         | Nightly   |
| Integration test coverage              | 100% of contracts  | All IT-001 through IT-010 pass   | PR gate   |
| Golden snapshot coverage               | 100% of components | All components have golden tests | PR gate   |

### 10.10 User Experience

| Metric                           | Target                   | Measurement                              | Frequency   |
| -------------------------------- | ------------------------ | ---------------------------------------- | ----------- |
| TUI keyboard navigation coverage | 100% of actions          | All actions have keyboard shortcuts      | PR gate     |
| Screen layout consistency        | 100%                     | All screens follow header→content→footer | Code review |
| Empty state coverage             | 100% of screens          | All screens handle empty data            | Unit test   |
| Error state coverage             | 100% of screens          | All screens handle error data            | Unit test   |
| Loading state coverage           | 100% of async operations | All async ops have loading state         | Unit test   |

### 10.11 Plugin Compatibility

| Metric                           | Target                                            | Measurement              | Frequency |
| -------------------------------- | ------------------------------------------------- | ------------------------ | --------- |
| Plugin API compatibility         | 100% backward compatible within major version     | Plugin integration tests | PR gate   |
| Plugin crash isolation           | 100% — no plugin crash affects host               | Integration tests        | PR gate   |
| Plugin permission enforcement    | 100% — all permission checks pass                 | Unit tests               | PR gate   |
| Plugin SDK version compatibility | Manifest validation catches all incompatibilities | Manifest validator tests | PR gate   |

---

## 11. Long-Term Evolution Rules

### 11.1 Allowed Extension Mechanisms

| Mechanism                      | Description                                                         | Version |
| ------------------------------ | ------------------------------------------------------------------- | ------- |
| **New extractors**             | Implement `Extractor` interface, register in `ExtractorRegistry`    | Any     |
| **New rule packs**             | Create new pack directory in `@veris/rules` with manifest and rules | Any     |
| **New rules**                  | Add to existing rule packs                                          | Any     |
| **New matcher types**          | Implement `RuleMatcher` interface, register in matcher registry     | Any     |
| **New export formats**         | Implement `Renderer` interface, register in `RendererRegistry`      | Any     |
| **New taxonomy nodes**         | Add to taxonomy tree (additive only, never modify existing)         | Any     |
| **New correlation strategies** | Implement new `CorrelationStrategy` in `CorrelationEngine`          | Any     |
| **New trust dimensions**       | Add to trust engine dimension registry                              | Any     |
| **New risk dimensions**        | Add to risk engine dimension registry                               | Any     |
| **New plugin types**           | Define new plugin interface extending base `Plugin`                 | V2+     |
| **New renderer types**         | Implement `Renderer` interface                                      | Any     |
| **New configuration loaders**  | Implement config loader, register in config system                  | Any     |
| **New scan profiles**          | Create profile JSON files                                           | Any     |

### 11.2 Backward Compatibility Rules

| Component                              | Compatibility Guarantee                               | Breaking Change Policy                                           |
| -------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Canonical types (`@veris/core`)        | Full backward compatibility within major version      | Deprecate in minor, remove in major. Migration script provided.  |
| Public API (`@veris/*` index.ts)       | Full backward compatibility within major version      | Deprecate in minor, remove in major.                             |
| Internal API (`@veris/*` internal.ts)  | No compatibility guarantee                            | May change at any time. Documented as unstable.                  |
| Export formats (JSON, SARIF)           | Forward compatibility (new fields are optional)       | New major version adds fields; old fields never removed.         |
| Plugin contracts (`@veris/plugin-sdk`) | Full backward compatibility within major SDK version  | SDK version bumps independently. Manifest pinning required.      |
| Rule definitions                       | Engine loads rules targeting engine version ≤ current | Rule version in manifest. New engine loads old rules.            |
| Taxonomy nodes                         | Permanent IDs. Never repurposed, never deleted.       | Deprecated nodes marked with `supersededBy`.                     |
| Report schema                          | Forward compatibility (new fields optional)           | Backward incompatible changes require new major schema version.  |
| CLI flags                              | Full backward compatibility within major version      | Deprecate in minor with warning. Remove in major.                |
| Configuration schema                   | Forward compatibility (new sections are optional)     | Backward incompatible changes require new config schema version. |

### 11.3 Deprecation Policy

| Phase            | Action                                              | Duration                           |
| ---------------- | --------------------------------------------------- | ---------------------------------- |
| **Announcement** | Deprecation notice in changelog and console warning | At start of deprecation            |
| **Warning**      | Console warning on every use of deprecated feature  | 1 minor version                    |
| **Soft removal** | Feature hidden from documentation, not recommended  | 1 minor version                    |
| **Hard removal** | Feature removed, migration script provided          | 1 major version after announcement |

**Example timeline:**

- V1.0: Feature is stable
- V1.1: Deprecation announced
- V1.2: Console warning on use
- V1.3: Feature hidden from docs, still functional
- V2.0: Feature removed, migration script provided

### 11.4 Semantic Versioning Rules

| Package               | Starting Version | Versioning Strategy                                                             |
| --------------------- | ---------------- | ------------------------------------------------------------------------------- |
| `@veris/core`         | `1.0.0`          | Conservative — major bumps require architecture review                          |
| `@veris/shared`       | `1.0.0`          | Utility additions are minor; breaking changes are major                         |
| `@veris/logger`       | `0.1.0`          | Stabilizes at 1.0.0 alongside V1 stable                                         |
| `@veris/config`       | `0.1.0`          | Stabilizes at 1.0.0 alongside V1 stable                                         |
| `@veris/knowledge`    | `0.1.0`          | New taxonomy nodes are minor; structure changes are major                       |
| `@veris/rules-engine` | `0.1.0`          | New matcher types are minor; engine API changes are major                       |
| `@veris/rules`        | `0.1.0`          | Fastest-moving package; new rules are minor; rule format changes are major      |
| `@veris/extractors`   | `0.1.0`          | New extractors are minor; Extractor interface changes are major                 |
| `@veris/analyzer`     | `0.1.0`          | Pipeline stage additions are minor; pipeline reordering is major                |
| `@veris/report`       | `0.1.0`          | Report builder changes are minor; report schema changes are major               |
| `@veris/exporters`    | `0.1.0`          | New formats are minor; existing format changes are major                        |
| `@veris/renderers`    | `0.1.0`          | New renderers are minor; Renderer interface changes are major                   |
| `@veris/cli`          | `0.1.0`          | New commands are minor; command signature changes are major                     |
| `@veris/api`          | `0.1.0`          | New API methods are minor; existing method signature changes are major          |
| `@veris/runners`      | `0.1.0`          | New runners are minor; Runner interface changes are major                       |
| `@veris/plugins`      | `0.1.0`          | Plugin type additions are minor; lifecycle changes are major                    |
| `@veris/plugin-sdk`   | `0.1.0`          | Independently versioned; new plugin types are minor; contract changes are major |

### 11.5 Plugin Compatibility Guarantees

| Guarantee              | Period                   | Details                                                              |
| ---------------------- | ------------------------ | -------------------------------------------------------------------- |
| Backward compatibility | Within major SDK version | Plugin written for SDK 1.x works on all 1.y versions                 |
| Forward compatibility  | 1 minor version          | Plugin written for SDK 1.1 works on SDK 1.0 (new types are optional) |
| Deprecation window     | 2 minor versions         | Deprecated API continues to work for 2 minor versions                |
| Manifest pinning       | Required                 | Plugin manifest declares `sdkVersion` range; host validates at load  |

### 11.6 Schema Evolution Strategy

| Schema                 | Evolution Strategy                                     | Breaking Change Threshold                                   |
| ---------------------- | ------------------------------------------------------ | ----------------------------------------------------------- |
| CanonicalReport (JSON) | Additive: new fields are always optional with defaults | Removal of any field or change of field type                |
| SARIF                  | Follows SARIF spec versioning                          | Following SARIF, not VERIS version                          |
| Plugin manifest        | Additive: new fields in manifest are optional          | Removal of manifest field or change of manifest structure   |
| Configuration          | Additive: new config sections are optional             | Removal of config section or change of config key structure |
| Taxonomy               | Additive only: new nodes at any time                   | Removal or repurposing of existing nodes (never allowed)    |

---

## 12. Final Principal Engineer Assessment

### 12.1 Architecture Strengths

| Strength                                | Assessment                                                                                                                                                                                                                                                |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Determinism-first design**            | Every component is designed for determinism. The multiplicative confidence model, immutable objects, deterministic IDs, and per-session caching all reinforce each other. This is the single strongest architectural property.                            |
| **Clear layer isolation**               | The L0–L7 layer architecture with downward-only dependencies is well-defined and enforceable. TypeScript project references and `madge` CI checks ensure the architecture is enforced at compile time, not just in design documents.                      |
| **Immutability as a first principle**   | All canonical objects are immutable. This enables caching, replay, diffing, distributed analysis, and thread safety. The performance cost is negligible compared to the reliability gain.                                                                 |
| **Comprehensive hardening**             | SPEC-008's coverage of zip bombs, path traversal, terminal escape, Unicode spoofing, and plugin abuse is thorough and well-structured. Every hardening measure has detection, mitigation, diagnostics, and recovery — the four-part pattern is excellent. |
| **Plugin architecture is future-proof** | The plugin system is designed for V2 maturity but the V1 thin shell validates the architecture. Process isolation, permission model, and manifest-based loading are the right foundations.                                                                |
| **Testing pyramid is well-designed**    | The separation into unit → component → integration → pipeline → E2E with appropriate CI frequency (PR vs nightly vs weekly) is practical and avoids the common trap of making every test run on every commit.                                             |

### 12.2 Architecture Weaknesses

| Weakness                                         | Assessment                                                                                                                                                                                                                                                                                                                                            | Mitigation                                                                                                                                                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TypeScript as the implementation language**    | TypeScript is not the optimal language for a security analysis tool. Memory safety is provided by the runtime (V8), not the language. Parser performance may be constrained by the garbage collector. However, the monorepo tooling (pnpm, TypeScript project references) and ecosystem (parser libraries, Ink for TUI) are significant accelerators. | Accept the tradeoff. The development speed advantage outweighs the runtime performance limitations for V1. If performance becomes critical, hot paths can be migrated to native modules (Rust via napi-rs) in V2+.                 |
| **React Ink for TUI**                            | Ink provides excellent developer experience but has a higher memory footprint than raw terminal control. For very large finding sets (100K+), virtual scrolling performance may be a concern.                                                                                                                                                         | Virtual scrolling, memoization, and bin-based aggregation should handle 100K findings. If performance is inadequate, consider a hybrid approach: Ink for interactive screens, raw terminal for live scan dashboard.                |
| **Plugin sandbox uses child process isolation**  | Child process isolation (fork) is weaker than VM-level isolation (Firecracker, gVisor). A malicious plugin can still consume resources or leak memory within its process limits.                                                                                                                                                                      | Per-plugin resource limits (128MB, 30s timeout) and crash quarantine (3 strikes) provide adequate protection for V1. VM-level isolation is a V2 enhancement.                                                                       |
| **Single-threaded event loop for orchestration** | The main event loop handles pipeline orchestration. While extraction and rule matching are offloaded to worker threads, the orchestration layer is single-threaded. This could become a bottleneck for very large scans with thousands of artifacts.                                                                                                  | The bottleneck is extraction (53.5%) and rule matching (21.7%), both of which are worker-threaded. The orchestration overhead is minimal (< 5%). If orchestration becomes a bottleneck, it can be parallelized per-artifact in V2. |
| **No persistent state**                          | VERIS has no database. All state is in-memory per scan. This simplifies the architecture but prevents historical comparison, trend analysis, and scan result persistence without explicit export.                                                                                                                                                     | SQLite-based scan history is a V2 enhancement. For V1, users export reports for archival. In-memory diff works within a session.                                                                                                   |

### 12.3 Highest-Risk Areas

| Risk Area                                       | Severity | Rationale                                                                                                                                                       | Mitigation                                                                                                                                                               |
| ----------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Parser robustness against adversarial input** | Critical | VERIS analyzes untrusted files. A parser vulnerability could lead to RCE, data leaks, or denial of service. This is the highest-risk area of the entire system. | Fuzzing every parser (60 min per target), error-tolerant parsing, memory limits, timeouts, and input validation before parsing. All hardening measures are tested.       |
| **False positive rate in rule packs**           | High     | Users will abandon VERIS if it produces too many false positives. The first user experience is the most important.                                              | Aggressive FP regression tests, confidence thresholds, user-configurable severity overrides. Every user-reported FP gets a regression test.                              |
| **Plugin security**                             | High     | Third-party plugins are a supply chain risk. A malicious plugin could exfiltrate scan data, modify files, or use the host as a bot.                             | Permission model, process isolation, network off by default, crash quarantine. Plugin manifest signing is V2 but the permission model works in V1.                       |
| **Determinism across platforms**                | Medium   | Floating-point operations can produce slightly different results on different platforms (x64 vs arm64, Linux vs Windows).                                       | Fixed-precision arithmetic, deterministic accumulation order (sorted), double-run validation. Scores are reported to 1 decimal place — small differences are acceptable. |
| **TUI performance with large findings**         | Medium   | The Ink-based TUI may become sluggish with 100K+ findings.                                                                                                      | Virtual scrolling, pagination, bin-based aggregation. Performance budgets are tested in CI.                                                                              |

### 12.4 Highest-Value Future Improvements

| Improvement                                  | Value                                                          | Effort    | Target |
| -------------------------------------------- | -------------------------------------------------------------- | --------- | ------ |
| **Persistent scan history (SQLite)**         | High — enables trend analysis, regression detection, baselines | Medium    | V2     |
| **Compliance scoring (PCI, SOC2, HIPAA)**    | High — enterprise adoption requires compliance reporting       | Medium    | V1.x   |
| **Incremental scanning (content-addressed)** | High — reduces scan time by 10–100x for repeated scans         | Medium    | V2     |
| **SBOM analysis**                            | High — supply chain security is a growing need                 | High      | V2     |
| **AI-assisted explanation generation**       | Medium — improves report readability but is non-deterministic  | Low       | V1.x   |
| **Remote sessions (TUI over SSH/WebSocket)** | Medium — enables server-side scanning with local viewing       | High      | V3     |
| **Marketplace for plugins**                  | Medium — drives ecosystem growth                               | High      | V3     |
| **Enterprise dashboard**                     | Medium — multi-repo aggregation                                | Very High | V4     |

### 12.5 Architectural Maturity Assessment

| Dimension                      | Maturity Level      | Assessment                                                                                                                                                         |
| ------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Requirements clarity**       | 5/5 — Frozen        | All 9 specs are frozen. No ambiguity in requirements.                                                                                                              |
| **Architecture documentation** | 5/5 — Complete      | All architecture decisions are documented with rationale, consequences, and alternatives.                                                                          |
| **Interface contracts**        | 5/5 — Defined       | All cross-package interfaces are defined in frozen specs. TypeScript project references enforce at compile time.                                                   |
| **Data model**                 | 5/5 — Frozen        | All 14 canonical objects are defined with fields, validation rules, and lifecycle.                                                                                 |
| **Pipeline ordering**          | 5/5 — Fixed         | Pipeline order is unambiguous and cross-referenced across 3 specs.                                                                                                 |
| **Testing strategy**           | 5/5 — Comprehensive | Multi-level testing pyramid with determinism double-run validation.                                                                                                |
| **Security hardening**         | 5/5 — Thorough      | 13 threat models with detection, mitigation, diagnostics, and recovery.                                                                                            |
| **Performance architecture**   | 4/5 — Well-Designed | Worker pool, streaming, caching, and backpressure are designed. Some implementation details (worker count tuning, cache sizing) will require empirical validation. |
| **Plugin architecture**        | 4/5 — Well-Designed | V1 thin shell is appropriate. Full sandboxing, marketplace, and signing are deferred to V2+. The permission model is well-designed.                                |
| **Evolution rules**            | 5/5 — Defined       | Extension mechanisms, backward compatibility, deprecation policy, and schema evolution are all documented.                                                         |

**Overall Architectural Maturity: 4.8 / 5.0**

### 12.6 Production Readiness Assessment

| Criterion                             | Status | Assessment                                                                  |
| ------------------------------------- | ------ | --------------------------------------------------------------------------- |
| **Architecture frozen?**              | ✅ Yes | All 10 specs (SPEC-001 through SPEC-010) are complete                       |
| **All invariants documented?**        | ✅ Yes | 35 permanent invariants in Section 3                                        |
| **Scope frozen?**                     | ✅ Yes | V1.0, V1.x, V2, V3, V4 scope defined; rejected features documented          |
| **Known limitations documented?**     | ✅ Yes | 16 known V1 limitations with explanations                                   |
| **Technical debt tracked?**           | ✅ Yes | 12 intentional debt items with mitigation plans                             |
| **ADR process defined?**              | ✅ Yes | When ADRs are required, lifecycle, format, approval process                 |
| **RFC process defined?**              | ✅ Yes | RFC lifecycle, template, review stages, acceptance criteria                 |
| **Release checklist defined?**        | ✅ Yes | 95 production readiness checks across 11 categories                         |
| **Success metrics defined?**          | ✅ Yes | 70+ metrics across 12 dimensions                                            |
| **Evolution rules defined?**          | ✅ Yes | Extension mechanisms, backward compatibility, deprecation, schema evolution |
| **Cross-spec audit complete?**        | ✅ Yes | All 9 specs audited; 4 minor issues found and resolved                      |
| **Architecture assessment complete?** | ✅ Yes | Strengths, weaknesses, risks, and improvements documented                   |

**Overall Production Readiness: READY FOR IMPLEMENTATION**

### 12.7 Final Assessment

The VERIS architecture is mature, well-documented, and internally consistent. The frozen specs (SPEC-001 through SPEC-009) together with this constitutional document (SPEC-010) provide a complete foundation for V1 implementation through V4 evolution.

**Key strengths:** Determinism-first design, immutable data model, multi-signal classification, error-tolerant parsing, multiplicative confidence scoring, comprehensive hardening, well-designed plugin architecture.

**Key risks:** Parser robustness against adversarial input, false positive rate, plugin security, cross-platform determinism.

**Key recommendations for implementation:**

1. **Build the thin version first.** The architecture is comprehensive. The implementation must resist over-engineering. Build the simplest version that validates the contracts, then extend.

2. **Fuzz every parser from day one.** Parser vulnerabilities are the highest-risk area. Fuzzing should start as soon as the first extractor is implemented, not at Sprint 13.

3. **Golden snapshots are not optional.** Capture expected outputs as soon as a component produces output. Golden drift detection is the most effective regression prevention mechanism in the entire testing strategy.

4. **Invest in FP regression tests.** The first user experience is dominated by false positives. Every sprint should add FP regression tests. A rule with high FP rate should have its confidence reduced or be demoted to "experimental."

5. **The architecture is designed to evolve, not to be perfect.** Accept the technical debt in Section 5. Ship V1 with the thin plugin shell, limited language coverage, and in-memory-only diffing. The architecture will support V2 improvement.

**Verdict:** VERIS is ready for production implementation. The architecture is sound, the risks are understood and mitigated, and the evolution path is clear. The 14-sprint roadmap (30 weeks) is achievable with a disciplined team.

---

_End of SPEC-010. This constitutional document governs VERIS through V4 and serves as the single source of truth for architectural decisions, scope boundaries, invariants, and evolution rules. It supersedes all conflicting prior specifications and is itself permanent — changeable only through a new major architecture specification._
