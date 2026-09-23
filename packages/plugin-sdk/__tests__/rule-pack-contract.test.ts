/**
 * Tests verifying the Rule Pack Plugin Contract and Declarative Data Invariant.
 */

import { describe, expect, it } from 'vitest';

import { corpCompliancePlugin } from '../examples/custom-rule-pack.js';
import { definePluginManifest, defineRulePackPlugin, PluginValidationError } from '../src/index.js';

describe('Rule Pack Plugin Contract', () => {
  it('creates an immutable, valid RulePlugin object', () => {
    expect(corpCompliancePlugin.type).toBe('rule-pack');
    expect(corpCompliancePlugin.manifest.id).toBe('@example/corp-compliance-rules');
    expect(corpCompliancePlugin.rulePack.id).toBe('corp-compliance');
    expect(corpCompliancePlugin.rulePack.rules).toHaveLength(1);

    const rule = corpCompliancePlugin.rulePack.rules[0];
    expect(rule.id).toBe('corp-compliance/unencrypted-token');
    expect(rule.severity.score).toBe(7.5);
    expect(rule.matchLogic.kind).toBe('single-behavior');

    expect(Object.isFrozen(corpCompliancePlugin)).toBe(true);
    expect(Object.isFrozen(corpCompliancePlugin.rulePack)).toBe(true);
    expect(Object.isFrozen(corpCompliancePlugin.rulePack.rules)).toBe(true);
  });

  it('prohibits imperative executable code inside rule matchLogic', () => {
    const manifest = definePluginManifest({
      id: 'imperative-pack',
      name: 'Imperative Rule Pack',
      version: '1.0.0',
      description: 'Pack attempting to run code',
      author: 'Attacker',
      type: 'rule-pack',
      capabilities: ['core-types-read'],
    });

    expect(() =>
      defineRulePackPlugin({
        manifest,
        rulePack: {
          id: 'imperative-pack',
          version: '1.0.0',
          description: 'Pack with code',
          metadata: {
            author: 'Attacker',
            tags: ['malicious'],
            severity: { min: 0.0, max: 10.0 },
          },
          rules: [
            {
              id: 'imperative-rule',
              packId: 'imperative-pack',
              version: '1.0.0',
              name: 'Code Executing Rule',
              description: 'Tries to run code',
              severity: { level: 'high', score: 8.0 },
              taxonomyIds: ['behavior/test'],
              matchLogic: {
                kind: 'single-behavior',
                behaviorTaxonomyId: 'behavior/test',
                propertyMatcher: {
                  path: 'value',
                  operator: 'equals',
                  value: 'target',
                },
                // INJECTED FUNCTION: Must be caught and rejected!
                evaluate: () => true,
              } as any,
              metadata: {},
            },
          ],
        },
      }),
    ).toThrowError(PluginValidationError);
  });
});
