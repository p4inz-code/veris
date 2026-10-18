# VERIS maintenance guide & production hold manual

## Current Status: v1.2.0 PRODUCTION HOLD

**VERIS v1.2.0 is officially released and placed in long-term PRODUCTION HOLD / MAINTENANCE ONLY.**

- Release Version: `v1.2.0`
- Verified Release Commit: `b9a50f4f07c1a0347c5e00e3906b14edcf8244cb`
- Published npm Artifact: `veris-cli@1.2.0` (with SLSA provenance attestations)
- Supported Node Runtimes: Node.js 18, 20, 22 (LTS)
- Package Manager: `pnpm@9.15.9`
- Supported Platforms: Windows (x64/ARM64), macOS (Apple Silicon/Intel), Linux (x64)

Tags `v1.0.0`, `v1.1.0`, and `v1.2.0` are **permanently immutable**: no tag movement, no force-push, and no republished versions. Active feature development is FROZEN.

---

## Maintenance-Only policy

Under Production Hold, changes to the repository are strictly constrained:

1. Security Fixes: Remediating high or critical vulnerabilities identified in supported versions (1.2.x, 1.1.x, 1.0.x).
2. Break-Fix & Correctness: Correcting false positives, false negatives, or crashes in static analysis engines with regression tests.
3. CI & Tooling Maintenance: Keeping GitHub Actions workflows, runner images, and dependencies compatible with current Node.js LTS releases.
4. No Feature Creep: No new product features, architectural overhauls, or unsolicited refactors without an explicit decision to reopen active development.

### When NOT to reopen development

- Do NOT reopen development for speculative features, theoretical analyzers, or subjective UI tweaks.
- Do NOT add external runtime dependencies to `@veris/core` (must remain 0 dependencies).
- Do NOT add external runtime dependencies to `@veris/plugin-sdk` (must remain 0 runtime dependencies).
- Do NOT add network egress, analytics, or telemetry to the scanning pipeline (must remain 100% offline-first).

---

## Security bug handling

Report security vulnerabilities directly by email to:
**atharva.patil.cg@gmail.com**

Do NOT open public GitHub issues for security vulnerabilities.
Include:

- Vulnerability description
- Reproduction steps or proof of concept
- Affected versions
- Suggested remediation

We will acknowledge receipt within 48 hours and provide a patch timeline.

---

## How to rebuild, test, and verify

### 1. Clean rebuild from Clone

```bash
# Clone and enter workspace
git clone https://github.com/p4inz-code/veris.git
cd veris

# Install exact dependencies
pnpm install --frozen-lockfile

# Compile monorepo (core first, then dependent layers)
pnpm build
```

### 2. Comprehensive quality verification suite

```bash
# Run TypeScript typecheck across all 31 packages
pnpm typecheck

# Run full unit and integration test suite (189 suites, 3780+ tests)
pnpm test

# Run ESLint compliance check (must be under 400 warnings, 0 errors)
pnpm lint

# Check circular dependencies across all packages (must find 0)
pnpm circular

# Run deterministic benchmark throughput and hash check
pnpm bench:quick
```

### 3. Verify published release artifacts

```bash
# Inspect registry metadata for published CLI
npm view veris-cli --json

# Run package tarball dry-run in CLI package
cd packages/cli
npm pack --dry-run
```

### 4. Windows acceptance verification

Run in PowerShell on Windows 11/10:

```powershell
# Verify CLI identity and version
node packages/cli/dist/cli.js --version

# Verify global help and command list
node packages/cli/dist/cli.js --help

# Verify accessibility modes
node packages/cli/dist/cli.js --help --no-color --no-unicode --no-animation

# Verify responsive widths
$env:COLUMNS = "80"; node packages/cli/dist/cli.js --help; $env:COLUMNS = $null

# Verify scan execution
node packages/cli/dist/cli.js scan ./fixtures/samples --format json --output ./results
```

---

## Known limitations

- Logo Intro Animation: The logo intro performs its intended reveal (~1.05s) and settles into the final static header state; the header remains persistent throughout interactive execution and on primary screen restoration.
- AI Features (`explain` / `summarize`): Consumer-only; require user-supplied API keys or local Ollama instances. AI never participates in core detection or scoring.
- Published Artifacts: Only `veris-cli` is published to npm; monorepo domain packages (`@veris/*`) are internal workspace packages bundled into the CLI executable.
- Offline-First Plugin Host: Plugin packages must be reviewed and placed locally; remote internet registry downloading of untrusted code is intentionally omitted.

---

## Release architecture

All VERIS packages use independent versioning managed by [Changesets](https://github.com/changesets/changesets).
Future maintenance patch releases follow:

1. `pnpm changeset` (declare patch bugfix)
2. Commit changeset file
3. `pnpm changeset version`
4. Commit version bumps and tag `v1.2.x`
5. Push tag to trigger `.github/workflows/release.yml`
