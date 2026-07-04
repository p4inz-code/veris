/**
 * @veris/plugins — VERIS plugin host, SDK, and manifest system.
 *
 * ## Architecture (V2+)
 * - host/ — PluginHost manages plugin lifecycle
 * - sdk/ — PluginSDK contracts for third-party authors
 * - manifest/ — PluginManifest parser and validator
 *
 * ## Plugin types (V2+)
 * - RulePlugin — New rule packs
 * - ExtractorPlugin — New extractors
 * - ExporterPlugin — New export formats
 * - RendererPlugin — New renderers
 * - HookPlugin — Pipeline lifecycle hooks
 *
 * ## Invariants
 * - Plugins run in a sandboxed environment
 * - Plugin crashes never crash the host
 * - Plugins have no FS/network access without explicit grants
 */
export {};
