<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="">
    <img alt="VERIS" src="" width="160">
  </picture>
</p>

<h1 align="center">VERIS</h1>

<p align="center">
  <strong>V</strong>ulnerability <strong>E</strong>numeration & <strong>R</strong>isk <strong>I</strong>ntelligence <strong>S</strong>ystem
</p>

<p align="center">
  A deterministic, offline-first security investigation platform<br />
  that produces explainable findings — without AI in the critical path.
</p>

<br />

<p align="center">
  <a href="https://github.com/veris/veris/actions/workflows/ci.yml"><img src="https://github.com/veris/veris/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="CONTRIBUTING.md"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome" /></a>
  <img src="https://img.shields.io/badge/status-beta-blueviolet" alt="Status: Beta" />
  <img src="https://img.shields.io/badge/Node-%3E%3D18-339933?logo=node.js" alt="Node >= 18" />
  <img src="https://img.shields.io/badge/pnpm-%3E%3D8-F69220?logo=pnpm" alt="pnpm >= 8" />
</p>

<br />
<br />

---

## Why VERIS

Security analysis tools fall into two categories: those that are **fast but opaque** (black-box scoring, cloud-dependent, non-reproducible), and those that are **thorough but brittle** (single-purpose scanners, unmaintained rule sets).

VERIS exists at the intersection of **rigor** and **transparency**. It is a deterministic investigation platform that analyzes software artifacts, correlates evidence into behavioral chains, assigns explainable risk scores, and produces canonical reports — all without network access, hidden randomness, or AI in the analysis path.

**The problem it solves:** When a security finding surfaces, you need to know _why_ it was flagged, _what_ evidence supports it, and _how_ the conclusion was reached — and you need to be able to reproduce that exact result on any machine, at any time.

**How it's different:**

| Traditional tools        | VERIS                                                      |
| ------------------------ | ---------------------------------------------------------- |
| Black-box scoring        | Every finding traces to evidence                           |
| Cloud-dependent analysis | Offline-first, air-gap friendly                            |
| Non-reproducible results | Same input → same output                                   |
| AI in the analysis path  | AI is a consumer, never an analyst                         |
| One output format        | 6 export formats (JSON, SARIF, HTML, Markdown, CSV, JUnit) |

<br />

---

## Core Principles

| Principle             | Description                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Deterministic**     | Same input always produces byte-identical output. Zero randomness. No `Math.random()`, no UUIDs, no timestamps affecting analysis. |
| **Explainable**       | Every finding, score, and verdict traces back to the evidence that produced it. Nothing is hidden.                                 |
| **Offline-first**     | The entire analysis pipeline works without network access. Designed for air-gapped environments.                                   |
| **Immutable outputs** | Every result object is frozen at construction. Outputs cannot be mutated after creation.                                           |
| **Plugin-based**      | Extensible architecture for custom rules, extractors, and analyzers (SDK arriving in V2+).                                         |
| **AI as consumer**    | AI explains what the engine found — it never participates in analysis or modifies results.                                         |

<br />

---

## Architecture

VERIS is built as a layered pipeline. Each stage transforms or enriches data before passing it to the next. The architecture enforces strict dependency direction: foundation → framework → domain → analysis → reporting → application.

```
                    ┌─────────────────────┐
                    │     DISCOVERY       │
                    │  Find artifacts     │
                    └────────┬────────────┘
                             │
                    ┌────────▼────────────┐
                    │   CLASSIFICATION    │
                    │  Identify types     │
                    └────────┬────────────┘
                             │
                    ┌────────▼────────────┐
                    │    EXTRACTION       │
                    │  Extract features   │
                    └────────┬────────────┘
                             │
                    ┌────────▼────────────┐
                    │     KNOWLEDGE       │
                    │  Normalize & enrich │
                    └────────┬────────────┘
                             │
                    ┌────────▼────────────┐
                    │     ANALYSIS        │
                    │  Produce evidence   │
                    └────────┬────────────┘
                             │
                    ┌────────▼────────────┐
                    │      RULES          │
                    │  Match conditions   │
                    └────────┬────────────┘
                             │
                    ┌────────▼────────────┐
                    │   CORRELATION       │
                    │  Link evidence      │
                    └────────┬────────────┘
                             │
                    ┌────────▼────────────┐
                    │      RISK           │
                    │  Score & verdict    │
                    └────────┬────────────┘
                             │
                    ┌────────▼────────────┐
                    │  RECOMMENDATIONS    │
                    │  Suggest actions    │
                    └────────┬────────────┘
                             │
                    ┌────────▼────────────┐
                    │      REPORT         │
                    │  Build canonical    │
                    └────────┬────────────┘
                             │
                    ┌────────▼────────────┐
                    │     EXPORT          │
                    │  JSON, SARIF, HTML  │
                    │  Markdown, CSV,     │
                    │  JUnit              │
                    └─────────────────────┘
```

**Pipeline stages:**

| Stage           | Package                  | Responsibility                                                                            |
| --------------- | ------------------------ | ----------------------------------------------------------------------------------------- |
| Discovery       | `@veris/discovery`       | Deterministic filesystem traversal, artifact graph construction, ignore rules             |
| Classification  | `@veris/classification`  | Multi-signal artifact classification (magic bytes, content, path heuristics)              |
| Extraction      | `@veris/extractors`      | 20+ built-in extractors for PE, ELF, Mach-O, Office, archives, scripts, configs           |
| Knowledge       | `@veris/knowledge`       | Feature extraction, normalization, capability taxonomy, provenance tracking               |
| Analysis        | `@veris/analysis`        | Evidence production framework (14 built-in analyzers)                                     |
| Rules           | `@veris/rules`           | Rule engine with 20+ built-in rules across 8 categories                                   |
| Correlation     | `@veris/correlation`     | Evidence correlation into behavioral chains (35 built-in patterns)                        |
| Risk            | `@veris/risk`            | Deterministic scoring, contribution analysis, dimension aggregation, confidence, verdicts |
| Recommendations | `@veris/recommendations` | Recommendation engine (16 built-in recommendations)                                       |
| Report          | `@veris/report`          | Canonical report construction, diffing, aggregation                                       |
| Export          | `@veris/exporters`       | 6 output formats with structured serialization                                            |

<br />

---

## Features

### Analysis Engine

- **20+ artifact extractors** — PE, ELF, Mach-O, DOCX, XLSX, PPTX, ZIP, TAR, GZIP, Python, JavaScript, Shell, PowerShell, VBA, YAML, JSON, TOML, INI, Docker, dotenv
- **20+ built-in rules** across 8 categories — behavioral, structural, configuration, network, persistence, privilege, evasion, reconnaissance
- **35 correlation patterns** for linking evidence into behavioral chains
- **16 built-in recommendations** for actionable remediation guidance

### Risk & Scoring

- **Deterministic scoring** — No randomness, no hidden weights. Same input always produces the same score.
- **Contribution analysis** — Every score component traces to specific evidence
- **Confidence computation** — Signal quality and coverage metrics
- **Verdict resolution** — Clear pass/warning/fail with severity classification

### Output & Integration

- **6 export formats** — JSON, Markdown, HTML, SARIF 2.1.0, CSV, JUnit XML
- **Canonical report** — Structured, diffable, aggregated report objects
- **CI integration** — SARIF and JUnit formats for pipeline embedding

### AI Explanation Layer

- **3 explanation modes** — Simple (one paragraph), Technical (detailed with citations, default), Expert (full traceability chain)
- **Provider-agnostic** — OpenAI, Anthropic, Ollama, or custom adapters
- **Citation verification** — Explanations cite specific evidence and source locations
- **Output cache** — LRU cache with TTL to avoid redundant generation
- **Full offline support** — Use Ollama for completely air-gapped AI explanations

### CLI

- **8 commands** — `scan`, `report`, `init`, `validate`, `explain`, `summarize`, `version`, `completion`
- **Shell completions** — Bash, Zsh, Fish
- **Structured output** — JSON and human-readable modes

<br />

---

## Quick Start

```bash
# Clone
git clone https://github.com/veris/veris.git
cd veris

# Install & build
pnpm install
pnpm build

# Initialize configuration
pnpm --filter=@veris/cli veris init

# Run a scan
pnpm --filter=@veris/cli veris scan

# Generate an HTML report
pnpm --filter=@veris/cli veris report --format html

# Explain a finding
pnpm --filter=@veris/cli veris explain fin_abc123
```

**Prerequisites:** Node.js >= 18, pnpm >= 8

<br />

---

## Installation

```bash
# Global install (npm published package)
npm install -g @veris/cli

# Verify installation
veris --help
```

### From source

```bash
git clone https://github.com/veris/veris.git
cd veris
pnpm install
pnpm build
```

> **Note:** VERIS is currently in **beta** (v0.1.2). npm packages are available on the public registry. See [Installation](#installation) for global install instructions.

<br />

---

## CLI Reference

### Commands

| Command                               | Description                          |
| ------------------------------------- | ------------------------------------ |
| `veris scan`                          | Run analysis on software artifacts   |
| `veris report --format <type>`        | Generate and export reports          |
| `veris init`                          | Initialize VERIS configuration       |
| `veris validate`                      | Validate configuration or rules      |
| `veris explain <finding_id> [--mode]` | Generate AI explanation of a finding |
| `veris summarize`                     | Summarize the latest scan report     |
| `veris version`                       | Show version information             |
| `veris completion <shell>`            | Generate shell completions           |

### Explanation Modes

| Mode        | Description                                                    |
| ----------- | -------------------------------------------------------------- |
| `simple`    | One-paragraph plain-language explanation                       |
| `technical` | Detailed explanation with evidence and citations (default)     |
| `expert`    | Full traceability chain with all evidence and source locations |

### Export Formats

| Format     | Use case                                          |
| ---------- | ------------------------------------------------- |
| `json`     | Full structured report — programmatic consumption |
| `markdown` | Developer-friendly readable report                |
| `html`     | Human-readable report with formatting             |
| `sarif`    | SARIF 2.1.0 — CI pipeline integration             |
| `csv`      | Tabular data — spreadsheets and dashboards        |
| `junit`    | JUnit XML — CI pipeline test reporting            |

### Examples

```bash
# Scan with JSON export
veris scan --format json

# Scan with multiple formats
veris scan --format json,html

# Expert explanation in JSON
veris explain fin_abc123 --mode expert --json

# Export an existing report
veris report --format html

# Generate bash completions
veris completion bash > /etc/bash_completion.d/veris
```

<br />

---

## API Usage

### Programmatic API

```typescript
import { scan, analyze, buildApiReport, exportApiReport, validate } from '@veris/api';

// Complete scan — discovery through report
const result = await scan(input, { format: 'json' });
console.log(result.report.summary.riskScore);
console.log(result.exportResult.content);

// Analyze only — pipeline without report
const pipelineResult = await analyze(input);

// Validate configuration
const validation = validate(config);
if (!validation.valid) {
  console.error('Invalid config:', validation.issues);
}
```

### Pipeline API

```typescript
import { createAnalyzer } from '@veris/analyzer';
import { buildReport } from '@veris/report';
import { exportReport } from '@veris/exporters';

const pipeline = createAnalyzer();
const result = await pipeline.run({
  artifacts: [],
  evidence: [],
  features: [],
  sessionId: 'my-session',
});

const report = buildReport(result, {
  artifacts: [],
  evidence: [],
  features: [],
  sessionId: 'my-session',
});

const json = exportReport(report, 'json');
```

### Individual Engine API

```typescript
import { DiscoveryEngine } from '@veris/discovery';
import { ClassificationEngine } from '@veris/classification';
import { RuleEngine } from '@veris/rules';
import { RiskEngine } from '@veris/risk';

// Discover artifacts
const discovery = new DiscoveryEngine();
const artifacts = await discovery.discover('./target');

// Classify artifacts
const classifier = new ClassificationEngine();
const classified = await classifier.classifyMany(artifacts);

// Evaluate rules
const rules = new RuleEngine(registry);
const { matches } = await rules.evaluate(context);

// Assess risk
const risk = new RiskEngine();
const assessment = risk.evaluate(input);
```

<br />

---

## Package Overview

VERIS is a monorepo of 26 packages organized into 6 layers. Packages at lower layers must not depend on packages at higher layers.

### Foundation

| Package         | Description                                                                     | Status    |
| --------------- | ------------------------------------------------------------------------------- | --------- |
| `@veris/core`   | Canonical domain types, error hierarchy, constants                              | ✅ Stable |
| `@veris/shared` | Collections, hashing (SHA-256), serialization, Result monad, platform utilities | ✅ Stable |

### Framework

| Package            | Description                                             | Status  |
| ------------------ | ------------------------------------------------------- | ------- |
| `@veris/config`    | Multi-source config loading with deterministic priority | ✅ Beta |
| `@veris/logger`    | Structured logging with pluggable transports            | ✅ Beta |
| `@veris/telemetry` | Metrics, tracing, and reporting                         | ✅ Beta |
| `@veris/ai`        | AI provider adapters (OpenAI, Anthropic, Ollama)        | ✅ Beta |

### Domain — Analysis

| Package                  | Description                                                     | Status  |
| ------------------------ | --------------------------------------------------------------- | ------- |
| `@veris/discovery`       | Deterministic filesystem discovery and artifact graph           | ✅ Beta |
| `@veris/classification`  | Multi-signal artifact classification                            | ✅ Beta |
| `@veris/extractors`      | Extraction framework (20+ built-in extractors)                  | ✅ Beta |
| `@veris/knowledge`       | Feature extraction, normalization, knowledge engine             | ✅ Beta |
| `@veris/rules`           | Rule types, builders, built-in rules (20+ across 8 categories)  | ✅ Beta |
| `@veris/rules-engine`    | Rule matching, evaluation, scheduling                           | ✅ Beta |
| `@veris/correlation`     | Evidence correlation (35 built-in patterns)                     | ✅ Beta |
| `@veris/risk`            | Deterministic risk scoring, verdict resolution, decision engine | ✅ Beta |
| `@veris/recommendations` | Recommendation engine (16 built-in recommendations)             | ✅ Beta |

### Analysis

| Package           | Description                                                    | Status  |
| ----------------- | -------------------------------------------------------------- | ------- |
| `@veris/analysis` | Evidence production framework (14 built-in analyzers)          | ✅ Beta |
| `@veris/analyzer` | Pipeline orchestrator wrapper                                  | ✅ Beta |
| `@veris/pipeline` | Pipeline orchestration (Rules → Correlation → Risk → Decision) | ✅ Beta |

### Reporting

| Package            | Description                                                    | Status         |
| ------------------ | -------------------------------------------------------------- | -------------- |
| `@veris/report`    | Canonical report construction, diffing, aggregation            | ✅ Beta        |
| `@veris/exporters` | Report serialization (JSON, Markdown, HTML, SARIF, CSV, JUnit) | ✅ Beta        |
| `@veris/explain`   | AI explanation layer (cache, export, validation)               | ✅ Beta        |
| `@veris/renderers` | Visual rendering (TUI, HTML)                                   | 🔄 In Progress |

### Interfaces

| Package          | Description                                                | Status         |
| ---------------- | ---------------------------------------------------------- | -------------- |
| `@veris/cli`     | Command-line interface (8 commands)                        | ✅ Beta        |
| `@veris/api`     | Programmatic API (scan, analyze, report, export, validate) | ✅ Beta        |
| `@veris/runners` | Execution environment adapters                             | 🔄 In Progress |

### Extensions (V2+)

| Package          | Description         | Status |
| ---------------- | ------------------- | ------ |
| `@veris/plugins` | Plugin host and SDK | 🔜 V2+ |

<br />

---

## Determinism

Determinism is VERIS's strongest technical guarantee — and its primary differentiator. Every analysis run with identical inputs produces **byte-identical outputs**.

### What this means

- **Reproducibility:** Any finding can be reproduced by any engineer on any machine
- **Auditability:** Results can be verified by third parties without access to the original environment
- **CI reliability:** Scans never produce flaky or non-deterministic results
- **Legal defensibility:** Evidence chains are provably consistent across runs

### How it's enforced

| Mechanism            | Implementation                                                                   |
| -------------------- | -------------------------------------------------------------------------------- |
| No randomness        | Zero calls to `Math.random()`, `crypto.randomUUID()`, or similar APIs            |
| Injected clocks      | All timestamps accept a `computedAt` parameter — no `Date.now()` in the pipeline |
| Stable ordering      | All collections use deterministic sort order — no insertion-order dependence     |
| Stable serialization | JSON output uses sorted keys                                                     |
| Immutable outputs    | Every result object is `Object.freeze()`d at construction                        |
| CI enforcement       | Determinism test suite runs on every PR                                          |

> **Same input. Same output. Every time.**

<br />

---

## AI Philosophy

VERIS has a deliberately constrained relationship with AI.

**AI is a consumer of analysis results — never an analyst.**

The analysis pipeline — discovery, classification, extraction, rules, correlation, risk, recommendations — is entirely deterministic. AI has no influence on what gets detected, how it's scored, or what the report contains.

### What AI does

- Generates natural language explanations of deterministic findings
- Summarizes scan reports in plain language
- Cites specific evidence and source locations

### What AI does not do

- ❌ Perform analysis
- ❌ Modify findings
- ❌ Influence risk scores
- ❌ Classify artifacts
- ❌ Suggest detections

### Providers

VERIS supports multiple AI providers through a unified adapter interface:

- **OpenAI** — Cloud-based explanations
- **Anthropic** — Cloud-based explanations
- **Ollama** — Fully offline, local explanations
- **Custom** — Implement your own adapter

When using Ollama, the entire system — analysis _and_ explanation — can operate without any network connectivity.

<br />

---

## Development

```bash
# Install dependencies
pnpm install

# Build all packages (core first, then layers)
pnpm build

# Type-check all packages
pnpm typecheck

# Run all tests (2,795+)
pnpm test

# Run with coverage
pnpm test:coverage

# Lint
pnpm lint

# Format check
pnpm format

# Full CI pipeline
pnpm ci:all

# Check for circular dependencies
pnpm circular
```

### Project structure

```
veris/
├── packages/          # 26 packages across 6 layers
│   ├── core/          # Foundation — types, errors, constants
│   ├── shared/        # Foundation — utilities
│   ├── config/        # Framework — configuration
│   ├── logger/        # Framework — structured logging
│   ├── telemetry/     # Framework — metrics
│   ├── ai/            # Framework — AI providers
│   ├── discovery/     # Domain — artifact discovery
│   ├── classification/# Domain — artifact classification
│   ├── extractors/    # Domain — feature extraction
│   ├── knowledge/     # Domain — knowledge engine
│   ├── rules/         # Domain — rule definitions
│   ├── rules-engine/  # Domain — rule evaluation
│   ├── correlation/   # Domain — evidence correlation
│   ├── risk/          # Domain — risk scoring
│   ├── recommendations/# Domain — action recommendations
│   ├── analysis/      # Analysis — evidence framework
│   ├── analyzer/      # Analysis — pipeline orchestrator
│   ├── pipeline/      # Analysis — pipeline orchestration
│   ├── report/        # Reporting — report construction
│   ├── exporters/     # Reporting — output formats
│   ├── explain/       # Reporting — AI explanations
│   ├── renderers/     # Reporting — visual rendering
│   ├── cli/           # Interface — command-line
│   ├── api/           # Interface — programmatic API
│   ├── runners/       # Interface — execution adapters
│   └── plugins/       # Interface — plugin SDK (V2+)
├── docs/              # Architecture specifications (SPEC-001–012)
└── tools/             # Codegen, performance, security
```

### Commit conventions

This project follows [Conventional Commits](https://www.conventionalcommits.org/):

```
feat:     New feature
fix:      Bug fix
docs:     Documentation
refactor: Code refactoring
test:     Test changes
chore:    Maintenance
```

### Quality standards

| Check                  | Requirement                                           |
| ---------------------- | ----------------------------------------------------- |
| TypeScript strict mode | Enabled across all packages                           |
| ESLint                 | Zero `any`, zero `console.log`, zero unused variables |
| Formatting             | Prettier-enforced                                     |
| Circular dependencies  | Zero — enforced by madge in CI                        |
| Test coverage          | Minimum 80% per package                               |
| Determinism            | Full determinism test suite                           |

<br />

---

## Roadmap

### Current: Beta (v0.1.2)

- ✅ All 26 packages scaffolded and building
- ✅ 2,795+ tests across all packages
- ✅ Full pipeline from discovery through export
- ✅ Determinism audit complete
- ✅ Security audit complete
- ✅ Performance audit complete
- ✅ Architecture specifications frozen (SPEC-001–012)
- ✅ npm publishing ready

### V1.0

| Item                         | Status |
| ---------------------------- | ------ |
| npm publishing pipeline      | 🔜     |
| API documentation generation | 🔜     |
| Performance benchmarks       | 🔜     |
| Third-party security audit   | 🔜     |
| **V1.0 release**             | 🔜     |

### V2+

| Item                     | Status |
| ------------------------ | ------ |
| AI-assisted rule writing | 🔜     |
| Plugin system SDK        | 🔜     |
| CI integration runner    | 🔜     |
| Web dashboard            | 🔜     |
| Additional rule packs    | 🔜     |
| Community marketplace    | 🔜     |

<br />

---

## FAQ

### Is VERIS production-ready?

VERIS is in **beta** (v0.1.2). All core analysis packages are functional with extensive test coverage. The full pipeline from discovery through export is implemented. V1.0 is being prepared for release.

### Does VERIS require an internet connection?

**No.** The analysis pipeline makes zero network calls. AI explanations can use Ollama for a fully offline experience. VERIS is designed for air-gapped environments.

### Is VERIS deterministic?

**Yes.** Same input always produces byte-identical output. No randomness, no hidden state, no flaky results. See the [Determinism](#determinism) section.

### Does VERIS use AI for analysis?

**No.** AI is strictly a consumer of analysis results. It explains findings — it never detects them. See the [AI Philosophy](#ai-philosophy) section.

### What artifact types does VERIS support?

PE executables, ELF binaries, Mach-O binaries, Office documents (DOCX, XLSX, PPTX), archives (ZIP, TAR, GZ), scripts (Python, JavaScript, Shell, PowerShell, VBA), configuration files (YAML, JSON, TOML, INI, Docker, dotenv), and more — 20+ extractors in total.

### How is VERIS licensed?

MIT License. See [LICENSE](LICENSE) for details.

<br />

---

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for:

- Development workflow
- Branch strategy
- Commit conventions
- Pull request process
- Architecture compliance requirements
- Determinism requirements

All contributions must comply with the architecture specifications in [`docs/architecture/`](docs/architecture/) (SPEC-001 through SPEC-012).

<br />

---

## License

MIT — see [LICENSE](LICENSE) for the full text.

<br />

<p align="center">
  <sub>Built with ❌ no AI in the analysis path.</sub>
</p>
