# VERIS Architecture

VERIS (Vulnerability Enumeration & Risk Intelligence System) is a deterministic security analysis framework designed for open-source ecosystems.

## Architecture Specifications

The architecture is defined by 10 frozen specifications:

| Spec     | Title                      | Scope                                                  |
| -------- | -------------------------- | ------------------------------------------------------ |
| SPEC-001 | Repository Architecture    | Workspace layout, package boundaries, dependency rules |
| SPEC-002 | Canonical Data Model       | Types, taxonomy, and knowledge model                   |
| SPEC-003 | Rule Engine & Reasoning    | Rule matching, correlation, reasoning engine           |
| SPEC-004 | Extraction Framework       | Artifact extraction pipeline                           |
| SPEC-005 | Risk, Trust & Confidence   | Scoring models                                         |
| SPEC-006 | Terminal UX & Rendering    | CLI, report system, rendering                          |
| SPEC-007 | Plugin SDK & Configuration | Extension architecture                                 |
| SPEC-008 | Testing & Security         | Test strategy, performance, security                   |
| SPEC-009 | Implementation Blueprint   | Build system, sprint plan, engineering roadmap         |
| SPEC-010 | Architecture Constitution  | Invariants, scope freeze, governance                   |

See [docs/architecture/](docs/architecture/) for the full specifications.

## Core Principles

1. **Deterministic analysis** — Same input always produces the same output
2. **AI-free analysis pipeline** — AI is a consumer, never an analyst
3. **Extractors extract, rules match** — Clear separation of concerns
4. **Offline-first** — Everything works without network access
5. **Explainable findings** — Every finding can be explained and reproduced
6. **Layered architecture** — Strict dependency direction from top to bottom

## Package Layers

```
Layer 0 (Foundation):   core, shared
Layer 1 (Framework):    logger, config, telemetry, ai
Layer 2 (Domain):       extractors, rules-engine, rules, knowledge
Layer 3 (Analysis):     analyzer
Layer 4 (Report):       report, exporters
Layer 5 (Application):  cli, api, runners
Layer 7 (Plugins):      plugins (V2+)
Cross-cutting:          renderers
```

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions.
