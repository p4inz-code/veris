# VERIS Testing Strategy, Performance Architecture & Security Hardening — SPEC-008

**Status:** Frozen  
**Version:** 1.0  
**Applies to:** Testing architecture, security corpus, golden regression, fuzzing, security hardening, performance architecture, benchmarking, observability, CI quality gates.  
**Scope:** V1 through V4 without architectural redesign.

---

## Table of Contents

1. [Testing Philosophy](#1-testing-philosophy)
2. [Testing Pyramid Architecture](#2-testing-pyramid-architecture)
3. [Security Corpus Design](#3-security-corpus-design)
4. [Golden Regression System](#4-golden-regression-system)
5. [Fuzzing Strategy](#5-fuzzing-strategy)
6. [Security Hardening Specification](#6-security-hardening-specification)
7. [Performance Architecture](#7-performance-architecture)
8. [Benchmark Suite](#8-benchmark-suite)
9. [Observability Strategy](#9-observability-strategy)
10. [CI Quality Gates](#10-ci-quality-gates)
11. [Self-Healing & Recovery Architecture](#11-self-healing--recovery-architecture)
12. [Future Compatibility](#12-future-compatibility)
13. [Engineering Tradeoffs](#13-engineering-tradeoffs)
14. [Common Mistakes to Avoid](#14-common-mistakes-to-avoid)
15. [Final Architectural Recommendations](#15-final-architectural-recommendations)

---

## 1. Testing Philosophy

### 1.1 First Principles

VERIS is a **security product that analyzes untrusted input**. Its testing philosophy must reflect this reality:

1. **Correctness over speed.** A fast wrong answer is worse than a slow correct answer. Tests must validate correctness before performance.
2. **Determinism is non-negotiable.** Every test must be repeatable. Non-deterministic tests are bugs.
3. **Regression resistance is the primary quality metric.** Every engine change must prove it hasn't broken existing analysis.
4. **Adversarial testing is mandatory.** VERIS processes untrusted, potentially malicious files. The test suite must include adversarial inputs designed to exploit parser weaknesses.
5. **Golden snapshots are the source of truth.** Expected outputs are committed to the repository and change only through explicit approval.
6. **Offline testing.** All tests must run fully offline. Network-dependent tests are a separate category with explicit marking.
7. **Reproducible from commit hash.** Given the same commit, the same test suite produces the same results on any platform.

### 1.2 Testing vs. Verification

| Property     | Testing                   | Verification                     | VERIS Approach                        |
| ------------ | ------------------------- | -------------------------------- | ------------------------------------- |
| Correctness  | Are findings correct?     | Is the analysis sound?           | Both: unit tests + golden snapshots   |
| Completeness | Are we missing findings?  | Are all behaviors captured?      | Corpus regression + adversarial tests |
| Performance  | How fast is it?           | Is it within budget?             | Benchmarks with regression gates      |
| Security     | Does it resist attack?    | Is the attack surface mitigated? | Fuzzing + hardening tests             |
| Determinism  | Same input = same output? | Is there non-determinism?        | Double-run comparison in CI           |
| Stability    | Does it crash?            | Is resource usage bounded?       | Stress tests + memory profiling       |

### 1.3 Test Levels Responsibilities

| Level             | Owns                            | Validates                              | Runtime           | CI Frequency       |
| ----------------- | ------------------------------- | -------------------------------------- | ----------------- | ------------------ |
| Unit              | Individual modules              | Single function/class correctness      | < 1ms per test    | Every PR           |
| Component         | Package boundaries              | Cross-module contracts within package  | < 10ms per test   | Every PR           |
| Integration       | Cross-package interfaces        | Pipeline stage contracts               | < 100ms per test  | Every PR           |
| Pipeline          | Full extraction→report flow     | End-to-end correctness                 | < 10s per test    | Every PR + Nightly |
| Golden Snapshot   | Engine output stability         | Behavioral drift detection             | < 30s per suite   | Every PR           |
| Corpus Regression | Analysis completeness           | Finding coverage against known corpus  | < 5min per suite  | Nightly            |
| Adversarial       | Security boundaries             | Attack surface resistance              | < 10min per suite | Nightly            |
| Fuzz              | Parser robustness               | Crash-free parsing under mutation      | < 60min per suite | Nightly            |
| Property-Based    | Invariants across random inputs | Crash-freedom, determinism, round-trip | < 30min per suite | Nightly            |
| Performance       | Budget compliance               | Throughput, latency, memory            | < 30min per suite | Nightly            |
| Cross-Platform    | Platform parity                 | Consistent behavior across OS          | < 60min per suite | Weekly             |
| Compatibility     | Version stability               | Forward/backward compatibility         | < 30min per suite | Pre-release        |

---

## 2. Testing Pyramid Architecture

### 2.1 Complete Testing Architecture

```
                        ┌──────────────────────┐
                        │   E2E / Smoke Tests   │  Few: 5–10 scenarios
                        │   (full CLI invocation)│
                        └──────────┬───────────┘
                                   │
                        ┌──────────▼───────────┐
                        │  Pipeline Tests       │
                        │  (full analysis flow) │
                        └──────────┬───────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
     ┌────────▼───────┐  ┌────────▼───────┐  ┌────────▼───────┐
     │   Integration   │  │ Golden Snapshot │  │   Adversarial  │
     │   Tests         │  │ Tests           │  │   Tests        │
     │   (contracts)   │  │ (drift detect)  │  │ (attack range) │
     └────────┬───────┘  └────────┬───────┘  └────────┬───────┘
              │                    │                    │
              └────────────────────┼────────────────────┘
                                   │
                        ┌──────────▼───────────┐
                        │   Component Tests     │
                        │   (package boundary)  │
                        └──────────┬───────────┘
                                   │
                        ┌──────────▼───────────┐
                        │    Unit Tests         │  Many: 10,000+
                        │    (single module)    │
                        └──────────────────────┘
```

**Depths (parallel tracks):**

```
Functional Track:                Non-Functional Track:
┌──────────────────────┐        ┌──────────────────────┐
│   E2E / Smoke        │        │   Performance         │
├──────────────────────┤        ├──────────────────────┤
│   Pipeline           │        │   Memory Regression   │\n├──────────────────────┤        ├──────────────────────┤
│   Integration        │        │   Fuzz                │
├──────────────────────┤        ├──────────────────────┤
│   Golden Snapshot    │        │   Security Hardening  │
├──────────────────────┤        ├──────────────────────┤
│   Corpus Regression  │        │   Property-Based      │
├──────────────────────┤        ├──────────────────────┤
│   Component          │        │   Cross-Platform      │
├──────────────────────┤        ├──────────────────────┤
│   Unit               │        │   Compatibility       │
└──────────────────────┘        └──────────────────────┘
```

### 2.2 Test Directory Organization

```
packages/
├── <package>/
│   ├── __tests__/
│   │   ├── unit/                    # Unit tests (one per module)
│   │   ├── component/              # Component tests (within package)
│   │   ├── integration/            # Integration tests (cross-package)
│   │   ├── golden/                 # Golden snapshot data
│   │   ├── fixtures/               # Test fixtures (small, inline)
│   │   └── adversarial/            # Adversarial test inputs (package-level)
│   ├── benchmark/                  # Performance benchmarks
│   └── fuzz/                       # Fuzz test configurations
│
tools/
├── perf/                           # Performance benchmarking suite
│   ├── scenarios/                  # Standardized benchmark scenarios
│   ├── fixtures/                   # Benchmark fixture repositories
│   ├── reporters/                  # Benchmark result formatters
│   └── compare/                    # Historical comparison tooling
│
├── security/                       # Security testing suite
│   ├── corpus/                     # Security corpus (committed + LFS)
│   │   ├── benign/                 # Benign sample files
│   │   ├── malicious/              # Known malicious samples
│   │   ├── mixed/                  # Mixed-content samples
│   │   ├── edge/                   # Edge-case / boundary samples
│   │   ├── corrupted/              # Deliberately corrupted samples
│   │   └── obfuscated/             # Obfuscated samples
│   ├── fuzzing/                    # Fuzz runner configurations
│   │   ├── configs/                # Per-parser fuzz configurations
│   │   ├── seeds/                  # Seed corpora for fuzzing
│   │   └── crashes/                # Minimized crash reproductions
│   ├── adversarial/               # Adversarial test scenarios
│   └── hardening/                  # Security hardening test cases
│
├── codegen/                        # Test/corpus code generators
│   ├── corpus-generator/           # Generates test corpus variants
│   ├── obfuscation-generator/      # Generates obfuscation variants
│   └── mutation-generator/         # Generates mutated inputs
│
└── ci/                             # CI helper scripts
    ├── validate-golden/            # Golden snapshot validator
    ├── check-regression/           # Performance regression checker
    ├── check-memory/               # Memory regression checker
    └── report-generator/           # CI report generator

fixtures/
├── samples/                        # Committed, versioned test fixtures
│   ├── safe/                       # Benign files (various types)
│   ├── malicious/                  # Suspicious/malicious patterns
│   └── edge/                       # Edge cases for all extractors
├── repos/                          # Miniature repositories for testing
│   ├── small-monorepo/
│   ├── polyglot-project/
│   ├── deep-nesting/
│   └── binary-heavy/
└── archives/                       # Archive fixtures
    ├── simple.tar.gz
    ├── nested.zip
    └── encrypted.7z
```

### 2.3 Unit Test Specifications

**Purpose:** Validate a single module, function, or class in complete isolation. All external dependencies are mocked via interfaces (as defined in SPEC-001 §6).

**Coverage targets:**

| Package Layer     | Branch Coverage | Line Coverage | Mutation Score |
| ----------------- | --------------- | ------------- | -------------- |
| Core (L0)         | 95%             | 98%           | 90%            |
| Shared (L0)       | 90%             | 95%           | 85%            |
| Framework (L1)    | 85%             | 90%           | 80%            |
| Domain (L2)       | 95%             | 98%           | 90%            |
| Analysis (L3)     | 90%             | 95%           | 85%            |
| Report (L4)       | 85%             | 90%           | 80%            |
| Application (L5+) | 80%             | 85%           | 75%            |

**Conventions:**

```typescript
// Naming: {module-or-class}.test.ts
// Structure: describe(class) → it(method/behavior)

describe('ArchiveExtractor', () => {
  describe('canHandle', () => {
    it('returns true for known archive types (ZIP, TAR, GZIP)', () => {
      /* ... */
    });
    it('returns false for non-archive types (scripts, executables)', () => {
      /* ... */
    });
    it('returns false for encrypted archives without key', () => {
      /* ... */
    });
  });

  describe('extract', () => {
    it('extracts all entries from a valid ZIP archive', () => {
      /* ... */
    });
    it('respects max nesting depth boundary', () => {
      /* ... */
    });
    it('detects and rejects zip bombs via compression ratio', () => {
      /* ... */
    });
    it('handles empty archive without error', () => {
      /* ... */
    });
    it('recovers from a single corrupted entry within archive', () => {
      /* ... */
    });
  });
});
```

**Required test categories per module (checklist enforced by CI):**

| Category       | Description                            | Example                                       |
| -------------- | -------------------------------------- | --------------------------------------------- |
| Happy path     | Normal operation with valid input      | Extract valid Python file                     |
| Boundary       | Edge of acceptable ranges              | Max file size, max depth, empty file          |
| Error handling | Expected error conditions              | Malformed input, missing required fields      |
| Edge case      | Unusual but valid input                | Zero-byte file, UTF-16 BOM, Unicode filenames |
| Determinism    | Same input produces same output        | Run twice, compare results                    |
| Concurrency    | Thread/async safety (where applicable) | Concurrent extraction calls                   |
| Invariant      | Core invariants hold after operation   | Immutability, ID determinism                  |
| Regression     | Previously fixed bugs stay fixed       | FP-2024-001, FP-2024-002                      |

**Mocking strategy:**

```typescript
// All external dependencies mocked through existing interfaces
// @veris/shared provides mock factories:

import { createMockLogger } from '@veris/shared/testing';

const mockLogger = createMockLogger();
const mockConfig = createMockConfig({ extractors: { maxDepth: 10 } });
const mockContext = createMockExtractorContext({ logger: mockLogger, config: mockConfig });
```

### 2.4 Component Test Specifications

**Purpose:** Validate a package's public API by testing interactions between its internal modules. External packages are mocked at the dependency boundary.

**Scope:** One component test suite per package. Tests exercise the public API surface (from `index.ts` and `internal.ts`).

**Example — Extractor Registry component test:**

```typescript
describe('@veris/extractors (component)', () => {
  it('discovers and registers all built-in extractors on initialization', () => {
    /* ... */
  });
  it('selects the correct extractor for each artifact type', () => {
    /* ... */
  });
  it('falls back to generic extractor when no specific extractor matches', () => {
    /* ... */
  });
  it('tracks extraction diagnostics correctly (timing, recovery, errors)', () => {
    /* ... */
  });
  it('respects extractor priority ordering (specific → generic → fallback)', () => {
    /* ... */
  });
  it('rejects duplicate extractor registrations', () => {
    /* ... */
  });
});
```

**Component test boundaries:**

| Package             | Test Boundary                           | Mocked Dependencies     |
| ------------------- | --------------------------------------- | ----------------------- |
| @veris/core         | Types, errors, constants                | None (zero deps)        |
| @veris/shared       | Utilities, helpers                      | `@veris/core` types     |
| @veris/extractors   | Extractor registry, built-in extractors | Logger, config          |
| @veris/rules-engine | Scheduler, matchers, evaluator          | Logger, knowledge types |
| @veris/analyzer     | Pipeline orchestration                  | All layer 2 packages    |
| @veris/report       | Report building, diffing                | Core types, knowledge   |
| @veris/exporters    | Format serialization                    | Report builder output   |
| @veris/cli          | Command dispatch, config loading        | Analyzer, renderers     |

### 2.5 Integration Test Specifications

**Purpose:** Validate contracts between packages by testing actual cross-package interactions. Uses real implementations (no mocks) within the test scope.

**Integration test catalog:**

| ID     | Test Scenario                                | Packages Involved                | Validates                    |
| ------ | -------------------------------------------- | -------------------------------- | ---------------------------- |
| IT-001 | Feature extraction → Behavior classification | extractors → knowledge           | Taxonomy mapping correctness |
| IT-002 | Behavior → Rule matching → Finding           | rules-engine → knowledge → rules | Rule match pipeline          |
| IT-003 | Multiple findings → Correlation chain        | analyzer (correlation)           | Sequence detection           |
| IT-004 | Findings → TrustProfile → RiskProfile        | analyzer (trust, risk)           | Scoring pipeline             |
| IT-005 | Full pipeline → CanonicalReport              | analyzer → report                | Report completeness          |
| IT-006 | CanonicalReport → JSON exporter              | report → exporters               | JSON output correctness      |
| IT-007 | CanonicalReport → SARIF exporter             | report → exporters               | SARIF spec compliance        |
| IT-008 | Config loading → Pipeline behavior           | config → analyzer                | Config integration           |
| IT-009 | Plugin loading → Extractor registration      | plugins → extractors             | Plugin integration           |
| IT-010 | Diagnostics collection → Diagnostics output  | all → telemetry                  | Diagnostic completeness      |

**Integration test contract:**

```typescript
interface IntegrationTest {
  id: string; // "IT-001"
  name: string; // "Feature → Behavior classification"
  description: string; // "Verify taxonomy mapping correctness"
  packages: string[]; // ["@veris/extractors", "@veris/knowledge"]
  input: unknown; // Serialized test input
  expectedOutput: unknown; // Expected output (or fixture reference)
  invariants: string[]; // Invariants that must hold
  tags: string[]; // ["regression", "smoke", "contract"]
}
```

### 2.6 Pipeline Test Specifications

**Purpose:** Execute the full analysis pipeline from raw input to CanonicalReport, validating the end-to-end flow without CLI overhead.

```typescript
// Tests in @veris/analyzer/__tests__/pipeline/
describe('Analysis Pipeline (full flow)', () => {
  it('analyzes a simple Python file and produces findings', async () => {
    const pipeline = createTestPipeline(/* default config */);
    const report = await pipeline.analyze('fixtures/samples/safe/hello-world.py');
    expect(report.session.status).toBe('completed');
    expect(report.findings.length).toBeGreaterThanOrEqual(0);
    expect(report.trustProfile).toBeDefined();
    expect(report.riskProfile).toBeDefined();
  });

  it('detects secrets in a mixed repository', async () => {
    const pipeline = createTestPipeline({ rules: { packs: ['secrets'] } });
    const report = await pipeline.analyze('fixtures/repos/polyglot-project/');
    expect(report.findings.some((f) => f.ruleId.includes('aws-key'))).toBe(true);
  });

  it('detects zip bomb and aborts extraction safely', async () => {
    const pipeline = createTestPipeline();
    const report = await pipeline.analyze('fixtures/samples/malicious/zip-bomb.zip');
    // Extraction should abort, but pipeline continues
    expect(report.session.status).toBe('partial');
    expect(report.session.errors.length).toBeGreaterThan(0);
    expect(report.session.errors[0].message).toContain('compression ratio');
  });

  it('produces deterministic output on repeated runs', async () => {
    const pipeline = createTestPipeline();
    const report1 = await pipeline.analyze('fixtures/samples/safe/hello-world.py');
    const report2 = await pipeline.analyze('fixtures/samples/safe/hello-world.py');
    expect(report1).toEqual(report2); // Deep equality
  });
});
```

### 2.7 End-to-End / Smoke Test Specifications

**Purpose:** Execute the full CLI application as a black box against known targets and validate exit codes, output files, and key properties.

```typescript
// Scenarios in: tools/perf/scenarios/
interface E2EScenario {
  name: string; // "scan-quick-python"
  description: string;
  args: string[]; // CLI arguments
  target: string; // Target path
  expectedExitCode: number;
  expectedOutput: {
    files?: string[]; // Expected output files
    stdoutContains?: string[]; // Expected stdout content
    stderrEmpty?: boolean; // Should stderr be empty?
    maxDurationMs?: number;
  };
  invariants: {
    deterministic: boolean; // Run twice, compare
    offline: boolean; // No network required
    noTempFilesLeft: boolean; // Cleanup verified
  };
}
```

**Smoke test scenarios:**

| Scenario          | Arguments                                | Target             | Validates          |
| ----------------- | ---------------------------------------- | ------------------ | ------------------ |
| Quick single file | `scan hello-world.py`                    | Single Python file | Basic scan works   |
| Full directory    | `scan --profile quick src/`              | Small project      | Directory scan     |
| JSON output       | `scan --json target`                     | Configuration file | JSON export        |
| SARIF output      | `scan --sarif target`                    | Python file        | SARIF compliance   |
| HTML report       | `scan --html target`                     | Mixed repository   | HTML generation    |
| Init command      | `init`                                   | New directory      | Config scaffolding |
| Plugin install    | `plugin install ...`                     | (mocked)           | Plugin lifecycle   |
| Help output       | `--help`                                 | —                  | CLI help text      |
| Version output    | `--version`                              | —                  | Version metadata   |
| Archive scan      | `scan archive.zip`                       | ZIP archive        | Archive handling   |
| Large repo scan   | `scan --profile large-repo big-project/` | Large repo         | Scale handling     |
| Partial scan      | `scan --max-files 10 target/`            | Directory          | Limit enforcement  |
| Cancellation      | `scan target` then Ctrl+C                | Large target       | Graceful shutdown  |

### 2.8 Determinism Double-Run Validation

Every test that claims determinism must be validated by running twice and comparing:

```typescript
// Determinism validation utility
async function validateDeterminism<T>(
  fn: () => Promise<T>,
  comparator: (a: T, b: T) => boolean = deepEqual,
): Promise<void> {
  const result1 = await fn();
  const result2 = await fn();
  if (!comparator(result1, result2)) {
    throw new NonDeterminismError('Results differ between runs');
  }
}

// Used in every test with deterministic=True tag
it('produces deterministic extraction output (double-run validated)', async () => {
  await validateDeterminism(() => extractor.extract(artifact, context));
});
```

---

## 3. Security Corpus Design

### 3.1 Corpus Architecture

```
tools/security/corpus/
├── README.md                          # Corpus overview, licensing, usage
├── manifest.json                      # Master manifest of all samples
├── BENIGN/                            # Benign repositories and files
│   ├── hello-world/                   # Minimal project files
│   │   ├── hello.py
│   │   ├── hello.js
│   │   └── README.md
│   ├── popular-oss/                   # Well-known open source projects (slimmed)
│   │   ├── express-routes/            # Express.js route examples
│   │   ├── flask-app/                 # Flask web application skeleton
│   │   └── rust-cli-tool/             # Rust CLI tool (compiled + source)
│   ├── enterprise-sample/             # Realistic enterprise code patterns
│   └── generated/                     # Generated benign variants
│
├── MALICIOUS/                         # Known malicious samples
│   ├── scripts/                       # Malicious scripts
│   │   ├── reverse-shell.py
│   │   ├── keylogger.js
│   │   ├── cryptominer.sh
│   │   ├── credential-stealer.ps1
│   │   └── downloader.vbs
│   ├── executables/                   # Malicious binaries
│   │   ├── trojan-pe/                 # PE with known malicious patterns
│   │   ├── backdoor-elf/              # ELF backdoor sample
│   │   └── adware-macho/              # Mach-O adware sample
│   ├── archives/                      # Malicious archives
│   │   ├── zip-bomb.zip               # Zip bomb (compression ratio bomb)
│   │   ├── tar-bomb.tar               # Tar bomb (massive file count)
│   │   ├── symlink-traversal.tar      # Symlink path traversal
│   │   └── billion-laughs.xml.gz      # Billion Laughs XML attack
│   └── configuration/                 # Malicious configuration files
│       ├── malicious-cors.json
│       ├── backdoor-cron.txt
│       └── malicious-policy.yaml
│
├── MIXED/                             # Benign files with embedded malicious content
│   ├── polyglot/                      # Files that are valid multiple formats
│   ├── stego/                         # Steganographic content
│   └── benign-with-malicious-patterns/ # Legitimate code that pattern-matches malicious
│
├── EDGE/                              # Edge-case and boundary samples
│   ├── empty/                         # Zero-byte files of each type
│   ├── max-size/                      # Files at the boundary of size limits
│   ├── deep-nesting/                  # Extremely nested structures
│   ├── unicode/                       # Unicode normalization edge cases
│   │   ├── utf8-bom.py
│   │   ├── utf16-le.js
│   │   ├── right-to-left-override.js
│   │   └── homoglyph-attack.py
│   ├── encoding/                      # Encoding edge cases
│   └── truncated/                     # Deliberately truncated files
│
├── CORRUPTED/                         # Intentionally corrupted files
│   ├── binaries/                      # Corrupted PE, ELF, Mach-O headers
│   ├── archives/                      # Corrupted archive entries
│   ├── scripts/                       # Scripts with syntax errors
│   └── configs/                       # Malformed configuration files
│
├── OBFUSCATED/                        # Obfuscated and encoded samples
│   ├── base64/                        # Base64-encoded scripts
│   ├── hex-encoded/                   # Hex-encoded payloads
│   ├── packed/                        # UPX/ASPack packed executables
│   ├── string-obfuscated/             # String concatenation obfuscation
│   └── control-flow-obfuscated/       # Control flow flattened
│
└── BENCHMARK/                         # Performance benchmark fixtures
    ├── small-repo/                    # ~100 files, ~1MB
    ├── medium-repo/                   # ~10,000 files, ~100MB
    ├── large-repo/                    # ~100,000 files, ~1GB (LFS)
    ├── monorepo/                      # ~500,000 files, ~5GB (LFS)
    ├── binary-heavy/                  # Many binary files, few scripts
    ├── archive-heavy/                 # Many nested archives
    └── deep-tree/                     # 100+ level directory nesting
```

### 3.2 Corpus Manifest

```typescript
interface CorpusManifest {
  version: string; // Corpus schema version
  lastUpdated: ISO8601;
  totalSamples: number;
  totalSize: string; // "2.3 GB"
  categories: CorpusCategory[];
}

interface CorpusCategory {
  id: string; // "BENIGN", "MALICIOUS", "MIXED", etc.
  name: string;
  description: string;
  totalSamples: number;
  samples: CorpusSample[];
}

interface CorpusSample {
  id: string; // Unique sample ID
  path: string; // Relative path to sample
  size: number; // Bytes
  hash: string; // SHA-256 of file content
  type: ArtifactType; // File type classification
  subType: string; // Specific format/language
  description: string; // What this sample tests
  tags: string[]; // Categorization tags
  expectedBehaviors: TaxonomyId[]; // Expected behaviors (for correctness checks)
  expectedFindings: ExpectedFinding[]; // Expected findings (for regression checks)
  source: string; // Origin of the sample
  license: string; // License of the sample content
  lastUpdated: ISO8601;
}

interface ExpectedFinding {
  ruleId: RuleId; // Expected rule to match
  minConfidence: number; // Minimum acceptable confidence
  expectedCount: number; // Expected number of matches
  location?: string; // Optional expected location pattern
}
```

### 3.3 Corpus Licensing

| Category                    | License Strategy           | Source Attribution      |
| --------------------------- | -------------------------- | ----------------------- |
| Generated samples           | VERIS owns (MIT)           | Marked as generated     |
| OSS snippets                | Original license preserved | Attribution in manifest |
| Public malware corpus       | VX Vault, MalShare terms   | Attribution in manifest |
| Created adversarial samples | VERIS owns (MIT)           | Marked as original      |
| Benchmark fixtures          | MIT (synthetic)            | Marked as synthetic     |

**Licensing rules:**

- All samples include `LICENSE` file or inline attribution.
- No proprietary or confidential code ever included.
- Malicious samples are sourced from public malware repositories with permissive terms.
- Generated adversarial samples are owned by VERIS and licensed under MIT.
- Large benchmark repos use synthetic content (no real code).

### 3.4 Corpus Versioning

```
Corpus version format: YYYY-MM-DD-v{N}

v2024-01-01-v1: Initial corpus (1,000 samples)
v2024-04-01-v2: Added 500 obfuscated samples
v2024-07-01-v3: Added 200 PE/ELF/Mach-O samples
v2025-01-01-v4: Major expansion to 10,000 samples
```

- Corpus is versioned independently from the engine.
- Corpus version is recorded in test reports.
- Engine version pins a minimum corpus version for regression tests.
- Corpus additions are additive; old samples are never removed (only deprecated with `supersededBy`).

### 3.5 Expected Outputs

Every sample in the corpus has an `expected.json` file containing the expected analysis output:

```json
{
  "sampleId": "benign/hello-world/hello.py",
  "schemaVersion": "1.0",
  "expected": {
    "findings": [],
    "behaviors": ["T90100", "T90120"],
    "chains": [],
    "trustProfile": { "trustScore": { "min": 0.7 } },
    "riskProfile": { "riskScore": { "max": 1.0 } }
  }
}
```

For malicious samples:

```json
{
  "sampleId": "malicious/scripts/reverse-shell.py",
  "schemaVersion": "1.0",
  "expected": {
    "findings": [
      { "ruleId": "scripts/socket-connect", "minConfidence": 0.8, "expectedCount": 1 },
      {
        "ruleId": "scripts/process-creation",
        "minConfidence": 0.7,
        "expectedCount": { "min": 1, "max": 3 }
      }
    ],
    "behaviors": ["T3100", "T8100", "T10100"],
    "chains": [],
    "trustProfile": { "trustScore": { "max": 0.3 } },
    "riskProfile": { "riskScore": { "min": 6.0 } }
  }
}
```

---

## 4. Golden Regression System

### 4.1 Design Principles

1. **Immutable expected outputs.** Golden files are committed to the repository and treated as source of truth.
2. **Explicit approval only.** Golden updates require human review in a dedicated PR.
3. **Granularity per engine component.** Each major component has its own golden file set.
4. **Diffable format.** Golden files use structured formats (JSON, YAML) for meaningful diffs.
5. **Intentional change tracking.** Every golden change links to a changelog entry explaining the behavioral change.

### 4.2 Golden File Organization

```
packages/<package>/__tests__/golden/
├── <component>/
│   ├── <test-scenario>.golden.json   # Expected output snapshot
│   ├── <test-scenario>.golden.yaml   # Alternative format
│   └── <test-scenario>.meta.json     # Metadata (engine version, timestamp)
│
tools/ci/golden/
├── manifests/                         # Aggregate golden manifests
│   ├── v1-golden-manifest.json
│   └── current-golden-manifest.json
├── history/                           # Historical golden snapshots
│   ├── v1.0.0/
│   ├── v1.1.0/
│   └── v2.0.0-rc.1/
└── compare/                           # Golden comparison tooling
    ├── compare-golden.ts
    ├── update-golden.ts
    └── approve-golden.ts
```

### 4.3 Golden Snapshot Types

| Snapshot Type           | Scope                       | Format                         | Update Frequency        | Review Required |
| ----------------------- | --------------------------- | ------------------------------ | ----------------------- | --------------- |
| Extraction output       | Per-extractor per-test-file | JSON (Feature[], Capability[]) | Per-extractor change    | Yes             |
| Behavior classification | Per-taxonomy-node per-input | JSON (Behavior[])              | Per-taxonomy change     | Yes             |
| Rule match output       | Per-rule per-behavior-set   | JSON (RuleResult[])            | Per-rule change         | Yes             |
| Finding output          | Per-finding per-input       | JSON (Finding[])               | Per-engine change       | Yes             |
| Behavior chain output   | Per-chain per-input         | JSON (BehaviorChain[])         | Per-correlation change  | Yes             |
| Trust profile           | Per-artifact                | JSON (TrustProfile)            | Per-trust-engine change | Yes             |
| Risk profile            | Per-artifact                | JSON (RiskProfile)             | Per-risk-engine change  | Yes             |
| Full report             | Per-target                  | JSON (CanonicalReport)         | Per-major-change        | Yes             |
| Export output           | Per-exporter per-report     | JSON/SARIF/MD/HTML/CSV         | Per-exporter change     | Yes             |

### 4.4 Golden Comparison Workflow

```mermaid
Developer makes engine change
       │
       ▼
Run test suite (includes golden tests)
       │
       ├── All golden tests pass → PR proceeds
       │
       └── Golden tests fail → Diff is shown
               │
               ├── Diff is expected (intentional change)
               │   → Run golden update: `pnpm golden:update`
               │   → Review golden diff in PR
               │   → Add changelog entry explaining change
               │   → PR approved with golden changes
               │
               └── Diff is unexpected (behavioral drift)
                   → Debug the regression
                   → Fix the regression
                   → Re-run golden tests
                   → All pass → PR proceeds
```

### 4.5 Golden Update Command

```bash
# Update all golden files for current changes
pnpm golden:update

# Update golden files for specific packages
pnpm golden:update --filter=@veris/extractors

# Validate golden files without updating (CI mode)
pnpm golden:validate

# Compare current output against a specific historical baseline
pnpm golden:compare --baseline=v1.0.0
```

### 4.6 Golden Drift Detection

```typescript
interface GoldenDriftReport {
  baseline: string; // Baseline version
  current: string; // Current version
  timestamp: ISO8601;
  totalComparisons: number;
  driftCount: number;
  drifts: GoldenDrift[];
  summary: string; // "3 drifts detected across 2 packages"
}

interface GoldenDrift {
  goldenPath: string; // Golden file path
  baselineId: string; // Baseline snapshot ID
  currentId: string; // Current snapshot ID
  diffSummary: string; // Brief description of what changed
  diffDetail: string; // Structured diff output
  isApproved: boolean; // Has this drift been approved?
  approvalPR?: string; // PR number that approved the change
  approvalDate?: ISO8601;
  impact: 'none' | 'minor' | 'major' | 'breaking';
}
```

### 4.7 Corpus Regression Tests

**Purpose:** Validate that the engine produces expected findings against the known security corpus. Corpus regression tests ensure that engine changes do not introduce regressions in finding coverage — neither missing expected findings nor producing unexpected ones.

**Mechanism:**

For every sample in the security corpus (Section 3), a corpus regression test:

1. Runs the full analysis pipeline against the sample.
2. Compares the resulting findings against `expected.json` (Section 3.5).
3. Reports any discrepancies:
   - **Missing finding:** A rule that should have matched but didn't.
   - **Unexpected finding:** A rule that matched but shouldn't have.
   - **Confidence regression:** A finding's confidence dropped below `minConfidence`.
   - **Count mismatch:** The number of matches differs from `expectedCount`.

**Tolerances:**

| Dimension        | Tolerance                                                    | Rationale                                     |
| ---------------- | ------------------------------------------------------------ | --------------------------------------------- |
| Finding presence | Zero tolerance — every expected finding must be present      | Core correctness                              |
| Finding absence  | Zero tolerance — no unexpected findings of severity ≥ medium | False positive control                        |
| Confidence       | ±0.1 of expected value                                       | Minor fluctuations from normalization changes |
| Finding count    | Within expected range (`min`–`max` if specified, else exact) | Multi-match rules may vary                    |
| Trust score      | ±0.05 of expected range                                      | Score recalculation differences               |
| Risk score       | ±0.5 of expected range                                       | Score recalculation differences               |

**Execution:** `pnpm test:corpus-regression`

- Every nightly CI run.
- Full run against the entire corpus (10,000+ samples in V4).
- Targeted run: `--corpus-filter=<category>` to test a subset (e.g., `--corpus-filter=MALICIOUS`).
- Fast mode: test only samples whose `expected.json` changed since last run.

**Reporting:**

```
Corpus Regression Report
════════════════════════════════════════════════════════════
Corpus version: 2024-07-01-v3 (5,000 samples)

Results:
  ✓ Passed:   4,987 samples (99.74%)
  ✗ Failed:   13 samples (0.26%)

Failed samples:
  BENIGN/express-routes/routes.js
    Missing finding 0: scripts/eval-usage (confidence 0.92)
    → Expected 1 match, found 0
    → Cause: eval() now uses indirect reference (module.eval)

  MALICIOUS/scripts/reverse-shell.py
    Unexpected finding: secrets/generic-api-key (confidence 0.31, low)
    → False positive: string "AK-47" matched API key pattern
    → Requires FP regression test (FP-2024-015)

  CORRUPTED/pe-corrupted-header.exe
    Confidence regression: executables/packing-detection
    → Expected min confidence: 0.70
    → Actual confidence: 0.55
    → Cause: Section parser recovery penalty increased
```

### 4.8 Golden File Format

    "engineVersion": "1.2.0",
    "corpusVersion": "2024-01-01-v1",
    "generatedAt": "2024-03-15T10:30:00Z",
    "description": "Expected extraction output for fixtures/samples/safe/hello-world.py"

},
"input": {
"artifact": { "id": "art_fixture", "path": "hello-world.py" }
},
"expected": {
"features": [
{
"type": "function-call",
"value": { "kind": "string", "value": "print" },
"location": { "startLine": 1, "startColumn": 0, "endLine": 1, "endColumn": 5 },
"confidence": 0.95
}
],
"capabilities": [],
"diagnostics": {
"durationMs": { "max": 100 },
"featuresExtracted": 1,
"parserRecoveryCount": 0
}
},
"invariants": {
"allFeatureIdsDeterministic": true,
"allConfidenceInRange": true,
"noNullLocations": true
}
}

```

---

## 5. Fuzzing Strategy

### 5.1 Fuzzing Architecture

```

tools/security/fuzzing/
├── configs/
│ ├── archive-parser.yaml # Fuzz configuration for archive extractors
│ ├── pe-parser.yaml # Fuzz configuration for PE parser
│ ├── elf-parser.yaml # Fuzz configuration for ELF parser
│ ├── python-parser.yaml # Fuzz configuration for Python parser
│ ├── js-parser.yaml # Fuzz configuration for JS/TS parser
│ ├── regex-matcher.yaml # Fuzz configuration for regex engine
│ ├── rule-engine.yaml # Fuzz configuration for rule evaluator
│ ├── config-loader.yaml # Fuzz configuration for config parser
│ ├── plugin-manifest.yaml # Fuzz configuration for manifest parser
│ └── report-renderer.yaml # Fuzz configuration for renderers
├── seeds/ # Seed corpora (initial inputs)
├── crashes/ # Minimized crash reproductions
│ ├── minimizer/ # Crash minimization tooling
│ └── verified/ # Verified, minimized crashes
├── coverage/ # Code coverage tracking
└── reports/ # Fuzzing reports

````

### 5.2 Fuzz Targets

| Fuzz Target | Input Type | Tool | Time Budget | Priority |
|-------------|-----------|------|-------------|----------|
| Archive parser (ZIP) | Binary archive bytes | LibFuzzer / Jazzer.js | 60 min | Critical |
| Archive parser (TAR) | Binary archive bytes | LibFuzzer / Jazzer.js | 60 min | Critical |
| Archive parser (7z) | Binary archive bytes | LibFuzzer / Jazzer.js | 60 min | Critical |
| PE parser | Binary PE bytes | LibFuzzer / Jazzer.js | 60 min | Critical |
| ELF parser | Binary ELF bytes | LibFuzzer / Jazzer.js | 60 min | Critical |
| Mach-O parser | Binary Mach-O bytes | LibFuzzer / Jazzer.js | 60 min | Critical |
| Python parser | Python source text | LibFuzzer / Jazzer.js | 30 min | High |
| JavaScript parser | JavaScript source text | LibFuzzer / Jazzer.js | 30 min | High |
| Regex engine | Regex pattern strings | LibFuzzer / Jazzer.js | 30 min | High |
| Config loader | YAML/JSON/TOML text | LibFuzzer / Jazzer.js | 30 min | High |
| Plugin manifest | JSON manifest text | LibFuzzer / Jazzer.js | 30 min | Medium |
| Rule definition | Rule JSON text | LibFuzzer / Jazzer.js | 30 min | Medium |
| CLI argument parser | Argument strings | LibFuzzer / Jazzer.js | 15 min | Medium |
| Report renderer (HTML) | Report JSON + template | LibFuzzer / Jazzer.js | 15 min | Low |
| Report renderer (Markdown) | Report JSON + template | LibFuzzer / Jazzer.js | 15 min | Low |

### 5.3 Fuzzing Configuration Format

```yaml
# tools/security/fuzzing/configs/pe-parser.yaml
fuzzTarget: pe-parser
description: "Fuzz the PE executable parser"
tool: jazzer.js                      # Or: libfuzzer, custom
inputType: binary                    # binary | text | structured
timeBudget: 60                       # Minutes per run
parallelism: 4                       # Concurrent fuzz processes

seedCorpus: tools/security/fuzzing/seeds/pe/
  - valid-pe32.exe
  - valid-pe32-plus.dll
  - valid-pe-signed.sys
  - edge-empty-section.exe
  - edge-max-sections.exe

dictionary: tools/security/fuzzing/dicts/pe.dict
  - "MZ"
  - "PE\x00\x00"
  - "\x50\x45\x00\x00\x4C\x01"
  # PE section names
  - ".text\x00\x00\x00"
  - ".data\x00\x00\x00"
  - ".rdata\x00\x00\x00"
  - ".rsrc\x00\x00\x00"
  - ".reloc\x00\x00\x00"

crashMinimizer: true                 # Minimize crashes to smallest reproducer
coverageTracking: true               # Track code coverage
sanitizers:
  - address                          # AddressSanitizer
  - undefined                        # UndefinedBehaviorSanitizer
  - leak                             # LeakSanitizer

stopConditions:
  maxCrashes: 100                    # Stop after 100 unique crashes
  maxTime: 3600                      # Stop after 1 hour (seconds)
  maxIterations: 10000000            # Stop after 10M iterations

output:
  crashDir: tools/security/fuzzing/crashes/pe-parser/
  coverageDir: tools/security/fuzzing/coverage/pe-parser/
  reportFile: tools/security/fuzzing/reports/pe-parser/latest.json
````

### 5.4 Fuzzing Dictionary Files

Common byte patterns and keywords for guided mutation:

```yaml
# tools/security/fuzzing/dicts/pe.dict
# PE magic bytes
"MZ"
"PE\x00\x00"
# PE characteristics
"\x00\x02"  # IMAGE_FILE_EXECUTABLE_IMAGE
"\x20\x00"  # IMAGE_FILE_LARGE_ADDRESS_AWARE
"\x02\x01"  # IMAGE_FILE_32BIT_MACHINE | IMAGE_FILE_EXECUTABLE_IMAGE
# Section names commonly exploited
".text\x00\x00\x00"
".rdata\x00\x00\x00"
".idata\x00\x00\x00"
"..name\x00\x00\x00"  # Common exploit vector
# Machine types
"\x4C\x01"  # IMAGE_FILE_MACHINE_I386
"\x64\x86"  # IMAGE_FILE_MACHINE_AMD64
"\x01\x02"  # IMAGE_FILE_MACHINE_ARM64
```

### 5.5 Crash Handling & Minimization

```yaml
# Crash handling procedure
1. Crash detected during fuzzing
2. Crash artifact saved to tools/security/fuzzing/crashes/<target>/raw/
3. Crash minimization runs:
   a. Reduce input to smallest reproducing size
   b. Remove non-essential bytes (delta debugging)
   c. Verify minimized input still crashes
   d. Save to tools/security/fuzzing/crashes/<target>/minimized/
4. Triage:
   a. Classify crash type (OOB, UAF, OOM, assert, infinite loop)
   b. Assign severity (critical, high, medium, low)
   c. Link to source location (file:line)
5. Bug report generated:
   a. Create GitHub issue with minimized input
   b. Tag with component and severity
   c. Assign to appropriate team
6. Fix verified:
   a. Apply fix
   b. Verify minimized input no longer crashes
   c. Add input to seed corpus for regression
```

### 5.6 Crash Classification

| Crash Type               | Severity | Description                   | Example                               |
| ------------------------ | -------- | ----------------------------- | ------------------------------------- |
| Out-of-bounds read       | High     | Read past buffer boundary     | Parser reads beyond PE header         |
| Out-of-bounds write      | Critical | Write past buffer boundary    | Corrupts adjacent memory              |
| Null pointer dereference | High     | Access through null pointer   | Missing section check                 |
| Use-after-free           | Critical | Access freed memory           | Double-free in archive parsing        |
| Heap overflow            | Critical | Overflow heap allocation      | String too large for buffer           |
| Stack overflow           | High     | Exhausted stack space         | Infinite recursion in depth parsing   |
| Integer overflow         | Medium   | Integer wraps past bounds     | Size calculation wraps to small value |
| Division by zero         | Medium   | Integer division by zero      | Zero-length section causes divide     |
| Infinite loop            | Medium   | Loop never terminates         | Malformed header causes loop          |
| Memory exhaustion        | High     | Allocation exceeds limits     | Zip bomb bypasses ratio check         |
| Assertion failure        | Low      | Debug assertion trips         | Unexpected state in production        |
| Unhandled exception      | Medium   | Uncaught exception propagates | Parser doesn't handle format error    |

### 5.7 Fuzzing Results Integration

```yaml
# Fuzzing results feed into:
1. Security hardening test suite (crashing inputs become test cases)
2. Regression corpus (inputs that exercised new code paths)
3. Golden snapshot updates (if fuzzing reveals new behaviors)
4. Performance benchmarks (if fuzzing reveals slow paths)
5. CVE tracking (for security-relevant crashes)
```

### 5.8 Property-Based Testing

In addition to fuzzing, property-based tests validate invariants across randomly generated inputs:

```typescript
// Using fast-check or similar
import * as fc from 'fast-check';

describe('PE parser properties', () => {
  it('never crashes on any input', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 64, maxLength: 65536 }), (bytes) => {
        const parser = new PeParser();
        expect(() => parser.parse(new Uint8Array(bytes))).not.toThrow();
      }),
      { numRuns: 10000 },
    );
  });

  it('extracted sections never exceed file bounds', () => {
    fc.assert(
      fc.property(generateValidPe(), (pe) => {
        const result = peParser.parse(pe);
        for (const section of result.sections) {
          expect(section.offset + section.size).toBeLessThanOrEqual(pe.length);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('extraction result is deterministic', () => {
    fc.assert(
      fc.property(generateAnyInput(), (input) => {
        const result1 = extractor.extract(input, context);
        const result2 = extractor.extract(input, context);
        expect(result1).toEqual(result2);
      }),
      { numRuns: 500 },
    );
  });
});
```

**Property-based test targets:**

| Property             | Target                   | Invariant                                   |
| -------------------- | ------------------------ | ------------------------------------------- |
| Parser crash-freedom | All parsers              | Any input → no crash                        |
| Determinism          | All extractors, matchers | Same input → same output                    |
| Idempotency          | Normalization            | Normalize(normalize(x)) = normalize(x)      |
| Monotonic bounds     | Memory allocation        | Allocated ≤ declared max                    |
| Symmetry             | Deduplication            | Dedup(A, B) = Dedup(B, A)                   |
| Associativity        | Score combination        | Score(Score(a,b), c) = Score(a, Score(b,c)) |
| Round-trip           | Serialization            | Deserialize(Serialize(x)) = x               |

---

## 6. Security Hardening Specification

### 6.1 Threat Model & Mitigation Matrix

Every protection is defined by: **Detection**, **Mitigation**, **Diagnostics**, **Recovery**.

#### 6.1.1 Zip Bombs

| Property          | Specification                                                                                                                                                                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Threat**        | A compressed archive that expands to an enormous size (compression ratio ≥ 100:1), designed to exhaust disk, memory, or CPU.                                                                                                                                            |
| **Detection**     | During archive extraction, track decompressed_size / compressed_size ratio. If ratio > configurable threshold (default 100:1), trigger bomb detection. Also detect nested zip bombs by tracking total decompressed bytes across all nesting levels (default max 10 GB). |
| **Mitigation**    | Abort extraction of the offending entry. Continue extracting remaining entries within safe ratio. Never write decompressed content to disk.                                                                                                                             |
| **Diagnostics**   | Log: `SecurityWarning: Archive entry 'filename' exceeds compression ratio limit (ratio: 250:1, limit: 100:1). Entry skipped.` Record in `ExtractionResult.diagnostics.warnings[]` with code `ZIP_BOMB`.                                                                 |
| **Recovery**      | Archive artifact is marked as `truncated: true` with metadata `{ bombDetected: true, offendingEntries: ["filename"] }`. Extraction continues with next archive entry. Pipeline status set to `partial`.                                                                 |
| **Configuration** | `extractors.archive.maxCompressionRatio` (default: 100), `extractors.archive.maxTotalDecompressedBytes` (default: 10GB)                                                                                                                                                 |

#### 6.1.2 Tar Bombs

| Property          | Specification                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Threat**        | A tar archive containing an excessive number of files (100,000+) designed to exhaust inode/dentry cache or filesystem metadata.                                                                                     |
| **Detection**     | Track total entry count during tar traversal. If entry count > configurable threshold (default 10,000), trigger bomb detection. Also track total path length — detect if single path exceeds PATH_MAX (4096 bytes). |
| **Mitigation**    | Stop adding new entries after limit reached. Keep all entries extracted so far.                                                                                                                                     |
| **Diagnostics**   | Log: `SecurityWarning: Tar archive exceeds max entry count (entries: 50,000, limit: 10,000). Extraction truncated.` Record in diagnostics.                                                                          |
| **Recovery**      | Archive marked as `truncated: true`. First 10,000 entries are preserved. Pipeline continues.                                                                                                                        |
| **Configuration** | `extractors.archive.maxEntries` (default: 10,000)                                                                                                                                                                   |

#### 6.1.3 Billion Laughs Attack (XML Entity Expansion)

| Property          | Specification                                                                                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Threat**        | XML with nested entity expansions that cause exponential memory growth (e.g., `<!ENTITY a "&b;&b;">` repeating recursively).                                                                          |
| **Detection**     | Track XML entity expansion depth and total entity size. If depth > 10 or total entity expansion > 100MB, trigger detection. Use a SAX-style streaming parser with entity expansion limits, never DOM. |
| **Mitigation**    | Abort XML parsing when entity expansion exceeds limits. Return partial extraction results from safe elements.                                                                                         |
| **Diagnostics**   | Log: `SecurityWarning: XML entity expansion exceeds limit (depth: 15, limit: 10). Parsing aborted.` Record in diagnostics with code `XML_BOMB`.                                                       |
| **Recovery**      | XML artifact extraction returns partial features (elements parsed before abort). Artifact marked as `truncated: true`. Pipeline continues.                                                            |
| **Configuration** | `extractors.xml.maxEntityDepth` (default: 10), `extractors.xml.maxEntityExpansionBytes` (default: 100MB)                                                                                              |

#### 6.1.4 Symlink Loops / Recursive Junctions

| Property          | Specification                                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Threat**        | A symlink chain that points to itself (A → B → A) or a directory junction that creates an infinite directory tree. Designed to exhaust path resolution or cause infinite recursion.                                                  |
| **Detection**     | Track symlink resolution depth during discovery. If depth > configurable threshold (default 40), detect loop. Maintain a visited-inode table (or path resolution set) to detect cycles. Use O(1) hash set probe, not O(n) list scan. |
| **Mitigation**    | Stop resolving symlinks at max depth. Treat deep symlinks as dangling (do not follow).                                                                                                                                               |
| **Diagnostics**   | Log: `SecurityWarning: Symlink resolution depth exceeded at path '.../a → .../b → .../a'. Link treated as dangling.` Record in diagnostics with code `SYMLINK_LOOP`.                                                                 |
| **Recovery**      | Symlink is skipped. Parent directory traversal continues. Pipeline continues.                                                                                                                                                        |
| **Configuration** | `discovery.maxSymlinkDepth` (default: 40)                                                                                                                                                                                            |

#### 6.1.5 Infinite Directory Recursion

| Property          | Specification                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Threat**        | A filesystem structure with circular junctions, bind mounts, or recursive directory structures that cause infinite directory traversal.                                        |
| **Detection**     | Track directory depth during recursive walk. If depth > configurable threshold (default 50), stop descending. Use device+inode pair tracking to detect cross-directory cycles. |
| **Mitigation**    | Stop descending at max depth. Do not enter directories that would exceed the limit.                                                                                            |
| **Diagnostics**   | Log: `SecurityWarning: Directory traversal depth exceeded (depth: 51, limit: 50). Descending stopped.` Record in diagnostics with code `DIR_DEPTH_EXCEEDED`.                   |
| **Recovery**      | Files at shallow depths are preserved. Pipeline continues with partial artifact list.                                                                                          |
| **Configuration** | `discovery.maxDepth` (default: 50)                                                                                                                                             |

#### 6.1.6 Malformed Binary Headers (PE/ELF/Mach-O)

| Property          | Specification                                                                                                                                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Threat**        | Deliberately corrupted binary headers designed to trigger out-of-bounds reads, integer overflows in size calculations, or infinite loops in section traversal.                                                                                                                                                                             |
| **Detection**     | Every header field is validated against known bounds before use. Size checks: section offsets must be within file bounds, section sizes must be positive and bounded. Alignment checks: section alignment must be power of 2, header sizes must match expected values. Fingerprint checks: magic bytes verified before any header parsing. |
| **Mitigation**    | Validate-then-use pattern: validate all fields derived from attacker-controlled input before dereferencing. Use checked arithmetic (saturating or overflow-checked) for all size calculations. Any validation failure → skip the corrupted section, continue parsing valid sections.                                                       |
| **Diagnostics**   | Log: `ParserWarning: PE section '.text' has invalid offset (offset: 0xFFFFFFFF, fileSize: 0x10000). Section skipped.` Record in `diagnostics.errors[]` with code `INVALID_SECTION_OFFSET`.                                                                                                                                                 |
| **Recovery**      | Corrupted section skipped. Valid sections continue to be parsed. Parser recovery count incremented.                                                                                                                                                                                                                                        |
| **Configuration** | `extractors.executable.strictValidation` (default: true)                                                                                                                                                                                                                                                                                   |

#### 6.1.7 Path Traversal in Archives

| Property          | Specification                                                                                                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Threat**        | An archive entry with a path containing `../` or absolute path components designed to write files outside the extraction directory.                                                                                                                                                                                 |
| **Detection**     | After extracting each entry path, resolve it against the extraction root and verify it starts with the extraction root. Reject paths containing `..` components, absolute paths (starting with `/` or `C:\`), or paths with null bytes. Also detect Unicode normalization attacks (e.g., UTF-8 overlong sequences). |
| **Mitigation**    | Reject the offending entry. Do not extract it. Do not create parent directories outside the extraction root.                                                                                                                                                                                                        |
| **Diagnostics**   | Log: `SecurityWarning: Archive entry '../etc/passwd' contains path traversal. Entry skipped.` Record in diagnostics with code `PATH_TRAVERSAL`.                                                                                                                                                                     |
| **Recovery**      | Offending entry skipped. Other entries extract normally. Pipeline continues.                                                                                                                                                                                                                                        |
| **Configuration** | `extractors.archive.rejectPathTraversal` (default: true)                                                                                                                                                                                                                                                            |

#### 6.1.8 Resource Exhaustion (CPU/Memory)

| Property          | Specification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Threat**        | Inputs designed to consume excessive CPU (ReDoS, exponential backtracking) or memory (hash collision DoS, oversized allocations).                                                                                                                                                                                                                                                                                                                                                                                                |
| **Detection**     | **CPU:** Track per-parser execution time. If parser exceeds configurable timeout (default 5s per file), abort parser. **Regex:** All regex patterns use linear-time matching (no backtracking on attacker-supplied input). Use RE2-style regex engine where possible. **Memory:** Track per-parser allocation. If allocation exceeds configurable limit (default 512MB per artifact), abort parsing. **Hash collisions:** Use randomized hash seeds for hash-based collections (HashMap, HashSet) to prevent hash-collision DoS. |
| **Mitigation**    | **Parser timeout:** Abort parser after timeout, return partial features. **Regex timeout:** Abort regex matching after 100ms per pattern. **Memory limit:** Abort allocation, return partial features. **Hash collision:** Use SipHash or similar DoS-resistant hash.                                                                                                                                                                                                                                                            |
| **Diagnostics**   | Log: `ParserTimeout: Python parser exceeded 5000ms for file 'huge.py'. Partial result returned.` Record with code `PARSER_TIMEOUT` or `MEMORY_LIMIT_EXCEEDED`.                                                                                                                                                                                                                                                                                                                                                                   |
| **Recovery**      | Partial features returned. Artifact marked as `truncated: true`. Pipeline continues.                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Configuration** | `extractors.<type>.timeoutMs` (default: 5000), `extractors.<type>.maxMemoryMb` (default: 512)                                                                                                                                                                                                                                                                                                                                                                                                                                    |

#### 6.1.9 Terminal Escape Injection

| Property          | Specification                                                                                                                                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Threat**        | File content, finding descriptions, or artifact paths containing ANSI escape sequences designed to corrupt terminal output, hide findings, or execute terminal commands.                                                                                                                                     |
| **Detection**     | All output to terminal is sanitized: strip/replace ANSI escape sequences (`\x1b[...`), control characters (0x00–0x1F except tab/newline), and Unicode bidirectional override characters (U+202A–U+202E, U+2066–U+2069). Context snippets (code display) use explicit length limits (100 chars before/after). |
| **Mitigation**    | Strip all ANSI escapes and control characters from user-controlled output. Use a denylist approach with strict allowlisting for safe characters. Render code snippets in a dedicated code block that escapes special characters.                                                                             |
| **Diagnostics**   | Log: `SecurityWarning: Terminal escape sequences detected in artifact path '...\x1b[2J...'. Sequences sanitized.` Record with code `TERMINAL_ESCAPE`.                                                                                                                                                        |
| **Recovery**      | Sanitized string used for display. Original content preserved in canonical data model (not sanitized). Pipeline continues.                                                                                                                                                                                   |
| **Configuration** | Not configurable (always enforced).                                                                                                                                                                                                                                                                          |

#### 6.1.10 Unicode Spoofing / Homoglyph Attacks

| Property          | Specification                                                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Threat**        | Unicode characters that visually resemble ASCII characters (homoglyphs) used to bypass pattern matching or hide malicious identifiers (e.g., Cyrillic 'а' instead of Latin 'a' in `eval`).                                                                          |
| **Detection**     | Apply Unicode normalization (NFC/NFKC) to all artifact paths and string values before pattern matching. Detect mixed-script identifiers (Latin + Cyrillic in same token) and flag as suspicious. Maintain a homoglyph mapping table for security-critical patterns. |
| **Mitigation**    | Normalize all Unicode strings to NFKC before matching. Flag mixed-script identifiers with reduced confidence. Do not block — report with reduced confidence and spoofing suspicion.                                                                                 |
| **Diagnostics**   | Log: `UnicodeWarning: Identifier 'еval' contains mixed scripts (Cyrillic + Latin). Confidence reduced.` Record with code `UNICODE_SPOOFING`.                                                                                                                        |
| **Recovery**      | Feature extracted with reduced confidence. Downstream rules may still match but with lower confidence. Pipeline continues.                                                                                                                                          |
| **Configuration** | `normalization.unicodeForm` (default: "NFKC")                                                                                                                                                                                                                       |

#### 6.1.11 Oversized Files

| Property          | Specification                                                                                                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Threat**        | Files larger than configurable limits designed to exhaust memory or parsing time.                                                                                                                                                                                                    |
| **Detection**     | Check file size before any parsing. If size > `maxFileSize` (default 100MB), skip extraction. For text files, also check line count > `maxLines` (default 1,000,000) — skip if exceeded. For binary files, check section count > `maxSections` (default 100) — skip excess sections. |
| **Mitigation**    | Skip files exceeding size limits. Do not read file content. Report as skipped with diagnostic.                                                                                                                                                                                       |
| **Diagnostics**   | Log: `InputWarning: File 'huge.bin' exceeds max file size (150MB, limit: 100MB). File skipped.` Record with code `FILE_SIZE_EXCEEDED`.                                                                                                                                               |
| **Recovery**      | File skipped. Pipeline continues with remaining files.                                                                                                                                                                                                                               |
| **Configuration** | `limits.maxFileSize` (default: 100MB), `limits.maxLines` (default: 1,000,000)                                                                                                                                                                                                        |

#### 6.1.12 Deep Nesting (Archives & Directories)

| Property          | Specification                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Threat**        | Extremely deep archive-in-archive nesting (archive inside archive inside archive...) designed to exhaust recursion limits or file descriptor pools.                |
| **Detection**     | Track archive nesting depth. If depth > `maxArchiveDepth` (default 10), stop extracting nested archives. Track directory depth separately (default 50).            |
| **Mitigation**    | Do not extract archives beyond max nesting depth. Surface them as unexploded artifacts (available for separate explicit extraction).                               |
| **Diagnostics**   | Log: `SecurityWarning: Archive nesting depth exceeded (depth: 12, limit: 10). Nested archive 'inner.zip' not exploded.` Record with code `NESTING_DEPTH_EXCEEDED`. |
| **Recovery**      | Nested archive treated as opaque artifact (no further extraction). Parent archive continues extraction. Pipeline continues.                                        |
| **Configuration** | `extractors.archive.maxNestingDepth` (default: 10)                                                                                                                 |

#### 6.1.13 Plugin Abuse

| Property          | Specification                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Threat**        | A malicious or vulnerable plugin exploiting its sandbox to access unauthorized resources, exhaust system resources, or crash the host.                                                                                                                                                                                                                                                                                                                                  |
| **Detection**     | **Permissions:** Permission enforcer validates every API call against granted permissions. **Resource limits:** Per-plugin memory (128MB), CPU (100ms per call), and timeouts (30s per request) enforced by sandbox. **Crash detection:** Plugin crashes detected via process exit monitoring. After 3 crashes in 60 seconds, plugin quarantined. **Side-effect monitoring:** Track filesystem writes, network calls, and process spawns. Alert on unexpected patterns. |
| **Mitigation**    | **Permission denial:** API call returns error, plugin continues with reduced capability. **Resource limit:** Plugin process killed and restarted. **Crash loop:** Plugin quarantined, host continues without it. **Side-effect violation:** Permission revoked, plugin deactivated mid-session.                                                                                                                                                                         |
| **Diagnostics**   | Log: `PluginSecurity: Plugin '@evil/malicious-plugin' attempted to access filesystem path outside sandbox. Permission denied.` Record with code `PLUGIN_PERMISSION_VIOLATION`. Quarantine record: `Plugin '@crash/loop-plugin' quarantined after 3 crashes in 45 seconds.`                                                                                                                                                                                              |
| **Recovery**      | Single violation: plugin continues with reduced capability. Crash loop: quarantine until next scan. Quarantined plugin re-checked on next session start.                                                                                                                                                                                                                                                                                                                |
| **Configuration** | `plugins.permissions.<pluginId>.*`, `plugins.maxCrashesBeforeQuarantine` (default: 3)                                                                                                                                                                                                                                                                                                                                                                                   |

### 6.2 Hardening Test Suite

Every hardening measure has a corresponding test:

```typescript
describe('Security Hardening: Zip Bomb', () => {
  it('detects compression ratio exceeding 100:1', async () => {
    const result = await extractArchive('fixtures/malicious/zip-bomb-1000-1.zip');
    expect(result.diagnostics.warnings).toContainEqual(
      expect.objectContaining({ code: 'ZIP_BOMB' }),
    );
    expect(result.truncated).toBe(true);
  });

  it('continues extracting safe entries after bomb detection', async () => {
    const result = await extractArchive('fixtures/mixed/zip-one-bomb-one-safe.zip');
    expect(result.features.length).toBeGreaterThan(0); // Safe entry extracted
    expect(result.diagnostics.warnings.length).toBeGreaterThan(0); // Bomb detected
  });

  it('does not crash on maximum-compression zip bomb', async () => {
    const result = await extractArchive('fixtures/malicious/zip-bomb-max.zip');
    expect(result.diagnostics.errors.length).toBeGreaterThan(0);
    expect(result.truncated).toBe(true);
    // Extract should not throw
  });
});
```

### 6.3 Secure-by-Default Invariants

The following invariants are enforced at compile time (where possible) and runtime:

```
1. All parser inputs are validated before use (validate-then-use pattern).
2. All size calculations use checked arithmetic (no integer overflow).
3. All array accesses are bounds-checked.
4. All resources have explicit timeouts (no unbounded operations).
5. All file paths are resolved and validated before access (no path traversal).
6. All user-controlled output is sanitized (no terminal escape injection).
7. All Unicode is normalized before pattern matching (no spoofing bypass).
8. All plugin operations are permission-gated (no implicit trust).
9. All crashes are caught and isolated (no process crash from input).
10. All recursion has depth limits (no stack overflow).
```

---

## 7. Performance Architecture

### 7.1 Thread & Concurrency Model

```
┌─────────────────────────────────────────────────────────────┐
│                 VERIS Process (single host process)          │
│                                                             │
│  ┌──────────────────┐                                       │
│  │  Event Loop      │  All async I/O, coordination          │
│  │  (main thread)   │  • Discovery, classification         │
│  │                  │  • Pipeline orchestration             │
│  └──────────────────┘                                       │
│           │                                                 │
│  ┌────────┴────────┐  ┌──────────┐  ┌──────────┐          │
│  │  Worker Pool    │  │  Worker  │  │  Worker  │  ...      │
│  │  (CPU-bound)    │  │    1     │  │    2     │           │
│  │                 │  │          │  │          │           │
│  │  • Extraction   │  │ Parse    │  │ Parse    │           │
│  │  • Rule match   │  │ Python   │  │ PE       │           │
│  │  • Scoring      │  │ files    │  │ files    │           │
│  └─────────────────┘  └──────────┘  └──────────┘           │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Plugin Sandbox Process(es) (separate OS processes)   │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐           │  │
│  │  │ Plugin 1 │  │ Plugin 2 │  │ Plugin 3 │  ...       │  │
│  │  └──────────┘  └──────────┘  └──────────┘           │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**Design Decisions:**

| Property          | Decision                            | Rationale                                  |
| ----------------- | ----------------------------------- | ------------------------------------------ |
| Async model       | Promise-based (no callback nesting) | Modern JS ergonomics, cancellation support |
| CPU parallelism   | Worker threads (not processes)      | Lower overhead, shared memory for cache    |
| Plugin isolation  | Child processes (not threads)       | Crash isolation, memory isolation          |
| I/O model         | Non-blocking (async/await)          | No thread blocking on file reads           |
| Concurrency model | Event loop + worker pool            | Best for mixed I/O + CPU workloads         |
| Thread safety     | No shared mutable state             | Message passing between workers            |

### 7.2 Worker Pool Architecture

```typescript
interface WorkerPoolConfig {
  minWorkers: number; // Default: 2
  maxWorkers: number; // Default: CPU cores - 1, min 1
  idleTimeoutMs: number; // Default: 30000 (recycle idle workers)
  queueSize: number; // Default: workers * 10
  workerType: 'thread' | 'process'; // Use threads for built-in, processes for plugins
}

interface WorkerPool {
  exec<T>(task: WorkerTask): Promise<T>;
  broadcast<T>(task: WorkerTask): Promise<T[]>; // Same task on all workers
  getStats(): WorkerPoolStats;
  resize(count: number): void;
  shutdown(): Promise<void>;
}

interface WorkerTask {
  type: string; // "extract", "match-rules", "score"
  payload: unknown; // Task-specific payload
  priority: number; // 0 (critical) to 100 (background)
  timeoutMs: number; // Per-task timeout
  abortSignal?: AbortSignal; // Cancellation support
}

interface WorkerPoolStats {
  activeWorkers: number;
  idleWorkers: number;
  queuedTasks: number;
  completedTasks: number;
  failedTasks: number;
  avgQueueWaitMs: number;
  avgProcessingTimeMs: number;
}
```

### 7.3 Task Scheduling & Backpressure

**Scheduling algorithm:**

```
1. Tasks arrive with priority 0–100 (lower = higher priority)
2. Priority queue maintained per-worker
3. Default scheduling: FIFO within priority tier
4. Starvation prevention: priority aging (task priority decreases by 1 every 10s in queue)
5. Backpressure:
   - If queue size > maxQueueSize (workers × 10): backpressure signal
   - Backpressure actions (in order):
     a. Pause low-priority tasks (priority > 50)
     b. Fall back to sequential processing (single-threaded)
     c. Skip non-critical extraction (text-extractor only)
     d. Log resource pressure warning
   - Backpressure released when queue < maxQueueSize × 0.7
6. Task cancellation:
   - Cancelled tasks are removed from queue
   - In-flight tasks receive AbortSignal
   - Worker slots are freed immediately
```

**Backpressure thresholds:**

| Level    | Queue Utilization | Action                                                |
| -------- | ----------------- | ----------------------------------------------------- |
| Normal   | 0–60%             | No action                                             |
| Elevated | 60–80%            | Log warning, pause low-priority                       |
| High     | 80–95%            | Fall back to sequential, skip non-critical extraction |
| Critical | 95–100%           | Halt new discovery, process remaining queue only      |

### 7.4 Streaming Architecture

```
Input File → [ReadStream] → [Chunk Parser] → [Feature Emitter] → [Feature Queue]
                                                                        │
                                                                        ▼
                                                             [Worker Pool]
                                                                        │
                                                                        ▼
                                                        [Behavior Classifier]
                                                                        │
                                                                        ▼
                                                             [Rule Engine Stream]
                                                                        │
                                                                        ▼
                                                            [Finding Collector]
                                                                        │
                                                                        ▼
                                                            [Report Builder]
```

**Streaming principles:**

1. Files are processed as streams where possible (binary headers read first, content on demand).
2. Features are emitted as they are discovered (not batched until end of file).
3. The rule engine can begin matching as soon as the first behavior is classified.
4. The finding collector batches findings per artifact (for correlation).
5. The report builder waits for all artifacts to complete (cross-artifact analysis).

**Stream backpressure:**

- Each stream stage has a bounded buffer (configurable, default 1000 items).
- If downstream is slower, upstream pauses (applies backpressure via `Readable.push()` semantics).
- If upstream is slower, downstream idles (no busy-waiting).
- If buffer overflows, the pipeline uses the backpressure strategy (see §7.3).

### 7.5 Memory Budgeting

**Per-component memory budgets:**

| Component                | Budget      | Enforcement       |
| ------------------------ | ----------- | ----------------- |
| Core engine + runtime    | 50 MB       | Baseline          |
| Loaded rules (10,000)    | 50 MB       | At pack load time |
| Extraction working set   | 200 MB      | Per-scan limit    |
| Worker pool              | 100 MB      | Per-worker limit  |
| Classified artifacts     | 100 MB      | Per-scan limit    |
| Features (all artifacts) | 200 MB      | Per-scan limit    |
| Behaviors                | 100 MB      | Per-scan limit    |
| Evidence / Findings      | 100 MB      | Per-scan limit    |
| Cache (L1/L2/L3)         | 100 MB      | LRU eviction      |
| Report data              | 100 MB      | Per-scan limit    |
| Plugin sandboxes         | 128 MB      | Per-plugin limit  |
| **Total working set**    | **~1.2 GB** | Hard limit        |

**Memory limit enforcement:**

- Hard limit: `--max-memory` flag (default 2GB for the entire process).
- Soft limit: 80% of hard limit triggers GC pressure signal.
- Per-worker memory tracked via `process.memoryUsage()`.
- Per-plugin memory enforced via OS-level rlimit (child process).
- If soft limit exceeded: pause non-critical work, run GC, resume.
- If hard limit exceeded: abort current scan, save partial report, exit.

### 7.6 Cache Strategy

| Cache          | Key                     | Value              | Max Size        | Eviction   | Scoped           |
| -------------- | ----------------------- | ------------------ | --------------- | ---------- | ---------------- |
| Classification | contentHash + size      | ClassifiedArtifact | 100,000 entries | LRU        | Per-session      |
| AST            | contentHash             | Parsed AST         | 1,000 entries   | LRU        | Per-session      |
| Feature        | contentHash + extractor | Feature[]          | 10,000 entries  | LRU        | Per-session      |
| Behavior       | featureIds[] hash       | Behavior           | 100,000 entries | LRU        | Per-session      |
| RuleResult     | ruleId + behaviorId     | RuleResult         | 500,000 entries | LRU        | Per-session      |
| Regex          | pattern + flags         | CompiledRegex      | 10,000 patterns | LRU        | Process lifetime |
| File content   | contentHash             | Buffer             | 500 entries     | LRU + size | Per-session      |

**Cache invalidation rules:**

- All per-session caches are created at scan start and destroyed at scan end.
- No cross-session caching (guarantees reproducibility).
- The regex cache is the only process-lifetime cache (re compiled regex patterns).
- Cache entries are content-addressed (same content = same key = cached result).
- Cache size limits are enforced by LRU eviction.
- Cache statistics are reported in diagnostics.

### 7.7 Large Repository Handling

| Strategy              | Description                                             | Threshold                |
| --------------------- | ------------------------------------------------------- | ------------------------ |
| Risk density scoring  | Use risk density (mean artifact risk) instead of volume | > 10,000 files           |
| Bin-based aggregation | Group findings into 25 bins (5 severity × 5 confidence) | > 100,000 findings       |
| Top-N reporting       | Report top 10 findings by risk contribution             | Always                   |
| Virtual scrolling     | Only render visible items in TUI                        | > 1,000 items            |
| Lazy detail loading   | Compute detail views on demand                          | Always                   |
| Sampling              | Analyze a representative subset of files                | > 500,000 files (opt-in) |
| Incremental diff      | Only re-analyze changed artifacts                       | Workspace mode           |
| Memory-mapped I/O     | Read files without loading entirely into memory         | > 1GB files              |

**Sample mode (opt-in):**

```yaml
# .verisrc
scan:
  sampling:
    enabled: true          # Only for repos > 500K files
    strategy: "stratified"  # stratified | random | by-directory
    sampleSize: 10000      # Analyze at most 10,000 files
    strata:                # Stratified by file type
      - type: "script/*"    weight: 0.4
      - type: "configuration/*" weight: 0.3
      - type: "executable/*" weight: 0.2
      - type: "*"            weight: 0.1
```

### 7.8 Incremental Scan Preparation

```typescript
interface IncrementalScanState {
  baselineReportId: ReportId;
  baselineTimestamp: ISO8601;
  artifactHashes: Map<ArtifactPath, ContentHash>;
  findingIds: Set<FindingId>;
  sessionFindings: Map<SessionId, FindingId[]>;
}

// Incremental scan algorithm:
// 1. Load baseline artifact hash map from previous scan
// 2. Discover current artifacts
// 3. For each artifact:
//    a. If contentHash matches baseline → skip extraction, reuse baseline features
//    b. If contentHash differs → extract, run rules, produce new findings
//    c. If artifact is new (not in baseline) → extract and analyze
//    d. If artifact was removed (in baseline not in current) → mark findings as resolved
// 4. For each rule:
//    a. If rule version unchanged AND all input behaviors unchanged → reuse RuleResults
//    b. If rule or behaviors changed → re-match
// 5. Merge: new findings + unchanged findings - resolved findings = current findings
// 6. Recompute trust, risk, report from merged findings
```

### 7.9 Cancellation, Pause, Resume

**Cancellation protocol:**

```typescript
interface CancellationProtocol {
  // Request cancellation
  cancel(reason: string): void;

  // Check if cancelled (polled by workers)
  isCancelled(): boolean;

  // Wait for cancellation to propagate
  onCancelled(): Promise<void>;

  // Current cancellation state
  state: 'running' | 'cancelling' | 'cancelled';

  // Register cleanup handler
  onCancel(handler: () => void): void;
}
```

**Cancellation propagation:**

1. User presses Ctrl+C or programmatic cancel called.
2. Pipeline state → `cancelling`.
3. Active workers receive AbortSignal via their task context.
4. Workers complete current artifact extraction (graceful, no mid-artifact abort).
5. Workers do not pick up new tasks.
6. In-progress extraction completes and emits partial results.
7. Pipeline state → `cancelled`.
8. Partial report generated with `status: "cancelled"` and progress metadata.
9. Cleanup: temporary files deleted, worker pool shutdown initiated.
10. User sees: "Scan cancelled after 45 of 100 artifacts (45%). Partial report available."

**Timeout cancellation:**

- If max scan duration is configured (`limits.maxDuration`), a timer triggers automatic cancellation.
- Same cancellation protocol as user-initiated cancellation.
- Duration is checked at configurable intervals (default: every 30s for long scans).

**Pause/Resume (V2+):**

```typescript
interface PauseResumeProtocol {
  pause(): Promise<void>; // Complete current artifact, pause before next
  resume(): Promise<void>; // Resume from paused state
  state: 'running' | 'paused' | 'cancelled';
}
```

Pause is implemented by:

1. Setting a "pause requested" flag.
2. Workers check the flag between artifacts.
3. If flag is set, worker completes current artifact and goes idle.
4. No new tasks dispatched from queue.
5. Resume clears flag and dispatches remaining tasks.

### 7.10 Progress Reporting

**Progress data structure:**

```typescript
interface ScanProgress {
  // Overall progress
  phase:
    | 'discovery'
    | 'extraction'
    | 'classification'
    | 'rules'
    | 'correlation'
    | 'scoring'
    | 'reporting'
    | 'complete'
    | 'cancelled';
  percentComplete: number; // 0–100
  elapsedMs: number;
  estimatedRemainingMs: number;

  // Artifact processing
  totalArtifacts: number;
  processedArtifacts: number;
  artifactsPerSecond: number;
  currentArtifact: string | null; // Path of artifact being processed

  // Findings
  findingsFound: number;
  findingsBySeverity: Record<SeverityLevel, number>;

  // Resource usage
  memoryMb: number;
  cpuPercent: number;
  cacheHitRatio: number;

  // Stage breakdown
  stages: {
    discovery: StageProgress;
    extraction: StageProgress;
    classification: StageProgress;
    rules: StageProgress;
    correlation: StageProgress;
    scoring: StageProgress;
    reporting: StageProgress;
  };
}

interface StageProgress {
  status: 'pending' | 'active' | 'complete' | 'skipped';
  percentComplete: number;
  itemsProcessed: number;
  itemsTotal: number;
}
```

**Update frequency:**

- Live TUI: 200ms intervals (5 updates/second).
- JSON export: at completion only.
- CI mode: at completion, with periodic status lines (every 5 seconds for long scans).

---

## 8. Benchmark Suite

### 8.1 Standardized Benchmark Scenarios

```
tools/perf/scenarios/
├── quick-scan/                        # Minimal scan (single file)
├── small-repo/                        # ~100 files, ~1MB
├── medium-repo/                       # ~10,000 files, ~100MB
├── large-repo/                        # ~100,000 files, ~1GB (LFS)
├── monorepo/                          # ~500,000 files, ~5GB (LFS)
├── binary-heavy/                      # Many PE/ELF files
├── archive-heavy/                     # Nested archives
├── deep-tree/                         # 100+ level directory nesting
├── secrets-only/                      # Secrets rule pack only
├── all-rules/                         # All rule packs enabled
└── adversarial/                       # Deliberately adversarial inputs
```

### 8.2 Benchmark Metrics

| Metric                     | Unit             | Collection Method                | Regression Threshold |
| -------------------------- | ---------------- | -------------------------------- | -------------------- |
| **Runtime**                |                  |                                  |                      |
| Total scan time            | seconds          | Wall clock                       | +20%                 |
| Extraction time            | seconds          | Per-extractor timing             | +20%                 |
| Rule matching time         | seconds          | Per-rule timing                  | +20%                 |
| Score calculation time     | ms               | Per-session                      | +30%                 |
| Report generation time     | ms               | Per-report                       | +30%                 |
| **Throughput**             |                  |                                  |                      |
| Files per second           | files/s          | Total files / extraction time    | -20%                 |
| Rules per second           | rules/s          | Total rules / matching time      | -20%                 |
| Features per second        | features/s       | Total features / extraction time | -20%                 |
| **Memory**                 |                  |                                  |                      |
| Peak heap usage            | MB               | process.memoryUsage()            | +20%                 |
| Average heap usage         | MB               | process.memoryUsage()            | +20%                 |
| External memory            | MB               | process.memoryUsage().external   | +20%                 |
| Worker memory per-task     | MB/worker        | Per-worker tracking              | +20%                 |
| **CPU**                    |                  |                                  |                      |
| User CPU time              | seconds          | process.cpuUsage().user          | +20%                 |
| System CPU time            | seconds          | process.cpuUsage().system        | +20%                 |
| CPU efficiency             | files/s per %CPU | Computed                         | -15%                 |
| **I/O**                    |                  |                                  |                      |
| Bytes read                 | bytes            | fs.read tracking                 | +20%                 |
| Bytes written              | bytes            | fs.write tracking                | +20%                 |
| File read count            | count            | fs.open tracking                 | +20%                 |
| **Cache**                  |                  |                                  |                      |
| Classification cache ratio | %                | Cache hit / (hit + miss)         | -10%                 |
| Behavior cache ratio       | %                | Cache hit / (hit + miss)         | -10%                 |
| RuleResult cache ratio     | %                | Cache hit / (hit + miss)         | -10%                 |
| **Rule Engine**            |                  |                                  |                      |
| P50 rule execution         | ms               | Per-rule timing                  | +15%                 |
| P95 rule execution         | ms               | Per-rule timing                  | +15%                 |
| P99 rule execution         | ms               | Per-rule timing                  | +20%                 |
| Rules skipped              | count            | Scheduler stats                  | +20%                 |
| **Extraction**             |                  |                                  |                      |
| P50 extraction time        | ms               | Per-extractor timing             | +15%                 |
| P95 extraction time        | ms               | Per-extractor timing             | +15%                 |
| Parser recovery rate       | %                | Recoveries / total files         | +5pp                 |
| Extraction fallback rate   | %                | Fallbacks / total files          | +5pp                 |

### 8.3 Benchmark Execution

```yaml
# tools/perf/benchmark-config.yaml
benchmarks:
  quick-scan:
    scenario: 'quick-scan'
    description: 'Single file scan with default profile'
    warmupRuns: 3
    measurementRuns: 10
    timeoutMs: 30000
    profiles: ['quick']

  medium-repo-extraction:
    scenario: 'medium-repo'
    description: 'Extraction phase only for medium repository'
    warmupRuns: 2
    measurementRuns: 5
    timeoutMs: 300000
    profiles: ['balanced']
    stage: 'extraction' # Only measure extraction phase

  medium-repo-full:
    scenario: 'medium-repo'
    description: 'Full analysis of medium repository'
    warmupRuns: 2
    measurementRuns: 5
    timeoutMs: 600000
    profiles: ['balanced']

  large-repo-full:
    scenario: 'large-repo'
    description: 'Full analysis of large repository'
    warmupRuns: 1
    measurementRuns: 3
    timeoutMs: 3600000
    profiles: ['large-repo']
    skip: 'large-file-lfs-not-present' # Skip if LFS files not available
```

### 8.4 Benchmark Reporting

```json
{
  "benchmark": "medium-repo-full",
  "timestamp": "2024-03-15T10:30:00Z",
  "engine": {
    "version": "1.2.0",
    "commit": "abc123def",
    "platform": "linux-x64"
  },
  "system": {
    "cpu": "AMD EPYC 7763 64-Core",
    "cores": 16,
    "memory": "64 GB",
    "disk": "NVMe SSD",
    "os": "Ubuntu 22.04 LTS"
  },
  "results": {
    "totalScanTimeMs": 45230,
    "filesPerSecond": 221,
    "peakMemoryMb": 456,
    "avgCpuPercent": 45,
    "findingsFound": 234,
    "cacheHitRatios": {
      "classification": 0.87,
      "behavior": 0.85,
      "ruleResult": 0.41
    },
    "stageBreakdown": {
      "discoveryMs": 120,
      "extractionMs": 28450,
      "classificationMs": 2100,
      "rulesMs": 9800,
      "correlationMs": 1200,
      "scoringMs": 800,
      "reportingMs": 300
    },
    "extractorBreakdown": {
      "python-extractor": { "count": 234, "totalMs": 8200, "avgMs": 35.0, "p95Ms": 120.5 },
      "pe-extractor": { "count": 45, "totalMs": 4500, "avgMs": 100.0, "p95Ms": 345.6 },
      "text-extractor": { "count": 4567, "totalMs": 3650, "avgMs": 0.8, "p95Ms": 3.4 }
    },
    "ruleBreakdown": {
      "secrets/aws-key": { "count": 1234, "totalMs": 148, "avgMs": 0.12, "p95Ms": 0.45 },
      "scripts/eval-usage": { "count": 567, "totalMs": 505, "avgMs": 0.89, "p95Ms": 3.45 }
    }
  },
  "regressions": {
    "againstBaseline": "v1.1.0",
    "regressionsFound": [],
    "improvementsFound": [{ "metric": "filesPerSecond", "change": "+12%" }]
  }
}
```

### 8.5 Memory Regression Tests

**Purpose:** Detect memory leaks, unbounded allocations, and regressions in peak memory usage across engine versions. Memory stability is critical for a security product that processes untrusted input.

**Mechanism:**

Memory regression tests are integrated into the benchmark suite and run as part of nightly CI:

1. **Baseline capture:** Each benchmark scenario records a memory baseline (peak heap, average heap, external memory, RSS) alongside timing metrics.
2. **Per-commit comparison:** Every nightly run compares current memory metrics against the baseline from the `main` branch.
3. **Per-scenario budgets:** Each benchmark scenario has a specific memory budget (e.g., medium-repo: peak 1024MB).
4. **Leak detection:** Run the same scenario 3 times in sequence without process restart. If peak memory increases monotonically, a leak is suspected.
5. **Allocation tracking:** Track per-component memory (cache, AST, worker pool) to identify which subsystem is regressing.

**Regression thresholds:**

| Metric                       | Warning            | Blocking           | Critical           |
| ---------------------------- | ------------------ | ------------------ | ------------------ |
| Peak heap                    | +10% from baseline | +20% from baseline | +50% from baseline |
| Average heap                 | +15% from baseline | +25% from baseline | +60% from baseline |
| External memory              | +20% from baseline | +30% from baseline | +75% from baseline |
| Monotonic increase (3 runs)  | +5% per run        | +10% per run       | +20% per run       |
| Cache memory (per-component) | +20% from baseline | +30% from baseline | +50% from baseline |

**Execution:** `pnpm benchmark:memory`

- Runs all benchmark scenarios with memory profiling enabled.
- Compares against stored baseline.
- Reports regression table in CI output.
- Blocks release on `Blocking` or `Critical` thresholds.

**Tooling:**

- Heap snapshots via `v8.writeHeapSnapshot()` for deep analysis.
- Allocation profiling via `--trace-gc` in diagnostic mode.
- Per-worker memory tracking via `worker.resourceLimits.maxOldGenerationSizeMb`.
- Leak detection via the monotonic-increase heuristic described above.

**Cross-reference:** Memory regression thresholds are also enforced in CI quality gates (§10.2). Memory profiling snapshots (§9.5) provide the diagnostic data for debugging regressions.

---

### 8.6 Performance Budget Validation

```typescript
interface PerformanceBudget {
  scenario: string; // "medium-repo-full"
  version: string; // "v1.2.0"

  // Absolute budgets (hard limits)
  absolute: {
    maxTotalTimeMs: number; // 600000
    maxPeakMemoryMb: number; // 1024
    maxP95RuleMs: number; // 100
    maxP95ExtractionMs: number; // 500
  };

  // Relative budgets (regression limits)
  relative: {
    maxRuntimeRegressionPct: number; // 20
    maxMemoryRegressionPct: number; // 20
    minCacheHitRatio: number; // 0.70 (classification)
    maxParserRecoveryPct: number; // 5
    maxExtractionFallbackPct: number; // 3
  };
}

// Validated in CI
function validatePerformanceBudget(
  baseline: BenchmarkReport,
  current: BenchmarkReport,
  budget: PerformanceBudget,
): ValidationResult {
  // Check absolute budgets
  if (current.results.totalScanTimeMs > budget.absolute.maxTotalTimeMs) {
    /* FAIL */
  }
  if (current.results.peakMemoryMb > budget.absolute.maxPeakMemoryMb) {
    /* FAIL */
  }

  // Check relative budgets (regression)
  const timeChange =
    ((current.results.totalScanTimeMs - baseline.results.totalScanTimeMs) /
      baseline.results.totalScanTimeMs) *
    100;
  if (timeChange > budget.relative.maxRuntimeRegressionPct) {
    /* FAIL */
  }

  // Check cache ratios
  if (current.results.cacheHitRatios.classification < budget.relative.minCacheHitRatio) {
    /* WARN */
  }

  // Return pass/fail/warn for each check
}
```

---

## 9. Observability Strategy

### 9.1 Structured Logging

**Log format (JSON Lines):**

```json
{
  "timestamp": "2024-03-15T10:30:00.123Z",
  "level": "info",
  "logger": "@veris/extractors",
  "traceId": "trc_abc123def456",
  "spanId": "span_extract_python_001",
  "message": "Extraction completed",
  "context": {
    "artifactId": "art_78901234",
    "extractorId": "python-extractor",
    "durationMs": 45.2,
    "featuresExtracted": 12,
    "parserRecoveryCount": 0,
    "fileSize": 2048
  },
  "error": null
}
```

**Log levels:**

| Level   | When Used                                                        | Output              |
| ------- | ---------------------------------------------------------------- | ------------------- |
| `error` | Pipeline failures, parser crashes, security violations           | stderr              |
| `warn`  | Parser recovery, limits hit, fallback usage, cache misses        | stdout              |
| `info`  | Stage transitions, extraction completion, rule match counts      | stdout              |
| `debug` | Detailed timing, individual feature extraction, cache operations | stdout (verbose)    |
| `trace` | Per-line parser decisions, individual matcher evaluations        | stdout (diagnostic) |

**Log configuration:**

```yaml
# .verisrc
diagnostics:
  enabled: true
  level: 'info' # error | warn | info | debug | trace
  output: 'stdout' # stdout | stderr | file
  filePath: '~/.veris/logs/scan-{timestamp}.jsonl'
  format: 'json' # json | pretty | silent
  sampling: # Reduce high-volume logs
    cacheHits: 0.01 # Log 1% of cache hits
    featureExtractions: 0.1 # Log 10% of feature extractions
```

### 9.2 Trace IDs & Span Architecture

```typescript
interface TraceContext {
  traceId: string; // Unique per scan session
  parentSpanId: string | null; // Parent span (for hierarchy)
  spanId: string; // Current span
  spanName: string; // e.g., "extract:python-script"
  spanKind: 'internal' | 'client' | 'server' | 'producer' | 'consumer';
  startTime: [number, number]; // hrtime bigint
  attributes: Record<string, string | number | boolean>;
  status: 'ok' | 'error';
  error?: string;
}
```

**Span hierarchy:**

```
trace: scan_session_001
├── span: discover_files
│   ├── span: walk_directory (per directory)
│   │   ├── span: read_directory_entries
│   │   └── span: classify_artifact (per file)
│   └── span: apply_gitignore
├── span: extract_artifacts
│   ├── span: extract:python-extractor (per Python file)
│   │   ├── span: parse_ast
│   │   ├── span: extract_features (per feature)
│   │   └── span: emit_capabilities
│   ├── span: extract:pe-extractor (per PE file)
│   │   ├── span: parse_pe_header
│   │   ├── span: parse_sections
│   │   └── span: extract_strings
│   └── span: extract:text-extractor (per text file - fallback)
├── span: classify_behaviors
│   └── span: classify:python-extractor (per artifact)
├── span: match_rules
│   ├── span: match:secrets/aws-key
│   ├── span: match:scripts/eval-usage
│   └── span: match:configuration/debug-enabled
├── span: correlate_findings
│   ├── span: dedup_findings
│   └── span: detect_behavior_chains
├── span: compute_trust
├── span: compute_risk
└── span: build_report
```

### 9.3 Timing Spans

```typescript
function createTimingSpan(name: string, attributes?: Record<string, unknown>): TimingSpan {
  const start = process.hrtime.bigint();
  return {
    name,
    attributes,
    start,
    end: () => {
      const end = process.hrtime.bigint();
      const durationNs = Number(end - start);
      return {
        name,
        durationMs: durationNs / 1_000_000,
        attributes,
        startTime: new Date().toISOString(),
      };
    },
  };
}

// Usage
const extractionSpan = createTimingSpan('extract:python-main.py', { fileSize: 2048 });
const result = await extractor.extract(artifact, context);
const timing = extractionSpan.end();
// timing = { name: "extract:python-main.py", durationMs: 45.2, ... }
```

### 9.4 Pipeline Profiling

**Profiling output (diagnostic mode):**

```
Pipeline Profile: medium-repo (10,234 files, 45.2s total)
═══════════════════════════════════════════════════════
Stage                 Duration     %       Files/s
────────────────────────────────────────────────────
Discovery             0.2s         0.4%    51,170
Extraction           28.5s        63.1%   359
Classification        2.1s         4.6%    4,873
Rule Matching         9.8s         21.7%   1,044
Correlation           1.2s         2.7%    —
Scoring               0.8s         1.8%    —
Reporting             0.3s         0.7%    —

Bottleneck: Extraction (63.1%)
  Top extractors:
    1. python-extractor    8.2s (28.8%)  avg: 35ms
    2. pe-extractor        4.5s (15.8%)  avg: 100ms
    3. javascript-extractor 3.1s (10.9%) avg: 31ms

Cache Performance:
  Classification: 87.2% (8,432 hits / 1,234 misses)
  Behavior:       85.5% (12,345 / 2,100)
  RuleResult:     41.3% (3,211 / 4,567) ← LOW

Recommendations:
  ⚠ RuleResult cache ratio is low (41.3%). Consider:
    - Increasing rule time windows
    - Reducing rule churn between sessions
```

### 9.5 Memory Profiling

```typescript
interface MemorySnapshot {
  timestamp: ISO8601;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
  workerMemory: Map<string, number>; // Per-worker memory
  cacheMemory: {
    classification: number;
    behavior: number;
    ruleResult: number;
    regex: number;
    ast: number;
  };
  pluginMemory: Map<string, number>; // Per-plugin memory
}
```

**Memory snapshots are taken:**

- At scan start (baseline)
- After each pipeline stage
- On any warning-level event
- At scan completion
- On diagnostic request (`--diagnostics memory`)

### 9.6 Rule Profiling

```yaml
Rule Profile Report:
═══════════════════════════════════════════════════════════════════
Rule                               Calls     Total    Avg     P95     Cache
                                                    (ms)    (ms)    Hit%
────────────────────────────────────────────────────────────────────────
secrets/aws-key                     1,234    148ms    0.12    0.45   92.1%
secrets/github-token                1,100    132ms    0.12    0.50   91.5%
secrets/generic-api-key             987      1,233ms  1.25    4.50   45.2%
scripts/eval-usage                  567      505ms    0.89    3.45   61.2%
scripts/shell-execution             450      1,350ms  3.00    12.3   38.9%
injection/sql-injection             89       4,064ms  45.67   123.4  12.3%
executables/packing-detection       234      5,487ms  23.45   89.0   22.1%

Slowest rules (avg):
  1. injection/sql-injection      45.67ms  ← GPU-accelerate? Reduce corpus?
  2. executables/packing-detect   23.45ms  ← Optimize regex?
  3. scripts/shell-execution       3.00ms

Rules with lowest cache hit ratio:
  1. injection/sql-injection      12.3% ← High churn
  2. executables/packing-detect   22.1% ← High churn
  3. scripts/shell-execution      38.9% ← Moderate churn
```

### 9.7 Extractor Profiling

```yaml
Extractor Profile Report:
═══════════════════════════════════════════════════════════════════
Extractor                Files     Total     Avg     P95     Recovery
                                    (s)     (ms)    (ms)     Rate
────────────────────────────────────────────────────────────────────
python-extractor         2,345     82.1s    35.0    120.5   3.6%
javascript-extractor     1,234     37.0s    30.0    98.0    2.1%
pe-extractor              567      56.7s    100.0   345.6   1.2%
elf-extractor             234      23.4s    100.0   312.0   0.8%
powershell-extractor      123      10.9s    89.0    234.5   5.0%
zip-extractor             456      2.6s     5.7     23.4    0.4%
text-extractor           4,567     3.7s     0.8     3.4     0.0%
binary-extractor          234      5.4s     23.0    89.0    8.0%

Extractors with highest recovery rate:
  1. binary-extractor       8.0% ← Many non-binary files reaching fallback
  2. powershell-extractor   5.0% ← Grammar gaps?
  3. python-extractor       3.6% ← Wide variety of syntax errors

Extractors by memory usage:
  1. pe-extractor           avg 45MB ← Section string extraction
  2. python-extractor       avg 32MB ← AST caching
  3. javascript-extractor   avg 28MB ← AST caching
```

### 9.8 Plugin Profiling

```yaml
Plugin Profile Report:
═══════════════════════════════════════════════════════════════════
Plugin                  Calls   Total    Avg      Max    Memory
                                (ms)    (ms)     (ms)    (MB)
────────────────────────────────────────────────────────────────
@acme/html-renderer       1     456ms   456ms    456ms   12.5
@acme/ai-enhancer         12    3,456ms 288ms    1,200ms 45.2  ← HIGH
@veris/core               234   46.8ms  0.2ms    2.1ms   4.2

Plugin overhead: 3.9% of total scan time
Plugin memory: 61.9 MB (out of 256 MB budget)
```

### 9.9 Diagnostic Snapshot

A diagnostic snapshot is a complete dump of the current system state for debugging:

```typescript
interface DiagnosticSnapshot {
  timestamp: ISO8601;
  engineVersion: string;
  config: VerisConfig; // Resolved configuration
  scanProgress: ScanProgress; // Current progress
  memory: MemorySnapshot; // Memory state
  cache: CacheStats; // Current cache state
  workers: WorkerStats[]; // Per-worker status
  plugins: PluginStats[]; // Per-plugin status
  rules: {
    total: number;
    loaded: number;
    skipped: number;
    failed: number;
  };
  extractors: {
    total: number;
    active: number;
    failed: number;
  };
  artifacts: {
    discovered: number;
    classified: number;
    extracted: number;
    failed: number;
    skipped: number;
  };
  findings: {
    total: number;
    bySeverity: Record<string, number>;
    byConfidence: Record<string, number>;
  };
  events: LogEntry[]; // Recent log events (last 1000)
  errors: ErrorEntry[]; // All errors this session
}
```

Snapshots are:

- Triggered by SIGUSR1 signal (or `--diagnostics snapshot`).
- Written to `~/.veris/diag/snapshot-{timestamp}.json`.
- Obfuscated (no file contents, only paths and hashes).
- Automatically written on scan failure.

---

## 10. CI Quality Gates

### 10.1 Gate Architecture

```
PR Created
    │
    ▼
┌─────────────────────────────────────┐
│  Gate 1: Static Analysis            │  ~2 min
│  • Linting (ESLint)                 │
│  • Type checking (tsc)              │
│  • Formatting (Prettier)            │
│  • Import cycle detection (madge)   │
│  • License validation               │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Gate 2: Unit & Component Tests     │  ~5 min
│  • pnpm test:unit                    │
│  • pnpm test:component               │
│  • pnpm test:coverage                │
│  • 90% branch coverage check        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Gate 3: Integration & Golden       │  ~10 min
│  • pnpm test:integration            │
│  • pnpm golden:validate             │
│  • pnpm test:golden                 │
│  • pnpm test:determinism            │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Gate 4: Pipeline & E2E             │  ~15 min
│  • pnpm test:pipeline               │
│  • pnpm test:e2e                    │
│  • pnpm test:smoke                  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Gate 5: Performance (Nightly)      │  ~60 min
│  • pnpm benchmark                   │
│  • pnpm benchmark:compare           │
│  • pnpm benchmark:validate-budgets  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Gate 6: Security (Nightly)         │  ~60 min
│  • pnpm test:adversarial            │
│  • pnpm test:fuzz (short)           │
│  • pnpm test:hardening              │
│  • pnpm test:corpus-regression      │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Gate 7: Cross-Platform (Weekly)    │  ~60 min
│  • Linux, macOS, Windows            │
│  • pnpm test:all                    │
│  • pnpm benchmark --all             │
└─────────────────────────────────────┘
```

### 10.2 Mandatory Quality Gates (Pre-Release)

| Gate                                   | Condition                                                      | Pass/Fail   | Action on Fail                            |
| -------------------------------------- | -------------------------------------------------------------- | ----------- | ----------------------------------------- |
| **All tests pass**                     | 100% of unit, component, integration, pipeline, E2E tests pass | Required    | Block release                             |
| **Golden snapshots unchanged**         | All golden tests pass (no drift)                               | Required    | Review golden diff, approve intentionally |
| **Golden diff approved**               | If golden changed, diff is reviewed and approved               | Required    | Block release without approval            |
| **Coverage thresholds met**            | Branch ≥ 90% (domain), ≥ 80% (app)                             | Required    | Block release                             |
| **Performance regression < threshold** | No metric regressed > 20% from baseline                        | Required    | Block release                             |
| **Memory regression < threshold**      | Peak memory not increased > 20%                                | Required    | Block release                             |
| **Linting passes**                     | ESLint zero errors, zero warnings                              | Required    | Block release                             |
| **Type safety**                        | `tsc --noEmit` zero errors                                     | Required    | Block release                             |
| **Import cycles**                      | `madge` zero cycles                                            | Required    | Block release                             |
| **Documentation validation**           | All public APIs documented, no broken links                    | Required    | Block release                             |
| **License validation**                 | All dependencies have compatible licenses                      | Required    | Block release                             |
| **Security audit**                     | `pnpm audit` zero critical/high vulnerabilities                | Required    | Block release                             |
| **Reproducible builds**                | Two independent builds produce identical artifacts             | Recommended | Warn                                      |
| **Changelog updated**                  | Changelog entry exists for this release                        | Required    | Block release                             |
| **Version bump correct**               | Version follows semver rules                                   | Required    | Block release                             |
| **Adversarial tests pass**             | All hardening tests pass                                       | Required    | Block release                             |
| **Corpus regression tests pass**       | Expected findings match within tolerance                       | Required    | Block release                             |

### 10.3 CI Workflow Configuration

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  static-analysis:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: pnpm install
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm format:check
      - run: pnpm cycles
      - run: pnpm licenses:check

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm test:unit --coverage
      - run: pnpm test:component --coverage
      - uses: codecov/codecov-action@v3

  integration-golden:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm test:integration
      - run: pnpm golden:validate
      - run: pnpm test:determinism

  pipeline-e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm test:pipeline
      - run: pnpm test:e2e

  nightly-performance:
    if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm benchmark --scenario=medium-repo
      - run: pnpm benchmark:compare --baseline=latest
      - run: pnpm benchmark:validate-budgets
      - uses: actions/upload-artifact@v4
        with:
          name: benchmark-results
          path: tools/perf/reports/

  nightly-security:
    if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm test:adversarial
      - run: pnpm test:hardening
      - run: pnpm test:corpus-regression

  weekly-cross-platform:
    if: github.event_name == 'schedule'
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - run: pnpm install
      - run: pnpm test:all
      - run: pnpm golden:validate
```

### 10.4 Quality Gate Escalation

| Gate Failure                   | First Occurrence                  | Second Occurrence               | Third Occurrence                 |
| ------------------------------ | --------------------------------- | ------------------------------- | -------------------------------- |
| Perf regression < 20%          | Warning in PR                     | Block PR + tag team             | Block release + escalate to lead |
| Perf regression 20–50%         | Block PR                          | Block release + tag lead        | Escalate to architect            |
| Perf regression > 50%          | Block release + tag team          | Escalate to lead                | Emergency review                 |
| Golden drift (unapproved)      | Block PR + diff required          | Block release + review required | Escalate to architect            |
| Memory regression < 20%        | Warning in PR                     | Block PR + tag team             | Block release + escalate         |
| Security hardening failure     | Block release + tag security team | Escalate to lead                | Emergency fix required           |
| Corpus regression > 5 findings | Block PR + review required        | Block release + tag team        | Escalate to lead                 |
| Determininism failure (any)    | Block release + tag entire team   | Emergency fix                   | Architectural review             |

### 10.5 Reproducible Build Validation

```yaml
# Reproducible build check (CI step)
reproducible-build:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - run: pnpm install

    # Build 1
    - run: pnpm build --filter=@veris/core
    - run: cp packages/core/dist/core.js dist1.js

    # Clean and rebuild
    - run: pnpm clean
    - run: pnpm build --filter=@veris/core
    - run: cp packages/core/dist/core.js dist2.js

    # Compare
    - run: sha256sum dist1.js dist2.js
    - name: Compare hashes
      run: |
        if [ "$(sha256sum dist1.js | cut -d' ' -f1)" != \
             "$(sha256sum dist2.js | cut -d' ' -f1)" ]; then
          echo "Build not reproducible!"
          exit 1
        fi
```

---

## 11. Self-Healing & Recovery Architecture

### 11.1 Fault Classification

| Fault Category          | Examples                           | Recovery Strategy                                |
| ----------------------- | ---------------------------------- | ------------------------------------------------ |
| **Resource exhaustion** | OOM, ENOSPC, EMFILE                | Pause, GC, retry; if persistent → skip artifacts |
| **Parser crash**        | Corrupted file causes throw        | Catch, log, continue with next file              |
| **Timeout**             | Parser exceeds time limit          | Abort parser, return partial features            |
| **Security boundary**   | Zip bomb, path traversal           | Abort entry, log security warning, continue      |
| **Plugin failure**      | Plugin crash, permission violation | Log, quarantine, continue without plugin         |
| **Worker failure**      | Worker thread crash                | Restart worker, reassign tasks                   |
| **Cache corruption**    | Cache entry fails validation       | Evict corrupted entry, recalculate               |
| **Disk failure**        | Cannot write output                | Fall back to stdout-only output                  |
| **Network failure**     | AI plugin cannot reach API         | Graceful degradation (no AI explanation)         |

### 11.2 Self-Healing Procedures

```typescript
interface SelfHealingProcedure {
  detect: () => Promise<boolean>; // Detect the fault
  diagnose: () => Promise<FaultDiagnosis>; // Diagnose the root cause
  mitigate: () => Promise<void>; // Apply mitigation
  recover: () => Promise<RecoveryResult>; // Attempt recovery
  report: () => Promise<FaultReport>; // Report the incident
}

// Example: OOM recovery
const oomProcedure: SelfHealingProcedure = {
  detect: async () => {
    const usage = process.memoryUsage();
    return usage.heapUsed > softLimit || usage.rss > hardLimit;
  },
  diagnose: async () => {
    // Identify largest memory consumers
    const heapSnapshot = await takeHeapSnapshot();
    return {
      fault: 'OUT_OF_MEMORY',
      heapUsed: heapSnapshot.heapUsed,
      topConsumers: heapSnapshot.largestObjects.slice(0, 5),
    };
  },
  mitigate: async () => {
    // 1. Pause worker pool
    await workerPool.pause();
    // 2. Run GC
    global.gc();
    // 3. Clear non-critical caches
    cache.clear('ast', 'feature');
    // 4. Reduce worker count
    workerPool.resize(Math.max(1, workerPool.activeWorkers - 2));
    // 5. Drop lowest-priority queued tasks
    dispatchQueue.dropLowestPriority(0.25); // Drop bottom 25%
  },
  recover: async () => {
    await workerPool.resume();
    return { recovered: true, note: 'Workers resumed with 50% capacity' };
  },
  report: async () => {
    return {
      incidentId: 'inc_001',
      timestamp: new Date().toISOString(),
      fault: 'OUT_OF_MEMORY',
      mitigated: true,
      dataLost: false,
      actions: ['GC triggered', 'Cache cleared', 'Workers reduced', 'Queue trimmed'],
    };
  },
};
```

---

## 12. Future Compatibility

### 12.1 Continuous Benchmarking (V2+)

- Automated benchmark suite runs on every nightly build.
- Results stored in a time-series database (SQLite or Prometheus).
- Trend visualization: performance over time with release annotations.
- Automatic regression detection with alerting.
- Benchmark comparison across branches and commits.

### 12.2 Distributed Testing (V2+)

- Test execution across multiple machines for large corpus regression.
- Artifact-level parallelization (map-reduce style).
- Centralized test result aggregation.
- Distributed fuzzing with result merging.
- Cross-machine determinism validation.

### 12.3 Cloud CI Integration (V3+)

- Native GitHub Actions, GitLab CI, Jenkins integrations.
- VERIS runs as a CI step, produces annotations.
- Quality gates enforced by VERIS policy engine.
- SARIF output for GitHub code scanning integration.
- PR comments with finding summaries.

### 12.4 Plugin Certification (V3+)

- Plugin authors submit to a certification pipeline.
- Certification tests: determinism, performance budget, security hardening.
- Certified plugins get a verified badge in the marketplace.
- Certification re-run on each engine major version.

### 12.5 Marketplace Validation (V3+)

- Submitted plugins automatically tested against:
  - Full test suite (unit, component, integration)
  - Adversarial tests (plugin security)
  - Performance benchmarks (plugin overhead)
  - Compatibility tests (engine version matrix)
- Validation results published on marketplace listing.

### 12.6 Enterprise Compliance (V4+)

- Compliance-specific test suites (PCI-DSS, SOC2, HIPAA).
- Compliance mode: only run tests relevant to the target framework.
- Compliance report generation with pass/fail per control.
- Evidence collection: test results linked to compliance controls.
- Audit trail: every test execution logged with timestamp and sign-off.

### 12.7 LTS Branch Validation (V4+)

- Long-term support branches get extended test coverage:
  - All tests from the release branch.
  - Backward compatibility tests against V1 data models.
  - Extended fuzzing (24h runs instead of 1h).
  - Extended performance benchmarks (all scenarios, 10x measurement runs).
  - Cross-platform parity validation (all supported OS).
  - Plugin compatibility matrix (all marketplace plugins).

---

## 13. Engineering Tradeoffs

### 13.1 Strict Testing vs. Development Velocity

**Tradeoff:** Strict testing (mandatory golden snapshots, 90% coverage, determinism validation) catches regressions early but slows down development. Relaxed testing speeds up development but risks regressions reaching users.

**Decision:** Strict testing for domain packages (L0–L3) where correctness is critical. Relaxed (but monitored) testing for application packages (L4+) where iteration speed matters more. Golden snapshots are required for domain packages only.

### 13.2 In-Memory Testing vs. Filesystem Testing

**Tradeoff:** In-memory tests (virtual filesystem, mock artifacts) are fast and isolated but may miss real-world filesystem edge cases. Filesystem tests (actual temp directories, real file I/O) are more realistic but slower and less isolated.

**Decision:** Unit and component tests use in-memory test fixtures. Integration and pipeline tests use actual temp directories (generated per test, cleaned up after). E2E tests use committed fixture files.

### 13.3 Determinism Strictness vs. Performance Optimization

**Tradeoff:** Strict determinism (double-run comparison for every test, deterministic hash ordering) adds runtime overhead to tests but catches non-determinism. Relaxed determinism (no double-run, natural iteration order) is faster but may miss non-determinism.

**Decision:** Double-run validation only for tests tagged `deterministic`. Not all tests need this property. Hash-based iteration order (consistent ordering) is used everywhere to prevent non-determinism from iteration order.

### 13.4 Fuzzing Depth vs. CI Time Budget

**Tradeoff:** Deep fuzzing (24h runs, full coverage-guided mutation) finds more bugs but cannot run in CI. Shallow fuzzing (15–60min runs, seed-based mutation) runs in CI but misses deep bugs.

**Decision:** Shallow fuzzing for nightly CI (60min per target). Deep fuzzing for weekly/ pre-release runs (24h per target). Crash-tolerant: any crash is treated as a non-negotiable fix.

### 13.5 Memory Budgets vs. Feature Completeness

**Tradeoff:** Strict memory budgets (1.2GB hard limit) protect the system from resource exhaustion but may limit the depth of analysis on large repositories. No memory budgets allow complete analysis but risk OOM.

**Decision:** Strict memory budgets with graceful degradation. If the budget is exceeded, the system degrades by reducing cache sizes, dropping low-priority features, and ultimately sampling artifacts. The scan always produces a result (even if partial).

### 13.6 Worker Pool Parallelism vs. Overhead

**Tradeoff:** More workers increase throughput but add overhead (context switching, memory per worker, IPC latency). Fewer workers reduce overhead but limit parallelism.

**Decision:** Worker count = `max(2, cpuCores - 1)` by default. Configurable by profile. For cache-bound workloads (classic scan), fewer workers are better. For CPU-bound workloads (rule matching), more workers help. The pool auto-sizes based on measured throughput.

### 13.7 Cache Aggressiveness vs. Memory Pressure

**Tradeoff:** Aggressive caching (LRU with large max entries) speeds up repeated operations but consumes memory. Conservative caching (small max entries) saves memory but reduces cache hit ratio.

**Decision:** Aggressive caching for domains with high hit ratios (classification: 80%+ target) — large cache with generous limits. Conservative caching for domains with low hit ratios (RuleResult: 40% typical) — small cache with tight limits. Cache sizes are configurable and monitored.

### 13.8 Detailed Diagnostics vs. Performance

**Tradeoff:** Detailed diagnostics (per-rule timing, per-feature trace, per-artifact profiling) provide debugging value but add overhead (~5–10% of scan time). No diagnostics are fast but leave developers blind to performance issues.

**Decision:** Minimal diagnostics by default (aggregate statistics only). Full diagnostics on `--diagnostics` flag or `diagnostics.level: detailed` in config. Diagnostic overhead is measured and reported. Plugin diagnostics are opt-in.

### 13.9 CI Gate Strictness vs. Release Cadence

**Tradeoff:** Strict CI gates (all tests pass, golden unchanged, perf regression < 20%) ensure quality but slow releases. Relaxed gates are fast but risk quality issues.

**Decision:** Multi-tier gates:

- **PR gates:** Unit, component, integration, golden validation (fast, ~20 min).
- **Nightly gates:** Full pipeline, E2E, performance, security (comprehensive, ~2h).
- **Release gates:** All of the above + cross-platform, extended fuzzing (thorough, ~4h).
- **LTS gates:** All of the above + 24h fuzzing, full compatibility matrix (~24h).

---

## 14. Common Mistakes to Avoid

### 14.1 Testing Only Happy Paths

**Mistake:** Writing tests only for expected, well-formed inputs. Real-world security analysis encounters malformed files, corrupted headers, and adversarial inputs daily.

**Prevention:** Every module must have tests for: happy path, error handling, boundary conditions, edge cases, and adversarial inputs. The test checklist in CI enforces this.

### 14.2 Non-Deterministic Test Suites

**Mistake:** Tests that pass on one run but fail on another due to async timing, iteration order, or external dependencies. These destroy trust in the test suite.

**Prevention:** All tests must be deterministic. Randomness is seeded with a fixed seed. Iteration over hash maps is deterministic (insertion-ordered or sorted). Async tests use proper await/expect patterns. Double-run validation for critical tests.

### 14.3 Ignoring Adversarial Input Testing

**Mistake:** Only testing with benign, well-formed inputs. A security analysis tool that crashes on malformed input is useless and dangerous.

**Prevention:** Adversarial inputs are first-class test citizens. Every parser has adversarial tests. The fuzzing pipeline runs nightly. Found crashes are treated as critical bugs.

### 14.4 Golden File Bit Rot

**Mistake:** Committing golden files and never verifying they're up to date, leading to stale expected outputs that mask regressions.

**Prevention:** CI validates golden files on every PR. Golden files include metadata (engine version, generator version). Golden stales are detected and flagged.

### 14.5 Over-Mocking in Tests

**Mistake:** Mocking so many dependencies that the test no longer tests real behavior. A test with 20 mocks tests the mock framework, not the code.

**Prevention:** Mock at package boundaries only (interfaces from SPEC-001). Integration tests use real implementations. Component tests mock external packages only.

### 14.6 Performance Testing Without Baselines

**Mistake:** Running performance tests without comparing against a baseline, so developers don't know if a change improved or degraded performance.

**Prevention:** All performance benchmarks are compared against the latest baseline from the main branch. Regression thresholds are enforced. Baselines are stored in CI artifacts.

### 14.7 Fuzzing Without Crash Minimization

**Mistake:** Running fuzzers, collecting crashes, and never minimizing them. Unminimized crashes are hard to debug and impossible to add to regression suites.

**Prevention:** Every crash is automatically minimized (delta debugging) before triage. Minimized crashes are added to the regression corpus. The crash minimization toolchain runs as part of the fuzzing pipeline.

### 14.8 Memory Leaks From Test Fixtures

**Mistake:** Test fixtures (temp directories, file handles, database connections) not cleaned up after tests, causing memory leaks and CI failures after many test runs.

**Prevention:** All fixtures use `beforeEach`/`afterEach` or `try/finally` cleanup. Temp directories use `tmp` library with automatic cleanup. CI runs with `--detectLeaks` flag. Test isolation validated in CI.

### 14.9 Security Hardening as an Afterthought

**Mistake:** Adding security hardening (zip bomb detection, path traversal prevention) after the parsers are built, requiring refactoring to add safety checks.

**Prevention:** Security hardening is designed into every parser from the start (validate-then-use pattern, bounded allocations, explicit limits). Hardening tests are written concurrently with parser implementation.

### 14.10 CI Gate Fatigue

**Mistake:** Adding too many CI gates that are slow or flaky, causing developers to ignore CI results ("CI is red but it's just flaky tests").

**Prevention:** PR gates complete in < 20 minutes. Nightly gates are mandatory only for release. Flaky tests are quarantined (not ignored). Each gate has a clear owner responsible for failures.

### 14.11 Testing Without Corpus Versioning

**Mistake:** Updating test corpus files without versioning, so different commits produce different results for the same code — making regressions impossible to track.

**Prevention:** Corpus is versioned (YYYY-MM-DD-v{N}). Engine version pins minimum corpus version. Corpus version is recorded in all test reports. Corpus changes are documented and reviewed.

### 14.12 Worker Pool Starvation

**Mistake:** A few long-running tasks blocking all worker pool slots, preventing short tasks from executing and causing throughput collapse.

**Prevention:** Tasks have timeouts. Long-running tasks are split into smaller chunks. The scheduler detects long-running tasks and reserves dedicated workers for them. Starvation is monitored and alerted.

### 14.13 Over-Engineering the Fuzzing Infrastructure

**Mistake:** Building a custom fuzzing framework before using existing tools, wasting months on infrastructure that doesn't find bugs.

**Prevention:** Use established fuzzing tools: LibFuzzer, Jazzer.js, or similar. The custom infrastructure is limited to crash minimization, coverage tracking, and result integration. The actual fuzzing is done by battle-tested tools.

---

## 15. Final Architectural Recommendations

### 15.1 Implementation Order

| Phase          | Components                                                             | Rationale                                         |
| -------------- | ---------------------------------------------------------------------- | ------------------------------------------------- |
| **Phase 1**    | Testing framework setup (Vitest config, CI workflow, coverage tooling) | Foundation — needed before any code can be tested |
| **Phase 2**    | Unit tests for core (L0), shared (L0), framework (L1)                  | Test the foundation first                         |
| **Phase 3**    | Unit + component tests for domain packages (L2)                        | Test the analysis core                            |
| **Phase 4**    | Integration tests for cross-package contracts                          | Test boundaries                                   |
| **Phase 5**    | Security corpus (benign + edge cases first)                            | Needed before regression tests                    |
| **Phase 6**    | Golden snapshot system (extraction → finding)                          | Regression detection                              |
| **Phase 7**    | Pipeline + E2E tests                                                   | End-to-end validation                             |
| **Phase 8**    | Performance benchmarks + budgets                                       | Performance baseline                              |
| **Phase 9**    | Security hardening (zip bomb, path traversal, resource limits)         | Safety critical                                   |
| **Phase 10**   | Memory profiling + budget enforcement                                  | Resource stability                                |
| **Phase 11**   | Fuzzing infrastructure + seed corpora                                  | Adversarial validation                            |
| **Phase 12**   | Full adversarial test suite + corpus expansion                         | Comprehensive security testing                    |
| **Phase 13**   | Cross-platform CI + compatibility testing                              | Platform parity                                   |
| **Phase 14**   | Observability system (tracing, profiling, diagnostics)                 | Debuggability                                     |
| **Phase 15**   | CI quality gates + release automation                                  | Release confidence                                |
| **Continuous** | Corpus expansion, golden updates, fuzzing runs                         | Ongoing quality                                   |

### 15.2 Critical Success Factors

1. **Determinism is the foundation of all testing.** If tests aren't deterministic, they aren't tests. Enforce double-run validation for all critical tests. Use seeded randomness, sorted iteration, and deterministic IDs everywhere.

2. **Adversarial testing is not optional.** VERIS processes untrusted input. Every parser must be tested against malformed, corrupted, and malicious inputs. Fuzzing is not a separate activity — it's part of the definition of "done" for any parser.

3. **Golden snapshots are the first line of regression defense.** Before writing any other test for a component, create its golden snapshot. Golden files capture the exact expected output and detect behavioral drift on every change.

4. **Performance budgets are enforced, not aspirational.** A performance budget without enforcement is a suggestion. CI must block changes that violate budgets. Budgets are versioned and adjusted intentionally.

5. **Security hardening is designed in, not bolted on.** Every parser implements the validate-then-use pattern from day one. Every resource has explicit limits from day one. Hardening is not a post-implementation activity.

6. **The corpus is a living artifact.** The security corpus grows with every discovered bug, every new parser, and every new rule. Corpus maintenance is an ongoing responsibility, not a one-time effort.

7. **CI gates must be fast enough for developer workflow.** If CI takes more than 20 minutes for PR gates, developers will work around it. Invest in test speed (parallelization, caching, targeted execution) as much as test coverage.

8. **Observability is for developers, not just operators.** The diagnostic system (traces, profiles, snapshots) is essential for debugging false positives, performance issues, and rule development. Every component must produce observability data.

### 15.3 Architectural Invariants

```yaml
1. All tests are deterministic. Same input → same output on every run.
2. Every parser has: unit tests, golden tests, adversarial tests, and fuzz targets.
3. All security hardening has: detection, mitigation, diagnostics, and recovery.
4. Golden snapshots detect behavioral drift. Intentional changes require approval.
5. Performance budgets are enforced in CI. Regressions > 20% block releases.
6. The security corpus is versioned, licensed, and attributed. No proprietary code.
7. All cache is per-session. No cross-session caching (reproducibility guarantee).
8. Every cached resource has: max size, eviction policy, and hit/miss tracking.
9. Worker pools are bounded, monitored, and auto-sized.
10. Memory budgets have soft limits (degrade gracefully) and hard limits (abort safely).
11. Cancellation is instant, graceful, and produces partial results.
12. Diagnostic overhead is measured and configurable. Full diagnostics are opt-in.
13. CI gates are tiered: fast for PRs, comprehensive for nightlies, thorough for releases.
14. Fuzzing crashes are minimized, triaged, and added to regression corpus.
15. Cross-platform parity is validated weekly. All platforms produce identical results.
```

---

_End of SPEC-008. This document describes the frozen testing strategy, performance architecture, security hardening, and CI quality gates for VERIS V1 through V4._
