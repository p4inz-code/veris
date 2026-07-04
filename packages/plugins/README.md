# @veris/plugins

Plugin host, SDK, and manifest system.

## Plugin Types (V2+)

- **RulePlugin** — New rule packs
- **ExtractorPlugin** — New extractors
- **ExporterPlugin** — New export formats
- **RendererPlugin** — New renderers
- **HookPlugin** — Pipeline lifecycle hooks

## Architecture

- **host/** — PluginHost managing plugin lifecycle
- **sdk/** — PluginSDK contracts for third-party authors
- **manifest/** — PluginManifest parser and validator
