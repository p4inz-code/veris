# Knowledge Pack System

Knowledge Packs are deterministic offline intelligence databases that enrich Veris security analysis. They provide structured threat intelligence data without any cloud dependency.

## Architecture

```
KnowledgePackFile (JSON on disk)
  → Loader → Validator → Registry → Resolver
                                      ↓
  EvidenceEnricher ← integrates with analysis pipeline
```

### Components

| Component       | File             | Purpose                                                          |
| --------------- | ---------------- | ---------------------------------------------------------------- |
| **Types**       | `types.ts`       | Core type definitions for packs, entries, indicators, enrichment |
| **Schema**      | `schema.ts`      | Schema constants, validation rules, format helpers               |
| **Categories**  | `categories.ts`  | Built-in knowledge categories (11 categories)                    |
| **Validator**   | `validator.ts`   | Strict pack validation (fields, IDs, references, checksums)      |
| **Registry**    | `registry.ts`    | Pack lifecycle management (load/unload/reload/list)              |
| **Loader**      | `loader.ts`      | Disk-based pack loading with recursive discovery                 |
| **Resolver**    | `resolver.ts`    | Fast immutable index for pack queries                            |
| **Cache**       | `cache.ts`       | Content-addressed immutable cache                                |
| **Config**      | `config.ts`      | Pack configuration (enabled/disabled/directories)                |
| **Diagnostics** | `diagnostics.ts` | Pack loading status and error reporting                          |
| **Update**      | `update.ts`      | Offline update bundle framework (no networking)                  |
| **Enricher**    | `enricher.ts`    | Evidence enrichment via pack matching                            |
| **Data packs**  | `data/*.ts`      | Built-in production knowledge packs                              |

## Pack Format

Knowledge Packs are JSON files (`.veris-pack.json`) with the following structure:

```json
{
  "metadata": {
    "id": "malware-families",
    "name": "Malware Families",
    "version": "1.0.0",
    "description": "Known malware families and credential theft tools",
    "author": "VERIS Team",
    "license": "UNLICENSED",
    "source": "https://github.com/p4inz-code/veris",
    "checksum": "sha256-of-file-content",
    "categories": ["malware-families", "credential-theft"],
    "tags": ["malware", "credentials"],
    "supportedVerisVersion": "0.1.0",
    "createdAt": "2026-07-11T00:00:00.000Z",
    "updatedAt": "2026-07-11T00:00:00.000Z",
    "dependencies": []
  },
  "entries": [
    {
      "id": "mimikatz",
      "name": "Mimikatz",
      "description": "Credential theft tool...",
      "category": "credential-theft",
      "tags": ["credentials", "passwords"],
      "severity": "critical",
      "behavior": "Extracts credentials from LSASS...",
      "recommendedAction": "Enable Credential Guard...",
      "indicators": [
        {
          "type": "string-pattern",
          "value": "sekurlsa::logonpasswords",
          "confidence": 0.95,
          "description": "Mimikatz command"
        }
      ],
      "references": [{ "label": "MITRE ATT&CK", "url": "https://...", "source": "mitre-attack" }],
      "mitreTechniques": ["T1003.001"],
      "relatedEntries": []
    }
  ]
}
```

## Built-in Categories

| ID                    | Name                         | Description                              |
| --------------------- | ---------------------------- | ---------------------------------------- |
| `malware-families`    | Malware Families             | Known malware families and variants      |
| `packers`             | Packers and Protectors       | Executable packers and obfuscation tools |
| `lolbins`             | Living-off-the-Land Binaries | Legitimate binaries abused by attackers  |
| `persistence`         | Persistence Mechanisms       | Techniques for maintaining access        |
| `powershell-abuse`    | PowerShell Abuse             | Malicious PowerShell techniques          |
| `suspicious-apis`     | Suspicious API Patterns      | Windows API abuse patterns               |
| `archive-abuse`       | Archive Abuse Patterns       | Malicious archive techniques             |
| `network-indicators`  | Network Indicators           | C2 and network IoCs                      |
| `credential-theft`    | Credential Theft             | Credential stealing techniques           |
| `process-injection`   | Process Injection            | Code injection techniques                |
| `living-off-the-land` | Living-off-the-Land Attacks  | Built-in tool abuse                      |

## Usage

### Loading packs

```typescript
import { PackRegistry, PackResolver, EvidenceEnricher } from '@veris/knowledge/packs';
import { MALWARE_FAMILIES_PACK } from '@veris/knowledge/packs';

// Create registry
const registry = new PackRegistry();
registry.load(MALWARE_FAMILIES_PACK);

// Create resolver for fast lookup
const resolver = new PackResolver(registry.listAll());

// Create enricher for evidence enrichment
const enricher = new EvidenceEnricher(resolver);

// Enrich evidence
const result = enricher.enrich({
  id: 'ev_123',
  type: 'string-literal',
  category: 'executable',
  value: 'sekurlsa::logonpasswords',
});
```

### Loading from disk

```typescript
import { loadAllPacks } from '@veris/knowledge/packs';

const { packs, errors, warnings } = await loadAllPacks({
  directories: ['./packs', '/etc/veris/packs'],
  validate: true,
  verifyChecksum: true,
});
```

### Validation

```typescript
import { validatePackFile } from '@veris/knowledge/packs';

const result = validatePackFile(packFile);
if (!result.valid) {
  console.error('Validation errors:', result.errors);
}
```

## Development

### Adding a new pack

1. Create a new `.ts` file in `src/packs/data/`
2. Define your entries using the `KnowledgeEntry` type
3. Export a `KnowledgePack` constant
4. Add the export to `src/packs/data/index.ts` and `src/packs/index.ts`

### Adding a new category

1. Add the category to `src/packs/categories.ts`
2. Update the `BUILT_IN_CATEGORIES` array

### Offline updates

Update bundles are JSON files (`.veris-pack-bundle.json`) containing
signed pack updates. The update system supports:

- Signed bundle verification (SHA-256)
- Version migration paths
- Rollback to previous versions
- Future format compatibility

No network transport is implemented — the framework only handles
bundle format, signature verification, and file management.
