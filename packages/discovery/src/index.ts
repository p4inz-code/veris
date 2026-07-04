/**
 * @veris/discovery — VERIS deterministic streaming filesystem discovery engine
 * and artifact graph.
 *
 * Provides filesystem traversal, artifact discovery, immutable artifact graph
 * construction, and discovery diagnostics.
 *
 * ## Invariants
 * - Read-only: never modifies the filesystem
 * - Deterministic: same input produces the same output order
 * - Streaming: supports low-memory streaming traversal
 * - Cancellable: supports cooperative cancellation via CancellationToken
 * - Cycle safe: detects and prevents symlink/junction cycles
 * - Permission resilient: permission errors are recovered with diagnostics
 *
 * @module @veris/discovery
 */

// Types
export type {
  DiscoveryOptions,
  DiscoveryProgress,
  DiscoveryDiagnostics,
  DiscoveryResult,
  ArtifactGraph,
  SymlinkPolicy,
  JunctionPolicy,
  IgnoreRules,
  ProgressCallback,
} from './types.js';
export { DEFAULT_DISCOVERY_OPTIONS } from './types.js';

// Engine
export { DiscoveryEngine } from './discovery-engine.js';

// Graph
export { ArtifactGraphBuilder } from './artifact-graph.js';

// Diagnostics
export { DiagnosticsCollector } from './diagnostics.js';

// Ignore Rules
export { createIgnoreRules, DEFAULT_IGNORE_PATTERNS } from './ignore-rules.js';
