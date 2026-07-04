# @veris/extractors

Artifact extraction framework.

## Architecture

- **Interfaces** — Extractor, ExtractorRegistry contracts
- **Registry** — ExtractorRegistry implementation
- **Builtins** — Shipping extractors

## Built-in Extractors

- ArchiveExtractor: tar, zip, gzip, bzip2, 7z
- ExecutableExtractor: ELF, PE, Mach-O
- ScriptExtractor: Python, JavaScript, Shell, PowerShell
- RepositoryExtractor: Git repositories
- TextExtractor: Plain text
- BinaryExtractor: Generic binary

## Principle

Extractors extract only — they never analyze.
