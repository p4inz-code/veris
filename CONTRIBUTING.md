# Contributing to VERIS

Thank you for your interest in contributing to VERIS!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/veris/veris.git`
3. Install dependencies: `pnpm install`
4. Build all packages: `pnpm build`
5. Run tests: `pnpm test`

## Development Workflow

### Branch Strategy

- `main` — Stable, release-ready
- `next` — Upcoming release integration
- `feat/*` — Feature branches
- `fix/*` — Bug fix branches
- `docs/*` — Documentation branches

### Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation
- `refactor:` — Code refactoring
- `test:` — Test changes
- `chore:` — Maintenance

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes following the architecture contracts
3. Add or update tests
4. Ensure all checks pass
5. Create a PR with a clear description
6. Request review from maintainers

### Code Review Checklist

- [ ] Follows architecture contracts (SPEC-001 through SPEC-011)
- [ ] No circular dependencies
- [ ] Tests cover the change
- [ ] All tests pass (`pnpm test`)
- [ ] Typecheck passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)
- [ ] Build passes (`pnpm build`)
- [ ] No breaking API changes (unless documented)
- [ ] Documentation updated
- [ ] Exports properly configured
- [ ] Changeset added (`pnpm changeset`)

## Architecture Compliance

All contributions must comply with:

- **SPEC-001**: Repository Architecture — Workspace layout, package boundaries
- **SPEC-002**: Data Model & Knowledge Taxonomy — Can
  onical types
- **SPEC-003**: Rule Engine, Correlation & Reasoning — Rule matching, evidence correlation
- **SPEC-004**: Extraction Framework — Artifact extraction pipeline
- **SPEC-005**: Risk, Trust & Confidence Model — Scoring and verdicts
- **SPEC-006**: Terminal UX, Rendering & Report System — CLI and output
- **SPEC-007**: Plugin SDK & Configuration — Extension system
- **SPEC-008**: Testing, Performance & Security — Quality standards
- **SPEC-009**: Implementation Blueprint — Build and release
- **SPEC-010**: Architecture Constitution — Invariants and governance
- **SPEC-011**: AI Explanation Layer — AI as consumer, determinism, traceability

See [docs/architecture/](docs/architecture/) for the full specifications.

## Determinism Requirements

VERIS makes strong determinism guarantees. All contributions must:

- Not introduce `Math.random()`, `crypto.randomUUID()`, or any other non-deterministic source
- Use injected clocks (`now?: number` parameters) for timestamps
- Ensure stable ordering of all collections
- Freeze all output objects at construction
- Pass the determinism test suite
