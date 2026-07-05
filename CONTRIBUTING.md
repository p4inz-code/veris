# Contributing

VERIS accepts contributions from authorized contributors. This guide documents
the development workflow for internal team members and approved external
contributors.

## Getting started

1. Clone the repository: `git clone https://github.com/veris/veris.git`
2. Install dependencies: `pnpm install`
3. Build all packages: `pnpm build`
4. Run tests: `pnpm test`

## Development

### Branch strategy

- `main` — Stable, release-ready
- `feat/*` — Feature branches
- `fix/*` — Bug fix branches
- `docs/*` — Documentation branches

### Commit conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation
- `refactor:` — Code refactoring
- `test:` — Test changes
- `chore:` — Maintenance

### Pull request process

1. Create a branch from `main`
2. Make your changes
3. Add or update tests
4. Ensure all checks pass locally
5. Create a pull request with a clear description
6. Request review from maintainers

### Before submitting

- [ ] Tests pass (`pnpm test`)
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Build passes (`pnpm build`)
- [ ] No circular dependencies (`pnpm circular`)
- [ ] Documentation updated if needed
- [ ] Changeset added (`pnpm changeset`)

## Determinism requirements

VERIS makes strong determinism guarantees. Contributions must not introduce:

- `Math.random()`, `crypto.randomUUID()`, or other non-deterministic sources
- Timestamps using `Date.now()` in analysis code
- Unstable collection ordering
- Mutable output objects

## Architecture

Architecture specifications are in `docs/architecture/`. All contributions must
comply with the invariants defined there.

## Questions

Open a [GitHub Discussion](https://github.com/veris/veris/discussions) for
questions about contributing.
