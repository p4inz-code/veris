# Architecture

VERIS is a deterministic security analysis platform. The analysis pipeline
transforms files into structured reports through a series of stages.

## Pipeline

```
Discovery  →  Classification  →  Extraction  →  Rules  →  Risk  →  Report
```

Each stage transforms data before passing it to the next. The pipeline is
entirely deterministic — no randomness, no network calls, no mutable state.

### Discovery

Walks the filesystem, finds files, and builds an artifact graph. Respects
ignore rules and configurable depth limits.

### Classification

Identifies the type of each file using magic bytes, content signatures, and
path heuristics. Determines whether a file is an executable, script, document,
archive, configuration, or other type.

### Extraction

Extracts features from each file. 20+ extractors handle PE, ELF, Mach-O,
Office documents, archives, scripts, configuration files, and more.

### Rules

Matches extracted features against built-in security rules. 20+ rules across
8 categories covering behavioral, structural, configuration, network,
persistence, privilege, evasion, and reconnaissance patterns.

### Risk

Evaluates matched rules, correlates evidence into behavioral chains, and
produces a deterministic risk score with contribution analysis. Every score
component traces to specific evidence.

### Report

Builds a canonical report with findings, risk assessment, and recommendations.
Exports to JSON, Markdown, HTML, SARIF, CSV, and JUnit.

## Key properties

- **Deterministic** — Same input always produces bit-identical output
- **Offline-first** — Analysis requires no network access
- **Immutable** — All outputs are frozen at construction
- **Explainable** — Every finding traces to specific evidence
- **AI as consumer** — AI explains results, never participates in analysis

## Design constraints

- No `Math.random()`, `crypto.randomUUID()`, or other randomness in analysis
- No `Date.now()` in the pipeline — all timestamps are injected
- Stable ordering in all collections
- Immutable output objects
- No circular dependencies between components
