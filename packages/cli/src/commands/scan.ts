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
import { createArtifact } from '@veris/core';
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
import { KnowledgeEngine } from '@veris/knowledge';
import { createDefaultPipeline } from '@veris/pipeline';
import {
  BUILT_IN_RECOMMENDATIONS,
  createRecommendationEngine,
  createRecommendationRegistry,
} from '@veris/recommendations';
import { buildReport } from '@veris/report';
import { deterministicId } from '@veris/shared';

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
  --silent                  Suppress progress output
  --verbose                 Enable verbose debug output
  --help                    Show this help message

EXAMPLES
  veris scan                            Scan current directory
  veris scan /path/to/target            Scan specific directory
  veris scan --output ./results         Save results to ./results
  veris scan --format json              JSON output only
  veris scan --format json,markdown     JSON and Markdown output

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

// ── Command Handler ──

export async function runScan(options: ScanOptions): Promise<{ exitCode: number }> {
  const { computedAt } = options;
  const MAX_DIAGNOSTICS = 1000;
  const diagnostics: ScanDiagnostic[] = [];
  function addDiagnostic(d: ScanDiagnostic): void {
    if (diagnostics.length < MAX_DIAGNOSTICS) {
      diagnostics.push(d);
    }
  }

  try {
    if (!options.silent) {
      process.stdout.write(`Scanning: ${options.target}\n`);
    }

    // ── Stage 1: Discovery ──
    const discoveryEngine = new DiscoveryEngine({
      includeHidden: false,
      includeHiddenDirs: false,
      maxDepth: 50,
      maxFiles: 100_000,
    });

    if (!options.silent) {
      process.stdout.write('  Discovering files...\n');
    }

    const discoveryResult = await discoveryEngine.discover(options.target);
    const totalFiles = discoveryResult.artifacts.filter(
      (a) => !a.isDirectory && !a.isSymlink,
    ).length;

    if (!options.silent) {
      process.stdout.write(`  Found ${totalFiles} files\n`);
    }

    if (totalFiles === 0) {
      if (!options.silent) {
        process.stdout.write('  No files found to scan.\n');
      }
      return { exitCode: ExitCode.SUCCESS };
    }

    // ── Stage 2: Classification ──
    const classificationEngine = new ClassificationEngine();

    if (!options.silent) {
      process.stdout.write('  Classifying artifacts...\n');
    }

    const classificationResults = await classificationEngine.classifyMany(
      discoveryResult.artifacts,
    );

    // Build classification lookup
    const classMap = new Map<string, (typeof classificationResults)[number]>();
    for (const cr of classificationResults) {
      classMap.set(cr.artifactId, cr);
    }

    // ── Stage 3: Extraction + Artifact Creation ──
    const extractorRegistry = new ExtractorRegistry();
    const knowledgeEngine = new KnowledgeEngine({
      extractedAt: computedAt,
    });
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

    if (!options.silent) {
      process.stdout.write('  Extracting features...\n');
    }

    for (const discovered of discoveryResult.artifacts) {
      if (discovered.isDirectory || discovered.isSymlink) continue;

      // Read file content
      let content: Buffer;
      try {
        content = await fsp.readFile(discovered.absolutePath);
      } catch (err) {
        addDiagnostic({
          artifactPath: discovered.absolutePath,
          stage: 'extraction',
          code: 'FILE_READ_ERROR',
          message: `Cannot read file: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }

      // Compute content hash
      const hash = createHash('sha256').update(content).digest('hex');
      const contentHash: ContentHash = { algorithm: 'sha-256', value: hash };

      // Get classification for this artifact
      const classification = classMap.get(discovered.id);
      const artifactType = categoryToArtifactType(
        classification?.category,
        classification?.subType,
      );

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

      // Run extraction (features are scoped to this artifact)
      const extractionContext: ExtractionContext = {
        artifact,
        sessionId,
        content,
        config: {},
      };

      let rawFeatures: readonly RawFeature[];
      try {
        const extractionResult = await extractorRegistry.extract(extractionContext);
        rawFeatures = extractionResult.features;
      } catch (err) {
        addDiagnostic({
          artifactPath: discovered.absolutePath,
          stage: 'extraction',
          code: 'EXTRACTION_FAILED',
          message: `Extractor registry failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }

      // ── Stage 4: Knowledge (normalize features) ──

      // Bridge: extractor RawFeature → knowledge RawFeature
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
        addDiagnostic({
          artifactPath: discovered.absolutePath,
          stage: 'knowledge',
          code: 'KNOWLEDGE_FAILED',
          message: `Knowledge engine failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }

      // Update totals
      featuresExtracted += rawFeatures.length;

      // ── Stage 5: Analysis (produce evidence from normalized features) ──
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
        analysisResult = await analysisEngine.analyzeArtifact(artifact, sessionId, featureRefs);
      } catch (err) {
        addDiagnostic({
          artifactPath: discovered.absolutePath,
          stage: 'analysis',
          code: 'ANALYSIS_FAILED',
          message: `Analysis engine failed: ${err instanceof Error ? err.message : String(err)}`,
        });
        continue;
      }

      allEvidence.push(...analysisResult.evidence);
      filesProcessed++;
    }

    // ── Stage 6: Pipeline (Rules → Correlation → Risk → Decision) ──
    if (!options.silent) {
      process.stdout.write(`  Running pipeline (${allEvidence.length} evidence items)...\n`);
    }

    const pipeline = createDefaultPipeline({
      riskEvaluator: { computedAt },
    });

    const pipelineInput = {
      artifacts: pipelineArtifacts,
      evidence: allEvidence,
      features: [] as readonly FeatureReference[],
      sessionId,
    };

    const pipelineResult = await pipeline.run(pipelineInput);

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
      ruleMatchIds: (pipelineResult.ruleMatches ?? []).map((m) => m.ruleId),
      correlationIds: (pipelineResult.correlations ?? []).map((c) => c.id),
      evidenceIds: (pipelineResult.assessment.contributions ?? []).map((c) => c.id),
    };
    const recommendationResult = recommendationEngine.evaluate(recommendationInput);
    if (options.verbose) {
      process.stdout.write(`  Recommendations: ${recommendationResult.totalCount}\n`);
    }

    // ── Stage 8: Report ──
    if (!options.silent) {
      process.stdout.write('  Building report...\n');
    }

    const report = buildReport(pipelineResult, pipelineInput, {
      target: options.target,
      generatedAt: computedAt,
      sessionId,
    });

    // ── Stage 8: Export ──
    const formats = options.format ?? ['json', 'markdown'];
    const exportDir = options.output ?? path.resolve(process.cwd(), 'veris-output');

    for (const format of formats) {
      const fmt = format.trim().toLowerCase();
      const ext = fmt === 'markdown' ? 'md' : fmt;
      const exportOpts: ExportOptions = {
        pretty: true,
        maxFindings: options.maxFindings,
      };

      const result = exportReport(report, fmt, exportOpts);

      await fsp.mkdir(exportDir, { recursive: true });
      const filePath = path.join(exportDir, `report.${ext}`);
      await fsp.writeFile(filePath, result.content, 'utf-8');

      if (!options.silent) {
        process.stdout.write(`  Wrote ${filePath}\n`);
      }
    }

    // Print summary
    if (!options.silent) {
      process.stdout.write('\nScan complete.\n');
      process.stdout.write(`  Files scanned:  ${filesProcessed}\n`);
      process.stdout.write(`  Features:      ${featuresExtracted}\n`);
      process.stdout.write(`  Evidence:      ${allEvidence.length}\n`);
      process.stdout.write(`  Findings:      ${report.summary.totalFindings}\n`);
      process.stdout.write(`  Risk Score:    ${report.riskProfile.riskScore.toFixed(2)} / 10.0\n`);
      process.stdout.write(`  Risk Level:    ${report.riskProfile.riskLevel}\n`);
      process.stdout.write(
        `  Trust Score:   ${(report.trustProfile.trustScore * 100).toFixed(1)}%\n`,
      );
      process.stdout.write(`  Output:        ${exportDir}/\n`);

      if (diagnostics.length > 0 && options.verbose) {
        process.stdout.write(`\n  Diagnostics (${diagnostics.length}):\n`);
        for (const d of diagnostics) {
          process.stdout.write(`    [${d.stage}] ${d.code}: ${d.message} (${d.artifactPath})\n`);
        }
      }
    }

    return { exitCode: ExitCode.SUCCESS };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error: ${message}\n`);
    return { exitCode: ExitCode.ERROR };
  }
}

// ── Parse Function ──

export function parseScanArgs(args: readonly string[]): Omit<ScanOptions, 'computedAt'> {
  let target = '.';
  let format: string[] | undefined;
  let output: string | undefined;
  let maxFindings: number | undefined;
  let verbose = false;
  let silent = false;

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
  };
}
