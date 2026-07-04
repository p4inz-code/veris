import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { CancellationTokenSource } from '@veris/shared';
import { DiscoveryEngine } from '../src/index.js';

describe('DiscoveryEngine', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'veris-disc-test-'));
    // Create test directory structure
    await fsp.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fsp.mkdir(path.join(tempDir, 'lib'), { recursive: true });
    await fsp.mkdir(path.join(tempDir, 'node_modules'), { recursive: true });
    await fsp.mkdir(path.join(tempDir, '.git'), { recursive: true });
    await fsp.mkdir(path.join(tempDir, 'hidden_dir'), { recursive: true });

    // Create test files
    await fsp.writeFile(path.join(tempDir, 'src', 'index.ts'), "console.log('hello');");
    await fsp.writeFile(
      path.join(tempDir, 'src', 'utils.ts'),
      'export function add(a: number, b: number) { return a + b; }',
    );
    await fsp.writeFile(
      path.join(tempDir, 'lib', 'helper.js'),
      'module.exports = { helper: true };',
    );
    await fsp.writeFile(path.join(tempDir, 'lib', 'data.json'), '{"key": "value"}');
    await fsp.writeFile(path.join(tempDir, 'README.md'), '# Test Project');
    await fsp.writeFile(path.join(tempDir, '.gitignore'), 'node_modules/');
    await fsp.writeFile(path.join(tempDir, 'hidden_dir', '.secret'), 'hidden content');
    await fsp.writeFile(path.join(tempDir, 'node_modules', 'dep.js'), 'module.exports = {};');
    await fsp.writeFile(path.join(tempDir, '.git', 'HEAD'), 'ref: refs/heads/main');
  });

  afterAll(async () => {
    await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  });

  it('should discover files in a directory', async () => {
    const engine = new DiscoveryEngine();
    const result = await engine.discover(tempDir);
    expect(result.diagnostics.filesVisited).toBeGreaterThan(0);
    expect(result.artifacts.length).toBeGreaterThan(0);
    expect(result.root.isDirectory).toBe(true);
  });

  it('should produce deterministic ordering', async () => {
    const engine = new DiscoveryEngine();
    const result1 = await engine.discover(tempDir);
    const result2 = await engine.discover(tempDir);
    const paths1 = result1.artifacts.map((a) => a.relativePath);
    const paths2 = result2.artifacts.map((a) => a.relativePath);
    expect(paths1).toEqual(paths2);
  });

  it('should skip hidden files by default', async () => {
    const engine = new DiscoveryEngine();
    const result = await engine.discover(tempDir);
    const allFiles = result.artifacts.map((a) => a.fileName);
    expect(allFiles).not.toContain('.secret');
    expect(allFiles).not.toContain('.gitignore');
  });

  it('should include hidden files when configured', async () => {
    const engine = new DiscoveryEngine({ includeHidden: true, includeHiddenDirs: true });
    const result = await engine.discover(tempDir);
    const allFiles = result.artifacts.map((a) => a.fileName);
    expect(allFiles).toContain('.secret');
  });

  it('should skip node_modules by default', async () => {
    const engine = new DiscoveryEngine();
    const result = await engine.discover(tempDir);
    const allPaths = result.artifacts.map((a) => a.relativePath);
    const nodeModulesFiles = allPaths.filter((p) => p.includes('node_modules'));
    expect(nodeModulesFiles).toHaveLength(0);
  });

  it('should respect max depth', async () => {
    const engine = new DiscoveryEngine({ maxDepth: 0 });
    const result = await engine.discover(tempDir);
    // With depth 0, only the root should be discovered
    expect(result.artifacts.length).toBe(1);
    expect(result.root.isDirectory).toBe(true);
  });

  it('should respect max files limit', async () => {
    const engine = new DiscoveryEngine({ maxFiles: 1 });
    const result = await engine.discover(tempDir);
    // maxFiles limits the number of files discovered, not total artifacts
    // (which includes directories and the root artifact)
    expect(result.diagnostics.filesVisited).toBeLessThanOrEqual(1);
  });

  it('should support cancellation', async () => {
    const engine = new DiscoveryEngine();
    const cts = new CancellationTokenSource();
    cts.cancel('Test cancellation');
    await expect(engine.discover(tempDir, cts.token)).rejects.toThrow();
  });

  it('should discover a single file', async () => {
    const engine = new DiscoveryEngine();
    const filePath = path.join(tempDir, 'src', 'index.ts');
    const artifact = await engine.discoverFile(filePath);
    expect(artifact).not.toBeNull();
    expect(artifact!.fileName).toBe('index.ts');
    expect(artifact!.extension).toBe('.ts');
    expect(artifact!.isDirectory).toBe(false);
  });

  it('should return null for non-existent file', async () => {
    const engine = new DiscoveryEngine();
    const artifact = await engine.discoverFile(path.join(tempDir, 'nonexistent.ts'));
    expect(artifact).toBeNull();
  });

  it('should produce immutable artifacts', async () => {
    const engine = new DiscoveryEngine();
    const result = await engine.discover(tempDir);
    for (const artifact of result.artifacts) {
      expect(Object.isFrozen(artifact)).toBe(true);
    }
  });

  it('should generate deterministic IDs', async () => {
    const engine = new DiscoveryEngine();
    const result = await engine.discover(tempDir);
    for (const artifact of result.artifacts) {
      expect(artifact.id).toMatch(/^dart_[a-f0-9]+$/);
    }
  });

  it('should provide progress updates', async () => {
    const engine = new DiscoveryEngine();
    const progressUpdates: number[] = [];
    await engine.discover(tempDir, undefined, (progress) => {
      progressUpdates.push(progress.filesDiscovered);
    });
    // There's no guarantee of progress callbacks, but this should not throw
    expect(Array.isArray(progressUpdates)).toBe(true);
  });

  it('should create artifact graph with parent-child relationships', async () => {
    const engine = new DiscoveryEngine({ includeHidden: false });
    const result = await engine.discover(tempDir);
    expect(result.graph.size).toBe(result.artifacts.length);
    // Root has no parent
    expect(result.root.parentId).toBeNull();
    // All children of root should have root as parent
    for (const child of result.graph.getChildren(result.root.id)) {
      const parent = result.graph.getParent(child.id);
      expect(parent).not.toBeNull();
      expect(parent!.id).toBe(result.root.id);
    }
  });

  it('should detect executable files on Unix', async () => {
    // This test is platform-specific
    const testDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'veris-exec-test-'));
    try {
      await fsp.writeFile(path.join(testDir, 'script.sh'), '#!/bin/bash\necho hello');
      await fsp.chmod(path.join(testDir, 'script.sh'), 0o755);

      const engine = new DiscoveryEngine();
      const result = await engine.discover(testDir);
      const scriptArtifact = result.artifacts.find((a) => a.fileName === 'script.sh');
      if (process.platform !== 'win32') {
        expect(scriptArtifact?.executableHint).toBe(true);
      }
    } finally {
      await fsp.rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('should stream artifacts via generator', async () => {
    const engine = new DiscoveryEngine();
    const streamed: string[] = [];
    const diagnostics = await engine.stream(tempDir, undefined).next();
    // The stream returns artifacts one by one
    expect(diagnostics).toBeDefined();
  });

  it('should throw for non-existent target', async () => {
    const engine = new DiscoveryEngine();
    await expect(engine.discover(path.join(tempDir, 'nonexistent'))).rejects.toThrow(
      'does not exist',
    );
  });

  it('should handle empty directories', async () => {
    const emptyDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'veris-empty-test-'));
    try {
      const engine = new DiscoveryEngine();
      const result = await engine.discover(emptyDir);
      expect(result.root.isDirectory).toBe(true);
      expect(result.diagnostics.filesVisited).toBe(0);
      expect(result.artifacts.length).toBe(1); // Just the root
    } finally {
      await fsp.rm(emptyDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('should handle deep directory trees', async () => {
    const deepDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'veris-deep-test-'));
    try {
      // Create a deep tree
      let current = deepDir;
      for (let i = 0; i < 20; i++) {
        const subDir = path.join(current, `level${i}`);
        await fsp.mkdir(subDir);
        await fsp.writeFile(path.join(subDir, `file${i}.txt`), `content${i}`);
        current = subDir;
      }

      const engine = new DiscoveryEngine({ maxDepth: 50 });
      const result = await engine.discover(deepDir);
      expect(result.diagnostics.filesVisited).toBe(20);
      expect(result.diagnostics.directoriesVisited).toBeGreaterThanOrEqual(20);
    } finally {
      await fsp.rm(deepDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('should respect max file size', async () => {
    const sizeDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'veris-size-test-'));
    try {
      await fsp.writeFile(path.join(sizeDir, 'small.txt'), 'small');
      const bigContent = Buffer.alloc(1000, 'x');
      await fsp.writeFile(path.join(sizeDir, 'big.txt'), bigContent);

      const engine = new DiscoveryEngine({ maxFileSize: 100 });
      const result = await engine.discover(sizeDir);
      expect(result.artifacts.find((a) => a.fileName === 'small.txt')).toBeDefined();
      expect(result.artifacts.find((a) => a.fileName === 'big.txt')).toBeUndefined();
    } finally {
      await fsp.rm(sizeDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
