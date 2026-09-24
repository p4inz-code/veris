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

## Phase 9: Plugin Security & Hardening

- ✅ Symlink escape and physical path containment verification via `fs.realpathSync`
- ✅ Restricted capability gating (offline-first policy denies `network` and `process-spawn`)
- ✅ Prototype pollution defense across rule packs, property matchers, and raw features
- ✅ Accessor property (getter/setter) detection and circular reference guards
- ✅ Extractor execution timeout protection (30s default) against hanging or runaway plugins
- ✅ Extraction memory bounds (5,000 feature limit per extraction, 1MB string value truncation)
- ✅ Automated 3-strike quarantine enforcement across `extract` and `canExtract`
- ✅ ReDoS prevention and pattern length capping (max 1,000 characters) in rule matchers
- ✅ Locale-independent Unicode code-point sorting for deterministic plugin and feature output
- ✅ Comprehensive 25-threat adversarial security regression test suite

## Phase 10: V1.1.0 Release Integration & Hardening

- ✅ Version bump verification for post-v1.0.0 release (`v1.1.0`)
- ✅ Zero-runtime-dependency invariance verified for `@veris/core` and `@veris/plugin-sdk`
- ✅ Full CI preflight across Node 18, 20, 22 on Windows, macOS, and Linux
- ✅ Public CLI command and machine-readable output verification
- ✅ Production tarball and package metadata validation
- ✅ Clean working tree and repository hygiene

## Phase 11: CI Integration Runner & Automated Security Gates

- ✅ ADR-015: CI Integration Runner Architecture Contract (`docs/architecture/015-ci-integration-runner-contract.md`)
- ✅ `veris ci [target] [options]` runner command with standalone and baseline-relative modes
- ✅ Location-aware finding fingerprinting with deterministic cross-platform path normalization
- ✅ Hardened baseline ingestion supporting CanonicalReport (`report.json`) and CiSummary (`ci-summary.json`) with prototype pollution defense and 50MB ceiling
- ✅ 5-way differential comparison engine (`unchanged`, `new`, `regressed`, `evidence_changed`, `resolved`)
- ✅ Configurable security policy gate evaluator (`failOn`, `failOnNew`, `maxNew`, `failOnRegressions`, `maxRisk`, `failOnPluginQuarantine`)
- ✅ Deterministic CI exit codes (`0`, `1`, `2`, `10`, `11`, `12`, `13`, `130`)
- ✅ Dual CI artifact emission: machine-readable `ci-summary.json` and `$GITHUB_STEP_SUMMARY` Markdown
- ✅ Full CI runner test suite (fingerprint, baseline, comparator, policy, summary, CLI command)
- ✅ Zero-dependency invariant preserved across `@veris/core` and `@veris/plugin-sdk`

## Phase 12: AI-Assisted Rule Authoring

- ✅ ADR-016: AI-Assisted Rule Authoring Contract (`docs/architecture/016-ai-assisted-rule-authoring-contract.md`)
- ✅ `veris rule author [options]` command for intent-driven declarative detection rule generation
- ✅ Provider integration with `@veris/ai` supporting LLMs and deterministic offline template fallbacks
- ✅ Deterministic validation gate enforcing AST purity (zero executable code), regex ReDoS bounds (<= 1,000 chars), and engine compatibility
- ✅ Synthetic test fixture generator and automated test runner executing positive/negative validation through real RuleEngine
- ✅ Candidate artifact assembly with explicit human review warnings and active plugin promotion (`--promote`)
- ✅ Support for disjunctive version ranges (`||`) in `@veris/shared` semver matcher

## Phase 13: Web / Visual Investigation Dashboard

- ✅ ADR-017: Visual Investigation Dashboard Contract (`docs/architecture/017-visual-investigation-dashboard-contract.md`)
- ✅ `veris dashboard [report-path] [options]` command for interactive investigation and report export
- ✅ Zero-dependency, self-contained standalone HTML report generator with embedded dark-slate design system
- ✅ Strict Content Security Policy (`default-src 'none'`) and anti-framing security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`)
- ✅ Zero-network local loopback HTTP viewer server bound strictly to `127.0.0.1`
- ✅ Interactive finding search, severity breakdown, and expandable evidence traces

## Phase 14: Plugin Ecosystem & Marketplace Foundation

- ✅ ADR-018: Plugin Ecosystem, Catalog, and Marketplace Foundation Contract (`docs/architecture/018-plugin-ecosystem-marketplace-contract.md`)
- ✅ Local-first plugin catalog schema (`PluginCatalog`, `PluginPackageRecord`) and built-in standard ecosystem index
- ✅ Content-addressed Merkle-style SHA-256 package checksum verification over sorted POSIX relative paths
- ✅ Comprehensive verification pipeline (`veris plugins verify`) checking manifest authenticity, integrity, engine compatibility, and capability auditing
- ✅ Security capability breakdown: `safe`, `targetAccess`, `storage`, and `dangerous` with high-visibility warnings for `network` and `process-spawn`
- ✅ Declarative purity and path traversal enforcement (blocking symlink escapes and executable binary entry points)
- ✅ 4-stage lifecycle: Discovery -> Verification -> Installation -> Execution
- ✅ Safe installation and uninstallation commands (`veris plugins install`, `veris plugins remove`) with immutable `.veris-installed.json` receipts

## Phase 15: Product UX/UI Consistency + CLI Experience

- ✅ Global design system alignment across all 13 CLI commands and aliases
- ✅ Terminal width adaptation verified across narrow and wide viewports (40, 60, 80, 120, 160, 180 cols)
- ✅ Accessibility degradation verified: 100% pure ASCII symbols when unicode is disabled and 0 ANSI codes when color is disabled
- ✅ Standardized `--help` and error UX with color-blind resilient textual indicators and predictable exit codes
- ✅ Persistent session header, wipe intro animation, and terminal cleanup verified across alternate buffer lifecycles

## Phase 16: Cross-Platform, Runtime & Installation Hardening

- ✅ Multi-platform path normalization handling Windows drive letters, backslashes, POSIX paths, and symlinks
- ✅ Zero-dependency invariant verified for `@veris/core` (0 deps) and `@veris/plugin-sdk` (0 runtime deps)
- ✅ Circular dependency audit passed across 472 workspace files via cross-platform madge configuration
- ✅ Production tarball packaging verified (`npm pack` output clean: zero tests, zero credentials, zero temp files)
- ✅ Clean disposable installation validated in isolated environment outside monorepo source tree

## Phase 17: Full End-to-End Product Acceptance

- ✅ 14-step end-to-end user journey executed from CLI entry to report export, dashboard generation, AI rule authoring, plugin promotion, and CI gate enforcement
- ✅ Security corpus validation on mixed targets (clean, suspicious scripts, binary dat, configuration secrets)
- ✅ Deterministic analysis verified: identical inputs yield identical canonical hashes across repeated runs
- ✅ Clean process exit and error containment: invalid arguments, missing reports, and unknown commands yield strictly defined exit codes

## Phase 18: Final Quality & Release-Candidate Hardening

- ✅ Complete monorepo build, typecheck, and test suite execution (43 test files, 479 CLI tests, 189 suites monorepo-wide)
- ✅ Performance benchmark certified: 16.3ms median execution time with canonical hash determinism
- ✅ Architecture contracts and documentation verified against live implementations
- ✅ Remote GitHub Actions CI verified across 9 matrix jobs (Ubuntu, macOS, Windows on Node 18, 20, 22)
