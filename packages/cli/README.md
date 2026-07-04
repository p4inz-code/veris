# @veris/cli

VERIS CLI — deterministic security analysis platform.

## Usage

```
veris <command> [options]
```

## Commands

| Command      | Description                                |
| ------------ | ------------------------------------------ |
| `scan`       | Run analysis on artifacts                  |
| `report`     | Generate and export reports                |
| `init`       | Initialize VERIS configuration             |
| `validate`   | Validate configuration or rules            |
| `explain`    | Explain findings, chains, or risk using AI |
| `summarize`  | Summarize scan reports using AI            |
| `version`    | Show version information                   |
| `completion` | Generate shell completions                 |

## Explain Command

The `explain` command generates AI-powered natural-language explanations
of deterministic analysis results. The AI is always read-only and optional
— it explains what the analysis engine has already determined.

```
veris explain <finding-id>                     Explain a finding
veris explain <finding-id> --mode <mode>        With explanation mode
veris explain chain <chain-id>                  Explain a behavior chain
veris explain risk <dimension-id>               Explain a risk dimension
veris explain <finding-id> --json               JSON output
veris explain <finding-id> --no-audit           Disable audit logging
veris explain <finding-id> --offline            Force offline mode
veris explain <finding-id> --provider <id>      Use a specific AI provider
veris explain <finding-id> --model <name>       Use a specific model
```

**Explanation modes:**

- `simple` — One-paragraph explanation with minimal technical jargon
- `technical` — Detailed explanation with evidence and citations (default)
- `expert` — Full traceability chain with all evidence and source locations

## Summarize Command

The `summarize` command generates an AI-powered summary of a complete
scan report, including top findings, risk assessment, and recommendations.

```
veris summarize                          Summarize the report
veris summarize --mode <mode>            With summary mode
veris summarize --json                   JSON output
veris summarize --no-audit               Disable audit logging
veris summarize --offline                Force offline mode
```

## Exit Codes

| Code | Meaning              |
| ---- | -------------------- |
| 0    | Success              |
| 1    | General error        |
| 2    | Usage error          |
| 3    | Not found            |
| 4    | Provider unavailable |
| 5    | Cache error          |

## Global Options

| Option            | Description               |
| ----------------- | ------------------------- |
| `--help`, `-h`    | Show help for any command |
| `--version`, `-v` | Show version information  |

## Examples

```bash
# Scan the current directory
veris scan

# Explain a finding
veris explain fin_abc123

# Simple explanation
veris explain fin_abc123 --mode simple

# Expert explanation with JSON output
veris explain fin_abc123 --mode expert --json

# Explain a behavior chain
veris explain chain bc_def456

# Summarize the latest scan
veris summarize

# Use Ollama provider with a specific model
veris explain fin_abc123 --provider ollama --model llama3.1:8b

# Offline mode (no network calls)
veris explain fin_abc123 --offline
```

## Invariants

- CLI is the composition root (dependency injection wiring)
- CLI never contains analysis logic
- CLI commands delegate to domain packages
- AI is always read-only and optional
