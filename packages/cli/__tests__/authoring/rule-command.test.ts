/**
 * Tests for `veris rule` command runner and promotion workflow (Phase 12).
 */

import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { validatePluginManifest } from '@veris/plugins';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { promoteCandidateRule, runRuleAuthor } from '../../src/authoring/runner.js';
import { parseRuleArgs, runRule } from '../../src/commands/rule.js';
import { ExitCode } from '../../src/wirer.js';

describe('Phase 12: `veris rule` CLI Command & Promotion Workflow', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'veris-rule-test-'));
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it('runs rule authoring in dry-run mode without writing files', async () => {
    const result = await runRuleAuthor({
      intent: 'Detect sensitive environment variable dumps',
      category: 'exfiltration',
      severity: 'high',
      dryRun: true,
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.artifact).toBeDefined();
    expect(result.artifact?.validation.valid).toBe(true);
    expect(result.artifact?.testExecution.passed).toBe(true);
    expect(result.savedFiles).toHaveLength(0);
  });

  it('generates candidate rule artifact files on disk', async () => {
    const candidateFile = path.join(tmpDir, 'test-candidate.json');
    const result = await runRuleAuthor({
      intent: 'Flag cleartext database passwords',
      output: candidateFile,
      severity: 'critical',
    });

    expect(result.exitCode).toBe(ExitCode.SUCCESS);
    expect(result.savedFiles).toContain(candidateFile);

    const exists = await fsp
      .stat(candidateFile)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);

    const content = await fsp.readFile(candidateFile, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.candidateRulePack.rules).toHaveLength(1);
    expect(parsed.validation.valid).toBe(true);
  });

  it('executes human promotion workflow to create an active plugin directory', async () => {
    // Step 1: Generate candidate artifact
    const candidateFile = path.join(tmpDir, 'candidate.json');
    await runRuleAuthor({
      intent: 'Detect unauthorized token access',
      name: 'Token Access Check',
      category: 'credential-access',
      output: candidateFile,
      severity: 'high',
    });

    // Step 2: Promote to plugin directory
    const targetPluginDir = path.join(tmpDir, 'installed-plugins');
    const promoRes = await promoteCandidateRule(candidateFile, targetPluginDir);

    expect(promoRes.exitCode).toBe(ExitCode.SUCCESS);
    expect(promoRes.pluginDirectory).toContain('plugin-pack-');

    // Step 3: Verify plugin files exist and conform to plugin host
    const manifestPath = path.join(promoRes.pluginDirectory, 'plugin.json');
    const indexPath = path.join(promoRes.pluginDirectory, 'index.js');

    const manifestExists = await fsp
      .stat(manifestPath)
      .then(() => true)
      .catch(() => false);
    const indexExists = await fsp
      .stat(indexPath)
      .then(() => true)
      .catch(() => false);

    expect(manifestExists).toBe(true);
    expect(indexExists).toBe(true);

    const manifestRaw = JSON.parse(await fsp.readFile(manifestPath, 'utf-8'));
    const valRes = validatePluginManifest(manifestRaw);
    expect(valRes.valid).toBe(true);
    expect(manifestRaw.type).toBe('rule-pack');
  });

  it('parses rule command arguments correctly', () => {
    const parsed = parseRuleArgs([
      'author',
      '--intent',
      'Detect reverse shell patterns',
      '--category',
      'execution',
      '--severity',
      'critical',
      '--dry-run',
    ]);

    expect(parsed.mode).toBe('author');
    expect(parsed.authorRequest?.intent).toBe('Detect reverse shell patterns');
    expect(parsed.authorRequest?.category).toBe('execution');
    expect(parsed.authorRequest?.severity).toBe('critical');
    expect(parsed.authorRequest?.dryRun).toBe(true);
  });

  it('executes `runRule` end-to-end with dry-run', async () => {
    const res = await runRule([
      'author',
      '--intent',
      'Detect backdoor port listening',
      '--dry-run',
    ]);
    expect(res.exitCode).toBe(ExitCode.SUCCESS);
  });
});
