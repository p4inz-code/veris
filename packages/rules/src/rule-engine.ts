/**
 * RuleEngine — evaluates rules against Evidence, Features, and Capabilities.
 *
 * Pipeline:
 *   1. Receive Evidence, Features, Capabilities
 *   2. Evaluate Rules (from registry, ordered by priority)
 *   3. Produce RuleMatches
 *   4. Diagnostics
 *
 * @module @veris/rules/rule-engine
 */

import { evaluateCondition } from './condition-evaluator.js';
import type { ConditionMatchResult } from './condition-evaluator.js';
import type {
  Rule,
  RuleMatch,
  RuleEvaluation,
  RuleEngineResult,
  RuleEngineOptions,
  RuleEngineDiagnostics,
  RuleDiagnosticsEntry,
  EvaluationContext,
  IRuleRegistry,
} from './types.js';

/** Internal resolved options type (cancellationToken optional at default). */
interface RuleEngineResolvedOptions {
  readonly timeoutMs: number;
  readonly concurrency: number;
  readonly cancellationToken?: import('@veris/shared').CancellationToken;
}

/** Shared empty frozen array — avoids repeated `Object.freeze([])` allocations. */
const EMPTY_FROZEN_ARRAY: readonly never[] = Object.freeze([]);

/** Default rule engine options. */
const DEFAULT_OPTIONS: RuleEngineResolvedOptions = {
  timeoutMs: 5000,
  concurrency: 4,
  cancellationToken: undefined,
} as const;

/**
 * Immutable, deterministic rule engine for evaluating rules against input data.
 *
 * Features:
 * - Parallel evaluation with configurable concurrency
 * - Per-rule timeouts
 * - Cooperative cancellation
 * - Deterministic output ordering
 * - Immutable outputs
 */
export class RuleEngine {
  private readonly _registry: IRuleRegistry;
  private readonly _options: RuleEngineResolvedOptions;

  constructor(registry: IRuleRegistry, options?: RuleEngineOptions) {
    this._registry = registry;
    this._options = {
      timeoutMs: options?.timeoutMs ?? DEFAULT_OPTIONS.timeoutMs,
      concurrency: options?.concurrency ?? DEFAULT_OPTIONS.concurrency,
      cancellationToken: options?.cancellationToken ?? DEFAULT_OPTIONS.cancellationToken,
    };
  }

  /**
   * Evaluate all registered rules against the given context.
   * Returns immutable RuleEngineResult with matches and diagnostics.
   */
  async evaluate(context: EvaluationContext): Promise<RuleEngineResult> {
    return this.evaluateRules(this._registry.getAll(), context);
  }

  /**
   * Evaluate only specific rules against the given context.
   */
  async evaluateRules(
    rules: readonly Rule[],
    context: EvaluationContext,
  ): Promise<RuleEngineResult> {
    const startTime = Date.now();
    const totalRules = rules.length;

    // Check cancellation before starting
    this._checkCancelled();

    // Evaluate rules with concurrency control
    const evaluations = await this._evaluateWithConcurrency(rules, context);

    // Build matches
    const matches: RuleMatch[] = [];
    const perRule: RuleDiagnosticsEntry[] = [];

    for (const evalResult of evaluations) {
      perRule.push({
        ruleId: evalResult.ruleId,
        matched: evalResult.matched,
        durationMs: evalResult.durationMs,
        error: evalResult.error,
      });
      if (evalResult.matched && evalResult.match) {
        matches.push(evalResult.match);
      }
    }

    const totalDurationMs = Date.now() - startTime;
    const matchedRules = matches.length;
    const failedRules = evaluations.filter((e) => e.error).length;

    const diagnostics: RuleEngineDiagnostics = {
      totalRules,
      matchedRules,
      failedRules,
      totalDurationMs,
      perRule: Object.freeze(perRule),
    };

    return Object.freeze({
      evaluations: Object.freeze(evaluations),
      matches: Object.freeze(matches),
      diagnostics: Object.freeze(diagnostics),
    });
  }

  /**
   * Evaluate rules with concurrency control using a simple pool pattern.
   */
  private async _evaluateWithConcurrency(
    rules: readonly Rule[],
    context: EvaluationContext,
  ): Promise<readonly RuleEvaluation[]> {
    const results: RuleEvaluation[] = new Array(rules.length);
    let index = 0;

    const worker = async (): Promise<void> => {
      while (index < rules.length) {
        const i = index++;
        const rule = rules[i];
        results[i] = await this._evaluateSingleRule(rule, context);
      }
    };

    const concurrency = Math.min(this._options.concurrency, rules.length);
    if (concurrency <= 0) {
      return EMPTY_FROZEN_ARRAY;
    }

    const workers: Promise<void>[] = [];
    for (let w = 0; w < concurrency; w++) {
      workers.push(worker());
    }

    await Promise.all(workers);
    return Object.freeze(results);
  }

  /**
   * Evaluate a single rule against the context.
   * Handles timeouts and errors gracefully.
   */
  private async _evaluateSingleRule(
    rule: Rule,
    context: EvaluationContext,
  ): Promise<RuleEvaluation> {
    const ruleStartTime = Date.now();
    let durationMs = 0;

    try {
      // Check cancellation before each rule evaluation
      this._checkCancelled();

      // Evaluate with timeout
      const matchResult = await this._evaluateWithTimeout(rule, context);

      durationMs = Date.now() - ruleStartTime;

      if (!matchResult.matched) {
        return Object.freeze({
          ruleId: rule.id,
          matched: false,
          durationMs,
        });
      }

      // Build the RuleMatch
      const match = this._buildRuleMatch(rule, matchResult, context);

      return Object.freeze({
        ruleId: rule.id,
        matched: true,
        match,
        durationMs,
      });
    } catch (error) {
      durationMs = Date.now() - ruleStartTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      return Object.freeze({
        ruleId: rule.id,
        matched: false,
        durationMs,
        error: errorMessage,
      });
    }
  }

  /**
   * Evaluate a condition with a timeout.
   * The timer is always cleared via a finally block to prevent leaks.
   */
  private async _evaluateWithTimeout(
    rule: Rule,
    context: EvaluationContext,
  ): Promise<ConditionMatchResult> {
    if (this._options.timeoutMs <= 0) {
      // No timeout — evaluate synchronously
      return evaluateCondition(rule.condition, context);
    }

    // Use a shared variable to track the timer for cleanup in the finally block
    let timer: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Rule "${rule.id}" timed out after ${this._options.timeoutMs}ms`));
      }, this._options.timeoutMs);
    });

    const evaluationPromise = new Promise<ConditionMatchResult>((resolve, reject) => {
      queueMicrotask(() => {
        try {
          resolve(evaluateCondition(rule.condition, context));
        } catch (error) {
          reject(error);
        }
      });
    });

    try {
      return await Promise.race([evaluationPromise, timeoutPromise]);
    } finally {
      // Ensure timer is always cleared — prevents leaked timers and retained closures
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  /**
   * Build a RuleMatch from a successful condition evaluation.
   */
  private _buildRuleMatch(
    rule: Rule,
    matchResult: ConditionMatchResult,
    context: EvaluationContext,
  ): RuleMatch {
    const evidenceIds = [...matchResult.matchedEvidenceIds];
    const featureIds = [...matchResult.matchedFeatureIds];
    const capabilityIds = [...matchResult.matchedCapabilityIds];

    // Build explanation from template
    const explanation = this._fillExplanationTemplate(rule.explanationTemplate, {
      evidence: evidenceIds,
      features: featureIds,
      capabilities: capabilityIds,
    });

    return Object.freeze({
      ruleId: rule.id,
      title: rule.name,
      description: rule.description,
      matchedEvidenceIds: Object.freeze(evidenceIds),
      matchedFeatureIds: Object.freeze(featureIds),
      matchedCapabilityIds: Object.freeze(capabilityIds),
      explanation,
      confidenceContribution: this._calculateConfidenceContribution(matchResult, context),
      references: rule.references,
      mitreTechniques: rule.mitreTechniques,
    });
  }

  /**
   * Fill explanation template with matched IDs.
   * Supports {{evidence}}, {{features}}, {{capabilities}} placeholders.
   */
  private _fillExplanationTemplate(
    template: string,
    ids: { evidence: string[]; features: string[]; capabilities: string[] },
  ): string {
    let result = template;
    result = result.replace(/\{\{evidence\}\}/g, ids.evidence.join(', '));
    result = result.replace(/\{\{features\}\}/g, ids.features.join(', '));
    result = result.replace(/\{\{capabilities\}\}/g, ids.capabilities.join(', '));
    return result;
  }

  /**
   * Calculate confidence contribution from matched items.
   * Uses a simple average of the matched items' confidence values.
   */
  private _calculateConfidenceContribution(
    matchResult: ConditionMatchResult,
    context: EvaluationContext,
  ): number {
    const confidences: number[] = [];

    // Build lookup maps from the original context
    const evMap = new Map(context.evidence.map((e) => [e.id, e.confidence]));
    const featMap = new Map(context.features.map((f) => [f.id, f.confidence]));
    const capMap = new Map(context.capabilities.map((c) => [c.id, c.confidence]));

    for (const id of matchResult.matchedEvidenceIds) {
      const conf = evMap.get(id);
      if (conf !== undefined) confidences.push(conf);
    }
    for (const id of matchResult.matchedFeatureIds) {
      const conf = featMap.get(id);
      if (conf !== undefined) confidences.push(conf);
    }
    for (const id of matchResult.matchedCapabilityIds) {
      const conf = capMap.get(id);
      if (conf !== undefined) confidences.push(conf);
    }

    if (confidences.length === 0) return 0;

    // Use the average confidence
    const avg = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    // Round to 2 decimal places
    return Math.round(avg * 100) / 100;
  }

  /**
   * Check if cancelled — throws if the cancellation token has been triggered.
   */
  private _checkCancelled(): void {
    if (this._options.cancellationToken) {
      this._options.cancellationToken.throwIfCancelled();
    }
  }
}
