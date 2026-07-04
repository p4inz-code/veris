import { describe, it, expect } from 'vitest';
import { parseSemver, compareSemver, satisfies } from '../src/version/version.js';

describe('Version (semver)', () => {
  describe('parseSemver', () => {
    it('parses a standard semver', () => {
      const v = parseSemver('1.2.3');
      expect(v).not.toBeNull();
      expect(v!.major).toBe(1);
      expect(v!.minor).toBe(2);
      expect(v!.patch).toBe(3);
    });

    it('parses prerelease', () => {
      const v = parseSemver('1.0.0-beta.1');
      expect(v!.prerelease).toBe('beta.1');
    });

    it('parses build metadata', () => {
      const v = parseSemver('1.0.0+build.123');
      expect(v!.build).toBe('build.123');
    });

    it('returns null for invalid semver', () => {
      expect(parseSemver('not-a-version')).toBeNull();
    });
  });

  describe('compareSemver', () => {
    it('detects equal versions', () => expect(compareSemver('1.0.0', '1.0.0')).toBe(0));
    it('detects greater version', () => expect(compareSemver('2.0.0', '1.0.0')).toBe(1));
    it('detects lesser version', () => expect(compareSemver('1.0.0', '2.0.0')).toBe(-1));
    it('compares minor versions', () => expect(compareSemver('1.2.0', '1.1.0')).toBe(1));
    it('compares patch versions', () => expect(compareSemver('1.1.1', '1.1.0')).toBe(1));
  });

  describe('satisfies', () => {
    it('matches exact version', () => expect(satisfies('1.0.0', '1.0.0')).toBe(true));
    it('rejects different exact version', () => expect(satisfies('2.0.0', '1.0.0')).toBe(false));
    it('satisfies caret range', () => expect(satisfies('1.5.0', '^1.0.0')).toBe(true));
    it('rejects out-of-range caret', () => expect(satisfies('2.0.0', '^1.0.0')).toBe(false));
    it('matches tilde range', () => expect(satisfies('1.2.1', '~1.2.0')).toBe(true));
  });
});
