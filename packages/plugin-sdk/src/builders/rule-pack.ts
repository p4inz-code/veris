/**
 * Rule Pack Plugin Builder.
 *
 * @module @veris/plugin-sdk/builders/rule-pack
 */

import {
  PluginAuthoringError,
  type PluginFieldValidationError,
  PluginValidationError,
} from '../errors/sdk-error.js';
import type {
  PluginRule,
  PluginRulePack,
  RulePackPluginDefinition,
  RulePlugin,
} from '../types/rule-pack.js';

/**
 * Validates that rule matchLogic is pure data and does not contain functions.
 */
function validateRuleLogicIsData(
  rule: PluginRule,
  index: number,
  errors: PluginFieldValidationError[],
): void {
  if (!rule.matchLogic || typeof rule.matchLogic !== 'object') {
    errors.push({
      field: `rulePack.rules[${index}].matchLogic`,
      message: 'matchLogic must be a declarative object AST',
    });
    return;
  }

  // Check for forbidden imperative functions
  for (const [key, val] of Object.entries(rule.matchLogic)) {
    if (typeof val === 'function') {
      errors.push({
        field: `rulePack.rules[${index}].matchLogic.${key}`,
        message: 'Declarative rule logic must not contain executable functions or callbacks.',
      });
    }
  }

  const kind = (rule.matchLogic as { kind?: string }).kind;
  if (!kind || !['single-behavior', 'multi-behavior', 'threshold', 'composite'].includes(kind)) {
    errors.push({
      field: `rulePack.rules[${index}].matchLogic.kind`,
      message: `Invalid matchLogic kind "${String(kind)}". Must be single-behavior, multi-behavior, threshold, or composite.`,
    });
  }
}

/**
 * Define a declarative Rule Pack Plugin conforming to the VERIS V2 contract.
 *
 * @param definition - The rule pack implementation and manifest.
 * @returns An immutable RulePlugin object.
 * @throws {PluginAuthoringError | PluginValidationError} if definition is invalid or contains imperative code.
 */
export function defineRulePackPlugin(definition: RulePackPluginDefinition): RulePlugin {
  if (!definition || typeof definition !== 'object') {
    throw new PluginAuthoringError(
      'Rule pack plugin definition must be an object',
      'INVALID_DEFINITION',
    );
  }

  if (!definition.manifest || typeof definition.manifest !== 'object') {
    throw new PluginAuthoringError(
      'Rule pack plugin definition requires a valid "manifest" object.',
      'MISSING_MANIFEST',
      'manifest',
    );
  }

  if (definition.manifest.type !== 'rule-pack') {
    throw new PluginAuthoringError(
      `Manifest type must be "rule-pack", but received "${definition.manifest.type}".`,
      'INVALID_PLUGIN_TYPE',
      'manifest.type',
    );
  }

  if (!definition.rulePack || typeof definition.rulePack !== 'object') {
    throw new PluginAuthoringError(
      'Rule pack plugin definition requires a valid "rulePack" object.',
      'MISSING_RULE_PACK',
      'rulePack',
    );
  }

  const errors: PluginFieldValidationError[] = [];
  const pack = definition.rulePack;

  if (typeof pack.id !== 'string' || pack.id.trim() === '') {
    errors.push({ field: 'rulePack.id', message: 'Rule pack ID must be a non-empty string' });
  }

  if (typeof pack.version !== 'string' || pack.version.trim() === '') {
    errors.push({
      field: 'rulePack.version',
      message: 'Rule pack version must be a non-empty string',
    });
  }

  if (typeof pack.description !== 'string' || pack.description.trim() === '') {
    errors.push({
      field: 'rulePack.description',
      message: 'Rule pack description must be a non-empty string',
    });
  }

  if (!Array.isArray(pack.rules)) {
    errors.push({ field: 'rulePack.rules', message: 'Rule pack rules must be an array' });
  } else {
    for (let i = 0; i < pack.rules.length; i++) {
      const rule = pack.rules[i];
      if (!rule || typeof rule !== 'object') {
        errors.push({ field: `rulePack.rules[${i}]`, message: 'Rule entry must be an object' });
        continue;
      }
      if (typeof rule.id !== 'string' || rule.id.trim() === '') {
        errors.push({
          field: `rulePack.rules[${i}].id`,
          message: 'Rule ID must be a non-empty string',
        });
      }
      if (typeof rule.name !== 'string' || rule.name.trim() === '') {
        errors.push({
          field: `rulePack.rules[${i}].name`,
          message: 'Rule name must be a non-empty string',
        });
      }
      if (!rule.severity || typeof rule.severity.score !== 'number') {
        errors.push({
          field: `rulePack.rules[${i}].severity`,
          message: 'Rule severity score must be a number [0.0, 10.0]',
        });
      }
      validateRuleLogicIsData(rule, i, errors);
    }
  }

  if (errors.length > 0) {
    throw new PluginValidationError(
      `Rule pack "${pack.id ?? 'unknown'}" failed validation with ${errors.length} error(s).`,
      errors,
    );
  }

  const frozenRules: readonly PluginRule[] = Object.freeze(
    pack.rules.map((r) =>
      Object.freeze({
        ...r,
        taxonomyIds: Object.freeze([...(r.taxonomyIds ?? [])]),
        metadata: Object.freeze({ ...(r.metadata ?? {}) }),
      }),
    ),
  );

  const frozenPack: PluginRulePack = Object.freeze({
    id: pack.id,
    version: pack.version,
    description: pack.description,
    rules: frozenRules,
    ...(pack.dependencies ? { dependencies: Object.freeze([...pack.dependencies]) } : {}),
    metadata: Object.freeze({
      author: pack.metadata?.author ?? definition.manifest.author,
      tags: Object.freeze([...(pack.metadata?.tags ?? [])]),
      severity: Object.freeze({
        min: pack.metadata?.severity?.min ?? 0.0,
        max: pack.metadata?.severity?.max ?? 10.0,
      }),
    }),
  });

  const plugin: RulePlugin = Object.freeze({
    type: 'rule-pack',
    manifest: definition.manifest,
    rulePack: frozenPack,
    ...(definition.lifecycle ? { lifecycle: definition.lifecycle } : {}),
  });

  return plugin;
}
