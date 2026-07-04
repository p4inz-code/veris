# @veris/analyzer

Analysis pipeline orchestrator.

## Pipeline stages

1. Load configuration
2. Select extractors via ExtractorRegistry
3. Run extraction on artifacts
4. Run rules engine on extracted data
5. Collect findings
6. Build canonical report

## Architecture

- **pipeline/** — AnalysisPipeline orchestrator
- **lifecycle/** — Pre/post hooks, middleware
- **scheduler/** — Artifact scheduling and deduplication
