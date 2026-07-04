# VERIS Plugin SDK, Configuration System & Extension Architecture — SPEC-007

**Status:** Frozen  
**Version:** 1.0  
**Applies to:** Plugin SDK, plugin lifecycle, configuration system, scan profiles, policy engine, permission model, sandboxing.  
**Scope:** V1 through V4 without architectural redesign.

---

## Table of Contents

1. [Core Principles](#1-core-principles)
2. [Plugin Architecture Overview](#2-plugin-architecture-overview)
3. [Plugin Lifecycle](#3-plugin-lifecycle)
4. [Plugin Types & Extension Contracts](#4-plugin-types--extension-contracts)
5. [Plugin SDK Design](#5-plugin-sdk-design)
6. [Manifest Specification](#6-manifest-specification)
7. [Configuration System](#7-configuration-system)
8. [Scan Profiles](#8-scan-profiles)
9. [Policy Engine](#9-policy-engine)
10. [Permission Model](#10-permission-model)
11. [Sandboxing Strategy](#11-sandboxing-strategy)
12. [Plugin Packaging & Distribution](#12-plugin-packaging--distribution)
13. [Plugin Diagnostics](#13-plugin-diagnostics)
14. [Security Considerations](#14-security-considerations)
15. [Performance Considerations](#15-performance-considerations)
16. [Future Compatibility](#16-future-compatibility)
17. [Engineering Tradeoffs](#17-engineering-tradeoffs)
18. [Common Mistakes to Avoid](#18-common-mistakes-to-avoid)
19. [Final Recommendations](#19-final-recommendations)

---

## 1. Core Principles

### 1.1 The Core is Inviolable

The core engine is frozen and must never be modified by plugins. The core owns:

| Core Ownership                    | Plugin Cannot                              |
| --------------------------------- | ------------------------------------------ |
| Analysis pipeline order           | Reorder, skip, or insert stages            |
| Canonical data model              | Modify types, add fields, or remove fields |
| Rule execution                    | Interfere with rule scheduling or matching |
| Risk/Trust/Confidence calculation | Modify formulas or override scores         |
| Report generation                 | Modify the CanonicalReport structure       |

### 1.2 Plugins are Extensions, Not Modifications

A plugin adds functionality through approved extension points. It never modifies existing behavior. If a plugin is removed, the system behaves exactly as before the plugin was installed.

### 1.3 Determinism Must Be Preserved

Plugins must not introduce non-determinism. A plugin that produces different output for the same input is a bug, not a feature. The host validates determinism by running plugin operations twice and comparing results (in debug mode).

### 1.4 Failure Isolation

A plugin must never crash the host. Plugin crashes are caught, logged, and isolated. The analysis continues without the failed plugin.

### 1.5 Offline-First

All plugin APIs work fully offline. Network access is an optional permission that plugins must explicitly request and is never required for core functionality.

---

## 2. Plugin Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                    VERIS HOST                             │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Core Engine (deterministic, trusted)              │  │
│  │  • Analysis pipeline                               │  │
│  │  • Canonical objects                               │  │
│  │  • Risk/Trust/Confidence                           │  │
│  │  • Report generation                               │  │
│  └────────────────────────────────────────────────────┘  │
│                           │                                │
│  ┌────────────────────────┴────────────────────────────┐  │
│  │              Plugin Host                             │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │  │
│  │  │ Loader   │  │ Sandbox  │  │ Permission       │   │  │
│  │  │          │  │          │  │ Enforcer         │   │  │
│  │  └──────────┘  └──────────┘  └──────────────────┘   │  │
│  └────────────────────────┬────────────────────────────┘  │
│                           │                                │
│  ┌────────────────────────┴────────────────────────────┐  │
│  │  Plugin Registry                                     │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │  │
│  │  │Extractor │ │Rule Pack │ │Renderer  │ │AI      │  │  │
│  │  │Plugins   │ │Plugins   │ │Plugins   │ │Consumer│  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────┘  │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │  │
│  │  │Panel     │ │Theme     │ │Exporter  │ │Policy  │  │  │
│  │  │Plugins   │ │Plugins   │ │Plugins   │ │Plugins │  │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
│                           │                                │
│  ┌────────────────────────┴────────────────────────────┐  │
│  │  Plugin SDK (@veris/plugin-sdk)                      │  │
│  │  • Public interfaces                                 │  │
│  │  • Capability declarations                           │  │
│  │  • Helper utilities                                  │  │
│  │  • Testing framework                                 │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 2.1 Package Structure

```
packages/plugins/
├── src/
│   ├── host/                          # PluginHost — loading, sandboxing, lifecycle
│   │   ├── plugin-host.ts            # Main host controller
│   │   ├── loader.ts                 # Plugin loading from disk
│   │   ├── sandbox.ts                # Runtime isolation
│   │   ├── permission-enforcer.ts    # Permission checking
│   │   ├── dependency-resolver.ts    # Plugin dependency resolution
│   │   ├── validator.ts             # Manifest validation
│   │   └── index.ts
│   │
│   ├── registry/                      # Plugin type registries
│   │   ├── extractor-plugin-registry.ts
│   │   ├── rule-pack-plugin-registry.ts
│   │   ├── renderer-plugin-registry.ts
│   │   ├── panel-plugin-registry.ts
│   │   └── index.ts
│   │
│   └── index.ts
│
├── sdk/                               # Plugin SDK (published separately)
│   ├── contracts/                     # Plugin interface contracts
│   │   ├── plugin.ts                 # Base plugin interface
│   │   ├── extractor-plugin.ts       # Extractor plugin contract
│   │   ├── rule-pack-plugin.ts       # Rule pack plugin contract
│   │   ├── renderer-plugin.ts        # Renderer plugin contract
│   │   ├── ai-consumer-plugin.ts     # AI consumer plugin contract
│   │   ├── panel-plugin.ts           # Terminal panel plugin contract
│   │   ├── theme-plugin.ts           # Theme plugin contract
│   │   ├── exporter-plugin.ts        # Exporter plugin contract
│   │   └── policy-plugin.ts          # Policy plugin contract
│   ├── manifest/                      # Manifest schema & validation
│   │   ├── manifest-schema.ts
│   │   └── manifest-validator.ts
│   ├── helpers/                       # Plugin author utilities
│   │   ├── logger.ts
│   │   ├── config-accessor.ts
│   │   └── result-builder.ts
│   ├── testing/                       # Plugin testing utilities
│   │   ├── create-mock-host.ts
│   │   ├── create-mock-report.ts
│   │   └── test-fixtures.ts
│   └── index.ts
│
├── __tests__/
├── CHANGELOG.md
└── package.json
```

### 2.2 SDK npm Package

The Plugin SDK is published as a separate npm package so third-party authors never need to depend on the full monorepo:

```
@veris/plugin-sdk         # Published to npm
Dependencies:
  - @veris/core (types only)
  - No other @veris packages
  - Zero runtime dependencies
```

---

## 3. Plugin Lifecycle

### 3.1 Lifecycle States

```
  ┌────────────────┐
  │   DISCOVERED   │  Plugin file found on disk
  └───────┬────────┘
          │ validate manifest
  ┌───────▼────────┐
  │   VALIDATED    │  Manifest syntax and schema OK
  └───────┬────────┘
          │ resolve dependencies
  ┌───────▼────────┐
  │   RESOLVED     │  All dependencies satisfied
  └───────┬────────┘
          │ check permissions
  ┌───────▼────────┐
  │   AUTHORIZED   │  Permissions approved by user/config
  └───────┬────────┘
          │ load into sandbox
  ┌───────▼────────┐
  │   LOADED       │  Code loaded into isolated context
  └───────┬────────┘
          │ initialize
  ┌───────▼────────┐
  │ INITIALIZED    │  Plugin.onInit() called
  └───────┬────────┘
          │ activate
  ┌───────▼────────┐
  │   ACTIVE       │  Plugin is running and accepting calls
  └───────┬────────┘
          │ deactivate
  ┌───────▼────────┐
  │ DEACTIVATING   │  Plugin.onDeactivate() called
  └───────┬────────┘
          │ unload
  ┌───────▼────────┐
  │   UNLOADED     │  Plugin removed from sandbox
  └───────┬────────┘
          │ remove
  ┌───────▼────────┐
  │   REMOVED      │  Plugin files deleted from disk
  └────────────────┘
```

**Error states (any state can transition to):**

```
  ┌────────────────┐
  │    FAILED      │  Non-recoverable error
  └───────┬────────┘
          │
  ┌───────▼────────┐
  │   QUARANTINED  │  Security violation or crash loop
  └────────────────┘
```

### 3.2 Lifecycle Hooks

```typescript
interface PluginLifecycle {
  /** Called after plugin is loaded and sandboxed. Initialize resources. */
  onInit(context: InitContext): Promise<InitResult>;

  /** Called before plugin is activated and registered. */
  onActivate(context: ActivationContext): Promise<ActivationResult>;

  /** Called when plugin is being deactivated (config change, removal). */
  onDeactivate(): Promise<void>;

  /** Called when plugin is fully unloaded. Clean up all resources. */
  onUnload(): Promise<void>;

  /** Called on any unhandled error in the plugin. Return true to restart. */
  onError(error: PluginError): Promise<boolean>;

  /** Called periodically for health check. Return false if unhealthy. */
  onHealthCheck(): Promise<boolean>;
}
```

### 3.3 Timeout Budget

| Lifecycle Stage  | Timeout | Action on Timeout                    |
| ---------------- | ------- | ------------------------------------ |
| `onInit`         | 5s      | Plugin failed, logged, not loaded    |
| `onActivate`     | 2s      | Plugin failed, logged, not activated |
| `onDeactivate`   | 5s      | Force unload                         |
| `onUnload`       | 3s      | Force unload                         |
| `onError`        | 1s      | Plugin quarantined                   |
| `onHealthCheck`  | 500ms   | Plugin quarantined                   |
| Per-request call | 30s     | Request cancelled, error returned    |

---

## 4. Plugin Types & Extension Contracts

### 4.1 Plugin Type Registry

| Plugin Type            | Extension Point          | Host Integration                | Published V1? |
| ---------------------- | ------------------------ | ------------------------------- | ------------- |
| Extractor              | `Extractor` interface    | Registered in ExtractorRegistry | Yes           |
| Rule Pack              | `RulePack` interface     | Registered in RulePackRegistry  | Yes           |
| Renderer               | `Renderer` interface     | Registered in RendererRegistry  | Yes           |
| AI Consumer            | `AiConsumer` interface   | Consumes AIReadyContext         | Yes           |
| Terminal Panel         | `PanelPlugin` interface  | Adds screen to TUI registry     | V2            |
| Theme                  | `ThemePlugin` interface  | Loads theme tokens              | V2            |
| Exporter               | `Exporter` interface     | Registered in ExporterRegistry  | V2            |
| Policy                 | `PolicyPlugin` interface | Evaluated in Policy Engine      | V2            |
| Diagnostics            | `DiagnosticsPlugin`      | Reads diagnostics stream        | V3            |
| Enterprise Integration | TBD                      | Varies                          | V3+           |

### 4.2 Base Plugin Interface

All plugins implement this base interface:

```typescript
interface Plugin {
  /** Unique plugin ID (npm-style: "@org/veris-plugin-name") */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Plugin version (semver) */
  readonly version: string;

  /** Plugin type identifier */
  readonly type: PluginType;

  /** Declared capabilities */
  readonly capabilities: PluginCapability[];

  /** Lifecycle hooks */
  lifecycle: PluginLifecycle;

  /** Plugin manifest (loaded from manifest.json) */
  readonly manifest: PluginManifest;
}
```

### 4.3 Extractor Plugin Contract

```typescript
interface ExtractorPlugin extends Plugin {
  type: 'extractor';

  /** The extractor instance this plugin provides */
  readonly extractor: Extractor;

  /** Optional: additional extractors if this plugin provides multiple */
  readonly extractors?: Extractor[];

  /** Declare which artifact types this plugin handles */
  readonly supportedTypes: ArtifactType[];

  /** Declare performance characteristics for scheduling */
  readonly performanceProfile: {
    avgExtractionTimeMs: number;
    memoryPerExtractionMb: number;
    parallelSafe: boolean;
  };
}
```

Extractor plugins implement the same `Extractor` interface defined in SPEC-004 §5.1.

**Allowed APIs:**

- `ExtractorContext` (sandboxed config, scoped logger, abort signal)
- `@veris/core` types (Artifact, Feature, Capability, SourceLocation)
- Plugin SDK helpers (`createFeature()`, `createCapability()`)

**Forbidden APIs:**

- Direct filesystem access (use sandboxed FS via `ExtractorContext`)
- Network access (unless explicitly permitted)
- Access to other plugins' data
- Modification of canonical objects after creation

### 4.4 Rule Pack Plugin Contract

```typescript
interface RulePackPlugin extends Plugin {
  type: 'rule-pack';

  /** The rule pack this plugin provides */
  readonly rulePack: RulePack;

  /** Optional: additional rule packs */
  readonly rulePacks?: RulePack[];

  /** Taxonomy IDs this pack introduces (if any) */
  readonly taxonomyExtensions?: TaxonomyNode[];
}
```

Rule pack plugins implement the same `RulePack` contract defined in SPEC-003 §8.

**Allowed APIs:**

- `@veris/core` types (Rule, RuleResult, Behavior, Evidence, Finding)
- `@veris/rules-engine` interfaces (RuleMatcher, RuleLogic)
- Plugin SDK helpers (`createRule()`, `createPropertyMatcher()`)

**Forbidden APIs:**

- Modification of existing rules or rule packs
- Overriding built-in rule severities (use Policy Engine instead)
- Access to the Correlation Engine or Trust Engine

### 4.5 Renderer Plugin Contract

```typescript
interface RendererPlugin extends Plugin {
  type: 'renderer';

  /** The renderer instance */
  readonly renderer: Renderer;

  /** Output formats this renderer supports */
  readonly formats: string[];
}
```

Renderer plugins implement the same `Renderer` interface defined in SPEC-006 §2.2.

**Allowed APIs:**

- `CanonicalReport` (read-only)
- `@veris/shared` serialization helpers
- File write (via sandboxed FS, only to designated output directory)

**Forbidden APIs:**

- Modification of the CanonicalReport
- Access to the analysis pipeline
- Reading files outside the output directory

### 4.6 AI Consumer Plugin Contract

```typescript
interface AiConsumerPlugin extends Plugin {
  type: 'ai-consumer';

  /** Process AI-ready context and return enhanced explanations */
  process(context: AIReadyContext): Promise<AIExplanation>;

  /** Provider configuration (API endpoint, model, etc.) */
  readonly provider: AiProviderConfig;

  /** Whether this provider requires network access */
  readonly requiresNetwork: boolean;
}
```

AI Consumer plugins consume `AIReadyContext` (from SPEC-003 §7.7) and produce `AIExplanation`.

**Allowed APIs:**

- `AIReadyContext` (read-only)
- Network (if permitted, for API calls)
- Plugin SDK configuration accessor

**Forbidden APIs:**

- Modification of canonical objects
- Access to the analysis pipeline
- Reading files from the scanned target
- Caching or persisting scan data

### 4.7 Terminal Panel Plugin Contract (V2)

```typescript
interface PanelPlugin extends Plugin {
  type: 'panel';

  /** Screen name for navigation */
  readonly screenName: string;

  /** Screen title shown in breadcrumb */
  readonly title: string;

  /** Render the panel content */
  render(context: PanelContext): React.ReactNode;

  /** Panel-specific keyboard shortcuts */
  readonly shortcuts?: PanelShortcut[];
}
```

**Allowed APIs:**

- Component library (Box, Panel, Table, Badge, etc.)
- Read-only report data via `PanelContext`
- Plugin SDK helpers

**Forbidden APIs:**

- Direct terminal access (use components only)
- Animation control outside component lifecycle
- Blocking the main render loop

### 4.8 Theme Plugin Contract (V2)

```typescript
interface ThemePlugin extends Plugin {
  type: 'theme';

  /** Theme tokens */
  readonly theme: ThemeTokens;

  /** Base theme this extends ("dark" | "light") */
  readonly extends: 'dark' | 'light';
}
```

### 4.9 Exporter Plugin Contract (V2)

```typescript
interface ExporterPlugin extends Plugin {
  type: 'exporter';

  /** The exporter instance */
  readonly exporter: StaticRenderer;

  /** File extension for output */
  readonly fileExtension: string;
}
```

### 4.10 Policy Plugin Contract (V2)

```typescript
interface PolicyPlugin extends Plugin {
  type: 'policy';

  /** Evaluate the policy against the report */
  evaluate(report: CanonicalReport): Promise<PolicyEvaluation>;

  /** Policy metadata */
  readonly policy: {
    id: string;
    name: string;
    version: string;
    description: string;
    framework: string; // "pci-dss", "soc2", "custom", etc.
  };
}
```

---

## 5. Plugin SDK Design

### 5.1 SDK Layout (Published as `@veris/plugin-sdk`)

```
@veris/plugin-sdk/
├── contracts/                    # Plugin interface contracts
│   ├── plugin.ts
│   ├── extractor-plugin.ts
│   ├── rule-pack-plugin.ts
│   ├── renderer-plugin.ts
│   ├── ai-consumer-plugin.ts
│   ├── panel-plugin.ts
│   ├── theme-plugin.ts
│   ├── exporter-plugin.ts
│   └── policy-plugin.ts
├── manifest/                     # Manifest schema & validation
│   ├── manifest-schema.ts
│   └── manifest-validator.ts
├── helpers/                      # Plugin author utilities
│   ├── logger.ts
│   ├── config-accessor.ts
│   ├── result-builder.ts
│   └── id-generator.ts
├── testing/                      # Plugin testing utilities
│   ├── create-mock-host.ts
│   ├── create-mock-report.ts
│   └── create-mock-behavior.ts
├── types/                        # Exported core types (subset)
│   ├── core-types.ts             # Re-exports from @veris/core
│   └── engine-types.ts           # Re-exports from @veris/rules-engine
└── index.ts
```

**Dependencies:**

- `@veris/core` (types only — no runtime dependency)
- Zero additional runtime dependencies

### 5.2 Plugin SDK Helpers

**Logger:**

```typescript
// Scoped logger that prefixes all messages with [plugin:id]
const logger = createPluginLogger('my-org/veris-plugin-secrets');
logger.info('Plugin initialized');
logger.warn('Deprecated API used, consider updating');
logger.error('Extraction failed', error);
```

**Config Accessor:**

```typescript
// Read plugin-specific configuration from merged config
const config = createConfigAccessor(pluginId);
const apiKey = config.get('apiKey'); // From plugin config section
const enabled = config.get('enabled', true); // With default
const allConfig = config.getAll(); // All plugin config
```

**Result Builder:**

```typescript
// Simplified creation of canonical objects
const feature = createFeature({
  artifactId: 'art_abc123',
  type: 'url',
  value: { kind: 'string', value: 'https://example.com' },
  location: { startLine: 42, startColumn: 0, endLine: 42, endColumn: 23 },
  confidence: 0.95,
});

const capability = createCapability({
  artifactId: 'art_abc123',
  name: 'http-request',
  category: 'network-connect',
  source: location,
  confidence: 0.95,
});
```

**Testing Utilities:**

```typescript
// Mock host for testing plugins
const mockHost = createMockHost({
  config: { myPlugin: { apiKey: 'test' } },
  logger: console,
  permissions: ['fs-read', 'network'],
});

// Mock report for testing renderer plugins
const mockReport = createMockReport({
  findingCount: 10,
  severityDistribution: { critical: 2, high: 3, medium: 3, low: 2 },
});

// Test that plugin initializes correctly
const plugin = new MyPlugin();
const result = await plugin.onInit(mockHost.createInitContext());
expect(result.success).toBe(true);
```

### 5.3 SDK Versioning

SDK version follows semver independently of the engine:

| SDK Version | Engine Version | Notes                                |
| ----------- | -------------- | ------------------------------------ |
| 1.x         | 1.x            | Initial SDK                          |
| 2.x         | 2.x–3.x        | May add new plugin types             |
| 3.x         | 4.x            | Breaking changes to plugin contracts |

A plugin's manifest declares `sdkVersion` which is checked at load time.

---

## 6. Manifest Specification

### 6.1 Manifest File

Every plugin includes `manifest.json` at its root:

```json
{
  "id": "@acme/veris-plugin-secrets-plus",
  "name": "Secrets Detection Plus",
  "version": "1.2.0",
  "description": "Enhanced secrets detection for enterprise environments",
  "author": "ACME Corp",
  "license": "MIT",
  "type": "rule-pack",

  "sdkVersion": "^1.0.0",
  "minEngineVersion": "1.0.0",
  "maxEngineVersion": "2.0.0",

  "entryPoint": "dist/index.js",
  "types": "dist/index.d.ts",

  "capabilities": [
    {
      "id": "rules:secrets:enhanced",
      "description": "Provides 15 additional secret detection rules"
    }
  ],

  "permissions": {
    "required": ["config-read"],
    "optional": []
  },

  "dependencies": {
    "plugins": {
      "@veris/plugin-core": "^1.0.0"
    },
    "engines": {
      "node": ">=18.0.0"
    }
  },

  "performance": {
    "expectedLoadTimeMs": 500,
    "expectedMemoryMb": 10,
    "expectedThroughputImpact": "minimal"
  },

  "metadata": {
    "tags": ["secrets", "enterprise", "enhanced"],
    "homepage": "https://acme.com/veris-plugins/secrets-plus",
    "repository": "https://github.com/acme/veris-plugin-secrets-plus",
    "bugs": "https://github.com/acme/veris-plugin-secrets-plus/issues"
  }
}
```

### 6.2 Manifest Schema

```typescript
interface PluginManifest {
  id: string; // Unique plugin ID (npm-style)
  name: string;
  version: string; // semver
  description: string;
  author: string;
  license: string;
  type: PluginType; // From §4.1

  // Compatibility
  sdkVersion: string; // "^1.0.0"
  minEngineVersion: string; // Minimum VERIS engine version
  maxEngineVersion?: string; // Maximum VERIS engine version (null = unbound)

  // Entry points
  entryPoint: string; // Main JS file relative to plugin root
  types?: string; // TypeScript declaration file

  // Capabilities
  capabilities: PluginCapability[];

  // Permissions
  permissions: {
    required: PermissionId[];
    optional: PermissionId[];
  };

  // Dependencies
  dependencies?: {
    plugins?: Record<string, string>; // plugin-id → version range
    engines?: Record<string, string>; // engine-name → version range
  };

  // Performance
  performance?: {
    expectedLoadTimeMs?: number;
    expectedMemoryMb?: number;
    expectedThroughputImpact?: 'none' | 'minimal' | 'moderate' | 'significant';
  };

  // Metadata
  metadata?: {
    tags?: string[];
    homepage?: string;
    repository?: string;
    bugs?: string;
    signature?: string; // Plugin signature (future)
  };
}
```

### 6.3 Manifest Validation

| Check                            | Failure Action                     |
| -------------------------------- | ---------------------------------- |
| Schema conformance               | Plugin rejected, diagnostic logged |
| Plugin ID format (`@scope/name`) | Plugin rejected                    |
| Version valid semver             | Plugin rejected                    |
| SDK version compatibility        | Plugin rejected                    |
| Engine version compatibility     | Plugin rejected                    |
| Entry point file exists          | Plugin rejected                    |
| Required permissions declared    | Plugin rejected                    |
| Dependency versions resolvable   | Plugin skipped (deps logged)       |
| Plugin ID unique                 | Plugin rejected (duplicate)        |

---

## 7. Configuration System

### 7.1 Configuration Hierarchy

```
Level 0: Defaults (hardcoded in engine)
     │ overridden by
Level 1: Global config (~/.config/veris/config.json)
     │ overridden by
Level 2: Workspace config (.veris/config.json in project root)
     │ overridden by
Level 3: Repository config (.verisrc in repo root)
     │ overridden by
Level 4: Scan profile (named profile selected by user)
     │ overridden by
Level 5: CLI flags (command line arguments)
     │ overridden by
Level 6: Environment variables (VERIS_*)
```

**Deterministic precedence:** Higher level always overrides lower level. No merging of conflicting values. Objects at lower levels are deep-merged with higher levels.

### 7.2 Configuration Schema

```typescript
interface VerisConfig {
  // Scan settings
  scan: {
    target?: string; // Scan target path
    profile?: string; // Scan profile ID
    extractors?: ExtractorConfig;
    rules?: RuleConfig;
    output?: OutputConfig;
    limits?: LimitsConfig;
  };

  // Plugin settings
  plugins: {
    enabled: boolean; // Global plugin toggle
    paths: string[]; // Additional plugin directories
    config: Record<string, unknown>; // Per-plugin configuration
    permissions?: PermissionOverride;
  };

  // Policy settings
  policy?: {
    path?: string; // Policy file path
    failOnViolation?: boolean; // Exit with error on policy violation
  };

  // Theme settings
  theme?: {
    mode: 'dark' | 'light' | 'auto';
    customPath?: string; // Custom theme file
  };

  // Diagnostics
  diagnostics?: {
    enabled: boolean;
    level: 'basic' | 'detailed' | 'full';
    outputPath?: string; // Diagnostics output file
  };

  // Telemetry (optional, off by default)
  telemetry?: {
    enabled: boolean;
    endpoint?: string;
  };
}
```

### 7.3 Configuration File Locations

| Level      | Location                               | Auto-created              |
| ---------- | -------------------------------------- | ------------------------- |
| Global     | `~/.config/veris/config.json`          | On first `veris init`     |
| Workspace  | `.veris/config.json`                   | No (user creates)         |
| Repository | `.verisrc` or `.verisrc.json`          | No (user creates)         |
| Profile    | `~/.config/veris/profiles/<name>.json` | On `veris profile create` |

### 7.4 Configuration Resolution Algorithm

```
1. Start with deep-cloned defaults
2. Find and load global config → deep merge
3. Walk up from cwd, find .veris/ or .verisrc → deep merge
4. If profile specified, load profile config → deep merge
5. Parse CLI flags → deep merge
6. Read VERIS_* env vars → deep merge
7. Validate merged config against schema
8. Return validated Config object
```

### 7.5 Environment Variable Mapping

| Env Var                 | Config Path           | Example                       |
| ----------------------- | --------------------- | ----------------------------- |
| `VERIS_PROFILE`         | `scan.profile`        | `VERIS_PROFILE=quick`         |
| `VERIS_TARGET`          | `scan.target`         | `VERIS_TARGET=./src`          |
| `VERIS_OUTPUT`          | `scan.output.format`  | `VERIS_OUTPUT=json`           |
| `VERIS_PLUGINS_ENABLED` | `plugins.enabled`     | `VERIS_PLUGINS_ENABLED=false` |
| `VERIS_DIAGNOSTICS`     | `diagnostics.enabled` | `VERIS_DIAGNOSTICS=true`      |
| `VERIS_THEME`           | `theme.mode`          | `VERIS_THEME=light`           |

---

## 8. Scan Profiles

### 8.1 Profile Definition

```typescript
interface ScanProfile {
  id: string; // "quick", "deep", etc.
  name: string; // "Quick Scan"
  description: string;
  extends?: string; // Base profile to extend

  // Rule configuration
  rules: {
    enabledPacks: string[]; // Rule packs to enable
    disabledPacks?: string[]; // Rule packs to disable
    severityThreshold?: SeverityLevel; // Minimum severity to report
    maxFindings?: number; // Stop after N findings
  };

  // Extraction configuration
  extraction: {
    depth: 'shallow' | 'normal' | 'deep';
    archiveDepth: number;
    maxFileSize: string; // "10MB"
    maxFiles: number;
    extractors?: string[]; // Specific extractors to use
  };

  // Performance limits
  limits: {
    maxDuration?: string; // "60s"
    maxMemory?: string; // "512MB"
    maxConcurrency?: number;
  };

  // Output preferences
  output: {
    format?: string[];
    verbosity: 'minimal' | 'normal' | 'detailed';
    showDiagnostics: boolean;
  };
}
```

### 8.2 Built-in Profiles

| Profile          | ID              | Use Case                                 | Rule Packs                                   | Extraction             | Limits       |
| ---------------- | --------------- | ---------------------------------------- | -------------------------------------------- | ---------------------- | ------------ |
| Quick            | `quick`         | Rapid feedback during development        | Secrets, Configuration                       | Shallow                | 30s, 100MB   |
| Balanced         | `balanced`      | Default — good coverage, reasonable time | All standard packs                           | Normal                 | 5min, 512MB  |
| Deep             | `deep`          | Thorough analysis                        | All packs including experimental             | Deep                   | 30min, 2GB   |
| Forensics        | `forensics`     | Malware/triage analysis                  | Execution, Persistence, Network, Obfuscation | Deep, archive depth=10 | 60min, 4GB   |
| CI               | `ci`            | CI pipeline integration                  | Secrets, Configuration, Injection            | Normal                 | 10min, 512MB |
| Repository Audit | `repo-audit`    | Full repository assessment               | All packs                                    | Deep, include vendored | 60min, 2GB   |
| Archive Audit    | `archive-audit` | Archive/dependency analysis              | Archives, Secrets, Execution                 | Deep, archive depth=20 | 30min, 1GB   |
| Large Repository | `large-repo`    | Performance-optimized for large projects | Secrets, Configuration, Injection            | Shallow, max 10K files | 30min, 1GB   |

### 8.3 Profile Merging

Custom profiles can extend built-in profiles:

```json
{
  "id": "my-enterprise-profile",
  "extends": "balanced",
  "rules": {
    "enabledPacks": ["secrets", "configuration", "my-corp-rules"],
    "severityThreshold": "high"
  },
  "limits": {
    "maxDuration": "10min"
  }
}
```

The extending profile deep-merges with the base profile. Extended values override base values.

---

## 9. Policy Engine

### 9.1 Policy File

```yaml
# .verispolicy.yaml
version: '1.0'
name: 'PCI-DSS Compliance Policy'
description: 'Policy for PCI-DSS compliant scans'

rules:
  required:
    - secrets
    - configuration
    - crypto
  allowed:
    - '*' # All other packs are allowed
  blocked:
    - experimental # Experimental packs not allowed in CI

thresholds:
  risk:
    maxScore: 5.0 # Fail if risk > 5.0
    maxCritical: 0 # No critical findings allowed
    maxHigh: 3 # Max 3 high findings
  confidence:
    minOverall: 0.7 # Minimum confidence for reported findings

ignore:
  - rule: 'secrets/generic-api-key'
    reason: 'False positives in test files'
  - path: 'tests/'
    reason: 'Test files are excluded from policy'

compliance:
  framework: 'pci-dss'
  gates:
    - name: 'critical-blocker'
      condition: 'findings.critical > 0'
      action: 'fail'
      message: 'Critical findings must be resolved before deployment'
    - name: 'high-warning'
      condition: 'findings.high > 3'
      action: 'warn'
      message: 'More than 3 high-severity findings detected'

output:
  required:
    - sarif
    - json
  onFailure: 'html' # Generate HTML report on failure
```

### 9.2 Policy Evaluation

```typescript
interface PolicyEvaluation {
  policyId: string;
  policyName: string;
  version: string;
  timestamp: ISO8601;

  // Overall result
  passed: boolean;
  summary: string;

  // Rule checks
  ruleCompliance: {
    requiredMet: boolean;
    missingRequired: string[];
    blockedDetected: string[];
    warnings: string[];
  };

  // Threshold checks
  thresholdResults: ThresholdResult[];

  // Compliance gate results
  gateResults: GateResult[];

  // Ignore rules applied
  ignoredFindings: number;

  // Detailed report
  details: PolicyDetail[];
}

interface GateResult {
  name: string;
  passed: boolean;
  condition: string;
  action: 'fail' | 'warn' | 'info';
  message: string;
  triggeredBy?: FindingId[];
}
```

### 9.3 Policy Enforcement

| Action | Behavior                                               |
| ------ | ------------------------------------------------------ |
| `fail` | Scan exits with non-zero code, failure message printed |
| `warn` | Warning printed, scan continues, exit code 0           |
| `info` | Informational message printed, scan continues          |

### 9.4 Policy Resolution

1. Look for `.verispolicy.yaml`, `.verispolicy.yml`, or `.verispolicy.json` in the scan target root.
2. If not found, look in `~/.config/veris/policy.yaml`.
3. If not found, no policy is applied.
4. Policy path can be explicitly set via `--policy` flag or `VERIS_POLICY` env var.

---

## 10. Permission Model

### 10.1 Permission Registry

| Permission ID        | Scope                           | Default                 | Risk     |
| -------------------- | ------------------------------- | ----------------------- | -------- |
| `core-types-read`    | Read canonical object types     | ✅ Always granted       | None     |
| `config-read`        | Read plugin-specific config     | ✅ Always granted       | None     |
| `config-write`       | Write to plugin config section  | ❌ User must approve    | Low      |
| `fs-read-target`     | Read scanned files              | ❌ User must approve    | Medium   |
| `fs-read-cache`      | Read plugin cache directory     | ❌ User must approve    | Low      |
| `fs-write-cache`     | Write to plugin cache directory | ❌ User must approve    | Low      |
| `fs-write-output`    | Write to output directory       | ❌ User must approve    | Low      |
| `network`            | Make network requests           | ❌ User must approve    | High     |
| `env-read`           | Read environment variables      | ❌ User must approve    | Medium   |
| `process-spawn`      | Spawn child processes           | ❌ User must approve    | Critical |
| `diagnostics-read`   | Read diagnostics stream         | ✅ Always granted       | None     |
| `ai-context-read`    | Read AI context                 | ✅ Always granted       | None     |
| `report-read`        | Read the CanonicalReport        | ✅ Always granted       | None     |
| `other-plugins-read` | Read other plugins' metadata    | ❌ User must approve    | Low      |
| `ui-component`       | Register UI components          | ✅ Always granted (TUI) | None     |

### 10.2 Permission Enforcement

```typescript
interface PermissionEnforcer {
  /** Check if the plugin has the required permission */
  check(pluginId: string, permission: PermissionId): Promise<boolean>;

  /** Request a permission (prompts user if not yet approved) */
  request(pluginId: string, permission: PermissionId): Promise<PermissionResponse>;

  /** Revoke a previously granted permission */
  revoke(pluginId: string, permission: PermissionId): Promise<void>;

  /** Get all granted permissions for a plugin */
  getGranted(pluginId: string): PermissionId[];

  /** Get all required permissions for a plugin */
  getRequired(pluginId: string): PermissionId[];
}
```

### 10.3 Permission Approval Flow

```
Plugin requests permission
       │
       ▼
Is it pre-approved in config? → Yes → Grant
       │ No
       ▼
Is it required in manifest? → Yes → Show prompt to user at install
       │ No
       ▼
Show prompt to user at runtime
  → Accept: Grant for session (or permanently if checked)
  → Deny: Operation fails gracefully, plugin continues with reduced capability
```

### 10.4 Permission Groups

```json
{
  "safe": ["core-types-read", "config-read", "diagnostics-read", "ai-context-read", "report-read"],
  "storage": ["fs-read-cache", "fs-write-cache", "fs-write-output"],
  "target-access": ["fs-read-target", "env-read"],
  "dangerous": ["network", "process-spawn", "config-write"]
}
```

Plugins requesting permissions from the `dangerous` group trigger additional scrutiny:

- User is warned at install time.
- Permissions are logged and auditable.
- Enterprise policy may block `dangerous` permissions entirely.

---

## 11. Sandboxing Strategy

### 11.1 Isolation Model

VERIS uses **process-level isolation** for plugins (not VM-level, not thread-level).

```
┌──────────────────────────────────────┐
│  VERIS Host Process                   │
│  • Core engine                        │
│  • Plugin Host                        │
│  • Sandbox Manager                    │
└──────────┬───────────────────────────┘
           │ IPC (stdin/stdout JSON messages)
           │
┌──────────▼──────────┐  ┌──────────▼──────────┐
│  Plugin Process 1   │  │  Plugin Process 2   │
│  • Isolated V8 ctx  │  │  • Isolated V8 ctx  │
│  • Restricted APIs  │  │  • Restricted APIs  │
│  • Memory limit     │  │  • Memory limit     │
│  • Timeout tracking │  │  • Timeout tracking │
└─────────────────────┘  └─────────────────────┘
```

### 11.2 Process Isolation Details

| Property       | Implementation                                   |
| -------------- | ------------------------------------------------ |
| Process type   | Child process (Node.js `child_process.fork()`)   |
| Communication  | JSON messages over stdin/stdout                  |
| Memory limit   | Configurable per plugin (default: 128MB)         |
| CPU limit      | Process priority (niceness)                      |
| Timeout        | Per-request timeout (default: 30s)               |
| Crash handling | Process SIGKILL on timeout, auto-restart (max 3) |
| File system    | Restricted to plugin directory + cache directory |
| Network        | Blocked unless `network` permission granted      |

### 11.3 API Surface

**Available in sandbox:**

```
- @veris/plugin-sdk (all exports)
- Standard JavaScript APIs (Array, Map, Set, Promise, etc.)
- JSON.parse/stringify
- console.log (redirected to host logger)
- setTimeout/setInterval (scoped to plugin lifecycle)
```

**Blocked in sandbox (shimmed or removed):**

```
- require('fs')           → Use sandboxed FS via context
- require('net')          → Blocked unless 'network' permission
- require('child_process') → Blocked unless 'process-spawn' permission
- process.exit            → Blocked (would kill plugin process)
- process.env             → Blocked unless 'env-read' permission
- __dirname               → Restricted to plugin directory
- eval / Function         → Blocked (security)
- Worker                  → Blocked (no sub-processes)
```

### 11.4 Crash Recovery

```
Plugin crash detected
       │
       ▼
Is this the 1st/2nd crash? → Yes → Restart plugin, log warning
       │ No (3rd+ crash)
       ▼
Is this within 60 seconds of last crash? → Yes → Quarantine plugin
       │ No
       ▼
Restart plugin, reset crash counter
```

### 11.5 Quarantine

A quarantined plugin is:

- Removed from the active plugin registry
- No longer called by the host
- Reported in diagnostics
- Re-checked on next scan (if configured with `retryOnNextScan: true`)

---

## 12. Plugin Packaging & Distribution

### 12.1 Package Format

Plugins are distributed as **npm packages** with a `veris-plugin` keyword:

```
@acme/veris-plugin-secrets-plus/
├── manifest.json
├── package.json          # Standard npm package
├── dist/
│   ├── index.js          # Compiled entry point
│   └── index.d.ts        # TypeScript declarations
├── README.md
└── LICENSE
```

The `package.json` must include:

```json
{
  "name": "@acme/veris-plugin-secrets-plus",
  "version": "1.2.0",
  "keywords": ["veris-plugin", "veris", "secrets"],
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "veris": {
    "manifest": "manifest.json",
    "type": "rule-pack"
  }
}
```

### 12.2 Installation

```
veris plugin install @acme/veris-plugin-secrets-plus
```

**Installation flow:**

1. Resolve package from npm registry (or local path).
2. Install to `~/.config/veris/plugins/node_modules/@acme/veris-plugin-secrets-plus/`.
3. Validate manifest.
4. Check dependencies.
5. Display permissions required.
6. Prompt user to approve permissions (or auto-approve if configured).
7. Activate plugin.

### 12.3 Local Installation

Plugins can be installed from a local directory:

```
veris plugin install ./path/to/my-plugin
```

The plugin is symlinked into the plugin directory for development.

### 12.4 Plugin Discovery

Plugins are discovered from:

1. `~/.config/veris/plugins/node_modules/` (user-installed)
2. `./.veris/plugins/node_modules/` (project-local)
3. Built-in plugins (shipped with VERIS in `@veris/rules`, `@veris/extractors`, etc.)

---

## 13. Plugin Diagnostics

### 13.1 Plugin Load Report

```
Plugin Load Report:
┌──────────────────────────────────┬────────┬────────┬─────────┐
│ Plugin                           │ Status │ Version│ Load    │
│                                  │        │        │ Time   │
├──────────────────────────────────┼────────┼────────┼─────────┤
│ @veris/plugin-core              │ ✓      │ 1.0.0  │ 12ms   │
│ @veris/plugin-secrets           │ ✓      │ 1.2.0  │ 8ms    │
│ @acme/veris-plugin-secrets-plus │ ✓      │ 1.0.0  │ 15ms   │
│ @acme/veris-plugin-network      │ ✗      │ —      │ —      │
│                                  │ (dep)  │        │        │
└──────────────────────────────────┴────────┴────────┴─────────┘

Failed plugins:
  @acme/veris-plugin-network
    Reason: Missing dependency @acme/veris-plugin-core (^2.0.0)
    Resolution: Install @acme/veris-plugin-core@^2.0.0
```

### 13.2 Capability Matrix

```
Capability Matrix:
┌──────────────────────────────────┬──────────┬──────────┬──────────┐
│ Plugin                           │Extractors│Rule Packs│Renderers │
├──────────────────────────────────┼──────────┼──────────┼──────────┤
│ @veris/plugin-core              │ —        │ 3 packs  │ —        │
│ @veris/plugin-secrets           │ —        │ 1 pack   │ —        │
│ @acme/veris-plugin-secrets-plus │ —        │ 1 pack   │ —        │
│ @acme/veris-plugin-html-render  │ —        │ —        │ HTML     │
└──────────────────────────────────┴──────────┴──────────┴──────────┘

Total capabilities:
  • 5 rule packs (120 rules)
  • 1 renderer (HTML)
  • 0 extractors
```

### 13.3 Permission Usage

```
Permission Usage:
┌──────────────────────────────────┬──────────────────────┬──────────┐
│ Plugin                           │ Permissions Used     │ Violations│
├──────────────────────────────────┼──────────────────────┼──────────┤
│ @veris/plugin-core              │ core-types-read,     │ 0        │
│                                  │ config-read          │          │
│ @veris/plugin-secrets           │ core-types-read      │ 0        │
│ @acme/veris-plugin-secrets-plus │ core-types-read,     │ 0        │
│                                  │ config-read          │          │
│ @acme/veris-plugin-network      │ (not loaded)         │ —        │
└──────────────────────────────────┴──────────────────────┴──────────┘

Permission violations: 0
```

### 13.4 Performance Report

```
Plugin Performance Report:
┌──────────────────────────────────┬──────────┬──────────┬──────────┐
│ Plugin                           │ Avg Call  │ Max Call │ Memory   │
│                                  │ Time      │ Time     │          │
├──────────────────────────────────┼──────────┼──────────┼──────────┤
│ @veris/plugin-core              │ 0.2ms    │ 2.1ms    │ 4.2 MB  │
│ @veris/plugin-secrets           │ 0.5ms    │ 3.4ms    │ 2.1 MB  │
│ @acme/veris-plugin-secrets-plus │ 1.2ms    │ 8.9ms    │ 8.5 MB  │
└──────────────────────────────────┴──────────┴──────────┴──────────┘

Total plugin memory: 14.8 MB
Total plugin CPU: 2.3% of scan time
```

### 13.5 Configuration Resolution Trace

```
Configuration Resolution Trace:
  Level 0 (Defaults): scan.limits.maxFiles = 100000
  Level 1 (Global):   scan.limits.maxFiles = 50000
  Level 2 (Workspace): not found
  Level 3 (Repository): scan.limits.maxFiles = 10000  ← final value
  Level 4 (Profile):   scan.profile = "quick"
  Level 5 (CLI):       --format json → scan.output.format = "json"
  Level 6 (Env):       VERIS_DIAGNOSTICS=true → diagnostics.enabled = true
```

### 13.6 Policy Evaluation Trace

```
Policy Evaluation Trace:
  Policy: PCI-DSS Compliance Policy v1.0
  File: .verispolicy.yaml

  Required packs check:
    ✓ secrets: loaded
    ✓ configuration: loaded
    ✓ crypto: loaded

  Blocked packs check:
    ✓ experimental: not loaded

  Threshold checks:
    ✓ risk.maxScore: 3.2 ≤ 5.0 (PASS)
    ✓ thresholds.maxCritical: 0 ≤ 0 (PASS)
    ✗ thresholds.maxHigh: 4 > 3 (FAIL)
      → 4 high findings detected, max allowed is 3

  Gate results:
    ✗ critical-blocker: PASS (0 critical findings)
    ✗ high-warning: FAIL (4 high findings > 3 threshold)

  Overall: FAILED
```

---

## 14. Security Considerations

### 14.1 Threat Model

| Threat                                 | Impact                  | Mitigation                                    |
| -------------------------------------- | ----------------------- | --------------------------------------------- |
| Malicious plugin exfiltrates scan data | Data leak               | Permission model, network off by default      |
| Malicious plugin modifies core objects | Integrity violation     | Sandboxing, no core object access             |
| Plugin crash loop                      | Denial of service       | Quarantine after 3 crashes in 60s             |
| Plugin resource exhaustion             | Performance degradation | Memory limits, CPU limits, timeouts           |
| Plugin dependency hijack               | Supply chain attack     | Manifest signing (future), dependency pinning |
| Plugin reads other plugin data         | Privacy violation       | Process isolation, IPC only                   |
| Plugin modifies files outside scope    | Data integrity          | Sandboxed FS, restricted paths                |

### 14.2 Supply Chain Security

| Measure                | Implementation                                          |
| ---------------------- | ------------------------------------------------------- |
| Dependency pinning     | Plugin manifest declares exact version ranges           |
| Integrity verification | npm package lockfiles + optional signature verification |
| Scope isolation        | Plugins run in separate process                         |
| Permission review      | All permissions reviewed at install time                |
| Audit log              | All plugin operations logged                            |

### 14.3 Plugin Signing (V2+)

- Plugins can be signed with a private key.
- Signature is stored in `manifest.metadata.signature`.
- Host verifies signature against a trusted public key store.
- Unsigned plugins can still run but are flagged in diagnostics.

---

## 15. Performance Considerations

### 15.1 Plugin Overhead Budget

| Metric                    | Budget             |
| ------------------------- | ------------------ |
| Per-plugin load time      | ≤ 1s               |
| Per-plugin memory         | ≤ 128 MB           |
| Per-plugin CPU (per call) | ≤ 100ms            |
| Plugin IPC latency        | ≤ 1ms per message  |
| Total plugin overhead     | ≤ 10% of scan time |
| Total plugin memory       | ≤ 256 MB           |

### 15.2 Optimization Techniques

| Technique                      | Applied To          | Expected Gain                              |
| ------------------------------ | ------------------- | ------------------------------------------ |
| Lazy plugin loading            | All plugins         | Only load plugins when needed for the scan |
| Parallel plugin initialization | Plugin host         | N× speedup for N plugins                   |
| Connection pooling             | AI Consumer plugins | Reuse HTTP connections                     |
| Plugin result caching          | All plugins         | Cache repeated calls within a session      |
| Stale plugin detection         | Plugin host         | Unload plugins not used in current session |

---

## 16. Future Compatibility

### 16.1 Marketplace (V3+)

- Centralized plugin registry at `marketplace.veris.dev`.
- Plugin search, rating, and review system.
- One-command install: `veris plugin search secrets` → `veris plugin install @user/plugin`.
- Signed plugin verification.
- Automatic update checking.

### 16.2 Organization Plugin Repositories (V3+)

- Private npm registry for organization plugins.
- `veris plugin add-registry https://npm.corp.com/`.
- Organization-wide plugin policies.

### 16.3 Signed Plugins (V2+)

- Plugins signed with GPG or Sigstore.
- Signature verified at load time.
- Unsigned plugin warning.

### 16.4 Cloud Sync (Optional)

- Plugin configuration synced across machines.
- Permission decisions synced.
- Plugin list synced.

### 16.5 Enterprise Bundles (V4+)

- Pre-configured plugin bundles for enterprise customers.
- Compliance-specific plugin sets (PCI-DSS bundle, SOC2 bundle).
- Centralized management.

### 16.6 Remote Execution (Optional)

- Plugins can run on a remote server (for heavy AI processing).
- Local sandbox still validates and mediates all calls.

---

## 17. Engineering Tradeoffs

### 17.1 Process Isolation vs. Thread Isolation

**Tradeoff:** Process isolation is stronger (separate memory space, crash isolation) but slower (IPC overhead). Thread isolation is faster but weaker (shared memory, crash can affect host).

**Decision:** Process isolation for all plugins. Security and reliability outweigh the IPC overhead. Plugin calls are infrequent enough that IPC latency is negligible.

### 17.2 Permission Prompt at Install vs. Runtime

**Tradeoff:** Install-time permission prompts are convenient but may lead to "prompt fatigue" where users approve everything. Runtime prompts are safer but interrupt workflow.

**Decision:** Install-time prompts for required permissions. Runtime prompts for optional permissions that are rarely used. Pre-approval via config for CI environments.

### 17.3 Full SDK vs. Minimal SDK

**Tradeoff:** Full SDK (includes helper utilities, testing framework, type definitions) is more convenient for plugin authors but increases SDK surface area and versioning burden. Minimal SDK is easier to maintain but harder to develop with.

**Decision:** Full SDK with helper utilities and testing framework. SDK is versioned independently. Breaking changes to SDK trigger major version bumps.

### 17.4 Plugin Registry vs. Filesystem Discovery

**Tradeoff:** A plugin registry (database of installed plugins) provides querying, dependency resolution, and management but adds complexity. Filesystem discovery (scan a directory) is simpler but lacks management features.

**Decision:** Filesystem discovery for V1 (scan `plugins/node_modules/`). Plugin registry is a V2 enhancement.

### 17.5 Sandbox Strictness vs. Plugin Capability

**Tradeoff:** Strict sandboxing (blocked APIs, limited permissions) is more secure but may limit what plugins can do. Loose sandboxing enables more powerful plugins but increases risk.

**Decision:** Strict sandboxing by default with granular permission escalation. Every blocked API is replaceable with a permission-gated alternative. No plugin needs to bypass the sandbox.

---

## 18. Common Mistakes to Avoid

### 18.1 Plugins Modifying Canonical Objects

**Mistake:** A plugin adds fields to a Finding or modifies the RiskProfile, making the output non-deterministic and unreproducible without the plugin.
**Prevention:** Canonical objects are frozen. Plugins can read them but never write them. Plugin data is stored in the `metadata` field as opaque JSON.

### 18.2 Plugin Bypassing the Analysis Pipeline

**Mistake:** An extractor plugin directly emits Findings or Behaviors instead of Features, bypassing the Knowledge Layer and Rule Engine.
**Prevention:** Plugin type contracts enforce the correct output type. An extractor plugin's `extract()` return type is `ExtractionResult`, not `Finding[]`.

### 18.3 Permission Bloat

**Mistake:** A plugin requests all permissions "just in case," including network and filesystem access, when it only needs config read.
**Prevention:** Permission review at install time. Permissions are granular. "Request what you need, not what you might want."

### 18.4 Plugin Dependency Hell

**Mistake:** Plugin A depends on v1 of Plugin B, and Plugin C depends on v2 of Plugin B, causing version conflicts.
**Prevention:** Process isolation means each plugin has its own dependencies. No shared plugin runtime. Version conflicts only prevent loading.

### 18.5 Assuming Network Availability

**Mistake:** An AI consumer plugin blocks if the API endpoint is unreachable, preventing the scan from completing.
**Prevention:** AI consumers are optional enhancements. If network is unavailable or the API call fails, the plugin degrades gracefully (no AI explanation generated, scan continues).

### 18.6 Plugin Leaking Memory Across Sessions

**Mistake:** A plugin caches data in a global variable that persists across scan sessions, causing memory growth.
**Prevention:** Plugin processes are created per-scan and destroyed after the scan. No state persists between sessions unless explicitly written to the cache directory.

### 18.7 Ignoring Plugin Performance

**Mistake:** A slow plugin (e.g., 500ms per extraction call) is not noticed until users complain about scan times.
**Prevention:** Performance budgets are declared in the manifest and enforced by the host. A plugin that exceeds its declared budget is flagged in diagnostics.

### 18.8 Plugin Impersonation

**Mistake:** A malicious plugin uses the same ID as a legitimate plugin to hijack its functionality.
**Prevention:** Plugin IDs are scoped (npm-style `@scope/name`). The host checks for duplicate IDs at load time. Signature verification (V2+) prevents impersonation.

### 18.9 Configuration Leakage

**Mistake:** A plugin's configuration contains sensitive data (API keys) that are logged or exposed in diagnostics.
**Prevention:** Configuration values matching sensitive patterns (`apiKey`, `token`, `password`) are masked in logs and diagnostics.

### 18.10 Plugin Assume Core Version

**Mistake:** A plugin uses an API that was removed in the current engine version, causing a load failure.
**Prevention:** Manifest declares `minEngineVersion` and `maxEngineVersion`. The host checks compatibility before loading. SDK versioning ensures API stability.

---

## 19. Final Recommendations

### 19.1 Implementation Order

| Phase        | Components                                                  | Rationale                                      |
| ------------ | ----------------------------------------------------------- | ---------------------------------------------- |
| **Phase 1**  | Plugin manifest schema, validation pipeline                 | Foundation — needed before any plugin can load |
| **Phase 2**  | Plugin Host core (loader, lifecycle, basic sandbox)         | Core infrastructure                            |
| **Phase 3**  | Plugin SDK (`@veris/plugin-sdk`) with contracts and helpers | Published separately                           |
| **Phase 4**  | Extractor plugin type (first plugin type to ship)           | Most impactful extension point                 |
| **Phase 5**  | Rule pack plugin type                                       | Second extension point                         |
| **Phase 6**  | Configuration system (hierarchical, file-based, env-based)  | Needed by everything                           |
| **Phase 7**  | Scan profiles (quick, balanced, deep, CI)                   | Usability                                      |
| **Phase 8**  | Permission model and enforcement                            | Security                                       |
| **Phase 9**  | Renderer, AI Consumer, Exporter plugin types                | Additional extension points                    |
| **Phase 10** | Policy engine                                               | Enterprise readiness                           |
| **Phase 11** | Sandboxing and crash recovery                               | Robustness                                     |
| **Phase 12** | Diagnostics system                                          | Developer experience                           |
| **V2+**      | Panel, Theme, Policy plugin types                           | Advanced extensibility                         |

### 19.2 Critical Success Factors

1. **SDK before host.** Publish the Plugin SDK as the first deliverable. Plugin authors should be able to develop and test plugins before the host is complete (using mock host).
2. **Permission model from day one.** It's much harder to add permissions after plugins already have unrestricted access.
3. **Plugin isolation is non-negotiable.** Process isolation, memory limits, timeouts, and crash recovery are not optional. A crashing plugin must never crash the host.
4. **Configuration hierarchy must be deterministic.** Users must be able to trace exactly which config value was used and why.
5. **Policy engine is the enterprise differentiator.** The ability to define compliance gates and risk thresholds is what makes VERIS enterprise-ready.
6. **Plugin performance is monitored, not assumed.** Every plugin has a declared performance budget. The host measures and reports actual performance.

### 19.3 Architectural Invariants

```
1. The core engine is inviolable. Plugins never modify canonical objects.
2. Plugins are extensions, not modifications. Removing a plugin leaves the system unchanged.
3. Process isolation: one plugin crash never affects the host or other plugins.
4. Permission model is granular and user-approved. No blanket permissions.
5. Configuration is hierarchical and deterministic. Higher levels always override lower levels.
6. Plugin SDK is independently versioned from the engine.
7. Manifests declare capabilities, permissions, and compatibility. The host validates all three.
8. Network is optional. All plugin APIs work fully offline.
9. Plugin performance is budgeted, measured, and enforced.
10. Determinism is preserved. Plugins must not introduce non-determinism.
```

---

_End of SPEC-007. This document describes the frozen plugin SDK, configuration system, and extension architecture for VERIS V1 through V4._
