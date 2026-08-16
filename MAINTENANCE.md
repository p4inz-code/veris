# VERIS Maintenance Guide

## Current Status — v1.0.0 Frozen (maintenance freeze)

**v1.0.0 is the current stable release** (tag `v1.0.0`, published as `veris-cli` on
npm). The tag and the npm release are **immutable**: no tag movement, no republish,
no new version without an explicit decision to end the freeze. `main` is in
maintenance mode — bug fixes only, no new features (see `ROADMAP.md` for deferred
work).

### Shipped interactive terminal UX (post-1.0.0 hardening)

- **Persistent animated session header** — `packages/cli/src/scan/progress/session-header.ts`.
  The VERIS logo + identity are SESSION-scoped: created once at startup, never
  re-created or wiped by scan lifecycle events (dashboard, errors, cancellation,
  summary), and only released at `dispose()`.
- **Rendering model** — the interactive session runs on the terminal's ALTERNATE
  SCREEN BUFFER (`\x1b[?1049h` / `\x1b[?1049l`) with FULL-FRAME REDRAW: every
  repaint is home + header lines + body + erase-below, so the header is
  re-anchored at the top of every frame and can never scroll away. DECSTBM
  scroll-region pinning is deliberately NOT used (unreliable on Windows
  Terminal/ConPTY: microsoft/terminal#19016, #3673).
- **Logo intro animation** — a deterministic left-to-right ghost-fill wipe
  (6 frames) plus one settle frame at ~150ms/frame, driven by a single timer in
  the header. Character-based, so it works with `--no-color` and `--no-unicode`;
  disabled on non-TTY, reduced-motion, or `--no-animation` (static header).
- **Regression tests** — `packages/cli/__tests__/scan/session-header.test.ts`,
  `real-tty-lifecycle.test.ts`, and `vt-terminal-model.test.ts` cover the header
  lifecycle, the animation frames, and finite-height terminal behavior.

### Known limitations

- The logo intro takes ~1.05s; a scan that finishes faster closes the alternate
  screen mid-wipe and prints the completed header + summary on the primary screen.
- No benchmark suite (see `.github/workflows/nightly.yml`).
- AI features (`explain`/`summarize`) require API keys and are consumer-only.
- Only the CLI package (`veris-cli`) is published; the other workspace packages are
  internal.

### Deferred work

See `ROADMAP.md` (V2+): plugin SDK, AI-assisted rule writing, CI integration
runner, web dashboard, additional rule packs, extension marketplace.

## Versioning

All VERIS packages use independent versioning managed by [Changesets](https://github.com/changesets/changesets).

- Foundation components — Stable, changes rarely
- All other components — Pre-v1 (0.x) until stabilized

## Release Process

1. Create a changeset: `pnpm changeset`
2. Commit the changeset file
3. Create a PR with the changeset
4. Merge to `main`
5. Tag the release commit as `v<version>` (e.g. `git tag v1.0.0`)
6. Push the tag — the Release GitHub Action publishes the CLI package to npm
   and creates the GitHub Release

## Development Setup

```bash
pnpm install
pnpm build
pnpm test
```

## Available Scripts

| Script               | Description                                            |
| -------------------- | ------------------------------------------------------ |
| `pnpm build`         | Build all packages (core first, then layers)           |
| `pnpm build:all`     | Build all packages in parallel                         |
| `pnpm typecheck`     | Type-check all packages                                |
| `pnpm lint`          | Lint all source files                                  |
| `pnpm format`        | Check formatting                                       |
| `pnpm test`          | Run all tests                                          |
| `pnpm test:coverage` | Run tests with coverage                                |
| `pnpm ci:all`        | Complete CI pipeline (build + typecheck + lint + test) |
| `pnpm circular`      | Check for circular dependencies                        |

## Dependency Management

- Use `pnpm up --latest` for updating dependencies
- Run `pnpm dedupe` after major updates to deduplicate the lockfile
- Check `pnpm outdated` regularly for available updates
- All dependencies are listed in the root `package.json` as devDependencies

## Testing

- **Unit tests**: `pnpm test` — full suite across all packages (3,500+)
- **Determinism tests**: Verifies same input → same output across repeated runs
- **Coverage**: Minimum 80% threshold across all packages

## Code Quality

- **TypeScript strict mode** enabled across all packages
- **ESLint** with strict rules (no `any`, no `console.log`, no unused vars)
- **Prettier** for consistent formatting
- **Husky** pre-commit hooks for lint-staged
- **No circular dependencies** — enforced by madge in CI

## Documentation

- Architecture docs in `docs/architecture/` (SPEC-001 through SPEC-011)
- Root README with quick start, CLI usage, API examples
- Package-level READMEs in each package directory
- GitHub community health files in `.github/`

## CI/CD

- **CI**: Build, lint, test on push/PR to main/next (Node 18, 20, 22 on Ubuntu, Windows, macOS)
- **Release**: Automated npm publishing via Changesets on main
- **Nightly**: Daily validation job (install + build + test) — see `.github/workflows/nightly.yml`
- **Documentation**: Auto-build on docs/source changes

## Performance Monitoring

- The repo currently ships no benchmark suite (see `.github/workflows/nightly.yml`)
- Monitor memory usage in CI
- Track test execution times across runs

## Architecture Compliance

All changes must comply with the architecture specifications in `docs/architecture/`:

- SPEC-001 through SPEC-011
- No circular dependencies
- No breaking API changes without major version bump
