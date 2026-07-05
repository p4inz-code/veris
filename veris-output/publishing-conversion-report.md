# VERIS Publishing Configuration Conversion Report

## Summary

Converted the VERIS monorepo from a scoped multi-package publish model (`@veris/*`) to a single-package publish model (`veris`).

---

## Every File Changed

### 1. `packages/cli/package.json`

- **Changed:** `name` from `"@veris/cli"` to `"veris"`
- **Kept:** `bin` as `{ "veris": "./dist/cli.js" }` (already correct)
- **Kept:** `publishConfig` with `"access": "public"` (needed for npm publish)

### 2–25. All non-CLI `packages/*/package.json` (24 packages)

Each was modified by:

- **Adding** `"private": true` after the `version` field
- **Removing** the `publishConfig` block (no longer relevant for private packages)

Affected packages:

- `core`, `shared`, `logger`, `config`, `telemetry`, `ai`, `discovery`, `classification`, `extractors`, `rules-engine`, `rules`, `knowledge`, `analyzer`, `analysis`, `pipeline`, `correlation`, `report`, `exporters`, `renderers`, `plugins`, `runners`, `recommendations`, `risk`, `explain`, `api`

### 26. `.changeset/config.json`

- **Updated** `ignore` list to include all 29 `@veris/*` packages (both tools and internal packages)
- Only the `veris` CLI package will be tracked for releases

### 27. `RELEASE.md`

- **Replaced** all `@veris/cli` references with `veris`
- Updated install command: `npm install -g veris`
- Updated npm package URL: `https://www.npmjs.com/package/veris`

### 28. `pnpm-lock.yaml`

- Updated automatically by `pnpm install` (no manual changes)

---

## Every Package Made Private

All 25 packages under `packages/` are now **private** with `"private": true`, **except** `packages/cli` (now named `veris`) which remains publishable.

| Package                    | Status                        |
| -------------------------- | ----------------------------- |
| `veris` (was `@veris/cli`) | **Public** — published to npm |
| `@veris/core`              | **Private**                   |
| `@veris/shared`            | **Private**                   |
| `@veris/logger`            | **Private**                   |
| `@veris/config`            | **Private**                   |
| `@veris/telemetry`         | **Private**                   |
| `@veris/ai`                | **Private**                   |
| `@veris/discovery`         | **Private**                   |
| `@veris/classification`    | **Private**                   |
| `@veris/extractors`        | **Private**                   |
| `@veris/rules-engine`      | **Private**                   |
| `@veris/rules`             | **Private**                   |
| `@veris/knowledge`         | **Private**                   |
| `@veris/analyzer`          | **Private**                   |
| `@veris/analysis`          | **Private**                   |
| `@veris/pipeline`          | **Private**                   |
| `@veris/correlation`       | **Private**                   |
| `@veris/report`            | **Private**                   |
| `@veris/exporters`         | **Private**                   |
| `@veris/renderers`         | **Private**                   |
| `@veris/plugins`           | **Private**                   |
| `@veris/runners`           | **Private**                   |
| `@veris/recommendations`   | **Private**                   |
| `@veris/risk`              | **Private**                   |
| `@veris/explain`           | **Private**                   |
| `@veris/api`               | **Private**                   |

Tools under `tools/` (`@veris/perf`, `@veris/security-suite`, `@veris/codegen`, `@veris/scripts`) were already private and unchanged.

---

## Remaining Publish Blockers

- **None identified.** All verification checks pass:
  - ✅ `pnpm install` — clean install, no errors
  - ✅ `pnpm build` — all 30 workspace packages build successfully
  - ✅ `pnpm typecheck` — zero type errors across all projects
  - ✅ `pnpm test` — all 126 suites / 3,133 tests pass
  - ✅ `npm pack --dry-run` on CLI — correct files included (`dist/*`, `README.md`, `package.json`)

---

## Architectural Notes

- **Internal package names unchanged** — Packages still use `@veris/*` names internally for `pnpm --filter` and workspace dependency resolution. Only the published name was changed.
- **Workspace dependencies unchanged** — `"@veris/core": "workspace:*"` references continue to work because the package names haven't changed internally.
- **Monorepo structure intact** — All packages remain in their current locations.
- **Runtime behavior unchanged** — No source code was modified.
- **CI/CD workflows unchanged** — The release workflow uses `changesets/action@v1` which automatically publishes only public (non-private) packages. The `pnpm changeset publish` command will only publish the `veris` package.
- **Documentation references** — README.md and other docs still reference `@veris/cli` in some places; these are documentation-only and not publishing blockers.
