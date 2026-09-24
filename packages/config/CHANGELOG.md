# @veris/config

## 0.3.0

### Minor Changes

- a244426: feat(ci): add deterministic security gate runner and automated policy enforcement

  - Implemented `veris ci [target] [options]` runner command with standalone and baseline modes
  - Added location-aware finding fingerprinting with deterministic cross-platform path normalization
  - Implemented hardened baseline ingestion supporting CanonicalReport and CiSummary with prototype pollution defense and 50MB ceiling
  - Added 5-way differential comparator (`unchanged`, `new`, `regressed`, `evidence_changed`, `resolved`)
  - Added configurable security policy gate evaluator (`failOn`, `failOnNew`, `maxNew`, `failOnRegressions`, `maxRisk`, `failOnPluginQuarantine`)
  - Added dual CI artifact emission: machine-readable `ci-summary.json` and GitHub Step Summary Markdown
  - Codified deterministic exit codes: 0 (Success), 1 (Scan error), 2 (Usage error), 10 (Gate violation), 11 (Invalid baseline), 12 (Invalid config), 13 (Plugin error), 130 (Cancelled)

### Patch Changes

- Updated dependencies [a7c7c26]
  - @veris/shared@0.1.1

## 0.2.0

### Minor Changes

- a350870: Integrate local plugin discovery and runtime into CLI scan pipeline and add veris plugins management command.
