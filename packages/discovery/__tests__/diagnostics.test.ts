import { describe, it, expect } from 'vitest';
import { DiagnosticsCollector } from '../src/index.js';

describe('DiagnosticsCollector', () => {
  it('should start with zero counters', () => {
    const collector = new DiagnosticsCollector();
    const snapshot = collector.snapshot();
    expect(snapshot.filesVisited).toBe(0);
    expect(snapshot.directoriesVisited).toBe(0);
    expect(snapshot.skippedPaths).toEqual([]);
    expect(snapshot.permissionFailures).toEqual([]);
  });

  it('should track file visits', () => {
    const collector = new DiagnosticsCollector();
    collector.recordFile();
    collector.recordFile();
    collector.recordFile();
    expect(collector.snapshot().filesVisited).toBe(3);
  });

  it('should track directory visits', () => {
    const collector = new DiagnosticsCollector();
    collector.recordDirectory();
    collector.recordDirectory();
    expect(collector.snapshot().directoriesVisited).toBe(2);
  });

  it('should track skipped paths', () => {
    const collector = new DiagnosticsCollector();
    collector.recordSkipped('node_modules');
    collector.recordSkipped('.git');
    const snapshot = collector.snapshot();
    expect(snapshot.skippedPaths).toHaveLength(2);
    expect(snapshot.skippedPaths).toContain('node_modules');
    expect(snapshot.skippedPaths).toContain('.git');
  });

  it('should track permission failures', () => {
    const collector = new DiagnosticsCollector();
    collector.recordPermissionFailure('/etc/shadow');
    const snapshot = collector.snapshot();
    expect(snapshot.permissionFailures).toHaveLength(1);
    expect(snapshot.permissionFailures[0]).toBe('/etc/shadow');
  });

  it('should track hidden artifacts', () => {
    const collector = new DiagnosticsCollector();
    collector.recordHiddenArtifact('.env');
    collector.recordHiddenArtifact('.gitignore');
    const snapshot = collector.snapshot();
    expect(snapshot.hiddenArtifacts).toHaveLength(2);
  });

  it('should track symlink skips', () => {
    const collector = new DiagnosticsCollector();
    collector.recordSymlinkSkip('/link1');
    const snapshot = collector.snapshot();
    expect(snapshot.symlinkSkips).toHaveLength(1);
  });

  it('should track cycle detections', () => {
    const collector = new DiagnosticsCollector();
    collector.recordCycleDetection('/loop');
    const snapshot = collector.snapshot();
    expect(snapshot.cycleDetections).toHaveLength(1);
  });

  it('should track timing', () => {
    const collector = new DiagnosticsCollector();
    collector.startTraversal();
    collector.endTraversal();
    collector.startMetadata();
    collector.endMetadata();
    collector.startClassification();
    collector.endClassification();
    const snapshot = collector.snapshot();
    expect(snapshot.traversalTimeMs).toBeGreaterThanOrEqual(0);
    expect(snapshot.metadataTimeMs).toBeGreaterThanOrEqual(0);
    expect(snapshot.classificationTimeMs).toBeGreaterThanOrEqual(0);
    expect(snapshot.totalTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should produce immutable snapshots', () => {
    const collector = new DiagnosticsCollector();
    collector.recordFile();
    const snapshot = collector.snapshot();
    expect(Object.isFrozen(snapshot.skippedPaths)).toBe(true);
    expect(Object.isFrozen(snapshot.permissionFailures)).toBe(true);
    expect(Object.isFrozen(snapshot.hiddenArtifacts)).toBe(true);
  });
});
