# Changelog

All notable changes to VERIS are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2026-07-05

### Changed

- Updated version from 0.1.2 to 0.1.3

## [0.1.2] - 2026-07-05

### Added

- Package published as `veris-cli` on npm
- Run via `npx veris-cli` with no installation required
- Shell completions for Bash, Zsh, and Fish
- AI explanation layer (OpenAI, Anthropic, Ollama)
- Report summarization via AI
- 6 export formats: JSON, Markdown, HTML, SARIF 2.1.0, CSV, JUnit

### Changed

- All analysis is deterministic — same input, same output
- CLI version constant updated to 0.1.2
- Build system stabilized for production releases

### Fixed

- Binary output reliability improvements

## [0.1.0] - 2026-07-04

### Added

- Initial release
- Discovery engine for filesystem traversal
- Artifact classification by file type
- 20+ extractors for PE, ELF, Mach-O, Office, archives, scripts, configs
- 20+ security rules across 8 categories
- 35 behavioral correlation patterns
- Deterministic risk scoring with contribution analysis
- 6 export formats
- Shell completions
- AI explanation layer
- CLI commands: scan, report, init, validate, explain, summarize, version, completion
- Programmatic API
- Plugin system architecture (V2+)

[0.1.3]: https://github.com/veris/veris/releases/tag/v0.1.3
[0.1.2]: https://github.com/veris/veris/releases/tag/v0.1.2
[0.1.0]: https://github.com/veris/veris/releases/tag/v0.1.0
