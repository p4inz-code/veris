/**
 * CorrelationBuilder — deterministic, immutable correlation pattern construction with method chaining.
 *
 * @module @veris/correlation/correlation-builder
 */

import { validatePatternDefinition, clearValidationState } from './correlation-validator.js';
import type {
  CorrelationPattern,
  CorrelationCategory,
  CorrelationCondition,
  ICorrelationBuilder,
} from './types.js';

/**
 * Builder for constructing deterministic, immutable CorrelationPattern objects.
 *
 * Usage:
 * ```typescript
 * const pattern = new CorrelationBuilder()
 *   .id("CORR-INJECTION-001")
 *   .category("process-injection")
 *   .name("Process Injection Chain")
 *   .description("Correlates process injection evidence")
 *   .condition({ type: "rule_match", ruleIds: ["RULE-WIN-INJECTION-001"] })
 *   .explanationTemplate("Process injection chain detected: {{evidence}}")
 *   .build();
 * ```
 */
export class CorrelationBuilder implements ICorrelationBuilder {
  private _id: string | undefined;
  private _category: CorrelationCategory | undefined;
  private _name: string | undefined;
  private _description: string | undefined;
  private _condition: CorrelationCondition | undefined;
  private _explanationTemplate: string | undefined;
  private readonly _tags: string[] = [];
  private _built = false;

  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor() {
    // No-op
  }

  id(id: string): ICorrelationBuilder {
    this.assertNotBuilt();
    this._id = id;
    return this;
  }

  category(category: CorrelationCategory): ICorrelationBuilder {
    this.assertNotBuilt();
    this._category = category;
    return this;
  }

  name(name: string): ICorrelationBuilder {
    this.assertNotBuilt();
    this._name = name;
    return this;
  }

  description(description: string): ICorrelationBuilder {
    this.assertNotBuilt();
    this._description = description;
    return this;
  }

  condition(condition: CorrelationCondition): ICorrelationBuilder {
    this.assertNotBuilt();
    this._condition = condition;
    return this;
  }

  explanationTemplate(template: string): ICorrelationBuilder {
    this.assertNotBuilt();
    this._explanationTemplate = template;
    return this;
  }

  tags(...tags: string[]): ICorrelationBuilder {
    this.assertNotBuilt();
    this._tags.push(...tags);
    return this;
  }

  /**
   * Build and freeze the correlation pattern.
   * Validates the pattern before returning. Throws on validation failure.
   */
  build(): CorrelationPattern {
    this.assertNotBuilt();
    this._built = true;

    const pattern: CorrelationPattern = {
      id: this.requireValue(this._id, 'id'),
      category: this.requireValue(this._category, 'category'),
      name: this.requireValue(this._name, 'name'),
      description: this.requireValue(this._description, 'description'),
      condition: this.requireValue(this._condition, 'condition'),
      explanationTemplate: this.requireValue(this._explanationTemplate, 'explanationTemplate'),
      tags: Object.freeze([...this._tags]),
    };

    // Validate
    clearValidationState();
    const validation = validatePatternDefinition(pattern);
    if (!validation.valid) {
      const msgs = validation.errors.map((e) => `[${e.code}] ${e.message}`).join('; ');
      throw new Error(`Pattern validation failed for "${this._id}": ${msgs}`);
    }

    return Object.freeze(pattern);
  }

  /**
   * Static factory.
   */
  static create(): CorrelationBuilder {
    return new CorrelationBuilder();
  }

  /**
   * Create a CorrelationPattern from a partial definition.
   */
  static fromDefinition(def: {
    id: string;
    category: CorrelationCategory;
    name: string;
    description: string;
    condition: CorrelationCondition;
    explanationTemplate: string;
    tags?: readonly string[];
  }): CorrelationPattern {
    const builder = new CorrelationBuilder();
    builder.id(def.id);
    builder.category(def.category);
    builder.name(def.name);
    builder.description(def.description);
    builder.condition(def.condition);
    builder.explanationTemplate(def.explanationTemplate);
    if (def.tags) builder.tags(...def.tags);
    return builder.build();
  }

  private assertNotBuilt(): void {
    if (this._built) {
      throw new Error('CorrelationBuilder: pattern has already been built');
    }
  }

  private requireValue<T>(value: T | undefined, name: string): T {
    if (value === undefined) {
      throw new Error(`CorrelationBuilder: required field "${name}" was not set`);
    }
    return value;
  }
}
