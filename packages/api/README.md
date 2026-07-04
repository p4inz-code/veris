# @veris/api

Programmatic API for integrating VERIS into applications.

## Public API

- **Veris** — Primary client
- **scan** — Run analysis
- **analyze** — Programmatic analysis

## Usage

```typescript
import { Veris } from '@veris/api';

const veris = new Veris();
const report = await veris.scan('./path/to/project');
```
