import { describe, expect, it } from 'vitest';

import {
  MAX_CONSECUTIVE_ERRORS_BEFORE_QUARANTINE,
  PluginStateTracker,
  isPluginCompatible,
  sortPluginsDeterministically,
  validatePluginManifest,
  type PluginManifest,
} from '../src/index.js';

describe('V2 Plugin Contracts', () => {
  const validExtractorManifest: PluginManifest = {
    schemaVersion: '1.0.0',
    id: '@corp/veris-plugin-custom-extractor',
    name: 'Custom Extractor Plugin',
    version: '1.2.0',
    description: 'Extracts custom metadata',
    author: 'Security Team',
    license: 'Apache-2.0',
    engines: {
      veris: '^1.0.0',
    },
    type: 'extractor',
    entryPoint: './dist/index.js',
    capabilities: ['core-types-read', 'target-read'],
    supportedArtifactTypes: ['file', 'configuration'],
  };

  const validRuleManifest: PluginManifest = {
    schemaVersion: '1.0.0',
    id: 'veris-plugin-enterprise-rules',
    name: 'Enterprise Rule Pack',
    version: '2.0.1',
    description: 'Corporate security policies and compliance rules',
    author: 'SecOps',
    license: 'MIT',
    engines: {
      veris: '>=1.0.0',
    },
    type: 'rule-pack',
    entryPoint: './dist/index.js',
    capabilities: ['core-types-read'],
  };

  describe('validatePluginManifest', () => {
    it('accepts valid extractor and rule-pack manifests', () => {
      const res1 = validatePluginManifest(validExtractorManifest);
      expect(res1.valid).toBe(true);
      expect(res1.manifest).toEqual(validExtractorManifest);
      expect(res1.errors).toHaveLength(0);

      const res2 = validatePluginManifest(validRuleManifest);
      expect(res2.valid).toBe(true);
      expect(res2.manifest).toEqual(validRuleManifest);
      expect(res2.errors).toHaveLength(0);
    });

    it('rejects manifest with non-object input', () => {
      expect(validatePluginManifest(null).valid).toBe(false);
      expect(validatePluginManifest('string').valid).toBe(false);
      expect(validatePluginManifest([]).valid).toBe(false);
    });

    it('rejects invalid schemaVersion', () => {
      const invalid = { ...validExtractorManifest, schemaVersion: '2.0.0' };
      const res = validatePluginManifest(invalid);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.field === 'schemaVersion')).toBe(true);
    });

    it('rejects invalid plugin id naming', () => {
      const invalid = { ...validExtractorManifest, id: 'INVALID ID WITH SPACES' };
      const res = validatePluginManifest(invalid);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.field === 'id')).toBe(true);
    });

    it('rejects invalid semver version string', () => {
      const invalid = { ...validExtractorManifest, version: 'not-a-semver' };
      const res = validatePluginManifest(invalid);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.field === 'version')).toBe(true);
    });

    it('rejects unsupported plugin type', () => {
      const invalid = { ...validExtractorManifest, type: 'unsupported-renderer' as any };
      const res = validatePluginManifest(invalid);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.field === 'type')).toBe(true);
    });

    it('rejects unrecognized capability', () => {
      const invalid = {
        ...validExtractorManifest,
        capabilities: ['core-types-read', 'arbitrary-root-access' as any],
      };
      const res = validatePluginManifest(invalid);
      expect(res.valid).toBe(false);
      expect(res.errors.some((e) => e.field.startsWith('capabilities'))).toBe(true);
    });
  });

  describe('isPluginCompatible', () => {
    it('correctly validates host semver compatibility', () => {
      expect(isPluginCompatible(validExtractorManifest, '1.0.0')).toBe(true);
      expect(isPluginCompatible(validExtractorManifest, '1.5.2')).toBe(true);
      expect(isPluginCompatible(validExtractorManifest, '2.0.0')).toBe(false);
      expect(isPluginCompatible(validExtractorManifest, '0.9.0')).toBe(false);

      expect(isPluginCompatible(validRuleManifest, '1.0.0')).toBe(true);
      expect(isPluginCompatible(validRuleManifest, '2.1.0')).toBe(true);
      expect(isPluginCompatible(validRuleManifest, '0.5.0')).toBe(false);
    });
  });

  describe('sortPluginsDeterministically', () => {
    it('sorts plugins lexicographically by ID regardless of input order', () => {
      const p1 = { id: 'zebra-plugin' };
      const p2 = { id: '@corp/alpha-plugin' };
      const p3 = { id: 'beta-plugin' };

      const sorted1 = sortPluginsDeterministically([p1, p2, p3]);
      const sorted2 = sortPluginsDeterministically([p3, p1, p2]);

      expect(sorted1.map((p) => p.id)).toEqual([
        '@corp/alpha-plugin',
        'beta-plugin',
        'zebra-plugin',
      ]);
      expect(sorted2.map((p) => p.id)).toEqual(sorted1.map((p) => p.id));
    });
  });

  describe('PluginStateTracker & Quarantine Policy', () => {
    it('manages standard lifecycle state transitions', () => {
      const tracker = new PluginStateTracker('test-plugin');
      expect(tracker.status).toBe('discovered');
      expect(tracker.canExecute()).toBe(false);

      tracker.transitionTo('validated');
      expect(tracker.status).toBe('validated');
      expect(tracker.canExecute()).toBe(false);

      tracker.transitionTo('initialized');
      expect(tracker.status).toBe('initialized');

      tracker.transitionTo('active');
      expect(tracker.status).toBe('active');
      expect(tracker.canExecute()).toBe(true);

      tracker.transitionTo('deactivated');
      expect(tracker.status).toBe('deactivated');
      expect(tracker.canExecute()).toBe(false);

      expect(tracker.transitions).toHaveLength(4);
    });

    it('quarantines plugin after threshold consecutive errors', () => {
      const tracker = new PluginStateTracker('faulty-plugin');
      tracker.transitionTo('active');

      // Errors 1 and 2 should not quarantine
      const q1 = tracker.recordError(new Error('Parse error 1'));
      expect(q1).toBe(false);
      expect(tracker.status).toBe('active');
      expect(tracker.consecutiveErrors).toBe(1);

      const q2 = tracker.recordError('Parse error 2');
      expect(q2).toBe(false);
      expect(tracker.status).toBe('active');
      expect(tracker.consecutiveErrors).toBe(2);

      // Error 3 exceeds threshold
      const q3 = tracker.recordError(new Error('Crash error 3'));
      expect(q3).toBe(true);
      expect(tracker.status).toBe('quarantined');
      expect(tracker.canExecute()).toBe(false);
      expect(tracker.consecutiveErrors).toBe(MAX_CONSECUTIVE_ERRORS_BEFORE_QUARANTINE);

      // Check transition history records quarantine reason
      const lastTransition = tracker.transitions[tracker.transitions.length - 1];
      expect(lastTransition.to).toBe('quarantined');
      expect(lastTransition.reason).toContain('Quarantined after 3 consecutive errors');
    });

    it('resets consecutive error count on successful execution', () => {
      const tracker = new PluginStateTracker('recovering-plugin');
      tracker.transitionTo('active');

      tracker.recordError('Transient failure');
      expect(tracker.consecutiveErrors).toBe(1);

      tracker.recordSuccess();
      expect(tracker.consecutiveErrors).toBe(0);

      // Should require full 3 errors to quarantine again
      tracker.recordError('Err 1');
      tracker.recordError('Err 2');
      expect(tracker.status).toBe('active');
      tracker.recordError('Err 3');
      expect(tracker.status).toBe('quarantined');
    });
  });
});
