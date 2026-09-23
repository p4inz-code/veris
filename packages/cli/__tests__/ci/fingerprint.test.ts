/**
 * Unit tests for finding fingerprinting.
 *
 * Validates Section 4 of ADR-015:
 * - Deterministic finding fingerprint calculation
 * - Cross-platform path normalization
 * - Distinct fingerprints for distinct artifacts and rules
 *
 * @module @veris/cli/__tests__/ci/fingerprint
 */

import type { Artifact, Finding } from '@veris/core';
import { describe, expect, it } from 'vitest';

import {
  computeFindingFingerprint,
  normalizePathForFingerprint,
  resolveFindingArtifactPath,
} from '../../src/ci/fingerprint.js';

describe('normalizePathForFingerprint', () => {
  it('converts Windows backslashes to forward slashes', () => {
    expect(normalizePathForFingerprint('src\\core\\index.ts')).toBe('src/core/index.ts');
    expect(normalizePathForFingerprint('C:\\Users\\admin\\repo\\file.js')).toBe(
      'c:/Users/admin/repo/file.js',
    );
  });

  it('strips redundant leading ./ and /', () => {
    expect(normalizePathForFingerprint('./src/app.ts')).toBe('src/app.ts');
    expect(normalizePathForFingerprint('/src/app.ts')).toBe('src/app.ts');
    expect(normalizePathForFingerprint('.///src/app.ts')).toBe('src/app.ts');
  });

  it('handles empty or non-string inputs safely', () => {
    expect(normalizePathForFingerprint('')).toBe('');
    expect(normalizePathForFingerprint(null as unknown as string)).toBe('');
    expect(normalizePathForFingerprint(undefined as unknown as string)).toBe('');
  });
});

describe('resolveFindingArtifactPath', () => {
  it('resolves artifact normalizedPath from artifactsById map', () => {
    const finding: Finding = {
      id: 'fin_1',
      sessionId: 'sess_1',
      ruleId: 'RULE_TEST',
      behaviorChainId: null,
      title: 'Test Finding',
      description: 'Test description',
      severity: { level: 'high', score: 8.0 },
      confidence: 0.9,
      evidenceIds: [],
      affectedArtifacts: [
        {
          artifactId: 'art_123',
          location: {
            startLine: 1,
            startColumn: 0,
            endLine: 1,
            endColumn: 0,
            offset: 0,
            length: 10,
          },
        },
      ],
      taxonomyIds: [],
      createdAt: '2026-09-23T00:00:00.000Z',
    };

    const artifactsById = new Map<string, Artifact>([
      [
        'art_123',
        {
          id: 'art_123',
          sessionId: 'sess_1',
          parentId: null,
          type: 'executable',
          normalizedPath: 'bin/malware.exe',
          size: 1024,
          contentHash: { algorithm: 'sha-256', value: 'abcd' },
          mimeType: 'application/x-dosexec',
        },
      ],
    ]);

    expect(resolveFindingArtifactPath(finding, artifactsById)).toBe('bin/malware.exe');
  });

  it('falls back to finding properties if affectedArtifacts is empty', () => {
    const finding: Finding = {
      id: 'fin_2',
      sessionId: 'sess_1',
      ruleId: 'RULE_TEST',
      behaviorChainId: null,
      title: 'Test Finding',
      description: 'Test description',
      severity: { level: 'low', score: 2.0 },
      confidence: 0.8,
      evidenceIds: [],
      affectedArtifacts: [],
      taxonomyIds: [],
      properties: {
        filePath: 'packages/core/src/index.ts',
      },
      createdAt: '2026-09-23T00:00:00.000Z',
    };

    expect(resolveFindingArtifactPath(finding)).toBe('packages/core/src/index.ts');
  });

  it('sorts multiple artifact paths deterministically', () => {
    const finding: Finding = {
      id: 'fin_3',
      sessionId: 'sess_1',
      ruleId: 'RULE_MULTI',
      behaviorChainId: null,
      title: 'Multi Artifact Finding',
      description: 'Description',
      severity: { level: 'medium', score: 5.0 },
      confidence: 0.8,
      evidenceIds: [],
      affectedArtifacts: [
        {
          artifactId: 'art_z',
          location: {
            startLine: 1,
            startColumn: 0,
            endLine: 1,
            endColumn: 0,
            offset: 0,
            length: 0,
          },
        },
        {
          artifactId: 'art_a',
          location: {
            startLine: 1,
            startColumn: 0,
            endLine: 1,
            endColumn: 0,
            offset: 0,
            length: 0,
          },
        },
      ],
      taxonomyIds: [],
      createdAt: '2026-09-23T00:00:00.000Z',
    };

    const artifactsById = new Map<string, Artifact>([
      [
        'art_z',
        {
          id: 'art_z',
          sessionId: 'sess_1',
          parentId: null,
          type: 'file',
          normalizedPath: 'z_file.txt',
          size: 10,
          contentHash: { algorithm: 'sha-256', value: '1111' },
          mimeType: 'text/plain',
        },
      ],
      [
        'art_a',
        {
          id: 'art_a',
          sessionId: 'sess_1',
          parentId: null,
          type: 'file',
          normalizedPath: 'a_file.txt',
          size: 10,
          contentHash: { algorithm: 'sha-256', value: '2222' },
          mimeType: 'text/plain',
        },
      ],
    ]);

    expect(resolveFindingArtifactPath(finding, artifactsById)).toBe('a_file.txt|z_file.txt');
  });
});

describe('computeFindingFingerprint', () => {
  it('generates identical fingerprints across different session IDs and timestamps', () => {
    const findingRun1: Finding = {
      id: 'fin_abc123_sessionA',
      sessionId: 'sessionA',
      ruleId: 'RULE_SUSPICIOUS_SECTION',
      behaviorChainId: null,
      title: 'Suspicious Section Header',
      description: 'Detected packed section',
      severity: { level: 'high', score: 7.5 },
      confidence: 0.9,
      evidenceIds: ['ev_1'],
      affectedArtifacts: [
        {
          artifactId: 'art_1',
          location: {
            startLine: 1,
            startColumn: 0,
            endLine: 1,
            endColumn: 0,
            offset: 0,
            length: 0,
          },
        },
      ],
      taxonomyIds: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    const findingRun2: Finding = {
      id: 'fin_xyz987_sessionB',
      sessionId: 'sessionB',
      ruleId: 'RULE_SUSPICIOUS_SECTION',
      behaviorChainId: null,
      title: 'Suspicious Section Header',
      description: 'Detected packed section',
      severity: { level: 'high', score: 7.5 },
      confidence: 0.9,
      evidenceIds: ['ev_99'],
      affectedArtifacts: [
        {
          artifactId: 'art_2',
          location: {
            startLine: 1,
            startColumn: 0,
            endLine: 1,
            endColumn: 0,
            offset: 0,
            length: 0,
          },
        },
      ],
      taxonomyIds: [],
      createdAt: '2026-09-23T12:00:00.000Z',
    };

    const artifactsMap1 = new Map<string, Artifact>([
      [
        'art_1',
        {
          id: 'art_1',
          sessionId: 'sessionA',
          parentId: null,
          type: 'executable',
          normalizedPath: 'target/payload.dll',
          size: 5000,
          contentHash: { algorithm: 'sha-256', value: 'aaaa' },
          mimeType: 'application/x-dosexec',
        },
      ],
    ]);

    const artifactsMap2 = new Map<string, Artifact>([
      [
        'art_2',
        {
          id: 'art_2',
          sessionId: 'sessionB',
          parentId: null,
          type: 'executable',
          normalizedPath: 'target/payload.dll',
          size: 5000,
          contentHash: { algorithm: 'sha-256', value: 'aaaa' },
          mimeType: 'application/x-dosexec',
        },
      ],
    ]);

    const fp1 = computeFindingFingerprint(findingRun1, artifactsMap1);
    const fp2 = computeFindingFingerprint(findingRun2, artifactsMap2);

    expect(fp1.hash).toBe(fp2.hash);
    expect(fp1.hash.startsWith('fp_')).toBe(true);
    expect(fp1.ruleId).toBe('RULE_SUSPICIOUS_SECTION');
    expect(fp1.artifactPath).toBe('target/payload.dll');
  });

  it('produces distinct fingerprints for different rules on same artifact', () => {
    const findingA: Finding = {
      id: 'fin_1',
      sessionId: 'sess_1',
      ruleId: 'RULE_A',
      behaviorChainId: null,
      title: 'Title',
      description: 'Desc',
      severity: { level: 'low', score: 2.0 },
      confidence: 0.5,
      evidenceIds: [],
      affectedArtifacts: [],
      taxonomyIds: [],
      properties: { path: 'file.js' },
      createdAt: '2026-09-23T00:00:00.000Z',
    };

    const findingB: Finding = {
      ...findingA,
      ruleId: 'RULE_B',
    };

    const fpA = computeFindingFingerprint(findingA);
    const fpB = computeFindingFingerprint(findingB);

    expect(fpA.hash).not.toBe(fpB.hash);
  });
});
