/**
 * Rule Pack Adapter for VERIS V2 Plugin Host.
 *
 * Bridges declarative PluginRulePack instances into canonical Rule structures
 * accepted by the VERIS rule engine and IRuleRegistry.
 *
 * Enforces:
 * - 100% Declarative AST validation (strictly zero executable functions or lambdas)
 * - Deterministic condition tree conversion
 * - Canonical severity mapping
 * - Safe registration into IRuleRegistry
 *
 * @module @veris/plugins/adapters/rule-adapter
 */

import type { RulePack, Rule as CoreRule, RuleLogic, PropertyMatcher } from '@veris/core';
import type {
  IRuleRegistry,
  Rule,
  RuleCategory,
  RuleCondition,
  RuleSeverityHint,
} from '@veris/rules';

import { checkDeclarativePurity } from '../loader.js';
import type { LoadedPlugin, RulePlugin } from '../types.js';

const VALID_CATEGORIES = new Set<RuleCategory>([
  'injection',
  'persistence',
  'execution',
  'privilege-escalation',
  'defense-evasion',
  'credential-access',
  'discovery',
  'exfiltration',
  'container',
  'obfuscation',
  'supply-chain',
  'configuration',
  'best-practice',
]);

/**
 * Adapts a declarative rule pack into internal Rule definitions consumable by @veris/rules.
 */
export function adaptRulePackToRules(rulePack: RulePack): readonly Rule[] {
  const purity = checkDeclarativePurity(rulePack);
  if (!purity.pure) {
    throw new Error(`Rule pack "${rulePack.id}" violates declarative purity: ${purity.violation}`);
  }

  const rules: Rule[] = [];

  for (const coreRule of rulePack.rules) {
    rules.push(adaptSingleRule(coreRule));
  }

  return Object.freeze(rules);
}

/**
 * Registers all rules from a loaded RulePlugin into an IRuleRegistry.
 * Returns the count of successfully registered rules.
 */
export function registerPluginRulePack(
  registry: IRuleRegistry,
  loadedPlugin: LoadedPlugin,
): number {
  if (loadedPlugin.manifest.type !== 'rule-pack') {
    throw new Error(
      `Plugin "${loadedPlugin.manifest.id}" is a "${loadedPlugin.manifest.type}" plugin, not a rule-pack`,
    );
  }

  const plugin = loadedPlugin.instance as RulePlugin;
  const rulePack = plugin.rulePack;

  if (!rulePack || !Array.isArray(rulePack.rules)) {
    throw new Error(
      `Plugin "${loadedPlugin.manifest.id}" does not provide a valid rulePack with a rules array`,
    );
  }

  const internalRules = adaptRulePackToRules(rulePack);

  for (const rule of internalRules) {
    registry.register(rule);
  }

  return internalRules.length;
}

/**
 * Maps a single CoreRule to an internal @veris/rules Rule.
 */
function adaptSingleRule(coreRule: CoreRule): Rule {
  const category = resolveCategory(coreRule);
  const severityHint = resolveSeverityHint(coreRule.severity);
  const condition = adaptLogicToCondition(coreRule.matchLogic);

  // Extract MITRE technique IDs from tags or references
  const mitreTechniques: string[] = [];
  for (const tag of coreRule.metadata.tags ?? []) {
    if (/^T\d{4}(\.\d{3})?$/i.test(tag)) {
      mitreTechniques.push(tag.toUpperCase());
    }
  }

  const explanationTemplate = coreRule.description.includes('{{')
    ? coreRule.description
    : `${coreRule.name}: ${coreRule.description} (Matched on {{evidence}})`;

  return Object.freeze({
    id: coreRule.id,
    category,
    name: coreRule.name,
    description: coreRule.description,
    condition,
    severityHint,
    explanationTemplate,
    mitreTechniques: Object.freeze(mitreTechniques),
    references: Object.freeze(coreRule.metadata.references ?? []),
    tags: Object.freeze(coreRule.metadata.tags ?? []),
  });
}

/**
 * Resolves a valid RuleCategory from tags or defaults to 'configuration'.
 */
function resolveCategory(rule: CoreRule): RuleCategory {
  for (const tag of rule.metadata.tags ?? []) {
    const lower = tag.toLowerCase() as RuleCategory;
    if (VALID_CATEGORIES.has(lower)) {
      return lower;
    }
  }

  return 'configuration';
}

/**
 * Maps a severity object to a standard RuleSeverityHint.
 */
function resolveSeverityHint(severity?: { level: string; score: number }): RuleSeverityHint {
  if (!severity) return 'medium';

  const level = severity.level.toLowerCase();
  if (
    level === 'critical' ||
    level === 'high' ||
    level === 'medium' ||
    level === 'low' ||
    level === 'info'
  ) {
    return level as RuleSeverityHint;
  }

  const score = severity.score;
  if (score >= 9.0) return 'critical';
  if (score >= 7.0) return 'high';
  if (score >= 4.0) return 'medium';
  if (score >= 2.0) return 'low';
  return 'info';
}

/**
 * Converts a declarative RuleLogic AST into a @veris/rules RuleCondition.
 */
export function adaptLogicToCondition(logic: RuleLogic): RuleCondition {
  switch (logic.kind) {
    case 'single-behavior': {
      const matcherCondition = adaptPropertyMatcher(logic.propertyMatcher);
      return {
        type: 'and',
        conditions: [
          { type: 'evidence_type', evidenceType: logic.behaviorTaxonomyId },
          matcherCondition,
        ],
      };
    }

    case 'multi-behavior': {
      const typeConditions: RuleCondition[] = logic.pattern.taxonomyIds.map((tid) => ({
        type: 'evidence_type',
        evidenceType: tid,
      }));

      const matcherConditions: RuleCondition[] = (logic.pattern.matchers ?? []).map(
        adaptPropertyMatcher,
      );

      const allConditions = [...typeConditions, ...matcherConditions];

      return {
        type: logic.relationship === 'any' ? 'any_of' : 'and',
        conditions: allConditions,
      };
    }

    case 'threshold': {
      return {
        type: 'range',
        field: logic.metric,
        min: logic.threshold,
      };
    }

    case 'composite': {
      return {
        type: logic.operator === 'and' ? 'and' : 'or',
        conditions: logic.subRules.map(adaptLogicToCondition),
      };
    }

    default:
      return {
        type: 'confidence_threshold',
        threshold: 0.5,
      };
  }
}

/**
 * Converts a declarative PropertyMatcher to a @veris/rules RuleCondition.
 */
function adaptPropertyMatcher(matcher: PropertyMatcher): RuleCondition {
  switch (matcher.operator) {
    case 'equals':
      return { type: 'equals', field: matcher.path, value: matcher.value };

    case 'contains':
      return { type: 'contains', field: matcher.path, value: matcher.value };

    case 'regex':
    case 'matches': {
      const pattern = String(matcher.value);
      if (pattern.length > 1000) {
        throw new Error('Rule matcher regex pattern exceeds 1000 character maximum limit');
      }
      try {
        new RegExp(pattern);
      } catch (err) {
        throw new Error(
          `Invalid regex pattern in rule matcher "${pattern}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return { type: 'regex', field: matcher.path, pattern };
    }

    case 'exists':
      return { type: 'exists', field: matcher.path };

    case 'gt':
    case 'gte':
      return { type: 'range', field: matcher.path, min: Number(matcher.value) };

    case 'lt':
    case 'lte':
      return { type: 'range', field: matcher.path, max: Number(matcher.value) };

    case 'in':
      return {
        type: 'all_of',
        field: matcher.path,
        values: Array.isArray(matcher.value) ? matcher.value : [matcher.value],
      };

    default:
      return { type: 'exists', field: matcher.path };
  }
}
