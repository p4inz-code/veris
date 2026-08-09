
<p align="center">
  <img src="https://github.com/p4inz-code/veris/blob/main/assets/banner.png?raw=true" alt="VERIS Banner" width="100%">
</p>


<p align="center">
  <strong>Vulnerability Enumeration & Risk Intelligence System</strong><br>
  Offline-first, deterministic, explainable security analysis.
</p>

<p align="center">
  <a href="https://github.com/p4inz-code/veris/releases"><img src="https://img.shields.io/github/v/release/p4inz-code/veris?style=flat-square&label=release" alt="GitHub Release"></a>
  <a href="https://github.com/p4inz-code/veris/actions"><img src="https://img.shields.io/github/actions/workflow/status/p4inz-code/veris/ci.yml?style=flat-square&label=ci" alt="CI"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D18-339933?style=flat-square" alt="Node.js"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-UNLICENSED-ff69b4?style=flat-square" alt="License"></a>
</p>

---

## Overview

VERIS is a **deterministic security analysis platform** that scans files and directories for security risks and produces reproducible, explainable reports.

The entire analysis pipeline runs **100% offline**. No network calls, no telemetry, no cloud dependency. Every scan produces bit-identical output from the same input — guaranteed.

```bash
# Scan the current directory
npx veris-cli scan

# Install globally (optional)
npm install -g veris-cli
```

## Why VERIS?

| Property      | VERIS                                      | Typical Tools               |
| ------------- | ------------------------------------------ | --------------------------- |
| Offline-first | ✅ Fully local                             | Usually require cloud       |
| Deterministic | ✅ Same input → same output                | Non-deterministic           |
| Explainable   | ✅ Every finding traces to evidence        | Opaque scores               |
| AI-assisted   | ✅ AI explains results (consumer only)     | AI participates in analysis |
| Open format   | ✅ JSON, Markdown, HTML, SARIF, CSV, JUnit | Proprietary formats         |

## Features

### Analysis Engine

- **20+ extractors** — PE, ELF, Mach-O, Office documents, archives, scripts, configuration files
- **PE deep analysis** — section enumeration, import categorization, packer detection, compiler fingerprinting, TLS callbacks, resource analysis, Authenticode signatures, overlay detection, timestamp anomaly detection, entry point analysis
- **20+ security rules** — 8 categories covering behavioral, structural, configuration, network, persistence, privilege, evasion, and reconnaissance patterns
- **35+ correlation patterns** — behavioral chain detection across evidence types

### Determinism

- Bit-identical output from identical input
- No `Math.random()`, no `crypto.randomUUID()`, no `Date.now()` in pipeline
- Stable ordering across all collections
- Immutable output objects (frozen at construction)

### Reports

- **6 export formats**: JSON, Markdown, HTML, SARIF 2.1.0, CSV, JUnit
- Structured findings with severity, confidence, and evidence traces
- Risk scoring with full contribution analysis
- Trust profiling per artifact

### AI (Optional)

- Explain findings, behavioral chains, and risk dimensions
- Modes: simple, technical, expert
- Providers: OpenAI, Anthropic, Ollama
- **AI is consumer only** — never participates in analysis

### Platform

- Windows, macOS, Linux
- Node.js 18+
- Shell completions for Bash, Zsh, Fish

## Architecture

```
  Input
    ↓
  Discovery ─── Filesystem walker, artifact graph, ignore rules
    ↓
  Classification ─── Magic bytes, content signatures, path heuristics
    ↓
  Extraction ─── 20+ format-specific extractors
    ↓
  Rules ─── 20+ security rules, 8 categories
    ↓
  Correlation ─── 35+ behavioral patterns
    ↓
  Risk ─── Deterministic scoring, verdicts, confidence
    ↓
  Report ─── Canonical report, 6 export formats
```

Everything is deterministic, immutable, and auditable.

## Quick Start

```bash
# Run without installing (recommended)
npx veris-cli scan
```

```bash
# Install permanently
npm install -g veris-cli

# Scan a specific directory
veris scan ./project

# Generate an HTML report
veris scan --format html

# Initialize configuration
veris init

# View all commands
veris --help
```

Example output:

```
 Scan Complete

  Files scanned:  142
  Findings:        12
  Risk Score:     3.45 / 10.0
  Risk Level:     medium
  Duration:       1.2s

  Output: /home/user/project/veris-output/
```

## CLI Commands

| Command            | Description                           |
| ------------------ | ------------------------------------- |
| `veris scan`       | Run analysis on files and directories |
| `veris report`     | Export reports from an existing scan  |
| `veris pack`       | Manage knowledge packs                |
| `veris init`       | Create a configuration file           |
| `veris validate`   | Validate configuration or rules       |
| `veris explain`    | Explain findings using AI             |
| `veris summarize`  | Summarize a scan report using AI      |
| `veris version`    | Show version information              |
| `veris completion` | Generate shell completion scripts     |

Run any command with `--help` for detailed options:

```bash
veris scan --help
veris explain --help
veris --help
```

## Output Formats

| Format   | Extension | Use Case                                       |
| -------- | --------- | ---------------------------------------------- |
| JSON     | `.json`   | Full structured data, programmatic consumption |
| Markdown | `.md`     | Developer-friendly, version control friendly   |
| HTML     | `.html`   | Human-readable, shareable                      |
| SARIF    | `.sarif`  | CI integration, IDE tooling                    |
| CSV      | `.csv`    | Tabular findings, spreadsheets                 |
| JUnit    | `.xml`    | CI pipeline integration                        |

## Knowledge Packs

VERIS ships with built-in knowledge packs that enrich analysis results with contextual information:

- **MITRE ATT&CK mappings** — Map findings to adversary techniques
- **CWE references** — Link findings to common weakness enumeration
- **Remediation guidance** — Actionable remediation steps
- **Behavioral context** — Understand why a finding matters

Knowledge packs are loaded locally and require no network access.

## PE Analysis

VERIS performs deep static analysis of Portable Executable (PE/COFF) binaries:

- **Header parsing** — DOS, COFF, optional header (PE32/PE32+)
- **Section analysis** — Permissions, entropy, naming anomalies, RWX detection
- **Import analysis** — DLL dependencies, API categorization, suspicious combinations
- **Packer detection** — Multi-signal detection (UPX, Themida, VMProtect, and others)
- **Compiler fingerprinting** — MSVC, MinGW, GCC, Clang, Rust, Go, Borland, Delphi
- **TLS callbacks** — Detection and analysis of thread-local storage callbacks
- **Resource analysis** — Version info, manifests, icons, embedded binaries
- **Signature analysis** — Authenticode certificate parsing and validation
- **Timestamp analysis** — Future timestamps, epoch values, anomaly detection
- **Entry point analysis** — Suspicious entry points, packer sections
- **Overlay detection** — Data appended after the PE structure

## Deterministic Philosophy

VERIS is built on the principle that security analysis must be **reproducible**:

1. **Same input, same output** — Always. Guaranteed.
2. **No randomness** — Analysis uses no random sources.
3. **Offline-first** — Zero network calls during analysis. No telemetry.
4. **Immutable outputs** — All results are frozen at construction time.
5. **Explainable** — Every finding traces through evidence back to source features.
6. **AI as consumer** — AI never participates in analysis; it only explains results.

## Documentation

| Document                        | Description                |
| ------------------------------- | -------------------------- |
| [INSTALL](INSTALL.md)           | Installation instructions  |
| [QUICKSTART](QUICKSTART.md)     | Step-by-step tutorial      |
| [USAGE](USAGE.md)               | Command reference          |
| [RELEASE](RELEASE.md)           | Release process            |
| [FAQ](FAQ.md)                   | Frequently asked questions |
| [ARCHITECTURE](ARCHITECTURE.md) | System architecture        |
| [CHANGELOG](CHANGELOG.md)       | Release history            |
| [CONTRIBUTING](CONTRIBUTING.md) | Development guide          |
| [SECURITY](SECURITY.md)         | Vulnerability reporting    |
| [ROADMAP](ROADMAP.md)           | Future plans               |

## Requirements

- **Node.js** 18 or later
- **npm** (included with Node.js) or **pnpm**
- No network access required for analysis

Works on **Windows**, **macOS**, and **Linux**.

## Support

- [Issues](https://github.com/p4inz-code/veris/issues) — Bug reports and feature requests
- [Discussions](https://github.com/p4inz-code/veris/discussions) — Questions and ideas
- [Security](SECURITY.md) — Vulnerability reporting

## License

UNLICENSED — Internal use. See [LICENSE](LICENSE) for details.
