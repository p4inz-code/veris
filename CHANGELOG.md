# Changelog

All notable changes to VERIS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] — 2026-07-05

### Release Engineering

- Added `engines` field to CLI package.json (node >= 18.0.0)
- Added `engines` field to all @veris/* sub-packages (node >= 18.0.0)
- Updated README version references from v0.1.0 to v0.1.2
- Updated README installation section with npm global install instructions
- Updated README npm publishing status
- Added CHANGELOG v0.1.2 entry
- Created VERSIONING.md documenting semver policy
- Created RELEASE.md documenting the release checklist
- Updated IMPLEMENTATION_CHECKLIST.md to reflect current state

### CLI

- Bumped @veris/cli version to 0.1.2
- Updated CLI_VERSION constant in wirer.ts to 0.1.2
- Disabled tsup code splitting for reliable CLI binary output

### Packaging

- All 25 publishable @veris/* packages now have explicit `engines` field
- All packages verified with `npm pack` — clean tarballs

### Build

- tsup `splitting: false` for deterministic bundle output

### Documentation

- README now reflects npm-published status
- VERSIONING.md created with semver policy
- RELEASE.md created with official release checklist
- CHANGELOG.md updated through v0.1.2

## [0.1.0] — 2026-07-04

### Added

- **Core data model** (@veris/core): Canonical types for artifacts, findings, evidence, rules, reports, severity, risk profiles, and taxonomy
- **Shared utilities** (@veris/shared): Collections, hashing (SHA-256), serialization, Result monad, platform detection, version comparison
- **Configuration system** (@veris/config): Multi-source config loading with deterministic priority (defaults → global → workspace → CLI → env)
- **Discovery engine** (@veris/discovery): Deterministic streaming filesystem discovery with artifact graph and ignore rules
- **Classification engine** (@veris/classification): Multi-signal artifact classification with magic bytes and content signals
- **Extraction framework** (@veris/extractors): 20+ built-in extractors for PE, ELF, Mach-O, Office, archives, scripts, configuration files, and more
- **Rule engine** (@veris/rules, @veris/rules-engine): Deterministic rule matching with conditions, evidence evaluation, and built-in rule packs
- **Knowledge base** (@veris/knowledge): Feature/capability types, provenance tracking, and taxonomy support
- **Analysis pipeline** (@veris/analysis, @veris/analyzer): Orchestrated analysis from discovery through classification, extraction, and rule evaluation
- **Correlation engine** (@veris/correlation): Evidence correlation into behavioral chains with built-in correlation patterns
- **Risk engine** (@veris/risk): Deterministic risk scoring with contribution building, dimension aggregation, confidence computation, and verdict resolution
- **AI explanation layer** (@veris/explain): AI-powered natural language explanations with cache, export (Markdown/JSON), citation verification, and validation pipeline
- **AI providers** (@veris/ai): OpenAI, Anthropic, Ollama, and custom provider adapters with retry, circuit breaker, and provider registry
- **Report system** (@veris/report, @veris/exporters, @veris/renderers): Report construction and export (JSON, SARIF, Markdown)
- **Logging** (@veris/logger): Structured logging with pluggable transports
- **CLI** (@veris/cli): Command-line interface with scan, report, explain, summarize, init, validate, and version commands
- **API** (@veris/api): Programmatic API for integrating VERIS into applications
- **Plugin system** (@veris/plugins): Plugin host, SDK, and manifest system (V2+)
- **Documentation**: Architecture specifications (SPEC-001 through SPEC-011), contribution guide, security policy, code of conduct

### Architecture

- Strict layered architecture (Layer 0 → Layer 7)
- All analysis is deterministic and reproducible
- AI is strictly a consumer — never participates in analysis
- Offline-first design — no network calls from the analysis pipeline
- Immutable outputs — all objects are frozen at construction
- No circular dependencies across packages

[0.1.2]: https://github.com/veris/veris/releases/tag/v0.1.2
[0.1.0]: https://github.com/veris/veris/releases/tag/v0.1.0
