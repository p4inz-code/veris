import { describe, it, expect } from 'vitest';
import type { DiscoveredArtifact } from '@veris/core';
import { ArtifactGraphBuilder } from '../src/index.js';

function createTestArtifact(
  overrides: Partial<DiscoveredArtifact> & { id: string; absolutePath: string },
): DiscoveredArtifact {
  return Object.freeze({
    id: overrides.id,
    parentId: overrides.parentId ?? null,
    rootId: overrides.rootId ?? overrides.id,
    absolutePath: overrides.absolutePath,
    canonicalPath: overrides.canonicalPath ?? overrides.absolutePath,
    relativePath: overrides.relativePath ?? overrides.absolutePath,
    fileName: overrides.fileName ?? overrides.absolutePath.split('/').pop() ?? 'file',
    extension: overrides.extension ?? '',
    size: overrides.size ?? 0,
    createdAt: overrides.createdAt ?? null,
    modifiedAt: overrides.modifiedAt ?? null,
    isHidden: overrides.isHidden ?? false,
    executableHint: overrides.executableHint ?? false,
    isDirectory: overrides.isDirectory ?? false,
    isSymlink: overrides.isSymlink ?? false,
    isJunction: overrides.isJunction ?? false,
    diagnostics: Object.freeze({
      viaSymlink: false,
      permissionError: false,
      skipped: false,
      depth: 0,
    }),
  });
}

describe('ArtifactGraphBuilder', () => {
  it('should build a graph with a single root', () => {
    const builder = new ArtifactGraphBuilder();
    builder.add(
      createTestArtifact({
        id: 'root',
        absolutePath: '/test',
        parentId: null,
        isDirectory: true,
      }),
    );
    const graph = builder.build();
    expect(graph.size).toBe(1);
    expect(graph.rootId).toBe('root');
    expect(graph.getRoot().id).toBe('root');
  });

  it('should track parent-child relationships', () => {
    const builder = new ArtifactGraphBuilder();
    builder.add(
      createTestArtifact({
        id: 'root',
        absolutePath: '/test',
        parentId: null,
        rootId: 'root',
        isDirectory: true,
      }),
    );
    builder.add(
      createTestArtifact({
        id: 'child1',
        absolutePath: '/test/file1.ts',
        parentId: 'root',
        rootId: 'root',
      }),
    );
    builder.add(
      createTestArtifact({
        id: 'child2',
        absolutePath: '/test/file2.ts',
        parentId: 'root',
        rootId: 'root',
      }),
    );
    const graph = builder.build();
    expect(graph.size).toBe(3);
    const children = graph.getChildren('root');
    expect(children).toHaveLength(2);
    expect(children.map((c) => c.id).sort()).toEqual(['child1', 'child2']);
  });

  it('should support lookups by ID and path', () => {
    const builder = new ArtifactGraphBuilder();
    builder.add(
      createTestArtifact({
        id: 'root',
        absolutePath: '/test',
        parentId: null,
        isDirectory: true,
      }),
    );
    builder.add(
      createTestArtifact({
        id: 'file1',
        absolutePath: '/test/file1.ts',
        parentId: 'root',
      }),
    );
    const graph = builder.build();
    expect(graph.getById('file1')?.fileName).toBe('file1.ts');
    expect(graph.getByPath('/test/file1.ts')?.id).toBe('file1');
    expect(graph.getByPath('/nonexistent')).toBeUndefined();
  });

  it('should return parent artifact', () => {
    const builder = new ArtifactGraphBuilder();
    builder.add(
      createTestArtifact({
        id: 'root',
        absolutePath: '/test',
        parentId: null,
        isDirectory: true,
      }),
    );
    builder.add(
      createTestArtifact({
        id: 'child',
        absolutePath: '/test/file.ts',
        parentId: 'root',
      }),
    );
    const graph = builder.build();
    const parent = graph.getParent('child');
    expect(parent).not.toBeNull();
    expect(parent!.id).toBe('root');
  });

  it('should return null parent for root', () => {
    const builder = new ArtifactGraphBuilder();
    builder.add(
      createTestArtifact({
        id: 'root',
        absolutePath: '/test',
        parentId: null,
        isDirectory: true,
      }),
    );
    const graph = builder.build();
    expect(graph.getParent('root')).toBeNull();
  });

  it('should return empty children for leaf nodes', () => {
    const builder = new ArtifactGraphBuilder();
    builder.add(
      createTestArtifact({
        id: 'root',
        absolutePath: '/test',
        parentId: null,
        isDirectory: true,
      }),
    );
    builder.add(
      createTestArtifact({
        id: 'file',
        absolutePath: '/test/file.ts',
        parentId: 'root',
      }),
    );
    const graph = builder.build();
    expect(graph.getChildren('file')).toEqual([]);
  });

  it('should detect duplicate IDs', () => {
    const builder = new ArtifactGraphBuilder();
    builder.add(
      createTestArtifact({
        id: 'dup',
        absolutePath: '/test/a.ts',
        parentId: null,
      }),
    );
    expect(() => {
      builder.add(
        createTestArtifact({
          id: 'dup',
          absolutePath: '/test/b.ts',
          parentId: null,
        }),
      );
    }).toThrow('Duplicate artifact ID');
  });

  it('should detect duplicate paths', () => {
    const builder = new ArtifactGraphBuilder();
    builder.add(
      createTestArtifact({
        id: 'first',
        absolutePath: '/test/file.ts',
        parentId: null,
      }),
    );
    expect(() => {
      builder.add(
        createTestArtifact({
          id: 'second',
          absolutePath: '/test/file.ts',
          parentId: null,
        }),
      );
    }).toThrow('Duplicate path');
  });

  it('should require a root artifact', () => {
    const builder = new ArtifactGraphBuilder();
    expect(() => builder.build()).toThrow('no root artifact');
  });

  it('should reject multiple roots', () => {
    const builder = new ArtifactGraphBuilder();
    builder.add(
      createTestArtifact({
        id: 'root1',
        absolutePath: '/test1',
        parentId: null,
      }),
    );
    expect(() => {
      builder.add(
        createTestArtifact({
          id: 'root2',
          absolutePath: '/test2',
          parentId: null,
        }),
      );
    }).toThrow('Multiple root artifacts');
  });

  it('should order artifacts deterministically (DFS)', () => {
    const builder = new ArtifactGraphBuilder();
    builder.add(
      createTestArtifact({
        id: 'root',
        absolutePath: '/test',
        parentId: null,
        isDirectory: true,
      }),
    );
    builder.add(
      createTestArtifact({
        id: 'child_a',
        absolutePath: '/test/a.ts',
        parentId: 'root',
      }),
    );
    builder.add(
      createTestArtifact({
        id: 'child_b',
        absolutePath: '/test/b.ts',
        parentId: 'root',
      }),
    );
    builder.add(
      createTestArtifact({
        id: 'sub_dir',
        absolutePath: '/test/sub',
        parentId: 'root',
        isDirectory: true,
      }),
    );
    builder.add(
      createTestArtifact({
        id: 'sub_child',
        absolutePath: '/test/sub/file.ts',
        parentId: 'sub_dir',
      }),
    );
    const graph = builder.build();
    const all = graph.getAll();
    const ids = all.map((a) => a.id);
    // DFS: root -> child_a -> child_b -> sub_dir -> sub_child (children sorted alphabetically)
    expect(ids.indexOf('root')).toBeLessThan(ids.indexOf('child_a'));
    expect(ids.indexOf('child_a')).toBeLessThan(ids.indexOf('child_b'));
    expect(ids.indexOf('child_b')).toBeLessThan(ids.indexOf('sub_dir'));
    expect(ids.indexOf('sub_dir')).toBeLessThan(ids.indexOf('sub_child'));
  });

  it('should handle has() correctly', () => {
    const builder = new ArtifactGraphBuilder();
    builder.add(
      createTestArtifact({
        id: 'root',
        absolutePath: '/test',
        parentId: null,
      }),
    );
    const graph = builder.build();
    expect(graph.has('root')).toBe(true);
    expect(graph.has('nonexistent')).toBe(false);
  });
});
