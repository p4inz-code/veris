# Error Hierarchy Architecture (SPEC-013)

**Status:** Analysis — current state documented. Convergence planned for v1.0.

## Current State

VERIS has a **distributed error model** where each package defines its own error types. There is no single unified hierarchy at this stage of the project.

### Hierarchy Overview

```
Error (built-in)
├── VerisError (@veris/core)
│   ├── code, category, userMessage, cause, metadata
│   └── Used in: core types, factories
│
├── ProviderError (@veris/ai)
│   ├── code (ProviderErrorCode), providerId, recoverable, statusCode, retryAfterMs, cause
│   └── Used in: AI provider adapters (OpenAI, Anthropic, Ollama, Custom)
│
├── CancelledError (@veris/shared)
│   ├── Inherits from Error with name "CancelledError"
│   └── Used in: CancellationToken operations, Semaphore cancellation
│
├── ExtractionError (@veris/extractors)
│   ├── code, extractorId
│   └── Used in: extractor framework
│
├── CliError (@veris/cli)
│   ├── exitCode, userMessage
│   └── Used in: CLI command handlers
│
└── TypeError, RangeError, SyntaxError (built-in)
    └── Used for validation and type checking
```

### Result<T, E> Pattern

Defined in `@veris/shared/src/result/result.ts`:

```typescript
type Result<T, E = Error> = Ok<T> | Err<E>;
```

**Current usage:**

- `@veris/shared`: Utility functions, `tryCatch`, `tryCatchAsync`, `collect`
- `@veris/extractors`: `collectMetadata()` returns `{ ok, metadata/error }` (structural, not `Result` type)
- Not yet widely adopted across the codebase

### Key Observations

1. **No single base class** — `VerisError` exists in `@veris/core` but is not used by `ProviderError`, `CancelledError`, `ExtractionError`, or `CliError`
2. **Inconsistent properties** — each error type has different fields:
   - `VerisError`: `code`, `category`, `userMessage`, `cause`, `metadata`
   - `ProviderError`: `code`, `providerId`, `recoverable`, `statusCode`, `retryAfterMs`, `cause`
   - `CancelledError`: `message` only
   - `ExtractionError`: `code`, `extractorId`
   - `CliError`: `exitCode`, `userMessage`
3. **Result<T,E> underused** — many internal functions throw rather than returning `Result`
4. **No `cause` chaining** — only `VerisError` properly supports `cause`
5. **No serialization** — only `VerisError` implements `toJSON()`

## Future Convergence Plan (v1.0)

### Phase 1: Adopt `VerisError` as Base

All named error types should extend `VerisError`:

| Error             | Base                   | Timeline    |
| ----------------- | ---------------------- | ----------- |
| `VerisError`      | `Error` (already done) | ✅ Existing |
| `ProviderError`   | `VerisError`           | v1.0        |
| `CancelledError`  | `VerisError`           | v1.0        |
| `ExtractionError` | `VerisError`           | v1.0        |
| `CliError`        | `VerisError`           | v1.0        |

### Phase 2: Standardize Error Codes

Establish a package-prefixed code system:

```
PARSE_001 — File parse failure
EXTRACT_001 — Extraction failure
RULE_001 — Rule evaluation error
AI_TIMEOUT — AI provider timeout
AI_AUTH — AI authentication failure
IO_001 — Filesystem error
CONFIG_001 — Configuration error
```

### Phase 3: Widen `Result<T,E>` Adoption

Convert internal functions from throw-based to `Result<T,E>`:

- Extraction pipelines
- Configuration parsing
- File I/O operations
- Response parsing

### Phase 4: Error Serialization

Implement `toJSON()` on all error types (already done for `VerisError`).

### Migration Strategy

1. Add `VerisError` as a dependency where needed
2. Change class hierarchy: `extends VerisError` instead of `extends Error`
3. Add standardized `code` and `category` to each error
4. Update consumers to check `error instanceof VerisError`
5. Convert throw/catch patterns to `Result<T,E>` where appropriate
6. Remove legacy error factories

**No code changes in this document.** This is a forward-looking architecture note.
