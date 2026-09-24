# Security

## Supported versions

| Version | Supported     |
| ------- | ------------- |
| 1.1.x   | Yes (current) |
| 1.0.x   | Yes           |
| 0.1.x   | No            |
| < 0.1   | No            |

## Reporting a vulnerability

Report security vulnerabilities by email to **atharva.patil.cg@gmail.com**.

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

## Plugin Security Boundaries & Trust Model

VERIS plugins operate under an evidence-first, offline-first security model:

1. **Host Contract Gating**: Plugin capabilities (e.g., `target-read`, `core-types-read`) enforce host-level contract boundaries. For instance, artifact content buffers are strictly `null` unless `target-read` is declared. Capabilities represent host permissions and do not constitute OS-level process virtualization.
2. **Forbidden Capabilities**: Network access (`network`) and process spawning (`process-spawn`) are denied by default under VERIS's offline-first policy. Any plugin requesting dangerous capabilities is rejected during discovery.
3. **Path Traversal & Symlink Defense**: Plugin discovery strictly verifies canonical physical paths using `fs.realpathSync`, blocking lexical traversals (`..`), null-byte injections, absolute path escapes, and directory escapes via symlinks across Windows, macOS, and Linux.
4. **Declarative Rule Pack Purity**: Rule packs must consist purely of declarative ASTs with zero executable callbacks or functions. Rule packs are recursively audited against prototype pollution (`__proto__`, `constructor`, `prototype`), accessor properties (getters/setters), circular structures, and malicious or catastrophic regular expressions (max 1000 characters).
5. **Output Integrity & Memory Bounds**: Extractor plugins are strictly restricted to raw factual observations (`PluginRawFeature`). Attempts to emit findings, risk scores, or CVE IDs directly are rejected. Feature counts are bounded at 5,000 items per extraction, individual values are bounded at 1 MB, and output features are deterministically sorted.
6. **Error Containment & Auto-Quarantine**: Plugins execute with cooperative timeouts. If a plugin throws 3 consecutive errors during a scan session, it is automatically transitioned to `quarantined` state and disqualified from further execution.
