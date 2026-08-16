/**
 * `veris scan` command — run analysis on artifacts.
 *
 * Usage:
 *   veris scan [target] [options]
 *
 * Orchestrates the full pipeline:
 *   Discovery → Classification → Extraction → Knowledge → Analysis →
 *   Rules → Correlation → Risk → Report → Export
 *
 * Now with professional progress rendering via the M2 dashboard system.
 *
 * @module @veris/cli/commands/scan
 */

import { createHash } from 'node:crypto';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import {
  AnalysisEngine,
  CertificateAnalyzer,
  DependencyAnalyzer,
  DocumentAnalyzer,
  ELFAnalyzer,
  EntropyAnalyzer,
  ImportAnalyzer,
  MachOAnalyzer,
  OfficeAnalyzer,
  PEAnalyzer,
  PersistenceAnalyzer,
  ScriptAnalyzer,
  StringAnalyzer,
} from '@veris/analysis';
import type { FeatureReference, Evidence as AnalysisEvidence } from '@veris/analysis';
import { ClassificationEngine } from '@veris/classification';
import { createArtifact, severityLevelFromScore } from '@veris/core';
import type { Artifact, ArtifactType, ContentHash } from '@veris/core';
import { DiscoveryEngine } from '@veris/discovery';
import { exportReport } from '@veris/exporters';
import type { ExportOptions } from '@veris/exporters';
import {
  ELFExtractor,
  EntropyExtractor,
  ExtractorRegistry,
  HashExtractor,
  JavaScriptExtractor,
  JSONExtractor,
  MachOExtractor,
  PEExtractor,
  PythonExtractor,
  ShellExtractor,
  StringExtractor,
  TypeScriptExtractor,
  XMLExtractor,
  YAMLExtractor,
} from '@veris/extractors';
import type { ExtractionContext, RawFeature } from '@veris/extractors';
import {
  KnowledgeEngine,
  BUILT_IN_PACKS,
  PackRegistry,
  PackResolver,
  EvidenceEnricher,
} from '@veris/knowledge';
import type { PackEnrichment, EvidenceForEnrichment } from '@veris/knowledge';
import { createDefaultPipeline } from '@veris/pipeline';
import {
  BUILT_IN_RECOMMENDATIONS,
  createRecommendationEngine,
  createRecommendationRegistry,
} from '@veris/recommendations';
import { buildReport } from '@veris/report';
import { deterministicId } from '@veris/shared';

// ── Import M2 Progress System ──

import { Profiler } from '../scan/profiler.js';
import {
  type ProgressRenderer,
  type ErrorInfo,
  DashboardRenderer,
  JsonProgressRenderer,
  SilentRenderer,
  createHealthIssue,
  errorFromException,
} from '../scan/progress/index.js';
import {
  createScanSession,
  updateSession,
  type ScanSession,
  type ScanConfig,
  type CurrentFile,
  type ScanStatistics,
  type PerformanceMetrics,
  type HealthIssue,
  type StageState,
} from '../scan/scan-session.js';
import { CliError, ExitCode } from '../wirer.js';

// ── Scan Command Options ──

export interface ScanOptions {
  /** Target directory or file to scan. */
  readonly target: string;
  /** Output format(s). */
  readonly format?: string[];
  /** Output directory. */
  readonly output?: string;
  /** Maximum findings to include. */
  readonly maxFindings?: number;
  /** Verbose output. */
  readonly verbose?: boolean;
  /** Run silently (no progress output). */
  readonly silent?: boolean;
  /** Progress rendering mode. */
  readonly progress?: 'dashboard' | 'json' | 'silent' | 'auto';
  /**
   * Injected timestamp for deterministic output (ISO 8601).
   * Required for determinism — must be provided by the caller.
   */
  readonly computedAt: string;
}

// ── Help Text ──

export const SCAN_HELP = `
Run analysis on artifacts.

Executes the full VERIS analysis pipeline:
  Discovery → Classification → Extraction → Rules → Risk → Report

USAGE
  veris scan [target]                    Scan a directory or file
  veris scan --output ./results          Save results to a directory
  veris scan --format json               Output as JSON only
  veris scan --format json,markdown      Multiple output formats

OPTIONS
  --output, -o <dir>        Output directory for results
  --format, -f <formats>    Output format(s): json, markdown, html, sarif, csv, junit
  --max-findings <n>        Maximum findings to include in output
  --progress <mode>         Progress display: dashboard (default), json, silent
  --silent                  Alias for --progress silent
  --verbose                 Enable verbose debug output
  --help                    Show this help message

EXAMPLES
  veris scan                            Scan current directory
  veris scan /path/to/target            Scan specific directory
  veris scan --output ./results         Save results to ./results
  veris scan --format json              JSON output only
  veris scan --format json,markdown     JSON and Markdown output
  veris scan --progress json            Machine-readable JSON progress
  veris scan --progress silent          Silent mode

EXIT CODES
  0  Success
  1  General error
  2  Usage error
`;

// ── Helpers ──

/** Map a classification category to a canonical ArtifactType. */
function categoryToArtifactType(
  category: string | undefined,
  subType: string | null | undefined,
): ArtifactType {
  switch (category) {
    case 'directory':
      return 'directory';
    case 'archive':
      return 'archive';
    case 'executable':
      return 'executable';
    case 'script':
      return 'script';
    case 'document':
      return 'document';
    case 'image':
      return 'image';
    case 'configuration':
      return 'configuration';
    default:
      if (subType === 'certificate' || category === 'certificate') return 'certificate';
      return 'file';
  }
}

/** Collect diagnostic issues during the scan. */
interface ScanDiagnostic {
  readonly artifactPath: string;
  readonly stage: 'discovery' | 'classification' | 'extraction' | 'knowledge' | 'analysis';
  readonly code: string;
  readonly message: string;
}

// ── Cancel State ──

let cancelRequested = false;
let scanActive = false;

/** Check if cancellation was requested. */
export function isCancelRequested(): boolean {
  return cancelRequested;
}

/**
 * Whether a scan command is currently running.
 *
 * Used by the CLI's global signal handler to defer graceful shutdown to the
 * scan's own cancellation flow (avoiding duplicate cleanup/finalization).
 */
export function isScanActive(): boolean {
  return scanActive;
}

// ── Progress Renderer Factory ──

/** Create the appropriate progress renderer based on options and terminal. */
function createRenderer(options: ScanOptions): ProgressRenderer {
  const mode = options.progress ?? (options.silent ? 'silent' : 'auto');

  switch (mode) {
    case 'json':
      return new JsonProgressRenderer();
    case 'silent':
      return new SilentRenderer();
    case 'dashboard':
      return new DashboardRenderer();
    case 'auto':
    default: {
      // Auto-detect: use dashboard for interactive TTY, silent for piped
      const isTty = process.stdout.isTTY === true && process.stdin.isTTY === true;
      if (isTty && !options.silent) {
        return new DashboardRenderer();
      }
      return new SilentRenderer();
    }
  }
}

// ── Scan Config Builder ──

/** Build a ScanConfig from options. */
function buildScanConfig(options: ScanOptions): ScanConfig {
  return Object.freeze({
    target: options.target,
    preset: 'default',
    enabledAnalyzers: [
      'PE',
      'ELF',
      'MachO',
      'Certificate',
      'Document',
      'Office',
      'Entropy',
      'Import',
      'String',
      'Persistence',
      'Script',
      'Dependency',
    ],
    enabledFormats: options.format ?? ['json', 'markdown'],
    workerCount: 1,
    maxFindings: options.maxFindings ?? 1000,
    maxFiles: 100_000,
    maxDepth: 50,
    includeHidden: false,
  });
}

// ── Command Handler ──

export async function runScan(options: ScanOptions): Promise<{ exitCode: number }> {
  const { computedAt } = options;
  const MAX_DIAGNOSTICS = 1000;
  const diagnostics: ScanDiagnostic[] = [];
  const healthIssues: HealthIssue[] = [];

  function addDiagnostic(d: ScanDiagnostic): void {
    if (diagnostics.length < MAX_DIAGNOSTICS && healthIssues.length < MAX_DIAGNOSTICS) {
      diagnostics.push(d);
      healthIssues.push(createHealthIssue(d.code, d.message, 'warning', d.artifactPath));
    }
  }

  // ── Create profiler and session ──
  const profiler = new Profiler(computedAt);
  const config = buildScanConfig(options);
  let session = createScanSession(config, computedAt);

  // ── Create renderer ──
  const renderer = createRenderer(options);
  let cancelled = false;
  let savedOutputFiles: string[] = [];
  scanActive = true;

  // SIGINT handler for graceful cancellation. The first Ctrl+C cancels the
  // scan; a second Ctrl+C forces an immediate exit (standard CLI convention).
  const sigintHandler = (): void => {
    if (!cancelled) {
      cancelled = true;
      cancelRequested = true;
    } else {
      // Second Ctrl+C: force exit. Restore the terminal first (stop the
      // animation and leave the alternate screen buffer synchronously) so
      // the shell prompt is not left inside a stuck interactive layout.
      void renderer.dispose();
      process.exit(130);
    }
  };
  process.on('SIGINT', sigintHandler);

  try {
    // ── Load Knowledge Packs (before start, so the startup screen can
    //    report the loaded pack count) ──
    let packCount = 0;
    let enricher: EvidenceEnricher | undefined;
    const knowledgeEnrichments: PackEnrichment[] = [];
    try {
      const registry = new PackRegistry({ validateOnLoad: false, strict: false });
      for (const pack of BUILT_IN_PACKS) {
        registry.load(pack);
      }
      packCount = registry.size;
      if (packCount > 0) {
        const resolver = new PackResolver(
          registry
            .list()
            .map((id) => registry.lookup(id)!)
            .filter(Boolean),
        );
        enricher = new EvidenceEnricher(resolver);
        if (options.verbose) {
          process.stderr.write(`Loaded ${packCount} built-in knowledge pack(s)\n`);
        }
      }
    } catch (packErr) {
      // Non-fatal - packs are optional enrichment
      if (options.verbose) {
        process.stderr.write(
          `Warning: Failed to load knowledge packs: ${packErr instanceof Error ? packErr.message : String(packErr)}\n`,
        );
      }
    }

    // ── Start ──
    renderer.onStart(session, { knowledgePackCount: packCount });

    // ── Stage 1: Discovery ──
    profiler.start('discovery');
    session = updateSession(session, {
      currentStage: 'discovery',
      stages: updateStage(session.stages, 'discovery', 'running'),
    });
    renderer.onStageChange('discovery', 'running');

    if (cancelled) {
      return await handleCancellation(session, renderer, profiler, savedOutputFiles);
    }

    const discoveryEngine = new DiscoveryEngine({
      includeHidden: false,
      includeHiddenDirs: false,
      maxDepth: 50,
      maxFiles: 100_000,
    });

    let discoveryResult;
    try {
      discoveryResult = await discoveryEngine.discover(options.target);
      profiler.finish('discovery', { processed: discoveryResult.artifacts.length });
    } catch (err) {
      const errInfo = errorFromException(err, 'DISCOVERY_ERROR', options.target);
      renderer.onError(errInfo);
      diagnostics.push({
        artifactPath: options.target,
        stage: 'discovery',
        code: 'DISCOVERY_ERROR',
        message: err instanceof Error ? err.message : String(err),
      });
      profiler.finish('discovery', { processed: 0, failed: 1 });

      // Fatal - can't continue without discovery
      session = updateSession(session, {
        completed: true,
        progress: 0,
        stages: updateStage(
          session.stages,
          'discovery',
          'failed',
          profiler.getStageTiming('discovery')?.durationMs ?? 0,
        ),
      });
      renderer.onStageChange('discovery', 'failed');
      const summary = buildMinimalSummary(
        session,
        0,
        diagnostics,
        healthIssues,
        savedOutputFiles,
        cancelled,
      );
      renderer.onComplete(session, summary);
      return { exitCode: ExitCode.ERROR };
    }

    const totalFiles = discoveryResult.artifacts.filter(
      (a) => !a.isDirectory && !a.isSymlink,
    ).length;

    const dirCount = discoveryResult.artifacts.filter((a) => a.isDirectory).length;

    session = updateSession(session, {
      totalFiles,
      filesRemaining: totalFiles,
      stages: updateStage(
        session.stages,
        'discovery',
        'completed',
        profiler.getStageTiming('discovery')?.durationMs ?? 0,
      ),
      statistics: { filesScanned: totalFiles, directories: dirCount },
    });
    renderer.onStageChange('discovery', 'completed');

    if (cancelled) {
      return await handleCancellation(session, renderer, profiler, savedOutputFiles);
    }

    if (totalFiles === 0) {
      // No files to scan - show empty summary
      session = updateSession(session, { completed: true, progress: 1 });
      const summary = buildMinimalSummary(
        session,
        0,
        diagnostics,
        healthIssues,
        savedOutputFiles,
        cancelled,
      );
      renderer.onComplete(session, summary);
      return { exitCode: ExitCode.SUCCESS };
    }

    // ── Stage 2: Classification ──
    profiler.start('classification');
    session = updateSession(session, {
      currentStage: 'classification',
      stages: updateStage(session.stages, 'classification', 'running'),
    });
    renderer.onStageChange('classification', 'running');

    if (cancelled) {
      return await handleCancellation(session, renderer, profiler, savedOutputFiles);
    }

    const classificationEngine = new ClassificationEngine();
    let classificationResults;
    try {
      classificationResults = await classificationEngine.classifyMany(discoveryResult.artifacts);
      profiler.finish('classification', { processed: classificationResults.length });
    } catch (err) {
      const errInfo = errorFromException(err, 'CLASSIFICATION_ERROR');
      renderer.onError(errInfo);
      diagnostics.push({
        artifactPath: options.target,
        stage: 'classification',
        code: 'CLASSIFICATION_ERROR',
        message: err instanceof Error ? err.message : String(err),
      });
      profiler.finish('classification', { failed: 1 });
      session = updateSession(session, {
        stages: updateStage(
          session.stages,
          'classification',
          'failed',
          profiler.getStageTiming('classification')?.durationMs ?? 0,
        ),
      });
      renderer.onStageChange('classification', 'failed');
      return { exitCode: ExitCode.ERROR };
    }

    const classMap = new Map<string, (typeof classificationResults)[number]>();
    for (const cr of classificationResults) {
      classMap.set(cr.artifactId, cr);
    }

    session = updateSession(session, {
      stages: updateStage(
        session.stages,
        'classification',
        'completed',
        profiler.getStageTiming('classification')?.durationMs ?? 0,
      ),
    });
    renderer.onStageChange('classification', 'completed');

    if (cancelled) {
      return await handleCancellation(session, renderer, profiler, savedOutputFiles);
    }

    // ── Stage 3-5: Extraction + Knowledge + Analysis (per file) ──
    profiler.start('extraction');
    session = updateSession(session, {
      currentStage: 'extraction',
      stages: updateStage(session.stages, 'extraction', 'running'),
    });
    renderer.onStageChange('extraction', 'running');

    const extractorRegistry = new ExtractorRegistry();
    const knowledgeEngine = new KnowledgeEngine({ extractedAt: computedAt });
    const analysisEngine = new AnalysisEngine({
      analyzers: [
        new PEAnalyzer(),
        new ELFAnalyzer(),
        new MachOAnalyzer(),
        new CertificateAnalyzer(),
        new DocumentAnalyzer(),
        new OfficeAnalyzer(),
        new EntropyAnalyzer(),
        new ImportAnalyzer(),
        new StringAnalyzer(),
        new PersistenceAnalyzer(),
        new ScriptAnalyzer(),
        new DependencyAnalyzer(),
      ],
    });
    extractorRegistry.registerAll([
      new StringExtractor(),
      new HashExtractor(),
      new EntropyExtractor(),
      new JSONExtractor(),
      new YAMLExtractor(),
      new XMLExtractor(),
      new JavaScriptExtractor(),
      new TypeScriptExtractor(),
      new PythonExtractor(),
      new ShellExtractor(),
      new PEExtractor(),
      new ELFExtractor(),
      new MachOExtractor(),
    ]);

    const sessionId = deterministicId('scan', computedAt);
    const pipelineArtifacts: Artifact[] = [];
    const allEvidence: AnalysisEvidence[] = [];
    let featuresExtracted = 0;
    let filesProcessed = 0;
    let skippedFiles = 0;
    const filesToProcess = discoveryResult.artifacts.filter((a) => !a.isDirectory && !a.isSymlink);
    const totalToProcess = filesToProcess.length;

    // Notify stage change for knowledge and analysis (they run per-file)
    const stagesAfterExtraction = updateStage(session.stages, 'knowledge', 'running');
    session = updateSession(session, {
      stages: updateStage(stagesAfterExtraction, 'analysis', 'running'),
    });
    renderer.onStageChange('knowledge', 'running');
    renderer.onStageChange('analysis', 'running');

    for (let fileIdx = 0; fileIdx < filesToProcess.length; fileIdx++) {
      if (cancelled) break;

      const discovered = filesToProcess[fileIdx];
      const fileStartTime = Date.now();

      // Current file info
      const currentFile: CurrentFile = {
        filename: path.basename(discovered.canonicalPath),
        relativePath: discovered.relativePath ?? discovered.canonicalPath,
        size: 0, // Will be set after reading
        fileType: '',
        language: '',
        artifactType: '',
        currentAnalyzer: 'extraction',
      };

      session = updateSession(session, {
        currentFile,
        filesProcessed: fileIdx,
        filesRemaining: totalToProcess - fileIdx - 1,
        progress: totalToProcess > 0 ? fileIdx / totalToProcess : 0,
        queueSize: totalToProcess - fileIdx - 1,
      });
      renderer.onFileStart(currentFile);

      // Read file content
      let content: Buffer;
      try {
        content = await fsp.readFile(discovered.absolutePath);
      } catch (err) {
        skippedFiles++;
        const errInfo = errorFromException(err, 'FILE_READ_ERROR', discovered.absolutePath);
        renderer.onError(errInfo);
        addDiagnostic({
          artifactPath: discovered.absolutePath,
          stage: 'extraction',
          code: 'FILE_READ_ERROR',
          message: `Cannot read file: ${err instanceof Error ? err.message : String(err)}`,
        });
        const fileDuration = Date.now() - fileStartTime;
        profiler.recordFile(discovered.absolutePath, 'extraction', fileDuration, false);
        renderer.onFileComplete(currentFile, fileDuration, false);
        continue;
      }

      // Update current file with size info
      const classification = classMap.get(discovered.id);
      const artifactType = categoryToArtifactType(
        classification?.category,
        classification?.subType,
      );
      const updatedFile: CurrentFile = {
        ...currentFile,
        size: content.length,
        fileType: classification?.mimeType ?? 'application/octet-stream',
        language: classification?.encoding ?? '',
        artifactType,
        currentAnalyzer: 'extraction',
      };
      session = updateSession(session, { currentFile: updatedFile });

      // Compute content hash
      const hash = createHash('sha256').update(content).digest('hex');
      const contentHash: ContentHash = { algorithm: 'sha-256', value: hash };

      // Create canonical Artifact
      const artifact = createArtifact({
        id: discovered.id,
        sessionId,
        type: artifactType,
        subType: classification?.subType ?? undefined,
        normalizedPath: discovered.canonicalPath,
        originalPath: discovered.absolutePath,
        size: content.length,
        contentHash,
        mimeType: classification?.mimeType ?? 'application/octet-stream',
        encoding: classification?.encoding ?? undefined,
        extractedAt: computedAt,
        extractorId: 'cli-scan',
      });
      pipelineArtifacts.push(artifact);

      // Run extraction
      const extractionContext: ExtractionContext = { artifact, sessionId, content, config: {} };
      let rawFeatures: readonly RawFeature[];
      try {
        const extractionResult = await extractorRegistry.extract(extractionContext);
        rawFeatures = extractionResult.features;
      } catch (err) {
        skippedFiles++;
        const errInfo = errorFromException(err, 'EXTRACTION_FAILED', discovered.absolutePath);
        renderer.onError(errInfo);
        addDiagnostic({
          artifactPath: discovered.absolutePath,
          stage: 'extraction',
          code: 'EXTRACTION_FAILED',
          message: `Extractor registry failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        const fileDuration = Date.now() - fileStartTime;
        profiler.recordFile(discovered.absolutePath, 'extraction', fileDuration, false);
        renderer.onFileComplete(updatedFile, fileDuration, false);
        continue;
      }

      // Knowledge (normalize features)
      const knowledgeRawFeatures = rawFeatures.map((rf) => ({
        rawType: rf.type,
        rawValue: rf.value,
        location: rf.location
          ? { ...rf.location, path: discovered.absolutePath }
          : {
              startLine: 1,
              startColumn: 0,
              endLine: 1,
              endColumn: 0,
              offset: 0,
              length: 0,
              path: discovered.absolutePath,
            },
        confidence: rf.confidence,
        metadata: rf.metadata,
      }));

      let knowledgeResult: import('@veris/knowledge').ArtifactKnowledgeResult;
      try {
        knowledgeResult = await knowledgeEngine.processArtifact(
          artifact,
          sessionId,
          knowledgeRawFeatures,
        );
      } catch (err) {
        skippedFiles++;
        const errInfo = errorFromException(err, 'KNOWLEDGE_FAILED', discovered.absolutePath);
        renderer.onError(errInfo);
        addDiagnostic({
          artifactPath: discovered.absolutePath,
          stage: 'knowledge',
          code: 'KNOWLEDGE_FAILED',
          message: `Knowledge engine failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        const fileDuration = Date.now() - fileStartTime;
        profiler.recordFile(discovered.absolutePath, 'knowledge', fileDuration, false);
        renderer.onFileComplete(updatedFile, fileDuration, false);
        continue;
      }

      featuresExtracted += rawFeatures.length;

      // Analysis (produce evidence)
      const featureRefs: FeatureReference[] = knowledgeResult.featureSet.features.map((f) => ({
        id: f.id,
        type: f.type,
        value: f.value,
        confidence: f.confidence,
        location: f.location,
        metadata: f.metadata,
      }));

      let analysisResult: import('@veris/analysis').ArtifactAnalysisResult;
      try {
        analysisResult = await analysisEngine.analyzeArtifact(
          artifact,
          sessionId,
          featureRefs,
          undefined,
          content,
        );
      } catch (err) {
        skippedFiles++;
        const errInfo = errorFromException(err, 'ANALYSIS_FAILED', discovered.absolutePath);
        renderer.onError(errInfo);
        addDiagnostic({
          artifactPath: discovered.absolutePath,
          stage: 'analysis',
          code: 'ANALYSIS_FAILED',
          message: `Analysis engine failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        const fileDuration = Date.now() - fileStartTime;
        profiler.recordFile(discovered.absolutePath, 'analysis', fileDuration, false);
        renderer.onFileComplete(updatedFile, fileDuration, false);
        continue;
      }

      allEvidence.push(...analysisResult.evidence);
      filesProcessed++;

      // Enrich evidence with knowledge packs
      if (enricher && analysisResult.evidence.length > 0) {
        for (const ev of analysisResult.evidence) {
          const enrichmentInput: EvidenceForEnrichment = {
            id: ev.id,
            type: ev.type ?? ev.category ?? 'unknown',
            category: ev.category ?? 'unknown',
            value: ev.type,
            metadata: ev.metadata as Readonly<Record<string, unknown>> | undefined,
          };
          const enrichmentResult = enricher.enrich(enrichmentInput);
          if (enrichmentResult.enriched) {
            knowledgeEnrichments.push(...enrichmentResult.enrichments);
          }
        }
      }

      const fileDuration = Date.now() - fileStartTime;
      profiler.recordFile(discovered.absolutePath, 'extraction', fileDuration, true);

      // Update session statistics
      const memoryUsage = process.memoryUsage();
      const memMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
      const peakMemMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);

      session = updateSession(session, {
        filesProcessed,
        filesRemaining: totalToProcess - fileIdx - 1,
        progress: totalToProcess > 0 ? (fileIdx + 1) / totalToProcess : 0,
        workerUtilization: 1,
        statistics: {
          filesScanned: filesProcessed,
          evidenceCollected: allEvidence.length,
          warnings: diagnostics.filter((d) => d.code !== 'FATAL').length,
          errors: diagnostics.filter((d) => d.code === 'FATAL').length,
          skippedFiles,
          memoryUsageMB: memMB,
        },
        performance: {
          memoryCurrentMB: memMB,
          memoryPeakMB: peakMemMB,
          slowestFile: profiler.getSlowestFile() ?? undefined,
          fastestFile: profiler.getFastestFile() ?? undefined,
        },
      });

      renderer.onFileComplete(updatedFile, fileDuration, true);
      renderer.onProgress({
        stage: 'extraction',
        stageUpdates: [
          {
            id: 'extraction',
            status: 'running',
            itemsProcessed: filesProcessed,
            itemsFailed: skippedFiles,
          },
        ],
        currentFile: updatedFile,
        filesProcessed,
        totalFiles: totalToProcess,
        queueSize: totalToProcess - fileIdx - 1,
        workerUtilization: 1,
      });
    }

    // Complete extraction/knowledge/analysis stages
    profiler.finish('extraction', { processed: filesProcessed, failed: skippedFiles });
    const extractionDurationMs = profiler.getStageTiming('extraction')?.durationMs ?? 0;
    session = updateSession(session, {
      stages: updateStage(
        updateStage(
          updateStage(
            session.stages,
            'extraction',
            'completed',
            extractionDurationMs,
            filesProcessed,
            skippedFiles,
          ),
          'knowledge',
          'completed',
          extractionDurationMs,
          filesProcessed,
          skippedFiles,
        ),
        'analysis',
        'completed',
        extractionDurationMs,
        filesProcessed,
        skippedFiles,
      ),
    });
    renderer.onStageChange('extraction', 'completed');
    renderer.onStageChange('knowledge', 'completed');
    renderer.onStageChange('analysis', 'completed');

    if (cancelled) {
      return await handleCancellation(session, renderer, profiler, savedOutputFiles);
    }

    // ── Stage 6: Pipeline (Rules → Correlation → Risk → Decision) ──
    // The pipeline orchestrator runs rules, correlation, and risk inside a
    // single run() call; report all three phases truthfully around it.
    profiler.start('rules');
    session = updateSession(session, {
      currentStage: 'rules',
      stages: updateStage(
        updateStage(updateStage(session.stages, 'rules', 'running'), 'correlation', 'running'),
        'risk',
        'running',
      ),
    });
    renderer.onStageChange('rules', 'running');
    renderer.onStageChange('correlation', 'running');
    renderer.onStageChange('risk', 'running');

    const pipeline = createDefaultPipeline({ riskEvaluator: { computedAt } });
    const pipelineInput = {
      artifacts: pipelineArtifacts,
      evidence: allEvidence,
      features: [] as readonly FeatureReference[],
      sessionId,
    };

    let pipelineResult;
    try {
      pipelineResult = await pipeline.run(pipelineInput);
      profiler.finish('rules', { processed: allEvidence.length });
    } catch (err) {
      const errInfo = errorFromException(err, 'PIPELINE_ERROR');
      renderer.onError(errInfo);
      profiler.finish('rules', { failed: 1 });
      session = updateSession(session, {
        stages: updateStage(
          updateStage(
            updateStage(
              session.stages,
              'rules',
              'failed',
              profiler.getStageTiming('rules')?.durationMs ?? 0,
            ),
            'correlation',
            'failed',
          ),
          'risk',
          'failed',
        ),
      });
      renderer.onStageChange('rules', 'failed');
      renderer.onStageChange('correlation', 'failed');
      renderer.onStageChange('risk', 'failed');
      const summary = buildMinimalSummary(
        session,
        filesProcessed,
        diagnostics,
        healthIssues,
        savedOutputFiles,
        cancelled,
      );
      renderer.onComplete(session, summary);
      return { exitCode: ExitCode.ERROR };
    }

    const pipelineDurationMs = profiler.getStageTiming('rules')?.durationMs ?? 0;
    const correlationCount = (pipelineResult.correlations ?? []).length;
    session = updateSession(session, {
      stages: updateStage(
        updateStage(
          updateStage(session.stages, 'rules', 'completed', pipelineDurationMs, allEvidence.length),
          'correlation',
          'completed',
          pipelineDurationMs,
          correlationCount,
        ),
        'risk',
        'completed',
        pipelineDurationMs,
      ),
      statistics: { rulesEvaluated: (pipelineResult.ruleMatches ?? []).length },
    });
    renderer.onStageChange('rules', 'completed');
    renderer.onStageChange('correlation', 'completed');
    renderer.onStageChange('risk', 'completed');

    if (cancelled) {
      return await handleCancellation(session, renderer, profiler, savedOutputFiles);
    }

    // ── Stage 7: Recommendations ──
    const recRegistry = createRecommendationRegistry();
    for (const rec of BUILT_IN_RECOMMENDATIONS) {
      recRegistry.register(rec);
    }
    const recommendationEngine = createRecommendationEngine({
      registry: recRegistry,
      generatedAt: computedAt,
    });
    const recommendationInput = {
      riskAssessmentId: pipelineResult.assessment.id,
      sessionId,
      artifactId: null,
      ruleMatchIds: (pipelineResult.ruleMatches ?? []).map((m: { ruleId: string }) => m.ruleId),
      correlationIds: (pipelineResult.correlations ?? []).map((c: { id: string }) => c.id),
      evidenceIds: (pipelineResult.assessment.contributions ?? []).map((c: { id: string }) => c.id),
    };
    const recommendationResult = recommendationEngine.evaluate(recommendationInput);
    if (options.verbose && !renderer.supportsAnimation) {
      process.stderr.write(`Recommendations: ${recommendationResult.totalCount}\n`);
    }

    // ── Stage 8: Report ──
    profiler.start('reporting');
    session = updateSession(session, {
      currentStage: 'reporting',
      stages: updateStage(session.stages, 'reporting', 'running'),
    });
    renderer.onStageChange('reporting', 'running');

    const report = buildReport(pipelineResult, pipelineInput, {
      target: options.target,
      generatedAt: computedAt,
      sessionId,
      knowledgeEnrichments:
        knowledgeEnrichments.length > 0
          ? knowledgeEnrichments.map((e) => ({
              packId: e.packId,
              entryId: e.entryId,
              name: e.name,
              family: e.family,
              description: e.description,
              behavior: e.behavior,
              severity: e.severity,
              remediation: e.remediation,
              references: e.references,
              mitreTechniques: e.mitreTechniques,
              cweIds: e.cweIds ?? [],
              matchConfidence: e.matchConfidence,
              matchedIndicators: e.matchedIndicators,
              sourcePack: e.packId,
              packVersion: e.packVersion,
            }))
          : undefined,
    });
    profiler.finish('reporting', { processed: 1 });

    session = updateSession(session, {
      stages: updateStage(
        session.stages,
        'reporting',
        'completed',
        profiler.getStageTiming('reporting')?.durationMs ?? 0,
      ),
    });
    renderer.onStageChange('reporting', 'completed');

    if (cancelled) {
      return await handleCancellation(session, renderer, profiler, savedOutputFiles);
    }

    // ── Stage 9: Export ──
    profiler.start('export');
    session = updateSession(session, {
      currentStage: 'export',
      stages: updateStage(session.stages, 'export', 'running'),
    });
    renderer.onStageChange('export', 'running');

    const formats = options.format ?? ['json', 'markdown'];
    const exportDir = options.output ?? path.resolve(process.cwd(), 'veris-output');

    savedOutputFiles = [];
    for (const format of formats) {
      const fmt = format.trim().toLowerCase();
      const ext = fmt === 'markdown' ? 'md' : fmt;
      const exportOpts: ExportOptions = {
        pretty: true,
        maxFindings: options.maxFindings,
      };

      try {
        const result = exportReport(report, fmt, exportOpts);
        await fsp.mkdir(exportDir, { recursive: true });
        const filePath = path.join(exportDir, `report.${ext}`);
        await fsp.writeFile(filePath, result.content, 'utf-8');
        savedOutputFiles.push(filePath);
      } catch (err) {
        const errInfo = errorFromException(err, 'EXPORT_ERROR', exportDir);
        renderer.onError(errInfo);
        diagnostics.push({
          artifactPath: exportDir,
          stage: 'analysis',
          code: 'EXPORT_ERROR',
          message: `Export failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    profiler.finish('export', { processed: savedOutputFiles.length });
    session = updateSession(session, {
      stages: updateStage(
        session.stages,
        'export',
        'completed',
        profiler.getStageTiming('export')?.durationMs ?? 0,
      ),
    });
    renderer.onStageChange('export', 'completed');

    // ── Profiler complete ──
    profiler.complete();
    const profilerSnapshot = profiler.snapshot();
    renderer.onProfilerSnapshot(profilerSnapshot);

    // ── Build final summary ──
    // Derive per-severity finding counts from the actual rule matches,
    // mirroring the report's canonical derivation (severity from confidence
    // contribution) so the CLI screen and the report always agree.
    const severityCounts: Record<string, number> = {};
    for (const match of pipelineResult.ruleMatches ?? []) {
      const level = severityLevelFromScore((match.confidenceContribution ?? 0) * 10);
      severityCounts[level] = (severityCounts[level] ?? 0) + 1;
    }

    const summary = Object.freeze({
      durationMs: session.elapsedMs,
      filesScanned: filesProcessed,
      artifacts: pipelineArtifacts.length,
      rulesExecuted: (pipelineResult.ruleMatches ?? []).length,
      evidenceCollected: allEvidence.length,
      findingsBySeverity: severityCounts,
      riskScore: pipelineResult.assessment?.riskScore ?? 0,
      confidence: pipelineResult.assessment?.confidence ?? 0.5,
      outputFiles: savedOutputFiles,
      warnings: diagnostics.filter((d) => d.code !== 'FATAL').length,
      errors: diagnostics.filter((d) => d.code === 'FATAL').length,
      skippedFiles,
      cancelled: false,
      knowledgePacksLoaded: packCount,
      knowledgeEnrichments: knowledgeEnrichments.length,
    });

    session = updateSession(session, {
      completed: true,
      progress: 1,
      summary,
      profilerSnapshot,
      statistics: {
        findings: (severityCounts.critical ?? 0) + (severityCounts.high ?? 0),
      },
    });

    renderer.onComplete(session, summary);

    return { exitCode: ExitCode.SUCCESS };
  } catch (error) {
    // Fatal error
    const message = error instanceof Error ? error.message : String(error);
    const errInfo = errorFromException(error, 'UNKNOWN_ERROR');
    renderer.onError(errInfo);

    const summary = buildMinimalSummary(
      session,
      session.filesProcessed,
      diagnostics,
      healthIssues,
      savedOutputFiles,
      cancelled,
    );
    renderer.onComplete(session, summary);

    process.stderr.write(`\nError: ${message}\n`);
    return { exitCode: ExitCode.ERROR };
  } finally {
    // The active flag is cleared before the deferred finalize (below) so a
    // Ctrl+C during the startup presentation window is still handled by the
    // CLI's global shutdown handler instead of being swallowed.
    scanActive = false;
    process.removeListener('SIGINT', sigintHandler);
    // dispose() may finish a deferred final transition (startup presentation
    // window); await it so the process does not exit before the screen is
    // complete on interactive terminals.
    await renderer.dispose();
  }
}

// ── Cancellation Handler ──

async function handleCancellation(
  session: ScanSession,
  renderer: ProgressRenderer,
  profiler: Profiler,
  outputFiles: string[],
): Promise<{ exitCode: number }> {
  profiler.complete();
  const profilerSnapshot = profiler.snapshot();
  renderer.onProfilerSnapshot(profilerSnapshot);

  const summary = Object.freeze({
    durationMs: session.elapsedMs,
    filesScanned: session.filesProcessed,
    artifacts: session.filesProcessed,
    rulesExecuted: 0,
    evidenceCollected: 0,
    findingsBySeverity: {} as Record<string, number>,
    riskScore: 0,
    confidence: 0,
    outputFiles,
    warnings: 0,
    errors: 0,
    skippedFiles: 0,
    cancelled: true,
  });

  const finalSession = updateSession(session, {
    completed: true,
    cancelled: true,
    summary,
    profilerSnapshot,
    progress: session.progress,
  });

  renderer.onCancel(finalSession);

  return { exitCode: ExitCode.SUCCESS };
}

// ── Build Minimal Summary ──

function buildMinimalSummary(
  session: ScanSession,
  filesScanned: number,
  diagnostics: ScanDiagnostic[],
  healthIssues: HealthIssue[],
  outputFiles: string[],
  cancelled: boolean,
) {
  return Object.freeze({
    durationMs: session.elapsedMs,
    filesScanned,
    artifacts: filesScanned,
    rulesExecuted: 0,
    evidenceCollected: session.statistics.evidenceCollected,
    findingsBySeverity: {} as Record<string, number>,
    riskScore: 0,
    confidence: 0,
    outputFiles,
    warnings: diagnostics.filter((d) => d.code !== 'FATAL').length,
    errors: diagnostics.filter((d) => d.code === 'FATAL').length,
    skippedFiles: 0,
    cancelled,
  });
}

// ── Stage State Helpers ──

function updateStage(
  stages: Record<string, StageState>,
  stageId: string,
  status: 'waiting' | 'running' | 'completed' | 'failed',
  durationMs?: number,
  itemsProcessed?: number,
  itemsFailed?: number,
): Record<string, StageState> {
  const now = Date.now();
  const existing = stages[stageId];
  const updated: Record<string, StageState> = { ...stages };
  updated[stageId] = Object.freeze({
    id: stageId,
    status,
    startedAt: existing?.startedAt ?? (status === 'running' ? now : null),
    completedAt: status === 'completed' || status === 'failed' ? now : null,
    durationMs: durationMs ?? existing?.durationMs ?? 0,
    itemsProcessed: itemsProcessed ?? existing?.itemsProcessed ?? 0,
    itemsFailed: itemsFailed ?? existing?.itemsFailed ?? 0,
  });
  return updated;
}

// ── Parse Function ──

export function parseScanArgs(args: readonly string[]): Omit<ScanOptions, 'computedAt'> {
  let target = '.';
  let format: string[] | undefined;
  let output: string | undefined;
  let maxFindings: number | undefined;
  let verbose = false;
  let silent = false;
  let progress: 'dashboard' | 'json' | 'silent' | 'auto' | undefined;

  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    switch (arg) {
      case '--output':
      case '-o': {
        i++;
        if (i >= args.length)
          throw new CliError('Missing value for --output', ExitCode.USAGE_ERROR);
        output = args[i];
        break;
      }

      case '--format':
      case '-f': {
        i++;
        if (i >= args.length)
          throw new CliError('Missing value for --format', ExitCode.USAGE_ERROR);
        format = args[i].split(',').map((f) => f.trim());
        break;
      }

      case '--max-findings': {
        i++;
        if (i >= args.length)
          throw new CliError('Missing value for --max-findings', ExitCode.USAGE_ERROR);
        maxFindings = parseInt(args[i], 10);
        if (isNaN(maxFindings) || maxFindings < 0) {
          throw new CliError(
            'Invalid value for --max-findings. Expected a positive number.',
            ExitCode.USAGE_ERROR,
          );
        }
        break;
      }

      case '--progress': {
        i++;
        if (i >= args.length)
          throw new CliError('Missing value for --progress', ExitCode.USAGE_ERROR);
        const mode = args[i].toLowerCase();
        if (!['dashboard', 'json', 'silent', 'auto'].includes(mode)) {
          throw new CliError(
            `Invalid progress mode: "${mode}". Expected dashboard, json, silent, or auto.`,
            ExitCode.USAGE_ERROR,
          );
        }
        progress = mode as typeof progress;
        break;
      }

      case '--silent':
        silent = true;
        break;

      case '--verbose':
        verbose = true;
        break;

      case '--help':
        process.stdout.write(SCAN_HELP);
        process.exit(ExitCode.SUCCESS);

      default:
        if (!arg.startsWith('--') && i === 0) {
          target = arg;
        } else {
          throw new CliError(`Unknown option: ${arg}`, ExitCode.USAGE_ERROR);
        }
    }

    i++;
  }

  return {
    target,
    format: format ?? ['json', 'markdown'],
    output,
    maxFindings: maxFindings ?? 1000,
    verbose,
    silent,
    progress,
  };
}
