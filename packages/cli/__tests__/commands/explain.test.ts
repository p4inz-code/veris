/**
 * Tests for the explain command.
 *
 * Tests use vi.spyOn for process.stdout.write instead of replacing
 * the property, which is read-only in modern Node.js.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseExplainArgs,
  runExplain,
  EXPLAIN_HELP,
  type ExplainOptions,
} from '../../src/commands/explain.js';
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
          if (target.type === 'finding' && target.id === 'NOT_FOUND') {
            return {
              kind: 'error',
              code: 'FINDING_NOT_FOUND',
              message: 'Finding not found',
              subjectId: 'NOT_FOUND',
              subjectType: 'finding',
              recoverable: false,
            };
          }
          return {
            kind: 'success',
            explanation: {
              id: 'exp_1',
              subjectId: target.id,
              subjectType: target.type,
              mode: _mode ?? 'technical',
              text: 'This is a test explanation for the finding.',
              citations: [
                {
                  id: 'cit_1',
                  sourceType: 'finding',
                  sourceId: target.id,
                  label: `Finding: ${target.id}`,
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
                promptTokens: 100,
                completionTokens: 50,
                totalTokens: 150,
              },
              cached: false,
              refused: false,
              generatedAt: new Date().toISOString(),
              disclaimer: 'AI-generated explanation.',
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

describe('parseExplainArgs', () => {
  it('parses finding ID from positional args', () => {
    const options = parseExplainArgs(['fin_abc123']);
    expect(options.subjectType).toBe('finding');
    expect(options.subjectId).toBe('fin_abc123');
    expect(options.mode).toBeUndefined();
    expect(options.json).toBe(false);
  });

  it("parses 'chain' keyword to set chain subject type", () => {
    const options = parseExplainArgs(['chain', 'bc_abc123']);
    expect(options.subjectType).toBe('chain');
    expect(options.subjectId).toBe('bc_abc123');
  });

  it("parses 'risk' keyword to set risk subject type", () => {
    const options = parseExplainArgs(['risk', 'D500']);
    expect(options.subjectType).toBe('risk');
    expect(options.subjectId).toBe('D500');
  });

  it('parses --mode flag', () => {
    const options = parseExplainArgs(['fin_abc123', '--mode', 'simple']);
    expect(options.mode).toBe('simple');
  });

  it('parses --mode technical', () => {
    const options = parseExplainArgs(['fin_abc123', '--mode', 'technical']);
    expect(options.mode).toBe('technical');
  });

  it('parses --mode expert', () => {
    const options = parseExplainArgs(['fin_abc123', '--mode', 'expert']);
    expect(options.mode).toBe('expert');
  });

  it('parses --json flag', () => {
    const options = parseExplainArgs(['fin_abc123', '--json']);
    expect(options.json).toBe(true);
  });

  it('parses --report flag', () => {
    const options = parseExplainArgs(['fin_abc123', '--report', './custom-report.json']);
    expect(options.report).toBe('./custom-report.json');
  });

  it('parses --provider flag', () => {
    const options = parseExplainArgs(['fin_abc123', '--provider', 'ollama']);
    expect(options.provider).toBe('ollama');
  });

  it('parses --model flag', () => {
    const options = parseExplainArgs(['fin_abc123', '--model', 'llama3.1:8b']);
    expect(options.model).toBe('llama3.1:8b');
  });

  it('parses --no-audit flag', () => {
    const options = parseExplainArgs(['fin_abc123', '--no-audit']);
    expect(options.noAudit).toBe(true);
  });

  it('parses --offline flag', () => {
    const options = parseExplainArgs(['fin_abc123', '--offline']);
    expect(options.offline).toBe(true);
  });

  it('parses --verbose flag', () => {
    const options = parseExplainArgs(['fin_abc123', '--verbose']);
    expect(options.verbose).toBe(true);
  });

  it('parses combined flags', () => {
    const options = parseExplainArgs([
      'fin_abc123',
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
    expect(options.subjectId).toBe('fin_abc123');
    expect(options.mode).toBe('expert');
    expect(options.json).toBe(true);
    expect(options.noAudit).toBe(true);
    expect(options.offline).toBe(true);
    expect(options.provider).toBe('ollama');
    expect(options.model).toBe('llama3.1:8b');
  });

  it('throws on missing subject ID', () => {
    expect(() => parseExplainArgs([])).toThrow(CliError);
    expect(() => parseExplainArgs([])).toThrow(/missing required argument/i);
  });

  it('throws on invalid mode value', () => {
    expect(() => parseExplainArgs(['fin_abc123', '--mode', 'invalid'])).toThrow(CliError);
    expect(() => parseExplainArgs(['fin_abc123', '--mode', 'invalid'])).toThrow(/invalid mode/i);
  });

  it('throws on missing mode value', () => {
    expect(() => parseExplainArgs(['fin_abc123', '--mode'])).toThrow(CliError);
  });

  it('throws on unknown option', () => {
    expect(() => parseExplainArgs(['fin_abc123', '--bogus'])).toThrow(CliError);
    expect(() => parseExplainArgs(['fin_abc123', '--bogus'])).toThrow(/unknown option/i);
  });

  it('throws on missing provider value', () => {
    expect(() => parseExplainArgs(['fin_abc123', '--provider'])).toThrow(CliError);
  });

  it('throws on missing model value', () => {
    expect(() => parseExplainArgs(['fin_abc123', '--model'])).toThrow(CliError);
  });

  it('throws on missing report value', () => {
    expect(() => parseExplainArgs(['fin_abc123', '--report'])).toThrow(CliError);
  });
});

describe('runExplain', () => {
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

  it('returns success result for a valid finding', async () => {
    const options: ExplainOptions = {
      subjectType: 'finding',
      subjectId: 'fin_abc123',
      json: false,
      noAudit: false,
      offline: false,
      verbose: false,
    };

    const { result, exitCode } = await runExplain(options);
    expect(result.kind).toBe('success');
    expect(exitCode).toBe(ExitCode.SUCCESS);
  });

  it('returns not found error for missing finding', async () => {
    const options: ExplainOptions = {
      subjectType: 'finding',
      subjectId: 'NOT_FOUND',
      json: false,
      noAudit: false,
      offline: false,
      verbose: false,
    };

    const { result, exitCode } = await runExplain(options);
    expect(result.kind).toBe('error');
    expect((result as { code: string }).code).toBe('FINDING_NOT_FOUND');
    expect(exitCode).toBe(ExitCode.NOT_FOUND);
  });

  it('outputs JSON when --json is set', async () => {
    const options: ExplainOptions = {
      subjectType: 'finding',
      subjectId: 'fin_abc123',
      json: true,
      noAudit: false,
      offline: false,
      verbose: false,
    };

    await runExplain(options);
    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls[0][0];
    expect(typeof output).toBe('string');
    // Should be parseable JSON
    const parsed = JSON.parse(output as string);
    expect(parsed.kind).toBe('success');
  });

  it('passes mode to the service', async () => {
    const options: ExplainOptions = {
      subjectType: 'finding',
      subjectId: 'fin_abc123',
      mode: 'simple',
      json: false,
      noAudit: false,
      offline: false,
      verbose: false,
    };

    await runExplain(options);
    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('handles chain subject type', async () => {
    const options: ExplainOptions = {
      subjectType: 'chain',
      subjectId: 'bc_abc123',
      json: false,
      noAudit: false,
      offline: false,
      verbose: false,
    };

    const { result, exitCode } = await runExplain(options);
    expect(result.kind).toBe('success');
    expect(exitCode).toBe(ExitCode.SUCCESS);
  });

  it('handles risk subject type', async () => {
    const options: ExplainOptions = {
      subjectType: 'risk',
      subjectId: 'D500',
      json: false,
      noAudit: false,
      offline: false,
      verbose: false,
    };

    const { result, exitCode } = await runExplain(options);
    expect(result.kind).toBe('success');
    expect(exitCode).toBe(ExitCode.SUCCESS);
  });

  it('handles --no-audit by passing it to wiring', async () => {
    const wirer = await import('../../src/wirer.js');
    const wireCliSpy = vi.mocked(wirer.wireCli);

    const options: ExplainOptions = {
      subjectType: 'finding',
      subjectId: 'fin_abc123',
      json: false,
      noAudit: true,
      offline: false,
      verbose: false,
    };

    await runExplain(options);
    expect(wireCliSpy).toHaveBeenCalledWith(expect.objectContaining({ noAudit: true }));
  });

  it('handles --offline by passing it to wiring', async () => {
    const wirer = await import('../../src/wirer.js');
    const wireCliSpy = vi.mocked(wirer.wireCli);

    const options: ExplainOptions = {
      subjectType: 'finding',
      subjectId: 'fin_abc123',
      json: false,
      noAudit: false,
      offline: true,
      verbose: false,
    };

    await runExplain(options);
    expect(wireCliSpy).toHaveBeenCalledWith(expect.objectContaining({ offline: true }));
  });
});
