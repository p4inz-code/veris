# VERIS AI Explanation Layer — Implementation Plan

**Based on:** SPEC-011 (Frozen)
**Package:** `@veris/explain`
**Status:** Planning (Revised per Principal Engineer Review)
**Estimated total effort:** ~14 weeks (parallelizable)
**Estimated final package size:** ~7,000-8,500 lines of TypeScript + ~3,000 lines of tests + ~15 prompt template files

---

## 0. Prerequisites

**Every engineer must read SPEC-011 Sections 6-11 before implementation.**

| Section    | Topic                | Why It Matters                                                                    |
| ---------- | -------------------- | --------------------------------------------------------------------------------- |
| Section 6  | Public API           | All type interfaces, Citation model, Explanation, ExplainResult, ExplainedContext |
| Section 7  | Data Flow            | Token flow, pipeline order, validation pipeline sequence                          |
| Section 8  | Citation Model       | `[src:type:id]` format, 10 source types, verification rules                       |
| Section 9  | Prompt Architecture  | Template format, versioning (semver), YAML frontmatter, Handlebars engine         |
| Section 10 | Provider Abstraction | LLMProvider interface, adapter pattern, unified request format                    |
| Section 11 | Caching Strategy     | Cache key composition (6 components), schema versioning, invalidation rules       |

**Prerequisite reading is mandatory before any milestone begins.**

---

## 1. Dependency Graph

```
  M1: Foundation (types + interfaces)
   │
   ├──────────────────┬──────────────────┬──────────────────┐
   ▼                  ▼                  ▼                  ▼
  M2: @veris/ai      M3: Context        M4: Prompts        M6a: Deterministic
      Provider       (needs M1)         (needs M1)         Validation
      Impl.                                               (needs M1 types
  (needs M1)                                               only — no LLM)
   │                  │                  │
   └──────────────────┴──────────────────┘
                      │
                      ▼
                 M5: Core Engine (Explainer)
                 ── needs M2 (@veris/ai) + M3 + M4 + M6a ──
                 ── also creates audit-log & metrics ──
                      │
                      ▼
                 M6b: LLM Validation + Formatter
                 (ValidationAgent, Formatter)
                 ── needs M5 ──
                      │
                      ▼
                 M7: Caching
                 ── needs M1 types + M6b Explanation type ──
                      │
                      ▼
                 M8: Modes & Formatting
                 ── needs M6b (Formatter) ──
                      │
                      ▼
                 M9: CLI Integration
                 ── needs M5+M6b+M8 ──
                      │
                      ▼
                 M11: Documentation
                 ── needs M9 ──

  M10: Testing Suite (golden, fuzz, perf, security)
       ── needs M5+M6b ──
       ── runs in parallel with M9 ──
       ── does NOT block M11 ──
```

**Parallelizable paths:**

- M2 (@veris/ai provider implementation), M3 (Context), M4 (Prompts), M6a (Deterministic Validation) can all be built in PARALLEL after M1
- M6a depends on M1 types only — it does NOT need M2, M3, or M4
- M5 runs after M2+M3+M4+M6a all complete
- M7 can start after M1 types are stable (CacheKey), parallel with M5
- M10 can run in parallel with M9 (golden/fuzz/perf/security tests)
- M11 begins after M9 stabilizes (docs do NOT wait for M10)

**Sequencing note — M1 ↔ M2 dependency:**

- M1 defines `ExplainerOptions` and `CacheKey` interfaces that reference types from `@veris/ai` (`ProviderRegistry`, `LLMProvider`, `ProviderCapabilities`)
- M2 creates those types inside `@veris/ai`. Therefore M1's type files that depend on `@veris/ai` imports must be created AFTER M2's provider types are defined and exported.
- **Practical sequencing:** Week 1 of Phase A builds M1 types that do NOT depend on `@veris/ai` (Citation, ExplanationMode, Explained*, ExplainResult, ExplainConfig). Week 2 completes M1's `Explainer` and `CacheKey` interfaces AFTER M2 has exported provider types from `@veris/ai`.
- This does NOT change the milestone ordering — M2 can begin in Week 1 alongside M1, and M1's `@veris/ai`-dependent files are finalized in Week 2 once provider types are available.

**No dependency cycles. No hidden dependencies. Every arrow is explicit.**

---

## 2. Milestone Breakdown

---

### M1: Foundation (Types, Interfaces, Configuration)

**Objective:** Establish every type, interface, and configuration schema so that all downstream modules compile against stable contracts.

**Files to create:**

```
packages/explain/package.json
packages/explain/tsconfig.json
packages/explain/tsup.config.ts
packages/explain/README.md
packages/explain/src/index.ts
packages/explain/src/types/index.ts
packages/explain/src/types/explanation.ts
packages/explain/src/types/context.ts
packages/explain/src/types/config.ts
packages/explain/src/types/result.ts
packages/explain/src/engine/explainer.ts        # Interface only
packages/explain/src/engine/scope-manager.ts    # Interface only
packages/explain/src/engine/token-budget.ts     # Interface only
packages/explain/src/internal.ts               # Internal API surface
```

**Files to modify:** None (new package).

**Public APIs defined:**

- `interface Citation` — with `id`, `sourceType` (10-value union), `sourceId`, `label`, `verified`, `verificationError?`
- `interface CitationValidationResult` — with `valid`, `totalCitations`, `verifiedCitations`, `failedCitations`, `citations`
- `type ExplanationMode` — `"simple" | "technical" | "expert"`
- `interface Explanation` — complete explanation with citations, provider metadata, token usage, disclaimer
- `interface ExplainedFinding` — pick of canonical Finding fields (uses `SeverityLevel` from `@veris/core`)
- `interface ExplainedEvidence` — pick of canonical Evidence fields
- `interface ExplainedRule` — pick of canonical Rule fields (uses `SeverityLevel` from `@veris/core`)
- `interface ExplainedArtifact` — pick of canonical Artifact fields
- `interface ExplainedRiskProfile` — pick of canonical RiskProfile fields
- `interface ExplainedChain` — pick of canonical BehaviorChain fields
- `interface ExplainedReportSummary` — pick of report summary fields
- `type ExplainedSubject` — union of all explanation subject types
- `interface ExplainedContext` — strongly-typed context with all above types, includes `contextSchemaVersion`
- `type ExplainResult`, `interface ExplainSuccess`, `interface ExplainRefused`, `interface ExplainError`
- `interface ExplainConfig` — configuration schema
- `interface Explainer` — top-level orchestrator interface
- `interface ScopeManager` — scope determination interface
- `interface TokenBudget` — token budget interface
- `interface CacheKey` — with `promptVersion`, `modelId`, `modelVersion`, `inputHash`, `engineVersion`, **`mode: ExplanationMode`**

**Internal (non-public) types (in `internal.ts`):**

- `interface InternalRequest`, `interface InternalMessage`
- `interface RenderedPrompt`
- `ProviderConfig` type for configuration loading
- `CacheOptions` type

**Dependencies:** `@veris/core`, `@veris/ai`, `@veris/shared`, `@veris/config`, `@veris/logger` (all `workspace:*`)

**Dependencies (npm):** `handlebars` (add to `dependencies`), `better-sqlite3` (add to `optionalDependencies`)

**Acceptance criteria:**

1. All types compile with `tsc --noEmit`
2. All public types are exported from `index.ts`
3. No circular dependencies between type files
4. `ExplanationMode` accepts exactly `"simple" | "technical" | "expert"`
5. `ExplainedContext` uses no `Record<string, unknown>` — all fields are strongly typed
6. `ExplainResult` is a discriminated union (`success` | `refused` | `error`)
7. `ExplainConfig` validates correct configs and rejects invalid ones
8. All interfaces have TSDoc comments
9. `package.json` has correct `workspace:*` dependency paths (no `@veris/report`)
10. `tsconfig.json` extends `tsconfig.base.json` from monorepo root
11. `Citation.sourceType` is a string union of exactly 10 values: `finding`, `evidence`, `rule`, `behavior`, `artifact`, `chain`, `risk-dimension`, `recommendation`, `rule-prop`, `report-meta`
12. `CacheKey` includes `mode: ExplanationMode` field
13. `ExplainedContext` includes `contextSchemaVersion: string` field
14. `ExplainedFinding.severity.level` and `ExplainedRule.severity.level` use `SeverityLevel` from `@veris/core`

**Architectural invariants enforced:**

- All interface properties are `readonly`
- `CanonicalReport` is never imported as mutable — only readonly access
- No AI provider types leak into core types

**Testing requirements:**

- 8 unit tests: type instantiation, discriminated union narrowing, config validation, mode exhaustiveness, citation construction
- `pnpm test:types` — compile-time check that types are correct

**Code review checklist:**

- [ ] Every `interface` has `readonly` on all properties
- [ ] `ExplainedContext` has NO `Record<string, unknown>` fields
- [ ] `ExplainedContext` includes `contextSchemaVersion: string`
- [ ] `ExplainResult` is a discriminated union with discriminant `kind`
- [ ] All canonical model types imported as `readonly` from `@veris/core`
- [ ] No type uses `any`
- [ ] `ExplanationMode` is a string union, not `string`
- [ ] `Citation.sourceType` is a string union of exactly 10 values (matching §8.2 canonical list)
- [ ] `CacheKey` includes `mode: ExplanationMode`
- [ ] `ExplainedFinding.severity.level` and `ExplainedRule.severity.level` typed as `SeverityLevel` from `@veris/core`
- [ ] `@veris/report` is NOT in dependencies (CanonicalReport comes from @veris/core)
- [ ] All exports have TSDoc

**Expected test count:** 10-14 unit tests
**Expected files created:** 15
**Expected completion state:** `pnpm build` succeeds, `pnpm test` passes with all green, `pnpm lint` passes

**Exit criteria:** All 14 acceptance criteria pass; all 10-14 unit tests pass; `pnpm build` produces clean dist output; `pnpm lint` reports zero errors; all interfaces have TSDoc comments

---

### M2: Provider Abstraction (owned by @veris/ai, consumed by @veris/explain)

**Objective:** Implement the LLM provider interface, provider registry, and 4 adapters (OpenAI, Ollama, Anthropic, OpenAI-compatible) in `@veris/ai`. `@veris/explain` then CONSUMES these provider contracts — it never defines its own `LLMProvider` interface, registry, or adapters.

**Per SPEC-001 §3 (frozen architecture):** `@veris/ai` is the single owner of all provider contracts, adapters, transport, and model communication. This milestone implements `@veris/ai`'s provider layer.

**Files to create (in `@veris/ai`):**

```
packages/ai/src/providers/interface.ts      # LLMProvider, GenerateOptions, GenerateResult
packages/ai/src/providers/capabilities.ts   # ProviderCapabilities
packages/ai/src/providers/registry.ts       # ProviderRegistry
packages/ai/src/providers/index.ts
packages/ai/src/providers/adapters/openai.ts     # OpenAI API adapter
packages/ai/src/providers/adapters/anthropic.ts  # Anthropic API adapter
packages/ai/src/providers/adapters/ollama.ts     # Ollama adapter
packages/ai/src/providers/adapters/custom.ts     # OpenAI-compatible endpoint (LM Studio, LocalAI)
packages/ai/src/providers/adapters/mock.ts       # For testing
packages/ai/src/index.ts                    # Export all provider contracts
packages/ai/__tests__/providers/interface.test.ts
packages/ai/__tests__/providers/registry.test.ts
packages/ai/__tests__/providers/adapters/openai.test.ts
packages/ai/__tests__/providers/adapters/anthropic.test.ts
packages/ai/__tests__/providers/adapters/ollama.test.ts
packages/ai/__tests__/providers/adapters/custom.test.ts
packages/ai/__tests__/providers/adapters/mock.test.ts
```

**Files to modify:** `packages/ai/src/index.ts` (add provider exports), `packages/ai/package.json` (add `fetch`/`undici` dependency if needed)

**Public APIs (exported from `@veris/ai`):**

- `interface LLMProvider` — `generate()`, `generateStream()`, `healthCheck()`, `getCapabilities()`
- `function createProviderRegistry(providers, options?)` — factory function
- `interface ProviderRegistry` — `getActive()`, `setActive()`, `list()`, `register()`, `healthCheckAll()`, `getCapabilities()`
- `interface ProviderCapabilities` — `supportsJsonMode`, `supportsStreaming`, `supportsFunctions`, `maxContextTokens`, `maxOutputTokens`, `models`, `requiresNetwork`
- `interface GenerateOptions` — `messages`, `temperature?`, `maxTokens?`, `responseFormat?`, `abortSignal?`
- `interface GenerateResult` — `content`, `finishReason`, `usage`, `provider`, `model`

**Internal APIs:**

- `class OpenAIAdapter implements LLMProvider` — maps to OpenAI chat completions format
- `class AnthropicAdapter implements LLMProvider` — maps to Anthropic Messages API format
- `class OllamaAdapter implements LLMProvider` — maps to Ollama chat API format
- `class CustomAdapter implements LLMProvider` — generic OpenAI-compatible adapter
- `class MockAdapter implements LLMProvider` — returns configurable responses for testing

**Dependencies:** `@veris/core` (types only — `AbortSignal`), HTTP client (Node.js built-in `fetch` or `undici`)

**Acceptance criteria:**

1. `MockAdapter` returns configurable responses
2. `OpenAIAdapter` connects to OpenAI API (tested with mock HTTP server)
3. `OllamaAdapter` connects to Ollama API (tested with mock HTTP server)
4. `AnthropicAdapter` connects to Anthropic API (tested with mock HTTP server)
5. `CustomAdapter` works with configurable endpoint (tested with mock HTTP server)
6. ProviderRegistry routes to active provider
7. Fallback works when active provider returns unhealthy health check
8. Health checks correctly identify healthy/unhealthy providers
9. Provider capabilities are correctly reported
10. `generateStream()` returns `AsyncIterable` of chunks

**Architectural invariants enforced:**

- `LLMProvider` interface has zero dependencies on VERIS business logic
- No provider adapter imports from `@veris/ai` business logic (there is none — `@veris/ai` is pure transport)
- Provider adapters are stateless (state lives in ProviderRegistry)
- `@veris/explain` never defines its own provider types — it imports `LLMProvider`, `ProviderRegistry`, etc. from `@veris/ai`

**Testing requirements:**

- Mock HTTP server for each adapter (verify correct request format, handle responses)
- Health check tests (timeout, connection refused, invalid response)
- Registry tests (routing, fallback, listing)
- 100-run determinism test for mock provider (same input → same output)

**Code review checklist:**

- [ ] No business logic leaks into provider adapters
- [ ] `LLMProvider` interface is minimal — no VERIS-specific types beyond what the transport layer needs
- [ ] Adapters handle network errors gracefully (no uncaught exceptions)
- [ ] `AbortSignal` is propagated to native HTTP client
- [ ] Streaming implementation does not buffer entire response before yielding
- [ ] `responseFormat: "json"` is mapped correctly per provider
- [ ] `@veris/explain` imports provider types from `@veris/ai`, not from its own `providers/` directory
- [ ] `@veris/explain` has NO `providers/` directory

**Expected test count:** 30-40 tests
**Expected files created:** 16 (all in @veris/ai)
**Expected completion state:** M1 tests still pass, @veris/ai exports valid provider contracts, @veris/explain can import them, mock provider available for downstream milestones

**Exit criteria:** All 10 acceptance criteria pass; all 30-40 tests pass; mock HTTP server tests verify all 4 adapters; health check tests pass for timeout, connection refused, invalid response; @veris/ai exports verified; @veris/explain has no providers directory

---

### M3: Context Building

**Objective:** Implement context builders that transform a `CanonicalReport` into a strongly-typed `ExplainedContext`, with deterministic scope and token budget management.

**Files to create:**

```
packages/explain/src/context/index.ts
packages/explain/src/context/builder.ts
packages/explain/src/context/finding-context.ts
packages/explain/src/context/chain-context.ts
packages/explain/src/context/risk-context.ts
packages/explain/src/context/report-context.ts
packages/explain/__tests__/unit/context/builder.test.ts
packages/explain/__tests__/unit/context/finding-context.test.ts
packages/explain/__tests__/unit/context/chain-context.test.ts
packages/explain/__tests__/unit/context/risk-context.test.ts
packages/explain/__tests__/unit/context/report-context.test.ts
packages/explain/__tests__/fixtures/reports/simple-finding.ts
packages/explain/__tests__/fixtures/reports/multi-finding.ts
packages/explain/__tests__/fixtures/reports/edge-cases.ts
```

**Files to modify:** `packages/explain/src/engine/scope-manager.ts` (implement), `packages/explain/src/engine/token-budget.ts` (implement), `packages/explain/src/index.ts` (add context exports)

**Public APIs:**

- `function createContextBuilder()` — factory
- Context builder methods on `Explainer` (consumed by engine in M5)

**Internal modules:**

- `ScopeManager` — determines scope from `CanonicalReport`
- `TokenBudget` — allocates tokens with deterministic sort order
- `FindingContext` — builds `ExplainedFinding` + `ExplainedEvidence[]` + `ExplainedRule` + `ExplainedArtifact`
- `ChainContext` — builds `ExplainedChain` + associated findings + evidence
- `RiskContext` — builds `ExplainedRiskProfile` + dimension breakdown
- `ReportContext` — builds `ExplainedReportSummary`

**Dependencies:** M1 (types), M2 (@veris/ai provider types — for reference), `@veris/core` (canonical types), `@veris/shared` (hashing)

**Acceptance criteria:**

1. `ScopeManager.determineScope("finding", id, report)` returns correct scope (finding + evidence + rule + artifact + risk)
2. `ContextBuilder.build(scope)` returns frozen `ExplainedContext`
3. `FindingContext.build()` includes finding metadata, up to 10 evidence items (sorted by `[confidence DESC, severity DESC, path ASC, line ASC, ID ASC]`), rule definition, artifact metadata, risk contribution
4. `TokenBudget.allocate(context)` respects priority order and trim rules
5. Evidence with identical sort keys is deterministically ordered by ID ASC
6. Context never includes raw file content
7. All context objects are `readonly` (frozen with `Object.freeze()`)
8. Context is deterministic: same report + same scope → identical `ExplainedContext`
9. Chain context includes all findings in the chain with their evidence
10. Risk context includes dimension breakdown and top risk drivers

**Architectural invariants enforced:**

- `CanonicalReport` is never mutated
- `ExplainedContext` is always frozen before return
- No LLM provider types imported in context module
- Never includes raw file bytes

**Testing requirements:**

- Frozen fixture reports with known findings
- Determinism test: 100 runs produce identical context
- Edge cases: 0 evidence, 101 evidence (truncation test), null fields, NaN confidence
- Token budget tests: verify exact trim behavior with known inputs

**Code review checklist:**

- [ ] Evidence ordering follows the exact spec: confidence DESC, severity DESC, path ASC, line ASC, ID ASC
- [ ] Stable sort is used (not array.sort() alone, which is unstable in some JS engines)
- [ ] `Object.freeze()` is called on the returned context
- [ ] No `Record<string, unknown>` is used
- [ ] Raw file content is never included
- [ ] Token budget never creates negative or NaN allocations

**Expected test count:** 30-40 tests
**Expected files created:** 17
**Expected completion state:** M1+M2 tests pass, context building is deterministic and tested with edge cases

**Exit criteria:** All 10 acceptance criteria pass; all 30-40 tests pass; 100-run determinism test passes; edge cases (0 evidence, 101 evidence, null fields, NaN) all verified; `Object.freeze()` confirmed on returned context

---

### M4: Prompt System

**Objective:** Implement the Handlebars-based prompt rendering pipeline with versioned templates, template loading, and structured output schemas.

**Files to create:**

```
packages/explain/src/prompts/index.ts
packages/explain/src/prompts/registry.ts
packages/explain/src/prompts/renderer.ts
packages/explain/src/prompts/loader.ts
packages/explain/prompts/system/finding-explain-v1.txt
packages/explain/prompts/system/chain-explain-v1.txt
packages/explain/prompts/context/finding-context-v1.txt
packages/explain/prompts/context/chain-context-v1.txt
packages/explain/prompts/format/simple-format-v1.txt
packages/explain/prompts/format/technical-format-v1.txt
packages/explain/prompts/format/expert-format-v1.txt
packages/explain/prompts/format/citation-schema-v1.json
packages/explain/__tests__/unit/prompts/registry.test.ts
packages/explain/__tests__/unit/prompts/renderer.test.ts
packages/explain/__tests__/unit/prompts/loader.test.ts
```

**Files to modify:** `packages/explain/src/index.ts` (add prompt exports), `packages/explain/package.json` (add `"prompts"` files to `files` array)

**Public APIs:**

- `function createPromptRegistry(options?)` — factory
- `interface PromptRegistry` — `render()`, `listTemplates()`, `getTemplateVersion()`, `loadCustomTemplate()`
- `interface RenderedPrompt` — `systemPrompt`, `userPrompt`, `expectedCitations`, `tokenEstimate`, `version`

**Internal modules:**

- `PromptRegistry` — loads, caches, and versions prompt templates
- `PromptRenderer` — Handlebars compilation and rendering
- `PromptLoader` — loads from package assets and user config directory

**Template files (7 V1 templates):**

1. `finding-explain-system-v1.txt` — system prompt for finding explanations
2. `finding-context-v1.txt` — context injection for finding (Handlebars `{{#each}}` over evidence)
3. `chain-explain-system-v1.txt` — system prompt for chain explanations
4. `chain-context-v1.txt` — context injection for chain
5. `simple-format-v1.txt` — output format instructions for simple mode
6. `technical-format-v1.txt` — output format instructions for technical mode
7. `expert-format-v1.txt` — output format instructions for expert mode

**Dependencies:** M1 (types), `handlebars` v4.x (npm dependency)

**Acceptance criteria:**

1. All 7 templates load and render correctly with sample context
2. Template versioning works (YAML frontmatter parsing)
3. Custom templates can be loaded from a user-defined directory
4. Template validation catches: missing variables, invalid syntax, missing required sections
5. Rendering is deterministic (same context + same template → identical output)
6. `RenderedPrompt.expectedCitations` correctly lists all citation anchors in the template
7. `RenderedPrompt.tokenEstimate` is within ±10% of actual rendered length
8. `loadCustomTemplate()` rejects paths outside configured template directory
9. Template versioning follows SPEC-011 Section 9.3 — semver format `MAJOR.MINOR.PATCH`, version stored in YAML frontmatter
10. Template version is included in cache key generation (cache key component `prompt_version`)
11. Template version is logged in audit trail
12. Prompt compatibility validation: template variables match `ExplainedContext` fields (missing variables are caught, unknown variables are warned)
13. YAML frontmatter is parsed correctly with `js-yaml` — `id`, `version`, `type`, `description`, `changed` fields

**Architectural invariants enforced:**

- Templates are loaded as immutable strings (never modified at runtime)
- `PromptLoader` never evaluates template content as code
- Template files are version-controlled (prompts as code)
- No prompt template imports business logic from VERIS

**Testing requirements:**

- Template rendering with sample `ExplainedContext` (verify output structure)
- Frontmatter parsing (version, id, type fields)
- Missing variable handling (should render empty string, not crash)
- `{{#each evidence}}` with 0, 1, and 10 evidence items
- Custom template loading with path traversal protection
- Token estimation accuracy tests

**Code review checklist:**

- [ ] Handlebars is used, not custom template parsing
- [ ] YAML frontmatter is parsed correctly (use `js-yaml` or similar)
- [ ] Template content is never sent to providers (only rendered prompt)
- [ ] Path traversal attempts in `loadCustomTemplate()` are rejected
- [ ] Template cache is invalidated when templates change
- [ ] All template files have YAML frontmatter with `id` and `version`

**Expected test count:** 20-25 tests
**Expected files created:** 19 (7 templates + 5 source files + 3 test files + index + internal + registry + renderer + loader)
**Expected completion state:** All templates load, render, and version correctly; M1+M2+M3 tests still pass

**Exit criteria:** All 13 acceptance criteria pass; all 20-25 tests pass; all 7 V1 templates load and render correctly; YAML frontmatter parsing confirmed; template version included in cache key output; path traversal protection confirmed

---

### M6a: Deterministic Validation (StructuralValidator + CitationVerifier + NullEvidenceRefusal + InputFilter + OutputFilter)

**Objective:** Implement the deterministic steps of the output validation pipeline. These steps run BEFORE the Core Engine (M5) so that M5 can validate output immediately after the LLM responds. No LLM is involved in any M6a step.

**Files to create:**

```
packages/explain/src/output/index.ts
packages/explain/src/output/structural-validator.ts
packages/explain/src/output/citation-verifier.ts
packages/explain/src/output/null-evidence-refusal.ts
packages/explain/src/output/guardrails/index.ts
packages/explain/src/output/guardrails/input-filter.ts
packages/explain/src/output/guardrails/output-filter.ts
packages/explain/__tests__/unit/output/structural-validator.test.ts
packages/explain/__tests__/unit/output/citation-verifier.test.ts
packages/explain/__tests__/unit/output/null-evidence-refusal.test.ts
packages/explain/__tests__/unit/output/guardrails/input-filter.test.ts
packages/explain/__tests__/unit/output/guardrails/output-filter.test.ts
```

**Files to modify:** `packages/explain/src/index.ts` (add deterministic validation exports)

**Internal modules:**

- `StructuralValidator` — deterministic: validates JSON schema, field presence, citation ID matching
- `CitationVerifier` — deterministic: extracts `[src:type:id]` markers, resolves against context, checks type match, validates structural claim consistency
- `NullEvidenceRefusal` — deterministic+heuristic: cross-references cited IDs against context object ID set, detects fabrication patterns, replaces fabricated content with refusal message
- `InputFilter` — deterministic: strips control chars, Unicode bidirectional overrides, zero-width characters, Handlebars syntax `{{` / `}}`
- `OutputFilter` — deterministic: enforces schema, max output length, detects off-topic content

**Validation pipeline order in M6a:**

```
LLM response received
       │
       ▼
1. StructuralValidator (deterministic — always runs)
   • Parse JSON, validate schema, check field presence
       │
       ├── Schema invalid → return StructuralValidationFailed
       │
       ▼
2. CitationVerifier (deterministic — always runs)
   • Extract citations, resolve IDs, check structural consistency
       │
       ├── Citations invalid → mark as failed, return CitationValidationWarning
       │
       ▼
3. NullEvidenceRefusal (deterministic + heuristics — always runs)
   • Cross-reference cited IDs, detect fabrication patterns
       │
       ├── Fabrication detected → return NullEvidenceRefusal result
       │
       ▼
4. InputFilter + OutputFilter (deterministic — always runs)
   • Sanitize input before LLM, validate output after LLM
       │
       ▼
5. Return to M5 orchestrator with validation result
```

**Dependencies:** M1 (types for Citation, ExplainedContext, Explanation) **only** — does NOT depend on M2, M3, or M4

**Acceptance criteria:**

1. `CitationVerifier` correctly validates existing citations and rejects non-existent ones
2. `CitationVerifier` validates type match (e.g., `sourceType: "evidence"` vs. actual object type)
3. `StructuralValidator` catches: missing required fields, citation ID mismatch, schema violations
4. `NullEvidenceRefusal` correctly identifies fabricated evidence IDs
5. `NullEvidenceRefusal` replaces fabricated content with refusal message
6. `InputFilter` strips: control characters, bidirectional overrides, zero-width chars, `{{` / `}}`
7. `OutputFilter` enforces: max output length, schema conformance, off-topic detection
8. All deterministic steps complete in < 5ms total for typical response
9. All steps have ZERO dependencies on any LLM provider
10. Error codes are consistent with M5's expected format

**Architectural invariants enforced:**

- ALL steps are PURELY DETERMINISTIC — no LLM provider is ever called
- CitationVerifier uses strongly-typed field access (never `Record<string, unknown>`)
- NullEvidenceRefusal uses deterministic matching FIRST, pattern heuristics SECOND
- InputFilter escapes Handlebars syntax in evidence content BEFORE it reaches the prompt renderer

**Testing requirements:**

- Citation verification: 5 scenarios (all valid, one invalid, all invalid, fabricated ID, no citations)
- Null-evidence: 3 scenarios (fabrication detected, correct refusal, false positive avoidance)
- Structural validation: 4 scenarios (valid JSON, missing field, citation ID mismatch, length violation)
- Input filter: 4 scenarios (control chars, unicode overrides, template injection, normal input)
- Output filter: 3 scenarios (valid, too long, off-topic)
- 100-run determinism test for EVERY deterministic component

**Code review checklist:**

- [ ] Zero dependencies on any LLM provider
- [ ] `InputFilter` escapes Handlebars syntax before it reaches the renderer
- [ ] `NullEvidenceRefusal` uses deterministic matching first, heuristics second
- [ ] CitationVerifier uses strongly-typed field access, not `Record<string, unknown>`
- [ ] No `try/catch` swallows validation errors without logging

**Expected test count:** 25-30 tests
**Expected files created:** 12
**Expected completion state:** M1-M4 tests pass; deterministic validation is correct and testable

**Exit criteria:** All 10 acceptance criteria pass; all 25-30 tests pass; 100-run determinism test for EVERY deterministic component; all 5 citation scenarios verified; all 3 null-evidence scenarios verified; all 4 structural validation scenarios verified; all steps complete in < 5ms

---

### M5: Core Engine (Explainer Orchestrator + Audit Logging)

**Objective:** Implement the `Explainer` orchestrator that ties together ScopeManager, ContextBuilder, PromptRegistry, ProviderRegistry, M6a deterministic validation, and the audit logging infrastructure. This is the central nervous system of the package.

**Files to create:**

```
packages/explain/src/engine/index.ts
packages/explain/src/engine/explainer-impl.ts     # Explainer implementation
packages/explain/src/logging/audit-log.ts         # Append-only audit log
packages/explain/src/logging/metrics.ts           # Token usage, latency, cache hit rate
packages/explain/src/logging/index.ts
packages/explain/__tests__/unit/engine/explainer.test.ts
packages/explain/__tests__/unit/logging/audit-log.test.ts
packages/explain/__tests__/unit/logging/metrics.test.ts
packages/explain/__tests__/integration/full-pipeline.test.ts
```

**Files to modify:**

- `packages/explain/src/index.ts` (add `createExplainer` export)
- `packages/explain/src/engine/explainer.ts` (was interface only — now add implementation reference)

**Public APIs:**

- `function createExplainer(options: ExplainerOptions): Explainer` (already defined in M1, now implemented)
- `Explainer.explainFinding()` — full flow: cache check → scope → context → prompt → provider → output pipeline
- `Explainer.explainChain()` — same flow for behavior chains
- `Explainer.explainRiskDimension()` — same flow for risk dimensions
- `Explainer.summarizeReport()` — same flow for full report
- `Explainer.clearCacheForReport()` — cache invalidation

**Internal modules:**

- `ExplainerImpl` — orchestrator that coordinates M1-M4+M6a modules
- `AuditLog` — append-only audit trail written to `~/.veris/logs/ai-audit.jsonl` with 0600 permissions
- `Metrics` — aggregated token usage, latency, cache hit rate per provider
- Error handling: provider failure → `ExplainError`, citation failure → `ExplainError` or retry, partial failure → caveat

**Dependencies:** M2 (@veris/ai provider contracts), M3 (context), M4 (prompts), M6a (deterministic validation), M7 (cache — MockProvider or in-memory for testing)

**Acceptance criteria:**

1. Full pipeline works: scope → context → prompt → provider → output
2. Cache is checked before provider (cache hit returns immediately)
3. Provider failure produces `ExplainError` (not a crash)
4. Citation failure triggers retry (up to `maxRetriesOnFailure`)
5. All provider failures are logged to audit log
6. All 3 explanation modes produce structured output
7. `explainFinding()` returns `ExplainSuccess` with valid `Explanation`
8. `explainChain()` returns `ExplainSuccess` with chain explanation
9. `summarizeReport()` returns `ExplainSuccess` with report summary
10. Error codes are meaningful: `PROVIDER_UNAVAILABLE`, `CITATION_FAILURE`, `TIMEOUT`, `INVALID_RESPONSE`
11. Audit log is append-only — entries are never modified after write
12. Audit log file is created with `0600` permissions (owner read/write only)
13. Audit log format is deterministic — same request always produces identical log entry
14. Every provider failure is logged with: timestamp, provider ID, model, error code, duration
15. Log-before-return invariant is enforced — audit log is written before function returns

**Architectural invariants enforced:**

- `CanonicalReport` is never modified
- Output is always validated via M6a before delivery
- Cache-before-provider is always respected
- Log-before-return is always respected
- No temporary APIs or stubs

**Testing requirements:**

- Happy path: mock provider returns valid response → `ExplainSuccess`
- Provider failure: mock provider throws → `ExplainError`
- Citation failure: mock returns invalid citations → retry or `ExplainError`
- Timeout: mock provider delays → retry then `ExplainError`
- Cache hit: cached explanation returned without calling provider
- All 4 explanation methods tested with mock provider
- Audit log: append-only integrity, 0600 permissions, format determinism
- Metrics: token counting, latency recording

**Code review checklist:**

- [ ] Cache check happens BEFORE provider call
- [ ] Audit log write happens BEFORE function returns
- [ ] Error recovery paths are tested (retry, fallback, caveat)
- [ ] No `try/catch` swallows errors without logging
- [ ] `AbortSignal` is propagated through the entire pipeline
- [ ] The pipeline order matches Section 7.1 of SPEC-011

**Expected test count:** 28-35 tests
**Expected files created:** 9
**Expected completion state:** Full pipeline works end-to-end with mock provider; M1-M4+M6a tests still pass

**Exit criteria:** All 15 acceptance criteria pass; all 28-35 tests pass; audit log confirmed append-only with 0600 permissions; log-before-return invariant verified; provider failure produces `ExplainError` with correct codes; cache-before-provider verified

---

### M6b: LLM Validation + Formatter (ValidationAgent + Formatter)

**Objective:** Implement the optional LLM-based semantic validation and the deterministic output formatter. Runs AFTER the Core Engine (M5). The optional ValidationAgent does NOT block explanation delivery.

**Files to create:**

```
packages/explain/src/output/validation-agent.ts
packages/explain/src/output/formatter.ts
packages/explain/__tests__/unit/output/validation-agent.test.ts
packages/explain/__tests__/unit/output/formatter.test.ts
```

**Files to modify:**

- `packages/explain/src/output/index.ts` (add formatter and validation-agent exports)
- `packages/explain/src/index.ts` (add M6b exports)

**Internal modules:**

- `ValidationAgent` — OPTIONAL LLM-as-judge: splits output into atomic factual claims, scores each as `supported` / `contradicted` / `unsupported` / `refused`
- `Formatter` — deterministic: formats validated output at simple/technical/expert levels

**Dependencies:** M5 (engine — provides Explanation type with validated citations), M1 (types)

**Acceptance criteria:**

1. `Formatter` produces correct Markdown for all 3 explanation modes
2. `ValidationAgent` (optional) produces `supported` / `contradicted` / `unsupported` scores
3. When `ValidationAgent` is unavailable, explanation proceeds with caveat ("claims not semantically verified")
4. `ValidationAgent` NEVER blocks explanation delivery
5. `ValidationAgent` uses a DIFFERENT model/prompt than the primary explanation generator
6. `Formatter` enforces mode-specific structural rules (sentence count, paragraph count)
7. All formatting is deterministic (same input → same output)
8. Mode switching does NOT re-query the LLM

**Architectural invariants enforced:**

- `ValidationAgent` is OPTIONAL and NEITHER blocks nor modifies the explanation
- No LLM is the sole gatekeeper — deterministic M6a steps are always sufficient
- `Formatter` is PURELY DETERMINISTIC — no LLM involved

**Testing requirements:**

- Formatter: 3 modes × 2 input variations = 6 scenarios
- ValidationAgent: 4 scenarios (faithful, contradicted, unsupported, refused)
- Consistency: same input across all 3 modes produces same citation set
- Edge case: empty evidence list produces valid output across all modes
- 100-run determinism test for Formatter

**Code review checklist:**

- [ ] `ValidationAgent` never blocks explanation delivery
- [ ] Formatter produces valid Markdown (checked with a Markdown parser in tests)
- [ ] `ValidationAgent` scores claims against context, not against arbitrary knowledge
- [ ] Formatter enforces mode-specific structural rules

**Expected test count:** 15-20 tests
**Expected files created:** 4
**Expected completion state:** M1-M5+M6a tests pass; formatter and ValidationAgent produce correct output

**Exit criteria:** All 8 acceptance criteria pass; all 15-20 tests pass; formatter produces valid Markdown for all 3 modes; ValidationAgent produces correct scores without blocking; empty evidence list handled correctly across all modes

---

### M7: Caching

**Objective:** Implement the SQLite-backed persistent cache with deterministic key generation, schema versioning, TTL-based expiration, LRU eviction, and migration strategy.

**Files to create:**

```
packages/explain/src/cache/index.ts
packages/explain/src/cache/cache-key.ts
packages/explain/src/cache/persistent-cache.ts
packages/explain/__tests__/unit/cache/cache-key.test.ts
packages/explain/__tests__/unit/cache/persistent-cache.test.ts
```

**Files to modify:** `packages/explain/src/index.ts` (add cache factory exports)

**Public APIs:**

- `function createPersistentCache(options: CacheOptions): PersistentCache`
- `interface PersistentCache` — `get()`, `set()`, `has()`, `invalidate()`, `getStats()`, `clear()`
- `interface CacheKey` — `promptVersion`, `modelId`, `modelVersion`, `inputHash`, `engineVersion`
- `interface CacheOptions` — `maxSizeMb`, `defaultTtlMs`, `dbPath`, `schemaVersion`

**Internal modules:**

- `CacheKeyGenerator` — generates SHA-256 cache keys from 6 components
- `PersistentCache` — SQLite-backed storage with in-memory fallback
- LRU eviction — removes oldest entries when cache exceeds `maxSizeMb`
- Schema migration — re-validates entries on version mismatch

**Dependencies:** M1 (CacheKey type — includes `mode: ExplanationMode`), `better-sqlite3` (optional)

**Acceptance criteria:**

1. Cache keys are deterministic (same inputs produce identical keys)
2. `CacheKey` type includes `mode: ExplanationMode` — different modes produce different cache keys
3. Cache hit returns stored `Explanation` without calling provider
4. Cache miss generates new explanation and stores it
5. Cache invalidation works: by prompt version, by model, by report, by age, by mode
6. LRU eviction respects `maxSizeMb`
7. Schema version mismatch invalidates incompatible entries
8. TTL expiration removes stale entries on read
9. SQLite failure falls back to in-memory Map gracefully
10. Refused explanations are cached (don't re-query for same input)
11. Cache schema includes `schema_version` column per SPEC-011 Section 11.3
12. Cache schema includes `mode TEXT NOT NULL` column
13. Schema migration strategy is implemented: entries with `stored.schema_version < engine.schema_version` are re-validated on read; entries with `stored.schema_version > engine.schema_version` are invalidated
14. Rollback strategy: when engine version is downgraded, entries from the newer engine version are invalidated on read; cache can be fully cleared with `clear()`
15. Cache invalidation by report is implemented: `invalidate({ reportId })` clears all entries for a specific report
16. Cache invalidation by prompt version is implemented: `invalidate({ promptVersion })` clears entries using old prompt versions
17. Cache compatibility tests verify: schema migration from v0→v1, v1→v2, v2→v0 (downgrade), concurrent access, file corruption recovery

**Architectural invariants enforced:**

- Cache keys NEVER include runtime state (timestamps, session IDs)
- Cache is CRYPTOGRAPHICALLY KEYED (SHA-256) — tampering produces cache miss
- Cache always returns immutable objects (deep-frozen `Explanation`)
- Cache hit before provider call (enforced by Explainer, but cache is independently testable)

**Testing requirements:**

- Key determinism: 100 runs with same input → same key
- Key uniqueness: different inputs → different keys
- Invalidation: verify all invalidation scenarios from SPEC-011 Section 11.2
- LRU eviction: exceed maxSize → oldest entries removed, newest preserved
- Schema migration: entry with schema_version < current is upgraded or invalidated
- Concurrent access: multiple reads/writes to same database
- Graceful SQLite failure: verify fallback to in-memory cache
- Compatibility: v0→v1, v1→v2 upgrade, v2→v0 downgrade

**Code review checklist:**

- [ ] SHA-256 is used (not MD5, not SHA-1)
- [ ] Cache keys include ALL 6 components from SPEC-011 Section 11.1
- [ ] Cache schema has `schema_version` column
- [ ] LRU eviction uses SQL query (ORDER BY created_at), not in-memory sort
- [ ] Fallback cache is tested when SQLite is unavailable
- [ ] Cache returns deep-frozen `Explanation` objects

**Expected test count:** 20-25 tests
**Expected files created:** 5
**Expected completion state:** Cache is fully functional and integrated with Explainer; M1-M6b tests pass

**Exit criteria:** All 15 acceptance criteria pass; all 20-25 tests pass; schema migration tests pass (v0→v1, v1→v2, v2→v0 downgrade); rollback strategy verified; invalidation by all criteria tested; SQLite failure falls back to in-memory cache

---

### M8: Modes & Formatting

**Objective:** Implement the 3 explanation mode formatters within `output/formatter.ts`. Modes are configuration objects, not separate modules.

**Files to create:** None (everything lives in `output/formatter.ts` which was created in M6b).

**Files to modify:**

- `packages/explain/src/output/formatter.ts` (add mode definitions)
- `packages/explain/__tests__/unit/output/formatter.test.ts` (add mode-specific tests)

**Internal modules (within `formatter.ts`):**

- `SimpleMode` — configuration: `{ maxSentences: 5, citationsPerClaim: 1, noTechnicalJargon: true }`
- `TechnicalMode` — configuration: `{ maxParagraphs: 3, citationsPerClaim: "all", showSeverity: true }`
- `ExpertMode` — configuration: `{ maxParagraphs: 5, showTraceability: true, showConfidence: true, showSourceLocations: true }`

**Dependencies:** M6b (output pipeline, specifically the Formatter)

**Acceptance criteria:**

1. Simple mode produces ≤ 5 sentences with ≥ 1 citation per claim, no technical jargon
2. Technical mode produces 1-3 paragraphs with all citations visible, severity labels
3. Expert mode produces 3-5 paragraphs with complete traceability chain, confidence breakdown, source locations
4. Each mode produces valid Markdown
5. Mode switching is purely cosmetic — same evidence, same citations, different presentation
6. Modes are configuration objects passed to `Formatter`, not separate classes

**Architectural invariants enforced:**

- Mode configuration NEVER changes the evidence, citations, or structural content
- Modes only affect PRESENTATION (paragraph count, detail level, jargon)
- No mode re-queries the LLM

**Testing requirements:**

- Each mode: verify output structure (sentence count, paragraph count, citation count)
- Consistency: same input across all 3 modes produces same citation set
- Edge case: empty evidence list produces valid output across all modes

**Code review checklist:**

- [ ] Modes are configuration objects, not classes with inheritance
- [ ] Mode switching does not re-query the LLM
- [ ] All 3 modes produce valid Markdown
- [ ] Technical terms in simple mode are flagged (test catches this)

**Expected test count:** 10-12 tests (added to existing formatter tests)
**Expected files created:** 0
**Expected completion state:** M1-M7 tests pass; all 3 modes produce correct output

**Exit criteria:** All 6 acceptance criteria pass; all 10-12 tests pass; mode switching confirmed cosmetic-only (same citations across all modes); simple mode ≤ 5 sentences; expert mode includes full traceability

---

### M9: CLI Integration

**Objective:** Integrate `@veris/explain` into `@veris/cli` with `veris explain` and `veris summarize` commands, and add TUI components for AI explanations.

**Files to create:**

```
packages/cli/src/commands/explain.ts          # veris explain command
packages/cli/src/commands/summarize.ts        # veris summarize command
packages/renderers/src/components/explain-panel.tsx  # AI explanation panel (TUI)
packages/renderers/src/components/explain-button.tsx # Explain button on finding detail
packages/renderers/src/components/citation-link.tsx  # Clickable citation navigation
packages/cli/__tests__/commands/explain.test.ts
packages/cli/__tests__/commands/summarize.test.ts
```

**Files to modify:**

- `packages/cli/src/index.ts` (register explain and summarize commands)
- `packages/renderers/src/index.ts` (export new components)

**Dependencies:** M5 (engine), M6b (output pipeline), M8 (modes), `@veris/cli`, `@veris/renderers`

**Acceptance criteria:**

1. `veris explain <finding-id>` produces explanation in terminal
2. `veris explain <finding-id> --mode=technical` produces technical explanation
3. `veris explain chain <chain-id>` produces chain explanation
4. `veris summarize` produces report summary
5. `veris explain --json` outputs JSON (for programmatic use)
6. `veris explain --no-audit` disables audit logging for this explanation
7. TUI "Explain" button generates and displays explanation inline
8. TUI mode toggle switches between Simple / Technical / Expert
9. TUI citation drill-down navigates to source finding/evidence
10. TUI gracefully handles unavailable provider with clear error message
11. TUI shows provider status indicator (connected/disconnected/error)
12. TUI shows explain button when provider configured, disabled state when no provider configured

**Testing requirements:**

- CLI command parsing (flags, arguments, error messages)
- `--no-audit` flag: verify audit log is not written when flag is set
- JSON output mode (verify `ExplainResult` serialization)
- TUI component rendering (snapshot tests for explain panel, button, citation link)
- Mode toggle unit test: verify Simple/Technical/Expert switching changes display correctly
- Provider status indicator: verify connected/disconnected/error states render correctly
- Citation drill-down: verify clicking a citation navigates to the correct source object
- `veris explain risk <dimension-id>`: verify risk dimension explanation output
- Keyboard navigation: verify Tab/Enter/Escape flow through explanation panels
- Error states: verify rendering of all `ExplainResult` variants (success, refused, error)

**Code review checklist:**

- [ ] CLI commands use `ExplainResult` directly — no additional transformation
- [ ] TUI components consume `Explanation` directly — no reformatting
- [ ] JSON output uses the same serialization as the public API
- [ ] Error states are tested (no provider, provider down, citation failure)
- [ ] `--no-audit` flag correctly suppresses audit log write
- [ ] Audit log check is performed BEFORE any provider call (no audit leak on fast path)

**Expected test count:** 20-25 tests
**Expected files created:** 7
**Expected completion state:** Full CLI integration, M1-M8 tests pass

**Exit criteria:** All 12 acceptance criteria pass; all 25-30 tests pass; all CLI commands (`explain`, `explain --mode`, `explain chain`, `summarize`, `explain risk`, `--json`, `--no-audit`) produce correct output; TUI mode toggle, citation drill-down, provider status indicator all functional; error states render correctly

---

### M10: Testing Suite

**Objective:** Build the complete testing infrastructure: golden tests, fuzz testing, performance benchmarks, security tests, and provider integration tests.

**Files to create:**

```
packages/explain/__tests__/golden/finding-explain-simple/snap1.json
packages/explain/__tests__/golden/finding-explain-technical/snap1.json
packages/explain/__tests__/golden/finding-explain-expert/snap1.json
packages/explain/__tests__/golden/chain-explain/snap1.json
packages/explain/__tests__/golden/risk-explain/snap1.json
packages/explain/__tests__/golden/report-summary/snap1.json
packages/explain/__tests__/fuzz/context-builder-fuzz.test.ts
packages/explain/__tests__/performance/benchmarks.test.ts
packages/explain/__tests__/security/prompt-injection.test.ts
packages/explain/__tests__/security/cache-integrity.test.ts
packages/explain/__tests__/security/audit-integrity.test.ts
packages/explain/__tests__/determinism/determinism.test.ts
```

**Files to modify:**

- `packages/explain/package.json` (add test scripts: `test:golden`, `test:fuzz`, `test:perf`, `test:security`)
- `packages/explain/tsup.config.ts` (add test entry points if needed)

**Test categories:**

1. **Golden tests** (6 snapshot files, 6 test runners):
   - Frozen `CanonicalReport` fixtures + mock provider = deterministic output
   - Snapshot comparison on every test run
   - Commands: `pnpm test:golden`, `pnpm golden:update`, `pnpm golden:compare`

2. **Fuzz tests** (1 test file, ~1,000 iterations):
   - Random permutations of canonical reports
   - Verify no crashes, no NaN values, no negative allocations

3. **Performance benchmarks** (1 test file):
   - Context build time: < 5ms for 1 finding, < 50ms for 100 findings
   - Prompt rendering: < 2ms
   - Cache key generation: < 1ms
   - Citation verification: < 2ms
   - NullEvidenceRefusal: < 2ms
   - StructuralValidator: < 1ms
   - InputFilter: < 1ms
   - OutputFilter: < 1ms
   - Full pipeline with mock provider: < 100ms
   - Cache lookup (SQLite hit): < 5ms
   - Cache lookup (in-memory hit): < 1ms

4. **Security tests** (3 test files):
   - Prompt injection: evidence isolation, sanitization, output validation
   - Cache integrity: tampered cache files produce cache misses
   - Audit integrity: append-only checks, permission enforcement

5. **Provider integration tests** (release-only):
   - OpenAI adapter against real API (requires API key)
   - Ollama adapter against localhost:11434 (if available)
   - These run manually, not in CI

6. **Determinism tests** (1 test file):
   - 100-run test for context building, token budget, evidence ordering
   - Verify stable sort across all iterations

**Dependencies:** M5 (engine), M6b (output pipeline)

**Acceptance criteria:**

1. All golden tests pass with mock provider
2. Fuzz tests complete 1,000 iterations without failure
3. All benchmarks meet their targets
4. Security tests pass (injection detection, cache integrity, audit integrity)
5. Determinism tests pass across 100 runs
6. All test scripts are documented in `package.json`

**Expected test count:** ~40-50 tests across all categories
**Expected files created:** 12
**Expected completion state:** Complete test suite with CI integration; M1-M9 tests still pass

**Exit criteria:** All 6 acceptance criteria pass; all 40-50 tests pass across all 5 categories; golden tests match all 6 snapshot files; fuzz tests complete 1,000 iterations; all benchmarks meet targets; security tests pass; determinism tests pass across 100 runs

---

### M11: Documentation

**Files to create:**

```
packages/explain/docs/user-guide.md
packages/explain/docs/configuration.md
packages/explain/docs/prompt-authoring.md
```

**Files to modify:** `packages/explain/README.md` (add usage examples, API reference)

**Dependencies:** M9 (CLI integration — does NOT wait for M10)

**Acceptance criteria:**

1. User guide explains: setup, configuration, CLI commands, explanation modes
2. Configuration reference covers: all `ExplainConfig` fields, provider setup, cache settings
3. Prompt authoring guide includes: template format, variable reference, versioning, example
4. All public exports have complete TSDoc comments

**Expected test count:** 0 (documentation only)
**Expected files created:** 3
**Expected completion state:** Complete documentation, M1-M9 tests pass

**Exit criteria:** All 4 acceptance criteria pass; user guide covers setup, configuration, CLI commands, explanation modes; configuration reference covers all `ExplainConfig` fields; prompt authoring guide covers template format, variable reference, versioning; all public exports have complete TSDoc

---

## 3. Recommended Implementation Order

**Phase A (Parallelizable — weeks 1-4):**

```
Week 1-2:   M1 Foundation
Week 2-4:   M2 @veris/ai Provider Impl ── M3 Context ── M4 Prompts ── M6a Det. Validation (all parallel after M1)
```

**Phase B (Sequential — weeks 3-10):**

```
Week 3-4:   M6a Deterministic Validation (needs M1 types only — parallel with M2/M3/M4)
Week 4-6:   M5 Core Engine + Audit Logging (needs M2+M3+M4+M6a)
Week 6-8:   M6b LLM Validation + Formatter (needs M5)
Week 8-9:   M7 Caching (needs M1 types + M6b; starts after M6b stabilizes)
Week 9-10:  M8 Modes & Formatting (needs M6b)
```

**Phase C (Parallel — weeks 8-14):**

```
Week 8-10:  M9 CLI Integration (needs M5+M6b+M8)
Week 10-12: M10 Testing Suite (needs M5+M6b, parallel with M9)
Week 12-14: M11 Documentation (needs M9 — does NOT wait for M10)
```

**Total elapsed time:** ~14 weeks with parallelization (vs. 18 weeks sequential)

---

## 4. Estimated File and Test Counts

| Milestone                       | Files Created | Files Modified | Tests Added | Source Lines (est.) |
| ------------------------------- | ------------- | -------------- | ----------- | ------------------- |
| M1: Foundation                  | 15            | 0              | 10-14       | ~1,200              |
| M2: @veris/ai Provider Impl     | 16            | 2              | 30-40       | ~1,500              |
| M3: Context                     | 17            | 3              | 30-40       | ~1,400              |
| M4: Prompts                     | 19            | 2              | 20-25       | ~1,000              |
| M6a: Deterministic Validation   | 12            | 1              | 25-30       | ~1,200              |
| M5: Engine + Logging            | 9             | 2              | 28-35       | ~900                |
| M6b: LLM Validation + Formatter | 4             | 2              | 15-20       | ~800                |
| M7: Caching                     | 5             | 1              | 20-25       | ~600                |
| M8: Modes & Formatting          | 0             | 2              | 10-12       | ~200                |
| M9: CLI Integration             | 7             | 2              | 25-30       | ~800                |
| M10: Testing Suite              | 12            | 2              | 40-50       | ~600                |
| M11: Documentation              | 3             | 1              | 0           | ~200                |
| **Total**                       | **119**       | **20**         | **263-351** | **~10,400**         |

---

## 5. Risks Before Implementation

| Risk                                                                                  | Probability | Impact                              | Affected Milestones | Mitigation                                                                              |
| ------------------------------------------------------------------------------------- | ----------- | ----------------------------------- | ------------------- | --------------------------------------------------------------------------------------- |
| **LLM provider API changes** (OpenAI deprecates chat completions endpoint)            | Low         | High — adapter breaks               | M2 (@veris/ai)      | Abstracted interface in @veris/ai; fix isolated to one adapter                          |
| **Handlebars template complexity** (nested `#each` with `ExplainedContext` structure) | Medium      | Medium — templates hard to maintain | M4                  | Context pre-processing in PromptRenderer decouples Handlebars from TS types             |
| **ValidationAgent LLM-as-judge reliability** (false positives create user distrust)   | Medium      | High — user trust                   | M6b                 | ValidationAgent is OPTIONAL and NEVER blocks delivery                                   |
| **SQLite native compilation** (better-sqlite3 platform compatibility)                 | Medium      | Low — fallback exists               | M7                  | In-memory fallback cache when SQLite unavailable                                        |
| **Large evidence sets** (finding with 1,000+ evidence items)                          | Low         | Medium — memory pressure            | M3, M5              | ScopeManager limits to 10 evidence items; token budget enforces truncation              |
| **Prompt injection bypass** (evasion of InputFilter patterns)                         | Low         | High — LLM compromised              | M6a, M6b            | Defense-in-depth (6 layers per SPEC-011 Section 8.5); single layer failure is contained |
| **M6a→M5 dependency ordering** (M5 cannot validate output without M6a)                | Low         | High — blocks M5 completion         | M5, M6a             | M6a runs BEFORE M5; dependency graph explicitly enforces this                           |
| **M5 missing audit logging** (engine created without logging infrastructure)          | Low         | Medium — audit gaps                 | M5                  | Audit logging is BUILT INTO M5, not a separate milestone                                |
| **Cache schema migration failure** (schema mismatch causes data loss)                 | Low         | Medium — cache invalidation         | M7                  | Schema version column, migration strategy, compatibility tests                          |
| **Cross-package interface drift** (@veris/cli types diverge from @veris/explain)      | Medium      | High — integration failures         | M9                  | Shared type contracts from M1; integration tests in M9                                  |

---

## 6. Things That Must NEVER Be Refactored During Implementation

1. **IE1-IE8 invariants** — AI is read-only, never modifies canonical objects
2. **`ExplainedContext` strongly-typed interfaces** — never revert to `Record<string, unknown>`
3. **Deterministic validation pipeline order** — StructuralValidator → CitationVerifier → NullEvidenceRefusal (always M6a deterministic first)
4. **Cache key composition** — `promptVersion:modelId:modelVersion:inputHash:engineVersion:mode` (6 components)
5. **Evidence ordering** — `confidence DESC, severity DESC, path ASC, line ASC, ID ASC`
6. **Provider adapter interface** — `LLMProvider` with `generate()`, `generateStream()`, `healthCheck()`, `getCapabilities()` (owned by `@veris/ai`, consumed by `@veris/explain`)
7. **Citation format** — `[src:type:id]` (machine-parseable, structured)
8. **`ExplanationMode`** — `"simple" | "technical" | "expert"` (exactly 3 values)
9. **`ExplainResult`** — discriminated union with `kind: "success" | "refused" | "error"`
10. **Default: No provider configured** — AI is always opt-in

---

## 7. Rollback Strategy

### 7.1 When Rollback Is Needed

| Scenario                           | Trigger                                     | Rollback Action                                                   |
| ---------------------------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| **M2 provider adapter regression** | Tests fail after adapter change             | Revert adapter file; re-run M2 tests                              |
| **M3 context builder change**      | Context output differs from golden snapshot | Revert context builder; re-run determinism tests                  |
| **M4 prompt template change**      | Prompt output differs from expected         | Revert template file; re-run golden tests                         |
| **M5 engine orchestration change** | Pipeline behavior changes unexpectedly      | Revert engine file; cache is invalidated on version change        |
| **M6a validation logic change**    | Citation verification behavior diverges     | Revert validation file; re-run citation tests                     |
| **M7 cache schema change**         | Schema migration produces errors            | Revert schema; clear cache with `clear()`; re-run migration tests |
| **M8 mode formatting change**      | Output format degrades                      | Revert formatter; re-run formatter tests                          |

### 7.2 Cache Rollback (Post-M7)

When cache schema or engine version is rolled back:

1. Entries from the newer `engine_version` are detected on read
2. If `stored.schema_version > engine.schema_version`: entry is automatically invalidated
3. If `stored.schema_version === engine.schema_version`: entry is returned normally
4. Full cache clear is available via `PersistentCache.clear()`
5. Partial cache invalidation is available via `PersistentCache.invalidate({ engineVersion: oldVersion })`

### 7.3 API Compatibility Guarantee

- All public interfaces from M1 are treated as stable contracts
- Backward-incompatible changes to `Explainer`, `ExplainConfig`, `Explanation`, or `ExplainResult` require a MAJOR version bump in `@veris/explain`
- M6a deterministic validation functions are internal (not in public API), so they can change between minor versions

---

## 8. Cross-Package Dependency Table

| Milestone                       | Depends On                                                                    | Used By                                   | Interface Contract                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| M1: Foundation                  | `@veris/core`, `@veris/ai`, `@veris/shared`, `@veris/config`, `@veris/logger` | M2, M3, M4, M5, M6a, M6b, M7, M8, M9, M10 | Types: `Explanation`, `ExplainedContext`, `ExplainResult`, `ExplainConfig`, `CacheKey`          |
| M2: @veris/ai Provider Impl     | M1, `@veris/core`, `fetch`/`undici`                                           | M5                                        | `LLMProvider`, `ProviderRegistry`, `ProviderCapabilities`                                       |
| M3: Context                     | M1, M2 (@veris/ai types), `@veris/core`, `@veris/shared`                      | M5                                        | `ExplainedContext`, `ScopeManager`, `TokenBudget`                                               |
| M4: Prompts                     | M1, `handlebars`                                                              | M5                                        | `PromptRegistry`, `RenderedPrompt`                                                              |
| M6a: Deterministic Validation   | M1 (types only)                                                               | M5                                        | `CitationVerifier`, `StructuralValidator`, `NullEvidenceRefusal`, `InputFilter`, `OutputFilter` |
| M5: Engine + Logging            | M2, M3, M4, M6a                                                               | M6b, M9, M10                              | `Explainer`, `AuditLog`, `Metrics`                                                              |
| M6b: LLM Validation + Formatter | M5                                                                            | M8, M9, M10                               | `ValidationAgent`, `Formatter`                                                                  |
| M7: Caching                     | M1, `better-sqlite3`                                                          | M5                                        | `PersistentCache`, `CacheKey` (includes `mode`)                                                 |
| M8: Modes                       | M6b                                                                           | M9                                        | Mode configuration objects                                                                      |
| M9: CLI                         | M5, M6b, M8, `@veris/cli`, `@veris/renderers`                                 | M11                                       | `ExplainCommandContext`, TUI components                                                         |
| M10: Testing Suite              | M5, M6b                                                                       | None (testing only)                       | Golden snapshots, benchmark targets                                                             |
| M11: Documentation              | M9                                                                            | None (documentation only)                 | User guide, configuration reference                                                             |

**Key architectural rule enforced by this table:** No package imports from a package below it in the dependency chain.

---

## 9. Acceptance Checklist for V1 Release

Before V1 can be released:

- [ ] All 12 milestones (M1-M11) complete with all exit criteria met
- [ ] All 250+ tests passing in CI
- [ ] All 3 provider adapters tested against real endpoints (manual release gate)
- [ ] Golden tests cover: 1-finding (simple/technical/expert), 1 chain, 1 risk dimension, 1 report summary
- [ ] Fuzz tests complete 1,000 iterations without failure
- [ ] Performance benchmarks meet targets on CI hardware
- [ ] Cache schema migration tests pass (v0→v1, v1→v2, v2→v0)
- [ ] Rollback strategy verified for all milestones
- [ ] `pnpm build` produces clean output with no warnings
- [ ] `pnpm lint` passes with no errors
- [ ] Documentation covers: setup, configuration, CLI usage, prompt authoring
- [ ] All public APIs have TSDoc
- [ ] Changelog documents all breaking changes from architecture revisions
- [ ] Security tests pass (prompt injection, cache integrity, audit integrity)
- [ ] No orphan modules, no undocumented APIs, no circular dependencies
- [ ] `@veris/explain` has NO `providers/` directory — all provider contracts come from `@veris/ai`
- [ ] `Citation.sourceType` verified as 10-value union matching SPEC-011 §8.2 canonical list
- [ ] `CacheKey.mode` verified present and used in all cache operations
- [ ] `ExplainedContext.contextSchemaVersion` verified present
- [ ] `ExplainedFinding.severity.level` and `ExplainedRule.severity.level` typed as `SeverityLevel` from `@veris/core`
- [ ] `@veris/report` is NOT a dependency of `@veris/explain`
- [ ] `--no-audit` flag verified present on CLI commands
- [ ] Provider integration tests reference @veris/ai adapters, not @veris/explain adapters
