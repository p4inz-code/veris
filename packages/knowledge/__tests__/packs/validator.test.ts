/**
 * Tests for Knowledge Pack Validator.
 */

import { describe, it, expect } from 'vitest';
import {
  validatePackFile,
  computePackChecksum,
  validateChecksum,
} from '../../src/packs/validator.js';
import type { KnowledgePackFile } from '../../src/packs/types.js';
import { isValidCategory } from '../../src/packs/categories.js';

function createMinimalPackFile(overrides?: Partial<KnowledgePackFile>): KnowledgePackFile {
  return {
    metadata: {
      id: 'test-pack',
      name: 'Test Pack',
      version: '1.0.0',
      description: 'A test knowledge pack',
      author: 'VERIS',
      license: 'UNLICENSED',
      source: 'https://example.com',
      categories: ['malware-families'],
      tags: ['test'],
      supportedVerisVersion: '0.1.0',
      createdAt: '2026-07-11T00:00:00.000Z',
      updatedAt: '2026-07-11T00:00:00.000Z',
      dependencies: [],
      references: [],
    },
    entries: [
      {
        id: 'test-entry',
        name: 'Test Entry',
        description: 'A test entry',
        category: 'malware-families',
        tags: ['test'],
        severity: 'high',
        behavior: 'Does something malicious',
        recommendedAction: 'Do something about it',
        indicators: [
          {
            type: 'string-pattern',
            value: 'test_indicator',
            confidence: 0.8,
            description: 'Test indicator',
          },
        ],
        references: [],
        mitreTechniques: ['T1003'],
        relatedEntries: [],
        metadata: {},
      },
    ],
    ...overrides,
  };
}

describe('validatePackFile', () => {
  it('validates a minimal valid pack file', () => {
    const file = createMinimalPackFile();
    const result = validatePackFile(file);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects missing metadata', () => {
    const result = validatePackFile({} as KnowledgePackFile);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].code).toBe('MISSING_METADATA');
  });

  it('rejects missing entries', () => {
    const file = { metadata: createMinimalPackFile().metadata } as KnowledgePackFile;
    const result = validatePackFile(file);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('INVALID_ENTRIES');
  });

  it('rejects invalid pack ID format', () => {
    const file = createMinimalPackFile();
    file.metadata.id = 'Invalid-Pack-ID!';
    const result = validatePackFile(file);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_PACK_ID')).toBe(true);
  });

  it('rejects invalid version format', () => {
    const file = createMinimalPackFile();
    file.metadata.version = '1.0';
    const result = validatePackFile(file);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_VERSION')).toBe(true);
  });

  it('rejects duplicate entry IDs', () => {
    const file = createMinimalPackFile();
    file.entries.push({
      ...file.entries[0],
      id: 'test-entry',
    });
    const result = validatePackFile(file);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'DUPLICATE_ENTRY_ID')).toBe(true);
  });

  it('rejects invalid severity', () => {
    const file = createMinimalPackFile();
    file.entries[0].severity = 'invalid' as 'high';
    const result = validatePackFile(file);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_SEVERITY')).toBe(true);
  });

  it('rejects missing entry required fields', () => {
    const file = createMinimalPackFile();
    (file.entries[0] as Record<string, unknown>).behavior = '';
    const result = validatePackFile(file);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MISSING_ENTRY_FIELD')).toBe(true);
  });

  it('rejects too many entries', async () => {
    const { MAX_ENTRIES_PER_PACK } = await import('../../src/packs/schema.js');
    const file = createMinimalPackFile();
    file.entries = Array(MAX_ENTRIES_PER_PACK + 1)
      .fill(null)
      .map((_, i) => ({
        ...file.entries[0],
        id: `entry-${i}`,
      }));
    const result = validatePackFile(file);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'TOO_MANY_ENTRIES')).toBe(true);
  });

  it('rejects invalid entry ID format', () => {
    const file = createMinimalPackFile();
    file.entries[0].id = 'Invalid Entry!';
    const result = validatePackFile(file);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_ENTRY_ID')).toBe(true);
  });

  it('warns on unknown categories', () => {
    const file = createMinimalPackFile();
    file.entries[0].category = 'unknown-category';
    file.metadata.categories = ['unknown-category'];
    const result = validatePackFile(file);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('rejects missing required metadata fields', () => {
    const file = createMinimalPackFile();
    (file.metadata as Record<string, unknown>).description = '';
    const result = validatePackFile(file);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.code === 'MISSING_FIELD' && e.path?.includes('description')),
    ).toBe(true);
  });
});

describe('isValidCategory', () => {
  it('returns true for valid categories', () => {
    expect(isValidCategory('malware-families')).toBe(true);
    expect(isValidCategory('lolbins')).toBe(true);
    expect(isValidCategory('credential-theft')).toBe(true);
  });

  it('returns false for invalid categories', () => {
    expect(isValidCategory('nonexistent')).toBe(false);
    expect(isValidCategory('')).toBe(false);
  });
});

describe('computePackChecksum', () => {
  it('computes consistent checksums', () => {
    const content = '{"test": "data"}';
    const hash1 = computePackChecksum(content);
    const hash2 = computePackChecksum(content);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 hex
  });

  it('produces different hashes for different content', () => {
    const hash1 = computePackChecksum('content1');
    const hash2 = computePackChecksum('content2');
    expect(hash1).not.toBe(hash2);
  });
});

describe('validateChecksum', () => {
  it('validates matching checksums', () => {
    const content = 'test content';
    const checksum = computePackChecksum(content);
    expect(validateChecksum(content, checksum)).toBe(true);
  });

  it('rejects mismatching checksums', () => {
    const content = 'test content';
    expect(
      validateChecksum(content, '0000000000000000000000000000000000000000000000000000000000000000'),
    ).toBe(false);
  });
});
