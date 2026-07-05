# Versioning Policy

VERIS follows [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) for all published packages.

## Version Scheme

All packages use the `MAJOR.MINOR.PATCH` format:

```
MAJOR.MINOR.PATCH
```

### Patch Releases (0.0.x)

Increment the patch version when:

- Bug fixes
- Release engineering improvements (build, packaging, metadata)
- Documentation updates
- Performance optimizations without behavior change

**Example:** `0.1.1` → `0.1.2`

### Minor Releases (0.x.0)

Increment the minor version when:

- New features or capabilities
- Significant CLI or UX improvements
- New extractors, rules, or analysis patterns
- API additions (backward-compatible)

**Example:** `0.1.x` → `0.2.0`

### Major Releases (x.0.0)

Increment the major version when:

- Breaking changes to public APIs
- Breaking changes to the canonical data model
- Breaking changes to export formats (JSON, SARIF, etc.)
- Breaking changes to plugin contracts
- Removal of deprecated functionality

**Example:** `0.x.x` → `1.0.0`

## Pre-v1 (0.x) Policy

While VERIS is in the 0.x phase:

- **Minor version bumps** may include breaking changes during this phase, but they will be clearly documented in the changelog and migration guide
- **Patch releases** never include breaking changes
- The goal is to reach **1.0.0** with a stable, documented, fully backward-compatible API

## Independent Package Versioning

VERIS is a monorepo with **independently versioned** packages. Each `@veris/*` package has its own version number.

- `@veris/core` and `@veris/shared` are Foundation packages — they change rarely and follow strict semver
- All other packages may version independently as they evolve toward 1.0.0
- The `@veris/cli` package is the primary user-facing package and drives the release cadence

## Version Management

Versioning is managed by [Changesets](https://github.com/changesets/changesets).

### Workflow

1. Run `pnpm changeset` to create a new changeset describing your change
2. Commit the changeset file alongside your code changes
3. Merge the PR into `main`
4. The Release GitHub Action creates a release PR with updated versions and changelogs
5. Merge the release PR to publish all changed packages to npm

### Changeset Types

| Type    | Version Bump | Use Case                                |
| ------- | ------------ | --------------------------------------- |
| `patch` | 0.0.x        | Bug fixes, release engineering, docs    |
| `minor` | 0.x.0        | New features, non-breaking enhancements |
| `major` | x.0.0        | Breaking changes                        |

## Version Consistency

The following locations must always be updated together when bumping the CLI version:

| File                        | Field                         |
| --------------------------- | ----------------------------- |
| `packages/cli/package.json` | `version`                     |
| `packages/cli/src/wirer.ts` | `CLI_VERSION` constant        |
| `README.md`                 | Version references throughout |
| `CHANGELOG.md`              | New version entry             |

## Version Links

- [CHANGELOG.md](CHANGELOG.md) — Complete release history
- [RELEASE.md](RELEASE.md) — Release checklist and process
- [MAINTENANCE.md](MAINTENANCE.md) — Maintenance guide
