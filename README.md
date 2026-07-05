# VERIS

Vulnerability Enumeration & Risk Intelligence System.

VERIS is an offline-first security analysis tool. It scans files and directories for
security risks and produces deterministic, reproducible reports.

The entire analysis pipeline runs locally. No network calls. No telemetry. No
cloud dependency.

## Installation

```bash
# Run without installing (recommended)
npx veris-cli

# Install permanently
npm install -g veris-cli
```

Requirements: Node.js 18 or later. Works on Windows, macOS, and Linux.

## Quick start

```bash
# Scan the current directory
veris scan

# Scan a specific directory
veris scan ./project

# Generate an HTML report
veris scan --format html

# Initialize configuration
veris init

# Show all commands
veris --help
```

## Features

- Scans executables, scripts, documents, archives, and configuration files
- 20+ extractors for file types including PE, ELF, Mach-O, Office, ZIP, scripts
- Deterministic analysis — same input always produces the same output
- 6 export formats: JSON, Markdown, HTML, SARIF, CSV, JUnit
- Shell completions for Bash, Zsh, and Fish
- Optional AI explanations (OpenAI, Anthropic, Ollama)
- Works fully offline — no network access required

## Documentation

| Document                    | Description                |
| --------------------------- | -------------------------- |
| [INSTALL](INSTALL.md)       | Installation instructions  |
| [QUICKSTART](QUICKSTART.md) | Step-by-step tutorial      |
| [USAGE](USAGE.md)           | Command reference          |
| [RELEASE](RELEASE.md)       | Release notes              |
| [FAQ](FAQ.md)               | Frequently asked questions |

## Support

- [Issues](https://github.com/veris/veris/issues) — Bug reports and feature requests
- [Discussions](https://github.com/veris/veris/discussions) — Questions and ideas
- [Security](SECURITY.md) — Vulnerability reporting
