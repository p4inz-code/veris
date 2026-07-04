# VERIS

**V**ulnerability **E**numeration & **R**isk **I**ntelligence **S**ystem

A **deterministic**, **offline-first** security analysis framework for detecting and explaining security threats in software artifacts.

[![CI](https://github.com/veris/veris/actions/workflows/ci.yml/badge.svg)](https://github.com/veris/veris/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## Core Principles

- **🔬 Deterministic** — Same input always produces the same output. No randomness. No flaky results.
- **📖 Explainable** — Every finding traces back to the evidence that produced it.
- **📡 Offline-first** — Everything works without network access. Air-gapped environments supported.
- **🧩 Extensible** — Plugin architecture for custom rules, extractors, and analyzers (V2+).
- **🤖 AI as Consumer** — AI explains what the engine found — it never participates in analysis.

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Initialize configuration
pnpm --filter=@veris/cli veris init

# Run a scan
pnpm --filter=@veris/cli veris scan
```

## Installation

```bash
# Clone the repository
git clone https://github.com/veris/veris.git
cd veris

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

> **Note:** VERIS is in **beta** (v0.1.0). V1.0 has not been published yet. All packages are pre-v1.

## CLI Usage

```bash
# Scan the current directory for artifacts
veris scan

# Scan with specific output format
veris scan --format json,html

# Initialize configuration
veris init

# Export an existing report
veris report --format html

# Validate configuration
veris validate

# Explain a finding with AI
veris explain fin_abc123

# Explain in different modes
veris explain fin_abc123 --mode simple
veris explain fin_abc123 --mode expert --json

# Summarize the latest scan report
veris summarize

# Generate shell completions
veris completion bash > /etc/bash_completion.d/veris
```

### Commands

| Command      | Description                                  | Status         |
| ------------ | -------------------------------------------- | -------------- |
| `scan`       | Run analysis on artifacts                    | ✅ Implemented |
| `report`     | Generate and export reports                  | ✅ Implemented |
| `init`       | Initialize VERIS configuration               | ✅ Implemented |
| `validate`   | Validate configuration or rules              | ✅ Implemented |
| `explain`    | Generate AI-powered explanations of findings | ✅ Implemented |
| `summarize`  | Summarize scan reports using AI              | ✅ Implemented |
| `version`    | Show version information                     | ✅ Implemented |
| `completion` | Generate shell completions                   | ✅ Implemented |

### Explanation Modes

| Mode        | Description                                                    |
| ----------- | -------------------------------------------------------------- |
| `simple`    | One-paragraph explanation with minimal technical jargon        |
| `technical` | Detailed explanation with evidence and citations (default)     |
| `expert`    | Full traceability chain with all evidence and source locations |

### Export Formats

| Format     | Description                           |
| ---------- | ------------------------------------- |
| `json`     | Full structured report (JSON)         |
| `markdown` | Developer-friendly Markdown report    |
| `html`     | Human-readable HTML report            |
| `sarif`    | SARIF 2.1.0 format for CI integration |
| `csv`      | Tabular findings export               |
| `junit`    | JUnit XML for CI pipeline integration |

## API Usage

### Analysis Pipeline

```typescript
import { createAnalyzer } from '@veris/analyzer';
import { buildReport } from '@veris/report';
import { exportReport } from '@veris/exporters';

// Create the analysis pipeline
const pipeline = createAnalyzer();

// Run the pipeline
const result = await pipeline.run({
  artifacts: [],
  evidence: [],
  features: [],
  sessionId: 'my-session',
});

// Build a canonical report
const report = buildReport(result, {
  artifacts: [],
  evidence: [],
  features: [],
  sessionId: 'my-session',
});

// Export to JSON
const json = exportReport(report, 'json');
```

### Programmatic API

```typescript
import { scan, analyze, buildApiReport, exportApiReport, validate } from '@veris/api';

// Complete scan (pipeline → report → export)
const result = await scan(input, {
  format: 'json',
});

console.log(result.report.summary.riskScore);
console.log(result.exportResult.content);

// Just analyze (pipeline only)
const pipelineResult = await analyze(input);

// Validate configuration
const validation = validate(config);
if (!validation.valid) {
  console.error('Invalid config:', validation.issues);
}
```

### Individual Engine API

```typescript
import { DiscoveryEngine } from '@veris/discovery';
import { ClassificationEngine } from '@veris/classification';
import { ExtractorRegistry } from '@veris/extractors';
import { RuleEngine } from '@veris/rules';
import { RiskEngine } from '@veris/risk';

// Discover artifacts
const discovery = new DiscoveryEngine();
const artifacts = await discovery.discover('./target-directory');

// Classify artifacts
const classifier = new ClassificationEngine();
const classified = await classifier.classifyMany(artifacts);

// Extract features
const extractors = new ExtractorRegistry();
for (const artifact of classified) {
  await extractors.extract(artifact);
}

// Evaluate rules
const rules = new RuleEngine(registry);
const { matches } = await rules.evaluate(context);

// Assess risk
const risk = new RiskEngine();
const assessment = risk.evaluate(input);
```

## Packages

| Package                  | Description                                                           | Status         |
| ------------------------ | --------------------------------------------------------------------- | -------------- |
| `@veris/core`            | Canonical domain types, error hierarchy, constants                    | ✅ Stable      |
| `@veris/shared`          | Utilities: collections, hashing, serialization, Result monad          | ✅ Stable      |
| `@veris/config`          | Multi-source configuration loading and merging                        | ✅ Beta        |
| `@veris/logger`          | Structured logging with pluggable transports                          | ✅ Beta        |
| `@veris/telemetry`       | Metrics, tracing, and reporting                                       | ✅ Beta        |
| `@veris/ai`              | AI provider adapters (OpenAI, Anthropic, Ollama)                      | ✅ Beta        |
| `@veris/discovery`       | Filesystem discovery engine and artifact graph                        | ✅ Beta        |
| `@veris/classification`  | Multi-signal artifact classification                                  | ✅ Beta        |
| `@veris/extractors`      | Artifact extraction framework (13 built-in extractors)                | ✅ Beta        |
| `@veris/knowledge`       | Feature extraction, normalization, and knowledge engine               | ✅ Beta        |
| `@veris/rules`           | Rule engine with 20 built-in rules across 8 categories                | ✅ Beta        |
| `@veris/rules-engine`    | Rule matching, evaluation, scheduling                                 | ✅ Beta        |
| `@veris/correlation`     | Evidence correlation (35 built-in patterns)                           | ✅ Beta        |
| `@veris/risk`            | Deterministic risk scoring, verdict resolution, decision engine       | ✅ Beta        |
| `@veris/analysis`        | Evidence production framework (14 built-in analyzers)                 | ✅ Beta        |
| `@veris/analyzer`        | Pipeline orchestrator wrapper                                         | ✅ Beta        |
| `@veris/pipeline`        | Pipeline orchestration (Rules → Correlation → Risk → Decision)        | ✅ Beta        |
| `@veris/report`          | Canonical report construction, diffing, and aggregation               | ✅ Beta        |
| `@veris/exporters`       | Report serialization (JSON, Markdown, HTML, SARIF, CSV, JUnit)        | ✅ Beta        |
| `@veris/explain`         | AI explanation layer (cache, export, validation)                      | ✅ Beta        |
| `@veris/renderers`       | Visual rendering (TUI, HTML)                                          | 🔄 In Progress |
| `@veris/cli`             | Command-line interface (8 commands)                                   | ✅ Beta        |
| `@veris/api`             | Programmatic API (scan, analyze, buildReport, exportReport, validate) | ✅ Beta        |
| `@veris/runners`         | Execution environment adapters                                        | 🔄 In Progress |
| `@veris/plugins`         | Plugin host and SDK                                                   | 🔜 V2+         |
| `@veris/recommendations` | Recommendation engine (16 built-in recommendations)                   | ✅ Beta        |

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run type checking
pnpm typecheck

# Run tests
pnpm test

# Lint
pnpm lint

# Run all checks (CI pipeline)
pnpm ci:all
```

## Determinism Guarantees

VERIS makes strong determinism guarantees:

1. **Same input → Same output**: Every analysis run with identical inputs produces byte-identical outputs
2. **No randomness**: No `Math.random()`, no UUIDs, no timestamps affecting results
3. **Injected clocks**: All timestamps in results accept an injected `computedAt` parameter
4. **Stable ordering**: All collections are deterministically ordered
5. **Stable serialization**: JSON output uses sorted keys
6. **Immutable outputs**: Every result object is frozen at construction

## FAQ

### Is VERIS production-ready?

VERIS is currently in **beta** (v0.1.0). All core analysis packages are functional with extensive test coverage. The analysis pipeline orchestrator, report builder, and all major export formats are implemented. V1.0 is planned for a future release.

### Does VERIS require an internet connection?

**No.** VERIS is designed to work entirely offline. The analysis pipeline (discovery → classification → extraction → rules → risk) makes zero network calls. AI explanations can optionally use local providers (Ollama) for a fully offline experience.

### Is VERIS deterministic?

**Yes.** Same input always produces the same output. There is no randomness in the analysis pipeline. All outputs are frozen and immutable.

### Does VERIS use AI for analysis?

**No.** AI is strictly a **consumer** of analysis results. It explains what the deterministic engine found — it never participates in analysis.

### What artifact types are supported?

VERIS currently supports: PE executables, ELF binaries, Mach-O binaries, Office documents (DOCX, XLSX, PPTX), archives (ZIP, TAR, GZ), scripts (Python, JavaScript, Shell, PowerShell, VBA), configuration files (YAML, JSON, TOML, INI, Docker, dotenv), and more.

### How many tests does VERIS have?

VERIS has extensive test coverage across all packages, including unit tests, integration tests, determinism tests, and edge case tests.

### Can I contribute?

**Yes!** See [CONTRIBUTING.md](CONTRIBUTING.md) for our contribution guidelines.

### What license does VERIS use?

VERIS is licensed under the **MIT License** — see [LICENSE](LICENSE) for details.

## License

MIT — see [LICENSE](LICENSE)
