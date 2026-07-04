# @veris/analysis — VERIS Analysis Framework

Converts normalized Features into structured Evidence.

## Architecture

```
Features → AnalyzerRegistry → Analyzers → Evidence → EvidenceRegistry
```

The Analysis package **ONLY** produces evidence. It never:

- Assigns severity
- Creates findings
- Performs rule matching
- Scores or ranks
- Uses AI reasoning
- Determines malware

## Evidence

Each evidence item includes:

- **Deterministic ID** (content-addressed, prefix: `ev_`)
- **Artifact ID** — the source artifact
- **Feature IDs** — features that produced this evidence
- **Category** — high-level classification (executable, network, persistence, etc.)
- **Type** — specific evidence type (pe-import, high-entropy, expired-certificate)
- **Confidence** [0.0, 1.0]
- **Source locations** — exact positions in the artifact
- **Explanation** — human-readable WHY this evidence exists
- **Machine-readable metadata**

## Built-in Analyzers

| Analyzer            | Type                | Description                             |
| ------------------- | ------------------- | --------------------------------------- |
| PEAnalyzer          | executable          | PE sections, RWX, imports               |
| ELFAnalyzer         | executable          | ELF sections, symbols, W+X              |
| MachOAnalyzer       | executable          | Mach-O headers, sections                |
| CertificateAnalyzer | certificate         | X.509, private keys, unsigned           |
| DocumentAnalyzer    | document            | PDF, URLs                               |
| OfficeAnalyzer      | document            | Macros, VBA, suspicious APIs            |
| ArchiveAnalyzer     | archive             | Nested executables, format              |
| EntropyAnalyzer     | obfuscation         | High/global entropy                     |
| ImportAnalyzer      | executable          | Injection, persistence, anti-debug APIs |
| StringAnalyzer      | network/obfuscation | URLs, IPs, registry, base64             |
| PersistenceAnalyzer | persistence         | Autorun, cron, services                 |
| ScriptAnalyzer      | script              | Obfuscation, dangerous commands         |
| ContainerAnalyzer   | container           | K8s/Docker security issues              |
| DependencyAnalyzer  | dependency          | npm, Python, env vars                   |

## Usage

```typescript
import { AnalysisEngine, PEAnalyzer, StringAnalyzer } from '@veris/analysis';

const engine = new AnalysisEngine({
  analyzers: [new PEAnalyzer(), new StringAnalyzer()],
});

const result = await engine.analyzeArtifact(artifact, sessionId, features);
console.log(result.evidence);
```

## Verification

```bash
pnpm --filter @veris/analysis typecheck
pnpm --filter @veris/analysis test
pnpm --filter @veris/analysis build
```
