import { describe, it, expect } from 'vitest';
import {
  normalizeToForward,
  normalizePath,
  join,
  extname,
  isAbsolute,
  hasPathTraversal,
  safeResolve,
} from '../src/path/path.js';

describe('Path utilities', () => {
  describe('normalizeToForward', () => {
    it('converts backslashes to forward slashes', () => {
      expect(normalizeToForward('a\\b\\c')).toBe('a/b/c');
    });

    it('leaves forward slashes unchanged', () => {
      expect(normalizeToForward('a/b/c')).toBe('a/b/c');
    });
  });

  describe('isAbsolute', () => {
    it('detects Unix absolute paths', () => expect(isAbsolute('/usr/bin')).toBe(true));
    it('detects Windows absolute paths', () => expect(isAbsolute('C:\\Users')).toBe(true));
    it('detects relative paths', () => expect(isAbsolute('relative/path')).toBe(false));
  });

  describe('extname', () => {
    it('returns extension in lowercase', () => {
      expect(extname('file.PY')).toBe('.py');
    });

    it('returns empty string for no extension', () => {
      expect(extname('Makefile')).toBe('');
    });
  });

  describe('hasPathTraversal', () => {
    it('detects parent directory traversal', () =>
      expect(hasPathTraversal('../etc/passwd')).toBe(true));
    it('detects ./ traversal', () => expect(hasPathTraversal('./hidden')).toBe(true));
    it('passes clean paths', () => expect(hasPathTraversal('src/file.ts')).toBe(false));
  });

  describe('safeResolve', () => {
    it('resolves path within base', () => {
      const result = safeResolve('/base', 'sub/file.ts');
      expect(result).toBeTruthy();
      expect(result).toContain('/base/sub/file.ts');
    });

    it('rejects path traversal outside base', () => {
      const result = safeResolve('/base', '../outside');
      expect(result).toBeNull();
    });
  });
});
