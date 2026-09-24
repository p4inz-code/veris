# veris-cli

## 1.2.0

### Minor Changes

- a244426: feat(ci): add deterministic security gate runner and automated policy enforcement

  - Implemented `veris ci [target] [options]` runner command with standalone and baseline modes
  - Added location-aware finding fingerprinting with deterministic cross-platform path normalization
  - Implemented hardened baseline ingestion supporting CanonicalReport and CiSummary with prototype pollution defense and 50MB ceiling
  - Added 5-way differential comparator (`unchanged`, `new`, `regressed`, `evidence_changed`, `resolved`)
  - Added configurable security policy gate evaluator (`failOn`, `failOnNew`, `maxNew`, `failOnRegressions`, `maxRisk`, `failOnPluginQuarantine`)
  - Added dual CI artifact emission: machine-readable `ci-summary.json` and GitHub Step Summary Markdown
  - Codified deterministic exit codes: 0 (Success), 1 (Scan error), 2 (Usage error), 10 (Gate violation), 11 (Invalid baseline), 12 (Invalid config), 13 (Plugin error), 130 (Cancelled)

- a7c7c26: feat(v2): complete V2 roadmap — AI rule authoring, visual dashboard, and plugin marketplace

  - **Phase 12 (AI-Assisted Rule Authoring)**:
    - Added `veris rule author` command for intent-driven declarative detection rule generation.
    - Implemented deterministic validation gate enforcing AST purity, regex ReDoS safety, and engine compatibility.
    - Added synthetic test fixture generator running positive/negative validation through real RuleEngine.
    - Added candidate artifact assembly with explicit human review warnings and active plugin promotion (`--promote`).
    - Added support for disjunctive version ranges (`||`) in `@veris/shared` semver matcher.

  - **Phase 13 (Visual Investigation Dashboard)**:
    - Added `veris dashboard` command for interactive investigation and report export.
    - Implemented zero-dependency, self-contained HTML report generator with dark-slate design system.
    - Implemented zero-network loopback viewer server bound strictly to `127.0.0.1` with strict Content Security Policy (`default-src 'none'`) and anti-framing security headers.
    - Added interactive finding search, severity breakdown, and expandable evidence traces.

  - **Phase 14 (Plugin Ecosystem & Marketplace Foundation)**:
    - Added `veris plugins catalog` command for browsing local-first verified plugin packages.
    - Added `veris plugins verify` command for content-addressed Merkle SHA-256 checksum verification, engine compatibility check, and capability auditing.
    - Added `veris plugins install` and `veris plugins remove` commands with mandatory verification gates and immutable `.veris-installed.json` receipts.
    - Codified 4-stage lifecycle separation: Discovery -> Verification -> Installation -> Execution.

### Patch Changes

- 8bda07d: feat(acceptance): product UX/UI consistency, cross-platform runtime, and end-to-end acceptance hardening (Phases 15–18)

  - **Phase 15 (Product UX/UI Consistency & CLI Experience)**:
    - Standardized CLI output and global help across 40, 60, 80, 120, 160, and 180 column terminal widths.
    - Verified color-blind accessible error indicators and ASCII fallback mode (`--no-unicode`).
    - Added public `registerAllCommands` export and test guard to prevent premature process exit.
  - **Phase 16 (Cross-Platform / Runtime / Installation Hardening)**:
    - Validated cross-platform path handling and zero-dependency guarantees for core packages.
    - Fixed `madge` circular dependency check invocation to support Windows and POSIX without glob failures.
    - Verified clean disposable installation of production tarballs outside the repository.
  - **Phase 17 (Full End-to-End Product Acceptance)**:
    - Executed complete 14-step end-to-end user journey across scan, report, dashboard, AI rule authoring, plugin promotion, and CI runner.
    - Verified security corpus coverage on clean, suspicious, malformed, and configuration targets.
  - **Phase 18 (Final Quality & Release-Candidate Hardening)**:
    - Verified monorepo circular dependency freedom (0 circular dependencies across 472 files).
    - Validated quick performance benchmark (16.3ms median execution with canonical determinism).

- feat(release): visual acceptance, showcase capture, and final release hold-point ship (Phases 20–21)

  - **Phase 20 (Visual Acceptance & Showcase Capture)**:
    - Verified terminal and console rendering across Windows Terminal, PowerShell, CMD, and standard VT consoles.
    - Validated responsive width adaptation across 40, 60, 80, 120, 160, and 180 column viewports with zero gutter clipping.
    - Verified standalone HTML investigation dashboard rendering in real headless browser environment.
    - Generated authentic visual showcase assets in `assets/showcase/` (startup banner, active scan, findings summary, plugin ecosystem, AI rule authoring, CI gate enforcement, and animated SVG banner).
    - Passed asset privacy audit: zero private paths, personal usernames, or secret tokens.
  - **Phase 21 (Final Release & Hold-Point Ship)**:
    - Executed monorepo release rehearsal and version bump to `v1.2.0`.
    - Certified core invariants: 100% deterministic analysis, offline-first execution, 0 telemetry, zero-dependency `@veris/core` and `@veris/plugin-sdk`.
    - Verified immutable preservation of historical release tags `v1.0.0` and `v1.1.0`.
    - Verified clean disposable package installation and end-to-end execution outside monorepo tree.

## 1.1.0

### Minor Changes

- a350870: Integrate local plugin discovery and runtime into CLI scan pipeline and add veris plugins management command.
