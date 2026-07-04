/**
 * CLI wiring — dependency injection for explain and summarize commands.
 *
 * Wires together:
 *   @veris/explain → ExplanationEngine (with provider, prompts, cache, logging)
 *   @veris/config  → Configuration loading
 *   @veris/logger  → Logging
 *   @veris/ai      → Provider registry + factory
 *
 * @module @veris/cli/wirer
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { LLMProvider, ProviderRegistryOptions } from '@veris/ai';
import { createProviderRegistry, defaultProviderFactory } from '@veris/ai';
import type { CanonicalReport } from '@veris/core';
import {
  TemplateRegistry,
  createExplainer,
  createExplanationCache,
  type Explainer,
  type ExplanationMode,
  type ExplainConfig,
  type ExplainResult,
  type ExplanationService,
  ExplanationService as ExplainServiceClass,
  loadExplainConfig,
  validateExplainConfig,
  mergeExplainConfigs,
  freezeExplainConfig,
  getDefaultExplainConfig,
  type PromptRegistry,
} from '@veris/explain';
import { createLogger, type Logger } from '@veris/logger';

// ── Constants ──

/** CLI tool version (matches package.json). */
export const CLI_VERSION = '0.1.0';

/** Default report file paths to search (in order). */
const DEFAULT_REPORT_PATHS = [
  './veris-output/report.json',
  './.veris/report.json',
  './report.json',
];

/** Exit codes for the CLI. */
export const ExitCode = {
  SUCCESS: 0,
  ERROR: 1,
  USAGE_ERROR: 2,
  NOT_FOUND: 3,
  PROVIDER_UNAVAILABLE: 4,
  CACHE_ERROR: 5,
} as const;

/** Exit code type. */
export type ExitCodeValue = (typeof ExitCode)[keyof typeof ExitCode];

// ── Wired Context ──

/** Fully wired CLI context for explain and summarize commands. */
export interface CliContext {
  readonly explainer: Explainer;
  readonly service: ExplanationService;
  readonly config: ExplainConfig;
  readonly report: CanonicalReport;
  readonly logger: Logger;
}

// ── Wire Options ──

/** Options for wiring the CLI context. */
export interface WireOptions {
  readonly reportPath?: string;
  readonly customConfig?: Partial<ExplainConfig>;
  readonly mode?: ExplanationMode;
  readonly provider?: string;
  readonly model?: string;
  readonly noAudit?: boolean;
  readonly offline?: boolean;
  readonly verbose?: boolean;
}

// ── Wire Function ──

/**
 * Wire all dependencies for the explain CLI.
 *
 * @param options - CLI options that affect wiring.
 * @returns A fully wired CLI context.
 * @throws If the report cannot be loaded or configuration is invalid.
 */
export function wireCli(options?: WireOptions): CliContext {
  // 1. Create logger
  const logger = createLogger('veris-cli', {
    level: options?.verbose ? 'debug' : 'info',
  });

  // 2. Load configuration
  const config = loadConfig(options);
  logger.debug('Configuration loaded', { defaultMode: config.defaultMode });

  // 3. Load report
  const reportPath = options?.reportPath ?? findReport();
  const report = loadReport(reportPath);
  logger.debug('Report loaded', {
    reportId: report.id,
    findings: report.findings.length,
  });

  // 4. Create prompt registry (loads templates from @veris/explain)
  const promptRegistry: PromptRegistry = new TemplateRegistry();
  logger.debug('Prompt registry created');

  // 5. Create provider registry with configured providers
  const registryOptions: ProviderRegistryOptions = {
    activeProviderId: config.provider.active || undefined,
  };
  const providerRegistry = createProviderRegistry(loadProviders(options), registryOptions);
  logger.debug('Provider registry created', {
    active: config.provider.active,
    size: providerRegistry.size,
  });

  // 6. Create cache (if caching enabled)
  const cache = config.caching ? createExplanationCache({ maxEntries: 100 }) : undefined;

  // 7. Create the explainer engine
  const explainer = createExplainer({
    providerRegistry,
    promptRegistry,
    cache,
    config,
    logger,
  });

  // 8. Create the service wrapper
  const service = new ExplainServiceClass(explainer);

  return {
    explainer,
    service,
    config,
    report,
    logger,
  };
}

// ── Provider Loading ──

/**
 * Load provider instances from CLI options and environment.
 *
 * Creates LLMProvider instances based on available configuration:
 * - CLI --provider and --model flags override the active provider
 * - Falls back to a MockAdapter for testing/demo if no provider is configured
 *
 * @param options - CLI options with provider/model overrides.
 * @returns Array of LLMProvider instances.
 */
function loadProviders(options?: WireOptions): LLMProvider[] {
  const providers: LLMProvider[] = [];

  // Determine provider type and model from CLI flags or env
  const providerId = options?.provider ?? process.env.VERIS_EXPLAIN_PROVIDER ?? 'mock';
  const modelName = options?.model ?? process.env.VERIS_EXPLAIN_MODEL ?? undefined;
  const apiKey = process.env.VERIS_EXPLAIN_API_KEY;
  const endpoint = process.env.VERIS_EXPLAIN_ENDPOINT;

  // Map provider ID to type for the factory
  const providerType = mapProviderIdToType(providerId);

  try {
    const provider = defaultProviderFactory.createProvider({
      type: providerType,
      apiKey: apiKey,
      model: modelName,
      endpoint: endpoint,
    });

    providers.push(provider);
  } catch (providerErr) {
    // Provider creation failed — log warning and continue.
    // The error will surface as "Provider unavailable" when the user
    // tries to use the explain or summarize command.
    process.stderr.write(
      `Warning: Failed to initialize AI provider "${providerId}": ${providerErr instanceof Error ? providerErr.message : String(providerErr)}\n`,
    );
  }

  return providers;
}

/**
 * Map a provider ID to a factory type.
 */
function mapProviderIdToType(
  id: string,
): 'openai' | 'anthropic' | 'ollama' | 'openai-compatible' | 'mock' {
  switch (id) {
    case 'openai':
      return 'openai';
    case 'anthropic':
      return 'anthropic';
    case 'ollama':
      return 'ollama';
    case 'openai-compatible':
    case 'lm-studio':
    case 'localai':
      return 'openai-compatible';
    case 'mock':
      return 'mock';
    default:
      return 'mock';
  }
}

// ── Configuration Loading ──

/**
 * Load and merge the explain configuration.
 *
 * Priority (lowest → highest):
 *   Defaults → File config → CLI flags
 *
 * @param options - CLI options that override config.
 * @returns A frozen, validated ExplainConfig.
 */
function loadConfig(options?: WireOptions): ExplainConfig {
  // Start with defaults
  let config = getDefaultExplainConfig();

  // Merge in config from file (if available) using the loadExplainConfig result
  const loadResult = loadExplainConfig();
  if (loadResult.validation.valid || loadResult.validation.canFallback) {
    config = loadResult.config;
  }

  // Build CLI overrides
  const cliOverrides: Record<string, unknown> = {};

  if (options?.mode) {
    cliOverrides.defaultMode = options.mode;
  }

  if (options?.noAudit !== undefined) {
    cliOverrides.logging = {
      ...config.logging,
      auditEnabled: !options.noAudit,
    };
  }

  if (options?.provider) {
    cliOverrides.provider = {
      ...config.provider,
      active: options.provider,
    };
  }

  if (options?.offline) {
    cliOverrides.provider = {
      ...((cliOverrides.provider as Record<string, unknown>) ?? config.provider),
      active: 'ollama',
    };
  }

  // Apply overrides using mergeExplainConfigs
  if (Object.keys(cliOverrides).length > 0) {
    config = mergeExplainConfigs(config, cliOverrides as Partial<ExplainConfig>);
  }

  // Validate
  const validation = validateExplainConfig(config);
  if (!validation.valid) {
    const errors = validation.issues.filter((i) => i.severity === 'error').map((i) => i.message);

    if (errors.length > 0) {
      throw new CliError(
        `Configuration validation failed:\n${errors.join('\n')}`,
        ExitCode.USAGE_ERROR,
      );
    }
  }

  return freezeExplainConfig(config);
}

// ── Report Loading ──

/**
 * Find the report file by searching default paths.
 *
 * @returns The path to the report file.
 * @throws If no report file is found.
 */
function findReport(): string {
  for (const reportPath of DEFAULT_REPORT_PATHS) {
    if (fs.existsSync(reportPath)) {
      return reportPath;
    }
  }

  throw new CliError(
    "No report found. Run 'veris scan' first, or specify --report <path>.",
    ExitCode.NOT_FOUND,
  );
}

/**
 * Load a CanonicalReport from a JSON file.
 *
 * @param reportPath - Path to the report JSON file.
 * @returns The loaded CanonicalReport.
 * @throws If the file cannot be read or parsed.
 */
function loadReport(reportPath: string): CanonicalReport {
  const absolutePath = path.resolve(reportPath);

  if (!fs.existsSync(absolutePath)) {
    throw new CliError(`Report file not found: ${absolutePath}`, ExitCode.NOT_FOUND);
  }

  try {
    const content = fs.readFileSync(absolutePath, 'utf-8');
    const report = JSON.parse(content) as CanonicalReport;

    // Basic validation
    if (!report.id || !report.findings || !report.summary) {
      throw new CliError(
        'Invalid report format. Expected a valid CanonicalReport JSON.',
        ExitCode.USAGE_ERROR,
      );
    }

    return report;
  } catch (error) {
    if (error instanceof CliError) throw error;

    throw new CliError(
      `Failed to load report: ${error instanceof Error ? error.message : String(error)}`,
      ExitCode.ERROR,
    );
  }
}

// ── Output Helpers ──

/**
 * Format an ExplainResult for display.
 *
 * @param result - The explanation result.
 * @param json - Whether to output JSON.
 * @returns The formatted output string.
 */
export function formatResult(result: ExplainResult, json: boolean): string {
  if (json) {
    return JSON.stringify(result, null, 2);
  }

  switch (result.kind) {
    case 'success': {
      const explanation = result.explanation;
      const lines: string[] = [];

      // Header
      lines.push('');
      lines.push(`Explanation for ${explanation.subjectId}`);
      lines.push(`Mode: ${explanation.mode}`);
      lines.push(`Generated by: ${explanation.provider.id}/${explanation.provider.model}`);
      lines.push('');

      // Text
      lines.push(explanation.text);
      lines.push('');

      // Citations section
      if (explanation.citations.length > 0) {
        lines.push('── Citations ──');
        for (const citation of explanation.citations) {
          const status = citation.verified ? '✓' : '✗';
          lines.push(`  [${citation.id}] ${status} ${citation.label}`);
        }
        lines.push('');
      }

      // Token usage
      lines.push(
        `Tokens: ${explanation.tokenUsage.promptTokens} prompt + ${explanation.tokenUsage.completionTokens} completion = ${explanation.tokenUsage.totalTokens} total`,
      );

      if (explanation.cached) {
        lines.push('(cached)');
      }

      lines.push('');
      lines.push(explanation.disclaimer);

      return lines.join('\n');
    }

    case 'refused': {
      const lines: string[] = [];
      lines.push('');
      lines.push(`Explanation refused for ${result.subjectId}:`);
      lines.push(`  ${result.reason}`);
      lines.push('');
      return lines.join('\n');
    }

    case 'error': {
      const lines: string[] = [];
      lines.push('');
      lines.push(`Error: ${result.message}`);
      if (result.providerError) {
        lines.push(`  Provider: ${result.providerError}`);
      }
      lines.push(`  Code: ${result.code}`);
      lines.push(`  Recoverable: ${result.recoverable ? 'yes' : 'no'}`);
      lines.push('');
      return lines.join('\n');
    }
  }
}

/**
 * Map an ExplainResult to an exit code.
 *
 * @param result - The explanation result.
 * @returns The appropriate exit code.
 */
export function resultToExitCode(result: ExplainResult): ExitCodeValue {
  switch (result.kind) {
    case 'success':
      return ExitCode.SUCCESS;
    case 'refused':
      return ExitCode.ERROR;
    case 'error':
      switch (result.code) {
        case 'PROVIDER_UNAVAILABLE':
        case 'PROVIDER_TIMEOUT':
        case 'PROVIDER_ERROR':
        case 'INVALID_RESPONSE':
          return ExitCode.PROVIDER_UNAVAILABLE;
        case 'FINDING_NOT_FOUND':
        case 'CHAIN_NOT_FOUND':
        case 'RISK_DIMENSION_NOT_FOUND':
        case 'REPORT_NOT_FOUND':
          return ExitCode.NOT_FOUND;
        case 'CACHE_ERROR':
          return ExitCode.CACHE_ERROR;
        default:
          return ExitCode.ERROR;
      }
  }
}

// ── Errors ──

/** Custom error class for CLI errors with exit codes. */
export class CliError extends Error {
  readonly exitCode: ExitCodeValue;

  constructor(message: string, exitCode: ExitCodeValue = ExitCode.ERROR) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}
