/**
 * Artifact Graph — tracks artifact relationships during discovery.
 *
 * @module @veris/extractors/discovery/graph
 */

import type { DiscoveredArtifact } from './types.js';

/**
 * Graph for tracking discovered artifacts.
 */
export interface ArtifactGraph {
  /** Add an artifact node to the graph. */
  addNode(artifact: DiscoveredArtifact): void;
  /** Get all nodes in the graph. */
  getAll(): readonly DiscoveredArtifact[];
  /** Number of nodes in the graph. */
  readonly size: number;
}

/**
 * Create a new empty artifact graph.
 */
export function createArtifactGraph(): ArtifactGraph {
  const nodes: DiscoveredArtifact[] = [];

  return {
    addNode(artifact: DiscoveredArtifact): void {
      nodes.push(artifact);
    },
    getAll(): readonly DiscoveredArtifact[] {
      return Object.freeze([...nodes]);
    },
    get size(): number {
      return nodes.length;
    },
  };
}
