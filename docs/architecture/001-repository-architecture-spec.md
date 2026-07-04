# VERIS Repository Architecture & Package Design — SPEC-001

**Status:** Frozen  
**Version:** 1.0  
**Applies to:** Repository layout, package boundaries, dependency rules, naming, build, testing, and expansion strategy.  
**Scope:** V1 through V4 without major restructuring.

---

## Table of Contents

1. [Architecture Philosophy](#1-architecture-philosophy)
2. [Complete Repository Tree](#2-complete-repository-tree)
3. [Package Responsibilities](#3-package-responsibilities)
4. [Dependency Diagram](#4-dependency-diagram)
5. [Allowed Dependency Directions](#5-allowed-dependency-directions)
6. [Internal API Boundaries](#6-internal-api-boundaries)
7. [Shared Package Strategy](#7-shared-package-strategy)
8. [Build Strategy](#8-build-strategy)
9. [Testing Package Organization](#9-testing-package-organization)
10. [Documentation Organization](#10-documentation-organization)
11. [Rule Pack Organization](#11-rule-pack-organization)
12. [Extractor Organization](#12-extractor-organization)
13. [Plugin Organization](#13-plugin-organization)
14. [Versioning Strategy](#14-versioning-strategy)
15. [Naming Conventions](#15-naming-conventions)
16. [Future Expansion Considerations](#16-future-expansion-considerations)
17. [Common Architecture Mistakes to Avoid](#17-common-architecture-mistakes-to-avoid)
18. [Final Recommendations](#18-final-recommendations)

---

## 1. Architecture Philosophy

VERIS follows **Strict Domain-Driven Package Architecture** built on three principles:

### 1.1 Dependency Rule (Layered)

Packages may only depend on packages at their own layer or below. No upward or lateral dependencies between sibling packages of the same layer unless mediated by an interface in a lower layer.

### 1.2 Dependency Inversion at Every Boundary

Each package owns its interface contracts. A consumer depends on the contract (interface + types), not the implementation. Implementations are injected at composition root.

### 1.3 Package-as-Module

Each package is independently buildable, independently testable, versioned separately (within the monorepo), and replaceable by a different implementation of the same contract. No package reaches into another package's `src/` or `internal/`.

---

## 2. Complete Repository Tree

```
veris/
├── .github/
│   ├── actions/
│   │   ├── build/                        # Reusable build action
│   │   ├── lint/                         # Reusable lint action
│   │   ├── test/                         # Reusable test action
│   │   └── release/                      # Reusable release action
│   ├── workflows/
│   │   ├── ci.yml                        # PR & push CI
│   │   ├── release.yml                   # Tag-based publish
│   │   ├── nightly.yml                   # Nightly perf & integration
│   │   └── docs.yml                      # Docs build & deploy
│   └── CODEOWNERS
│
├── packages/
│   │
│   │  ── Layer 0: Foundation ──
│   │
│   ├── core/                             # @veris/core
│   │   ├── src/
│   │   │   ├── types/                    # Canonical domain types
│   │   │   │   ├── analysis.ts
│   │   │   │   ├── artifact.ts
│   │   │   │   ├── finding.ts
│   │   │   │   ├── severity.ts
│   │   │   │   ├── location.ts
│   │   │   │   ├── taxonomy.ts
│   │   │   │   ├── report.ts
│   │   │   │   ├── rule.ts
│   │   │   │   └── index.ts
│   │   │   ├── errors/                   # Domain error hierarchy
│   │   │   │   ├── veris-error.ts
│   │   │   │   ├── parse-error.ts
│   │   │   │   ├── extract-error.ts
│   │   │   │   ├── rule-error.ts
│   │   │   │   └── index.ts
│   │   │   ├── constants/                # Magic numbers, enums, string literals
│   │   │   │   ├── limits.ts
│   │   │   │   ├── platform.ts
│   │   │   │   └── index.ts
│   │   │   └── index.ts                  # Barrel export of ONLY stable types & errors
│   │   ├── __tests__/
│   │   ├── benchmark/                    # Microbenchmarks for type operations
│   │   ├── CHANGELOG.md
│   │   └── package.json
│   │
│   ├── shared/                           # @veris/shared
│   │   ├── src/
│   │   │   ├── collections/             # Immutable/tracking collections
│   │   │   ├── serialization/           # JSON, YAML, CBOR, Protocol Buffers
│   │   │   ├── hashing/                 # SHA-256, BLAKE3 wrappers
│   │   │   ├── fs/                      # Safe filesystem operations
│   │   │   ├── net/                     # URL parsing, safe HTTP helpers
│   │   │   ├── stream/                  # Line-based stream processors
│   │   │   ├── path/                    # Cross-platform path resolution
│   │   │   ├── platform/               # OS/binary detection helpers
│   │   │   ├── result/                 # Result<T, E> monad
│   │   │   ├── version/                # Semver comparison utilities
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   ├── benchmark/
│   │   └── package.json
│   │
│   │  ── Layer 1: Framework ──
│   │
│   ├── logger/                           # @veris/logger
│   │   ├── src/
│   │   │   ├── transports/              # Console, file, JSON, silent
│   │   │   ├── formatters/              # Structured, pretty, JSON-lines
│   │   │   ├── logger.ts                # Public interface
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   └── package.json
│   │
│   ├── config/                           # @veris/config
│   │   ├── src/
│   │   │   ├── loaders/                 # JSON, YAML, TOML, args, env
│   │   │   ├── validators/              # Zod schemas per config domain
│   │   │   ├── schema/                  # Canonical config shape
│   │   │   ├── config.ts               # Merged runtime config
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   └── package.json
│   │
│   ├── telemetry/                        # @veris/telemetry
│   │   ├── src/
│   │   │   ├── metrics/                 # Counter, gauge, histogram
│   │   │   ├── tracing/                 # Span-based (OpenTelemetry)
│   │   │   ├── reporter/               # stdout, OTLP, none
│   │   │   ├── telemetry.ts            # Public interface
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   └── package.json
│   │
│   ├── ai/                               # @veris/ai (consumer only, never analysis)
│   │   ├── src/
│   │   │   ├── providers/              # Open AI, Anthropic, Ollama adapters
│   │   │   ├── prompts/                # Prompt templates (no analysis logic)
│   │   │   ├── chat/                   # Chat completion interface
│   │   │   ├── embeddings/            # Embedding interface
│   │   │   ├── ai.ts                  # Unified consumer facade
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   └── package.json
│   │
│   │  ── Layer 2: Domain ──
│   │
│   ├── extractors/                       # @veris/extractors
│   │   ├── src/
│   │   │   ├── interfaces/             # Extractor, ExtractorRegistry contracts
│   │   │   ├── registry/              # ExtractorRegistry implementation
│   │   │   ├── builtins/              # Shipping extractors
│   │   │   │   ├── archive-extractor/
│   │   │   │   ├── executable-extractor/
│   │   │   │   ├── script-extractor/
│   │   │   │   ├── repository-extractor/
│   │   │   │   ├── text-extractor/
│   │   │   │   └── binary-extractor/
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   ├── benchmark/
│   │   └── package.json
│   │
│   ├── rules-engine/                     # @veris/rules-engine
│   │   ├── src/
│   │   │   ├── interfaces/             # Rule, RuleSet, RuleContext, RuleMatcher
│   │   │   ├── engine/                 # RuleEngine, RuleScheduler, EligibilityChecker
│   │   │   ├── matchers/              # Pattern, AST, heuristic, composite
│   │   │   ├── evaluator/             # Expression evaluator (safe sandbox)
│   │   │   ├── scheduler/            # Dependency-aware rule scheduling
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   ├── benchmark/
│   │   └── package.json
│   │
│   ├── rules/                            # @veris/rules (shipped rule packs)
│   │   ├── src/
│   │   │   ├── packs/
│   │   │   │   ├── secrets/            # credentials, tokens, keys
│   │   │   │   ├── misconfiguration/   # config files, env, permissions
│   │   │   │   ├── injection/          # SQL, command, XSS, path traversal
│   │   │   │   ├── crypto/             # Weak crypto, hardcoded secrets
│   │   │   │   ├── file-system/        # Unsafe FS operations
│   │   │   │   └── best-practices/     # Code quality, deprecation
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   └── package.json
│   │
│   ├── knowledge/                        # @veris/knowledge
│   │   ├── src/
│   │   │   ├── taxonomy/               # Canonical taxonomy tree
│   │   │   │   ├── categories.ts
│   │   │   │   ├── mappings.ts
│   │   │   │   └── index.ts
│   │   │   ├── references/            # OWASP, CWE, NIST mappings
│   │   │   ├── enrichment/            # Human-readable descriptions, remediation
│   │   │   ├── registry/             # KnowledgeBase registry
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   └── package.json
│   │
│   │  ── Layer 3: Analysis ---
│   │
│   ├── analyzer/                         # @veris/analyzer (orchestrator)
│   │   ├── src/
│   │   │   ├── pipeline/               # AnalysisPipeline (orchestrator)
│   │   │   │   ├── pipeline.ts
│   │   │   │   ├── stages.ts
│   │   │   │   └── index.ts
│   │   │   ├── lifecycle/             # Pre/post hooks, middleware
│   │   │   ├── scheduler/            # Artifact scheduling & dedup
│   │   │   ├── analyzer.ts           # Public API entry
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   ├── benchmark/
│   │   └── package.json
│   │
│   │  ── Layer 4: Report & Output ---
│   │
│   ├── report/                           # @veris/report
│   │   ├── src/
│   │   │   ├── builder/                # ReportBuilder (canonical report construction)
│   │   │   ├── model/                  # ReportModel, FindingModel, etc.
│   │   │   ├── diff/                   # ReportDiff between runs
│   │   │   ├── summary/               # Aggregation, statistics
│   │   │   ├── report.ts             # Public API
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   └── package.json
│   │
│   ├── exporters/                        # @veris/exporters
│   │   ├── src/
│   │   │   ├── interfaces/             # Exporter contract
│   │   │   ├── formats/               # Implementations
│   │   │   │   ├── json/
│   │   │   │   ├── sarif/
│   │   │   │   ├── html/
│   │   │   │   ├── markdown/
│   │   │   │   ├── csv/
│   │   │   │   └── junit/
│   │   │   ├── exporter.ts           # Exporter registry & dispatch
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   └── package.json
│   │
│   │  ── Layer 5: Application ---
│   │
│   ├── cli/                              # @veris/cli
│   │   ├── src/
│   │   │   ├── commands/               # scan, report, init, validate, version, completion
│   │   │   │   ├── scan/
│   │   │   │   ├── report/
│   │   │   │   ├── init/
│   │   │   │   ├── validate/
│   │   │   │   └── version/
│   │   │   ├── middleware/            # Config loading, telemetry init
│   │   │   ├── tui/                   # Interactive terminal UI (ink/react)
│   │   │   │   ├── components/
│   │   │   │   ├── hooks/
│   │   │   │   └── index.ts
│   │   │   ├── cli.ts                 # Entry point
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   └── package.json
│   │
│   ├── api/                              # @veris/api (programmatic API)
│   │   ├── src/
│   │   │   ├── public/                 # Public API surface
│   │   │   │   ├── veris.ts           # Primary client
│   │   │   │   ├── scan.ts
│   │   │   │   ├── analyze.ts
│   │   │   │   └── index.ts
│   │   │   ├── internal/              # Internal wiring (DI container)
│   │   │   │   ├── container.ts
│   │   │   │   └── wiring.ts
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   └── package.json
│   │
│   │  ── Layer 6: Runners ---
│   │
│   ├── runners/                          # @veris/runners (optional execution modes)
│   │   ├── src/
│   │   │   ├── local-runner/           # Local FS scanning
│   │   │   ├── ci-runner/             # CI integration (stdin/stdout)
│   │   │   ├── daemon-runner/         # Watch mode / persistent
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   └── package.json
│   │
│   │  ── Layer 7: Plugins (future) ---
│   │
│   ├── plugins/                          # @veris/plugins (host + SDK)
│   │   ├── src/
│   │   │   ├── host/                   # PluginHost — loading, sandboxing, lifecycle
│   │   │   ├── sdk/                   # PluginSDK — contracts, helpers (published separately)
│   │   │   ├── manifest/             # PluginManifest parser & validator
│   │   │   └── index.ts
│   │   ├── __tests__/
│   │   └── package.json
│   │
│   └── renderers/                        # @veris/renderers (TUI, web, CI)
│       ├── src/
│       │   ├── interfaces/             # Renderer contract
│       │   ├── tui-renderer/          # Terminal rendering (ink)
│       │   ├── html-renderer/         # HTML report rendering
│       │   ├── markdown-renderer/     # Markdown report rendering
│       │   └── index.ts
│       ├── __tests__/
│       └── package.json
│
├── tools/
│   ├── perf/                             # Performance benchmarking suite
│   │   ├── scenarios/
│   │   ├── fixtures/
│   │   └── report/
│   ├── security/                         # Security testing suite
│   │   ├── fuzzing/
│   │   ├── boundary/
│   │   └── adversarial/
│   ├── codegen/                          # Code generators (taxonomy, etc.)
│   └── scripts/                          # Build/release helpers
│
├── docs/
│   ├── architecture/                     # Architecture Decision Records (ADRs)
│   │   ├── ADR-001-monorepo-structure.md
│   │   └── ...
│   ├── guides/
│   │   ├── contributing.md
│   │   ├── writing-rules.md
│   │   ├── writing-extractors.md
│   │   └── plugin-development.md
│   ├── api/
│   │   ├── core.md
│   │   ├── analyzer.md
│   │   └── cli.md
│   ├── taxonomy/
│   │   ├── overview.md
│   │   └── reference.md
│   ├── examples/
│   ├── rfcs/                             # RFCs for major changes
│   └── README.md
│
├── fixtures/                             # Test fixtures (committed, versioned)
│   ├── samples/
│   │   ├── safe/
│   │   └── malicious/
│   └── repos/
│
├── .github/
│   └── ...                               # (shown at top)
│
├── package.json                          # Root workspace config (pnpm workspaces)
├── pnpm-workspace.yaml
├── tsconfig.base.json                    # Shared TS config
├── eslint.config.js                      # Root ESLint flat config
├── prettier.config.js
├── .gitignore
├── .env.example
├── MAINTENANCE.md
├── ROADMAP.md
└── README.md
```

---

## 3. Package Responsibilities

### Layer 0: Foundation (No Production Dependencies)

| Package         | Responsibility                                                                                                 | Dependencies  | Consumers                   |
| --------------- | -------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------- |
| `@veris/core`   | Canonical domain types, error hierarchy, constants                                                             | None          | All packages                |
| `@veris/shared` | General-purpose utilities (collections, hashing, FS, net, path, Result monad, platform, serialization, semver) | `@veris/core` | All non-foundation packages |

### Layer 1: Framework

| Package            | Responsibility                                           | Dependencies                   |
| ------------------ | -------------------------------------------------------- | ------------------------------ |
| `@veris/logger`    | Structured logging with pluggable transports/formatters  | `@veris/core`, `@veris/shared` |
| `@veris/config`    | Multi-source config loading, merging, validation         | `@veris/core`, `@veris/shared` |
| `@veris/telemetry` | Metrics, tracing, OpenTelemetry integration              | `@veris/core`                  |
| `@veris/ai`        | AI provider adapters (consumer only — no analysis logic) | `@veris/core`, `@veris/shared` |

### Layer 2: Domain

| Package               | Responsibility                                                        | Dependencies                                                                     |
| --------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `@veris/extractors`   | Artifact extraction from files, archives, repos, executables, scripts | `@veris/core`, `@veris/shared`, `@veris/logger`, `@veris/config`                 |
| `@veris/rules-engine` | Rule matching, evaluation, scheduling, sandboxed expression eval      | `@veris/core`, `@veris/shared`, `@veris/logger`, `@veris/knowledge` (types only) |
| `@veris/rules`        | Shipped rule pack definitions                                         | `@veris/core`, `@veris/rules-engine` (interfaces only)                           |
| `@veris/knowledge`    | Taxonomy, CWE/OWASP mappings, remediation text                        | `@veris/core`                                                                    |

### Layer 3: Analysis

| Package           | Responsibility                                                                                                  | Dependencies                                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@veris/analyzer` | Orchestrates the analysis pipeline — loads config, selects extractors, runs the rules engine, collects findings | `@veris/core`, `@veris/extractors` (interfaces only), `@veris/rules-engine`, `@veris/knowledge`, `@veris/logger`, `@veris/config`, `@veris/telemetry` |

### Layer 4: Report & Output

| Package            | Responsibility                                                  | Dependencies                                    |
| ------------------ | --------------------------------------------------------------- | ----------------------------------------------- |
| `@veris/report`    | Canonical report construction, diffing, aggregation             | `@veris/core`, `@veris/knowledge`               |
| `@veris/exporters` | Report serialization to JSON, SARIF, HTML, Markdown, CSV, JUnit | `@veris/report`, `@veris/core`, `@veris/shared` |

### Layer 5: Application

| Package      | Responsibility                                    | Dependencies                                                                                                                                                    |
| ------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@veris/cli` | CLI entry point, command dispatch, terminal UI    | `@veris/analyzer`, `@veris/report`, `@veris/exporters`, `@veris/config`, `@veris/logger`, `@veris/telemetry`, `@veris/ai`, `@veris/renderers`, `@veris/runners` |
| `@veris/api` | Public programmatic API, DI container composition | `@veris/analyzer`, `@veris/report`, `@veris/exporters`, `@veris/config`, `@veris/logger`, `@veris/telemetry`, `@veris/ai`                                       |

### Layer 6: Runners

| Package          | Responsibility                                     | Dependencies                                                                                                 |
| ---------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `@veris/runners` | Execution environment adapters (local, CI, daemon) | `@veris/analyzer`, `@veris/report`, `@veris/exporters`, `@veris/config`, `@veris/logger`, `@veris/telemetry` |

### Layer 7: Plugins (Future)

| Package          | Responsibility                                                                 | Dependencies                                                     |
| ---------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `@veris/plugins` | Plugin host, SDK, manifest validation                                          | `@veris/core`, `@veris/shared`, `@veris/logger`, `@veris/config` |
|                  | _Plugin SDK published separately as `@veris/plugin-sdk` for 3rd-party authors_ | `@veris/core` (types only)                                       |

### Renderers (Cross-cutting)

| Package            | Responsibility                                    | Dependencies                   |
| ------------------ | ------------------------------------------------- | ------------------------------ |
| `@veris/renderers` | Visual rendering of reports (TUI, HTML, Markdown) | `@veris/report`, `@veris/core` |

---

## 4. Dependency Diagram

```
                     ┌──────────────────────────────────────┐
                     │           @veris/cli                  │
                     │           @veris/api                  │
                     │         @veris/runners                │
                     │         @veris/plugins                │
                     └───────────────┬──────────────────────┘
                                     │ depends on
                     ┌───────────────▼──────────────────────┐
                     │        @veris/exporters               │
                     │        @veris/renderers               │
                     └───────────────┬──────────────────────┘
                                     │ depends on
                     ┌───────────────▼──────────────────────┐
                     │          @veris/report                │
                     └───────────────┬──────────────────────┘
                                     │ depends on
                     ┌───────────────▼──────────────────────┐
                     │         @veris/analyzer               │
                     └────┬──────────┬──────────┬───────────┘
                          │          │          │
              ┌───────────▼──┐  ┌────▼────┐  ┌─▼──────────┐
              │ @veris/     │  │ @veris/ │  │ @veris/    │
              │ extractors  │  │ rules-  │  │ knowledge  │
              │             │  │ engine  │  │            │
              └──────┬──────┘  └────┬────┘  └──────┬─────┘
                     │              │               │
              ┌──────▼──────────────▼───────────────▼──┐
              │         @veris/rules                    │
              │   (depends on rules-engine interfaces)  │
              └──────────────────┬─────────────────────┘
                                 │
              ┌──────────────────▼─────────────────────┐
              │   @veris/ai        @veris/telemetry     │
              │   @veris/config    @veris/logger        │
              └──────────────────┬─────────────────────┘
                                 │
              ┌──────────────────▼─────────────────────┐
              │         @veris/shared                    │
              └──────────────────┬─────────────────────┘
                                 │
              ┌──────────────────▼─────────────────────┐
              │          @veris/core                     │
              │        (zero dependencies)              │
              └─────────────────────────────────────────┘
```

---

## 5. Allowed Dependency Directions

### 5.1 Strict Rules

1. **Downward only.** A package may only depend on packages in its own layer or lower layers. No upward dependencies.
2. **No lateral dependencies between siblings** unless both depend on a shared interface in a lower layer.
3. **Interface-only dependencies preferred.** When a layer-2 package depends on another layer-2 package (e.g., `@veris/rules` → `@veris/rules-engine`), dependency must be on interfaces/types only — never on concrete implementations.
4. **No circular dependencies.** Enforced via ESLint `import/no-cycle` and tooling (`dpdm` or `madge`) in CI.
5. **`@veris/core` must never import from any other package** within the monorepo.
6. **`@veris/shared` may import from `@veris/core` only.**

### 5.2 Visualization

| Layer | Package      | May Depend On                                                                                |
| ----- | ------------ | -------------------------------------------------------------------------------------------- |
| L0    | core         | (none)                                                                                       |
| L0    | shared       | core                                                                                         |
| L1    | logger       | core, shared                                                                                 |
| L1    | config       | core, shared                                                                                 |
| L1    | telemetry    | core                                                                                         |
| L1    | ai           | core, shared                                                                                 |
| L2    | extractors   | core, shared, logger, config                                                                 |
| L2    | rules-engine | core, shared, logger, knowledge (types)                                                      |
| L2    | rules        | core, rules-engine (interfaces)                                                              |
| L2    | knowledge    | core                                                                                         |
| L3    | analyzer     | core, extractors (interfaces), rules-engine, knowledge, logger, config, telemetry            |
| L4    | report       | core, knowledge                                                                              |
| L4    | exporters    | core, shared, report                                                                         |
| L5    | cli          | analyzer, report, exporters, config, logger, telemetry, ai, renderers, runners, core, shared |
| L5    | api          | analyzer, report, exporters, config, logger, telemetry, ai, core, shared                     |
| L6    | runners      | analyzer, report, exporters, config, logger, telemetry, core, shared                         |
| L7    | plugins      | core, shared, logger, config                                                                 |
| —     | renderers    | report, core                                                                                 |

---

## 6. Internal API Boundaries

### 6.1 Public vs. Internal

Each package exposes exactly **two levels** of API:

```
@veris/extractors/
├── src/
│   ├── index.ts          # PUBLIC — stable, semver-major-gated
│   ├── internal.ts       # INTERNAL — unstable, may change without notice
│   └── ...               # Implementation files (never imported cross-package)
```

**Rules:**

- Other packages must only import from `@veris/<name>` → resolves to `index.ts`.
- `internal.ts` is for cross-package use within the same layer only (e.g., analyzer → extractors internal), and must be explicitly imported via `@veris/extractors/internal`.
- No package may import from implementation files directly (`@veris/extractors/src/registry/...`).

### 6.2 Contract-Driven Boundaries

Every significant boundary has an **interface package** or **interfaces module**:

```typescript
// @veris/extractors/src/interfaces/extractor.ts
export interface Extractor {
  readonly id: string;
  readonly supportedTypes: ArtifactType[];
  canHandle(artifact: Artifact): boolean;
  extract(artifact: Artifact, context: ExtractorContext): Promise<ExtractionResult>;
}
```

The `@veris/analyzer` depends on `Extractor` interface only. Actual extractors are registered at composition root via DI.

### 6.3 Composition Root

Only `@veris/cli` and `@veris/api` perform dependency injection wiring. Domain packages never instantiate their own dependencies.

```typescript
// api/src/internal/wiring.ts (example — NOT implementation code)
const container = {
  config: createConfig(),
  logger: createLogger(config),
  extractors: createExtractorRegistry(config),
  engine: createRuleEngine(config, extractors, knowledge),
  analyzer: createAnalyzer(config, extractors, engine, knowledge, logger, telemetry),
};
```

---

## 7. Shared Package Strategy

### 7.1 What Goes in @veris/shared

- **Generic, reusable utilities** with no domain logic
- Shared infrastructure concerns (hashing, path resolution, cross-platform helpers)
- The `Result<T, E>` monad (transport for error handling)
- Serialization helpers
- Safe FS/Net wrappers

### 7.2 What Does NOT Go in @veris/shared

- Domain types (these belong in `@veris/core`)
- Analysis logic
- Rule-specific helpers
- Extractor-specific helpers
- Anything that has a single consumer (co-locate instead)

### 7.3 The "Three-Consumer Rule"

A utility belongs in `@veris/shared` only if it has **at least three confirmed consumers** across different packages. Otherwise, co-locate it in the consuming package and extract later when the third consumer appears.

### 7.4 No Fat Shared Package

`@veris/shared` must be aggressively pruned. It is the most common source of coupling rot. Every addition must be justified in code review.

---

## 8. Build Strategy

### 8.1 Toolchain

| Concern         | Choice                                          | Rationale                                                        |
| --------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| Package manager | **pnpm**                                        | Strict dependency isolation, workspace protocol, disk efficiency |
| TypeScript      | **ts@5.x**                                      | Project references for incremental builds                        |
| Bundler         | **tsup**                                        | Fast esbuild-based bundling, supports CJS+ESM dual output        |
| Linter          | **ESLint flat config** + `typescript-eslint` v8 |
| Formatter       | **Prettier**                                    |
| Testing         | **Vitest**                                      | Fast, works with ESM, has built-in coverage                      |
| Benchmarking    | **tinybench**                                   | Low-overhead, precise microbenchmarks                            |
| CI              | **GitHub Actions**                              | Native monorepo support                                          |

### 8.2 Build Steps

```
1. pnpm install            # Install all deps
2. pnpm build:core         # Build @veris/core first
3. pnpm build:shared       # Build @veris/shared second
4. pnpm build:layer1       # Build all layer 1 packages in parallel
5. pnpm build:layer2       # Build all layer 2 packages in parallel
6. pnpm build:layer3       # Build @veris/analyzer
7. pnpm build:layer4+      # Build all remaining layers in parallel
```

### 8.3 TypeScript Project References

Each package has its own `tsconfig.json` extending `tsconfig.base.json`:

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
  },
  "references": [
    { "path": "../core" },
    { "path": "../shared" },
    { "path": "../logger" },
    { "path": "../config" },
  ],
}
```

### 8.4 Dual CJS/ESM Output

Each package emits both:

```
packages/foo/
├── dist/
│   ├── esm/       # ES modules
│   │   ├── index.js
│   │   └── index.d.ts
│   └── cjs/       # CommonJS
│       ├── index.js
│       └── index.d.ts
├── package.json   # exports field with dual entry points
└── tsconfig.json
```

### 8.5 Build in CI

```yaml
# .github/workflows/ci.yml
- run: pnpm install
- run: pnpm build --filter=@veris/core --filter=@veris/shared
- run: pnpm build --filter=... # All downstream
- run: pnpm lint
- run: pnpm test
- run: pnpm test:types # Type-level regression tests
```

---

## 9. Testing Package Organization

### 9.1 In-Package Tests (`__tests__/`)

Every package has a `__tests__/` directory parallel to `src/`:

```
packages/extractors/
├── src/
│   └── builtins/
│       └── archive-extractor.ts
├── __tests__/
│   ├── builtins/
│   │   ├── archive-extractor.test.ts
│   │   └── script-extractor.test.ts
│   ├── registry.test.ts
│   └── integration/
│       └── extract-then-analyze.test.ts
├── benchmark/
│   ├── extractors.bench.ts
│   └── tsconfig.json
```

### 9.2 Test Types

| Test Type   | Location                      | Purpose                          | CI Frequency |
| ----------- | ----------------------------- | -------------------------------- | ------------ |
| Unit        | `__tests__/`                  | Single module/class in isolation | Every PR     |
| Integration | `__tests__/integration/`      | Cross-module, within package     | Every PR     |
| E2E         | `tools/perf/scenarios/`       | Full pipeline end-to-end         | Nightly      |
| Benchmark   | `benchmark/`                  | Performance regression detection | Nightly      |
| Fuzz        | `tools/security/fuzzing/`     | Input boundary fuzzing           | Nightly      |
| Adversarial | `tools/security/adversarial/` | Malicious input resistance       | Nightly      |

### 9.3 Test Fixtures

```
fixtures/
├── samples/
│   ├── safe/
│   │   ├── hello-world.js
│   │   ├── simple.tar.gz
│   │   └── clean-config.json
│   └── malicious/
│       ├── obfuscated-script.js
│       ├── suspicious-binary.elf
│       └── directory-traversal.tar.gz
└── repos/
    ├── small-monorepo/
    └── polyglot-project/
```

Fixtures are committed to the repository and versioned. Large fixtures use Git LFS.

### 9.4 Testing Conventions

- **One `describe` block per class/function** matching the source module name.
- **Factories over fixtures** for domain objects: `createTestFinding()`, `createTestRule()`.
- **Use `@veris/shared` test helpers** for common setup (temp directories, mock filesystems).
- **No network calls in unit tests** — all external dependencies are mocked via interfaces.
- **Coverage threshold**: 90%+ branch coverage on domain packages, 80%+ on application packages.

---

## 10. Documentation Organization

```
docs/
├── README.md                              # Documentation entry point
├── architecture/
│   ├── ADR-001-monorepo-structure.md
│   ├── ADR-002-dependency-inversion.md
│   ├── ADR-003-report-model.md
│   ├── ADR-004-plugin-system.md
│   └── ...                                # One ADR per significant decision
├── guides/
│   ├── contributing.md                    # How to set up, build, test
│   ├── writing-rules.md                   # Rule development guide
│   ├── writing-extractors.md              # Extractor development guide
│   ├── plugin-development.md              # Plugin SDK guide (future)
│   └── debugging.md                       # Debugging analysis pipelines
├── api/
│   ├── core.md                            # @veris/core types reference
│   ├── analyzer.md                        # @veris/analyzer usage
│   ├── cli.md                             # CLI command reference
│   └── exporters.md                       # Exporter format reference
├── taxonomy/
│   ├── overview.md                        # Taxonomy philosophy and design
│   └── reference.md                       # Full taxonomy tree with CWE mappings
├── examples/
│   ├── basic-scan.md
│   ├── ci-integration.md
│   └── custom-rules.md
├── rfcs/                                   # RFCs for future major changes
│   ├── RFC-template.md
│   └── ...
└── README.md
```

### 10.1 Documentation Principles

- **ADRs for architecture decisions.** Every significant architectural decision is recorded as an ADR with context, decision, consequences.
- **Guides for developers.** Writing rules, extractors, and plugins each get their own guide.
- **API reference for consumers.** Generated from TSDoc where possible.
- **RFCs for future changes.** Major changes start as RFCs with review period.

---

## 11. Rule Pack Organization

### 11.1 Structure

```
packages/rules/src/packs/
├── secrets/
│   ├── rules/
│   │   ├── aws-key.ts
│   │   ├── github-token.ts
│   │   ├── generic-api-key.ts
│   │   ├── private-key.ts
│   │   └── slack-token.ts
│   ├── index.ts                           # Exports all rules in pack
│   └── manifest.json                      # Pack metadata (id, version, description)
├── misconfiguration/
│   ├── rules/
│   │   ├── debug-enabled.ts
│   │   ├── permissive-cors.ts
│   │   ├── world-writable-file.ts
│   │   └── ...
│   ├── index.ts
│   └── manifest.json
├── injection/
│   ├── rules/
│   │   ├── sql-injection.ts
│   │   ├── command-injection.ts
│   │   ├── path-traversal.ts
│   │   └── ...
│   ├── index.ts
│   └── manifest.json
├── crypto/
│   ├── rules/
│   │   ├── weak-hash.ts
│   │   ├── hardcoded-key.ts
│   │   └── ...
│   ├── index.ts
│   └── manifest.json
├── file-system/
│   ├── rules/
│   │   ├── unsafe-unlink.ts
│   │   ├── symlink-attack.ts
│   │   └── ...
│   ├── index.ts
│   └── manifest.json
├── best-practices/
│   ├── rules/
│   │   ├── eval-usage.ts
│   │   ├── deprecated-api.ts
│   │   └── ...
│   ├── index.ts
│   └── manifest.json
└── index.ts                               # Aggregates all packs
```

### 11.2 Rule Pack Contract

Each pack exports:

```typescript
interface RulePack {
  id: string; // e.g., "secrets"
  version: string; // semver
  description: string;
  rules: RuleDefinition[]; // Rule definitions conforming to @veris/rules-engine interfaces
  dependencies?: string[]; // Other pack IDs this pack extends/enhances
  metadata: {
    author: string;
    tags: string[];
    severity: { min: number; max: number };
  };
}
```

### 11.3 Pack Isolation

- Each pack is independently loadable.
- A pack may declare dependencies on other packs (e.g., `injection` extends `best-practices`).
- Pack loading is handled by `@veris/rules-engine` — packs are discovered via registry.
- Third-party packs (future) are loaded via the plugin system.

---

## 12. Extractor Organization

### 12.1 Structure

```
packages/extractors/src/builtins/
├── archive-extractor/
│   ├── extractor.ts            # ArchiveExtractor implements Extractor
│   ├── formats/                # Individual archive format handlers
│   │   ├── tar-handler.ts
│   │   ├── zip-handler.ts
│   │   ├── gzip-handler.ts
│   │   ├── bzip2-handler.ts
│   │   └── sevenz-handler.ts
│   ├── boundaries/             # Safety limits (max size, depth, file count)
│   │   └── limits.ts
│   └── index.ts
├── executable-extractor/
│   ├── extractor.ts
│   ├── parsers/
│   │   ├── elf-parser.ts
│   │   ├── pe-parser.ts
│   │   └── macho-parser.ts
│   ├── sections/
│   └── index.ts
├── script-extractor/
│   ├── extractor.ts
│   ├── interpreters/
│   │   ├── python.ts
│   │   ├── javascript.ts
│   │   ├── shell.ts
│   │   └── powershell.ts
│   └── index.ts
├── repository-extractor/
│   ├── extractor.ts
│   ├── git/
│   ├── structure/
│   └── index.ts
├── text-extractor/
│   └── extractor.ts
└── binary-extractor/
    └── extractor.ts
```

### 12.2 Extractor Contract

```typescript
interface Extractor {
  id: string;
  supportedTypes: ArtifactType[];
  canHandle(artifact: Artifact): boolean;
  extract(artifact: Artifact, context: ExtractorContext): Promise<ExtractionResult>;
}
```

### 12.3 Extractor Principles

- Each extractor is a single class implementing the `Extractor` interface.
- Extractors are discovered via `ExtractorRegistry`, not hardcoded.
- Built-in extractors ship with `@veris/extractors`.
- Third-party extractors (future) register through the plugin system.
- Extractors must be stateless — all state lives in `ExtractorContext`.

---

## 13. Plugin Organization

### 13.1 Plugin System Architecture (Future)

```
@veris/plugins/
├── host/
│   ├── plugin-host.ts          # Manages plugin lifecycle
│   ├── loader.ts               # Loads plugins from disk
│   ├── sandbox.ts              # Runtime sandbox for plugin isolation
│   └── index.ts
├── sdk/
│   ├── contracts/              # Interfaces plugins implement
│   │   ├── plugin.ts
│   │   ├── rule-plugin.ts
│   │   ├── extractor-plugin.ts
│   │   └── exporter-plugin.ts
│   ├── helpers/                # Plugin author utilities
│   ├── testing/                # Plugin testing utilities
│   └── index.ts
├── manifest/
│   ├── manifest-schema.ts
│   ├── manifest-validator.ts
│   └── index.ts
└── index.ts
```

### 13.2 Plugin Types

| Plugin Type       | Extends                     | Hooks                                                    |
| ----------------- | --------------------------- | -------------------------------------------------------- |
| `RulePlugin`      | Provides new rule packs     | `registerRules()`                                        |
| `ExtractorPlugin` | Provides new extractors     | `registerExtractors()`                                   |
| `ExporterPlugin`  | Provides new export formats | `registerExporters()`                                    |
| `RendererPlugin`  | Provides new renderers      | `registerRenderers()`                                    |
| `HookPlugin`      | Observes pipeline lifecycle | `preExtract`, `postExtract`, `preAnalyze`, `postAnalyze` |

### 13.3 Plugin Isolation

- Plugins run in a **runtime sandbox** (isolated VM context or similar).
- Plugins communicate with the host via a **narrow message-passing API**.
- Plugins have no access to the filesystem or network unless explicitly granted.
- Plugin crashes must never crash the host process.

### 13.4 Plugin SDK

The SDK is published as a separate npm package (`@veris/plugin-sdk`) so third-party authors depend only on it, not on the full monorepo.

---

## 14. Versioning Strategy

### 14.1 Monorepo Versioning

| Strategy        | Choice                                              | Rationale                                                        |
| --------------- | --------------------------------------------------- | ---------------------------------------------------------------- |
| Mode            | **Independent** (each package versioned separately) | Core types evolve slower than CLI; CLI evolves slower than rules |
| Tool            | **Changesets**                                      | Industry standard for pnpm workspaces, generates changelogs      |
| Release cadence | **Continuous** — release on demand per package      | No artificial synchronization                                    |

### 14.2 Version Alignment

- `@veris/core` starts at `1.0.0` and moves slowly.
- `@veris/shared` starts at `1.0.0`.
- All domain packages start at `0.1.0` until V1 stabilization.
- `@veris/rules` moves fastest — new rules added as minor versions.
- Breaking changes to `@veris/core` types trigger a coordinated major bump across all packages.

### 14.3 Version Compatibility

```
A dependency boundary lockfile ensures:
- @veris/analyzer@2.x requires @veris/core@^1.x
- @veris/report@3.x requires @veris/core@^1.x
- @veris/exporters@4.x requires @veris/report@^3.x, @veris/core@^1.x
```

### 14.4 Pre-Release Tags

- `0.x.x` — Pre-V1, APIs may break
- `1.0.0-alpha.x` — Alpha releases
- `1.0.0-beta.x` — Beta releases
- `1.0.0-rc.x` — Release candidates
- `1.0.0` — Stable

---

## 15. Naming Conventions

### 15.1 Package Names

- **Scope:** `@veris/`
- **Name:** Single lowercase word, no hyphens except for compound descriptors:  
  `@veris/core`, `@veris/shared`, `@veris/rules-engine`, `@veris/rule-filters`
- **Plugin SDK:** `@veris/plugin-sdk`
- **Test support:** Not published, used internally only.

### 15.2 Directory Names

- Match package name without scope: `packages/core/`, `packages/rules-engine/`, `packages/rules/`.

### 15.3 Source File Names

- **Classes/PascalCase:** `ReportBuilder.ts`, `ArchiveExtractor.ts`
- **Functions/camelCase:** `createLogger.ts`, `parseConfig.ts`
- **Types/Interfaces:** `Extractor.ts`, `Finding.ts`, `AnalysisResult.ts`
- **React components:** `ProgressBar.tsx`, `FindingList.tsx`
- **Module barrel:** `index.ts` (default), `internal.ts` (cross-package internal API)

### 15.4 Test File Names

- `{module-name}.test.ts` for unit tests
- `{module-name}.integration.test.ts` for integration tests
- `{module-name}.bench.ts` for benchmarks

### 15.5 Export Naming

- **Default exports:** Avoid. Prefer named exports.
- **Interface names:** Follow the `IAction` → `Action` convention (no `I` prefix).

---

## 16. Future Expansion Considerations

### 16.1 Extractor Expansion (V2+)

- New binary format parsers (Mach-O, DEX, WebAssembly) → add to `builtins/` directory.
- Cloud artifact extractors (Docker images, Lambda layers) → new package or builtin.
- Remote repository extractor (GitHub API, GitLab API) → new package.

### 16.2 Rule Pack Expansion (Ongoing)

- New rule packs are directories under `packages/rules/src/packs/`.
- External rule packs (from community) can be added as separate packages under `packages/external-rules/` or installed as plugins.
- Language-specific rule packs (Python, Java, Go) → `packages/rules/src/packs/lang-python/`, etc.

### 16.3 Renderer Expansion

- Web renderer (React/Svelte-based dashboard) → can be its own repo or a package that depends on `@veris/renderers` interfaces.
- CI annotation renderers (GitHub Checks, GitLab MR comments) → new renderers under `@veris/renderers`.
- Custom renderers via plugin system.

### 16.4 AI Integration Expansion

- AI-assisted remediation suggestions (consumer only — AI never performs analysis).
- AI-powered report summarization.
- AI-assisted rule writing (generates rule scaffolding from natural language).
- All AI features live in `@veris/ai` and are consumed by CLI/API — never by the analyzer.

### 16.5 Language Support

- VERIS is **analysis-platform-agnostic** — it analyzes artifacts, not language syntax directly.
- Language-specific extractors (e.g., AST-based JavaScript extractor) are builtins.
- Language-specific rules are rule pack subsets.
- A future `@veris/language-support` package could host language grammars and AST parsers.

### 16.6 SaaS / Cloud Offering

- `@veris/api` is the integration point for any SaaS layer.
- A web backend would consume `@veris/api` and add persistence, user management, and a web UI.
- The CLI remains the primary interface; SaaS is additive.

---

## 17. Common Architecture Mistakes to Avoid

### 17.1 Fat Shared Package

**Mistake:** Every utility function ends up in `@veris/shared`, creating a god package that everything depends on.  
**Prevention:** Enforce the **Three-Consumer Rule**. Co-locate utilities with single consumers.

### 17.2 Leaky Extractors

**Mistake:** Extractors do double duty — extracting AND performing preliminary analysis.  
**Prevention:** Extractors **extract only**. They produce `ExtractionResult` — structured data about the artifact. They do not classify, score, or flag findings.

### 17.3 Analysis Logic in Rules

**Mistake:** Rules contain complex analysis logic, making them hard to test and reason about.  
**Prevention:** Rules are **declarative matchers**. Complex analysis (control flow, data flow) belongs in `@veris/rules-engine` evaluators. Rules should be JSON-like in complexity.

### 17.4 AI in the Analysis Pipeline

**Mistake:** Using AI for analysis — nondeterministic, unversioned, unverifiable results. **This violates VERIS's core principle of explainable deterministic analysis.**  
**Prevention:** AI is strictly a **consumer** of analysis results — never part of the analysis pipeline. AI sits in `@veris/ai` and is imported only by `@veris/cli` and `@veris/api`.

### 17.5 Circular Package Dependencies

**Mistake:** Package A imports from Package B, and Package B imports from Package A (or through a chain).  
**Prevention:** Enforce with `dpdm` or `madge` in CI. Design interfaces in lower layers to break cycles.

### 17.6 No Public API Surface

**Mistake:** Packages export everything from `src/`, making it impossible to refactor internals.  
**Prevention:** Every package has exactly one or two entry points (`index.ts` and `internal.ts`). Everything else is private.

### 17.7 Shared Types Coupling

**Mistake:** Reusing domain types across unrelated packages, creating implicit coupling.  
**Prevention:** `@veris/core` types are the only shared types. If a package needs a type variant, it defines its own local type and maps at the boundary.

### 17.8 Premature Plugin System

**Mistake:** Designing an elaborate plugin system before core functionality stabilizes.  
**Prevention:** Build the plugin host as a thin shell in V1. Fill in the SDK and full sandboxing in V2 after the core contracts are proven.

### 17.9 Over-Engineering the Build

**Mistake:** Complex build toolchains, custom bundler configs, multiple output formats before they're needed.  
**Prevention:** Start with a simple `tsup` config, dual CJS/ESM output, and pnpm workspace build order. Add complexity only when there's a proven need.

### 17.10 Ignoring Offline-First

**Mistake:** Depending on network services for core functionality (e.g., AI suggestions, knowledge base lookups).  
**Prevention:** All analysis paths must work fully offline. AI and telemetry are optional enhancements that gracefully degrade if unavailable.

---

## 18. Final Recommendations

### 18.1 Implementation Order

| Phase          | Packages                                           | Rationale                         |
| -------------- | -------------------------------------------------- | --------------------------------- |
| **Phase 0**    | `core`, `shared`, `logger`, `config`               | Foundation — needed by everything |
| **Phase 1**    | `knowledge`, `rules-engine`, `extractors`, `rules` | Domain — the analysis core        |
| **Phase 2**    | `analyzer`, `report`                               | Orchestration and output          |
| **Phase 3**    | `cli`, `api`, `runners`, `exporters`, `renderers`  | Application layer                 |
| **Phase 4**    | `ai`, `telemetry`, `plugins`                       | Enhancements and extensibility    |
| **Continuous** | `tools/perf`, `tools/security`, `docs`, `fixtures` | Infrastructure                    |

### 18.2 Critical Success Factors

1. **Keep `@veris/core` extremely lean.** Every addition is a versioning commitment to every other package.
2. **Interface-first design.** Every cross-package dependency should be on an interface, not an implementation.
3. **No analysis in extractors.** Extractors produce data. Rules analyze data.
4. **AI is never analysis.** Violating this one principle undermines VERIS's entire value proposition.
5. **Test the boundaries.** Focus integration tests on the contracts between packages — that's where coupling rot first appears.
6. **ADR every decision.** The architecture is frozen in concept, but every concrete design decision should be recorded.

### 18.3 Architectural Invariants

```
1. @veris/core imports NOTHING from the monorepo.
2. No circular dependencies.
3. Extractors only extract. Rules only match. Analyzer only orchestrates.
4. AI is a consumer, never an analyst.
5. All analysis is deterministic. Given the same input, the same output.
6. Everything works offline.
7. Every package has a single public entry point.
8. Dependencies flow downward only.
```

---

_End of SPEC-001. This document describes the frozen repository architecture for VERIS V1 through V4._
