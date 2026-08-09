# Release v0.1.3

## Changes

- Published as `veris-cli` on npm (`npm install -g veris-cli`)
- Run via `npx veris-cli` with no installation required
- Shell completions for Bash, Zsh, and Fish
- AI explanation layer supports OpenAI, Anthropic, and Ollama
- Report summarization via AI
- Knowledge pack system with built-in packs
- PE deep analysis engine (headers, sections, imports, packers, signatures)
- 6 export formats: JSON, Markdown, HTML, SARIF 2.1.0, CSV, JUnit
- Deterministic analysis — identical inputs produce identical outputs
- Offline-first — analysis pipeline requires no network access

## Stability

This is the first production-ready CLI release. Core features are stable:

- Full pipeline: discovery, classification, extraction, rules, risk, report
- 20+ artifact extractors
- 20+ built-in security rules
- 35 behavioral correlation patterns
- Deterministic risk scoring with contribution analysis
- PE/ELF/Mach-O binary analysis engine
- Knowledge pack enrichment

## Compatibility

| Platform | Status    |
| -------- | --------- |
| Windows  | Supported |
| macOS    | Supported |
| Linux    | Supported |

Requires Node.js 18 or later.

## Install

```
npx veris-cli
```

Or install permanently:

```
npm install -g veris-cli
```

## Verify

```
veris --version
```

Output: `veris 0.1.3`

## Links

- GitHub: https://github.com/veris/veris
- npm: https://www.npmjs.com/package/veris-cli
- Issues: https://github.com/veris/veris/issues
