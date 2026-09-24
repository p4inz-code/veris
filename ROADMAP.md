# VERIS Roadmap & Production Hold Certification

> **Status**: **PRODUCTION HOLD / MAINTENANCE ONLY** (as of v1.2.0 release).
> Tags `v1.0.0` and `v1.1.0` remain permanently immutable. `v1.2.0` is released and live on npm (`veris-cli@1.2.0`) and GitHub.
> Active feature development is **FROZEN**. The platform is in long-term maintenance mode (security patches, break-fix, and CI maintenance only).

---

## 1. CURRENT / COMPLETE (Shipped in v1.2.0)

The following capabilities are fully implemented, packaged, and shipped in the `v1.2.0` release:

- **Deterministic Security Analysis Pipeline**: Multi-engine offline scanner analyzing PE32/PE32+ binaries, shell scripts, PowerShell, configuration files, credentials, and cryptographic algorithms without cloud dependencies.
- **Strict Determinism Guarantees**: Identical inputs yield byte-for-byte identical analysis run hashes, finding orderings, and risk scores.
- **Zero-Dependency Architecture**: `@veris/core` has 0 dependencies; `@veris/plugin-sdk` has 0 runtime dependencies.
- **Deterministic CI Security Gate Runner (`veris ci`)**: Standalone and baseline-differential scanning with location-aware finding fingerprinting, 5-way status categorization (`new`, `regressed`, `evidence_changed`, `unchanged`, `resolved`), configurable threshold gates (`--fail-on`, `--fail-on-new`, `--max-risk`, `--max-new`, `--fail-on-regressions`), machine-readable `ci-summary.json`, and native `$GITHUB_STEP_SUMMARY` Markdown.
- **AI-Assisted Declarative Rule Authoring (`veris rule author`)**: Intent-driven rule synthesis supporting LLMs and 100% offline deterministic templates, AST purity enforcement (zero executable code), ReDoS safety bounds, automated positive/negative test fixture validation, and direct plugin promotion (`--promote`).
- **Visual Investigation Dashboard (`veris dashboard`)**: Standalone, CSP-hardened (`default-src 'none'`) zero-dependency HTML report export, local loopback viewer server bound strictly to `127.0.0.1`, and interactive finding search and triage.
- **Plugin Ecosystem & Marketplace Foundation (`veris plugins`)**: Standard local-first catalog index, Merkle SHA-256 package checksum verification, isolated execution sandbox, resource quotas, 3-error auto-quarantine, and safe installation/removal receipts.
- **Cross-Platform Responsive Terminal UX**: Pinned alternate screen buffer session header with logo wipe intro animation, graceful `--no-color`, `--no-unicode`, `--no-animation`, and non-TTY JSON fallbacks across Windows Terminal, PowerShell, CMD, macOS, and Linux (40-180 cols).
- **Public Developer Kit (`@veris/plugin-sdk`)**: Pure builders for Extractor and Rule Pack plugins, factual `PluginRawFeature` boundary, and self-contained TypeScript declarations.

---

## 2. VERIFIED (Empirically Proven & Certified)

Every item below has been directly verified through automated suites, cross-platform CI matrix runs, and live package tests:

- ✅ **Monorepo Compilation & Type Safety**: 31 workspace packages compile cleanly with zero TypeScript errors.
- ✅ **Test Suite Completeness**: 189 test files passed (3,789 tests passed, 0 failures, 0 skipped).
- ✅ **Lint & Style Compliance**: 0 ESLint errors, 328 warnings (under the 400 warning budget).
- ✅ **Circular Dependency Freedom**: 0 circular dependencies across 472 files verified via `madge`.
- ✅ **Performance & Benchmark Throughput**: 16.9ms median execution latency with verified canonical hash determinism (`0f7c8303...`).
- ✅ **Live npm Package Deployment**: `veris-cli@1.2.0` verified on npm registry with SLSA provenance attestations, 14 clean files, and 0 runtime dependencies.
- ✅ **Isolated Disposable Installation**: Verified fresh install of `veris-cli@1.2.0` from public npm in an empty temp directory outside the repository; executed `veris --version`, `veris --help`, `veris scan`, `veris rule author`, `veris dashboard`, and `veris ci` with expected exit codes.
- ✅ **Live GitHub Release**: `Release v1.2.0` published live with comprehensive release notes.
- ✅ **Remote CI Matrix**: GitHub Actions run 36024738978 verified with 14/14 jobs green across Node 18, 20, 22 on Ubuntu, macOS, and Windows.
- ✅ **Adversarial Security Hardening**: 25-threat security suite passing (path traversal, symlink escapes, prototype pollution, circular references, ReDoS, memory bounds).
- ✅ **Windows Production Compatibility**: Verified on Windows 11 with PowerShell, CMD, and Windows Terminal.

---

## 3. INTENTIONALLY DEFERRED

The following capabilities were explicitly evaluated and postponed to preserve architecture purity and keep core invariants intact:

- **Third-Party Remote Plugin Registry Downloads**: VERIS strictly adheres to offline-first operation. Remote fetching of unverified third-party code from internet registries is intentionally deferred; plugins must be reviewed and placed locally.
- **Dynamic Binary Sandboxing (Dynamic Execution / Detonation)**: VERIS is exclusively a static analysis platform. Runtime detonation and virtualization are out of scope.
- **Imperative / Scripted Plugins**: Plugins are restricted to factual extractors and declarative AST rules. Arbitrary executable hooks in rule packs are forbidden.
- **Cloud Analytics & Telemetry**: Zero telemetry is an inviolable architectural guarantee. No remote analytics or phone-home tracking will ever be implemented.
- **DECSTBM Scroll Region Header Pinning**: DECSTBM terminal escapes are intentionally rejected due to known rendering corruption in Windows ConPTY/Windows Terminal (microsoft/terminal#19016); alternate buffer full-frame redraw is used instead.

---

## 4. FUTURE (Potential V3+ Work)

Potential items if active product development is reopened in the future:

- Native YARA rule compiler bridge.
- WebAssembly-sandboxed extractor plugins.
- Additional compiled language extractors (Rust, Go, Swift binary parsing extensions).
- Visual threat-graph timeline reconstruction in dashboard.

---

## 5. MAINTENANCE ONLY (Permitted Post-Hold Activities)

With the repository now in **PRODUCTION HOLD**, development is limited to the following:

1. **Security Vulnerability Fixes**: Remediating any critical vulnerabilities identified in supported versions (1.2.x, 1.1.x, 1.0.x).
2. **Correctness & False Positive/Negative Bug Fixes**: Correcting analysis logic defects with regression tests.
3. **Dependency Maintenance**: Updating build/dev tooling dependencies for security and Node engine compatibility without introducing runtime dependencies into core.
4. **CI & Workflow Maintenance**: Maintaining GitHub Actions runners, action versions, and node version matrices.

---

## 6. BLOCKERS (Hold Certification State)

- **Active Blockers**: **NONE (0)**.
- **Hold Certification Status**: **FULLY CERTIFIED FOR PRODUCTION HOLD**.

---

## Historical Milestone Archive (M0 through Phase 21)

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

## Phase 20: Visual Acceptance, Showcase Capture & Terminal Aesthetics

- ✅ Visual and terminal acceptance verified across Windows Terminal, PowerShell, CMD, and standard VT consoles
- ✅ Multi-resolution responsive width testing (40, 60, 80, 120, 160, 180 cols) with zero text overlap or gutter clipping
- ✅ Interactive HTML investigation dashboard verified with headless browser rendering, dark-slate theme, and strict CSP
- ✅ Authentic showcase media capture in `assets/showcase/` (terminal flow screens, live scanning, findings summary, CI gates, rule authoring, plugin ecosystem)
- ✅ Seamless animated terminal SVG banner (`startup-animation.svg`) integrated into root README.md
- ✅ Rigorous asset privacy audit: zero private usernames, absolute local paths, or credential tokens in showcase assets

## Phase 21: Release Rehearsal & Final Hold-Point Certification

- ✅ Release versioning executed via Changesets (`v1.2.0` minor release)
- ✅ Monorepo-wide build, typecheck, lint, and 189/189 test suite passes with 0 failures
- ✅ Offline-first and zero-dependency invariants certified (`@veris/core` has 0 dependencies; `@veris/plugin-sdk` has 0 runtime dependencies)
- ✅ Historical immutable tags `v1.0.0` and `v1.1.0` verified intact
- ✅ Production tarball packaging and disposable outside-workspace installation verified
- ✅ Exact CI preflight passed across all targets
