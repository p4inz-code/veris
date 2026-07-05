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

## V2+ Plans

- AI-assisted rule writing
- Plugin system SDK
- CI integration runner
- Web dashboard
- Additional rule packs
- Extension marketplace
