# Security

## Supported versions

| Version | Supported         |
| ------- | ----------------- |
| 0.1.x   | Yes (active beta) |
| < 0.1   | No                |

## Reporting a vulnerability

Report security vulnerabilities by email to **veris-security@googlegroups.com**.

Do not open public GitHub issues for security vulnerabilities.

Include the following in your report:

- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Potential impact
- Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide a timeline for
resolution.

## Security principles

1. **Deterministic analysis** — All analysis is reproducible. No randomness
   affects results.
2. **Safe extraction** — Extractors never execute extracted content.
3. **Sandboxed evaluation** — Rule evaluation is isolated from the execution
   environment.
4. **No network calls** — The analysis pipeline makes zero network requests.
5. **Offline-first** — Everything works without network access. No telemetry by
   default.
6. **Immutable outputs** — All analysis results are frozen at construction.
7. **AI as consumer** — AI explanations are read-only and never affect analysis
   results.
