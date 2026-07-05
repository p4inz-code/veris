# FAQ

## General

### What is VERIS?

VERIS is a security analysis tool that scans files and directories for security
risks. It produces deterministic reports — the same input always produces the
same output. It runs entirely offline with no cloud dependency.

### Is VERIS an antivirus or EDR?

No. VERIS is an investigation platform. It analyzes software artifacts, produces
evidence, and assigns risk scores. It does not detect malware in real time or
replace antivirus software.

### Does VERIS require internet access?

No. The analysis pipeline makes zero network calls. Everything runs locally.
AI explanations can use Ollama for a fully offline experience.

### Does VERIS use AI for analysis?

No. AI is strictly a consumer of analysis results. It explains findings and
summarizes reports — it never participates in detection or scoring.

### Is VERIS free?

Yes. VERIS is open source under the MIT license.

## Installation

### How do I install VERIS?

Run `npx veris` to use it immediately, or install globally with
`npm install -g veris`. See [INSTALL](INSTALL.md) for details.

### What are the requirements?

Node.js 18 or later. VERIS works on Windows, macOS, and Linux.

### veris: command not found

Your npm global bin directory may not be in your PATH. Try `npx veris` instead,
which requires no installation.

## Usage

### How do I scan a directory?

```
veris scan
```

or

```
veris scan ./path/to/target
```

### What file types are supported?

VERIS analyzes executables (PE, ELF, Mach-O), Office documents (DOCX, XLSX,
PPTX), archives (ZIP, TAR, GZ), scripts (Python, JavaScript, Shell, PowerShell),
configuration files (JSON, YAML, TOML, INI), and more.

### What output formats are available?

JSON, Markdown, HTML, SARIF 2.1.0, CSV, and JUnit XML.

### How do I get AI explanations?

Run `veris explain <finding-id>` after a scan. You need an AI provider
configured (OpenAI, Anthropic, or Ollama).

## Troubleshooting

### Scan is slow

Large directories take longer to scan. Use `veris scan --silent` to suppress
progress output, or target a specific subdirectory.

### Results differ between runs

If you get different results, check that your files haven't changed between
runs. VERIS is deterministic — the same input always produces the same output.

### How do I report a bug?

Open a [GitHub Issue](https://github.com/veris/veris/issues). Include your
VERIS version (`veris --version`), operating system, Node.js version, and
steps to reproduce.
