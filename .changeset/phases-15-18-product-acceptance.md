---
'veris-cli': patch
---

feat(acceptance): product UX/UI consistency, cross-platform runtime, and end-to-end acceptance hardening (Phases 15–18)

- **Phase 15 (Product UX/UI Consistency & CLI Experience)**:
  - Standardized CLI output and global help across 40, 60, 80, 120, 160, and 180 column terminal widths.
  - Verified color-blind accessible error indicators and ASCII fallback mode (`--no-unicode`).
  - Added public `registerAllCommands` export and test guard to prevent premature process exit.
- **Phase 16 (Cross-Platform / Runtime / Installation Hardening)**:
  - Validated cross-platform path handling and zero-dependency guarantees for core packages.
  - Fixed `madge` circular dependency check invocation to support Windows and POSIX without glob failures.
  - Verified clean disposable installation of production tarballs outside the repository.
- **Phase 17 (Full End-to-End Product Acceptance)**:
  - Executed complete 14-step end-to-end user journey across scan, report, dashboard, AI rule authoring, plugin promotion, and CI runner.
  - Verified security corpus coverage on clean, suspicious, malformed, and configuration targets.
- **Phase 18 (Final Quality & Release-Candidate Hardening)**:
  - Verified monorepo circular dependency freedom (0 circular dependencies across 472 files).
  - Validated quick performance benchmark (16.3ms median execution with canonical determinism).
