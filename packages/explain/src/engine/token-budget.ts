/**
 * TokenBudget — Manages context window budget for LLM prompts.
 *
 * This is a fully deterministic module that estimates token usage,
 * prioritizes context components, and allocates budget accordingly.
 *
 * @module @veris/explain/engine/token-budget
 */

import type { ExplainedContext, ContextTokenBudget } from '../types/context.js';

// ── Token Budget Types ──

/** A single budget allocation entry for audit logging. */
export interface BudgetEntry {
  readonly component: string;
  readonly allocatedTokens: number;
  readonly usedTokens: number;
  readonly trimmed: boolean;
  readonly itemCount: number;
}

/** Full budget report including truncation decisions. */
export interface BudgetReport {
  readonly totalBudget: number;
  readonly totalUsed: number;
  readonly totalRemaining: number;
  readonly entries: readonly BudgetEntry[];
}

// ── TokenEstimator ──

/**
 * Estimates token usage for text content.
 *
 * Uses a simple heuristic: ~4 characters per token for English text.
 * This is a rough estimate and will be refined per-model in M5.
 */
export interface TokenEstimator {
  /** Estimate the number of tokens in a text string. */
  estimate(text: string): number;
  /** Estimate tokens for a structured object (JSON-serialized). */
  estimateObject(obj: Record<string, unknown>): number;
}

// ── TokenBudget Interface ──

/**
 * Manages the context window budget.
 *
 * Responsibilities:
 * - Estimates token usage for each context component
 * - Prioritizes components by relevance category
 * - Trims components when budget is exceeded
 * - Returns a budget report for audit logging
 */
export interface TokenBudget {
  /**
   * Allocate token budget for a given context.
   *
   * Priority ordering (highest to lowest):
   * 1. System prompt (always included, never trimmed)
   * 2. Output format instructions (always included, never trimmed)
   * 3. Finding context (always included, never trimmed)
   * 4. Evidence list (trimmed by confidence DESC)
   * 5. Rule context (trimmed after evidence)
   * 6. Artifact context (trimmed after rule)
   * 7. Risk context (trimmed after artifact)
   *
   * @param context - The explained context to allocate budget for.
   * @param maxTokens - Maximum total tokens available.
   * @returns Budget allocation with remaining tokens.
   */
  allocate(context: ExplainedContext, maxTokens: number): ContextTokenBudget;

  /**
   * Get a detailed budget report, including truncation decisions.
   * Useful for audit logging and debugging.
   *
   * @param context - The explained context.
   * @param maxTokens - Maximum total tokens available.
   * @returns Detailed budget report.
   */
  getReport(context: ExplainedContext, maxTokens: number): BudgetReport;
}

// ── Default TokenEstimator ──

/** Default characters-per-token ratio. */
const CHARS_PER_TOKEN = 4;

/**
 * Default token estimator using character count heuristic.
 */
export function createTokenEstimator(): TokenEstimator {
  return {
    estimate(text: string): number {
      return Math.ceil(text.length / CHARS_PER_TOKEN);
    },

    estimateObject(obj: Record<string, unknown>): number {
      return Math.ceil(JSON.stringify(obj).length / CHARS_PER_TOKEN);
    },
  };
}

// ── Default TokenBudget ──

/** Default token budget component allocations. */
const DEFAULT_ALLOCATIONS: Record<string, { priority: number; reserved: number }> = {
  systemPrompt: { priority: 0, reserved: 500 },
  formatInstructions: { priority: 1, reserved: 200 },
  findingContext: { priority: 2, reserved: 500 },
  evidenceList: { priority: 3, reserved: 1500 },
  ruleContext: { priority: 4, reserved: 500 },
  artifactContext: { priority: 5, reserved: 150 },
  riskContext: { priority: 6, reserved: 300 },
};

/** Reserved for output tokens as fraction of total. */
const OUTPUT_RESERVE_FRACTION = 0.27;

/**
 * Default TokenBudget implementation.
 *
 * Allocation algorithm:
 * 1. Reserve fraction for output tokens
 * 2. Allocate never-trimmed components (system prompt, format, finding context)
 * 3. Allocate trimmed components in priority order
 * 4. Within each component, trim by the component's rules
 */
export function createTokenBudget(estimator?: TokenEstimator): TokenBudget {
  const tokenEstimator = estimator ?? createTokenEstimator();

  return {
    allocate(context: ExplainedContext, maxTokens: number): ContextTokenBudget {
      const outputBudget = Math.floor(maxTokens * OUTPUT_RESERVE_FRACTION);
      const promptBudget = maxTokens - outputBudget;

      // Allocate never-trimmed components
      let used = 0;
      used += Math.min(DEFAULT_ALLOCATIONS.systemPrompt.reserved, promptBudget);
      used += Math.min(DEFAULT_ALLOCATIONS.formatInstructions.reserved, promptBudget - used);
      used += Math.min(DEFAULT_ALLOCATIONS.findingContext.reserved, promptBudget - used);

      // Allocate evidence (priority 3)
      const evidenceBudget = Math.min(
        DEFAULT_ALLOCATIONS.evidenceList.reserved,
        promptBudget - used,
      );
      used += Math.max(0, evidenceBudget);

      // Allocate remaining components in priority order
      const remaining = promptBudget - used;
      const trimmedComponents = ['ruleContext', 'artifactContext', 'riskContext'];
      for (const comp of trimmedComponents) {
        const alloc = DEFAULT_ALLOCATIONS[comp];
        const componentBudget = Math.min(
          alloc.reserved,
          remaining - (used - (promptBudget - remaining)),
        );
        used += Math.max(0, componentBudget);
      }

      return {
        allocated: promptBudget,
        used: Math.min(used, promptBudget),
        remaining: Math.max(0, promptBudget - used),
      };
    },

    getReport(context: ExplainedContext, maxTokens: number): BudgetReport {
      const budget = this.allocate(context, maxTokens);
      return {
        totalBudget: maxTokens,
        totalUsed: budget.used,
        totalRemaining: budget.remaining,
        entries: [
          {
            component: 'systemPrompt',
            allocatedTokens: DEFAULT_ALLOCATIONS.systemPrompt.reserved,
            usedTokens: Math.min(DEFAULT_ALLOCATIONS.systemPrompt.reserved, budget.allocated),
            trimmed: false,
            itemCount: 1,
          },
          {
            component: 'evidenceList',
            allocatedTokens: DEFAULT_ALLOCATIONS.evidenceList.reserved,
            usedTokens: Math.min(
              DEFAULT_ALLOCATIONS.evidenceList.reserved,
              Math.max(0, budget.used - 700),
            ),
            trimmed: context.evidence.length > 10,
            itemCount: context.evidence.length,
          },
          {
            component: 'ruleContext',
            allocatedTokens: DEFAULT_ALLOCATIONS.ruleContext.reserved,
            usedTokens: context.rule ? DEFAULT_ALLOCATIONS.ruleContext.reserved : 0,
            trimmed: false,
            itemCount: context.rule ? 1 : 0,
          },
          {
            component: 'artifactContext',
            allocatedTokens: DEFAULT_ALLOCATIONS.artifactContext.reserved,
            usedTokens: context.artifact ? DEFAULT_ALLOCATIONS.artifactContext.reserved : 0,
            trimmed: false,
            itemCount: context.artifact ? 1 : 0,
          },
          {
            component: 'riskContext',
            allocatedTokens: DEFAULT_ALLOCATIONS.riskContext.reserved,
            usedTokens: context.risk ? DEFAULT_ALLOCATIONS.riskContext.reserved : 0,
            trimmed: false,
            itemCount: context.risk ? 1 : 0,
          },
        ],
      };
    },
  };
}
