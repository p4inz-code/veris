/**
 * RuleRegistry — priority-ordered registry for rule storage, lookup, and versioning.
 *
 * @module @veris/rules/rule-registry
 */

import { validateRuleDefinition, clearValidationState } from './rule-validator.js';
import type { Rule, RuleId, RuleCategory, IRuleRegistry } from './types.js';

/** Category priority ordering (lower = higher priority). */
const CATEGORY_ORDER: Record<RuleCategory, number> = {
  injection: 0,
  persistence: 1,
  execution: 2,
  'privilege-escalation': 3,
  'defense-evasion': 4,
  'credential-access': 5,
  discovery: 6,
  exfiltration: 7,
  container: 8,
  obfuscation: 9,
  'supply-chain': 10,
  configuration: 11,
  'best-practice': 12,
};

/**
 * Priority-ordered rule registry.
 *
 * Supports:
 * - register() / unregister() / lookup()
 * - Priority ordering by category
 * - Built-in + custom rules
 * - Validation on registration
 * - Immutable outputs
 */
export class RuleRegistry implements IRuleRegistry {
  private readonly _rules = new Map<RuleId, Rule>();
  private _dirty = true;
  private _orderedCache: readonly Rule[] = Object.freeze([]);

  /**
   * Register one or more rules.
   * Validates each rule before registering. Throws on invalid rules.
   */
  register(...rules: Rule[]): void {
    for (const rule of rules) {
      // Validate the rule
      clearValidationState();
      const validation = validateRuleDefinition(rule);

      // Check for duplicate IDs in this registry
      if (this._rules.has(rule.id)) {
        throw new Error(
          `RuleRegistry: duplicate rule ID "${rule.id}" — a rule with this ID is already registered`,
        );
      }

      if (!validation.valid) {
        const msgs = validation.errors.map((e) => `[${e.code}] ${e.message}`).join('; ');
        throw new Error(`RuleRegistry: invalid rule "${rule.id}": ${msgs}`);
      }

      this._rules.set(rule.id, rule);
      this._dirty = true;
    }
  }

  /**
   * Unregister a rule by ID.
   * Returns true if the rule was found and removed.
   */
  unregister(ruleId: RuleId): boolean {
    const removed = this._rules.delete(ruleId);
    if (removed) {
      this._dirty = true;
    }
    return removed;
  }

  /**
   * Look up a rule by ID.
   */
  lookup(ruleId: RuleId): Rule | undefined {
    return this._rules.get(ruleId);
  }

  /**
   * Get all registered rules, ordered by category priority then ID.
   */
  getAll(): readonly Rule[] {
    this._maybeRebuildCache();
    return this._orderedCache;
  }

  /**
   * Get all rules in a specific category.
   */
  getByCategory(category: RuleCategory): readonly Rule[] {
    return Object.freeze(this.getAll().filter((r) => r.category === category));
  }

  /**
   * Get the total number of registered rules.
   */
  get size(): number {
    return this._rules.size;
  }

  /**
   * Clear all registered rules.
   */
  clear(): void {
    this._rules.clear();
    this._dirty = true;
    this._orderedCache = Object.freeze([]);
  }

  /**
   * Check if a rule is registered.
   */
  has(ruleId: RuleId): boolean {
    return this._rules.has(ruleId);
  }

  /**
   * Get all rule IDs.
   */
  get ids(): readonly RuleId[] {
    return Object.freeze([...this._rules.keys()]);
  }

  /**
   * Rebuild the ordered cache if the registry is dirty.
   */
  private _maybeRebuildCache(): void {
    if (!this._dirty) return;
    this._dirty = false;

    const sorted = [...this._rules.values()].sort((a, b) => {
      // First by category priority
      const catOrderA = CATEGORY_ORDER[a.category] ?? 99;
      const catOrderB = CATEGORY_ORDER[b.category] ?? 99;
      if (catOrderA !== catOrderB) return catOrderA - catOrderB;
      // Then by ID for deterministic ordering
      return a.id.localeCompare(b.id);
    });

    this._orderedCache = Object.freeze(sorted);
  }
}
