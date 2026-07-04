/**
 * Tests for M4 — Cache key generation and prompt version integration.
 *
 * @module @veris/explain/__tests__/unit/prompts/cache-key.test
 */

import { describe, it, expect } from 'vitest';
import {
  extractCacheKeyComponents,
  formatPromptVersion,
  isCacheStale,
  encodePromptSegment,
  getMajorVersion,
  isVersionCompatible,
} from '../../../src/prompts/cache-key.js';

describe('extractCacheKeyComponents', () => {
  it('extracts template ID and version', () => {
    const result = extractCacheKeyComponents('finding-explain-system-v1', '1.2.0');
    expect(result.templateId).toBe('finding-explain-system-v1');
    expect(result.promptVersion).toBe('1.2.0');
  });
});

describe('formatPromptVersion', () => {
  it('formats version string for cache key', () => {
    const result = formatPromptVersion('finding-explain-system-v1', '1.2.0');
    expect(result).toBe('finding-explain-system-v1:v1.2.0');
  });
});

describe('isCacheStale', () => {
  it('returns true if cached version is older', () => {
    expect(isCacheStale('1.0.0', '2.0.0')).toBe(true);
    expect(isCacheStale('1.0.0', '1.1.0')).toBe(true);
  });

  it('returns false if cached version is current or newer', () => {
    expect(isCacheStale('2.0.0', '1.0.0')).toBe(false);
    expect(isCacheStale('1.0.0', '1.0.0')).toBe(false);
  });
});

describe('encodePromptSegment', () => {
  it('returns the prompt version string as-is', () => {
    expect(encodePromptSegment('finding-explain-system-v1:v1.0.0')).toBe(
      'finding-explain-system-v1:v1.0.0',
    );
  });
});

describe('getMajorVersion', () => {
  it('extracts major version number', () => {
    expect(getMajorVersion('1.0.0')).toBe(1);
    expect(getMajorVersion('2.3.4')).toBe(2);
    expect(getMajorVersion('0.0.0')).toBe(0);
  });

  it('returns 0 for non-numeric input', () => {
    expect(getMajorVersion('abc')).toBe(0);
  });
});

describe('isVersionCompatible', () => {
  it('returns true when version >= minimum', () => {
    expect(isVersionCompatible('2.0.0', '1.0.0')).toBe(true);
    expect(isVersionCompatible('1.0.0', '1.0.0')).toBe(true);
  });

  it('returns false when version < minimum', () => {
    expect(isVersionCompatible('1.0.0', '2.0.0')).toBe(false);
  });
});
