# VERIS Architecture Decision Record (ADR) 014: V2 Plugin Architecture Contract

**Status:** Accepted / Foundational  
**Date:** 2026-09-23  
**Authors:** Autonomous Principal Engineer (Antigravity)  
**Applies to:** `@veris/plugins`, `@veris/plugin-sdk`, `@veris/extractors`, `@veris/rules-engine`, `@veris/pipeline`  
**Supercedes / Refines:** SPEC-007 (refines from conceptual V1–V4 scope down to concrete V2 execution boundaries)  
**Target Milestone:** VERIS V2.0.0

---

## 1. Executive Summary & Purpose

VERIS was released at `v1.0.0` as an offline-first, deterministic, evidence-based security investigation and malware analysis platform. `v1.0.0` is permanently immutable.

As VERIS transitions toward its V2 evolution, extensible detection capabilities are required to support user-authored extractors (e.g., custom file formats, specialized metadata parsing) and user-authored rule packs (e.g., organization-specific detection signatures and compliance rules).

However, unconstrained plugin architectures are the single largest source of determinism breakdown, performance degradation, and supply-chain vulnerabilities in CLI security tools.

This document establishes the **hard technical extension contract, package boundaries, security guardrails, and determinism invariants** for all V2 plugins.

---

## 2. Inviolable Core Invariants

All plugin interfaces and runtime hosts MUST strictly obey four non-negotiable architectural invariants:

1. **Zero-Dependency Core (`@veris/core`):**  
   `@veris/core` is the foundational type system and canonical data model of VERIS. It has zero runtime dependencies and zero peer dependencies. Plugins and plugin hosts may consume `@veris/core` types, but `@veris/core` NEVER imports, references, or has knowledge of plugins.

2. **Immutable `v1.0.0` Baseline:**  
   The frozen `v1.0.0` release tag and release contracts must never be moved, rewritten, retagged, or compromised. Existing built-in extractors (`pe`, `macho`, `elf`, `scripts`, `archive`, `office`, `pdf`, etc.) and built-in rules remain internal first-class citizens.

3. **Deterministic Scanning Engine:**  
   VERIS is deterministic: identical inputs MUST yield identical feature extractions, identical rule evaluations, identical risk scores, and identical report outputs across runs, operating systems, and time. Plugins must NEVER inject non-determinism (random IDs, wall-clock timestamps in feature hashes, variable-order iterations, un-isolated global state).

4. **Strictly Offline-First & Zero-Telemetry:**  
   VERIS performs 100% offline analysis. Plugins are prohibited from initiating network connections, telemetry beacons, or external update checks. Any requested capability outside pure compute and scoped target inspection is denied by default.

---

## 3. Plugin Package Topology

To prevent circular dependencies and decouple internal runtime mechanics from third-party authoring tools, the plugin architecture is split into two distinct packages:

```
┌────────────────────────────────────────────────────────┐
│                   @veris/plugin-sdk                    │
│      (Published External Authoring Kit for npm)         │
│  • Public type definitions & interfaces                 │
│  • Helper builder utilities (defineExtractor, etc.)     │
│  • Zero runtime dependencies (dev-only typings)         │
└───────────────────────────▲────────────────────────────┘
                            │ imports contracts
┌───────────────────────────┴────────────────────────────┐
│                    @veris/plugins                      │
│             (Internal Host Runtime Package)            │
│  • PluginManifest parser & schema validator            │
│  • Lifecycle state machine & quarantine tracker        │
│  • Capability & permission boundary enforcer           │
│  • Adapters to ExtractorRegistry & RuleRegistry        │
└─────────────┬───────────────────────────┬──────────────┘
              │ adapts to                 │ adapts to
┌─────────────▼──────────┐  ┌─────────────▼──────────────┐
│   @veris/extractors    │  │    @veris/rules-engine     │
│   (ExtractorRegistry)  │  │      (RuleRegistry)        │
└────────────────────────┘  └────────────────────────────┘
```

### 3.1 `@veris/plugin-sdk` (External Developer Kit)

- **Role:** Distributed to third-party plugin authors via npm.
- **Dependencies:** Strictly zero runtime dependencies. Re-exports compile-time types from `@veris/core`.
- **Purpose:** Exposes helper functions (`definePluginManifest`, `defineExtractorPlugin`, `defineRulePackPlugin`) and interface contracts. Contains no runtime loader or CLI code.

### 3.2 `@veris/plugins` (Internal Runtime Host)

- **Role:** Internal engine package consumed by `@veris/cli` and `@veris/pipeline`.
- **Dependencies:** `@veris/core`, `@veris/shared`, `@veris/logger`, `@veris/config`.
- **Purpose:** Validates manifests, manages lifecycle transitions, tracks consecutive failures, enforces capability barriers, sorts plugins deterministically, and adapts external plugins into internal registries.

---

## 4. Approved V2 Extension Points

Extension points in V2 are intentionally constrained to two operational domains:

```
Approved in V2:
├── Extractor Plugins (Custom file parsers producing RawFeature[])
└── Rule Pack Plugins (Declarative detection rules matching RawFeature)

Explicitly Deferred (Post-V2):
├── Exporter Plugins (Custom report output formats)
├── Renderer Plugins (Custom terminal / TUI views)
├── AI Consumer Plugins (Custom LLM / explanation integrations)
└── Pipeline Middleware (Modifying stage order or scheduling)
```

### 4.1 Extractor Plugins

- **Purpose:** Allows extending VERIS to parse proprietary, domain-specific, or legacy file formats without modifying core extractor packages.
- **Contract Interface:**
  ```typescript
  export interface ExtractorPlugin {
    readonly id: string;
    readonly name: string;
    readonly version: string;
    readonly targetFileTypes: readonly string[];
    extract(context: PluginExtractionContext): Promise<readonly PluginRawFeature[]>;
  }
  ```
- **Inputs & Guarantees:**
  - `context.targetPath`: Absolute path to target file (read-only access).
  - `context.fileBuffer`: Read-only snapshot of target content (or scoped file descriptor).
  - `context.fileSize`: File size in bytes.
  - `context.fileType`: Detected MIME or canonical file category.
- **Outputs:**
  - Produces an array of `PluginRawFeature` records: `{ id, extractor, category, type, value, confidence, metadata }`.
  - **Inviolable Rule:** Extractors NEVER generate findings, assign CVEs, or calculate risk scores. They only extract factual observable features from binary or textual targets.
- **Failure Semantics:**
  - Execution is wrapped in a strict timeout (`PluginExtractionContext.timeoutMs`, default 5,000ms).
  - Exceptions are trapped by the host runtime, logged to diagnostic traces, and count toward the plugin's error counter.
  - Host scan pipeline continues uninterrupted.

### 4.2 Rule Pack Plugins

- **Purpose:** Allows teams and security analysts to deploy organization-specific detection signatures, compliance requirements, or threat hunting patterns.
- **Contract Interface:**
  - Strictly **declarative**. Rule plugins export JSON/YAML manifests or typed structured objects matching the `RulePack` schema.
  - Rule packs do NOT execute arbitrary imperative code during rule evaluation.
  - Each rule specifies: `id`, `name`, `severity`, `confidence`, `mitreAttack`, `condition` (boolean logic AST operating on `RawFeature` properties), and `explanationTemplate`.
- **Execution Boundary:**
  - Rule evaluation is fully handled by `@veris/rules-engine`.
  - Plugins supply data, not evaluation logic. This guarantees deterministic AST evaluation and immunity from plugin-introduced infinite loops or side effects.

### 4.3 Technical Rationale for Deferring Other Extensions

| Extension Candidate       | Status in V2 | Technical Rationale for Deferral                                                                                                                                                                           |
| :------------------------ | :----------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Exporter Plugins**      | Deferred     | Export schemas (JSON, SARIF, Markdown) are part of compliance and CI integrations. Allowing arbitrary export formatters introduces output fragmentation before canonical reporting stabilizes.             |
| **Renderer Plugins**      | Deferred     | The terminal UI uses optimized `@veris/renderers` with strict terminal width, Unicode, and ANSI escape handling. External renderers create UX inconsistencies and rendering bugs.                          |
| **AI Consumers**          | Deferred     | AI explanation (`@veris/ai`, `@veris/explain`) is downstream of deterministic security analysis. Exposing AI plugins risks contaminating offline deterministic findings with non-deterministic cloud APIs. |
| **Pipeline Interceptors** | Deferred     | The order of analysis (`discovery -> classification -> extraction -> rules -> correlation -> risk -> report`) is an inviolable architectural invariant. Plugins must never reorder or skip stages.         |

---

## 5. Plugin Manifest Specification

Every plugin MUST include a root `manifest.json` (or inline manifest object) conforming to `PluginManifest`:

```typescript
export interface PluginManifest {
  readonly id: string; // Format: ^[a-z0-9][a-z0-9-_]{2,63}$
  readonly name: string; // Human-readable display name (1..100 chars)
  readonly version: string; // Strict Semantic Version (e.g., 1.2.0)
  readonly description: string; // Summary of capabilities (1..500 chars)
  readonly author: string; // Author / Organization identifier
  readonly verisVersion: string; // Compatible VERIS semver range (e.g., ">=1.0.0 <3.0.0")
  readonly type: 'extractor' | 'rule-pack';
  readonly entryPoint: string; // Relative path to bundle entry
  readonly capabilities: readonly PluginCapability[];
}
```

### 5.1 Permitted Capabilities in V2

```typescript
export type PluginCapability =
  | 'target-read' // Read-only access to the file under scan
  | 'core-types-read' // Access to @veris/core schema types
  | 'custom-feature' // Ability to register custom raw feature identifiers
  | 'metadata-extract'; // Ability to attach structured metadata to features
```

Explicitly forbidden capabilities: `network-access`, `shell-exec`, `filesystem-write`, `environment-read`, `arbitrary-eval`.

---

## 6. Plugin Lifecycle & State Machine

Plugins operate under an explicit, deterministic state machine managed by `@veris/plugins`:

```
               ┌───────────────┐
               │   UNLOADED    │
               └───────┬───────┘
                       │ load()
                       ▼
               ┌───────────────┐
         ┌────►│    LOADING    ├─────┐
         │     └───────┬───────┘     │
         │             │ manifest ok │ manifest invalid / syntax error
         │             ▼             │
         │     ┌───────────────┐     │
         │     │    LOADED     │     │
         │     └───────┬───────┘     │
disable()│             │ activate()  │
         │             ▼             │
         │     ┌───────────────┐     │
         ├─────┤    ACTIVE     │     │
         │     └───────┬───────┘     │
         │             │ runtime err │
         │             ▼             │
         │     ┌───────────────┐     │
         └─────┤     ERROR     │◄────┘
               └───────┬───────┘
                       │ 3 consecutive errors
                       ▼
               ┌───────────────┐
               │  QUARANTINED  │
               └───────────────┘
```

### 6.1 State Transitions

1. **UNLOADED:** Plugin identified on disk or registered in configuration.
2. **LOADING:** Manifest parsing, semver compatibility check, capability verification.
3. **LOADED:** Manifest validated; plugin registered in host inventory.
4. **ACTIVE:** Plugin bound to corresponding registry (`ExtractorRegistry` or `RuleRegistry`).
5. **DISABLED:** Administratively deactivated via user scan profile or `--disable-plugin`.
6. **ERROR:** Trapped execution error during extraction or rule registration. Error counter incremented.
7. **QUARANTINED:** Error count reaches threshold (`MAX_CONSECUTIVE_ERRORS = 3`). Plugin is permanently deactivated for the remainder of the scan session to protect engine stability.

---

## 7. Determinism & Sorting Contract

To preserve absolute reproducibility:

1. **Deterministic Execution Ordering:**  
   When multiple extractor plugins target the same file type, or multiple rule packs evaluate features, they are sorted **lexicographically by plugin `id`**, followed by extractor/rule `id`:
   ```typescript
   export function sortPluginsDeterministically<T extends { id: string }>(
     plugins: readonly T[],
   ): T[] {
     return [...plugins].sort((a, b) => a.id.localeCompare(b.id));
   }
   ```
2. **Stateless Extractor Invariant:**  
   Extractors must be referentially transparent with respect to their input buffer. Extractors MUST NOT store mutable internal state between `extract()` invocations.
3. **No Dynamic Time or Randomness:**  
   Extractors must not inject `Date.now()`, `Math.random()`, or non-deterministic hash seeds into `PluginRawFeature.value` or metadata.

---

## 8. Security & Sandboxing Architecture

### 8.1 The Node.js Sandbox Reality

Node.js core modules such as `node:vm` do **not** provide a secure security boundary against hostile code execution. Claiming that `node:vm` isolates untrusted code is false security theater.

### 8.2 VERIS V2 Trust Model

1. **Local Operator Trust:** Plugins in V2 run with the local user's OS privileges. VERIS is a local investigation CLI, not a multi-tenant cloud service.
2. **Zero-Network Invariant:** The host runtime enforces an offline-first execution environment. In CI and secure analysis setups, VERIS runs with egress network disabled at the container/process level.
3. **Safe Memory Exposure:** Extractors receive immutable/read-only buffers or scoped file handles. Target files are opened `O_RDONLY`.
4. **Failure Containment:** Any uncaught rejection or synchronous exception in plugin code is trapped by the host's lifecycle supervisor, preventing pipeline crashes and isolating bad plugins via automated quarantine.

---

## 9. Backward Compatibility & Versioning Contract

1. **SemVer Invariant:**  
   Host and SDK obey Semantic Versioning (SemVer 2.0.0).
2. **Engine Compatibility Range:**  
   Every plugin manifest specifies `verisVersion` (e.g., `>=1.0.0 <3.0.0`). The host tests this constraint before loading. If incompatible, the plugin transitions immediately to `ERROR` with a diagnostic code `PLUGIN_INCOMPATIBLE_VERIS_VERSION`.
3. **Zero Impact on `v1.0.0`:**  
   The introduction of the V2 plugin system does NOT alter the core API or the CLI contracts of `v1.0.0`. If no plugins are configured, VERIS executes purely native extractors and rules with zero overhead.

---

## 10. Test & Proof Plan

The plugin contract is verified by automated architecture tests and unit contracts:

1. **Architecture Guardrails (`packages/plugins/__tests__/architecture-guardrails.test.ts`):**
   - Asserts `@veris/core` package.json has 0 dependencies.
   - Asserts default capabilities forbid network, filesystem-write, and shell execution.
   - Asserts plugin state machine reaches `quarantined` on consecutive failures.
2. **Unit Contract Tests (`packages/plugins/__tests__/contracts.test.ts`):**
   - Asserts manifest validation enforces id regex, required author, valid semver, and approved capabilities.
   - Asserts semver range matching handles `>=1.0.0 <3.0.0`, exact matches, and rejection of out-of-range versions.
   - Asserts deterministic sorting produces consistent arrays regardless of input shuffle.
   - Asserts `PluginStateTracker` transitions from `unloaded` through `quarantined` on 3 errors.

---

## 11. Conclusion & Next Steps

This document freezes the V2 extension boundaries. Subsequent phases may implement the concrete `@veris/plugin-sdk` authoring utilities and CLI discovery loader in full alignment with this specification. No dynamic runtime loading or unverified extension types are permitted until those phases are formally executed.
