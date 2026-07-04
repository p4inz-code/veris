import { describe, it, expect } from 'vitest';
import { createArtifact } from '../src/types/artifact.js';

describe('Artifact', () => {
  const minimalArtifact = {
    id: 'art_test123',
    sessionId: 'ss_session1',
    type: 'file' as const,
    normalizedPath: '/test/file.py',
    size: 1024,
    contentHash: { algorithm: 'sha-256', value: 'abc123' },
    mimeType: 'text/x-python',
    extractedAt: '2024-01-01T00:00:00.000Z',
    extractorId: 'python-extractor',
  };

  it('creates an artifact with minimal fields', () => {
    const art = createArtifact(minimalArtifact);
    expect(art.id).toBe('art_test123');
    expect(art.type).toBe('file');
    expect(art.parentId).toBeNull();
    expect(art.size).toBe(1024);
  });

  it('supports all optional fields', () => {
    const art = createArtifact({
      ...minimalArtifact,
      parentId: 'art_parent1',
      subType: 'Python',
      originalPath: '/original/test/file.py',
      encoding: 'utf-8',
      metadata: { key: 'value' },
      truncated: true,
    });
    expect(art.parentId).toBe('art_parent1');
    expect(art.subType).toBe('Python');
    expect(art.originalPath).toBe('/original/test/file.py');
    expect(art.encoding).toBe('utf-8');
    expect(art.metadata?.key).toBe('value');
    expect(art.truncated).toBe(true);
  });

  it('creates artifact with type archive', () => {
    const art = createArtifact({
      ...minimalArtifact,
      id: 'art_zip1',
      type: 'archive',
      mimeType: 'application/zip',
    });
    expect(art.type).toBe('archive');
    expect(art.mimeType).toBe('application/zip');
  });
});
