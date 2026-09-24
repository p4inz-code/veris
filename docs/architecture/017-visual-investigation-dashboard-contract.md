# VERIS Architecture Decision Record (ADR) 017: Visual Investigation Dashboard Contract

**Status:** Accepted / Foundational  
**Date:** 2026-09-24  
**Authors:** Autonomous Principal Engineer (Antigravity)  
**Applies to:** `@veris/cli`, `@veris/report`, `@veris/exporters`, `@veris/renderers`  
**Supercedes / Refines:** Extends ADR-010 and ADR-015  
**Target Milestone:** VERIS V2.0.0

---

## 1. Executive Summary & Purpose

Security analysts, forensics operators, and engineering leads frequently need to explore complex scan reports with dozens or hundreds of findings across large software artifacts. While the CLI (`veris scan`, `veris report`, `veris ci`) provides high-density terminal tables and machine-readable JSON/SARIF output, visual investigation of findings, evidence traces, risk dimensions, and affected files benefits from a structured, interactive visual dashboard.

However, web dashboards in the security industry commonly introduce significant vulnerabilities:

1. **Cloud dependency:** Many vendors upload scan reports or metadata to hosted SaaS dashboards.
2. **XSS & injection vulnerabilities:** Scanned artifacts and rule descriptions can contain malicious strings (e.g., `<script>`, `onerror=`, `javascript:`) that execute in the browser.
3. **Bloated frameworks & telemetry:** Bundling large front-end runtimes with tracking beacons or remote analytics violates privacy and offline-first mandates.
4. **Replacing the CLI:** Forcing users into browser-only workflows undermines automation and scripting.

This document establishes the **hard technical architecture, local-first model, zero-telemetry policy, security sanitization rules, standalone HTML generation contract, and loopback server specification** for the VERIS Visual Investigation Dashboard (`veris dashboard`).

---

## 2. Inviolable Architectural Principles

1. **The CLI Remains First-Class:**
   The dashboard is an OPTIONAL visualization layer. It NEVER replaces the CLI. Every capability in the dashboard derives exclusively from canonical report data.

2. **Strictly Offline-First & Zero Telemetry:**
   The dashboard operates completely offline. It contains ZERO tracking scripts, ZERO external CDN references, ZERO web fonts, and ZERO outbound network requests. All styles, icons (pure SVG), and scripts are embedded inline in a single self-contained HTML artifact.

3. **Untrusted Data Boundary & XSS Immunity:**
   Report contents (finding titles, paths, snippets, metadata, rule explanations) are treated as 100% UNTRUSTED data. All dynamic text is strictly escaped using entity encoding (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`). Dangerous URI schemes (`javascript:`, `data:`, `vbscript:`) are rejected.

4. **Hardened Content Security Policy (CSP):**
   When served locally or saved to disk, the dashboard enforces:
   `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none';`

5. **Loopback-Only Local Server:**
   When served via `veris dashboard`, the HTTP daemon binds strictly to `127.0.0.1` (never `0.0.0.0`), utilizes random high ports or specified ports, serves only the report in memory with security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`), and provides no file-system browsing APIs.

6. **Resource Bounds & Prototype Pollution Defense:**
   Reports are parsed using `safeJsonParse()` with a strict 50MB file size ceiling.

---

## 3. Dashboard Information Topology

The visual dashboard presents the canonical `CanonicalReport` in a high-density, professional interface:

```
┌────────────────────────────────────────────────────────────────────────┐
│ VERIS INVESTIGATION DASHBOARD                 [Session: ses_... ] [v1.2]│
├────────────────────────────────────────────────────────────────────────┤
│ [Target: /path/to/target]  [Duration: 2.4s]  [Status: COMPLETE]        │
├──────────────────┬──────────────────────┬──────────────────────────────┤
│ RISK SCORE       │ SEVERITY BREAKDOWN   │ SCAN METRICS                 │
│   7.8 / 10.0     │   Critical: 2        │   Files Scanned: 48          │
│   Level: HIGH    │   High:     5        │   Evidence Items: 112        │
│   Confidence: 92%│   Medium:   8        │   Plugins Active: 3          │
│   Trust: 42.0    │   Low/Info: 14       │   Gate Violations: 2         │
├──────────────────┴──────────────────────┴──────────────────────────────┤
│ FINDINGS EXPLORER                                                      │
│ [Search Title/Rule...] [Filter: Severity ▼] [Filter: Category ▼]       │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ 🔴 CRITICAL  RULE-WIN-INJECTION-001  Process Injection via VirtualAlloc│ │
│ │ Artifact: /src/loader.exe | Category: injection | Confidence: 95%   │ │
│ │ ├─ Rationale & Threat Scenario                                     │ │
│ │ ├─ Evidence Traces (Offset 0x4A20, Import VirtualAllocEx)          │ │
│ │ ├─ Remediation: Use memory-safe APIs, inspect parent process origin │ │
│ │ └─ Compliance: MITRE T1055, CWE-78                                 │ │
│ └────────────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────┤
│ AFFECTED ARTIFACTS INVENTORY                                           │
│ Path: /src/loader.exe | SHA256: e3b0c442... | Size: 142.4 KB          │
├────────────────────────────────────────────────────────────────────────┤
│ ACTIVE PLUGINS & DIAGNOSTICS                                           │
│ PE Extractor v1.0.0 (active) | Rules Engine v1.1.0 (active)            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. CLI Command Specification

```bash
# Generate standalone HTML dashboard artifact
veris dashboard ./report.json --output ./dashboard.html

# Serve local dashboard on loopback and open in browser
veris dashboard ./report.json --port 8080

# Serve headless on loopback without opening browser
veris dashboard ./report.json --port 8080 --no-open

# Integrate via veris report command
veris report ./report.json --format dashboard --output ./dashboard.html
```

Exit Codes:

- `0`: Success (dashboard generated or server terminated normally).
- `1`: Report not found, malformed, or exceeds 50MB ceiling.
- `2`: Usage error.
