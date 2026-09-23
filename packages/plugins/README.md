# @veris/plugins

Internal Plugin Host, Discovery, Lifecycle Supervisor, and Extension Adapters for VERIS V2.

## Overview

`@veris/plugins` provides the internal runtime execution environment for third-party VERIS plugins authored with `@veris/plugin-sdk`. It coordinates local discovery, manifest validation, semver compatibility enforcement, isolated ESM dynamic loading, state transitions, fault containment (3-error auto-quarantine), and registry adaptation.

## Architectural Invariants (ADR-014)

1. **Zero-Dependency Core**: Plugins and the plugin host consume `@veris/core` types, but `@veris/core` has zero knowledge of plugins.
2. **Deterministic Execution**: Plugins are discovered, loaded, and executed in strictly deterministic lexicographical ID order.
3. **Offline-First / Zero-Telemetry**: Network access and child process spawning are denied by default. No remote downloads or telemetry beacons.
4. **Factual Raw Features Only**: Extractor plugins produce unnormalized, factual `PluginRawFeature[]` records only. Extractors NEVER produce findings, assign CVEs, or calculate risk scores.
5. **Declarative Rule Packs Only**: Rule plugins export declarative AST data representations. Imperative code execution or lambdas in rule packs are rejected during load.

## Components

- **`PluginHost`** — Central orchestrator managing discovery, loading, lifecycle, registration, and shutdown.
- **`discoverPlugins()`** — Discovers plugins from explicit `pluginsDir`, workspace `.veris/plugins`, or user home `~/.veris/plugins` with path traversal guards.
- **`validatePluginManifest()`** — Strict schema validation for `veris-plugin.json` and `package.json#veris`.
- **`loadPlugin()`** — Safe ESM loader utilizing `pathToFileURL` for cross-platform portability, catching syntax errors and validating export contracts.
- **`PluginStateTracker`** — Runtime lifecycle state machine (`discovered` -> `validated` -> `initialized` -> `active` -> `deactivated` | `failed` | `quarantined`). Quarantines plugins after 3 consecutive errors.
- **`PluginExtractorAdapter`** — Adapts `ExtractorPlugin` to the internal `Extractor` interface for `@veris/extractors`. Enforces capability gating (`target-read`) and strips unauthorized finding/risk payloads.
- **`PluginRuleAdapter`** — Adapts `RulePlugin` / `PluginRulePack` into canonical declarative `Rule` structures for `@veris/rules`.
- **`PluginDiagnosticsCollector`** — Collects structured diagnostic events (`info`, `warning`, `error`) across all phases.

## Usage Example

```typescript
import { PluginHost } from '@veris/plugins';
import { ExtractorRegistry } from '@veris/extractors';
import { RuleRegistry } from '@veris/rules';

const host = new PluginHost({
  workspaceDir: process.cwd(),
  hostVersion: '1.0.0',
});

// 1. Discover local plugins
await host.discover();

// 2. Load and initialize in deterministic order
await host.loadAll();

// 3. Register into engine registries
const extractorRegistry = new ExtractorRegistry();
host.registerExtractors(extractorRegistry);

const ruleRegistry = new RuleRegistry();
host.registerRulePacks(ruleRegistry);

// 4. Graceful shutdown
await host.dispose();
```
