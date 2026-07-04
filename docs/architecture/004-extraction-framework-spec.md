# VERIS Feature Extraction Framework & Artifact Analysis Pipeline — SPEC-004

**Status:** Frozen  
**Version:** 1.0  
**Applies to:** Extraction framework, artifact classification, extractor architecture, feature normalization, validation, diagnostics.  
**Scope:** V1 through V4 without architectural redesign.

---

## Table of Contents

1. [Extraction Pipeline Overview](#1-extraction-pipeline-overview)
2. [Design Philosophy](#2-design-philosophy)
3. [Artifact Discovery](#3-artifact-discovery)
4. [Artifact Classification](#4-artifact-classification)
5. [Extractor Architecture](#5-extractor-architecture)
   - 5.1 Extractor Interface (Canonical)
   - 5.2 Registration & Discovery
   - 5.3 Extractor Versioning
   - 5.4 Capability Declaration
   - 5.5 Dependency Contracts
   - 5.6 Priorities & Selection Algorithm
   - 5.7 Fallback Extractors
   - 5.8 Composite Extractors
   - 5.9 Multi-Pass Extraction
6. [Built-in Extractors](#6-built-in-extractors)
   - 6.1 Script Extractors
   - 6.2 Executable Extractors
   - 6.3 Archive Extractors
   - 6.4 Configuration Extractors
   - 6.5 Repository Extractors
   - 6.6 Document Extractors
   - 6.7 Certificate Extractors
7. [Feature Normalization](#7-feature-normalization)
   - 7.1 Normalization Pipeline
   - 7.2 Language-to-Feature Mapping Strategy
   - 7.3 Feature Canonicalization
   - 7.4 Feature Enrichment
8. [Feature Validation](#8-feature-validation)
9. [Extractor Diagnostics](#9-extractor-diagnostics)
10. [Performance Strategy](#10-performance-strategy)
11. [Future Compatibility](#11-future-compatibility)
12. [Engineering Tradeoffs](#12-engineering-tradeoffs)
13. [Common Mistakes to Avoid](#13-common-mistakes-to-avoid)
14. [Final Recommendations](#14-final-recommendations)

---

## 1. Extraction Pipeline Overview

The extraction pipeline is frozen as:

```
  Raw Input (filesystem / stdin / stream)
      │
      ▼
  ┌──────────────────┐
  │   Discovery       │  Find all candidate artifacts
  └──────────────────┘
      │
      ▼
  ┌──────────────────┐
  │   Classification  │  Determine artifact type (multi-signal)
  └──────────────────┘
      │
      ▼
  ┌──────────────────┐
  │   Selection       │  Select artifacts for extraction
  └──────────────────┘
      │
      ▼
  ┌──────────────────┐
  │   Extractor       │  Match & select extractor(s) per artifact
  │   Selection       │
  └──────────────────┘
      │
      ▼
  ┌──────────────────┐
  │   Feature         │  Run selected extractor(s)
  │   Extraction      │  (may be multi-pass)
  └──────────────────┘
      │
      ▼
  ┌──────────────────┐
  │   Normalization   │  Canonicalize extracted features
  └──────────────────┘
      │
      ▼
  ┌──────────────────┐
  │   Validation      │  Validate, deduplicate, filter
  └──────────────────┘
      │
      ▼
  ┌──────────────────┐
  │   Feature         │  Emit to Knowledge Layer
  │   Emission        │
  └──────────────────┘
      │
      ▼
  ┌──────────────────┐
  │   Knowledge       │  Behavior classification
  │   Layer           │
  └──────────────────┘
```

**Invariants:**

- No stage may be skipped.
- Classification must use multiple signals.
- Extractors emit Features only — never Findings, never Behaviors.
- The rest of the engine operates exclusively on normalized Features.
- Partial extraction failure must not abort the pipeline.

---

## 2. Design Philosophy

### 2.1 Extractors Produce Features, Never Conclusions

An extractor observes and reports. It does not classify, score, or judge. A Feature says "this artifact contains a string `eval(` at line 42." It does not say "this is code injection." Classification belongs to the Knowledge Layer, judgment belongs to the Rule Engine.

### 2.2 Multi-Signal Classification

Artifact type is determined by combining magic bytes, MIME detection, file signature analysis, extension heuristic, and content inspection. No single signal is trusted. Conflicts are resolved by weighted voting.

### 2.3 Parser Resilience

Extractors MUST handle malformed input gracefully. A syntax error in a Python script does not prevent extraction of the valid portions. Parser recovery is a first-class feature, not an afterthought.

### 2.4 Boundary Enforcement

Every extractor defines explicit boundaries: maximum file size, maximum nesting depth, maximum string length, maximum execution time. Exceeding any boundary produces a partial result (with a diagnostic flag), not a crash.

### 2.5 Language Agnostic Output

After normalization, all language/format-specific details are removed. The Knowledge Layer and downstream engines see only canonical Feature types. The original language is recorded as metadata but never used for analysis.

### 2.6 Deterministic Extraction

Given the same file, the same extractor version must produce the same Features. No randomness, no network calls, no external state.

---

## 3. Artifact Discovery

**Purpose:** Find all candidate artifacts from the scan target.

**Input:** Scan target path(s) — file, directory, archive, repository, stdin stream.

**Output:** Ordered list of `RawArtifact` references.

```typescript
interface RawArtifact {
  path: string; // Original path (or identifier for streams)
  size: number; // Size in bytes
  mode: 'file' | 'directory' | 'stream';
  parentPath: string | null; // Parent artifact path
}
```

**Discovery strategies by target type:**

| Target Type     | Discovery Strategy                                                                        |
| --------------- | ----------------------------------------------------------------------------------------- |
| Single file     | Return the file as a single RawArtifact                                                   |
| Directory       | Recursive walk with configurable filters (gitignore, max depth, include/exclude patterns) |
| Archive         | Delegate to archive extractor, then discover extracted contents                           |
| Repository      | Delegate to repository extractor, then discover repository structure                      |
| stdin           | Wrap as a single unnamed artifact                                                         |
| Stdin (tar/zip) | Detect stream format, pipe through archive extractor                                      |

**Respecting `.gitignore`:**

- When scanning a directory, discover reads `.gitignore` (and `.verisignore`) to exclude files.
- Explicitly included paths override ignore rules.

**Max artifact limits:**

| Limit                | Default | Configurable |
| -------------------- | ------- | ------------ |
| Max files scanned    | 100,000 | Yes          |
| Max depth            | 50      | Yes          |
| Max single file size | 100 MB  | Yes          |
| Max total scan size  | 10 GB   | Yes          |

---

## 4. Artifact Classification

**Purpose:** Determine the type and subType of each artifact using multiple signals.

**Input:** `RawArtifact` (path, size, first N bytes for magic detection).

**Output:** `ClassifiedArtifact`

```typescript
interface ClassifiedArtifact {
  rawPath: string;
  normalizedPath: string;
  size: number;
  type: ArtifactType; // From SPEC-002 §3.2
  subType: string | null; // e.g., "ELF64", "PE32+", "Python3"
  mimeType: string;
  encoding: string | null;
  signatures: ArtifactSignature[]; // Which signals matched
  classificationConfidence: number; // [0.0, 1.0]
}
```

### 4.1 Signal Sources (Priority Order)

| Priority    | Signal              | Source                                            | Strength                                  |
| ----------- | ------------------- | ------------------------------------------------- | ----------------------------------------- |
| 1 (highest) | Magic bytes         | First 16–64 bytes of file content                 | High — definitive for most binary formats |
| 2           | File signature      | Known byte patterns at specific offsets           | High — PE `MZ`, ELF `\x7fELF`, ZIP `PK`   |
| 3           | MIME type           | `file` magic database or pure-JS equivalent       | High — standardized                       |
| 4           | Shebang             | First line for scripts (`#!/usr/bin/env python3`) | High — definitive for scripts             |
| 5           | BOM                 | Byte Order Mark for text encoding                 | Medium — encoding only                    |
| 6           | Extension heuristic | `.py`, `.js`, `.exe`, `.dll`                      | Medium — never trusted alone              |
| 7           | Content sampling    | First N KB of text content                        | Low — fallback for unknown types          |

### 4.2 Classification Matrix

| Signature Match | Extension | MIME                | Shebang             | Classified Type                 |
| --------------- | --------- | ------------------- | ------------------- | ------------------------------- |
| `\x7fELF`       | —         | —                   | —                   | `executable` / `ELF`            |
| `MZ`            | —         | —                   | —                   | `executable` / `PE`             |
| `PK`            | `.zip`    | —                   | —                   | `archive` / `ZIP`               |
| —               | `.py`     | `text/x-python`     | `#!/usr/bin/python` | `script` / `Python`             |
| —               | `.ps1`    | `text/powershell`   | —                   | `script` / `PowerShell`         |
| —               | `.js`     | `text/javascript`   | `#!/usr/bin/node`   | `script` / `JavaScript`         |
| —               | `.json`   | `application/json`  | —                   | `configuration` / `JSON`        |
| —               | `.env`    | —                   | —                   | `configuration` / `Environment` |
| —               | `.dll`    | `application/x-dll` | —                   | `executable` / `PE` (DLL)       |

**Conflict resolution:** When signals disagree, a weighted vote determines the classification.

```typescript
interface ClassificationVote {
  type: ArtifactType;
  subType: string | null;
  weight: number; // Signal strength weight
  signal: string; // Which signal contributed
}
```

**Conflict examples:**

- File has `PK` magic bytes (archive/ZIP) but `.exe` extension (executable/PE) → Magic bytes win (priority 1). Classified as `archive/ZIP` with a note about extension mismatch.
- File has no magic bytes, no shebang, MIME says `text/plain`, extension `.py` → Extension + MIME → `script/Python` with `classificationConfidence: 0.7`.

### 4.3 Classification Cache

Classification results are cached per (contentHash, size) pair. If the same artifact content is encountered again (e.g., duplicate files), the cached classification is used.

---

## 5. Extractor Architecture

### 5.1 Extractor Interface (Canonical)

```typescript
interface Extractor {
  // ── Identity ──
  readonly id: string; // "python-script-extractor"
  readonly version: string; // semver
  readonly name: string; // "Python Script Extractor"
  readonly description: string;

  // ── Supported artfacts ──
  readonly supportedTypes: ArtifactType[];
  readonly supportedSubTypes: string[]; // e.g., ["Python", "Python3", "Python2"]

  // ── Capabilities ──
  readonly capabilities: ExtractorCapability[];

  // ── Boundaries ──
  readonly limits: ExtractorLimits;

  // ── Lifecycle ──
  canHandle(artifact: ClassifiedArtifact, context: ExtractorContext): boolean;
  extract(artifact: ClassifiedArtifact, context: ExtractorContext): Promise<ExtractionResult>;
}
```

**ExtractorContext:**

```typescript
interface ExtractorContext {
  sessionId: SessionId;
  config: ExtractorConfig; // Per-extractor configuration
  logger: Logger; // Scoped logger (prefixed with extractor ID)
  signal: AbortSignal; // For cancellation
  diagnostics: boolean; // Enable diagnostic trace?
}
```

**ExtractionResult:**

```typescript
interface ExtractionResult {
  artifactId: ArtifactId; // The artifact that was extracted
  features: Feature[]; // Extracted features (SPEC-002 §3.3)
  capabilities: Capability[]; // Extracted capabilities (SPEC-002 §3.14)
  metadata: Record<string, unknown>; // Extractor-specific metadata
  diagnostics: ExtractionDiagnostics;
}

interface ExtractionDiagnostics {
  durationMs: number;
  bytesProcessed: number;
  featuresExtracted: number;
  featuresSkipped: number;
  errors: ExtractionError[];
  warnings: string[];
  parserRecoveryCount: number;
  truncated: boolean; // Was extraction truncated due to limits?
}
```

**ExtractorLimits:**

```typescript
interface ExtractorLimits {
  maxFileSize: number; // Bytes. Larger files are not extracted.
  maxStringLength: number; // Characters. Longer strings are truncated.
  maxAstDepth: number; // AST nodes. Deeper trees are truncated.
  maxExtractionTimeMs: number; // Millisecond timeout.
  maxFeaturesPerArtifact: number; // Feature count cap.
}
```

### 5.2 Registration & Discovery

**Registration:**

- Built-in extractors are registered in `ExtractorRegistry` at package initialization.
- Each extractor calls `registry.register(myExtractor)`.
- Registry validates uniqueness of `extractor.id`.

**Discovery:**

- When an artifact needs extraction, the registry queries all extractors matching the artifact's type/subType.
- Matching is done via `canHandle()` which checks:
  1. Artifact type is in `supportedTypes`
  2. Artifact subType is in `supportedSubTypes` (or `supportedSubTypes` is empty = accepts any)
  3. Extractor-specific preconditions (e.g., minimum file size)
  4. Artifact is not excluded by configuration

```typescript
interface ExtractorRegistry {
  register(extractor: Extractor): void;
  unregister(id: string): void;
  findFor(artifact: ClassifiedArtifact, context: ExtractorContext): Extractor[];
  get(id: string): Extractor | undefined;
  list(): Extractor[];
}
```

### 5.3 Extractor Versioning

**Version format:** `MAJOR.MINOR.PATCH` (semver)

| Component | Change                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------- |
| **Major** | Changing emitted Feature types. Removing Feature categories. Breaking change to normalization output. |
| **Minor** | Adding new Feature types. Adding new Capability categories. Adding new language constructs.           |
| **Patch** | Fixing parser bugs. Improving error recovery. Adding new syntactic sugar patterns.                    |

**Compatibility:**

- Engine only loads extractors with `minEngineVersion` ≤ engine version.
- Extractor version is recorded in every Feature's `metadata.extractorVersion`.
- Downstream consumers (Knowledge Layer, Rule Engine) pin the extractor version for reproducibility.

### 5.4 Capability Declaration

Each extractor declares what it can extract:

```typescript
interface ExtractorCapability {
  category: CapabilityCategory; // From SPEC-002 §3.14
  featureTypes: FeatureType[]; // Feature types this extractor can produce
  description: string;
  confidence: number; // [0.0, 1.0] — How reliable is this capability?
  languages: string[]; // Which languages/format does this apply to
}
```

**Example — Python Extractor capabilities:**

```typescript
const pythonExtractorCapabilities = [
  {
    category: 'file-system-read',
    featureTypes: ['function-call', 'string-literal'],
    description: 'File read operations (open(), read(), readline())',
    confidence: 0.95,
    languages: ['Python'],
  },
  {
    category: 'network-connect',
    featureTypes: ['function-call', 'url'],
    description: 'HTTP requests (requests.get(), urllib.request.urlopen())',
    confidence: 0.95,
    languages: ['Python'],
  },
  {
    category: 'code-evaluation',
    featureTypes: ['function-call', 'string-literal'],
    description: 'Code evaluation (eval(), exec(), compile())',
    confidence: 0.98,
    languages: ['Python'],
  },
];
```

### 5.5 Dependency Contracts

Extractors may declare dependencies on other extractors:

```typescript
interface ExtractorDependency {
  extractorId: string; // Required extractor
  version: string; // Version range
  optional: boolean; // If true, continue without this dependency
  description: string; // Why this dependency exists
}
```

**Example:**

- `repository-extractor` depends on `git-extractor` for Git metadata extraction.
- `archive-extractor` depends on format-specific decompressors.
- A dependency failure → the dependent extractor runs with reduced capability (logged in diagnostics).

### 5.6 Priorities & Selection Algorithm

**Extractor priority levels:**

| Priority     | Range   | Behavior                                                          |
| ------------ | ------- | ----------------------------------------------------------------- |
| `specific`   | 0–99    | Language/format-specific extractors (Python, PE, ZIP). Run first. |
| `generic`    | 100–199 | Generic extractors (text, binary). Run as fallback.               |
| `composite`  | 200–299 | Composite extractors that delegate to sub-extractors.             |
| `diagnostic` | 300+    | Diagnostic-only extractors (entropy, fingerprint). Run last.      |

**Selection algorithm:**

```
For each ClassifiedArtifact:
  1. Query registry.findFor(artifact)
  2. Sort by priority (ascending)
  3. Filter by canHandle() (removes extractors that don't apply)
  4. Group by priority tier:
     - Specific extractors: try each in priority order until one succeeds
     - If none succeed → try Generic extractors
     - If none succeed → try Composite extractors
     - If none succeed → mark artifact as unextractable (with diagnostic)
  5. For each selected extractor:
     - Run extract()
     - Collect ExtractionResult
     - If extractor fails → log error, try next in tier
```

### 5.7 Fallback Extractors

**Text fallback:**

- If no specific script extractor matches a text file, the `text-extractor` runs.
- It emits Features for: string literals (by heuristic), line counts, encoding detection, and structural patterns (indentation, comment ratio).

**Binary fallback:**

- If no specific executable extractor matches a binary file, the `binary-extractor` runs.
- It emits Features for: entropy, string-like byte sequences, section detection, and file structure metadata.

**Archive fallback:**

- If the archive type is unknown but magic bytes suggest compression, the generic archive extractor attempts extraction with available decompressors.

### 5.8 Composite Extractors

Composite extractors delegate to sub-extractors and merge results:

```typescript
interface CompositeExtractor extends Extractor {
  subExtractors: Extractor[]; // Sub-extractors to run
  mergeStrategy:
    | 'union' // Merge all features
    | 'first-pass' // First successful extraction wins
    | 'intersection'; // Only features common to all sub-extractors
}
```

**Example — Script Extractor Composite:**

```
ScriptExtractor (composite, mergeStrategy: "union")
  ├── PythonExtractor (specific, priority 10)
  ├── JavaScriptExtractor (specific, priority 10)
  ├── PowerShellExtractor (specific, priority 10)
  ├── BashExtractor (specific, priority 10)
  └── TextExtractor (generic, priority 100) → fallback
```

### 5.9 Multi-Pass Extraction

Some artifacts require multiple extraction passes:

```
Pass 1: Structural extraction (AST parsing, section parsing)
  → Produces structural Features (function definitions, imports, sections)

Pass 2: Semantic extraction (data flow, string analysis)
  → Consumes Pass 1 output + raw artifact
  → Produces semantic Features (data flow edges, string construction patterns)

Pass 3: Behavioral extraction (capability aggregation)
  → Consumes Pass 1 + Pass 2 output
  → Produces Capabilities
```

**Pass orchestration:**

- Passes are declared in the extractor definition.
- Passes execute in order.
- Each pass receives the output of previous passes.
- A pass may be skipped if insufficient data from previous passes.
- All passes must complete within the extractor's time limit.

---

## 6. Built-in Extractors

### 6.1 Script Extractors

| Extractor             | ID                     | Supported SubTypes               | Emitted Feature Categories                                                               |
| --------------------- | ---------------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| Python                | `python-extractor`     | Python, Python3, Python2         | function-call, string-literal, import-statement, url, file-path, control-flow, data-flow |
| JavaScript/TypeScript | `javascript-extractor` | JavaScript, TypeScript, JSX, TSX | function-call, string-literal, import-statement, url, file-path, control-flow, data-flow |
| PowerShell            | `powershell-extractor` | PowerShell, PS1, PSM1            | function-call, string-literal, url, file-path, registry-key, environment-variable        |
| Bash/Shell            | `bash-extractor`       | Bash, Shell, SH                  | function-call, string-literal, file-path, environment-variable, control-flow             |
| Batch                 | `batch-extractor`      | Batch, BAT, CMD                  | function-call, string-literal, file-path, environment-variable                           |
| VBScript              | `vbscript-extractor`   | VBScript, VBS                    | function-call, string-literal, file-path, registry-key                                   |

**Language-specific extraction strategies:**

| Language   | Strategy                                           | Parser               | Limitations                                                 |
| ---------- | -------------------------------------------------- | -------------------- | ----------------------------------------------------------- |
| Python     | AST-based parsing of source code                   | Grammar-based parser | Dynamic features not fully resolved; type inference limited |
| JavaScript | AST-based parsing with dynamic pattern recognition | Grammar-based parser | Minified code reduces extraction quality                    |
| PowerShell | Tokenizer + AST for known cmdlets                  | Tokenizer            | Custom functions not resolved                               |
| Bash       | Shell parser (abstract syntax tree)                | Grammar-based parser | Variable interpolation not fully resolved                   |
| Batch      | Line-by-line cmdlet detection                      | Tokenizer            | Control flow limited                                        |
| VBScript   | Tokenizer + regex patterns                         | Tokenizer            | Complex expressions partially supported                     |

### 6.2 Executable Extractors

| Extractor | ID                | Supported SubTypes        | Emitted Feature Categories                                               |
| --------- | ----------------- | ------------------------- | ------------------------------------------------------------------------ |
| PE        | `pe-extractor`    | PE, PE32, PE32+, DLL      | section-header, symbol, import-statement, string-pattern, metadata-field |
| ELF       | `elf-extractor`   | ELF, ELF32, ELF64, ELF32+ | section-header, symbol, import-statement, string-pattern, metadata-field |
| Mach-O    | `macho-extractor` | Mach-O, MH                | section-header, symbol, import-statement, string-pattern, metadata-field |

**PE Extractor details:**

- Parses DOS header, PE header, section table, import table, export table, resource table
- Extracts: imported functions, exported functions, section names/characteristics, embedded strings, version info, digital signature status, compile timestamps
- Limitations: Packed executables cannot be fully analyzed. .NET executables require separate analysis.

**ELF Extractor details:**

- Parses ELF header, program headers, section headers, dynamic section, symbol tables
- Extracts: imported functions, exported functions, section names, segment types, interpreter path, RUNPATH/RPATH
- Limitations: Stripped binaries reduce available symbols.

**Mach-O Extractor details:**

- Parses Mach-O header, load commands, segment commands, symbol table, dynamic loader info
- Extracts: imported functions, exported functions, segment/section info, linked frameworks, LC commands
- Limitations: Fat binaries are split and analyzed per architecture.

### 6.3 Archive Extractors

| Extractor | ID                 | Supported SubTypes                      | Emitted Features                                    |
| --------- | ------------------ | --------------------------------------- | --------------------------------------------------- |
| ZIP       | `zip-extractor`    | ZIP                                     | Nested artifacts, entry metadata, compression ratio |
| 7z        | `sevenz-extractor` | 7z                                      | Nested artifacts, entry metadata                    |
| TAR       | `tar-extractor`    | TAR, TAR.GZ, TAR.BZ2, TAR.XZ, TGZ, TBZ2 | Nested artifacts, entry metadata                    |
| GZip      | `gzip-extractor`   | GZ, GZIP                                | Decompressed artifact                               |
| BZip2     | `bzip2-extractor`  | BZ2, BZIP2                              | Decompressed artifact                               |
| XZ        | `xz-extractor`     | XZ                                      | Decompressed artifact                               |
| RAR       | `rar-extractor`    | RAR                                     | Nested artifacts, entry metadata                    |
| ISO       | `iso-extractor`    | ISO                                     | Nested artifacts, file system metadata              |

**Archive extraction boundaries:**

| Boundary                  | Default | Rationale                    |
| ------------------------- | ------- | ---------------------------- |
| Max nesting depth         | 10      | Prevents zip bombs           |
| Max extracted files       | 10,000  | Prevents resource exhaustion |
| Max decompression ratio   | 100:1   | Zip bomb detection           |
| Max single extracted file | 100 MB  | Memory protection            |
| Max archive size          | 1 GB    | Time protection              |

### 6.4 Configuration Extractors

| Extractor   | ID                    | Supported SubTypes | Emitted Features                                                |
| ----------- | --------------------- | ------------------ | --------------------------------------------------------------- |
| JSON        | `json-extractor`      | JSON               | string-literal, numeric-literal, boolean, url, file-path        |
| YAML        | `yaml-extractor`      | YAML               | string-literal, numeric-literal, boolean, url, file-path        |
| XML         | `xml-extractor`       | XML                | string-literal, numeric-literal, url, file-path, metadata-field |
| INI         | `ini-extractor`       | INI, CFG           | string-literal, numeric-literal, file-path                      |
| TOML        | `toml-extractor`      | TOML               | string-literal, numeric-literal, file-path                      |
| Environment | `env-extractor`       | ENV, env           | string-literal, url, file-path, identifier                      |
| .gitignore  | `gitignore-extractor` | gitignore          | string-pattern, file-path                                       |

### 6.5 Repository Extractors

| Extractor            | ID                         | Extracted Data                                                                                    |
| -------------------- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| Git Metadata         | `git-extractor`            | Commit history, branch structure, file change frequency, contributor analysis, gitignore patterns |
| Repository Structure | `repo-structure-extractor` | Directory tree, file relationships, dependency files, CI configuration                            |

### 6.6 Document Extractors

| Extractor       | ID                      | Extracted Data                                                      |
| --------------- | ----------------------- | ------------------------------------------------------------------- |
| PDF Metadata    | `pdf-extractor`         | Metadata fields, embedded URLs, JavaScript actions, embedded files  |
| Office Document | `office-extractor`      | Macros, embedded objects, external references, metadata             |
| Certificate     | `certificate-extractor` | Certificate chain, validity, issuer, subject, extensions, key usage |

### 6.7 Certificate Extractors

| Extractor       | ID              | Supported SubTypes  | Emitted Features                                                                           |
| --------------- | --------------- | ------------------- | ------------------------------------------------------------------------------------------ |
| PEM Certificate | `pem-extractor` | PEM, CRT, CERT, KEY | metadata-field, string-literal (issuer, subject), numeric-literal (serial, validity dates) |
| DER Certificate | `der-extractor` | DER                 | metadata-field, binary-pattern                                                             |

---

## 7. Feature Normalization

### 7.1 Normalization Pipeline

```
  Raw Features (from extractor)
      │
      ▼
  ┌──────────────────┐
  │   Canonicalize    │  Map extractor-specific types to canonical FeatureType
  └──────────────────┘
      │
      ▼
  ┌──────────────────┐
  │   Normalize       │  Transform values to canonical FeatureValue format
  │   Values          │
  └──────────────────┘
      │
      ▼
  ┌──────────────────┐
  │   Enrich          │  Add context (surrounding code, computed metadata)
  └──────────────────┘
      │
      ▼
  ┌──────────────────┐
  │   Validate        │  Schema validation, bounds checking
  └──────────────────┘
      │
      ▼
  ┌──────────────────┐
  │   Deduplicate     │  Remove duplicate features within artifact
  └──────────────────┘
      │
      ▼
  ┌──────────────────┐
  │   Index           │  Build location-based index for fast lookup
  └──────────────────┘
      │
      ▼
  Normalized Feature[]
```

### 7.2 Language-to-Feature Mapping Strategy

The goal of normalization is to produce language-agnostic Features. The mapping is:

```typescript
interface NormalizationRule {
  extractorId: string; // Which extractor this applies to
  language: string; // Source language
  sourcePattern: string; // Source construct description
  sourceExamples: string[]; // Examples in source language
  targetFeatureType: FeatureType; // Canonical FeatureType
  targetCapabilityCategory: CapabilityCategory | null;
  valueTransformer: string; // How to transform the extracted value
}
```

**Normalization examples:**

| Source Language | Source Construct              | Canonical FeatureType | Canonical CapabilityCategory |
| --------------- | ----------------------------- | --------------------- | ---------------------------- |
| Python          | `open("file.txt")`            | `file-path`           | `file-system-read`           |
| JavaScript      | `fs.readFileSync("file.txt")` | `file-path`           | `file-system-read`           |
| PowerShell      | `Get-Content file.txt`        | `file-path`           | `file-system-read`           |
| Bash            | `cat file.txt`                | `file-path`           | `file-system-read`           |
| Python          | `eval("...")`                 | `function-call`       | `code-evaluation`            |
| JavaScript      | `eval("...")`                 | `function-call`       | `code-evaluation`            |
| PowerShell      | `Invoke-Expression "..."`     | `function-call`       | `code-evaluation`            |
| PE              | `CreateFileA` import          | `function-call`       | `file-system-read`           |
| ELF             | `open` symbol                 | `function-call`       | `file-system-read`           |
| Python          | `requests.get(url)`           | `url`                 | `network-connect`            |
| JavaScript      | `fetch(url)`                  | `url`                 | `network-connect`            |

### 7.3 Feature Canonicalization

**Value canonicalization:**

| Source Value                | Normalized                                              |
| --------------------------- | ------------------------------------------------------- |
| `'AKIAIOSFODNN7EXAMPLE'`    | `{ kind: "string", value: "AKIAIOSFODNN7EXAMPLE" }`     |
| `42`                        | `{ kind: "number", value: 42 }`                         |
| `true`                      | `{ kind: "boolean", value: true }`                      |
| `"http://evil.com/payload"` | `{ kind: "string", value: "http://evil.com/payload" }`  |
| `0x7F 0x45 0x4C 0x46`       | `{ kind: "bytes", value: "7f454c46", encoding: "hex" }` |

**Location canonicalization:**

All extractors must produce `SourceLocation` in the same format:

```typescript
interface SourceLocation {
  startLine: number; // 1-based
  startColumn: number; // 0-based
  endLine: number; // 1-based
  endColumn: number; // 0-based
  offset: number; // Byte offset from start
  length: number; // Length in bytes
  context: string; // 50 chars before and after
}
```

### 7.4 Feature Enrichment

After canonicalization, features may be enriched with additional context:

```typescript
interface Enrichment {
  surroundingCode: string; // 3 lines of context around the feature
  computedEntropy: number | null; // Shannon entropy of the value
  valueLength: number; // Length of the value
  detectedEncoding: string | null; // Detected encoding
}
```

Enrichment is optional and must not change the fundamental classification of the feature.

---

## 8. Feature Validation

### 8.1 Feature Schema Validation

Every Feature is validated against its schema:

```typescript
interface FeatureValidationRule {
  featureType: FeatureType;
  rules: {
    field: string;
    constraint: 'required' | 'non-empty' | 'range' | 'pattern' | 'type';
    value: unknown;
  }[];
}
```

**Built-in validation rules:**

| Rule                                     | Description     | Applies To   |
| ---------------------------------------- | --------------- | ------------ |
| `id` must be non-empty string            | Identity        | All Features |
| `type` must be known FeatureType         | Type validity   | All Features |
| `confidence` in [0.0, 1.0]               | Range           | All Features |
| `value` must match its `kind`            | Type            | All Features |
| `location.startLine <= location.endLine` | Line order      | All Features |
| `location.offset >= 0`                   | Offset validity | All Features |

### 8.2 Duplicate Removal

**Duplicate detection:**

- Two Features are duplicates if they have the same `(artifactId, type, value hash, location)`.
- Deterministic ID collision is used for dedup (same content → same ID → duplicate).

**Dedup behavior:**

- First occurrence is kept.
- Subsequent duplicates are discarded and counted in `diagnostics.featuresSkipped`.
- Dedup is per-artifact, not per-session (same Feature in two artifacts is not a duplicate — they came from different sources).

### 8.3 Invalid Feature Handling

| Invalid Condition            | Action                                       |
| ---------------------------- | -------------------------------------------- |
| Missing required field       | Feature is discarded with diagnostic warning |
| Out-of-range confidence      | Clamped to [0.0, 1.0]                        |
| Invalid `FeatureType` string | Feature discarded, diagnostic logged         |
| Negative offset              | Treated as offset = 0                        |
| `endLine < startLine`        | Swapped                                      |
| Empty value string           | Allowed (empty strings are valid features)   |

### 8.4 Partial Extraction

If an extractor encounters errors mid-extraction:

1. All successfully extracted Features up to the error point are retained.
2. The error is recorded in `ExtractionResult.diagnostics.errors`.
3. Extraction continues from the next valid position (if parser recovery is possible).
4. The `ExtractionResult.diagnostics.truncated` flag is set if limits were exceeded.

### 8.5 Parser Recovery

**Recovery strategies by parser type:**

| Parser Type                          | Recovery Strategy                                                         |
| ------------------------------------ | ------------------------------------------------------------------------- |
| AST parser (Python, JS, TS)          | Error-tolerant parsing: skip the failing node, continue from next sibling |
| Tokenizer (PowerShell, Batch)        | Skip the failing token, continue from next token                          |
| Regex-based (VBScript, config files) | Skip the failing line, continue from next line                            |
| Binary parser (PE, ELF, Mach-O)      | Skip the failing section/segment, continue with remaining sections        |
| Archive parser (ZIP, TAR)            | Skip the failing entry, continue with remaining entries                   |

**Recovery is counted:**

- `parserRecoveryCount` in diagnostics tracks how many times recovery was attempted.
- High recovery counts indicate malformed input.

### 8.6 Malformed File Handling

| Scenario                                         | Action                                                |
| ------------------------------------------------ | ----------------------------------------------------- |
| File is empty                                    | Extract nothing, produce zero Features. Not an error. |
| File is binary (not matching any extractor)      | Delegate to `binary-extractor` fallback               |
| File is encrypted/obfuscated                     | Extract metadata only, set `truncated: true`          |
| File is truncated (shorter than expected header) | Extract available data, log warning                   |
| File is detected as malicious (zip bomb)         | Abort extraction, log security warning, skip artifact |

---

## 9. Extractor Diagnostics

### 9.1 Extractor Timing

```
Extractor Timing Report:
┌─────────────────────────────┬──────────┬──────────┬──────────┬──────────┐
│ Extractor                   │ Count    │ P50(ms)  │ P95(ms)  │ P99(ms)  │
├─────────────────────────────┼──────────┼──────────┼──────────┼──────────┤
│ python-extractor            │ 1,234    │ 45.2     │ 234.5    │ 1,234.5  │
│ pe-extractor                │ 567      │ 12.3     │ 67.8     │ 345.6    │
│ zip-extractor               │ 234      │ 5.6      │ 23.4     │ 89.0     │
│ text-extractor              │ 4,567    │ 0.8      │ 3.4      │ 12.3     │
└─────────────────────────────┴──────────┴──────────┴──────────┴──────────┘

Slowest extractors by average:
1. python-extractor       avg: 45.2ms
2. pe-extractor           avg: 12.3ms
3. powershell-extractor   avg: 8.9ms
```

### 9.2 Selection Decisions

```
Selection Decisions:
  Artifact: src/main.py (Python)
    ✓ python-extractor (priority 10) → selected
    ✓ text-extractor (priority 100) → not selected (specific already selected)

  Artifact: unknown.bin (no classification)
    ✗ pe-extractor (priority 10) → not selected (canHandle returned false)
    ✗ elf-extractor (priority 10) → not selected (canHandle returned false)
    ✓ binary-extractor (priority 100) → selected (fallback)

  Artifact: malicious.zip (ZIP bomb detected)
    ✗ zip-extractor → not selected (security limit exceeded)
    → Artifact skipped with diagnostic
```

### 9.3 Fallback Usage

```
Fallback Usage:
  Artifact: strange.xyz
    Primary extractors: none matched
    Fallback: binary-extractor → extracted 12 features, 3 capabilities

  Total fallback usage: 23 artifacts (2.3% of total)
  Fallback breakdown:
    - text-extractor: 15 artifacts
    - binary-extractor: 8 artifacts
```

### 9.4 Recovery Paths

```
Parser Recovery Report:
  Extractor: python-extractor
    Total artifacts parsed: 1,234
    Clean parses: 1,189 (96.4%)
    Recovered errors: 45 (3.6%)
    Recovery types:
      - SyntaxError (unclosed paren): 23
      - SyntaxError (unexpected indent): 12
      - FString error: 7
      - Encoding error: 3

  Extractor: pe-extractor
    Total artifacts parsed: 567
    Clean parses: 560 (98.8%)
    Recovered errors: 7 (1.2%)
    Recovery types:
      - Truncated header: 4
      - Invalid section alignment: 3
```

### 9.5 Unsupported Syntax

```
Unsupported Syntax Report:
  Extractor: python-extractor
    walrus operator (:=): detected in 12 files, features emitted: partial
    match/case (3.10+): detected in 5 files, features emitted: partial
    type hints with | union: detected in 8 files, features emitted: full

  Extractor: javascript-extractor
    nullish coalescing (??): detected in 15 files, features emitted: full
    optional chaining (?.): detected in 10 files, features emitted: full
    top-level await: detected in 3 files, features emitted: partial
```

### 9.6 Parser Failures

```
Parser Failure Report:
  Extractor: python-extractor
    Total failures: 3 (0.24%)
    Failure details:
      - File: corrupted.py — ParserError: unexpected character '\x00' at line 1
        → Partial result: 0 features extracted
      - File: mixed_lang.py — ParserError: invalid syntax (not actually Python)
        → Partial result: 0 features extracted

  Extractor: pe-extractor
    Total failures: 2 (0.35%)
    Failure details:
      - File: fake.exe — Not a PE file (magic bytes mismatch)
        → Partial result: 0 features extracted (fallback to binary-extractor)
```

---

## 10. Performance Strategy

### 10.1 Performance Targets

| Metric                            | Target                          | Measurement |
| --------------------------------- | ------------------------------- | ----------- |
| Single file extraction throughput | ≥ 1,000 files/sec (small files) | Benchmark   |
| AST parsing throughput            | ≥ 100 files/sec (Python/JS)     | Benchmark   |
| Binary parsing throughput         | ≥ 500 files/sec (PE/ELF)        | Benchmark   |
| P95 extraction time per file      | ≤ 100ms                         | Benchmark   |
| P99 extraction time per file      | ≤ 500ms                         | Benchmark   |
| Memory per extraction             | ≤ 10 MB per file                | Benchmark   |

### 10.2 Optimization Techniques

| Technique                   | Applied To           | Expected Gain                                     |
| --------------------------- | -------------------- | ------------------------------------------------- |
| Lazy parsing                | Script extractors    | Only parse files when an extractor is selected    |
| Streaming extraction        | Binary extractors    | Parse headers before full file read               |
| AST caching                 | Script extractors    | Reuse parsed AST for multi-pass extraction        |
| Parallel file extraction    | Pipeline             | Nx speedup for N files (configurable parallelism) |
| Pre-filtering by size       | All extractors       | Skip oversized files before any parsing           |
| Regex compilation cache     | Tokenizer extractors | ~10x speedup for repeated patterns                |
| Zero-copy string extraction | Binary extractors    | Avoid copying large string tables                 |

### 10.3 Memory Budget

| Component                     | Budget      |
| ----------------------------- | ----------- |
| Classification cache          | ~50 MB      |
| Loaded extractors (50)        | ~100 MB     |
| Extraction working set        | ~200 MB     |
| Feature buffer (per artifact) | ~50 MB      |
| **Total active extraction**   | **~400 MB** |

---

## 11. Future Compatibility

### 11.1 Language Expansion (V2+)

New languages are added as new extractors implementing the same `Extractor` interface:

| Language | Priority | Complexity | Parser Approach                |
| -------- | -------- | ---------- | ------------------------------ |
| Rust     | V2       | Medium     | AST-based (syn crate binding)  |
| Go       | V2       | Medium     | AST-based                      |
| Java     | V2       | High       | AST-based (javaparser binding) |
| C#       | V2       | High       | AST-based (Roslyn binding)     |
| C++      | V3       | Very High  | AST-based (libclang binding)   |
| Lua      | V2       | Low        | Tokenizer                      |
| Ruby     | V2       | Medium     | AST-based                      |
| Swift    | V3       | High       | AST-based                      |
| Kotlin   | V3       | Medium     | AST-based                      |

### 11.2 Infrastructure Expansion (V3+)

| Format               | Complexity | Approach                               |
| -------------------- | ---------- | -------------------------------------- |
| Dockerfile           | Low        | Line-by-line instruction parsing       |
| Docker image layers  | High       | Layer extraction + filesystem analysis |
| Terraform            | Medium     | HCL parser                             |
| Kubernetes manifests | Medium     | YAML parser with schema awareness      |
| Helm charts          | Medium     | Template + values analysis             |

### 11.3 Document & Media Expansion (V3+)

| Format                           | Complexity | Approach                                  |
| -------------------------------- | ---------- | ----------------------------------------- |
| Office Open XML (docx/xlsx/pptx) | Medium     | Archive extraction + XML parsing          |
| ODF (odt/ods/odp)                | Medium     | Archive extraction + XML parsing          |
| PDF (full)                       | High       | PDF parser (objects, streams, JS actions) |
| Mobile apps (APK/IPA)            | High       | Archive extraction + manifest analysis    |
| Firmware (raw, UEFI)             | High       | Binary parser                             |

### 11.4 Plugin Extractors (V2+)

- Third-party extractors implement the same `Extractor` interface.
- Loaded via `@veris/plugins` plugin host.
- Sandboxed — no filesystem/network access unless explicitly granted via manifest.
- Plugin extractors declare `minEngineVersion` and are validated at load time.

---

## 12. Engineering Tradeoffs

### 12.1 AST Parsing vs. Regex-Based Extraction

**Tradeoff:** AST parsing is more accurate (understands syntax, resolves scope) but is slower, more complex, and language-specific. Regex-based extraction is fast and language-agnostic but produces lower-quality features (false positives, no scope resolution).

**Decision:** Use AST parsing for primary languages (Python, JavaScript, TypeScript, Bash, PowerShell). Use tokenizer/regex for secondary languages (Batch, VBScript). Use heuristic pattern matching for the text fallback extractor.

### 12.2 Streaming vs. Full-File Extraction

**Tradeoff:** Streaming extraction uses less memory and can start emitting features before the file is fully read. Full-file extraction gives the parser access to the complete file context for better analysis.

**Decision:** Streaming for binary formats (PE, ELF, archive headers). Full-file for script formats (Python, JavaScript) where cross-line analysis is important. Both strategies produce the same `ExtractionResult` interface.

### 12.3 Strict Parsing vs. Error-Tolerant Parsing

**Tradeoff:** Strict parsing is faster and simpler but fails on the first syntax error. Error-tolerant parsing is slower and more complex but produces useful output from partially valid files.

**Decision:** Error-tolerant parsing for all extractors. Strict mode is available as an opt-in configuration for users who need guaranteed correctness over completeness.

### 12.4 Many Small Extractors vs. Few Large Extractors

**Tradeoff:** Many small extractors (one per language/format) are independently testable and replaceable but create registry overhead. Few large extractors (multi-language) reduce registry overhead but increase coupling and testing complexity.

**Decision:** One extractor per language/format. This aligns with the "replaceability" principle from SPEC-001. A new language = a new extractor, not a modification to an existing one.

### 12.5 Built-in vs. Plugin Extraction Models

**Tradeoff:** Built-in extractors are versioned with the engine and guaranteed compatible. Plugin extractors are independently versioned but require a host API stability commitment.

**Decision:** Core extractors (scripts, executables, archives, config) are built-in. Niche extractors (mobile apps, firmware, document formats) are plugin-based starting from V2. The `Extractor` interface is the same for both.

---

## 13. Common Mistakes to Avoid

### 13.1 Extractors Producing Findings

**Mistake:** An extractor that detects a "suspicious" pattern and flags it as a finding, bypassing the Knowledge Layer and Rule Engine.
**Prevention:** Extractors produce Features only. The Rule Engine produces Findings. Enforce this at the type level: `extract()` returns `ExtractionResult`, not `Finding[]`.

### 13.2 Single-Signal Classification

**Mistake:** Classifying an artifact solely by its file extension, leading to misclassification of renamed files or extensionless binaries.
**Prevention:** Always use multi-signal classification. Extension is a hint, never a conclusion.

### 13.3 Brittle AST Parsing

**Mistake:** The Python extractor fails on the entire file because of one syntax error, producing zero features from a mostly valid file.
**Prevention:** Error-tolerant parsing with recovery. A syntax error in one function should not prevent extracting features from the rest of the file.

### 13.4 Ignoring Binary Safety

**Mistake:** A string-pattern extractor reads a binary file as text, producing millions of garbage features and depleting memory.
**Prevention:** Binary detection before string extraction. Entropy and null-byte checks. Size limits on string tables.

### 13.5 Inconsistent Normalization

**Mistake:** Two extractors emit the same logical feature with different `FeatureType` values (e.g., one emits `url` and another emits `string-literal` for the same URL pattern).
**Prevention:** Normalization rules are shared across all extractors. A central mapping table ensures consistency. Integration tests verify cross-extractor normalization.

### 13.6 Unbounded Extraction

**Mistake:** No limits on extraction depth, file size, or string length, allowing a maliciously crafted file to exhaust system resources.
**Prevention:** Every extractor declares explicit limits. The pipeline enforces these limits before calling `extract()`.

### 13.7 Over-Extraction

**Mistake:** Extracting every possible feature from a file, producing thousands of low-value features that overwhelm the downstream analysis (needless behavior classification, rule matching).
**Prevention:** Feature extraction is guided by the extractor's declared capabilities. Only features matching declared capability categories are retained. The text extractor, in particular, applies heuristics to avoid noise.

### 13.8 Ignoring Encoding

**Mistake:** Treating a UTF-16 file as ASCII, producing garbled features.
**Prevention:** BOM detection at the classification stage. Encoding metadata is passed to the extractor. Extractors must handle at least: UTF-8, UTF-16 LE/BE, Latin-1, ASCII.

### 13.9 Language-Specific Assumptions in Downstream Engines

**Mistake:** The Correlation Engine or Rule Engine checking the original language of an artifact to make decisions.
**Prevention:** Language is metadata, not analysis input. The original language is recorded but never used for analysis. All analysis operates on canonical Features.

### 13.10 No Extractor Diagnostics

**Mistake:** An extractor silently fails on a class of files, and developers don't notice until users report missing findings.
**Prevention:** Every extractor produces diagnostics: timing, selection decisions, recovery counts, failures, unsupported syntax. These are surfaced in the diagnostic report and monitored in CI.

---

## 14. Final Recommendations

### 14.1 Implementation Order

| Phase        | Components                                                  | Rationale                                    |
| ------------ | ----------------------------------------------------------- | -------------------------------------------- |
| **Phase 1**  | Extractor interface, ExtractorRegistry, Artifact classifier | Foundation — needed before any extractors    |
| **Phase 2**  | text-extractor, binary-extractor (fallbacks)                | Fallback coverage ensures no file is skipped |
| **Phase 3**  | python-extractor, javascript-extractor, bash-extractor      | Primary script languages                     |
| **Phase 4**  | pe-extractor, elf-extractor                                 | Binary executables                           |
| **Phase 5**  | zip-extractor, tar-extractor                                | Archive handling                             |
| **Phase 6**  | Feature normalization pipeline, validation, dedup           | Core pipeline                                |
| **Phase 7**  | Configuration extractors, environment extractors            | Config analysis                              |
| **Phase 8**  | powershell-extractor, batch-extractor, vbscript-extractor   | Secondary script languages                   |
| **Phase 9**  | Repository extractors, certificate extractors               | Specialized extractors                       |
| **Phase 10** | Diagnostic system, benchmarks                               | Quality assurance                            |

### 14.2 Critical Success Factors

1. **Fallbacks first.** Before writing any language-specific extractor, write the text and binary fallbacks. This ensures every file produces at least some features from day one.
2. **Normalization is the hard part.** The extractor itself is straightforward. The hard work is in the normalization rules that map language-specific constructs to canonical Features. Invest heavily in normalization tests.
3. **Parser recovery is not optional.** Malformed files are the rule, not the exception. Every extractor must handle syntax errors gracefully.
4. **Classification is multi-signal.** No single signal is trusted. Always combine magic bytes, MIME, shebang, and extension.
5. **Limits protect everything.** Every extractor must have explicit, configurable limits. A malformed file should never crash the engine.
6. **Test with real-world files.** Synthetic fixtures are useful for development, but real-world files from public repositories are essential for validation.
7. **Diagnose everything.** The diagnostic system is critical for debugging extraction issues. Every decision (selection, fallback, recovery, skip) must be recorded.

### 14.3 Architectural Invariants

```
1. Extractors emit Features only. Never Findings, never Behaviors.
2. Artifact classification uses ≥ 3 signals. Extension alone is insufficient.
3. Every extractor declares explicit limits. No unbounded extraction.
4. Parser recovery is mandatory. A syntax error is not a fatal error.
5. After normalization, the original language is metadata only.
6. No two extractors may emit the same logical feature with different canonical types.
7. Deterministic output: same file + same extractor version = same Features.
8. Partial extraction is always preferred over aborting.
9. Fallback extractors exist for every artifact type (text, binary, archive).
10. Extraction boundaries (depth, size, time) are enforced at the pipeline level.
```

---

_End of SPEC-004. This document describes the frozen feature extraction framework and artifact analysis pipeline for VERIS V1 through V4._
