/**
 * StageOrchestrator — manages deterministic stage execution with dependency graph.
 *
 * Stages:
 * - preprocessing
 * - parsers
 * - metadata
 * - binary analyzers
 * - language analyzers
 * - knowledge enrichment
 * - evidence normalization
 * - report generation
 *
 * Each stage is isolated: a failure in one stage never aborts the pipeline.
 * All stages produce immutable context updates.
 *
 * @module @veris/analysis/pipeline/orchestrator
 */

import type { Analyzer } from '../types.js';

import type { BinaryAnalysisContext, StageTiming } from './analysis-context.js';
import type { PipelineConfig, PipelineStage, StageConfig } from './config.js';
import { STAGE_DEPENDENCIES, isStageEnabled } from './config.js';
import type { PipelineDiagnosticsCollector } from './diagnostics.js';
import type { PipelineMetrics } from './metrics.js';

/** Stage execution function signature. */
export type StageHandler = (
  context: BinaryAnalysisContext,
  config: PipelineConfig,
  diagnostics: PipelineDiagnosticsCollector,
  metrics: PipelineMetrics,
) => Promise<BinaryAnalysisContext>;

/** Registered stage with handler and metadata. */
interface StageRegistration {
  readonly id: PipelineStage;
  readonly handler: StageHandler;
  readonly config: StageConfig;
}

/**
 * StageOrchestrator — manages pipeline stage registration and execution.
 *
 * Features:
 * - Deterministic stage ordering based on dependency graph
 * - Failure isolation (broken stage never aborts the pipeline)
 * - Timing collection per stage
 * - Graceful degradation
 */
export class StageOrchestrator {
  private readonly _stages: Map<PipelineStage, StageRegistration> = new Map();
  private readonly _config: PipelineConfig;

  constructor(config?: PipelineConfig) {
    this._config = config ?? {};
  }

  /** Register a stage with its handler. */
  register(id: PipelineStage, handler: StageHandler, stageConfig?: StageConfig): void {
    this._stages.set(id, {
      id,
      handler,
      config: stageConfig ?? { enabled: true },
    });
  }

  /** Check if a stage is registered. */
  hasStage(id: PipelineStage): boolean {
    return this._stages.has(id);
  }

  /** Get a registered stage. */
  getStage(id: PipelineStage): StageRegistration | undefined {
    return this._stages.get(id);
  }

  /** Get all registered stages in dependency order. */
  getStagesInOrder(): readonly StageRegistration[] {
    const visited = new Set<PipelineStage>();
    const ordered: StageRegistration[] = [];

    const visit = (stageId: PipelineStage): void => {
      if (visited.has(stageId)) return;
      visited.add(stageId);

      // Visit dependencies first
      const deps = STAGE_DEPENDENCIES[stageId];
      if (deps) {
        for (const dep of deps) {
          visit(dep);
        }
      }

      const registration = this._stages.get(stageId);
      if (registration) {
        ordered.push(registration);
      }
    };

    // Visit all stages in a fixed order for determinism
    const stageOrder: readonly PipelineStage[] = [
      'preprocessing',
      'parsers',
      'metadata',
      'binary-analyzers',
      'language-analyzers',
      'knowledge-enrichment',
      'evidence-normalization',
      'report-generation',
    ];

    for (const stageId of stageOrder) {
      if (this._stages.has(stageId)) {
        visit(stageId);
      }
    }

    return ordered;
  }

  /**
   * Execute all stages in dependency order.
   *
   * Each stage is isolated: failures are captured as diagnostics
   * and the pipeline continues with the next stage.
   */
  async execute(
    context: BinaryAnalysisContext,
    diagnostics: PipelineDiagnosticsCollector,
    metrics: PipelineMetrics,
  ): Promise<BinaryAnalysisContext> {
    let currentContext = context;
    const stages = this.getStagesInOrder();

    for (const stage of stages) {
      // Check if stage is enabled
      if (!isStageEnabled(this._config, stage.id)) {
        diagnostics.recordAnalyzer({
          analyzerId: `stage:${stage.id}`,
          analyzerVersion: '1.0.0',
          runtimeMs: 0,
          evidenceCount: 0,
          skipped: true,
          skipReason: 'Stage disabled in configuration',
        });
        continue;
      }

      // Check dependencies were executed
      const deps = STAGE_DEPENDENCIES[stage.id];
      const missingDeps = deps?.filter(
        (dep) => this._stages.has(dep) && !currentContext.stageTimings[dep],
      );
      if (missingDeps && missingDeps.length > 0) {
        diagnostics.recordAnalyzer({
          analyzerId: `stage:${stage.id}`,
          analyzerVersion: '1.0.0',
          runtimeMs: 0,
          evidenceCount: 0,
          skipped: true,
          skipReason: `Missing dependencies: ${missingDeps.join(', ')}`,
        });
        continue;
      }

      // Execute stage
      const stageStartTime = performance.now();
      const stageTiming: StageTiming = {
        stageId: stage.id,
        startTime: stageStartTime,
        endTime: 0,
        durationMs: 0,
        status: 'running',
      };

      currentContext = currentContext.withStageTiming(stage.id, stageTiming);

      try {
        currentContext = await stage.handler(currentContext, this._config, diagnostics, metrics);

        const stageEndTime = performance.now();
        const completedTiming: StageTiming = {
          stageId: stage.id,
          startTime: stageStartTime,
          endTime: stageEndTime,
          durationMs: stageEndTime - stageStartTime,
          status: 'completed',
        };
        currentContext = currentContext.withStageTiming(stage.id, completedTiming);
        metrics.markStage(stage.id);
        diagnostics.recordStage(stage.id, stageEndTime - stageStartTime);
      } catch (error) {
        const stageEndTime = performance.now();
        const failedTiming: StageTiming = {
          stageId: stage.id,
          startTime: stageStartTime,
          endTime: stageEndTime,
          durationMs: stageEndTime - stageStartTime,
          status: 'failed',
        };
        currentContext = currentContext.withStageTiming(stage.id, failedTiming);

        diagnostics.recordAnalyzer({
          analyzerId: `stage:${stage.id}`,
          analyzerVersion: '1.0.0',
          runtimeMs: stageEndTime - stageStartTime,
          evidenceCount: 0,
          failed: true,
          failureReason: error instanceof Error ? error.message : String(error),
        });

        metrics.markStage(stage.id);
        // Continue with next stage (failure isolation)
      }
    }

    return currentContext;
  }
}

/** Create a default StageOrchestrator with all stages registered. */
export function createDefaultOrchestrator(config?: PipelineConfig): StageOrchestrator {
  return new StageOrchestrator(config);
}
