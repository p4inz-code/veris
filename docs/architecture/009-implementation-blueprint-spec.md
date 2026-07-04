# VERIS Implementation Blueprint, Build System & Engineering Execution Plan — SPEC-009

**Status:** Final Draft  
**Version:** 1.0  
**Applies to:** Implementation order, sprint roadmap, dependency graphs, build architecture, developer workflow, definition of done, documentation strategy, release strategy, risk register, engineering tradeoffs.  
**Scope:** V1 production readiness. Derived from SPEC-001 through SPEC-008.

---

## Table of Contents

1. [Engineering Principles & Invariants](#1-engineering-principles--invariants)
2. [Package Implementation Order](#2-package-implementation-order)
3. [Sprint Roadmap](#3-sprint-roadmap)
4. [Dependency Graphs](#4-dependency-graphs)
5. [Build Architecture](#5-build-architecture)
6. [Developer Workflow](#6-developer-workflow)
7. [Definition of Done](#7-definition-of-done)
8. [Documentation Strategy](#8-documentation-strategy)
9. [Release Strategy](#9-release-strategy)
10. [Risk Register](#10-risk-register)
11. [Engineering Tradeoffs](#11-engineering-tradeoffs)
12. [Common Implementation Mistakes](#12-common-implementation-mistakes)
13. [Final Recommendations](#13-final-recommendations)

---

## 1. Engineering Principles & Invariants

### 1.1 Implementation Principles

| Principle                                                 | Description                                                                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Bottom-up dependency order**                            | No package is implemented before the packages it depends on. Foundation layers (L0) before framework (L1), before domain (L2), before analysis (L3), before application (L4+). |
| **Contract-first development**                            | Interfaces and type definitions are written before implementations. Every cross-package boundary has a defined contract that is tested independently.                          |
| **Test-first where practical**                            | Unit tests are written alongside or before implementation. Core domain logic (rules engine, extractors, scoring) uses test-driven development.                                 |
| **Every layer validated before the next**                 | A sprint that produces a new layer must include validation gates proving that layer works before dependent layers are started.                                                 |
| **No feature branch may violate architectural contracts** | CI enforces dependency direction, public API surface stability, and interface compliance. Branches that violate contracts are blocked.                                         |
| **Determinism is non-negotiable**                         | Every component must produce identical output given identical input. Double-run validation is enforced in CI.                                                                  |
| **Offline-first**                                         | All core analysis paths must work without network. AI, telemetry, and remote services are optional enhancements.                                                               |
| **Incremental milestones**                                | Each sprint produces a working, shippable increment. No sprint depends on future sprints for validation.                                                                       |

### 1.2 Implementation Invariants

```
1. @veris/core imports NOTHING from the monorepo. Zero dependencies.
2. No circular dependencies between packages. Enforced via madge in CI.
3. Extractors produce Features only. Never Findings, never Behaviors.
4. Rules consume Behaviors only. Never raw files, never Features directly.
5. AI is a consumer of analysis results, never a participant in analysis.
6. All analysis is deterministic. Same input → same output, every time.
7. Everything works offline. Network is optional for enhancement only.
8. Every package has exactly one public entry point (index.ts).
   Optionally one internal entry point (internal.ts).
9. Dependencies flow downward only. No upward or lateral dependencies.
10. Every Finding traces back through Evidence → Behavior → Feature → Artifact.
11. Confidence is multiplicative. Every factor is a necessary condition.
12. Trust never eliminates evidence. It only modifies presentation (±10%).
```

### 1.3 Package Layer Architecture (from SPEC-001)

| Layer                        | Packages                                           | Dependencies             |
| ---------------------------- | -------------------------------------------------- | ------------------------ |
| **L0: Foundation**           | `core`, `shared`                                   | core: none; shared: core |
| **L1: Framework**            | `logger`, `config`, `telemetry`, `ai`              | core, shared             |
| **L2: Domain**               | `extractors`, `rules-engine`, `rules`, `knowledge` | L0 + L1                  |
| **L3: Analysis**             | `analyzer`                                         | L2                       |
| **L4: Report & Output**      | `report`, `exporters`                              | core, knowledge, report  |
| **L5: Application**          | `cli`, `api`                                       | L3 + L4 + L1             |
| **L6: Runners**              | `runners`                                          | L3 + L4 + L1             |
| **L7: Plugins (thin in V1)** | `plugins` (host + SDK)                             | core, shared             |
| **Cross-cutting**            | `renderers`                                        | report, core             |

---

## 2. Package Implementation Order

### 2.1 Complete Implementation Sequence

```
Phase 0 ── Foundation
  P0.1  @veris/core           — Canonical types, errors, constants
  P0.2  @veris/shared         — Utilities, hashing, collections, serialization

Phase 1 ── Framework
  P1.1  @veris/logger         — Structured logging
  P1.2  @veris/config         — Hierarchical config loading

Phase 2 ── Domain Foundation
  P2.1  @veris/knowledge      — Taxonomy, CWE/OWASP mappings
  P2.2  @veris/rules-engine   — Rule interfaces, scheduler, matchers

Phase 3 ── Extraction
  P3.1  @veris/extractors     — Extractor interfaces + built-in extractors
  P3.2  fixtures/             — Test fixtures (committed alongside extractors)

Phase 4 ── Rules
  P4.1  @veris/rules          — Shipped rule packs

Phase 5 ── Analysis Core
  P5.1  @veris/analyzer       — Pipeline orchestration, correlation, trust, risk, reasoning

Phase 6 ── Report & Export
  P6.1  @veris/report         — Report builder, diff, summary
  P6.2  @veris/exporters      — JSON, SARIF, HTML, Markdown, CSV

Phase 7 ── Rendering
  P7.1  @veris/renderers      — TUI, static renderer contracts

Phase 8 ── Application
  P8.1  @veris/cli            — CLI commands + TUI
  P8.2  @veris/api            — Programmatic API

Phase 9 ── Runners & Plugins
  P9.1  @veris/runners        — Local, CI, daemon runners
  P9.2  @veris/plugins        — Plugin host + SDK (thin V1 shell)

Phase 10 ── Quality Infrastructure
  P10.1 tools/perf            — Benchmark suite
  P10.2 tools/security        — Security corpus, fuzzing, adversarial tests
  P10.3 docs/                 — Full documentation
  P10.4 .github/workflows/    — CI/CD pipeline

Continuous ── Throughout
  C.1   Unit tests             — Written alongside every module
  C.2   Golden snapshots       — Captured as features stabilize
  C.3   Integration tests      — Written as cross-package boundaries form
  C.4   @veris/telemetry       — Metrics and tracing (added after core stable)
  C.5   @veris/ai              — AI consumer layer (added after analysis stable)
```

### 2.2 Why This Order

| Phase        | Rationale                                                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Phase 0**  | Everything depends on core types and shared utilities. Without these, no package can be built or tested.                                                              |
| **Phase 1**  | Logging and configuration are needed by every downstream package. Building them early ensures all later packages have observability and config support.               |
| **Phase 2**  | The knowledge taxonomy must exist before extractors (which map to it) and before rules (which reference it). The rules engine interfaces must exist before any rules. |
| **Phase 3**  | Extractors produce Features — the input to the entire analysis pipeline. They must work before any analysis can be tested.                                            |
| **Phase 4**  | Rules are the analytical payload. They must exist before the analyzer can produce findings.                                                                           |
| **Phase 5**  | The analyzer orchestrates everything. It depends on all prior phases being complete and validated.                                                                    |
| **Phase 6**  | Reports and exporters consume the analyzer's output. They must work before users can see results.                                                                     |
| **Phase 7**  | Renderers provide the visual layer. They are independent of analysis but depend on the report model.                                                                  |
| **Phase 8**  | The CLI and API wire everything together. They are the application layer that users interact with.                                                                    |
| **Phase 9**  | Runners and plugins extend how VERIS is deployed. They are built after core functionality is proven.                                                                  |
| **Phase 10** | Quality infrastructure is built throughout but formalized into a suite once the engine is stable.                                                                     |

---

## 3. Sprint Roadmap

### 3.1 Sprint Overview

| Sprint        | Duration | Theme                    | Packages                                               | Dependencies    |
| ------------- | -------- | ------------------------ | ------------------------------------------------------ | --------------- |
| **Sprint 0**  | 1 week   | Project bootstrap        | Workspace, tooling, CI                                 | None            |
| **Sprint 1**  | 2 weeks  | Core infrastructure      | `@veris/core`, `@veris/shared`                         | Sprint 0        |
| **Sprint 2**  | 2 weeks  | Framework                | `@veris/logger`, `@veris/config`                       | Sprint 1        |
| **Sprint 3**  | 2 weeks  | Domain foundation        | `@veris/knowledge`, `@veris/rules-engine` (interfaces) | Sprint 2        |
| **Sprint 4**  | 3 weeks  | Extraction               | `@veris/extractors` + fixtures                         | Sprint 3        |
| **Sprint 5**  | 2 weeks  | Rule engine core         | `@veris/rules-engine` (implementation)                 | Sprint 3        |
| **Sprint 6**  | 2 weeks  | Shipped rules            | `@veris/rules` (secrets, configuration packs)          | Sprint 5        |
| **Sprint 7**  | 3 weeks  | Analyzer pipeline        | `@veris/analyzer` (orchestration, correlation)         | Sprints 4, 5, 6 |
| **Sprint 8**  | 2 weeks  | Risk, Trust, Reasoning   | Analyzer scoring engines                               | Sprint 7        |
| **Sprint 9**  | 2 weeks  | Report & Export          | `@veris/report`, `@veris/exporters`                    | Sprint 8        |
| **Sprint 10** | 2 weeks  | Renderers                | `@veris/renderers` (TUI foundation, HTML, Markdown)    | Sprint 9        |
| **Sprint 11** | 3 weeks  | CLI + API                | `@veris/cli`, `@veris/api`                             | Sprint 10       |
| **Sprint 12** | 2 weeks  | Runners & Plugins (thin) | `@veris/runners`, `@veris/plugins`                     | Sprint 11       |
| **Sprint 13** | 2 weeks  | Quality & hardening      | Benchmarks, corpus, fuzzing, hardening                 | Sprint 12       |
| **Sprint 14** | 2 weeks  | Release candidate        | Polish, documentation, release automation              | Sprint 13       |

**Total:** ~30 weeks (7.5 months) to V1 release candidate.

### 3.2 Sprint 0 — Project Bootstrap

**Objectives:**

- Initialize pnpm workspace with TypeScript project references
- Configure ESLint flat config, Prettier, tsconfig.base.json
- Set up GitHub Actions CI workflow (build, lint, test)
- Create pnpm-workspace.yaml with all package directories
- Establish `.gitignore`, `.env.example`, `MAINTENANCE.md`, `ROADMAP.md`
- Create package scaffolding for all packages (empty `package.json`, `tsconfig.json`, `src/index.ts`)
- Install and configure Vitest

**Deliverables:**

- Working monorepo with `pnpm install && pnpm build:core` passing
- CI workflow running on PR and push to main
- All package directories created with correct `package.json` (name, version `0.1.0`, dependencies as `workspace:*`)

**Dependencies:** None

**Exit Criteria:**

- `pnpm install` completes without errors
- `pnpm build` completes for all packages (even if building empty entry points)
- CI pipeline passes for a no-op PR
- `pnpm test` runs and reports "no tests found"

**Risks:** Minimal. Tooling configuration issues are the primary risk.

**Validation Gates:**

- ✅ pnpm workspace resolution works
- ✅ TypeScript project references compile
- ✅ ESLint runs without errors
- ✅ CI pipeline green

### 3.3 Sprint 1 — Core Infrastructure

**Objectives:**

- Implement `@veris/core` types: all canonical domain types from SPEC-002 §3
- Implement error hierarchy: `VerisError`, `ParseError`, `ExtractError`, `RuleError`
- Implement constants: `limits.ts`, `platform.ts`
- Implement `@veris/shared` utilities: `Result<T, E>` monad, serialization helpers, path utilities
- Write factory functions for all canonical objects
- Write unit tests achieving 95% branch coverage on `@veris/core`

**Deliverables:**

- `@veris/core/src/types/` — All types from SPEC-002 §3 (Artifact, Feature, Behavior, Evidence, Rule, Finding, etc.)
- `@veris/core/src/errors/` — Error hierarchy
- `@veris/core/src/constants/` — Limits and platform constants
- `@veris/shared/src/result/` — `Result<T, E>` monad
- `@veris/shared/src/path/` — Cross-platform path utilities
- `@veris/shared/src/serialization/` — JSON serialization helpers
- `@veris/shared/src/collections/` — Immutable tracking collections
- Factory functions: `createTestArtifact()`, `createTestFeature()`, `createTestBehavior()`, etc.

**Dependencies:** Sprint 0

**Exit Criteria:**

- All core types compile without error
- All shared utilities have passing unit tests
- 95%+ branch coverage on `@veris/core`
- 90%+ branch coverage on `@veris/shared`
- No circular dependencies between core and shared

**Risks:**

- Type design decisions that don't accommodate future requirements. Mitigation: frozen specs guarantee stability.
- `Result<T, E>` monad ergonomics in TypeScript. Mitigation: follow established patterns (neverthrow, oxide.ts).

**Validation Gates:**

- ✅ `pnpm test --filter=@veris/core` — all tests pass
- ✅ `pnpm test --filter=@veris/shared` — all tests pass
- ✅ `pnpm build --filter=@veris/core --filter=@veris/shared` — clean build
- ✅ Coverage thresholds met
- ✅ `madge` circular dependency check passes

### 3.4 Sprint 2 — Framework Layer

**Objectives:**

- Implement `@veris/logger` with structured JSON logging, multiple transports (console, file, silent)
- Implement `@veris/config` with hierarchical loading (global → workspace → repo → profile → CLI → env)
- Config validators using Zod schemas
- Both packages depend on `@veris/core` and `@veris/shared`

**Deliverables:**

- `@veris/logger/src/logger.ts` — Public interface with log levels
- `@veris/logger/src/transports/` — Console, file, JSON-lines
- `@veris/logger/src/formatters/` — Structured, pretty-print
- `@veris/config/src/config.ts` — Merged runtime config
- `@veris/config/src/loaders/` — JSON, YAML, TOML, args, env
- `@veris/config/src/validators/` — Zod schemas per config domain

**Dependencies:** Sprint 1

**Exit Criteria:**

- Logger output matches SPEC-008 §9.1 format
- Config resolution algorithm (SPEC-007 §7.4) works correctly
- All 6 config levels merge in correct priority order
- Environment variable mapping works (SPEC-007 §7.5)

**Risks:**

- Config merging edge cases (deep merge vs override behavior). Mitigation: extensive unit tests for merge priority.
- YAML/TOML parser choice. Mitigation: use `js-yaml` and `smol-toml` — well-maintained, no native deps.

**Validation Gates:**

- ✅ Logger unit tests pass (format, levels, transports)
- ✅ Config merge priority tests pass (all 6 levels)
- ✅ Config validation with Zod catches invalid configs
- ✅ Component tests for cross-module interaction

### 3.5 Sprint 3 — Domain Foundation

**Objectives:**

- Implement `@veris/knowledge` with the full taxonomy tree from SPEC-002 §4.2
- Taxonomy node definitions, CWE/OWASP/NIST mappings
- Implement `@veris/rules-engine` interfaces: `Rule`, `RuleSet`, `RuleMatcher`, `RuleContext`, `RuleEngine`
- Rule scheduler interface, rule loader interface

**Deliverables:**

- `@veris/knowledge/src/taxonomy/` — All taxonomy nodes (T1000–T90990)
- `@veris/knowledge/src/references/` — CWE, OWASP, NIST mapping tables
- `@veris/knowledge/src/enrichment/` — Human-readable descriptions, remediation text
- `@veris/knowledge/src/registry/` — KnowledgeBase registry
- `@veris/rules-engine/src/interfaces/` — Rule, RuleSet, RuleMatcher, RuleContext, RuleEngine
- `@veris/rules-engine/src/scheduler/` — Rule scheduling interface
- `@veris/rules-engine/src/engine/` — RuleEngine interface and skeleton

**Dependencies:** Sprint 2

**Exit Criteria:**

- All taxonomy nodes defined with correct hierarchy
- Taxonomy validation: every node has valid parent reference, no orphans
- CWE/OWASP/NIST mappings are complete for all nodes
- Rules engine interfaces compile and are ready for implementation
- Knowledge package has 95%+ branch coverage

**Risks:**

- Taxonomy completeness — are there gaps in the category tree? Mitigation: frozen spec prevents churn; gaps are filled in V1.x.
- Interface design for RuleMatcher — getting the abstraction right. Mitigation: build a small proof-of-concept with 3 matcher types before committing to interface shape.

**Validation Gates:**

- ✅ Taxonomy tree validation: no cycles, all parent refs resolve
- ✅ Knowledge registry returns correct nodes by ID
- ✅ CWE/OWASP mappings are correct (spot-check against known mappings)
- ✅ RulesEngine interfaces compile and are used by a stub implementation
- ✅ Component tests for knowledge + rules engine interfaces

### 3.6 Sprint 4 — Extraction Framework

**Objectives:**

- Implement `Extractor` interface, `ExtractorRegistry`, `ExtractorContext`
- Implement artifact classification (multi-signal from SPEC-004 §4)
- Implement text-extractor and binary-extractor fallbacks
- Implement python-extractor (AST-based), javascript-extractor
- Implement archive extractors (ZIP, TAR, GZip)
- Create test fixtures for all extractor types

**Deliverables:**

- `@veris/extractors/src/interfaces/` — Extractor, ExtractorRegistry contracts
- `@veris/extractors/src/registry/` — ExtractorRegistry implementation
- `@veris/extractors/src/builtins/text-extractor/`
- `@veris/extractors/src/builtins/binary-extractor/`
- `@veris/extractors/src/builtins/python-extractor/`
- `@veris/extractors/src/builtins/javascript-extractor/`
- `@veris/extractors/src/builtins/zip-extractor/`
- `@veris/extractors/src/builtins/tar-extractor/`
- Artifact classifier with multi-signal detection
- `fixtures/samples/` — safe, malicious, edge case samples

**Dependencies:** Sprint 3

**Exit Criteria:**

- All built-in extractors produce valid `ExtractionResult` with `Feature[]` and `Capability[]`
- Artifact classification works with multi-signal voting
- Parser recovery works (malformed input produces partial output, not crashes)
- Fallback extractors handle unclassified artifacts
- Golden snapshots captured for each extractor with known inputs

**Risks:**

- Python and JavaScript parser selection. Mitigation: use existing parser libraries (`tree-sitter` bindings or `meriyah` for JS, built-in `ast` module for Python through `pyright` inference or a JS-based Python parser).
- Archive parser native dependencies. Mitigation: use pure-JS archive libraries (`yauzl` for ZIP, `tar-stream` for TAR, `pako` for gzip).
- Parser performance on large files. Mitigation: streaming extraction, size limits, timeouts.

**Validation Gates:**

- ✅ All extractor unit tests pass (happy path, boundary, error, edge case, determinism)
- ✅ Integration test IT-001: Feature extraction → Behavior classification
- ✅ Golden snapshots captured and validated
- ✅ Parser recovery tests (corrupted files produce partial results, not crashes)
- ✅ Artifact classification tests (all signal combinations)
- ✅ Benchmark: extraction throughput ≥ 1,000 files/sec (small files)

### 3.7 Sprint 5 — Rule Engine Implementation

**Objectives:**

- Implement `RuleScheduler` (topological sort, priority-based)
- Implement `RuleMatcher` types (exact, regex, range, set, exists, composite)
- Implement safe evaluator sandbox
- Implement rule caching (3 levels)
- Implement rule loading from rule packs
- Implement diagnostic tracing for rule execution

**Deliverables:**

- `@veris/rules-engine/src/scheduler/` — Full scheduler implementation
- `@veris/rules-engine/src/matchers/` — All matcher types
- `@veris/rules-engine/src/evaluator/` — Safe sandbox
- `@veris/rules-engine/src/engine/` — RuleEngine, RuleLoader, cache
- Rule execution trace and diagnostic system

**Dependencies:** Sprint 3

**Exit Criteria:**

- All matcher types produce correct `MatchResult` for known inputs
- Scheduler correctly orders rules by dependency and priority
- Evaluator sandbox correctly executes safe expressions and rejects unsafe ones
- Cache hit ratios meet targets (L1 ≥ 80%)
- Rule loading from pack definitions works
- Determinism: same rules + same behaviors = same results

**Risks:**

- Safe evaluator sandbox bypass vulnerabilities. Mitigation: use a well-audited expression evaluator library (exceljs expressions or a subset of math.js), never `eval()` or `new Function()`.
- Scheduler cycle detection. Mitigation: Kahn's algorithm with proper cycle reporting.
- Cache invalidation complexity. Mitigation: per-session cache only; content-addressed keys.

**Validation Gates:**

- ✅ All matcher unit tests pass
- ✅ Scheduler tests: correct ordering, cycle detection, dependency missing
- ✅ Evaluator tests: safe expressions work, unsafe expressions rejected
- ✅ Cache tests: hit/miss ratio, LRU eviction, per-session isolation
- ✅ Integration test IT-002: Behavior → Rule matching → Finding
- ✅ Benchmark: ≥ 50,000 rules/sec throughput

### 3.8 Sprint 6 — Shipped Rules

**Objectives:**

- Implement rule packs: `core`, `secrets`, `scripts`, `configuration`, `archives`
- Each pack with 5–15 rules
- Rule manifests, dependencies between packs
- Rule tests: unit tests, golden tests, false-positive regression tests

**Deliverables:**

- `@veris/rules/src/packs/core/` — File-type, entropy, platform detection (5 rules)
- `@veris/rules/src/packs/secrets/` — AWS key, GitHub token, private key, API key, connection string (8 rules)
- `@veris/rules/src/packs/scripts/` — Eval usage, shell execution, base64 decode, obfuscated string (8 rules)
- `@veris/rules/src/packs/configuration/` — Debug enabled, permissive CORS, world-writable, unencrypted comm (6 rules)
- `@veris/rules/src/packs/archives/` — Zip bomb, path traversal, encrypted archive, nested depth (4 rules)
- Rule unit tests with `createTestBehavior()` factories
- Golden snapshots for every rule

**Dependencies:** Sprint 5

**Exit Criteria:**

- All 31 rules produce correct matches against known test behaviors
- Rule packs load with correct dependency resolution
- No false positives on benign test fixtures
- All expected findings on malicious test fixtures
- Golden tests pass

**Risks:**

- False positive rate too high. Mitigation: aggressive false-positive regression tests.
- Rule performance (regex backtracking). Mitigation: RE2-style regex engine or linear-time regex patterns; timeout per pattern (100ms).
- Rule pack dependency cycles. Mitigation: enforced at load time.

**Validation Gates:**

- ✅ All rule unit tests pass (positive, negative, FP regression)
- ✅ Rule pack manifests validate
- ✅ Integration test: full analysis with all packs produces expected findings
- ✅ Golden snapshots captured and validate
- ✅ Corpus regression: benign fixtures produce zero findings of severity ≥ medium

### 3.9 Sprint 7 — Analyzer Pipeline

**Objectives:**

- Implement `AnalysisPipeline` orchestrator
- Implement pipeline stage routing (discovery → extraction → classification → rules → correlation → scoring → reporting)
- Implement artifact scheduling and deduplication
- Implement `CorrelationEngine` (dedup, grouping, sequence detection from SPEC-003 §4)
- Implement lifecycle hooks (pre/post middleware)
- Pipeline test suite

**Deliverables:**

- `@veris/analyzer/src/pipeline/` — Pipeline orchestrator, stages
- `@veris/analyzer/src/lifecycle/` — Pre/post hooks, middleware
- `@veris/analyzer/src/scheduler/` — Artifact scheduling & dedup
- `@veris/analyzer/src/correlation/` — Correlation engine
- `@veris/analyzer/src/analyzer.ts` — Public API entry
- Pipeline test fixtures and integration tests

**Dependencies:** Sprints 4, 5, 6

**Exit Criteria:**

- Full pipeline runs end-to-end: raw files → canonical report
- Pipeline stages execute in correct order
- No stage is skippable
- Correlation engine correctly deduplicates and groups findings
- Behavior chain detection works for multi-step patterns
- Partial extraction failures don't abort the pipeline

**Risks:**

- Pipeline stage coupling — ensuring clean data flow between stages. Mitigation: typed interfaces at every stage boundary.
- Correlation engine complexity — sequence detection across artifacts. Mitigation: start with simple dedup and grouping, add sequence detection in Sprint 8.
- Pipeline performance with many artifacts. Mitigation: streaming between stages, worker pool for CPU-bound work.

**Validation Gates:**

- ✅ Pipeline integration tests pass (IT-003, IT-004, IT-005)
- ✅ End-to-end test: analyze a known repository and verify report structure
- ✅ Correlation dedup tests: same finding produced from different paths is deduplicated
- ✅ Pipeline cancellation test: Ctrl+C produces partial report
- ✅ Determinism: same input → same report

### 3.10 Sprint 8 — Risk, Trust & Reasoning Engines

**Objectives:**

- Implement `TrustEngine` with trust score computation (SPEC-005 §5)
- Implement `RiskEngine` with dimensional risk scoring (SPEC-005 §4)
- Implement `ReasoningEngine` with explanation templates and traceability (SPEC-003 §7)
- Implement `ConfidenceEngine` with multiplicative confidence (SPEC-005 §3)
- Implement dimension framework and mapping

**Deliverables:**

- `@veris/analyzer/src/trust/` — Trust engine implementation
- `@veris/analyzer/src/risk/` — Risk engine implementation
- `@veris/analyzer/src/reasoning/` — Reasoning engine implementation
- `@veris/analyzer/src/confidence/` — Confidence engine implementation
- `@veris/analyzer/src/dimensions/` — Score dimension framework
- Structured explanation generation
- Score traceability (why this score? why not higher/lower?)

**Dependencies:** Sprint 7

**Exit Criteria:**

- Trust scores are deterministic and reproducible
- Risk scores use saturate(normalize(sum(weighted_dimension_scores))) formula
- Confidence is multiplicative (product of all factors)
- Every score generates a structured explanation
- Score traceability: every point traces to specific evidence
- Trust never eliminates evidence (only modifies presentation)

**Risks:**

- Floating-point determinism across platforms. Mitigation: use fixed-precision arithmetic, deterministic accumulation order.
- Score explanation verbosity. Mitigation: progressive disclosure — summary first, detail on demand.
- Edge cases (empty repo, single file, binary-only). Mitigation: explicit edge case tests.

**Validation Gates:**

- ✅ Trust engine unit tests: all trust dimensions, score computation, modifiers
- ✅ Risk engine unit tests: all dimensions, severity × confidence, chain amplification
- ✅ Confidence engine tests: multiplicative factors, parser recovery penalties
- ✅ Reasoning engine tests: template rendering, traceability
- ✅ Integration test IT-004: Findings → TrustProfile → RiskProfile
- ✅ Edge case tests: empty repo, binary-only, obfuscated scripts, large projects
- ✅ Determinism double-run validation

### 3.11 Sprint 9 — Report & Export

**Objectives:**

- Implement `ReportBuilder` with summary, aggregation, diff support
- Implement `CanonicalReport` construction
- Implement JSON exporter (full serialization, pretty/minified)
- Implement SARIF exporter (SPEC-006 §13.2)
- Implement Markdown exporter (hierarchical, severity badges)
- Implement CSV exporter (flattened finding list)

**Deliverables:**

- `@veris/report/src/builder/` — ReportBuilder implementation
- `@veris/report/src/model/` — ReportModel, FindingModel
- `@veris/report/src/diff/` — ReportDiff between runs
- `@veris/report/src/summary/` — Aggregation, statistics
- `@veris/exporters/src/formats/json/` — JSON exporter
- `@veris/exporters/src/formats/sarif/` — SARIF exporter
- `@veris/exporters/src/formats/markdown/` — Markdown exporter
- `@veris/exporters/src/formats/csv/` — CSV exporter

**Dependencies:** Sprint 8

**Exit Criteria:**

- Report builder produces complete CanonicalReport from analyzer output
- JSON exporter produces valid JSON matching the canonical schema
- SARIF exporter produces valid SARIF 2.1.0 output
- Markdown exporter produces readable hierarchical output
- CSV exporter produces valid CSV
- Report diff correctly identifies new, resolved, and changed findings

**Risks:**

- SARIF specification compliance — many edge cases. Mitigation: validate against Microsoft's SARIF validator in CI.
- Report size for large scans. Mitigation: streaming JSON export, optional minification.

**Validation Gates:**

- ✅ Report builder unit tests pass
- ✅ Integration test IT-006: CanonicalReport → JSON
- ✅ Integration test IT-007: CanonicalReport → SARIF
- ✅ Golden snapshots for all export formats
- ✅ SARIF validator passes
- ✅ Report diff tests

### 3.12 Sprint 10 — Renderers

**Objectives:**

- Implement renderer contracts (`Renderer`, `TuiRenderer`, `StaticRenderer`)
- Implement HTML renderer (self-contained single file with inline CSS/JS)
- Implement Markdown renderer (hierarchical with severity badges)
- Implement AI Context exporter (structured JSON for LLM consumption)
- TUI foundation: component library (Box, Panel, Table, Badge, StatusBar, Spinner)

**Deliverables:**

- `@veris/renderers/src/interfaces/` — Renderer contracts
- `@veris/renderers/src/static/html/` — HTML renderer
- `@veris/renderers/src/static/markdown/` — Markdown renderer
- `@veris/renderers/src/static/ai-context/` — AI context exporter
- `@veris/renderers/src/tui/components/` — Component library (Ink-based)
- `@veris/renderers/src/tui/theme/` — Theme tokens (dark + light)
- Theme system with ANSI fallback

**Dependencies:** Sprint 9

**Exit Criteria:**

- HTML renderer produces self-contained, valid HTML with inline CSS
- Markdown renderer produces valid Markdown
- AI Context exporter produces structured JSON aligned with SPEC-006 §14.2
- TUI component library renders correctly in Ink
- Theme system works with true color, 256-color, and 16-color terminals
- All renderers are offline-first

**Risks:**

- Ink rendering performance with large datasets. Mitigation: virtual scrolling, memoization.
- HTML/CSS compatibility — must work without external dependencies. Mitigation: inline everything, test in major browsers.
- TUI theme system complexity. Mitigation: start with dark theme only, add light theme later.

**Validation Gates:**

- ✅ HTML renderer tests: output validates as HTML5
- ✅ Markdown renderer tests: output renders correctly
- ✅ AI Context export tests: schema conformance
- ✅ TUI component tests: each component renders without error
- ✅ Theme tests: all color tokens render correctly at each ANSI level
- ✅ Performance: HTML generation ≤ 5s per 10K findings

### 3.13 Sprint 11 — CLI & API

**Objectives:**

- Implement `@veris/cli` with commands: `scan`, `report`, `init`, `validate`, `version`, `completion`
- Implement TUI screens: splash, env checks, target selection, live scan dashboard, results dashboard, findings list, finding detail, behavior chains, risk dimensions, artifacts, export
- Implement keyboard navigation and command palette
- Implement `@veris/api` with public programmatic API
- Implement DI container wiring

**Deliverables:**

- `@veris/cli/src/commands/scan/` — Scan command (primary)
- `@veris/cli/src/commands/report/` — Report command
- `@veris/cli/src/commands/init/` — Init command (config scaffolding)
- `@veris/cli/src/commands/validate/` — Validate command
- `@veris/cli/src/commands/version/` — Version command
- `@veris/cli/src/tui/screens/` — All TUI screens
- `@veris/cli/src/tui/keyboard/` — Keyboard bindings
- `@veris/cli/src/tui/command-palette/` — Command palette
- `@veris/api/src/public/` — Public API client
- `@veris/api/src/internal/` — DI container and wiring
- AI integration points (AI explanation plugins optional in V1)

**Dependencies:** Sprint 10

**Exit Criteria:**

- `veris scan .` works end-to-end with full TUI
- All 6 CLI commands work with correct argument parsing
- Keyboard navigation works for all screens
- Command palette opens and filters correctly
- API client can be imported and used programmatically
- `veris scan --json`, `--sarif`, `--html`, `--markdown` flags produce correct output
- Scan cancellation via Ctrl+C works gracefully

**Risks:**

- TUI Ink rendering compatibility across terminals. Mitigation: test on Windows Terminal, iTerm2, Kitty, VS Code terminal.
- CLI argument parsing edge cases. Mitigation: use a well-tested CLI framework (commander, yargs).
- DI container complexity. Mitigation: manual DI (no framework) — simple factory functions and a container object.

**Validation Gates:**

- ✅ CLI smoke tests: all commands exit with correct code
- ✅ TUI integration tests: screen navigation, keyboard shortcuts
- ✅ API integration tests: programmatic scan, report generation
- ✅ E2E tests: `veris scan . --json` produces valid output
- ✅ E2E tests: scan cancellation, partial report
- ✅ All export format flags produce correct output

### 3.14 Sprint 12 — Runners & Plugins (Thin V1 Shell)

**Objectives:**

- Implement `@veris/runners` with local-runner and CI-runner
- Implement `@veris/plugins` with core host (loader, lifecycle, basic sandbox)
- Implement Plugin SDK (`@veris/plugin-sdk`) with contracts and helpers
- Plugin manifest schema and validation
- Extractor plugin type and rule pack plugin type

**Deliverables:**

- `@veris/runners/src/local-runner/` — Local filesystem scanning
- `@veris/runners/src/ci-runner/` — CI integration (stdin/stdout)
- `@veris/plugins/src/host/` — PluginHost, loader, lifecycle
- `@veris/plugins/src/sandbox/` — Basic process isolation
- `@veris/plugins/src/registry/` — Plugin type registries
- `@veris/plugin-sdk/` — Published SDK package
- Plugin manifest schema and validator

**Dependencies:** Sprint 11

**Exit Criteria:**

- Local runner scans a directory and produces a report
- CI runner reads from stdin and outputs JSON to stdout
- Plugin host loads, validates, and initializes a sample plugin
- Plugin SDK can be imported and used by a test plugin
- Plugin sandbox isolates plugin crashes from host
- Plugin manifest validation works

**Risks:**

- Plugin sandbox complexity. Mitigation: V1 uses simple child process isolation; full sandboxing (VM-level) is V2.
- Plugin SDK API stability commitment. Mitigation: mark SDK as `0.x` in V1, commit to semver after V1 stable.
- Plugin discovery filesystem scanning. Mitigation: simple directory scan in `plugins/node_modules/`.

**Validation Gates:**

- ✅ Runner tests: local and CI modes produce correct output
- ✅ Plugin host tests: load, validate, initialize, activate, deactivate cycle
- ✅ Plugin sandbox tests: crash isolation, memory limits
- ✅ Plugin SDK integration test: test plugin loads and works
- ✅ Manifest validation: valid manifests pass, invalid manifests are rejected

### 3.15 Sprint 13 — Quality & Hardening

**Objectives:**

- Build benchmark suite with standardized scenarios
- Build security corpus (benign, malicious, edge, corrupted, obfuscated)
- Implement fuzzing infrastructure for all parsers
- Implement adversarial test suite
- Performance budget validation
- Memory regression tests
- Cross-platform validation

**Deliverables:**

- `tools/perf/scenarios/` — Standardized benchmark scenarios
- `tools/perf/benchmark-config.yaml` — Benchmark configuration
- `tools/security/corpus/` — Security corpus (v1: 1,000+ samples)
- `tools/security/fuzzing/configs/` — Fuzz configurations
- `tools/security/fuzzing/seeds/` — Seed corpora
- `tools/security/adversarial/` — Adversarial test scenarios
- GitHub Actions workflows for nightly benchmarks and security tests
- Performance budget validation in CI

**Dependencies:** Sprint 12

**Exit Criteria:**

- All benchmarks run and produce reports
- Performance budgets are validated (no regression > 20%)
- Security corpus regression tests pass (≥ 99% pass rate)
- Fuzzing finds no crashes after 60 minutes per target
- All adversarial tests pass (zip bombs, path traversal, etc.)
- Cross-platform tests pass on Linux, macOS, Windows

**Risks:**

- Benchmark environment variability. Mitigation: use dedicated CI runners, report system specs alongside results.
- Fuzzing infrastructure complexity. Mitigation: use Jazzer.js for JS fuzzing; start with property-based tests (fast-check) before investing in libFuzzer bindings.
- Corpus licensing. Mitigation: use generated/synthetic content for most samples; attribute public sources.

**Validation Gates:**

- ✅ All benchmarks complete without error
- ✅ Performance budgets pass (absolute + regression)
- ✅ Corpus regression: ≥ 99% pass rate
- ✅ Fuzzing: zero critical/high crashes after 60 min per target
- ✅ Adversarial tests: all hardening measures pass
- ✅ Cross-platform: all tests pass on all 3 platforms

### 3.16 Sprint 14 — Release Candidate

**Objectives:**

- Full documentation (API reference, CLI guide, writing rules guide, writing extractors guide)
- ADR documentation for all architectural decisions made during implementation
- Changelog generation for V1
- Release automation (GitHub Actions release workflow)
- Final security audit
- Performance validation against production-scale targets
- Bug fixes from integration testing

**Deliverables:**

- `docs/guides/contributing.md` — Complete contributing guide
- `docs/guides/writing-rules.md` — Rule development guide
- `docs/guides/writing-extractors.md` — Extractor development guide
- `docs/api/` — API documentation (generated from TSDoc)
- `docs/taxonomy/` — Taxonomy reference
- `docs/examples/` — Usage examples
- `CHANGELOG.md` — V1 changelog
- GitHub Actions release workflow
- Signed V1 release artifacts

**Dependencies:** Sprint 13

**Exit Criteria:**

- All documentation is complete and accurate
- Release workflow produces signed artifacts
- All CI gates pass (Gates 1–7 from SPEC-008 §10)
- Security audit finds no critical or high vulnerabilities
- Performance meets all targets
- V1 release candidate is ready

**Risks:**

- Documentation quality — rushing to meet release date. Mitigation: documentation is a sprint-long activity, not a last-day task.
- Last-minute bugs from integration testing. Mitigation: integration tests are run continuously; sprint 14 is for remaining edge cases only.

**Validation Gates:**

- ✅ All CI quality gates pass
- ✅ Documentation review: all guides are accurate and complete
- ✅ Security audit: no critical/high findings
- ✅ Performance: all budgets met
- ✅ Release workflow tested end-to-end: `npm publish --dry-run` succeeds
- ✅ V1 semantic version verified (all packages at correct version)

---

## 4. Dependency Graphs

### 4.1 Package Dependency Graph

```
                    ┌──────────────────────┐
                    │     @veris/cli        │
                    │     @veris/api        │
                    │   @veris/runners      │
                    │   @veris/plugins      │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   @veris/exporters    │
                    │   @veris/renderers    │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │    @veris/report      │
                    └──────────┬───────────┘
                               │
                    ┌──────────▼───────────┐
                    │   @veris/analyzer     │
                    └──┬───────┬───────┬───┘
                       │       │       │
              ┌────────▼──┐ ┌──▼───┐ ┌─▼────────┐
              │ @veris/   │ │@veris│ │ @veris/  │
              │extractors │ │rules-│ │knowledge │
              │           │ │engine│ │          │
              └─────┬─────┘ └──┬───┘ └────┬─────┘
                    │          │          │
              ┌─────▼──────────▼──────────▼──┐
              │        @veris/rules           │
              └───────────┬──────────────────┘
                          │
              ┌───────────▼──────────────────┐
              │ @veris/ai   @veris/telemetry  │
              │ @veris/config @veris/logger   │
              └───────────┬──────────────────┘
                          │
              ┌───────────▼──────────────────┐
              │        @veris/shared           │
              └───────────┬──────────────────┘
                          │
              ┌───────────▼──────────────────┐
              │         @veris/core            │
              │      (zero dependencies)      │
              └────────────────────────────────┘
```

### 4.2 Build Graph

```
Level 0 (parallel):    @veris/core
                        @veris/shared

Level 1 (parallel):    @veris/logger   @veris/config   @veris/telemetry
                        @veris/ai       @veris/knowledge

Level 2 (parallel):    @veris/extractors   @veris/rules-engine

Level 3:                @veris/rules (depends on rules-engine + knowledge)

Level 4:                @veris/analyzer (depends on extractors + rules-engine + rules + knowledge)

Level 5 (parallel):    @veris/report   @veris/exporters

Level 6:                @veris/renderers (depends on report)

Level 7 (parallel):    @veris/cli     @veris/api

Level 8 (parallel):    @veris/runners  @veris/plugins
```

**Build commands:**

```bash
# Full build (in order)
pnpm build:core && pnpm build:shared && pnpm build:layer1 && pnpm build:layer2 && pnpm build:layer3

# Incremental build
pnpm build --filter=<package> --filter=<package>'s dependencies

# Watch mode
pnpm build:watch --filter=<package>
```

### 4.3 Test Graph

```
Unit Tests (parallel per package):
  @veris/core → @veris/shared → (all packages in parallel)

Component Tests (parallel per package):
  Same as unit tests + cross-module within package

Integration Tests (sequential by dependency order):
  IT-001: extractors → knowledge
  IT-002: rules-engine → knowledge → rules
  IT-003: analyzer (correlation)
  IT-004: analyzer (trust, risk)
  IT-005: analyzer → report
  IT-006: report → exporters (JSON)
  IT-007: report → exporters (SARIF)
  IT-008: config → analyzer
  IT-009: plugins → extractors
  IT-010: all → telemetry

Pipeline Tests (sequential):
  Full extraction → classification → matching → scoring → reporting

E2E Tests (sequential):
  CLI invocation tests

Golden Tests (parallel per component):
  Extraction → Behavior → Rule → Finding → Chain → Trust → Risk → Report → Export

Corpus Regression (sequential):
  Full pipeline against security corpus (all samples)

Fuzzing (fully parallel per target):
  All parser fuzz targets in parallel
```

### 4.4 Runtime Graph

```
ScanSession start
    │
    ▼
Discovery ──► Classification ──► Extraction ──► Normalization
                                                    │
                                                    ▼
                                           Behavior Classification
                                                    │
                                                    ▼
                                            Rule Matching
                                           (parallel per artifact)
                                                    │
                                                    ▼
                                            Correlation Engine
                                                    │
                                                    ▼
                                            Trust Engine
                                                    │
                                                    ▼
                                            Risk Engine
                                                    │
                                                    ▼
                                            Reasoning Engine
                                                    │
                                                    ▼
                                            Report Builder
                                                    │
                                                    ▼
                                            Exporters / Renderers
```

### 4.5 Critical Path

The critical path for the `veris scan` command is:

```
Discovery → Classification → Extraction → Normalization → Behavior Classification
→ Rule Matching → Correlation → Trust → Risk → Reasoning → Report → Export
```

**Bottlenecks (identified from SPEC-008):**

1. **Extraction** (estimated 53.5% of total time) — AST parsing, binary parsing
2. **Rule Matching** (estimated 21.7% of total time) — Regex matching, composite rules
3. **Behavior Classification** (estimated 6.1% of total time) — Taxonomy mapping

**Parallelization opportunities:**

1. Artifact extraction is embarrassingly parallel (worker pool)
2. Rule matching per artifact is embarrassingly parallel
3. Export formats can be generated in parallel

---

## 5. Build Architecture

### 5.1 Workspace Layout

```
veris/
├── pnpm-workspace.yaml        # Workspace definition
├── package.json                # Root scripts, devDependencies
├── tsconfig.base.json          # Shared TypeScript config
├── eslint.config.js            # Root ESLint flat config
├── prettier.config.js          # Prettier config
│
├── packages/
│   ├── core/                   # @veris/core
│   ├── shared/                 # @veris/shared
│   ├── logger/                 # @veris/logger
│   ├── config/                 # @veris/config
│   ├── telemetry/              # @veris/telemetry
│   ├── ai/                     # @veris/ai
│   ├── extractors/             # @veris/extractors
│   ├── rules-engine/           # @veris/rules-engine
│   ├── rules/                  # @veris/rules
│   ├── knowledge/              # @veris/knowledge
│   ├── analyzer/               # @veris/analyzer
│   ├── report/                 # @veris/report
│   ├── exporters/              # @veris/exporters
│   ├── renderers/              # @veris/renderers
│   ├── cli/                    # @veris/cli
│   ├── api/                    # @veris/api
│   ├── runners/                # @veris/runners
│   ├── plugins/                # @veris/plugins
│   └── plugin-sdk/             # @veris/plugin-sdk (published separately)
│
├── tools/
│   ├── perf/                   # Benchmark suite
│   ├── security/               # Security testing suite
│   ├── codegen/                # Code generators
│   ├── scripts/                # Build/release helpers
│   └── ci/                     # CI helper scripts
│
├── fixtures/                   # Test fixtures
│   ├── samples/
│   ├── repos/
│   └── archives/
│
└── docs/                       # Documentation
```

### 5.2 Package References

Each package's `tsconfig.json` uses project references:

```jsonc
// packages/extractors/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "tsBuildInfoFile": "./dist/.tsbuildinfo",
  },
  "references": [
    { "path": "../core" },
    { "path": "../shared" },
    { "path": "../logger" },
    { "path": "../config" },
  ],
}
```

Each package's `package.json` uses workspace protocol:

```jsonc
{
  "name": "@veris/extractors",
  "version": "0.1.0",
  "dependencies": {
    "@veris/core": "workspace:*",
    "@veris/shared": "workspace:*",
    "@veris/logger": "workspace:*",
    "@veris/config": "workspace:*",
  },
}
```

### 5.3 Incremental Builds

TypeScript project references enable incremental builds:

```bash
# Build a package and its dependencies (incrementally)
pnpm build --filter=@veris/analyzer

# Build all packages (layer-aware)
pnpm build:all
```

**Build caching:** pnpm's content-addressable store caches dependencies. TypeScript `tsBuildInfoFile` caches compilation units. CI uses GitHub Actions cache with pnpm store.

### 5.4 Build Commands

| Command                           | Action                                        |
| --------------------------------- | --------------------------------------------- |
| `pnpm build`                      | Build all packages in dependency order        |
| `pnpm build:core`                 | Build core + shared                           |
| `pnpm build --filter=<pkg>`       | Build a specific package and its dependencies |
| `pnpm build:watch --filter=<pkg>` | Watch mode for a package                      |
| `pnpm clean`                      | Remove all `dist/` directories                |
| `pnpm lint`                       | ESLint all packages                           |
| `pnpm format`                     | Prettier all files                            |
| `pnpm test`                       | Run all tests                                 |
| `pnpm test --filter=<pkg>`        | Run tests for a specific package              |
| `pnpm typecheck`                  | TypeScript type checking only                 |

### 5.5 Release Builds

```yaml
# .github/workflows/release.yml
release:
  steps:
    - run: pnpm install --frozen-lockfile
    - run: pnpm build:core # Foundation first
    - run: pnpm build # Full build
    - run: pnpm lint
    - run: pnpm test
    - run: pnpm test:golden
    - run: pnpm benchmark:validate
    - run: pnpm publish -r --access public
```

### 5.6 Development Workflow

```bash
# 1. Clone and install
git clone https://github.com/veris/veris.git
cd veris
pnpm install

# 2. Build foundation
pnpm build:core

# 3. Build the package you're working on
pnpm build --filter=@veris/extractors

# 4. Start watch mode
pnpm build:watch --filter=@veris/extractors

# 5. Run tests
pnpm test --filter=@veris/extractors

# 6. Run tests in watch mode
pnpm test:watch --filter=@veris/extractors
```

---

## 6. Developer Workflow

### 6.1 Local Setup

```bash
# Prerequisites
Node.js >= 18
pnpm >= 8

# Clone
git clone https://github.com/veris/veris.git
cd veris

# Install
pnpm install

# Build
pnpm build:core
pnpm build

# Verify
pnpm test
pnpm lint
```

### 6.2 Branch Strategy

```
main            — Production-ready, protected
├── develop     — Integration branch, feature branches merge here
├── feat/*      — Feature branches (feat/rule-engine-scheduler)
├── fix/*       — Bug fix branches (fix/extractor-memory-leak)
├── perf/*      — Performance improvements (perf/cache-optimization)
├── docs/*      — Documentation only (docs/api-reference)
└── release/*   — Release branches (release/v1.0.0-rc.1)
```

**Branch rules:**

- `main` is protected — no direct pushes, PR required
- `develop` is the default branch for feature work
- Feature branches must be up-to-date with `develop` before merging
- Release branches are cut from `develop`
- Hotfix branches are cut from `main` and merged back to both `main` and `develop`

### 6.3 Commit Conventions

```
type(scope): description

Types:
  feat     — New feature
  fix      — Bug fix
  refactor — Code change that neither fixes nor adds
  perf     — Performance improvement
  test     — Adding or fixing tests
  docs     — Documentation only
  chore    — Build process, tooling, CI
  style    — Formatting only
  deps     — Dependency updates

Scopes:
  core, shared, logger, config, knowledge, rules-engine, rules,
  extractors, analyzer, report, exporters, renderers, cli, api,
  runners, plugins, plugin-sdk, tools, docs, ci, deps

Examples:
  feat(rules-engine): implement topological rule scheduler
  fix(extractors): handle empty ZIP archives gracefully
  perf(extractors): cache compiled regex patterns
  test(core): add determinism double-run validation tests
  docs(cli): add scan command examples to README
```

### 6.4 Pull Request Requirements

Every PR must include:

| Requirement      | Description                                 | Enforced By   |
| ---------------- | ------------------------------------------- | ------------- |
| Title            | Follows commit convention                   | GitHub action |
| Description      | What, why, how, testing                     | PR template   |
| Changelog entry  | `Added`, `Changed`, `Fixed`, `Removed`      | PR template   |
| Tests            | New code has tests, all existing tests pass | CI            |
| Coverage         | No decrease in branch coverage              | CI            |
| Golden snapshots | Updated if behavior changed                 | CI            |
| Lint             | ESLint passes                               | CI            |
| TypeScript       | Clean compilation                           | CI            |
| No circular deps | `madge` passes                              | CI            |
| Determinism      | Double-run validation passes                | CI            |
| Changelog        | Changeset added                             | CI            |

**PR size limits:**

- Maximum 400 lines changed per PR (excluding generated files, tests, and docs)
- Larger changes must be broken into multiple PRs
- Exceptions require maintainer approval

### 6.5 Code Review Checklist

```
□ Architecture compliance:
  □ Follows dependency direction rules (SPEC-001 §5)
  □ Uses interfaces over implementations (SPEC-001 §6)
  □ Public API surface is minimal and intentional
  □ No circular dependencies introduced

□ Correctness:
  □ All edge cases handled (empty, null, malformed)
  □ Error handling is explicit and typed
  □ Determinism is maintained
  □ Immutability is preserved (readonly types)
  □ Validation rules from SPEC-002 §8 are satisfied

□ Testing:
  □ Happy path tested
  □ Boundary conditions tested
  □ Error cases tested
  □ Edge cases tested
  □ Determinism double-run validated
  □ Golden snapshots updated if applicable

□ Performance:
  □ No O(n²) or worse algorithms in hot paths
  □ Memory allocations are bounded
  □ Caching is used where appropriate
  □ Async operations have timeouts

□ Security:
  □ All inputs are validated before use
  □ No eval() or dynamic code execution
  □ Size/bounds limits are enforced
  □ Terminal output is sanitized
  □ Plugin permissions are checked

□ Documentation:
  □ Public API has TSDoc comments
  □ Complex logic has inline comments
  □ Changeset describes the change
```

### 6.6 Release Workflow

```mermaid
1. Cut release branch: `release/v1.0.0-rc.1` from `develop`
2. Run full CI suite (Gates 1–7)
3. Fix any release-blocking issues
4. Create release PR: `release/v1.0.0-rc.1` → `main`
5. Code review + maintainer approval
6. Merge to `main`
7. GitHub Actions release workflow:
   a. Build all packages
   b. Run full test suite
   c. Run benchmarks + validate budgets
   d. Run security tests
   e. Generate changelog from changesets
   f. Publish packages to npm
   g. Create GitHub release with changelog
   h. Tag release: `v1.0.0-rc.1`
8. Merge release branch back to `develop`
```

### 6.7 Versioning Workflow

Using **Changesets** for version management:

```bash
# Add a changeset
pnpm changeset add

# Version packages
pnpm changeset version

# Publish
pnpm changeset publish
```

**Version rules (from SPEC-001 §14):**

- `@veris/core` starts at `1.0.0` and moves slowly
- `@veris/shared` starts at `1.0.0`
- All domain packages start at `0.1.0` until V1 stabilization
- `@veris/rules` moves fastest — new rules as minor versions
- Breaking changes to core types trigger coordinated major bump

### 6.8 Changelog Generation

Changelog is generated from changesets at release time:

```markdown
# @veris/analyzer

## 0.5.0

### Minor Changes

- feat: implement behavior chain detection in correlation engine
- feat: add risk dimension framework with 18 dimensions

### Patch Changes

- fix: correct risk double-counting for findings in behavior chains
- fix: handle empty trust profile for artifacts with no findings
- perf: optimize dimension score computation with bin-based aggregation
```

---

## 7. Definition of Done

### 7.1 Package DoD

| Criteria                                                     | Verification             |
| ------------------------------------------------------------ | ------------------------ |
| Public API surface defined in `index.ts`                     | Code review              |
| All types exported from `index.ts` are documented with TSDoc | Automated doc generation |
| Internal API (if applicable) in `internal.ts`                | Code review              |
| Zero circular dependencies                                   | `madge` check            |
| 90%+ branch coverage on domain packages                      | CI coverage gate         |
| All happy path, boundary, error, edge case tests pass        | CI test gate             |
| Determinism double-run validated                             | CI determinism gate      |
| Package builds cleanly (no TypeScript errors)                | CI build gate            |
| ESLint passes with no warnings                               | CI lint gate             |
| Package version correctly set                                | CI version check         |
| Changelog entry exists                                       | CI changelog check       |

### 7.2 Feature DoD

| Criteria                                           | Verification              |
| -------------------------------------------------- | ------------------------- |
| Feature implemented according to architecture spec | Code review               |
| Unit tests cover all required test categories      | CI test gate              |
| Integration tests pass (if cross-package)          | CI integration gate       |
| Golden snapshots match (if applicable)             | CI golden gate            |
| Performance within budget (if applicable)          | CI benchmark gate         |
| Feature documented in appropriate guide            | Documentation review      |
| No false-positive regressions introduced           | CI corpus regression gate |
| All edge cases handled                             | Code review               |

### 7.3 Rule DoD

| Criteria                                                     | Verification        |
| ------------------------------------------------------------ | ------------------- |
| Rule definition follows canonical `RuleDefinition` interface | Schema validation   |
| Rule has positive test (matches expected behavior)           | Unit test           |
| Rule has negative test (doesn't match benign behavior)       | Unit test           |
| Rule has false-positive regression test                      | FP regression suite |
| Rule has golden snapshot                                     | Golden test         |
| Rule manifest is valid                                       | Manifest validation |
| Rule severity is appropriate                                 | Code review         |
| Rule has explanation templates (short, detailed, technical)  | Code review         |
| Rule has remediation guidance                                | Code review         |
| Rule has CWE/OWASP references (where applicable)             | Code review         |
| Rule performance is within budget                            | Benchmark           |

### 7.4 Extractor DoD

| Criteria                                                | Verification           |
| ------------------------------------------------------- | ---------------------- |
| Extractor implements `Extractor` interface              | TypeScript compilation |
| Extractor has capability declarations                   | Code review            |
| Extractor declares explicit limits (size, time, depth)  | Code review            |
| Extractor has parser recovery (error-tolerant)          | Unit test              |
| Extractor has fallback behavior                         | Unit test              |
| Extractor produces valid `Feature[]` and `Capability[]` | Schema validation      |
| Extractor has golden snapshot                           | Golden test            |
| Extractor performance is within budget                  | Benchmark              |
| Extractor works offline                                 | Integration test       |

### 7.5 Plugin DoD

| Criteria                                         | Verification           |
| ------------------------------------------------ | ---------------------- |
| Plugin implements correct interface for its type | TypeScript compilation |
| Plugin has valid `manifest.json`                 | Manifest validation    |
| Plugin declares required permissions             | Code review            |
| Plugin lifecycle hooks are implemented           | Unit test              |
| Plugin sandbox isolation works                   | Integration test       |
| Plugin crashes don't affect host                 | Integration test       |
| Plugin has SDK compatibility check               | Manifest validation    |
| Plugin documentation exists                      | Documentation review   |

### 7.6 Renderer DoD

| Criteria                                               | Verification           |
| ------------------------------------------------------ | ---------------------- |
| Renderer implements `Renderer` interface               | TypeScript compilation |
| Renderer consumes `CanonicalReport` only (no analysis) | Code review            |
| Output format validates against spec                   | Validation test        |
| Empty states are handled (no findings, no chains)      | Unit test              |
| Error states are handled (malformed report)            | Unit test              |
| Renderer works offline                                 | Integration test       |
| Output file is self-contained (HTML renderer)          | Validation test        |

### 7.7 Release DoD

| Criteria                                     | Verification         |
| -------------------------------------------- | -------------------- |
| All CI quality gates pass (Gates 1–7)        | CI pipeline          |
| All packages have correct versions           | Version audit        |
| Changelog is complete and accurate           | Changelog review     |
| Release artifacts are built and signed       | Release workflow     |
| Performance budgets are met                  | Benchmark validation |
| Security audit passes                        | Security gate        |
| Documentation is up-to-date                  | Documentation review |
| Migration guide exists (if breaking changes) | Documentation review |
| Release notes are written                    | Release PR           |

### 7.8 Documentation DoD

| Criteria                                                   | Verification             |
| ---------------------------------------------------------- | ------------------------ |
| API reference is generated from TSDoc                      | Automated doc generation |
| All public exports are documented                          | Code review              |
| CLI guide has examples for all commands                    | Documentation review     |
| Writing rules guide has at least one complete example      | Documentation review     |
| Writing extractors guide has at least one complete example | Documentation review     |
| Architecture is explained at appropriate depth             | Documentation review     |
| Tutorials exist for common workflows                       | Documentation review     |
| ADRs exist for all significant decisions                   | Documentation review     |

### 7.9 Test Suite DoD

| Criteria                                                 | Verification        |
| -------------------------------------------------------- | ------------------- |
| Unit tests cover all modules (per-package threshold met) | CI coverage gate    |
| Component tests cover all packages                       | CI test gate        |
| Integration tests cover all cross-package contracts      | CI integration gate |
| Pipeline tests cover full analysis flow                  | CI pipeline gate    |
| E2E tests cover CLI scenarios                            | CI e2e gate         |
| Golden tests exist for all components                    | CI golden gate      |
| Corpus regression tests pass                             | CI nightly gate     |
| Adversarial tests pass                                   | CI nightly gate     |
| Fuzzing targets are configured for all parsers           | CI nightly gate     |
| Property-based tests exist for core invariants           | CI nightly gate     |
| Performance benchmarks are configured                    | CI nightly gate     |
| Determinism validation runs on every PR                  | CI determinism gate |

---

## 8. Documentation Strategy

### 8.1 Documentation Architecture

```
docs/
├── README.md                          # Entry point, links to all docs
│
├── architecture/                      # Architecture Decision Records
│   ├── ADR-001-monorepo-structure.md
│   ├── ADR-002-dependency-inversion.md
│   ├── ADR-003-report-model.md
│   ├── ADR-004-plugin-system.md
│   ├── ...
│   └── 001-repository-architecture-spec.md     # Frozen specs
│       ...
│   └── 009-implementation-blueprint-spec.md    # This document
│
├── guides/                            # Developer guides
│   ├── contributing.md                # Setup, build, test, PR workflow
│   ├── writing-rules.md               # Rule development guide
│   ├── writing-extractors.md          # Extractor development guide
│   ├── plugin-development.md          # Plugin SDK guide
│   ├── debugging.md                   # Debugging analysis pipelines
│   └── performance-tuning.md          # Performance optimization guide
│
├── api/                               # API reference (generated from TSDoc)
│   ├── core.md                        # @veris/core types reference
│   ├── analyzer.md                    # @veris/analyzer usage
│   ├── cli.md                         # CLI command reference
│   ├── exporters.md                   # Exporter format reference
│   └── sdk.md                         # Plugin SDK reference
│
├── taxonomy/                          # Taxonomy reference
│   ├── overview.md                    # Taxonomy philosophy and design
│   └── reference.md                   # Full taxonomy tree with CWE mappings
│
├── examples/                          # Usage examples
│   ├── basic-scan.md                  # Scanning a single file
│   ├── repo-scan.md                   # Scanning a repository
│   ├── ci-integration.md              # CI pipeline integration
│   ├── custom-rules.md                # Writing custom rules
│   └── custom-extractors.md           # Writing custom extractors
│
├── tutorials/                         # Step-by-step tutorials
│   ├── getting-started.md             # First scan
│   ├── investigating-findings.md      # Using the TUI
│   ├── policy-configuration.md        # Setting up policies
│   └── plugin-authoring.md            # Creating a plugin
│
├── migration/                         # Migration guides
│   └── v1-migration.md               # Migrating from alpha to V1 stable
│
└── rfcs/                              # RFCs for future changes
    ├── RFC-template.md
    └── ...
```

### 8.2 Documentation Generation

| Type               | Source               | Tool           | Frequency     | Output                       |
| ------------------ | -------------------- | -------------- | ------------- | ---------------------------- |
| API reference      | TSDoc in source      | TypeDoc        | On release    | `docs/api/` Markdown         |
| CLI reference      | CLI `--help` output  | Custom script  | On release    | `docs/api/cli.md`            |
| Taxonomy reference | Taxonomy definitions | Code generator | On release    | `docs/taxonomy/reference.md` |
| Architecture docs  | Manual               | Markdown       | Per-ADR       | `docs/architecture/`         |
| Guides             | Manual               | Markdown       | Per-feature   | `docs/guides/`               |
| Tutorials          | Manual               | Markdown       | Per-milestone | `docs/tutorials/`            |
| Changelog          | Changesets           | Automatic      | Per-release   | `CHANGELOG.md` per package   |

### 8.3 Documentation Principles

1. **ADRs for architecture decisions.** Every significant architectural decision is recorded as an ADR with context, decision, consequences, and status.
2. **Guides for developers.** Writing rules, extractors, and plugins each get their own guide with concrete examples.
3. **API reference for consumers.** Generated from TSDoc. Always accurate because it's derived from source.
4. **Tutorials for users.** Step-by-step walkthroughs for common workflows.
5. **RFCs for future changes.** Major changes start as RFCs with review period before implementation.
6. **Changelog for history.** Every release documents what changed, why, and migration instructions.

---

## 9. Release Strategy

### 9.1 Release Cadence

| Phase             | Version         | Schedule           | Packages                |
| ----------------- | --------------- | ------------------ | ----------------------- |
| Development       | `0.x.x`         | Throughout sprints | Per-sprint              |
| Alpha             | `1.0.0-alpha.x` | Sprint 12 complete | All V1 packages         |
| Beta              | `1.0.0-beta.x`  | Sprint 13 complete | All V1 packages         |
| Release Candidate | `1.0.0-rc.x`    | Sprint 14 complete | All V1 packages         |
| Stable            | `1.0.0`         | 2 weeks after RC   | All V1 packages         |
| Patch             | `1.0.x`         | As needed          | Per-package             |
| Minor             | `1.x.0`         | Quarterly          | Per-package             |
| Major             | `2.0.0`         | Annual             | Coordinated             |
| LTS               | `1.x`           | Annual             | Selected major versions |

### 9.2 Release Types

| Release Type | Triggers           | Testing                  | Notification   | Breaking Changes    |
| ------------ | ------------------ | ------------------------ | -------------- | ------------------- |
| **Alpha**    | Sprint completion  | CI Gates 1–4             | Internal       | Yes (expected)      |
| **Beta**     | Sprint 13 complete | CI Gates 1–6             | Early adopters | Yes (expected)      |
| **RC**       | Sprint 14 complete | CI Gates 1–7 + manual QA | Public         | Frozen              |
| **Stable**   | RC validated       | All gates + soak         | Public + npm   | No                  |
| **Hotfix**   | Critical bug       | CI Gates 1–4             | Urgent         | No                  |
| **Patch**    | Bug fix            | CI Gates 1–4             | Normal         | No                  |
| **Minor**    | New features       | CI Gates 1–6             | Normal         | Backward compatible |
| **Major**    | Breaking changes   | CI Gates 1–7 + migration | Announced      | Yes (documented)    |

### 9.3 Backward Compatibility Rules

| Change                                    | Compatible? | Version Bump | Notes                               |
| ----------------------------------------- | ----------- | ------------ | ----------------------------------- |
| Adding optional field to canonical object | ✅          | Minor        | Must have default                   |
| Adding new taxonomy node                  | ✅          | Minor        | Additive only                       |
| Adding new rule pack                      | ✅          | Minor        | No existing rule changes            |
| Adding new export format                  | ✅          | Minor        | New format only                     |
| Removing optional field                   | ✅          | Major        | Deprecate in minor, remove in major |
| Removing required field                   | ❌          | Major        | Breaking                            |
| Changing field type                       | ❌          | Major        | Breaking                            |
| Removing taxonomy node                    | ❌          | Major        | Deprecate in minor                  |
| Changing rule match behavior              | ❌          | Major        | Rule version bump                   |
| Changing score formula                    | ❌          | Major        | Trust/Risk/Confidence               |
| Fixing regex false positive               | ❌          | Patch        | Rule version bump                   |
| Adding new extractor                      | ✅          | Minor        | New extractor only                  |
| Changing extractor output                 | ❌          | Major        | Extractor version bump              |

### 9.4 LTS Strategy

| LTS Version | Release Date         | End of Life          | Support               |
| ----------- | -------------------- | -------------------- | --------------------- |
| V1 LTS      | V1 stable + 3 months | V2 stable + 6 months | Security patches only |
| V2 LTS      | V2 stable + 3 months | V3 stable + 6 months | Security patches only |

**LTS criteria:**

- Only major versions with demonstrated production adoption qualify for LTS
- LTS designation is announced at least 3 months before the next major release
- LTS receives security patches for 18 months after the next major release

### 9.5 Pre-Release Tags

| Tag    | Format          | npm dist-tag | Notes             |
| ------ | --------------- | ------------ | ----------------- |
| Alpha  | `1.0.0-alpha.1` | `alpha`      | May break         |
| Beta   | `1.0.0-beta.1`  | `beta`       | Feature complete  |
| RC     | `1.0.0-rc.1`    | `rc`         | Release candidate |
| Stable | `1.0.0`         | `latest`     | Production        |
| Hotfix | `1.0.1`         | `latest`     | Critical fix      |

---

## 10. Risk Register

### 10.1 Top Engineering Risks

| ID     | Risk                                                       | Probability | Impact   | Mitigation                                                                       | Monitoring                                |
| ------ | ---------------------------------------------------------- | ----------- | -------- | -------------------------------------------------------------------------------- | ----------------------------------------- |
| **R1** | Parser performance inadequate for production workloads     | Medium      | High     | Streaming architecture, worker pool, pre-filtering by size, AST caching          | Weekly throughput benchmarks              |
| **R2** | Rule false positive rate unacceptable for users            | Medium      | High     | FP regression tests, confidence thresholds, user-configurable severity overrides | FP rate tracking per release              |
| **R3** | Plugin sandbox isolation insufficient                      | Low         | Critical | Process isolation, permission model, resource limits, crash quarantine           | Security audit per release                |
| **R4** | TUI performance degrades with large finding sets           | Medium      | Medium   | Virtual scrolling, lazy loading, bin-based aggregation, pagination               | Performance benchmarks with 100K findings |
| **R5** | Configuration system becomes unwieldy with too many levels | Low         | Medium   | Deterministic priority, validation at every level, env var mapping               | Developer feedback after Sprint 2         |
| **R6** | Build times increase with package count                    | Medium      | Low      | TypeScript project references, incremental builds, CI caching                    | Build time tracking in CI                 |

### 10.2 Architectural Risks

| ID      | Risk                                                     | Probability | Impact   | Mitigation                                                                | Monitoring                   |
| ------- | -------------------------------------------------------- | ----------- | -------- | ------------------------------------------------------------------------- | ---------------------------- |
| **R7**  | Core types need changes that ripple through all packages | Low         | Critical | Frozen core types spec, semver major bump coordination, migration scripts | ADR for any core type change |
| **R8**  | Circular dependencies emerge between packages            | Low         | High     | Enforced by `madge` in CI, architectural review in PR                     | CI circular dependency gate  |
| **R9**  | Taxonomy becomes too large to maintain                   | Low         | Medium   | Max depth 3, max ~100 nodes per category, deprecation mechanism           | Taxonomy growth tracking     |
| **R10** | Interface contracts drift between packages               | Medium      | High     | Integration tests at every cross-package boundary, contract tests         | CI integration test gate     |

### 10.3 Performance Risks

| ID      | Risk                                             | Probability | Impact | Mitigation                                                                 | Monitoring                       |
| ------- | ------------------------------------------------ | ----------- | ------ | -------------------------------------------------------------------------- | -------------------------------- |
| **R11** | Regex matching becomes bottleneck                | Medium      | Medium | Linear-time regex engine, pattern timeout (100ms), compiled regex cache    | Rule profiling every benchmark   |
| **R12** | AST caching consumes too much memory             | Medium      | Medium | LRU eviction, per-session cache only, configurable max entries             | Memory profiling every benchmark |
| **R13** | Archive extraction performance on large archives | Medium      | High   | Streaming extraction, size limits, nested depth limits, zip bomb detection | Archive extraction benchmarks    |
| **R14** | Worker pool contention on CPU-bound extraction   | Low         | Medium | Configurable concurrency, backpressure, priority aging                     | Worker pool stats monitoring     |

### 10.4 Security Risks

| ID      | Risk                                        | Probability | Impact   | Mitigation                                                            | Monitoring                      |
| ------- | ------------------------------------------- | ----------- | -------- | --------------------------------------------------------------------- | ------------------------------- |
| **R15** | Malformed input crashes parser (DoS)        | Medium      | Critical | Error-tolerant parsing, timeouts, memory limits, fuzz testing         | Fuzzing results per nightly run |
| **R16** | Zip bomb bypasses compression ratio check   | Low         | Critical | Multiple detection signals (ratio, total decompressed, nesting depth) | Hardening test suite            |
| **R17** | Terminal escape injection in artifact paths | Low         | Medium   | Output sanitization for all user-controlled strings                   | Hardening test suite            |
| **R18** | Unicode spoofing bypasses pattern matching  | Medium      | Medium   | NFC normalization, homoglyph detection, mixed-script detection        | Hardening test suite            |

### 10.5 Plugin Ecosystem Risks

| ID      | Risk                                       | Probability | Impact   | Mitigation                                                    | Monitoring             |
| ------- | ------------------------------------------ | ----------- | -------- | ------------------------------------------------------------- | ---------------------- |
| **R19** | Low plugin adoption due to complex SDK     | Medium      | Medium   | Simple SDK with helper utilities, testing framework, examples | Plugin usage metrics   |
| **R20** | Plugin supply chain attacks                | Low         | Critical | Manifest signing (V2+), dependency pinning, permission model  | Security audit         |
| **R21** | API instability discourages plugin authors | Medium      | Medium   | Frozen core contracts, SDK versioning, deprecation notices    | Plugin author feedback |

### 10.6 Maintenance Risks

| ID      | Risk                                   | Probability | Impact | Mitigation                                                | Monitoring                    |
| ------- | -------------------------------------- | ----------- | ------ | --------------------------------------------------------- | ----------------------------- |
| **R22** | Golden snapshot drift goes unnoticed   | Low         | Medium | CI golden validation gate, drift report on every PR       | CI golden gate                |
| **R23** | Test suite becomes too slow for CI     | Medium      | Medium | Test level separation (PR vs nightly), parallel execution | CI test timing tracking       |
| **R24** | Documentation becomes outdated         | Medium      | Medium | Generated API docs from TSDoc, doc review in PR checklist | Documentation freshness check |
| **R25** | Dependency updates break compatibility | Medium      | Medium | Dependabot, automated update PRs, integration test gate   | Weekly dependency audit       |

### 10.7 Community Risks

| ID      | Risk                                  | Probability | Impact | Mitigation                                                           | Monitoring           |
| ------- | ------------------------------------- | ----------- | ------ | -------------------------------------------------------------------- | -------------------- |
| **R26** | Low community contribution            | Medium      | Medium | Clear contributing guide, good-first-issue tags, community calls     | Contribution metrics |
| **R27** | Forking due to restrictive licensing  | Low         | Medium | MIT license, permissive plugin ecosystem                             | —                    |
| **R28** | Competing tools with faster iteration | Medium      | Medium | Focus on differentiation (deterministic, explainable, offline-first) | Competitive analysis |

---

## 11. Engineering Tradeoffs

### 11.1 Core Package Scope

**Tradeoff:** A minimal `@veris/core` (types only) reduces coupling but requires every package that needs shared behavior to add its own utilities. A richer core includes validation helpers and factory functions but increases the versioning surface.

**Decision:** Minimal core with types, errors, and constants. Factory functions for test objects live in `@veris/shared/testing`. Validation logic lives in each package. This keeps `@veris/core` extremely stable.

### 11.2 Monorepo vs. Multi-Repo

**Tradeoff:** Monorepo (pnpm workspaces) provides unified versioning, atomic commits, and shared tooling but requires more sophisticated CI and can have slower installs. Multi-repo provides independent versioning but requires cross-repo coordination.

**Decision:** Monorepo. The dependency graph is tight enough that atomic cross-package changes are essential. pnpm's workspace protocol and content-addressable store make installs fast enough.

### 11.3 Ink (React) vs. Raw Terminal Control for TUI

**Tradeoff:** Ink provides component composition, hooks, and declarative rendering familiar to React developers but has higher overhead than raw terminal control. Raw control is more performant but requires building all UI infrastructure from scratch.

**Decision:** Ink. The component model and developer experience outweigh the performance overhead. Virtual scrolling and memoization close the performance gap for large datasets.

### 11.4 Process Isolation vs. Thread Isolation for Plugins

**Tradeoff:** Process isolation (child processes) is stronger (separate memory space, crash isolation) but slower (IPC overhead). Thread isolation (worker threads) is faster but weaker (shared memory, crash can affect host).

**Decision:** Process isolation for plugins. Security and reliability outweigh the IPC overhead. Plugin calls are infrequent enough that IPC latency is negligible.

### 11.5 Multiplicative vs. Additive Confidence

**Tradeoff:** Multiplicative confidence (product of factors) ensures that every link in the evidence chain must be strong for high confidence. Additive confidence (weighted sum) is more forgiving but can mask weak links.

**Decision:** Multiplicative confidence. This is the single most important design decision for the scoring system. A weak parser recovery appropriately reduces confidence regardless of other factors.

### 11.6 Risk Density vs. Risk Volume

**Tradeoff:** Risk density (mean risk per artifact) fairly represents concentration of issues but can hide overall magnitude in large repos. Risk volume (total risk) highlights magnitude but unfairly penalizes large projects.

**Decision:** Risk density as the primary metric. Volume as secondary information. This prevents large repositories from having automatically inflated scores.

### 11.7 Strict Parsing vs. Error-Tolerant Parsing

**Tradeoff:** Strict parsing is faster and simpler but fails on the first syntax error. Error-tolerant parsing is slower and more complex but produces useful output from partially valid files.

**Decision:** Error-tolerant parsing for all extractors. Strict mode as opt-in configuration. Malformed files are common in security analysis — the system must handle them gracefully.

### 11.8 Full SDK vs. Minimal SDK

**Tradeoff:** Full SDK (helpers, testing utilities, type definitions) is more convenient for plugin authors but increases surface area. Minimal SDK is easier to maintain but harder to develop with.

**Decision:** Full SDK with helpers and testing utilities. SDK is versioned independently. Breaking changes trigger major version bumps.

### 11.9 Active Development vs. Long-Term Stability

**Tradeoff:** Active development (frequent changes, rapid iteration) enables fast feature delivery but can destabilize the API. Long-term stability (frozen APIs, slow change) provides reliability but may frustrate users waiting for features.

**Decision:** Both. Active development during pre-1.0 with frequent alpha/beta releases. Post-1.0, commit to stability with clear deprecation windows and quarterly minor releases.

---

## 12. Common Implementation Mistakes

### 12.1 Core Package Bloat

**Mistake:** Adding utility functions, validation logic, or helper classes to `@veris/core` because it's convenient.

**Prevention:** `@veris/core` is types, errors, and constants only. Everything else goes in `@veris/shared` or the consuming package. Enforce with CODEOWNERS and code review.

### 12.2 Extractors Producing Findings

**Mistake:** An extractor detects a suspicious pattern and emits it as a finding, bypassing the Knowledge Layer and Rule Engine.

**Prevention:** Extractors produce `Feature[]` and `Capability[]` only. The return type of `extract()` enforces this at compile time. No `Finding` type may appear in extractor output.

### 12.3 Rules Parsing Files Directly

**Mistake:** A rule inspects raw file content instead of consuming normalized Behaviors.

**Prevention:** Rules consume `Behavior[]` only. The `Rule.match()` signature takes `Behavior[]` as input. No file path or raw content access is available to rules.

### 12.4 Over-Engineering the Plugin System

**Mistake:** Designing an elaborate plugin host with full VM-level sandboxing, plugin registry, and marketplace integration before core functionality is stable.

**Prevention:** V1 plugin system is a thin shell: process isolation, simple filesystem discovery, basic permission model. Full sandboxing and marketplace are V2+.

### 12.5 Golden Snapshots as Afterthought

**Mistake:** Writing golden tests after implementation is complete, when behavioral drift is already baked in.

**Prevention:** Golden snapshots are captured during the sprint that produces the component. They are the first test written for a new component, not the last.

### 12.6 Ignoring Parser Edge Cases

**Mistake:** Testing extractors only with well-formed inputs, missing the reality that security tools process untrusted, malformed, and adversarial inputs.

**Prevention:** Every extractor must have tests for: empty input, corrupted headers, truncated files, encoding edge cases, and adversarial (zip bomb, path traversal) inputs.

### 12.7 Configuration Merge Confusion

**Mistake:** Ambiguous behavior when multiple configuration sources set the same value.

**Prevention:** Deterministic priority (6 levels, higher always wins). No merging of conflicting values. Documented priority with resolution trace.

### 12.8 Non-Deterministic Floating Point

**Mistake:** Using floating-point accumulations that produce different results depending on evaluation order.

**Prevention:** Use deterministic accumulation (sorted order, fixed precision). Test determinism with double-run validation. Document any non-determinism as a bug.

### 12.9 Trust Eliminating Evidence

**Mistake:** A signed binary from a trusted publisher has its findings suppressed because it's "trusted."

**Prevention:** Trust never eliminates evidence. Trust is a ±10% presentation modifier. The base risk score is always available and never modified by trust.

### 12.10 Skipping Integration Tests

**Mistake:** Integration tests are deferred to "later" because unit tests pass, allowing interface drift between packages.

**Prevention:** Integration tests are written during the sprint that creates the cross-package boundary. They run on every PR to the `develop` branch.

---

## 13. Final Recommendations

### 13.1 Critical Success Factors

1. **Keep `@veris/core` extremely lean.** Every addition to core is a versioning commitment to every other package. When in doubt, put it in the consuming package.

2. **Test the boundaries first.** Integration tests at cross-package boundaries catch more regressions than unit tests. Focus testing effort on the contracts between packages.

3. **Golden snapshots from day one.** Capture expected outputs as soon as a component produces output. Golden drift detection prevents accidental behavioral changes.

4. **Performance budgets are non-negotiable.** Establish benchmarks in Sprint 0 and run them every sprint. Performance debt is harder to fix than functional debt.

5. **Determinism is the killer feature.** VERIS's core value proposition is deterministic, explainable analysis. Every design decision should be evaluated against "does this preserve determinism?"

6. **Parser recovery is not optional.** Malformed files are the rule, not the exception. Every parser must handle errors gracefully and produce partial results.

7. **Plugin system is V2 work in V1 clothing.** The V1 plugin host should be a thin shell that validates the architecture. Full sandboxing, marketplace, and signing are V2+.

8. **Documentation is a deliverable, not an afterthought.** Every sprint includes documentation deliverables. Documentation is reviewed alongside code.

### 13.2 Implementation Invariants (Summary)

```
1. @veris/core imports nothing from the monorepo.
2. No circular dependencies.
3. Extractors only extract. Rules only match. Analyzer only orchestrates.
4. AI is a consumer, never an analyst.
5. All analysis is deterministic.
6. Everything works offline.
7. Every package has a single public entry point.
8. Dependencies flow downward only.
9. Confidence is multiplicative.
10. Trust never eliminates evidence.
```

### 13.3 V1 Scope Boundaries

| Capability                        | Ships in V1 | Ships in V1.x | Ships in V2 | Will Not Ship |
| --------------------------------- | ----------- | ------------- | ----------- | ------------- |
| Core types & data model           | ✅          | —             | —           | —             |
| Shared utilities                  | ✅          | —             | —           | —             |
| Logger, Config                    | ✅          | —             | —           | —             |
| Artifact classification           | ✅          | —             | —           | —             |
| Python, JS, Bash extractors       | ✅          | —             | —           | —             |
| PE, ELF extractors                | ✅          | —             | —           | —             |
| ZIP, TAR, GZip extractors         | ✅          | —             | —           | —             |
| Secrets, Config rule packs        | ✅          | —             | —           | —             |
| Scripts, Archives rule packs      | ✅          | —             | —           | —             |
| Rule engine (all matchers)        | ✅          | —             | —           | —             |
| Analyzer pipeline                 | ✅          | —             | —           | —             |
| Correlation engine                | ✅          | —             | —           | —             |
| Trust, Risk, Confidence engines   | ✅          | —             | —           | —             |
| Reasoning engine                  | ✅          | —             | —           | —             |
| Report builder + diff             | ✅          | —             | —           | —             |
| JSON, SARIF, Markdown, CSV export | ✅          | —             | —           | —             |
| HTML renderer                     | ✅          | —             | —           | —             |
| Interactive TUI                   | ✅          | —             | —           | —             |
| CLI commands (scan, report, init) | ✅          | —             | —           | —             |
| Programmatic API                  | ✅          | —             | —           | —             |
| Local runner, CI runner           | ✅          | —             | —           | —             |
| Plugin host (thin shell)          | ✅          | —             | —           | —             |
| Plugin SDK (contracts)            | ✅          | —             | —           | —             |
| AI Consumer plugins               | —           | ✅            | —           | —             |
| Panel, Theme, Policy plugins      | —           | —             | ✅          | —             |
| Full plugin sandbox (VM-level)    | —           | —             | ✅          | —             |
| Plugin marketplace                | —           | —             | ✅          | —             |
| Multi-pane workspace TUI          | —           | —             | ✅          | —             |
| Diff mode (side-by-side)          | —           | ✅            | —           | —             |
| Historical comparison             | —           | —             | ✅          | —             |
| Remote sessions                   | —           | —             | ✅          | —             |
| Enterprise dashboard              | —           | —             | —           | ✅            |
| SaaS / Cloud offering             | —           | —             | —           | ✅            |
| Mobile app extractors             | —           | —             | ✅          | —             |
| Rust, Go, Java extractors         | —           | ✅            | —           | —             |
| Docker/Terraform/K8s extractors   | —           | —             | ✅          | —             |
| Compliance scoring (PCI, SOC2)    | —           | ✅            | —           | —             |
| SBOM analysis                     | —           | —             | ✅          | —             |
| AI in analysis pipeline           | —           | —             | —           | ✅ (never)    |

### 13.4 Final Words

The VERIS architecture is comprehensive, opinionated, and production-oriented. The 14-sprint roadmap converts 8 frozen specifications into an executable plan. The key to success is discipline: stay within the architecture contracts, maintain determinism, and validate every layer before building the next.

The architecture is designed to evolve through V4 without major restructuring. The first implementation — V1 — must resist the temptation to over-engineer. Build the thin version that works, validate it, and then extend.

---

_End of SPEC-009. This document provides the executable implementation blueprint for VERIS V1, derived from the frozen architectural specifications (SPEC-001 through SPEC-008)._
