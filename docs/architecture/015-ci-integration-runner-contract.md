# VERIS Architecture Decision Record (ADR) 015: CI Integration Runner & Security Gates Contract

**Status:** Accepted / Foundational  
**Date:** 2026-09-23  
**Authors:** Autonomous Principal Engineer (Antigravity)  
**Applies to:** `@veris/cli`, `@veris/config`, `@veris/exporters`, `@veris/report`  
**Supercedes / Refines:** Extends ADR-010 constitution with deterministic CI runner and policy gating contracts  
**Target Milestone:** VERIS V1.2.0

---

## 1. Executive Summary & Purpose

VERIS was released at `v1.0.0` as an offline-first, deterministic, evidence-based security investigation and malware analysis platform, and hardened at `v1.1.0` with the plugin foundation. Both releases are permanently immutable.

Modern DevSecOps workflows require security scanners to execute inside continuous integration (CI) pipelines (GitHub Actions, GitLab CI, Jenkins, Azure Pipelines, Tekton, Woodpecker, and local pre-commit hooks). However, naive scanner integration in CI typically introduces several critical failure modes:

1. **Flaky builds caused by volatile IDs:** Finding identifiers generated with random seeds or timestamps break run-to-run comparisons.
2. **All-or-nothing failures:** Scanners fail builds on any finding, preventing gradual adoption in legacy codebases.
3. **Silent security regressions:** Existing codebases cannot prevent _new_ vulnerabilities from landing while existing technical debt is tracked.
4. **Cloud-dependent gatekeepers:** Many CI runners send telemetry, metadata, or source code to third-party SaaS backends.
5. **Ambiguous exit codes:** Shell scripts and pipeline orchestrators cannot distinguish between scan errors, gate violations, and invalid baseline files.

This document establishes the **hard technical architecture, baseline model, finding fingerprinting specification, security policy gating rules, deterministic exit code contract, and adversarial defenses** for the VERIS CI runner (`veris ci`).

---

## 2. Inviolable Core Invariants

All CI runner implementations MUST strictly adhere to the following invariants:

1. **Zero-Dependency Core (`@veris/core`):**  
   The foundational type system of VERIS remains untouched and has zero runtime dependencies. The CI runner consumes existing core types without altering them.

2. **Immutable `v1.0.0` and `v1.1.0` Baselines:**  
   Past releases and tags remain permanently immutable. No existing scanning or rule evaluation logic is modified.

3. **Strictly Offline-First & Zero-Telemetry:**  
   `veris ci` operates completely offline. No network requests, telemetry beacons, cloud verifications, or phone-home calls are permitted under any condition.

4. **100% Deterministic Execution:**  
   Given the same target and baseline, `veris ci` MUST produce bit-for-bit identical exit codes, gate evaluations, finding diffs, and `ci-summary.json` output regardless of execution environment, operating system, or invocation count.

5. **Downstream Automation Layer:**  
   The CI runner is an automation and policy layer wrapped around the deterministic pipeline. It does NOT invent a second rule engine or replace the risk engine; it evaluates structured policies against canonical reports.

---

## 3. Architecture & Module Topology

The CI integration runner resides within `@veris/cli/src/ci/` to leverage existing CLI composition and packaging, keeping runtime dependencies zero for core packages:

```
┌────────────────────────────────────────────────────────┐
│                   veris ci [options]                   │
│          (packages/cli/src/commands/ci.ts)             │
└───────────────────────────┬────────────────────────────┘
                            │ delegates to
┌───────────────────────────▼────────────────────────────┐
│                    @veris/cli/ci/                      │
├────────────────────────────────────────────────────────┤
│  • types.ts         — Policy, diff, summary contracts  │
│  • fingerprint.ts   — Stable cross-run fingerprinting  │
│  • baseline.ts      — Hardened baseline parser/loader  │
│  • comparator.ts    — Deterministic finding diff engine │
│  • policy.ts        — Security gate evaluator          │
│  • summary.ts       — ci-summary.json & GitHub summary │
└───────────────────────────┬────────────────────────────┘
                            │ drives
┌───────────────────────────▼────────────────────────────┐
│       Existing Scan Pipeline (packages/cli/scan/)      │
│  Discovery → Extract → Knowledge → Rules → Risk → Report│
└────────────────────────────────────────────────────────┘
```

### Module Responsibilities

- **`types.ts`:** Strongly typed interfaces for `CiPolicy`, `FindingDiffEntry`, `GateEvaluation`, `CiGateResult`, and `CiSummary`.
- **`fingerprint.ts`:** Produces canonical, location-aware, stable finding fingerprints that persist across scan sessions.
- **`baseline.ts`:** Securely ingests previous scan reports (`report.json` or `ci-summary.json`), validating against prototype pollution, oversized files, and schema corruptions.
- **`comparator.ts`:** Diffs current scan findings against baseline findings, categorizing each into `unchanged`, `new`, `regressed`, `evidence_changed`, or `resolved`.
- **`policy.ts`:** Evaluates configurable security gates against the scan report and finding diffs, producing deterministic pass/fail results.
- **`summary.ts`:** Generates machine-readable `ci-summary.json` and Markdown tables for `$GITHUB_STEP_SUMMARY`.

---

## 4. Stable Finding Fingerprinting Contract

### The Volatility Problem

In standard VERIS reports, finding IDs are generated as:
$$\text{id} = \text{deterministicId}('fin', \text{ruleId}, \text{sessionId})$$
Because `sessionId` includes the run timestamp, finding IDs vary between separate runs. Comparing reports by `finding.id` is invalid.

### Canonical Fingerprint Algorithm

To achieve deterministic comparison across runs, branches, and machines, each finding is assigned a **Stable Finding Fingerprint**:

$$\text{Fingerprint} = \text{deterministicId}('fp', \text{ruleId}, \text{normalizedArtifactPath}, \text{title})$$

Where:

- **`ruleId`:** The unique identifier of the rule that produced the finding (e.g. `RULE_SUSPICIOUS_PE_SECTION`).
- **`normalizedArtifactPath`:** Cross-platform relative path to the affected artifact:
  - Windows backslashes (`\`) converted to forward slashes (`/`).
  - Leading `./` stripped.
  - Case-normalized for file systems.
  - If multiple artifacts exist, paths are sorted deterministically and joined with a null separator `\0`.
  - If no artifact path is associated, defaults to `""`.
- **`title`:** Canonical finding title.

This guarantees:

1. Two scans of identical code on different days produce identical fingerprints.
2. Cross-platform scans (Linux vs. Windows) yield identical fingerprints.
3. Multiple findings of the same rule on different files remain uniquely separated.

---

## 5. Baseline Model & Comparison Engine Contract

A baseline represents an approved prior security state (typically the latest commit on `main` or the previous release).

### Finding Diff Taxonomy

Given a current finding set $C$ and baseline finding set $B$, findings are categorized by fingerprint:

| Status                 | Definition                                                                           | Criteria                                                                                                              |
| :--------------------- | :----------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------- |
| **`unchanged`**        | Finding existed in baseline and current state with identical severity.               | $f \in C \land f \in B \land \text{sev}(f_C) == \text{sev}(f_B)$                                                      |
| **`new`**              | Finding exists in current scan but was NOT present in baseline.                      | $f \in C \land f \notin B$                                                                                            |
| **`regressed`**        | Finding existed in baseline, but severity score or level has worsened.               | $f \in C \land f \in B \land (\text{sev}(f_C) > \text{sev}(f_B) \lor \text{score}(f_C) > \text{score}(f_B))$          |
| **`evidence_changed`** | Finding existed with same severity, but underlying evidence count or detail changed. | $f \in C \land f \in B \land \text{sev}(f_C) == \text{sev}(f_B) \land \text{evidence}(f_C) \neq \text{evidence}(f_B)$ |
| **`resolved`**         | Finding existed in baseline but is NO LONGER detected.                               | $f \notin C \land f \in B$                                                                                            |

### Delta Metrics

The comparator computes:

- $\Delta \text{Risk} = \text{RiskScore}_{\text{current}} - \text{RiskScore}_{\text{baseline}}$
- $\Delta \text{Findings} = |C| - |B|$
- Count of `new`, `regressed`, `evidence_changed`, `unchanged`, and `resolved` findings.

---

## 6. Security Policy Gating Engine Contract

Security policies define the acceptance criteria for a build. If any enabled gate fails, `veris ci` terminates with `GATE_VIOLATION` (exit code `10`).

### Policy Configuration Schema

```typescript
export interface CiPolicy {
  /**
   * Minimum finding severity that causes gate failure.
   * If any finding meets or exceeds this severity, gate fails.
   * Values: 'critical' | 'high' | 'medium' | 'low' | 'info'
   */
  readonly failOn?: 'critical' | 'high' | 'medium' | 'low' | 'info';

  /**
   * Fail if ANY new findings are introduced compared to baseline.
   */
  readonly failOnNew?: boolean;

  /**
   * Fail if any existing findings regress in severity or if overall risk score increases.
   */
  readonly failOnRegressions?: boolean;

  /**
   * Maximum acceptable overall risk score [0.0 - 10.0].
   */
  readonly maxRisk?: number;

  /**
   * Maximum number of newly introduced findings allowed (default: 0 if failOnNew is true).
   */
  readonly maxNew?: number;

  /**
   * Fail if any loaded plugin failed or was quarantined during scan.
   */
  readonly failOnPluginQuarantine?: boolean;
}
```

### Gate Evaluation Rules

1. **Severity Threshold Gate (`failOn`):**
   - Evaluated against all findings in the current report.
   - Severity rank: $\text{info (0)} < \text{low (1)} < \text{medium (2)} < \text{high (3)} < \text{critical (4)}$.
   - Fails if $\exists f \in C : \text{rank}(f.\text{severity}) \ge \text{rank}(\text{policy.failOn})$.
2. **New Findings Gate (`failOnNew` / `maxNew`):**
   - If `failOnNew` is true, fails if $|New| > 0$.
   - If `maxNew` is set to $N$, fails if $|New| > N$.
3. **Regression Gate (`failOnRegressions`):**
   - Fails if $|Regressed| > 0$.
   - Fails if $\text{RiskScore}_{\text{current}} > \text{RiskScore}_{\text{baseline}} + 0.001$.
4. **Risk Ceiling Gate (`maxRisk`):**
   - Fails if $\text{RiskScore}_{\text{current}} > \text{policy.maxRisk}$.
5. **Plugin Health Gate (`failOnPluginQuarantine`):**
   - Fails if any plugin was quarantined or threw uncaught exceptions. Exit code `13` (`PLUGIN_ERROR`).

---

## 7. Deterministic Exit Codes Contract

Process exit codes in CI must be unambiguous to allow orchestration scripts to make precise downstream decisions:

| Exit Code | Name               | Meaning                                                                                   |
| :-------: | :----------------- | :---------------------------------------------------------------------------------------- |
|  **`0`**  | `SUCCESS`          | Scan completed successfully and all configured security gates passed.                     |
|  **`1`**  | `ERROR`            | Uncaught fatal runtime error during scan execution.                                       |
|  **`2`**  | `USAGE_ERROR`      | Invalid command line arguments, flags, or combinations.                                   |
| **`10`**  | `GATE_VIOLATION`   | One or more security policy gates failed (e.g. threshold exceeded, new finding detected). |
| **`11`**  | `INVALID_BASELINE` | Baseline file is missing, unreadable, corrupt, oversized, or fails schema validation.     |
| **`12`**  | `INVALID_CONFIG`   | CI policy configuration file is malformed or contains invalid values.                     |
| **`13`**  | `PLUGIN_ERROR`     | A plugin failed, crashed, or was quarantined and policy forbids plugin failure.           |
| **`130`** | `CANCELLED`        | Execution interrupted via `SIGINT` (Ctrl+C) or `SIGTERM`.                                 |

---

## 8. Machine-Readable Schema & Artifact Specifications

### `ci-summary.json`

Every `veris ci` execution writes a canonical machine-readable JSON artifact to `<output-dir>/ci-summary.json`:

```json
{
  "schemaVersion": "1.0.0",
  "status": "passed" | "failed",
  "exitCode": 0,
  "timestamp": "2026-09-23T12:00:00.000Z",
  "target": "/path/to/target",
  "baselinePath": "/path/to/baseline.json",
  "policy": {
    "failOn": "high",
    "failOnNew": true,
    "failOnRegressions": true,
    "maxRisk": 7.5,
    "maxNew": 0
  },
  "gateResult": {
    "passed": true,
    "evaluations": [
      {
        "gate": "severity_threshold",
        "passed": true,
        "threshold": "high",
        "actual": "medium",
        "details": "No findings met or exceeded 'high' severity."
      }
    ],
    "violations": []
  },
  "metrics": {
    "currentRiskScore": 3.4,
    "baselineRiskScore": 4.1,
    "riskScoreDelta": -0.7,
    "currentFindingCount": 5,
    "baselineFindingCount": 6,
    "newFindingCount": 0,
    "regressedFindingCount": 0,
    "evidenceChangedFindingCount": 0,
    "unchangedFindingCount": 5,
    "resolvedFindingCount": 1,
    "findingsBySeverity": {
      "critical": 0,
      "high": 0,
      "medium": 2,
      "low": 3,
      "info": 0
    }
  },
  "diffs": [],
  "outputFiles": [
    "/path/to/veris-output/report.json",
    "/path/to/veris-output/ci-summary.json"
  ]
}
```

### GitHub Step Summary (`$GITHUB_STEP_SUMMARY`)

When running within GitHub Actions, `veris ci` detects the `GITHUB_STEP_SUMMARY` environment variable or accepts `--github-step-summary`. It formats and appends an accessible Markdown summary including:

1. Status Banner: Passed (`:white_check_mark:`) or Failed (`:x:`).
2. Key Metrics Table: Risk Score ($\Delta$), Total Findings, New, Regressed, Resolved.
3. Security Gate Checklist: Each configured gate with target vs. actual status.
4. Actionable Findings Table: Explicit list of new or violating findings with links to files.

---

## 9. Adversarial Security Hardening

Because baseline files and configuration in CI environments may originate from pull requests, untrusted branches, or third-party forks, `veris ci` implements defense-in-depth:

1. **Prototype Pollution Protection:**  
   The baseline parser strips or rejects forbidden keys (`__proto__`, `constructor`, `prototype`) during deserialization using a secure recursive sanitizer.
2. **File Size Limit (DoS Prevention):**  
   Baselines exceeding 50 MB are rejected immediately before reading into memory to prevent heap exhaustion.
3. **Path Traversal Defense:**  
   Baseline paths are resolved with strictly validated boundaries. Escaping parent directory traversals (`../../../../etc/passwd`) are detected and rejected.
4. **Schema Integrity Verification:**  
   Before comparison, the baseline payload structure is rigorously type-validated. Missing required arrays or malformed severity objects trigger `ExitCode.INVALID_BASELINE` (`11`) without throwing uncaught exceptions.
5. **ReDoS Immunity:**  
   Path normalization and string hashing utilize linear-time standard library routines (`node:crypto` and `node:path`) with zero backtracking regular expressions.

---

## 10. CLI UX & Command Specifications

`veris ci` provides a focused, high-signal terminal interface adhering to the VERIS design system:

```
USAGE
  veris ci [target] [options]

OPTIONS
  --baseline <path>         Path to baseline report or ci-summary.json
  --fail-on <severity>      Fail if any finding >= severity (critical, high, medium, low, info)
  --fail-on-new             Fail if any new findings are introduced
  --fail-on-regressions     Fail on severity regressions or risk score increase
  --max-risk <score>        Fail if overall risk score exceeds threshold [0.0 - 10.0]
  --max-new <count>         Maximum allowed new findings (default: 0)
  --output, -o <dir>        Output directory for artifacts (default: ./veris-output)
  --format, -f <formats>    Output format(s): json, markdown, sarif, junit
  --summary-file <path>     Path for ci-summary.json
  --github-step-summary     Force writing GitHub Actions step summary
  --silent                  Suppress all console output except final status
  --verbose                 Verbose diagnostic output
  --no-color                Disable ANSI color styling
  --no-unicode              ASCII-only symbol fallback
  --help                    Show help message
```

---

## 11. Conclusion & Next Steps

ADR-015 formalizes the deterministic CI integration runner for VERIS. It unifies scanning, differential analysis, and security gating into a single, offline-first command with exact exit code semantics and zero telemetry.
