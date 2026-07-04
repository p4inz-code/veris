# @veris/explain

VERIS AI explanation layer — explains deterministic analysis results via LLM providers.

## Overview

`@veris/explain` provides AI-generated explanations of VERIS deterministic analysis results.
It is a read-only consumer of the [CanonicalReport](https://github.com/veris/veris) —
it never modifies findings, evidence, risk scores, or any canonical object.

## Principles

- **AI NEVER participates in analysis** — explanations are always post-hoc
- **Every claim is traceable** — citations point to deterministic evidence
- **AI is optional** — all core VERIS functionality works without it
- **Offline-first** — local providers (Ollama, LM Studio) are first-class citizens

## Installation

```bash
pnpm add @veris/explain
```

## Usage

```typescript
import { createExplainer } from '@veris/explain';

const explainer = createExplainer({
  providerRegistry,
  promptRegistry,
  config: {/* ... */},
  logger,
});

const result = await explainer.explainFinding('fin_abc123', report);
```

## License

MIT
