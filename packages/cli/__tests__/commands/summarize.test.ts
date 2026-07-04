/**
 * Tests for the summarize command.
 *
 * Tests use vi.spyOn for process.stdout.write instead of replacing
 * the property, which is read-only in modern Node.js.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseSummarizeArgs,
  runSummarize,
  SUMMARIZE_HELP,
  type SummarizeOptions,
} from '../../src/commands/summarize.js';
import { ExitCode, CliError } from '../../src/wirer.js';

// Mock the wirer module
vi.mock('../../src/wirer.js', async () => {
  const actual = await vi.importActual('../../src/wirer.js');
  return {
    ...actual,
    wireCli: vi.fn().mockImplementation(() => ({
      explainer: {},
      service: {
        explain: vi.fn().mockImplementation(async (target, _report, _mode) => {
          if (target.type !== 'report') {
            return {
              kind: 'error',
              code: 'REPORT_NOT_FOUND',
              message: 'Only report summaries are supported',
              subjectId: 'summary',
              subjectType: 'report',
              recoverable: false,
            };
          }
          return {
            kind: 'success',
            explanation: {
              id: 'exp_summary',
              subjectId: 'report-summary',
              subjectType: 'report',
              mode: _mode ?? 'technical',
              text: 'This is a test report summary covering all findings and risk assessment.',
              citations: [
                {
                  id: 'cit_1',
                  sourceType: 'report-meta',
                  sourceId: 'report:riskScore',
                  label: 'Report: Risk Score',
                  verified: true,
                },
              ],
              citationValidation: {
                valid: true,
                totalCitations: 1,
                verifiedCitations: 1,
                failedCitations: 0,
                citations: [],
              },
              provider: { id: 'test-provider', model: 'test-model' },
              promptVersion: '1.0.0',
              tokenUsage: {
                promptTokens: 200,
                completionTokens: 100,
                totalTokens: 300,
              },
              cached: false,
              refused: false,
              generatedAt: new Date().toISOString(),
              disclaimer: 'AI-generated summary.',
            },
          };
        }),
      },
      config: {
        defaultMode: 'technical',
        caching: false,
        provider: { active: 'test-provider', timeoutMs: 30000, maxRetries: 2 },
        tokenBudget: {
          maxContextTokens: 4000,
          maxOutputTokens: 1000,
          reservedForEvidence: 1500,
          reservedForRules: 500,
        },
        citationValidation: { enabled: true, strictMode: false, maxRetriesOnFailure: 1 },
        output: { maxLength: 2000, includeDisclaimer: true },
        logging: { auditEnabled: true, metricsEnabled: false },
      },
      report: { id: 'report-1', findings: [], summary: {} },
      logger: { info: vi.fn(), debug: vi.fn(), error: vi.fn() },
    })),
    formatResult: actual.formatResult,
    resultToExitCode: actual.resultToExitCode,
  };
});

describe('parseSummarizeArgs', () => {
  it('parses empty args with defaults', () => {
    const options = parseSummarizeArgs([]);
    expect(options.mode).toBeUndefined();
    expect(options.json).toBe(false);
    expect(options.noAudit).toBe(false);
    expect(options.offline).toBe(false);
  });

  it('parses --mode simple', () => {
    const options = parseSummarizeArgs(['--mode', 'simple']);
    expect(options.mode).toBe('simple');
  });

  it('parses --mode technical', () => {
    const options = parseSummarizeArgs(['--mode', 'technical']);
    expect(options.mode).toBe('technical');
  });

  it('parses --mode expert', () => {
    const options = parseSummarizeArgs(['--mode', 'expert']);
    expect(options.mode).toBe('expert');
  });

  it('parses --json flag', () => {
    const options = parseSummarizeArgs(['--json']);
    expect(options.json).toBe(true);
  });

  it('parses --no-audit flag', () => {
    const options = parseSummarizeArgs(['--no-audit']);
    expect(options.noAudit).toBe(true);
  });

  it('parses --offline flag', () => {
    const options = parseSummarizeArgs(['--offline']);
    expect(options.offline).toBe(true);
  });

  it('parses --report flag', () => {
    const options = parseSummarizeArgs(['--report', './custom-report.json']);
    expect(options.report).toBe('./custom-report.json');
  });

  it('parses --provider flag', () => {
    const options = parseSummarizeArgs(['--provider', 'openai']);
    expect(options.provider).toBe('openai');
  });

  it('parses --model flag', () => {
    const options = parseSummarizeArgs(['--model', 'gpt-4o']);
    expect(options.model).toBe('gpt-4o');
  });

  it('parses --verbose flag', () => {
    const options = parseSummarizeArgs(['--verbose']);
    expect(options.verbose).toBe(true);
  });

  it('parses combined flags', () => {
    const options = parseSummarizeArgs([
      '--mode',
      'expert',
      '--json',
      '--no-audit',
      '--offline',
      '--provider',
      'ollama',
      '--model',
      'llama3.1:8b',
    ]);
    expect(options.mode).toBe('expert');
    expect(options.json).toBe(true);
    expect(options.noAudit).toBe(true);
    expect(options.offline).toBe(true);
    expect(options.provider).toBe('ollama');
    expect(options.model).toBe('llama3.1:8b');
  });

  it('throws on invalid mode value', () => {
    expect(() => parseSummarizeArgs(['--mode', 'invalid'])).toThrow(CliError);
    expect(() => parseSummarizeArgs(['--mode', 'invalid'])).toThrow(/invalid mode/i);
  });

  it('throws on missing mode value', () => {
    expect(() => parseSummarizeArgs(['--mode'])).toThrow(CliError);
  });

  it('throws on unknown option', () => {
    expect(() => parseSummarizeArgs(['--bogus'])).toThrow(CliError);
    expect(() => parseSummarizeArgs(['--bogus'])).toThrow(/unknown option/i);
  });
});

describe('runSummarize', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('returns success result', async () => {
    const options: SummarizeOptions = {
      json: false,
      noAudit: false,
      offline: false,
      verbose: false,
    };

    const { result, exitCode } = await runSummarize(options);
    expect(result.kind).toBe('success');
    expect(exitCode).toBe(ExitCode.SUCCESS);
  });

  it('outputs JSON when --json is set', async () => {
    const options: SummarizeOptions = {
      json: true,
      noAudit: false,
      offline: false,
      verbose: false,
    };

    await runSummarize(options);
    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0][0];
    expect(typeof output).toBe('string');
    const parsed = JSON.parse(output as string);
    expect(parsed.kind).toBe('success');
  });

  it('passes mode to the service', async () => {
    const options: SummarizeOptions = {
      mode: 'simple',
      json: false,
      noAudit: false,
      offline: false,
      verbose: false,
    };

    await runSummarize(options);
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('handles --no-audit by passing it to wiring', async () => {
    const wirer = await import('../../src/wirer.js');
    const wireCliSpy = vi.mocked(wirer.wireCli);

    const options: SummarizeOptions = {
      json: false,
      noAudit: true,
      offline: false,
      verbose: false,
    };

    await runSummarize(options);
    expect(wireCliSpy).toHaveBeenCalledWith(expect.objectContaining({ noAudit: true }));
  });

  it('handles --offline by passing it to wiring', async () => {
    const wirer = await import('../../src/wirer.js');
    const wireCliSpy = vi.mocked(wirer.wireCli);

    const options: SummarizeOptions = {
      json: false,
      noAudit: false,
      offline: true,
      verbose: false,
    };

    await runSummarize(options);
    expect(wireCliSpy).toHaveBeenCalledWith(expect.objectContaining({ offline: true }));
  });
});
