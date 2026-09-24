---
'veris-cli': minor
'@veris/plugins': minor
'@veris/shared': patch
---

feat(v2): complete V2 roadmap — AI rule authoring, visual dashboard, and plugin marketplace

- **Phase 12 (AI-Assisted Rule Authoring)**:
  - Added `veris rule author` command for intent-driven declarative detection rule generation.
  - Implemented deterministic validation gate enforcing AST purity, regex ReDoS safety, and engine compatibility.
  - Added synthetic test fixture generator running positive/negative validation through real RuleEngine.
  - Added candidate artifact assembly with explicit human review warnings and active plugin promotion (`--promote`).
  - Added support for disjunctive version ranges (`||`) in `@veris/shared` semver matcher.

- **Phase 13 (Visual Investigation Dashboard)**:
  - Added `veris dashboard` command for interactive investigation and report export.
  - Implemented zero-dependency, self-contained HTML report generator with dark-slate design system.
  - Implemented zero-network loopback viewer server bound strictly to `127.0.0.1` with strict Content Security Policy (`default-src 'none'`) and anti-framing security headers.
  - Added interactive finding search, severity breakdown, and expandable evidence traces.

- **Phase 14 (Plugin Ecosystem & Marketplace Foundation)**:
  - Added `veris plugins catalog` command for browsing local-first verified plugin packages.
  - Added `veris plugins verify` command for content-addressed Merkle SHA-256 checksum verification, engine compatibility check, and capability auditing.
  - Added `veris plugins install` and `veris plugins remove` commands with mandatory verification gates and immutable `.veris-installed.json` receipts.
  - Codified 4-stage lifecycle separation: Discovery -> Verification -> Installation -> Execution.
