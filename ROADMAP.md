# VERIS Roadmap

> **Status**: v1.0.0 is released and frozen (maintenance mode, bug fixes only).
> The V2+ section below is the deferred work list.

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

- Core types, errors, constants
- Collections, hashing, serialization, Result monad, version
- Structured logging
- Configuration loading and merging
- Metrics and tracing

## Milestone M3: Domain Layer — Extraction & Discovery

- Deterministic filesystem discovery
- Multi-signal classification
- Extraction framework (20+ extractors)
- Taxonomy, features, capabilities

## Milestone M4: Rule Engine & Correlation

- Rule types, builders, built-in rules
- Condition evaluation, matching
- Behavioral chain correlation

## Milestone M5: Analysis Pipeline & AI Layer

- Pipeline orchestrator
- Analysis framework
- AI explanation pipeline (findings, chains, risk, report)

## Milestone M6: CLI & API

- CLI commands (scan, report, explain, summarize)
- Programmatic API
- Execution environment adapters
- Report construction

## Milestone M7: Risk Engine & Recommendations

- Deterministic risk scoring, verdicts, confidence
- Recommendation engine
- Output formats (JSON, SARIF, Markdown)

## Milestone M8: Explanation Layer — Configuration & Modes

- Explanation modes (simple, technical, expert)
- Citation policies
- Output formatting and presets
- Config validation and merging

## Milestone M9: Cache System & Export Pipeline

- Cache infrastructure (MemoryStore, LRU, TTL)
- Schema versioning and migration
- Export pipeline (Markdown, JSON)
- Batch export and manifest generation

## Milestone M10: Validation, Security & Performance

- Validation pipeline (input filter, structural validator, citation verifier)
- Output filtering and security rules
- Stress and performance testing
- Security validation

## Milestone M11: Final Integration & Beta Readiness

- Complete repository integration review
- Circular dependency resolution
- Determinism audit
- Security audit
- Performance audit
- Production readiness verification

## Milestone M12: Documentation, Release Packaging & Beta Preparation

- Root README with comprehensive documentation
- CHANGELOG.md
- GitHub community health files
- Issue and PR templates
- Package metadata verification

## V1.0 Release

- npm publishing pipeline
- API documentation generation
- Performance benchmarks
- Security audit (third-party)
- **V1.0 Release**

## Phase 4: Performance & Deterministic Benchmark Foundation

- ✅ Benchmark contract (timing separated from deterministic payload validation)
- ✅ Workload matrix (small, medium, large, security-mixed representative workloads)
- ✅ Benchmark harness (`tools/perf`) with high-resolution stage timings
- ✅ Baseline capture (startup, discovery, classification, extraction, rules/risk, reporting, export)
- ✅ Determinism validation gate (canonical payload hash verification across iterations)
- ✅ Automation-ready output (versioned schema v1.0.0 JSON + human-readable report)
- 🔜 CI benchmark regression tracking
- 🔜 Targeted performance optimizations (deferred until baseline analysis is complete)

## Phase 5: V2 Plugin Architecture Review & Extension Contract

- ✅ V2 Plugin Architecture Decision Record (ADR-014: `docs/architecture/014-v2-plugin-architecture-contract.md`)
- ✅ Strict extension boundaries established (Extractor Plugins & Rule Pack Plugins only; exporters/renderers/AI deferred)
- ✅ Inviolable invariants codified (0-dependency `@veris/core`, immutable `v1.0.0`, deterministic scanning, offline-first)
- ✅ Internal plugin host types, manifest schema validation, and lifecycle state tracker (`@veris/plugins`)
- ✅ Automated architecture guardrails and contract verification suite

## Phase 6: Public Plugin SDK Foundation

- ✅ Public developer kit package (`@veris/plugin-sdk`) with ZERO runtime dependencies
- ✅ Self-contained TypeScript definitions (emits 0 external runtime/type imports in `.d.ts`)
- ✅ Pure authoring builders: `definePluginManifest()`, `defineExtractorPlugin()`, `defineRulePackPlugin()`
- ✅ Formal determinism invariants codified in SDK constants and types
- ✅ Capability groupings and documentation (`core-types-read`, `target-read`, `custom-feature`, etc.)
- ✅ Reference authoring examples for both Extractor and Rule Pack plugins
- ✅ Full SDK contract test suite (manifest, extractor boundary, declarative rules, determinism, compatibility)

## Phase 7: Internal Plugin Host (Discovery, Validation, Loading & Registration)

- ✅ Local filesystem plugin discovery (`.veris/plugins`, `~/.veris/plugins`, explicit `pluginsDir`)
- ✅ Strict manifest schema validation and semver host compatibility gating
- ✅ Path traversal security guards against directory and entry point escapes
- ✅ Safe ESM dynamic loading via `pathToFileURL` with error containment
- ✅ Declarative purity validation for rule packs (zero executable functions or lambdas)
- ✅ Lifecycle state machine supervisor (`discovered` -> `validated` -> `initialized` -> `active` -> `deactivated`)
- ✅ Automated quarantine after 3 consecutive failures to protect engine stability
- ✅ `PluginExtractorAdapter` bridging `ExtractorPlugin` to `ExtractorRegistry` with capability gating (`target-read`)
- ✅ `PluginRuleAdapter` bridging declarative rule packs into `IRuleRegistry`
- ✅ Central `PluginHost` orchestrator with comprehensive diagnostics tracking
- ✅ Full unit and integration test coverage across discovery, loader, adapters, and host orchestration

## Phase 8: CLI Plugin Integration, Configuration & Runtime UX

- ✅ CLI scan flags: `--plugin-dir <path>`, `--disable-plugin <id>` (repeatable), `--no-plugins`
- ✅ Config layer integration: `pluginDir` and `disabledPlugins` in `PluginConfig` and `VERIS_PLUGIN_DIR` / `VERIS_DISABLED_PLUGINS` env vars
- ✅ Dedicated plugin inventory CLI commands: `veris plugins [list]`, `veris plugins info <id>`, `veris plugins validate [path]`, with alias `veris plugin`
- ✅ Machine-readable output mode: `veris plugins list --json` and `veris plugins info <id> --json` with zero ANSI pollution
- ✅ Scan runtime integration: deterministic discovery, validation, loading, and registration of extractor and rule-pack plugins
- ✅ Truthful startup & summary reporting: `Plugins: <n> loaded` on startup screen and `plugins: <n>` in analysis summary
- ✅ Safe error containment: broken plugins surface diagnostics calmly without aborting scans
- ✅ Strict determinism preservation: identical scan runs with plugins produce identical canonical reports
- ✅ Complete test suite covering scan integration, CLI commands, error reporting, and determinism

## V2+ Plans

- CLI plugin management commands (Phase 8+)
- AI-assisted rule writing
- CI integration runner
- Web dashboard
- Additional rule packs
- Extension marketplace
