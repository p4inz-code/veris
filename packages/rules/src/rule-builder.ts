/**
 * RuleBuilder — deterministic, immutable rule construction with method chaining.
 *
 * @module @veris/rules/rule-builder
 */

import { validateRuleDefinition, clearValidationState } from './rule-validator.js';
import type {
  Rule,
  RuleId,
  RuleCategory,
  RuleCondition,
  RuleSeverityHint,
  IRuleBuilder,
} from './types.js';

/**
 * Builder for constructing deterministic, immutable Rule objects.
 *
 * Usage:
 * ```typescript
 * const rule = new RuleBuilder()
 *   .id("RULE-TEST-001")
 *   .category("injection")
 *   .name("Test Rule")
 *   .description("A test rule")
 *   .condition({ type: "exists", field: "type" })
 *   .severityHint("high")
 *   .explanationTemplate("Match found: {{evidence}}")
 *   .build();
 * ```
 */
export class RuleBuilder implements IRuleBuilder {
  private _id: RuleId | undefined;
  private _category: RuleCategory | undefined;
  private _name: string | undefined;
  private _description: string | undefined;
  private _condition: RuleCondition | undefined;
  private _severityHint: RuleSeverityHint | undefined;
  private _explanationTemplate: string | undefined;
  private readonly _mitreTechniques: string[] = [];
  private readonly _references: string[] = [];
  private readonly _tags: string[] = [];
  private _built = false;

  /** Create a new RuleBuilder. */
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor() {
    // No-op
  }

  id(id: RuleId): IRuleBuilder {
    this.assertNotBuilt();
    this._id = id;
    return this;
  }

  category(category: RuleCategory): IRuleBuilder {
    this.assertNotBuilt();
    this._category = category;
    return this;
  }

  name(name: string): IRuleBuilder {
    this.assertNotBuilt();
    this._name = name;
    return this;
  }

  description(description: string): IRuleBuilder {
    this.assertNotBuilt();
    this._description = description;
    return this;
  }

  condition(condition: RuleCondition): IRuleBuilder {
    this.assertNotBuilt();
    this._condition = condition;
    return this;
  }

  severityHint(hint: RuleSeverityHint): IRuleBuilder {
    this.assertNotBuilt();
    this._severityHint = hint;
    return this;
  }

  explanationTemplate(template: string): IRuleBuilder {
    this.assertNotBuilt();
    this._explanationTemplate = template;
    return this;
  }

  mitreTechniques(...techniques: string[]): IRuleBuilder {
    this.assertNotBuilt();
    this._mitreTechniques.push(...techniques);
    return this;
  }

  references(...refs: string[]): IRuleBuilder {
    this.assertNotBuilt();
    this._references.push(...refs);
    return this;
  }

  tags(...tags: string[]): IRuleBuilder {
    this.assertNotBuilt();
    this._tags.push(...tags);
    return this;
  }

  /**
   * Build and freeze the rule.
   * Validates the rule before returning. Throws on validation failure.
   */
  build(): Rule {
    this.assertNotBuilt();
    this._built = true;

    const rule: Rule = {
      id: this.requireValue(this._id, 'id'),
      category: this.requireValue(this._category, 'category'),
      name: this.requireValue(this._name, 'name'),
      description: this.requireValue(this._description, 'description'),
      condition: this.requireValue(this._condition, 'condition'),
      severityHint: this.requireValue(this._severityHint, 'severityHint'),
      explanationTemplate: this.requireValue(this._explanationTemplate, 'explanationTemplate'),
      mitreTechniques: Object.freeze([...this._mitreTechniques]),
      references: Object.freeze([...this._references]),
      tags: Object.freeze([...this._tags]),
    };

    // Validate
    clearValidationState();
    const validation = validateRuleDefinition(rule);
    if (!validation.valid) {
      const msgs = validation.errors.map((e) => `[${e.code}] ${e.message}`).join('; ');
      throw new Error(`Rule validation failed for "${this._id}": ${msgs}`);
    }

    return Object.freeze(rule);
  }

  /**
   * Static factory: create a new RuleBuilder with common presets.
   */
  static create(): RuleBuilder {
    return new RuleBuilder();
  }

  /**
   * Create a Rule from a partial definition.
   * Useful for building rules from configuration data.
   */
  static fromDefinition(def: {
    id: RuleId;
    category: RuleCategory;
    name: string;
    description: string;
    condition: RuleCondition;
    severityHint: RuleSeverityHint;
    explanationTemplate: string;
    mitreTechniques?: readonly string[];
    references?: readonly string[];
    tags?: readonly string[];
  }): Rule {
    const builder = new RuleBuilder();
    builder.id(def.id);
    builder.category(def.category);
    builder.name(def.name);
    builder.description(def.description);
    builder.condition(def.condition);
    builder.severityHint(def.severityHint);
    builder.explanationTemplate(def.explanationTemplate);
    if (def.mitreTechniques) builder.mitreTechniques(...def.mitreTechniques);
    if (def.references) builder.references(...def.references);
    if (def.tags) builder.tags(...def.tags);
    return builder.build();
  }

  private assertNotBuilt(): void {
    if (this._built) {
      throw new Error('RuleBuilder: rule has already been built');
    }
  }

  private requireValue<T>(value: T | undefined, name: string): T {
    if (value === undefined) {
      throw new Error(`RuleBuilder: required field "${name}" was not set`);
    }
    return value;
  }
}
