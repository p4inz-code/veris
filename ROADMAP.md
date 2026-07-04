# VERIS Roadmap

## Legend

- ✅ **Complete**
- 🔄 **In Progress**
- 🔜 **Planned**

---

## Milestone M0: Foundation — Architecture & Repository Bootstrap

- ✅ Architecture specifications (SPEC-001 through SPEC-011)
- ✅ Repository setup with pnpm workspaces
- ✅ Package scaffolding for all 24 packages
- ✅ Build system (tsup, TypeScript, vitest)
- ✅ CI/CD (GitHub Actions — CI, Release, Docs, Nightly)
- ✅ Developer tooling (ESLint, Prettier, Husky, Changesets)

## Milestone M1: Package Scaffolding & Build Verification

- ✅ All 24 packages compile and build
- ✅ TypeScript project references and path aliases
- ✅ Cross-package import validation
- ✅ Build pipeline (core → layers → all)

## Milestone M2: Core Data Model & Shared Utilities

- ✅ `@veris/core` — Canonical types, errors, constants
- ✅ `@veris/shared` — Collections, hashing, serialization, Result monad, version
- ✅ `@veris/logger` — Structured logging
- ✅ `@veris/config` — Configuration loading and merging
- ✅ `@veris/telemetry` — Metrics and tracing

## Milestone M3: Domain Layer — Extraction & Discovery

- ✅ `@veris/discovery` — Deterministic filesystem discovery
- ✅ `@veris/classification` — Multi-signal classification
- ✅ `@veris/extractors` — Extraction framework (20+ extractors)
- ✅ `@veris/knowledge` — Taxonomy, features, capabilities

## Milestone M4: Rule Engine & Correlation

- ✅ `@veris/rules` — Rule types, builders, built-in rules
- ✅ `@veris/rules-engine` — Condition evaluation, matching
- ✅ `@veris/correlation` — Behavioral chain correlation

## Milestone M5: Analysis Pipeline & AI Layer

- ✅ `@veris/analyzer` — Pipeline orchestrator
- ✅ `@veris/analysis` — Analysis framework
- ✅ `@veris/explain` — AI explanation pipeline (findings, chains, risk, report)

## Milestone M6: CLI & API

- ✅ `@veris/cli` — CLI commands (scan, report, explain, summarize)
- ✅ `@veris/api` — Programmatic API
- ✅ `@veris/runners` — Execution environment adapters
- ✅ `@veris/report` — Report construction

## Milestone M7: Risk Engine & Recommendations

- ✅ `@veris/risk` — Deterministic risk scoring, verdicts, confidence
- ✅ `@veris/recommendations` — Recommendation engine
- ✅ `@veris/exporters` — Output formats (JSON, SARIF, Markdown)

## Milestone M8: Explanation Layer — Configuration & Modes

- ✅ Explanation modes (simple, technical, expert)
- ✅ Citation policies
- ✅ Output formatting and presets
- ✅ Config validation and merging

## Milestone M9: Cache System & Export Pipeline

- ✅ Cache infrastructure (MemoryStore, LRU, TTL)
- ✅ Schema versioning and migration
- ✅ Export pipeline (Markdown, JSON)
- ✅ Batch export and manifest generation

## Milestone M10: Validation, Security & Performance

- ✅ Validation pipeline (input filter, structural validator, citation verifier)
- ✅ Output filtering and security rules
- ✅ Stress and performance testing
- ✅ Security validation

## Milestone M11: Final Integration & Beta Readiness

- ✅ Complete repository integration review
- ✅ Circular dependency resolution
- ✅ Determinism audit
- ✅ Security audit
- ✅ Performance audit
- ✅ Production readiness verification

## Milestone M12: Documentation, Release Packaging & Beta Preparation (Current)

- ✅ Root README with comprehensive documentation
- ✅ CHANGELOG.md
- ✅ GitHub community health files
- ✅ Issue and PR templates
- ✅ Package metadata verification

## V1.0 Release

- 🔜 npm publishing pipeline
- 🔜 API documentation generation
- 🔜 Performance benchmarks
- 🔜 Security audit (third-party)
- 🔜 **V1.0 Release**

## V2+ Plans

- 🔜 AI-assisted rule writing
- 🔜 Plugin system SDK
- 🔜 CI integration runner
- 🔜 Web dashboard
- 🔜 Additional rule packs
- 🔜 Community marketplace

## Package Status

| Package                  | Phase       | Status    |
| ------------------------ | ----------- | --------- |
| `@veris/core`            | Foundation  | ✅ Stable |
| `@veris/shared`          | Foundation  | ✅ Stable |
| `@veris/logger`          | Framework   | ✅ Beta   |
| `@veris/config`          | Framework   | ✅ Beta   |
| `@veris/telemetry`       | Framework   | ✅ Beta   |
| `@veris/ai`              | Framework   | ✅ Beta   |
| `@veris/discovery`       | Domain      | ✅ Beta   |
| `@veris/classification`  | Domain      | ✅ Beta   |
| `@veris/extractors`      | Domain      | ✅ Beta   |
| `@veris/knowledge`       | Domain      | ✅ Beta   |
| `@veris/rules`           | Domain      | ✅ Beta   |
| `@veris/rules-engine`    | Domain      | ✅ Beta   |
| `@veris/correlation`     | Domain      | ✅ Beta   |
| `@veris/risk`            | Domain      | ✅ Beta   |
| `@veris/analysis`        | Analysis    | ✅ Beta   |
| `@veris/analyzer`        | Analysis    | ✅ Beta   |
| `@veris/report`          | Report      | ✅ Beta   |
| `@veris/exporters`       | Report      | ✅ Beta   |
| `@veris/explain`         | AI Layer    | ✅ Beta   |
| `@veris/renderers`       | Rendering   | ✅ Beta   |
| `@veris/cli`             | Application | ✅ Beta   |
| `@veris/api`             | Application | ✅ Beta   |
| `@veris/runners`         | Application | ✅ Beta   |
| `@veris/plugins`         | Extensions  | 🔜 V2+    |
| `@veris/recommendations` | Domain      | ✅ Beta   |
