import { describe, it, expect } from 'vitest';
import {
  createSeverity,
  severityLevelFromScore,
  compareSeverity,
  SEVERITY_THRESHOLDS,
  SEVERITY_LEVELS,
  SEVERITY_ORDER,
} from '../src/types/severity.js';

describe('Severity', () => {
  describe('createSeverity', () => {
    it('creates a severity with valid level and score', () => {
      const s = createSeverity('high', 7.5);
      expect(s.level).toBe('high');
      expect(s.score).toBe(7.5);
    });

    it('clamps score to 0.0 minimum', () => {
      const s = createSeverity('info', -1.0);
      expect(s.score).toBe(0.0);
    });

    it('clamps score to 10.0 maximum', () => {
      const s = createSeverity('critical', 15.0);
      expect(s.score).toBe(10.0);
    });

    it('creates severity at exact boundaries', () => {
      expect(createSeverity('low', 0).score).toBe(0);
      expect(createSeverity('critical', 10).score).toBe(10);
    });
  });

  describe('severityLevelFromScore', () => {
    it('returns critical for score >= 9.0', () => {
      expect(severityLevelFromScore(9.0)).toBe('critical');
      expect(severityLevelFromScore(10.0)).toBe('critical');
    });

    it('returns high for score 7.0-8.9', () => {
      expect(severityLevelFromScore(7.0)).toBe('high');
      expect(severityLevelFromScore(8.9)).toBe('high');
    });

    it('returns medium for score 5.0-6.9', () => {
      expect(severityLevelFromScore(5.0)).toBe('medium');
      expect(severityLevelFromScore(6.9)).toBe('medium');
    });

    it('returns low for score 3.0-4.9', () => {
      expect(severityLevelFromScore(3.0)).toBe('low');
      expect(severityLevelFromScore(4.9)).toBe('low');
    });

    it('returns info for score < 3.0', () => {
      expect(severityLevelFromScore(0)).toBe('info');
      expect(severityLevelFromScore(2.9)).toBe('info');
    });
  });

  describe('compareSeverity', () => {
    it('returns positive when a > b', () => {
      expect(
        compareSeverity(createSeverity('critical', 9), createSeverity('low', 3)),
      ).toBeGreaterThan(0);
    });

    it('returns negative when a < b', () => {
      expect(compareSeverity(createSeverity('low', 3), createSeverity('critical', 9))).toBeLessThan(
        0,
      );
    });

    it('returns 0 when equal', () => {
      expect(compareSeverity(createSeverity('medium', 5), createSeverity('medium', 5))).toBe(0);
    });
  });

  describe('constants', () => {
    it('has all severity levels defined', () => {
      expect(SEVERITY_LEVELS).toContain('critical');
      expect(SEVERITY_LEVELS).toContain('high');
      expect(SEVERITY_LEVELS).toContain('medium');
      expect(SEVERITY_LEVELS).toContain('low');
      expect(SEVERITY_LEVELS).toContain('info');
    });

    it('has thresholds for all levels', () => {
      for (const level of SEVERITY_LEVELS) {
        expect(typeof SEVERITY_THRESHOLDS[level]).toBe('number');
      }
    });

    it('has correct threshold ordering', () => {
      expect(SEVERITY_THRESHOLDS.critical).toBeGreaterThan(SEVERITY_THRESHOLDS.high);
      expect(SEVERITY_THRESHOLDS.high).toBeGreaterThan(SEVERITY_THRESHOLDS.medium);
      expect(SEVERITY_THRESHOLDS.medium).toBeGreaterThan(SEVERITY_THRESHOLDS.low);
    });

    it('has severity ordered from highest to lowest', () => {
      expect(SEVERITY_ORDER[0]).toBe('critical');
      expect(SEVERITY_ORDER[SEVERITY_ORDER.length - 1]).toBe('info');
    });
  });
});
