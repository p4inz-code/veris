# `@veris/plugin-sdk`

Public developer SDK for authoring **VERIS V2 Plugins**.

VERIS is an offline-first, deterministic, evidence-based security investigation and malware analysis platform. This SDK allows security engineers and analysts to extend VERIS detection capabilities with custom file parsers (Extractor Plugins) and custom declarative signatures (Rule Pack Plugins).

---

## What `@veris/plugin-sdk` Is

- A **pure, lightweight developer kit** published to npm.
- **ZERO runtime dependencies**.
- Type definitions, pure builders, constants, and contract interfaces for authoring plugins.
- Guaranteed 100% offline and standalone.

## What It Is NOT

- **Not the Plugin Host:** The SDK does NOT load, discover, or execute plugins at runtime. That is handled internally by `@veris/plugins`.
- **Not a dynamic package loader:** Third-party plugins cannot execute arbitrary pipeline middleware or hijack scanning stages.
- **Not a plugin marketplace/registry:** VERIS is a local CLI analysis tool.

---

## Supported Plugin Types in V2

| Plugin Type     | Output / Capability                                             | Execution Model                                                                 |
| :-------------- | :-------------------------------------------------------------- | :------------------------------------------------------------------------------ |
| **`extractor`** | Emits factual `PluginRawFeature[]` records.                     | Scoped in-process async (`extract()`).                                          |
| **`rule-pack`** | Supplies declarative `RulePack` AST data matching raw features. | Evaluated deterministically by `@veris/rules-engine`. **Zero executable code.** |

> [!IMPORTANT]
> Other extension points (exporters, terminal renderers, AI models, pipeline interceptors) are **explicitly deferred** post-V2 to preserve engine determinism, terminal UI stability, and offline security.

---

## Inviolable Core Invariants

1. **Deterministic Scanning:** Plugins must never inject non-determinism (`Math.random()`, unseeded UUIDs, wall-clock timestamps into feature values, or unstable iteration orders).
2. **Raw Features Only:** Extractor plugins observe facts only. Extractors **never** produce Findings, assign CVEs, or calculate Risk scores.
3. **Pure Declarative Rules:** Rule packs are data only. Imperative code, callbacks, and lambdas inside rules are strictly forbidden and rejected at build/validation time.
4. **Offline-First:** Network access and process execution are restricted and denied by default.

---

## Installation

```bash
pnpm add -D @veris/plugin-sdk
# or
npm install --save-dev @veris/plugin-sdk
```

---

## Authoring Examples

### 1. Extractor Plugin

```typescript
import {
  definePluginManifest,
  defineExtractorPlugin,
  type ExtractorPlugin,
  type PluginExtractionContext,
  type PluginRawFeature,
} from '@veris/plugin-sdk';

export const manifest = definePluginManifest({
  id: '@corp/custom-token-extractor',
  name: 'Custom Token Extractor',
  version: '1.0.0',
  description: 'Extracts proprietary security tokens from configuration files',
  author: 'Corporate Security',
  type: 'extractor',
  capabilities: ['core-types-read', 'target-read', 'custom-feature'],
});

export const extractor: ExtractorPlugin = defineExtractorPlugin({
  manifest,
  canExtract(context: PluginExtractionContext): boolean {
    return context.artifact.size > 0 && context.artifact.size < 5 * 1024 * 1024;
  },
  async extract(context: PluginExtractionContext): Promise<readonly PluginRawFeature[]> {
    if (!context.content) return [];

    const text = new TextDecoder().decode(context.content);
    const matches = text.matchAll(/CORP-SEC-[A-F0-9]{16}/g);
    const features: PluginRawFeature[] = [];

    for (const match of matches) {
      features.push({
        extractorId: manifest.id,
        type: 'corp:token',
        value: match[0],
        confidence: 0.99,
        location: { offset: match.index, length: match[0].length },
      });
    }

    return features;
  },
});
```

### 2. Declarative Rule Pack Plugin

```typescript
import { definePluginManifest, defineRulePackPlugin, type RulePlugin } from '@veris/plugin-sdk';

export const manifest = definePluginManifest({
  id: '@corp/compliance-rules',
  name: 'Corporate Compliance Rules',
  version: '1.0.0',
  description: 'Detects hardcoded corporate secrets',
  author: 'Corporate Security',
  type: 'rule-pack',
  capabilities: ['core-types-read'],
});

export const rulePackPlugin: RulePlugin = defineRulePackPlugin({
  manifest,
  rulePack: {
    id: 'corp-compliance',
    version: '1.0.0',
    description: 'Corporate compliance rules',
    metadata: {
      author: 'Corporate Security',
      tags: ['compliance', 'secrets'],
      severity: { min: 5.0, max: 9.0 },
    },
    rules: [
      {
        id: 'corp-compliance/hardcoded-token',
        packId: 'corp-compliance',
        version: '1.0.0',
        name: 'Hardcoded Corporate Token Detected',
        description: 'Detects exposed CORP-SEC tokens in plaintext files',
        severity: { level: 'high', score: 8.0 },
        taxonomyIds: ['behavior/credential/token'],
        matchLogic: {
          kind: 'single-behavior',
          behaviorTaxonomyId: 'behavior/credential/token',
          propertyMatcher: {
            path: 'value',
            operator: 'contains',
            value: 'CORP-SEC',
          },
        },
        metadata: {
          cweIds: ['CWE-798'],
          remediation: 'Remove token from source control and store in secrets manager.',
        },
      },
    ],
  },
});
```

---

## Declared Capabilities

Plugins must declare their required capabilities in the manifest. All capabilities default to denied unless granted:

- `core-types-read`: Read canonical VERIS schema definitions (safe).
- `config-read`: Read plugin configuration options (safe).
- `diagnostics-read`: Emit structured diagnostic logs (safe).
- `target-read`: Read-only access to artifact content buffers.
- `custom-feature`: Emit custom domain-specific feature types.
- `metadata-extract`: Attach structured metadata to raw features.
- `fs-write-output`: Write output artifacts to designated directories.
- `network`: Restricted. Forbidden in offline analysis.
- `process-spawn`: Dangerous. Forbidden by default.

---

## Architecture Reference

See [ADR-014: V2 Plugin Architecture Contract](../../docs/architecture/014-v2-plugin-architecture-contract.md) for full technical design details, lifecycle states, and security threat modeling.
