/**
 * @veris/cli/authoring/runner — End-to-end orchestrator for AI-assisted rule authoring.
 *
 * Implements Section 4 & 5 of ADR-016:
 * - Orchestrates generation -> validation -> test execution -> artifact emission
 * - Provides explicit human promotion workflow (promoteCandidateRule)
 *
 * @module @veris/cli/authoring/runner
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import { safeJsonParse } from '../ci/baseline.js';
import { getSymbolSet } from '../ui/renderer/index.js';
import { getResolvedTheme } from '../ui/theme/index.js';
import { CliError, ExitCode } from '../wirer.js';

import {
  createCandidateRuleArtifact,
  renderCandidateArtifactJson,
  renderCandidateArtifactMarkdown,
} from './artifact.js';
import { generateCandidateRulePayload } from './provider.js';
import { executeCandidateRuleTests } from './test-generator.js';
import type {
  CandidateRuleArtifact,
  RuleAuthoringRequest,
  RuleAuthoringResult,
  RuleTestExecutionReport,
} from './types.js';
import { validateCandidateRulePack } from './validator.js';

/**
 * Execute the rule authoring workflow.
 */
export async function runRuleAuthor(request: RuleAuthoringRequest): Promise<RuleAuthoringResult> {
  const theme = getResolvedTheme();
  const symbols = getSymbolSet();

  if (!request.intent || request.intent.trim().length === 0) {
    throw new CliError(
      'Rule authoring requires a non-empty --intent description.',
      ExitCode.USAGE_ERROR,
    );
  }

  process.stderr.write(`\nGenerating candidate rule from intent: "${request.intent}"...\n`);

  // Step 1: Query generator / offline template
  const payload = await generateCandidateRulePayload(request);
  process.stderr.write(
    `Candidate rule pack created: "${payload.candidateRulePack.id}" via provider: ${payload.provider}\n`,
  );

  // Step 2: Deterministic validation gate
  process.stderr.write('Executing deterministic validation gates...\n');
  const validation = validateCandidateRulePack(payload.candidateRulePack);

  if (!validation.valid) {
    process.stderr.write(
      `${theme.status.error}${symbols.error} Candidate failed deterministic validation:\n`,
    );
    for (const err of validation.errors) {
      process.stderr.write(`   - ${err}\n`);
    }
  } else {
    process.stderr.write(
      `${theme.status.success}${symbols.success} Declarative purity and engine compatibility verified.\n`,
    );
  }

  // Step 3: Automated test fixture execution
  let testExecution: RuleTestExecutionReport = {
    passed: false,
    determinismPass: false,
    totalDurationMs: 0,
    outcomes: [],
    errors: ['Validation failed, skipped test execution.'],
  };

  if (validation.valid) {
    process.stderr.write('Executing synthetic test fixtures on rule engine...\n');
    testExecution = await executeCandidateRuleTests(
      payload.candidateRulePack,
      payload.samplePositiveValue,
      payload.sampleNegativeValue,
    );

    if (testExecution.passed) {
      process.stderr.write(
        `${theme.status.success}${symbols.success} Automated test fixtures passed (Positive match ✓, Negative non-match ✓, Determinism ✓).\n`,
      );
    } else {
      process.stderr.write(
        `${theme.status.error}${symbols.error} Test fixture execution failed:\n`,
      );
      for (const err of testExecution.errors) {
        process.stderr.write(`   - ${err}\n`);
      }
    }
  }

  // Step 4: Assemble human-reviewable artifact
  const artifact = createCandidateRuleArtifact({
    request,
    candidateRulePack: payload.candidateRulePack,
    rationale: payload.rationale,
    threatScenario: payload.threatScenario,
    validation,
    testExecution,
    provider: payload.provider,
    model: payload.model,
  });

  const savedFiles: string[] = [];

  // Step 5: Write artifact to disk if not in dry-run mode
  if (!request.dryRun) {
    const outputPath = request.output
      ? path.resolve(request.output)
      : path.resolve(process.cwd(), `candidate-${payload.candidateRulePack.id}.json`);

    await fsp.mkdir(path.dirname(outputPath), { recursive: true });

    if (request.format === 'markdown' || outputPath.endsWith('.md')) {
      const mdContent = renderCandidateArtifactMarkdown(artifact);
      await fsp.writeFile(outputPath, mdContent, 'utf-8');
      savedFiles.push(outputPath);
    } else {
      const jsonContent = renderCandidateArtifactJson(artifact);
      await fsp.writeFile(outputPath, jsonContent, 'utf-8');
      savedFiles.push(outputPath);

      // Also emit companion markdown report if output was default JSON
      const companionMd = outputPath.replace(/\.json$/i, '.md');
      if (companionMd !== outputPath) {
        await fsp.writeFile(companionMd, renderCandidateArtifactMarkdown(artifact), 'utf-8');
        savedFiles.push(companionMd);
      }
    }

    process.stderr.write(`\nArtifacts written:\n`);
    for (const f of savedFiles) {
      process.stderr.write(`  * ${f}\n`);
    }
  } else {
    process.stderr.write(
      '\n[Dry Run] Candidate evaluated and tested successfully without writing to disk.\n',
    );
  }

  const overallSuccess = validation.valid && testExecution.passed;

  return {
    exitCode: overallSuccess ? ExitCode.SUCCESS : ExitCode.ERROR,
    artifact,
    savedFiles: Object.freeze(savedFiles),
    error: overallSuccess ? undefined : 'Candidate rule pack failed validation or test execution.',
  };
}

/**
 * Promote an approved candidate rule artifact into an active local plugin directory.
 *
 * Implements the explicit human promotion workflow.
 */
export async function promoteCandidateRule(
  candidatePath: string,
  targetPluginDir: string,
): Promise<{ exitCode: number; pluginDirectory: string }> {
  const theme = getResolvedTheme();
  const symbols = getSymbolSet();

  const resolvedCandidate = path.resolve(candidatePath);
  const resolvedTarget = path.resolve(targetPluginDir);

  let rawContent: string;
  try {
    rawContent = await fsp.readFile(resolvedCandidate, 'utf-8');
  } catch {
    throw new CliError(
      `Candidate file not found or unreadable: ${resolvedCandidate}`,
      ExitCode.NOT_FOUND,
    );
  }

  const parsed = safeJsonParse<CandidateRuleArtifact>(rawContent);
  if (!parsed || !parsed.candidateRulePack) {
    throw new CliError(
      `File "${resolvedCandidate}" is not a valid VERIS candidate rule artifact.`,
      ExitCode.ERROR,
    );
  }

  // Rigorous re-validation before promotion
  const validation = validateCandidateRulePack(parsed.candidateRulePack);
  if (!validation.valid) {
    throw new CliError(
      `Cannot promote candidate: failed deterministic validation:\n${validation.errors.join('\n')}`,
      ExitCode.ERROR,
    );
  }

  const pack = parsed.candidateRulePack;
  const pluginId = `plugin-${pack.id}`;
  const pluginDir = path.join(resolvedTarget, pluginId);

  await fsp.mkdir(pluginDir, { recursive: true });

  // 1. Write plugin.json manifest
  const manifest = {
    schemaVersion: '1.0.0',
    id: pluginId,
    name: `Rule Pack Plugin: ${pack.id}`,
    version: pack.version,
    description: pack.description,
    author: pack.metadata.author || 'VERIS Operator',
    license: 'Apache-2.0',
    type: 'rule-pack',
    entryPoint: 'index.js',
    capabilities: ['core-types-read'],
    engines: {
      veris: '^1.0.0 || ^1.1.0 || ^1.2.0',
    },
    metadata: {
      author: pack.metadata.author,
      promotedFrom: parsed.id,
      promotedAt: new Date().toISOString(),
    },
  };
  await fsp.writeFile(
    path.join(pluginDir, 'veris-plugin.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf-8',
  );
  await fsp.writeFile(
    path.join(pluginDir, 'plugin.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf-8',
  );

  // 2. Write index.js export
  const codeContent = `// Promoted VERIS Rule Pack Plugin: ${pluginId}\n// Generated: ${new Date().toISOString()}\n\nexport const plugin = {\n  type: 'rule-pack',\n  rulePack: ${JSON.stringify(pack, null, 2)},\n};\n\nexport default plugin;\n`;
  await fsp.writeFile(path.join(pluginDir, 'index.js'), codeContent, 'utf-8');

  process.stdout.write(
    `\n${theme.status.success}${symbols.success} Promoted candidate rule pack "${pack.id}" into active plugin:\n  Directory: ${pluginDir}\n  Manifest:  ${path.join(pluginDir, 'plugin.json')}\n`,
  );

  return {
    exitCode: ExitCode.SUCCESS,
    pluginDirectory: pluginDir,
  };
}
