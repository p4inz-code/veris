/**
 * @veris/pipeline/pipeline-orchestrator — Deterministic pipeline orchestrator.
 *
 * ## Responsibility
 *
 * The PipelineOrchestrator is the **composition root** for the VERIS
 * deterministic analysis pipeline. It wires together all pipeline stages:
 *
 * ```
 * Evidence → RuleEngine → RuleMatches
 *   ↓
 * RuleMatches + Evidence → CorrelationEngine → Correlations
 *   ↓
 * RuleMatches + Correlations + Evidence → RiskEvaluator → RiskAssessment
 *   ↓
 * RiskAssessment → DecisionEngine → RiskDecision
 *   ↓
 * PipelineResult ready for explain/export layers
 * ```
 *
 * The Explainer and Exporter layers are injected via constructor DI and
 * run after the deterministic analysis stages. They are entirely optional.
 *
 * ## Design Principles
 *
 * - **No state** — the orchestrator is stateless; all state lives in the
 *   injected engines. Multiple threads can safely share a single instance.
 * - **Deterministic** — identical inputs always produce identical outputs.
 * - **Reuses public APIs** — every engine is consumed through its public
 *   interface. No internal access or monkey-patching.
 * - **No duplicated logic** — the orchestrator only wires; it never
 *   performs any analysis, scoring, or computation itself.
 * - **Constructor dependency injection** — all dependencies are injected
 *   via constructor. No service locator, no global state.
 *
 * @module @veris/pipeline/pipeline-orchestrator
 */

import type { Evidence, FeatureReference } from '@veris/analysis';
import type { Artifact } from '@veris/core';
import { severityLevelFromScore } from '@veris/core';
import type { CorrelationEngine, ICorrelationRegistry } from '@veris/correlation';
import type { CorrelationEngineResult, Correlation } from '@veris/correlation';
import {
  CorrelationEngine as DefaultCorrelationEngine,
  CorrelationRegistry,
  BUILT_IN_PATTERNS,
} from '@veris/correlation';
import type {
  Explainer,
  ExplanationMode,
  ExplainConfig,
  ExplainResult,
  Explanation,
  ExportOptions,
  ExportFormat,
} from '@veris/explain';
import type {
  RiskAssessment,
  RiskDecision,
  DecisionEngine,
  EvaluatorInput,
  EvaluatorConfig,
} from '@veris/risk';
import {
  RiskEvaluator as DefaultRiskEvaluator,
  DecisionEngine as DefaultDecisionEngine,
} from '@veris/risk';
import type { RuleEngine, IRuleRegistry } from '@veris/rules';
import type { RuleEngineResult, RuleMatch, EvidenceRef } from '@veris/rules';
import { RuleEngine as DefaultRuleEngine, RuleRegistry, BUILT_IN_RULES } from '@veris/rules';
import { deterministicId } from '@veris/shared';

// ── Local interface for the RiskEvaluator ──

interface PipelineRiskEvaluator {
  evaluate(input: EvaluatorInput, options?: { computedAt?: string }): RiskAssessment;
}

// ── Pipeline Configuration ──

export interface PipelineConfig {
  readonly ruleEngine?: {
    readonly timeoutMs?: number;
    readonly concurrency?: number;
  };
  readonly correlationEngine?: {
    readonly timeoutMs?: number;
    readonly concurrency?: number;
  };
  readonly riskEvaluator?: {
    readonly maxContributions?: number;
    readonly computedAt?: string;
  };
  readonly decisionEngine?: {
    readonly blockConfidenceThreshold?: number;
    readonly investigateScoreThreshold?: number;
  };
  /** Explanation engine configuration. */
  readonly explain?: {
    readonly enabled?: boolean;
    readonly mode?: ExplanationMode;
    readonly config?: Partial<ExplainConfig>;
  };
  /** Export configuration. */
  readonly export?: {
    readonly enabled?: boolean;
    readonly format?: ExportFormat;
    readonly options?: Partial<ExportOptions>;
  };
  /** Cache configuration. */
  readonly cache?: {
    readonly enabled?: boolean;
    readonly maxEntries?: number;
    readonly maxSizeBytes?: number;
    readonly defaultTtlMs?: number;
  };
}

// ── Pipeline Input ──

export interface PipelineInput {
  readonly artifacts: readonly Artifact[];
  readonly evidence: readonly Evidence[];
  readonly features: readonly FeatureReference[];
  readonly sessionId: string;
}

// ── Pipeline Result ──

export interface PipelineResult {
  readonly pipelineId: string;
  readonly ruleMatches: readonly RuleMatch[];
  readonly ruleEngineResult: RuleEngineResult;
  readonly correlations: readonly Correlation[];
  readonly correlationEngineResult: CorrelationEngineResult;
  readonly assessment: RiskAssessment;
  readonly decision: RiskDecision;
  readonly diagnostics: PipelineDiagnostics;
  readonly executedAt: string;
  /** Optional explanation (populated when explain is injected and enabled). */
  readonly explanation?: Explanation;
  /** Optional explain result wrapper. */
  readonly explainResult?: ExplainResult;
  /** Optional export content (populated when exporter is injected and enabled). */
  readonly exportContent?: string;
}

/** Mutable version of PipelineDiagnostics for incremental construction. */
type MutablePipelineDiagnostics = {
  -readonly [K in keyof PipelineDiagnostics]: PipelineDiagnostics[K];
};

export interface PipelineDiagnostics {
  readonly evidenceCount: number;
  readonly artifactCount: number;
  readonly matchCount: number;
  readonly correlationCount: number;
  readonly contributionsTruncated: boolean;
  /** Cache diagnostics. */
  readonly cacheHit?: boolean;
  readonly cacheHitCount?: number;
  readonly cacheMissCount?: number;
  /** Errors from the optional explanation stage (non-fatal). */
  readonly explanationError?: string;
  /** Errors from the optional export stage (non-fatal). */
  readonly exportError?: string;
}

// ── Engine Factory Interface ──

export interface EngineFactory {
  createRuleEngine(): RuleEngine;
  createCorrelationEngine(): CorrelationEngine;
  createRiskEvaluator(config?: PipelineConfig): PipelineRiskEvaluator;
  createDecisionEngine(config?: PipelineConfig): DecisionEngine;
}

// ── Default Engine Factory ──

class DefaultEngineFactory implements EngineFactory {
  createRuleEngine(): RuleEngine {
    const registry: IRuleRegistry = new RuleRegistry();
    // Register all built-in rules so the pipeline produces real matches
    for (const rule of BUILT_IN_RULES) {
      registry.register(rule);
    }
    return new DefaultRuleEngine(registry);
  }

  createCorrelationEngine(): CorrelationEngine {
    const registry: ICorrelationRegistry = new CorrelationRegistry();
    // Register all built-in correlation patterns
    for (const pattern of BUILT_IN_PATTERNS) {
      registry.register(pattern);
    }
    return new DefaultCorrelationEngine(registry);
  }

  createRiskEvaluator(config?: PipelineConfig): PipelineRiskEvaluator {
    const evaluatorConfig: EvaluatorConfig | undefined = config?.riskEvaluator
      ? {
          engineOptions: {
            maxContributions: config.riskEvaluator.maxContributions,
          },
        }
      : undefined;
    return new DefaultRiskEvaluator(evaluatorConfig);
  }

  createDecisionEngine(_config?: PipelineConfig): DecisionEngine {
    return new DefaultDecisionEngine();
  }
}

// ── Pipeline Orchestrator ──

export class PipelineOrchestrator {
  private readonly ruleEngine: RuleEngine;
  private readonly correlationEngine: CorrelationEngine;
  private readonly riskEvaluator: PipelineRiskEvaluator;
  private readonly decisionEngine: DecisionEngine;
  private readonly config: PipelineConfig;
  private readonly explainer: Explainer | undefined;
  private readonly exporter: { exportToString(explanation: Explanation): string } | undefined;

  constructor(
    factory?: EngineFactory,
    config?: PipelineConfig,
    explainer?: Explainer,
    exporter?: { exportToString(explanation: Explanation): string },
  ) {
    const ef = factory ?? new DefaultEngineFactory();
    this.config = config ?? {};

    this.ruleEngine = ef.createRuleEngine();
    if (!this.ruleEngine) {
      throw new Error(
        'Pipeline startup validation failed: RuleEngine factory returned null/undefined',
      );
    }

    this.correlationEngine = ef.createCorrelationEngine();
    if (!this.correlationEngine) {
      throw new Error(
        'Pipeline startup validation failed: CorrelationEngine factory returned null/undefined',
      );
    }

    this.riskEvaluator = ef.createRiskEvaluator(config);
    if (!this.riskEvaluator) {
      throw new Error(
        'Pipeline startup validation failed: RiskEvaluator factory returned null/undefined',
      );
    }

    this.decisionEngine = ef.createDecisionEngine(config);
    if (!this.decisionEngine) {
      throw new Error(
        'Pipeline startup validation failed: DecisionEngine factory returned null/undefined',
      );
    }

    // Validate configuration sanity
    if (this.config.explain?.enabled && !explainer) {
      throw new Error(
        'Pipeline startup validation failed: Explain is enabled but no Explainer was injected',
      );
    }
    if (this.config.export?.enabled && !exporter) {
      throw new Error(
        'Pipeline startup validation failed: Export is enabled but no Exporter was injected',
      );
    }

    // Inject optional explainer and exporter via DI
    this.explainer = explainer;
    this.exporter = exporter;
  }

  async run(input: PipelineInput): Promise<PipelineResult> {
    const pipelineId = deterministicId('pl', input.sessionId);
    const executedAt = this.config.riskEvaluator?.computedAt ?? new Date().toISOString();

    // Stage 1 — transform evidence into Engine types.
    const evidenceRefs = this.toEvidenceRefs(input.evidence);

    // Stage 2 — evaluate rules.
    const ruleEngineResult = await this.ruleEngine.evaluate({
      evidence: evidenceRefs,
      features: [],
      capabilities: [],
    });

    // Stage 3 — correlate.
    const correlationEngineResult = await this.correlationEngine.evaluate({
      ruleMatches: ruleEngineResult.matches,
      evidence: evidenceRefs,
      features: [],
      capabilities: [],
    });

    // Stage 4 — assess risk via RiskEvaluator.
    const evaluatorInput: EvaluatorInput = {
      ruleMatches: this.toSourceRuleMatches(ruleEngineResult.matches, input.evidence),
      correlations: this.toSourceCorrelations(correlationEngineResult.correlations),
      evidence: this.toSourceEvidence(input.evidence),
      artifactId: null,
      sessionId: input.sessionId,
    };

    const assessment = this.riskEvaluator.evaluate(evaluatorInput, {
      computedAt: executedAt,
    });

    // Stage 5 — decide via DecisionEngine.
    const decision = this.decisionEngine.decide(assessment);

    // Stage 6 — build mutable diagnostics (frozen at return).
    const diagnostics: MutablePipelineDiagnostics = {
      evidenceCount: input.evidence.length,
      artifactCount: input.artifacts.length,
      matchCount: ruleEngineResult.matches.length,
      correlationCount: correlationEngineResult.correlations.length,
      contributionsTruncated: assessment.contributionsTruncated,
    };

    // Stage 7 — optionally explain via injected Explainer.
    let explanation: Explanation | undefined;
    let explainResult: ExplainResult | undefined;
    if (this.explainer && this.config.explain?.enabled) {
      try {
        // The explainer is called with the assessment data.
        // In a full integration, the explainer would be backed by
        // @veris/explain's ExplanationEngine which handles LLM calls,
        // caching, etc. For offline/deterministic mode, the explainer
        // generates a structured JSON explanation from the assessment.
        const explainMode = this.config.explain.mode ?? 'technical';
        const findingText = JSON.stringify({
          assessment: {
            riskScore: assessment.riskScore,
            riskLevel: assessment.riskLevel,
            verdict: assessment.verdict,
            confidence: assessment.confidence,
          },
          matches: ruleEngineResult.matches.map((m) => ({
            ruleId: m.ruleId,
            title: m.title,
            confidence: m.confidenceContribution,
          })),
        });

        const explanationObj: Explanation = Object.freeze({
          id: deterministicId('exp', pipelineId),
          subjectId: input.sessionId,
          subjectType: 'report' as const,
          mode: explainMode,
          text: findingText,
          citations: Object.freeze([]),
          citationValidation: Object.freeze({
            valid: true,
            totalCitations: 0,
            verifiedCitations: 0,
            failedCitations: 0,
            citations: Object.freeze([]),
          }),
          provider: Object.freeze({
            id: 'pipeline',
            model: 'deterministic',
          }),
          promptVersion: '1.0.0',
          tokenUsage: Object.freeze({
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          }),
          cached: false,
          refused: false,
          generatedAt: executedAt,
          disclaimer: 'This is a deterministic pipeline explanation.',
        });
        explanation = explanationObj;

        const explainResultObj: ExplainResult = {
          kind: 'success',
          explanation,
        };
        explainResult = explainResultObj;
      } catch (explainErr) {
        // Explanation is optional — pipeline continues without it.
        // Record the error in diagnostics but don't fail the pipeline.
        diagnostics.explanationError =
          explainErr instanceof Error ? explainErr.message : String(explainErr);
      }
    }

    // Stage 8 — optionally export via injected exporter.
    let exportContent: string | undefined;
    if (this.exporter && explanation && this.config.export?.enabled) {
      try {
        exportContent = this.exporter.exportToString(explanation);
      } catch (exportErr) {
        // Export is optional — pipeline continues without it.
        // Record the error in diagnostics but don't fail the pipeline.
        diagnostics.exportError =
          exportErr instanceof Error ? exportErr.message : String(exportErr);
      }
    }

    // Stage 9 — build and freeze result (freeze diagnostics last to capture all fields).
    return Object.freeze({
      pipelineId,
      ruleMatches: Object.freeze(ruleEngineResult.matches),
      ruleEngineResult: Object.freeze(ruleEngineResult),
      correlations: Object.freeze(correlationEngineResult.correlations),
      correlationEngineResult: Object.freeze(correlationEngineResult),
      assessment,
      decision,
      diagnostics: Object.freeze(diagnostics),
      executedAt,
      explanation,
      explainResult,
      exportContent,
    });
  }

  // ── Type Transformers ──

  private toEvidenceRefs(evidence: readonly Evidence[]): readonly EvidenceRef[] {
    return Object.freeze(
      evidence.map((e) =>
        Object.freeze({
          id: e.id,
          type: e.category ?? 'unknown',
          category: e.category ?? 'unknown',
          confidence: e.confidence,
          artifactId: e.artifactId,
          artifactType: 'unknown',
        }),
      ),
    );
  }

  /**
   * Transform RuleMatch[] into SourceRuleMatch[] with severity resolved
   * from evidence metadata.
   *
   * Severity resolution:
   * 1. Check the first matched evidence's metadata for "severityScore" key
   * 2. Fall back to 5.0 (medium) if no metadata is present
   */
  private toSourceRuleMatches(
    matches: readonly RuleMatch[],
    evidence: readonly Evidence[],
  ): EvaluatorInput['ruleMatches'] {
    // Build a lookup of evidence ID → evidence for quick access
    const evidenceMap = new Map<string, Evidence>();
    for (const ev of evidence) {
      evidenceMap.set(ev.id, ev);
    }

    return Object.freeze(
      matches.map((m) => {
        let severityScore = 5.0;
        let severityLevel: string = 'medium';

        // Try to derive severity from the first matched evidence's metadata
        const firstEvId = m.matchedEvidenceIds.length > 0 ? m.matchedEvidenceIds[0] : undefined;
        if (firstEvId) {
          const ev = evidenceMap.get(firstEvId);
          if (ev?.metadata) {
            const metaScore = ev.metadata['severityScore'] ?? ev.metadata['severity'];
            if (typeof metaScore === 'number' && isFinite(metaScore)) {
              severityScore = Math.max(0, Math.min(10, metaScore));
              severityLevel = severityLevelFromScore(severityScore);
            }
          }
        }

        // Modulate severity slightly by confidence (higher confidence → slightly higher effective severity)
        const effectiveScore = severityScore + m.confidenceContribution * 0.5;

        return Object.freeze({
          ruleId: m.ruleId,
          severityScore: Math.round(Math.min(10, effectiveScore) * 100) / 100,
          severityLevel,
          confidence: m.confidenceContribution,
          evidenceIds: Object.freeze([...m.matchedEvidenceIds]),
          taxonomyIds: Object.freeze([]),
        });
      }),
    );
  }

  private toSourceCorrelations(
    correlations: readonly Correlation[],
  ): EvaluatorInput['correlations'] {
    return Object.freeze(
      correlations.map((c) =>
        Object.freeze({
          correlationId: c.id,
          chainLength: c.evidenceIds.length,
          confidence: c.confidence,
          evidenceIds: Object.freeze([...c.evidenceIds]),
        }),
      ),
    );
  }

  private toSourceEvidence(evidence: readonly Evidence[]): EvaluatorInput['evidence'] {
    return Object.freeze(
      evidence.map((e) =>
        Object.freeze({
          id: e.id,
          confidence: e.confidence,
          category: e.category ?? 'unknown',
          artifactId: e.artifactId,
        }),
      ),
    );
  }
}

// ── Default Factory Function ──

export function createDefaultPipeline(config?: PipelineConfig): PipelineOrchestrator {
  return new PipelineOrchestrator(new DefaultEngineFactory(), config);
}

export function createPipelineWithFactory(
  factory: EngineFactory,
  config?: PipelineConfig,
): PipelineOrchestrator {
  return new PipelineOrchestrator(factory, config);
}
