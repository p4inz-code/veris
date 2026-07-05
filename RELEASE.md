# Release Process

This document is the official release playbook for VERIS. Follow these steps for every release.

## Release Checklist

### Phase 1: Preparation

- [ ] Ensure `main` branch is stable (all CI gates green)
- [ ] Review open changesets and decide which to include
- [ ] Create changesets for any unreleased changes: `pnpm changeset`
- [ ] Verify all changesets are committed to `main`

### Phase 2: Versioning

- [ ] Run `pnpm changeset version` to bump versions and update changelogs
- [ ] Review the generated version bumps (MAJOR.MINOR.PATCH correctness)
- [ ] Review the generated CHANGELOG.md entries for accuracy
- [ ] If releasing the CLI, update `CLI_VERSION` in `packages/cli/src/wirer.ts`
- [ ] Update version references in `README.md` if needed

### Phase 3: Build & Test

- [ ] Run `pnpm install --frozen-lockfile` to ensure clean dependencies
- [ ] Run `pnpm build` to build all packages
- [ ] Run `pnpm typecheck` — must pass with zero errors
- [ ] Run `pnpm test` — all tests must pass
- [ ] Run `pnpm lint` — zero warnings above threshold
- [ ] Run `pnpm circular` — zero circular dependencies

### Phase 4: Package Verification

- [ ] For the CLI package: `cd packages/cli && npm pack --dry-run`
- [ ] Verify tarball contains only: `dist/*`, `README.md`, `package.json`
- [ ] Verify `dist/cli.js` has shebang (`#!/usr/bin/env node`)
- [ ] Test CLI locally: `node packages/cli/dist/cli.js --version`
- [ ] Test CLI help: `node packages/cli/dist/cli.js --help`

### Phase 5: Git & Tag

- [ ] Commit all changes with message: `chore: release packages`
- [ ] Create a signed git tag: `git tag -a v0.1.2 -m "v0.1.2"`
- [ ] Push commits: `git push origin main`
- [ ] Push tags: `git push origin v0.1.2`

### Phase 6: GitHub Release

- [ ] Create a GitHub Release for the tag
- [ ] Title: `v0.1.2`
- [ ] Description: Copy the CHANGELOG.md entry for this version
- [ ] Attach the npm pack tarball as a release asset (optional)

### Phase 7: npm Publishing

#### Automatic (Recommended)

The Release GitHub Action handles this automatically. When a release PR is merged:

1. `pnpm changeset publish` runs automatically
2. All changed packages are published to npm
3. Each package respects its `publishConfig`

#### Manual (if needed)

```bash
# Ensure you're logged in
npm whoami || npm login

# Publish all changed packages
pnpm changeset publish

# Or publish a single package
cd packages/cli
npm publish
```

### Phase 8: Fresh Install Verification

```bash
# Install from npm in a temporary directory
cd /tmp
npm install -g @veris/cli

# Verify commands
veris --help
veris version
veris scan .
```

### Phase 9: Post-Release

- [ ] Verify npm package pages are updated:
  - `https://www.npmjs.com/package/@veris/cli`
- [ ] Verify GitHub Release page is correct
- [ ] Verify CI badge in README is green
- [ ] Announce the release on relevant channels

## Release Cadence

| Type      | Cadence           | Examples                       |
| --------- | ----------------- | ------------------------------ |
| **Patch** | As needed         | Bug fixes, release engineering |
| **Minor** | Monthly/quarterly | New features, improvements     |
| **Major** | Annually          | Breaking changes, V1.0+, V2.0+ |

## Branch Strategy

- `main` — Always release-ready
- `next` — Upcoming release integration (optional)
- Releases are always cut from `main`

## Version References

For CLI releases, the following files must all be updated together:

| File                        | Field              |
| --------------------------- | ------------------ |
| `packages/cli/package.json` | `version`          |
| `packages/cli/src/wirer.ts` | `CLI_VERSION`      |
| `CHANGELOG.md`              | New version entry  |
| `README.md`                 | Version references |

## See Also

- [VERSIONING.md](VERSIONING.md) — Versioning policy
- [CHANGELOG.md](CHANGELOG.md) — Release history
- [CONTRIBUTING.md](CONTRIBUTING.md) — Development workflow
- [MAINTENANCE.md](MAINTENANCE.md) — Maintenance guide
