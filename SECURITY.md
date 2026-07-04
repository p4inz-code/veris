# Security Policy

## Supported Versions

| Version | Supported                 |
| ------- | ------------------------- |
| 0.1.x   | :white_check_mark: (Beta) |
| < 0.1   | :x:                       |

## Reporting a Vulnerability

We take security vulnerabilities seriously. Please report them by emailing the maintainers directly at **veris-security@googlegroups.com**.

**Do not** open public GitHub issues for security vulnerabilities.

Please include:

- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Potential impact
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide a timeline for resolution.

## Security Principles

VERIS follows these security principles:

1. **Deterministic analysis** — All analysis is reproducible; no randomness affects results
2. **Safe extraction** — Extractors never execute extracted content (scripts, binaries, documents)
3. **Sandboxed evaluation** — Rule evaluation is isolated from the execution environment
4. **No network calls** — The analysis pipeline makes zero network requests
5. **Offline-first** — Everything works without network access; no telemetry by default
6. **Immutable outputs** — All analysis results are frozen; cannot be tampered with post-creation
7. **AI as consumer** — AI explanations are read-only; never affect analysis results

## Security Features

- **AI audit log**: Every AI explanation is logged with request metadata (deterministic request IDs, subject, provider, tokens, errors)
- **Output validation**: All AI outputs are validated for structure, citations, and evidence traceability
- **Cache integrity**: Cache entries are schema-versioned and validated before use
- **Atomic writes**: File exports use temp-then-rename to prevent partial writes
- **No dynamic code execution**: No `eval()`, `Function()`, or dynamic imports in the analysis pipeline
