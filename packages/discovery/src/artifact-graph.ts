/**
 * Immutable Artifact Graph implementation for VERIS.
 *
 * Constructs and manages parent-child relationships between discovered
 * artifacts with fast lookups by ID and path.
 *
 * @module @veris/discovery/artifact-graph
 */

import type { DiscoveredArtifact } from '@veris/core';

import type { ArtifactGraph } from './types.js';

/**
 * Internal implementation of the artifact graph.
 * Provides methods for building the graph during discovery.
 */
export class ArtifactGraphBuilder {
  private readonly _byId: Map<string, DiscoveredArtifact> = new Map();
  private readonly _byPath: Map<string, string> = new Map(); // path -> id
  private readonly _parents: Map<string, string> = new Map(); // childId -> parentId
  private readonly _children: Map<string, string[]> = new Map(); // parentId -> childIds
  private _rootId: string | null = null;

  /**
   * Add an artifact to the graph.
   * Returns true if the artifact was added, false if a duplicate was detected.
   * Throws if an artifact with the same ID but different path already exists.
   */
  add(artifact: DiscoveredArtifact): boolean {
    // Check for duplicate ID
    if (this._byId.has(artifact.id)) {
      const existing = this._byId.get(artifact.id)!;
      if (existing.absolutePath !== artifact.absolutePath) {
        throw new Error(
          `Duplicate artifact ID "${artifact.id}" with different path: "${existing.absolutePath}" vs "${artifact.absolutePath}"`,
        );
      }
      return false; // Exact duplicate
    }

    // Check for duplicate path
    if (this._byPath.has(artifact.absolutePath)) {
      const existingId = this._byPath.get(artifact.absolutePath)!;
      if (existingId !== artifact.id) {
        throw new Error(
          `Duplicate path "${artifact.absolutePath}" with different ID: "${existingId}" vs "${artifact.id}"`,
        );
      }
      return false;
    }

    this._byId.set(artifact.id, artifact);
    this._byPath.set(artifact.absolutePath, artifact.id);

    // Track root
    if (artifact.parentId === null) {
      if (this._rootId !== null && this._rootId !== artifact.id) {
        throw new Error(
          `Multiple root artifacts detected: "${this._rootId}" and "${artifact.id}". Discovery supports only one root.`,
        );
      }
      this._rootId = artifact.id;
    }

    // Track parent-child relationship
    if (artifact.parentId !== null) {
      this._parents.set(artifact.id, artifact.parentId);

      const siblings = this._children.get(artifact.parentId);
      if (siblings) {
        siblings.push(artifact.id);
      } else {
        this._children.set(artifact.parentId, [artifact.id]);
      }
    }

    return true;
  }

  /**
   * Build the immutable artifact graph.
   * Must be called after all artifacts have been added.
   */
  build(): ArtifactGraph {
    const byId = new Map(this._byId);
    const byPath = new Map(this._byPath);
    const parents = new Map(this._parents);
    const children = new Map(this._children);
    const rootId = this._rootId;

    if (rootId === null) {
      throw new Error('Cannot build graph: no root artifact found.');
    }

    // Sort children arrays deterministically
    for (const [parentId, childIds] of children) {
      childIds.sort();
    }

    // Build the all-artifacts list in deterministic order (DFS pre-order)
    const allIds: string[] = [];
    const visited = new Set<string>();

    function dfs(nodeId: string): void {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);
      allIds.push(nodeId);

      const childIds = children.get(nodeId);
      if (childIds) {
        for (const childId of childIds) {
          dfs(childId);
        }
      }
    }

    dfs(rootId);

    // Check for orphan nodes (not reachable from root)
    for (const id of byId.keys()) {
      if (!visited.has(id)) {
        // Add orphans at the end
        allIds.push(id);
      }
    }

    const allArtifacts = Object.freeze(allIds.map((id) => byId.get(id)!));

    const graph: ArtifactGraph = {
      getById(id: string): DiscoveredArtifact | undefined {
        return byId.get(id);
      },

      getByPath(absolutePath: string): DiscoveredArtifact | undefined {
        const id = byPath.get(absolutePath);
        return id ? byId.get(id) : undefined;
      },

      getChildren(parentId: string): readonly DiscoveredArtifact[] {
        const childIds = children.get(parentId);
        if (!childIds) return Object.freeze([]);
        return Object.freeze(childIds.map((id) => byId.get(id)!));
      },

      getParent(childId: string): DiscoveredArtifact | null {
        const parentId = parents.get(childId);
        if (!parentId) return null;
        return byId.get(parentId) ?? null;
      },

      getRoot(): DiscoveredArtifact {
        const root = byId.get(rootId);
        if (!root) throw new Error('Root artifact not found in graph.');
        return root;
      },

      getAll(): readonly DiscoveredArtifact[] {
        return allArtifacts;
      },

      get size(): number {
        return byId.size;
      },

      has(id: string): boolean {
        return byId.has(id);
      },

      get rootId(): string {
        return rootId;
      },
    };

    return Object.freeze(graph);
  }
}
