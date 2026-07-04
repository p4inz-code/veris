/**
 * CorrelationEngine — correlates related evidence into deterministic behavioral chains.
 *
 * Pipeline:
 *   1. Receive RuleMatches + Evidence + Features + Capabilities
 *   2. Evaluate Correlation Patterns (from registry)
 *   3. Produce Correlations (behavioral chains)
 *   4. Diagnostics
 *
 * @module @veris/correlation/correlation-engine
 */

import { deterministicId } from '@veris/shared';

import type {
  CorrelationPattern,
  Correlation,
  CorrelationId,
  CorrelationEvaluation,
  CorrelationEngineResult,
  CorrelationEngineOptions,
  CorrelationEngineDiagnostics,
  CorrelationDiagnosticsEntry,
  CorrelationContext,
  CorrelationCondition,
  EvidenceRef,
  FeatureRef,
  CapabilityRef,
  CorrelationProvenance,
  ICorrelationRegistry,
} from './types.js';

/** Internal resolved options type (cancellationToken optional at default). */
interface CorrelationEngineResolvedOptions {
  readonly timeoutMs: number;
  readonly concurrency: number;
  readonly cancellationToken?: import('@veris/shared').CancellationToken;
}

/** Shared empty frozen array — avoids repeated `Object.freeze([])` allocations. */
const EMPTY_FROZEN_ARRAY: readonly never[] = Object.freeze([]);

/** Default engine options. */
const DEFAULT_OPTIONS: CorrelationEngineResolvedOptions = {
  timeoutMs: 5000,
  concurrency: 4,
  cancellationToken: undefined,
} as const;

/** Current engine version. */
const ENGINE_VERSION = '0.1.0';

/**
 * Correlation engine that produces deterministic behavioral chains
 * from related evidence, rule matches, features, and capabilities.
 */
export class CorrelationEngine {
  private readonly _registry: ICorrelationRegistry;
  private readonly _options: CorrelationEngineResolvedOptions;

  constructor(registry: ICorrelationRegistry, options?: CorrelationEngineOptions) {
    this._registry = registry;
    this._options = {
      timeoutMs: options?.timeoutMs ?? DEFAULT_OPTIONS.timeoutMs,
      concurrency: options?.concurrency ?? DEFAULT_OPTIONS.concurrency,
      cancellationToken: options?.cancellationToken ?? DEFAULT_OPTIONS.cancellationToken,
    };
  }

  /**
   * Evaluate all registered patterns against the given context.
   */
  async evaluate(context: CorrelationContext): Promise<CorrelationEngineResult> {
    return this.evaluatePatterns(this._registry.getAll(), context);
  }

  /**
   * Evaluate only specific patterns.
   */
  async evaluatePatterns(
    patterns: readonly CorrelationPattern[],
    context: CorrelationContext,
  ): Promise<CorrelationEngineResult> {
    const startTime = Date.now();
    const totalPatterns = patterns.length;

    this._checkCancelled();

    const evaluations = await this._evaluateWithConcurrency(patterns, context);

    const correlations: Correlation[] = [];
    const perPattern: CorrelationDiagnosticsEntry[] = [];

    for (const evalResult of evaluations) {
      perPattern.push({
        patternId: evalResult.patternId,
        matched: evalResult.matched,
        durationMs: evalResult.durationMs,
        error: evalResult.error,
      });
      if (evalResult.matched && evalResult.correlation) {
        correlations.push(evalResult.correlation);
      }
    }

    const totalDurationMs = Date.now() - startTime;
    const matchedPatterns = correlations.length;
    const failedPatterns = evaluations.filter((e) => e.error).length;

    const diagnostics: CorrelationEngineDiagnostics = {
      totalPatterns,
      matchedPatterns,
      failedPatterns,
      totalDurationMs,
      perPattern: Object.freeze(perPattern),
    };

    return Object.freeze({
      evaluations: Object.freeze(evaluations),
      correlations: Object.freeze(correlations),
      diagnostics: Object.freeze(diagnostics),
    });
  }

  private async _evaluateWithConcurrency(
    patterns: readonly CorrelationPattern[],
    context: CorrelationContext,
  ): Promise<readonly CorrelationEvaluation[]> {
    const results: CorrelationEvaluation[] = new Array(patterns.length);
    let index = 0;

    const worker = async (): Promise<void> => {
      while (index < patterns.length) {
        const i = index++;
        const pattern = patterns[i];
        results[i] = await this._evaluateSinglePattern(pattern, context);
      }
    };

    const concurrency = Math.min(this._options.concurrency, patterns.length);
    if (concurrency <= 0) return EMPTY_FROZEN_ARRAY;

    const workers: Promise<void>[] = [];
    for (let w = 0; w < concurrency; w++) {
      workers.push(worker());
    }
    await Promise.all(workers);
    return Object.freeze(results);
  }

  private async _evaluateSinglePattern(
    pattern: CorrelationPattern,
    context: CorrelationContext,
  ): Promise<CorrelationEvaluation> {
    const patternStartTime = Date.now();
    let durationMs = 0;

    try {
      this._checkCancelled();

      const matchResult = await this._evaluateWithTimeout(pattern, context);
      durationMs = Date.now() - patternStartTime;

      if (!matchResult.matched) {
        return Object.freeze({
          patternId: pattern.id,
          matched: false,
          durationMs,
        });
      }

      const correlation = this._buildCorrelation(pattern, matchResult, context);
      return Object.freeze({
        patternId: pattern.id,
        matched: true,
        correlation,
        durationMs,
      });
    } catch (error) {
      durationMs = Date.now() - patternStartTime;
      return Object.freeze({
        patternId: pattern.id,
        matched: false,
        durationMs,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async _evaluateWithTimeout(
    pattern: CorrelationPattern,
    context: CorrelationContext,
  ): Promise<CorrelationMatchResult> {
    if (this._options.timeoutMs <= 0) {
      return evaluateCorrelationCondition(pattern.condition, context);
    }

    // Use a shared variable to track the timer for cleanup in the finally block
    let timer: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Pattern "${pattern.id}" timed out after ${this._options.timeoutMs}ms`));
      }, this._options.timeoutMs);
    });

    const evaluationPromise = new Promise<CorrelationMatchResult>((resolve, reject) => {
      queueMicrotask(() => {
        try {
          resolve(evaluateCorrelationCondition(pattern.condition, context));
        } catch (error) {
          reject(error);
        }
      });
    });

    try {
      return await Promise.race([evaluationPromise, timeoutPromise]);
    } finally {
      // Ensure timer is always cleared — prevents leaked timers
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  private _buildCorrelation(
    pattern: CorrelationPattern,
    matchResult: CorrelationMatchResult,
    context: CorrelationContext,
  ): Correlation {
    const evidenceIds = [...new Set(matchResult.matchedEvidenceIds)];
    const featureIds = [...new Set(matchResult.matchedFeatureIds)];
    const capabilityIds = [...new Set(matchResult.matchedCapabilityIds)];
    const ruleIds = [...new Set(matchResult.matchedRuleIds)];

    // Collect unique artifact IDs from matched evidence
    const artifactIds = [
      ...new Set(
        context.evidence.filter((e) => evidenceIds.includes(e.id)).map((e) => e.artifactId),
      ),
    ];

    // Build explanation from template
    const explanation = this._fillExplanationTemplate(pattern.explanationTemplate, {
      evidence: evidenceIds,
      features: featureIds,
      capabilities: capabilityIds,
      rules: ruleIds,
    });

    // Calculate confidence — inherited ONLY from supporting evidence
    const confidence = this._calculateConfidence(evidenceIds, context.evidence);

    // Generate deterministic ID
    const idInput = `${pattern.id}\0${evidenceIds.sort().join(',')}\0${ruleIds.sort().join(',')}`;
    const id = deterministicId('corr', idInput) as CorrelationId;

    const provenance: CorrelationProvenance = Object.freeze({
      patternId: pattern.id,
      createdAt: new Date().toISOString(),
      engineVersion: ENGINE_VERSION,
      durationMs: 0, // Filled in by the evaluation
    });

    return Object.freeze({
      id,
      category: pattern.category,
      title: pattern.name,
      description: pattern.description,
      explanation,
      evidenceIds: Object.freeze(evidenceIds),
      featureIds: Object.freeze(featureIds),
      capabilityIds: Object.freeze(capabilityIds),
      ruleIds: Object.freeze(ruleIds),
      artifactIds: Object.freeze(artifactIds),
      confidence: Math.round(confidence * 100) / 100,
      provenance,
    });
  }

  private _fillExplanationTemplate(
    template: string,
    ids: { evidence: string[]; features: string[]; capabilities: string[]; rules: string[] },
  ): string {
    let result = template;
    result = result.replace(/\{\{evidence\}\}/g, ids.evidence.join(', '));
    result = result.replace(/\{\{features\}\}/g, ids.features.join(', '));
    result = result.replace(/\{\{capabilities\}\}/g, ids.capabilities.join(', '));
    result = result.replace(/\{\{rules\}\}/g, ids.rules.join(', '));
    return result;
  }

  /**
   * Calculate confidence from supporting evidence only.
   * Uses average — never invents confidence.
   */
  private _calculateConfidence(
    evidenceIds: readonly string[],
    allEvidence: readonly EvidenceRef[],
  ): number {
    if (evidenceIds.length === 0) return 0;

    const evMap = new Map(allEvidence.map((e) => [e.id, e.confidence]));
    const confidences: number[] = [];

    for (const id of evidenceIds) {
      const conf = evMap.get(id);
      if (conf !== undefined) confidences.push(conf);
    }

    if (confidences.length === 0) return 0;

    const avg = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    return Math.round(avg * 100) / 100;
  }

  private _checkCancelled(): void {
    if (this._options.cancellationToken) {
      this._options.cancellationToken.throwIfCancelled();
    }
  }
}

// ── Condition Evaluation ──

interface CorrelationMatchResult {
  readonly matched: boolean;
  readonly matchedEvidenceIds: readonly string[];
  readonly matchedFeatureIds: readonly string[];
  readonly matchedCapabilityIds: readonly string[];
  readonly matchedRuleIds: readonly string[];
}

const EMPTY_MATCH: CorrelationMatchResult = Object.freeze({
  matched: false,
  matchedEvidenceIds: Object.freeze([]),
  matchedFeatureIds: Object.freeze([]),
  matchedCapabilityIds: Object.freeze([]),
  matchedRuleIds: Object.freeze([]),
});

/**
 * Evaluate a correlation condition against the context.
 */
function evaluateCorrelationCondition(
  condition: CorrelationCondition,
  context: CorrelationContext,
): CorrelationMatchResult {
  return evaluateConditionRecursive(condition, context, 0);
}

function evaluateConditionRecursive(
  condition: CorrelationCondition,
  context: CorrelationContext,
  depth: number,
): CorrelationMatchResult {
  if (depth > 100) return EMPTY_MATCH;

  switch (condition.type) {
    // ── Logical ──

    case 'and': {
      const allEv: string[] = [];
      const allFeat: string[] = [];
      const allCap: string[] = [];
      const allRules: string[] = [];

      for (const sub of condition.conditions) {
        const r = evaluateConditionRecursive(sub, context, depth + 1);
        if (!r.matched) return EMPTY_MATCH;
        allEv.push(...r.matchedEvidenceIds);
        allFeat.push(...r.matchedFeatureIds);
        allCap.push(...r.matchedCapabilityIds);
        allRules.push(...r.matchedRuleIds);
      }

      return Object.freeze({
        matched: true,
        matchedEvidenceIds: Object.freeze([...new Set(allEv)]),
        matchedFeatureIds: Object.freeze([...new Set(allFeat)]),
        matchedCapabilityIds: Object.freeze([...new Set(allCap)]),
        matchedRuleIds: Object.freeze([...new Set(allRules)]),
      });
    }

    case 'or': {
      const allEv: string[] = [];
      const allFeat: string[] = [];
      const allCap: string[] = [];
      const allRules: string[] = [];
      let anyMatched = false;

      for (const sub of condition.conditions) {
        const r = evaluateConditionRecursive(sub, context, depth + 1);
        if (r.matched) {
          anyMatched = true;
          allEv.push(...r.matchedEvidenceIds);
          allFeat.push(...r.matchedFeatureIds);
          allCap.push(...r.matchedCapabilityIds);
          allRules.push(...r.matchedRuleIds);
        }
      }

      if (!anyMatched) return EMPTY_MATCH;

      return Object.freeze({
        matched: true,
        matchedEvidenceIds: Object.freeze([...new Set(allEv)]),
        matchedFeatureIds: Object.freeze([...new Set(allFeat)]),
        matchedCapabilityIds: Object.freeze([...new Set(allCap)]),
        matchedRuleIds: Object.freeze([...new Set(allRules)]),
      });
    }

    case 'not': {
      const r = evaluateConditionRecursive(condition.condition, context, depth + 1);
      if (r.matched) return EMPTY_MATCH;
      // NOT matched — return all items
      return Object.freeze({
        matched: true,
        matchedEvidenceIds: Object.freeze(context.evidence.map((e) => e.id)),
        matchedFeatureIds: Object.freeze(context.features.map((f) => f.id)),
        matchedCapabilityIds: Object.freeze(context.capabilities.map((c) => c.id)),
        matchedRuleIds: Object.freeze(context.ruleMatches.map((rm) => rm.ruleId)),
      });
    }

    // ── Rule Reference ──

    case 'rule_match': {
      const matchedRuleIds = context.ruleMatches
        .filter((rm) => condition.ruleIds.includes(rm.ruleId))
        .map((rm) => rm.ruleId);

      if (matchedRuleIds.length === 0) return EMPTY_MATCH;

      // Collect all evidence/feature/capability from matched rule matches
      const evidenceIds: string[] = [];
      const featureIds: string[] = [];
      const capabilityIds: string[] = [];

      for (const rm of context.ruleMatches) {
        if (condition.ruleIds.includes(rm.ruleId)) {
          evidenceIds.push(...rm.matchedEvidenceIds);
          featureIds.push(...rm.matchedFeatureIds);
          capabilityIds.push(...rm.matchedCapabilityIds);
        }
      }

      return Object.freeze({
        matched: true,
        matchedEvidenceIds: Object.freeze([...new Set(evidenceIds)]),
        matchedFeatureIds: Object.freeze([...new Set(featureIds)]),
        matchedCapabilityIds: Object.freeze([...new Set(capabilityIds)]),
        matchedRuleIds: Object.freeze([...new Set(matchedRuleIds)]),
      });
    }

    case 'any_rule_match': {
      const filtered = context.ruleMatches;

      if (filtered.length === 0) return EMPTY_MATCH;

      const evidenceIds = filtered.flatMap((rm) => [...rm.matchedEvidenceIds]);
      const featureIds = filtered.flatMap((rm) => [...rm.matchedFeatureIds]);
      const capabilityIds = filtered.flatMap((rm) => [...rm.matchedCapabilityIds]);
      const ruleIds = filtered.map((rm) => rm.ruleId);

      return Object.freeze({
        matched: true,
        matchedEvidenceIds: Object.freeze([...new Set(evidenceIds)]),
        matchedFeatureIds: Object.freeze([...new Set(featureIds)]),
        matchedCapabilityIds: Object.freeze([...new Set(capabilityIds)]),
        matchedRuleIds: Object.freeze([...new Set(ruleIds)]),
      });
    }

    // ── Evidence ──

    case 'evidence_type': {
      const ids = context.evidence
        .filter((e) => condition.evidenceTypes.some((t) => e.type === t || e.type.startsWith(t)))
        .map((e) => e.id);
      if (ids.length === 0) return EMPTY_MATCH;
      return Object.freeze({
        matched: true,
        matchedEvidenceIds: Object.freeze(ids),
        matchedFeatureIds: Object.freeze([]),
        matchedCapabilityIds: Object.freeze([]),
        matchedRuleIds: Object.freeze([]),
      });
    }

    case 'evidence_category': {
      const ids = context.evidence
        .filter((e): e is EvidenceRef & { category: string } =>
          condition.categories.includes(e.category),
        )
        .map((e) => e.id);
      if (ids.length === 0) return EMPTY_MATCH;
      return Object.freeze({
        matched: true,
        matchedEvidenceIds: Object.freeze(ids),
        matchedFeatureIds: Object.freeze([]),
        matchedCapabilityIds: Object.freeze([]),
        matchedRuleIds: Object.freeze([]),
      });
    }

    case 'evidence_artifact': {
      const ids = context.evidence
        .filter((e) => e.artifactId === condition.artifactId)
        .map((e) => e.id);
      if (ids.length === 0) return EMPTY_MATCH;
      return Object.freeze({
        matched: true,
        matchedEvidenceIds: Object.freeze(ids),
        matchedFeatureIds: Object.freeze([]),
        matchedCapabilityIds: Object.freeze([]),
        matchedRuleIds: Object.freeze([]),
      });
    }

    // ── Features ──

    case 'feature_type': {
      const ids = context.features
        .filter((f) => condition.featureTypes.some((t) => f.type === t || f.type.startsWith(t)))
        .map((f) => f.id);
      if (ids.length === 0) return EMPTY_MATCH;
      return Object.freeze({
        matched: true,
        matchedEvidenceIds: Object.freeze([]),
        matchedFeatureIds: Object.freeze(ids),
        matchedCapabilityIds: Object.freeze([]),
        matchedRuleIds: Object.freeze([]),
      });
    }

    // ── Capabilities ──

    case 'capability_type': {
      const ids = context.capabilities
        .filter((c) => condition.capabilityTypes.some((t) => c.type === t || c.type.startsWith(t)))
        .map((c) => c.id);
      if (ids.length === 0) return EMPTY_MATCH;
      return Object.freeze({
        matched: true,
        matchedEvidenceIds: Object.freeze([]),
        matchedFeatureIds: Object.freeze([]),
        matchedCapabilityIds: Object.freeze(ids),
        matchedRuleIds: Object.freeze([]),
      });
    }

    // ── Count ──

    case 'minimum_count': {
      const count = countField(condition.field, context);
      if (count >= condition.count) {
        return matchedAll(context);
      }
      return EMPTY_MATCH;
    }

    case 'maximum_count': {
      const count = countField(condition.field, context);
      if (count <= condition.count) {
        return matchedAll(context);
      }
      return EMPTY_MATCH;
    }

    // ── Relationship ──

    case 'shared_artifact': {
      // Find evidence that shares artifact IDs
      const artifactGroups = new Map<string, string[]>();
      for (const ev of context.evidence) {
        const existing = artifactGroups.get(ev.artifactId) ?? [];
        existing.push(ev.id);
        artifactGroups.set(ev.artifactId, existing);
      }

      const minEvidence = condition.minEvidence ?? 2;
      const evidenceIds: string[] = [];

      for (const [, ids] of artifactGroups) {
        if (ids.length >= minEvidence) {
          evidenceIds.push(...ids);
        }
      }

      if (evidenceIds.length === 0) return EMPTY_MATCH;

      return Object.freeze({
        matched: true,
        matchedEvidenceIds: Object.freeze([...new Set(evidenceIds)]),
        matchedFeatureIds: Object.freeze([]),
        matchedCapabilityIds: Object.freeze([]),
        matchedRuleIds: Object.freeze(context.ruleMatches.map((rm) => rm.ruleId)),
      });
    }

    case 'shared_artifact_type': {
      const ids = context.evidence
        .filter((e) => e.artifactType === condition.artifactType)
        .map((e) => e.id);
      if (ids.length === 0) return EMPTY_MATCH;
      return Object.freeze({
        matched: true,
        matchedEvidenceIds: Object.freeze(ids),
        matchedFeatureIds: Object.freeze([]),
        matchedCapabilityIds: Object.freeze([]),
        matchedRuleIds: Object.freeze([]),
      });
    }

    // ── Confidence ──

    case 'confidence_threshold': {
      const ids = context.evidence
        .filter((e) => e.confidence >= condition.threshold)
        .map((e) => e.id);
      if (ids.length > 0) {
        return Object.freeze({
          matched: true,
          matchedEvidenceIds: Object.freeze(ids),
          matchedFeatureIds: Object.freeze([]),
          matchedCapabilityIds: Object.freeze([]),
          matchedRuleIds: Object.freeze(context.ruleMatches.map((rm) => rm.ruleId)),
        });
      }
      return EMPTY_MATCH;
    }

    default:
      return EMPTY_MATCH;
  }
}

// ── Helpers ──

function countField(field: string, context: CorrelationContext): number {
  switch (field) {
    case 'evidence':
      return context.evidence.length;
    case 'features':
      return context.features.length;
    case 'capabilities':
      return context.capabilities.length;
    case 'rule_matches':
      return context.ruleMatches.length;
    default:
      return 0;
  }
}

function matchedAll(context: CorrelationContext): CorrelationMatchResult {
  return Object.freeze({
    matched: true,
    matchedEvidenceIds: Object.freeze(context.evidence.map((e) => e.id)),
    matchedFeatureIds: Object.freeze(context.features.map((f) => f.id)),
    matchedCapabilityIds: Object.freeze(context.capabilities.map((c) => c.id)),
    matchedRuleIds: Object.freeze(context.ruleMatches.map((rm) => rm.ruleId)),
  });
}
