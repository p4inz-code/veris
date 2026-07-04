# VERIS Maintenance Guide

## Versioning

All VERIS packages use independent versioning managed by [Changesets](https://github.com/changesets/changesets).

- `@veris/core` — Stable (1.x), changes rarely
- `@veris/shared` — Stable (1.x)
- All other packages — Pre-v1 (0.x) until stabilized

## Release Process

1. Run `pnpm changeset` to create a new changeset
2. Commit the changeset file
3. Create a PR with the changeset
4. Merge to `main`
5. The Release GitHub Action creates a release PR
6. Merge the release PR to publish to npm

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

- **Unit tests**: `pnpm test` — 2,795+ tests across all packages
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
- **Nightly**: Performance benchmarks, security tests, integration tests
- **Documentation**: Auto-build on docs/source changes

## Performance Monitoring

- Run benchmarks: `pnpm bench`
- Monitor memory usage in CI
- Track test execution times across runs

## Architecture Compliance

All changes must comply with the architecture specifications in `docs/architecture/`:

- SPEC-001 through SPEC-011
- No circular dependencies
- No breaking API changes without major version bump
