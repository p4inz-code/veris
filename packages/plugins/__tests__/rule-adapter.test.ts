import { describe, expect, it } from 'vitest';

import type { RulePack } from '@veris/core';
import { RuleRegistry } from '@veris/rules';

import {
  adaptLogicToCondition,
  adaptRulePackToRules,
  registerPluginRulePack,
} from '../src/adapters/rule-adapter.js';
import { PluginStateTracker } from '../src/lifecycle.js';
import type { LoadedPlugin, RulePlugin } from '../src/types.js';

describe('Plugin Rule Adapter', () => {
  const sampleRulePack: RulePack = {
    id: 'sample-pack',
    version: '1.0.0',
    description: 'Sample rule pack',
    metadata: {
      author: 'SecOps Team',
      tags: ['security', 'compliance'],
      severity: { min: 1.0, max: 10.0 },
    },
    rules: [
      {
        id: 'RULE-SAMPLE-001',
        packId: 'sample-pack',
        version: '1.0.0',
        name: 'Suspicious PowerShell Execution',
        description: 'Detects encoded command execution in PowerShell',
        severity: { level: 'high', score: 8.5 },
        taxonomyIds: ['execution:powershell'],
        metadata: {
          author: 'SecOps',
          tags: ['execution', 'T1059.001'],
          references: ['https://attack.mitre.org/techniques/T1059/001/'],
        },
        matchLogic: {
          kind: 'single-behavior',
          behaviorTaxonomyId: 'execution:powershell',
          propertyMatcher: {
            path: 'encodedCommand',
            operator: 'exists',
            value: true,
          },
        },
      },
      {
        id: 'RULE-SAMPLE-002',
        packId: 'sample-pack',
        version: '1.0.0',
        name: 'High Entropy Configuration',
        description: 'Configuration file with suspiciously high entropy',
        severity: { level: 'medium', score: 5.0 },
        taxonomyIds: ['obfuscation:entropy'],
        metadata: {
          tags: ['obfuscation'],
        },
        matchLogic: {
          kind: 'threshold',
          metric: 'entropy',
          threshold: 7.2,
          window: 'global',
        },
      },
    ],
  };

  it('adapts a declarative RulePack into canonical @veris/rules Rule definitions', () => {
    const rules = adaptRulePackToRules(sampleRulePack);
    expect(rules).toHaveLength(2);

    const r1 = rules[0];
    expect(r1.id).toBe('RULE-SAMPLE-001');
    expect(r1.category).toBe('execution');
    expect(r1.severityHint).toBe('high');
    expect(r1.mitreTechniques).toContain('T1059.001');
    expect(r1.condition).toEqual({
      type: 'and',
      conditions: [
        { type: 'evidence_type', evidenceType: 'execution:powershell' },
        { type: 'exists', field: 'encodedCommand' },
      ],
    });

    const r2 = rules[1];
    expect(r2.id).toBe('RULE-SAMPLE-002');
    expect(r2.category).toBe('obfuscation');
    expect(r2.severityHint).toBe('medium');
    expect(r2.condition).toEqual({
      type: 'range',
      field: 'entropy',
      min: 7.2,
    });
  });

  it('correctly adapts composite and multi-behavior logic', () => {
    const compositeLogic = adaptLogicToCondition({
      kind: 'composite',
      operator: 'and',
      subRules: [
        {
          kind: 'single-behavior',
          behaviorTaxonomyId: 'network:outbound',
          propertyMatcher: { path: 'port', operator: 'equals', value: 4444 },
        },
        {
          kind: 'threshold',
          metric: 'connections',
          threshold: 10,
          window: '1m',
        },
      ],
    });

    expect(compositeLogic).toEqual({
      type: 'and',
      conditions: [
        {
          type: 'and',
          conditions: [
            { type: 'evidence_type', evidenceType: 'network:outbound' },
            { type: 'equals', field: 'port', value: 4444 },
          ],
        },
        {
          type: 'range',
          field: 'connections',
          min: 10,
        },
      ],
    });
  });

  it('registers adapted rules cleanly into @veris/rules RuleRegistry', () => {
    const registry = new RuleRegistry();
    const stateTracker = new PluginStateTracker('sample-rule-pack');
    stateTracker.transitionTo('active');

    const rulePlugin: RulePlugin = {
      type: 'rule-pack',
      manifest: {
        schemaVersion: '1.0.0',
        id: 'sample-rule-pack',
        name: 'Sample Rules',
        version: '1.0.0',
        description: 'Test',
        author: 'Tester',
        license: 'MIT',
        engines: { veris: '^1.0.0' },
        type: 'rule-pack',
        entryPoint: './index.js',
        capabilities: ['core-types-read'],
      },
      rulePack: sampleRulePack,
    };

    const loadedPlugin: LoadedPlugin = {
      id: rulePlugin.manifest.id,
      manifest: rulePlugin.manifest,
      directory: '/tmp/rules',
      entryPointFile: '/tmp/rules/index.js',
      instance: rulePlugin,
      stateTracker,
    };

    const count = registerPluginRulePack(registry, loadedPlugin);
    expect(count).toBe(2);
    expect(registry.size).toBe(2);
    expect(registry.has('RULE-SAMPLE-001')).toBe(true);
    expect(registry.has('RULE-SAMPLE-002')).toBe(true);
  });
});
