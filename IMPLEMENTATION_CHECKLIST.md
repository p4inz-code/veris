# VERIS Implementation Checklist

## Phase 1: Repository Bootstrap ✓

- [x] Architecture specifications frozen
- [x] Repository structure created
- [x] Root workspace configured
- [ ] Build system verified (pending install)
- [ ] CI workflows created
- [ ] VSCode settings configured

## Packages

### Layer 0 — Foundation

- [ ] @veris/core — Types, errors, constants
- [ ] @veris/shared — Collections, hashing, serialization, FS, net, path, platform, Result monad, semver

### Layer 1 — Framework

- [ ] @veris/logger — Structured logging
- [ ] @veris/config — Configuration loading
- [ ] @veris/telemetry — Metrics and tracing
- [ ] @veris/ai — AI provider adapters

### Layer 2 — Domain

- [ ] @veris/extractors — Extraction framework
- [ ] @veris/rules-engine — Rule matching and evaluation
- [ ] @veris/rules — Shipped rule packs
- [ ] @veris/knowledge — Taxonomy and mappings

### Layer 3 — Analysis

- [ ] @veris/analyzer — Pipeline orchestrator

### Layer 4 — Report & Output

- [ ] @veris/report — Report construction
- [ ] @veris/exporters — Output formats

### Layer 5 — Application

- [ ] @veris/cli — CLI commands
- [ ] @veris/api — Programmatic API

### Layer 6+ — Extensions

- [ ] @veris/runners — Execution runners
- [ ] @veris/plugins — Plugin system (V2+)
- [ ] @veris/renderers — Report rendering

## Milestones

- [ ] M1: All packages compile
- [ ] M2: Core types validated
- [ ] M3: Extraction pipeline works
- [ ] M4: Rules engine matches findings
- [ ] M5: Full analysis pipeline runs
- [ ] M6: CLI commands functional
- [ ] M7: V1.0 Release Candidate
