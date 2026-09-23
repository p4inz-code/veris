/**
 * Reference Example: Custom Declarative Rule Pack Plugin
 *
 * Demonstrates authoring a pure data, declarative Rule Pack using @veris/plugin-sdk.
 *
 * Invariant: Rule packs contain declarative AST data only.
 * No imperative code, callbacks, or functions are permitted in rules.
 *
 * @module @veris/plugin-sdk/examples/custom-rule-pack
 */

import { definePluginManifest, defineRulePackPlugin, type RulePlugin } from '../src/index.js';

// 1. Define the plugin manifest
export const manifest = definePluginManifest({
  id: '@example/corp-compliance-rules',
  name: 'Corporate Compliance Rules Pack',
  version: '1.0.0',
  description: 'Internal security policies and regulatory compliance rules for enterprise assets.',
  author: 'Corporate Infosec',
  license: 'Apache-2.0',
  type: 'rule-pack',
  verisVersion: '>=1.0.0 <3.0.0',
  capabilities: ['core-types-read', 'config-read'],
  tags: ['compliance', 'enterprise', 'policy'],
});

// 2. Define the declarative rule pack
export const corpCompliancePlugin: RulePlugin = defineRulePackPlugin({
  manifest,
  rulePack: {
    id: 'corp-compliance',
    version: '1.0.0',
    description: 'Corporate policy detection rules evaluating extracted features.',
    metadata: {
      author: 'Corporate Infosec',
      tags: ['compliance', 'pci-dss', 'internal'],
      severity: { min: 3.0, max: 9.0 },
    },
    rules: [
      {
        id: 'corp-compliance/unencrypted-token',
        packId: 'corp-compliance',
        version: '1.0.0',
        name: 'Plaintext Corporate Security Token Detected',
        description:
          'Detects presence of plaintext SEC-TOKEN values in non-production configurations.',
        severity: {
          level: 'high',
          score: 7.5,
        },
        taxonomyIds: ['behavior/credential/token', 'behavior/disclosure/plaintext'],
        matchLogic: {
          kind: 'single-behavior',
          behaviorTaxonomyId: 'behavior/credential/token',
          propertyMatcher: {
            path: 'value',
            operator: 'contains',
            value: 'SEC-TOKEN',
          },
        },
        metadata: {
          author: 'Corporate Infosec',
          cweIds: ['CWE-798', 'CWE-312'],
          owaspCategory: 'A02:2021-Cryptographic Failures',
          remediation:
            'Rotate the exposed token immediately and store credentials in a secrets manager.',
          references: ['https://internal.corp/security/policy/credentials'],
        },
      },
    ],
  },
});
