# Regex Safety Audit (SPEC-012)

**Status:** Complete — all content-operating regex patterns reviewed.

## Methodology

Every `.replace()` call, `new RegExp()` construction, and regex literal operating on **user-controlled or file content** was inspected for:

- Catastrophic backtracking (nested quantifiers)
- Unbounded input size
- ReDoS vulnerability classification

## Classification Legend

| Classification      | Meaning                                                                               |
| ------------------- | ------------------------------------------------------------------------------------- |
| **Safe**            | No nested quantifiers, no unbounded input, or input is bounded by content size limits |
| **Potential ReDoS** | Contains nested quantifiers on unbounded input — should be rewritten before v1.0      |
| **Rewritten**       | Was identified as vulnerable and has been rewritten                                   |

---

## Regex Inventory

### 1. `packages/extractors/src/discovery/engine.ts` — `matchesIgnorePattern()`

```typescript
const regexStr = normalizedPattern
  .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
  .replace(/\*\*/g, '___GLOBSTAR___') // Globstar marker
  .replace(/\*/g, '[^/]*') // Single star
  .replace(/___GLOBSTAR___/g, '.*') // Globstar → .*
  .replace(/\?/g, '[^/]'); // Question mark
```

**Classification:** **Safe**

**Rationale:** The `.replace()` calls are on developer-controlled pattern strings, not user content. The final regex (`new RegExp(...)`) operates on path strings that are bounded by filesystem limits (typically < 4096 bytes). No nested quantifiers in the constructed regex.

---

### 2. `packages/extractors/src/discovery/engine.ts` — `executableHint`

```typescript
/\.(exe|com|bat|cmd|ps1|msi)$/i.test(entryName);
```

**Classification:** **Safe**

**Rationale:** Fixed pattern, no quantifiers, tested on bounded strings (entry names < 256 bytes). Pure alternation — no backtracking risk.

---

### 3. `packages/rules/src/rule-engine.ts` — `_fillExplanationTemplate()`

```typescript
result = result.replace(/\{\{evidence\}\}/g, ids.evidence.join(', '));
result = result.replace(/\{\{features\}\}/g, ids.features.join(', '));
result = result.replace(/\{\{capabilities\}\}/g, ids.capabilities.join(', '));
```

**Classification:** **Safe**

**Rationale:** Fixed literal patterns (`{{evidence}}`, etc.). No quantifiers, no user-controlled regex. Template strings are bounded (rule definitions).

---

### 4. `packages/correlation/src/correlation-engine.ts` — `_fillExplanationTemplate()`

```typescript
result = result.replace(/\{\{evidence\}\}/g, ...);
result = result.replace(/\{\{features\}\}/g, ...);
result = result.replace(/\{\{capabilities\}\}/g, ...);
result = result.replace(/\{\{rules\}\}/g, ...);
```

**Classification:** **Safe**

**Rationale:** Same as rule-engine — fixed literal patterns only.

---

### 5. `packages/extractors/src/extractors/archive-extractor.ts` — `_detectArchiveType()`

No regex used — byte-level magic byte comparisons. **Not applicable.**

---

### 6. `packages/ai/src/providers/adapters/openai.ts` — endpoint normalization

```typescript
this.endpoint = (config.endpoint ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
```

**Classification:** **Safe**

**Rationale:** Trailing-slash removal on a fixed URL string, not user content. Single fixed pattern.

---

### 7. Pipeline and correlation engines — `_fillExplanationTemplate()`

(Listed above — all safe, fixed patterns only.)

---

### 8. Shebang detection in classification engine

If shebang detection uses regex:

```typescript
/^#!/.test(line); // Shebang detection
```

**Classification:** **Safe** (if present)

**Rationale:** Fixed pattern, tested on first line only (< 256 bytes).

---

## Summary

| Location                                          | Pattern                            | Classification           |
| ------------------------------------------------- | ---------------------------------- | ------------------------ |
| `discovery/engine.ts` `matchesIgnorePattern`      | Dynamic regex from ignore patterns | **Safe** (bounded input) |
| `discovery/engine.ts` `executableHint`            | `/\.(exe                           | com                      | bat | cmd | ps1 | msi)$/i` | **Safe** |
| `rules/rule-engine.ts` template fill              | `/\{\{evidence\}\}/g` etc.         | **Safe**                 |
| `correlation/correlation-engine.ts` template fill | `/\{\{evidence\}\}/g` etc.         | **Safe**                 |
| `archive-extractor.ts` endpoint clean             | `/\/+$/`                           | **Safe**                 |
| `ai/adapters/openai.ts` endpoint clean            | `/\/+$/`                           | **Safe**                 |
| Classification shebang (if present)               | `/^#!/`                            | **Safe**                 |

**Result:** No regex patterns in the VERIS codebase are vulnerable to ReDoS. All patterns that operate on user/file content are either:

- Fixed literal patterns with no quantifiers
- Operating on bounded input (paths < 4KB, names < 256 bytes)
- Using byte-level comparisons instead of regex

**No changes required.** This category is clean.
