/**
 * VERIS Pipeline Stage Profiler — measures individual pipeline stage durations.
 *
 * Runs each stage of the VERIS pipeline with high-resolution timing,
 * measuring: discovery, classification, extraction, knowledge/analysis,
 * rules/correlation/risk (pipeline), reporting, and export.
 *
 * @module @veris/perf
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
import type { ExtractionContext } from '@veris/extractors';
import { KnowledgeEngine } from '@veris/knowledge';
import { createDefaultPipeline } from '@veris/pipeline';
import { buildReport } from '@veris/report';
import { deterministicId } from '@veris/shared';

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

/**
 * Measure timings for each individual pipeline stage.
 * Returns stage durations in milliseconds (rounded to 2 decimal places).
 */
export async function measureStageTimings(
  targetDir: string,
  computedAt: string,
): Promise<Record<string, number>> {
  const timings: Record<string, number> = {};

  // ── Stage 1: Discovery ──
  const t0 = performance.now();
  const discoveryEngine = new DiscoveryEngine({
    includeHidden: false,
    includeHiddenDirs: false,
    maxDepth: 50,
    maxFiles: 100_000,
  });
  const discoveryResult = await discoveryEngine.discover(targetDir);
  timings.discovery = Math.round((performance.now() - t0) * 100) / 100;

  // ── Stage 2: Classification ──
  const t1 = performance.now();
  const classificationEngine = new ClassificationEngine();
  const classificationResults = await classificationEngine.classifyMany(discoveryResult.artifacts);
  timings.classification = Math.round((performance.now() - t1) * 100) / 100;

  const classMap = new Map<string, (typeof classificationResults)[number]>();
  for (const cr of classificationResults) {
    classMap.set(cr.artifactId, cr);
  }

  // ── Setup Extractors & Analyzers ──
  const extractorRegistry = new ExtractorRegistry();
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

  const sessionId = deterministicId('bench-sess', computedAt);
  const filesToProcess = discoveryResult.artifacts.filter((a) => !a.isDirectory && !a.isSymlink);
  const pipelineArtifacts: Artifact[] = [];
  const allEvidence: AnalysisEvidence[] = [];

  // ── Stage 3: Extraction ──
  let extractionMs = 0;
  let knowledgeMs = 0;
  let analysisMs = 0;

  for (const discovered of filesToProcess) {
    let content: Buffer;
    try {
      content = await fsp.readFile(discovered.absolutePath);
    } catch {
      continue;
    }

    const classification = classMap.get(discovered.id);
    const artifactType = categoryToArtifactType(classification?.category, classification?.subType);
    const hash = createHash('sha256').update(content).digest('hex');
    const contentHash: ContentHash = { algorithm: 'sha-256', value: hash };

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
      extractorId: 'bench-perf',
    });
    pipelineArtifacts.push(artifact);

    // Extraction
    const tExtract = performance.now();
    const extractionContext: ExtractionContext = { artifact, sessionId, content, config: {} };
    let rawFeatures: readonly import('@veris/extractors').RawFeature[] = [];
    try {
      const extractionResult = await extractorRegistry.extract(extractionContext);
      rawFeatures = extractionResult.features;
    } catch {
      // Continue on extraction error
    }
    extractionMs += performance.now() - tExtract;

    // Knowledge
    const tKnow = performance.now();
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

    let featureRefs: FeatureReference[] = [];
    try {
      const knowledgeResult = await knowledgeEngine.processArtifact(
        artifact,
        sessionId,
        knowledgeRawFeatures,
      );
      featureRefs = knowledgeResult.featureSet.features.map((f) => ({
        id: f.id,
        type: f.type,
        value: f.value,
        confidence: f.confidence,
        location: f.location,
        metadata: f.metadata,
      }));
    } catch {
      // Continue
    }
    knowledgeMs += performance.now() - tKnow;

    // Analysis
    const tAnalysis = performance.now();
    try {
      const analysisResult = await analysisEngine.analyzeArtifact(
        artifact,
        sessionId,
        featureRefs,
        undefined,
        content,
      );
      allEvidence.push(...analysisResult.evidence);
    } catch {
      // Continue
    }
    analysisMs += performance.now() - tAnalysis;
  }

  timings.extraction = Math.round(extractionMs * 100) / 100;
  timings.knowledge = Math.round(knowledgeMs * 100) / 100;
  timings.analysis = Math.round(analysisMs * 100) / 100;

  // ── Stage 4: Pipeline (Rules + Correlation + Risk) ──
  const tPipeline = performance.now();
  const pipeline = createDefaultPipeline({ riskEvaluator: { computedAt } });
  const pipelineInput = {
    artifacts: pipelineArtifacts,
    evidence: allEvidence,
    features: [] as readonly FeatureReference[],
    sessionId,
  };
  const pipelineResult = await pipeline.run(pipelineInput);
  timings.rulesAndRisk = Math.round((performance.now() - tPipeline) * 100) / 100;

  // ── Stage 5: Reporting ──
  const tReport = performance.now();
  const report = buildReport(pipelineResult, pipelineInput, {
    target: targetDir,
    generatedAt: computedAt,
    sessionId,
  });
  timings.reporting = Math.round((performance.now() - tReport) * 100) / 100;

  // ── Stage 6: Export ──
  const tExport = performance.now();
  exportReport(report, 'json', { pretty: true });
  exportReport(report, 'markdown', { pretty: true });
  timings.export = Math.round((performance.now() - tExport) * 100) / 100;

  return timings;
}
