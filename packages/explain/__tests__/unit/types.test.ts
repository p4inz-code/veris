/**
 * Unit tests for M1 — Foundation types and interfaces.
 *
 * Tests:
 * - Type instantiation and structural correctness
 * - Discriminated union narrowing (ExplainResult)
 * - Mode exhaustiveness (ExplanationMode)
 * - Citation construction and validation
 * - Config validation
 * - CacheKey structure
 * - SeverityLevel usage in context types
 * - contextSchemaVersion presence
 *
 * @module @veris/explain/__tests__/unit/types.test
 */

import { describe, it, expect } from 'vitest';
import type {
  CitationSourceType,
  Citation,
  CitationValidationResult,
  ExplanationMode,
  Explanation,
  ProviderInfo,
  TokenUsage,
} from '../../src/types/explanation.js';
import type {
  ExplainedFinding,
  ExplainedEvidence,
  ExplainedRule,
  ExplainedArtifact,
  ExplainedRiskProfile,
  ExplainedChain,
  ExplainedReportSummary,
  ExplainedSubject,
  ContextTokenBudget,
  ExplainedContext,
} from '../../src/types/context.js';
import type { ExplainConfig, CacheOptions } from '../../src/types/config.js';
import type {
  ExplainSuccess,
  ExplainRefused,
  ExplainError,
  ExplainResult,
} from '../../src/types/result.js';
import type {
  CacheKey,
  Explainer,
  ExplainerOptions,
  ScopeManager,
  TokenBudget,
} from '../../src/engine/index.js';

// ── Citation Tests ──

describe('Citation', () => {
  it('accepts all 10 valid source types', () => {
    const types: CitationSourceType[] = [
      'finding',
      'evidence',
      'rule',
      'behavior',
      'artifact',
      'chain',
      'risk-dimension',
      'recommendation',
      'rule-prop',
      'report-meta',
    ];
    expect(types.length).toBe(10);
  });

  it('can be constructed with required fields', () => {
    const citation: Citation = {
      id: 'cit_1',
      sourceType: 'finding',
      sourceId: 'fin_abc123',
      label: 'Hardcoded AWS Key',
      verified: true,
    };
    expect(citation.id).toBe('cit_1');
    expect(citation.sourceType).toBe('finding');
    expect(citation.sourceId).toBe('fin_abc123');
    expect(citation.verified).toBe(true);
    expect(citation.verificationError).toBeUndefined();
  });

  it('includes verification error when unverified', () => {
    const citation: Citation = {
      id: 'cit_2',
      sourceType: 'evidence',
      sourceId: 'ev_does_not_exist',
      label: 'Non-existent evidence',
      verified: false,
      verificationError: 'Source object not found in context',
    };
    expect(citation.verified).toBe(false);
    expect(citation.verificationError).toBe('Source object not found in context');
  });

  it('has all required properties', () => {
    const citation: Citation = {
      id: 'cit_3',
      sourceType: 'rule',
      sourceId: 'secrets/aws-key',
      label: 'Secrets rule',
      verified: true,
    };
    expect(citation.id).toBe('cit_3');
    expect(citation.sourceType).toBe('rule');
    expect(citation.label).toBe('Secrets rule');
  });
});

describe('CitationValidationResult', () => {
  it('is valid when all citations pass', () => {
    const result: CitationValidationResult = {
      valid: true,
      totalCitations: 3,
      verifiedCitations: 3,
      failedCitations: 0,
      citations: [
        { id: 'cit_1', sourceType: 'finding', sourceId: 'fin_1', label: 'F1', verified: true },
        { id: 'cit_2', sourceType: 'evidence', sourceId: 'ev_1', label: 'E1', verified: true },
        { id: 'cit_3', sourceType: 'rule', sourceId: 'r_1', label: 'R1', verified: true },
      ],
    };
    expect(result.valid).toBe(true);
    expect(result.totalCitations).toBe(3);
    expect(result.verifiedCitations).toBe(3);
    expect(result.failedCitations).toBe(0);
  });

  it('is invalid when some citations fail', () => {
    const result: CitationValidationResult = {
      valid: false,
      totalCitations: 2,
      verifiedCitations: 1,
      failedCitations: 1,
      citations: [
        { id: 'cit_1', sourceType: 'finding', sourceId: 'fin_1', label: 'F1', verified: true },
        {
          id: 'cit_2',
          sourceType: 'evidence',
          sourceId: 'ev_bad',
          label: 'E1',
          verified: false,
          verificationError: 'Not found',
        },
      ],
    };
    expect(result.valid).toBe(false);
    expect(result.failedCitations).toBe(1);
  });
});

// ── ExplanationMode Tests ──

describe('ExplanationMode', () => {
  it("accepts exactly 'simple' | 'technical' | 'expert'", () => {
    const modes: ExplanationMode[] = ['simple', 'technical', 'expert'];
    expect(modes.length).toBe(3);
  });

  it('only accepts valid mode values at the type level', () => {
    const validMode: ExplanationMode = 'technical';
    expect(validMode).toBe('technical');
    // At runtime, a cast still works. This is a compile-time check.
    const mode = 'simple' as ExplanationMode;
    expect(mode).toBe('simple');
  });

  it('can be used in discriminated unions', () => {
    function handleMode(mode: ExplanationMode): string {
      switch (mode) {
        case 'simple':
          return 'simple mode';
        case 'technical':
          return 'technical mode';
        case 'expert':
          return 'expert mode';
      }
    }
    expect(handleMode('simple')).toBe('simple mode');
    expect(handleMode('technical')).toBe('technical mode');
    expect(handleMode('expert')).toBe('expert mode');
  });
});

// ── Explanation Tests ──

describe('Explanation', () => {
  const validExplanation: Explanation = {
    id: 'exp_1',
    subjectId: 'fin_abc123',
    subjectType: 'finding',
    mode: 'technical',
    text: 'The finding detected a hardcoded AWS key [src:finding:fin_abc123].',
    citations: [
      {
        id: 'cit_1',
        sourceType: 'finding',
        sourceId: 'fin_abc123',
        label: 'Finding',
        verified: true,
      },
    ],
    citationValidation: {
      valid: true,
      totalCitations: 1,
      verifiedCitations: 1,
      failedCitations: 0,
      citations: [
        {
          id: 'cit_1',
          sourceType: 'finding',
          sourceId: 'fin_abc123',
          label: 'Finding',
          verified: true,
        },
      ],
    },
    provider: { id: 'ollama', model: 'llama3.1:8b' },
    promptVersion: '1.0.0',
    tokenUsage: { promptTokens: 500, completionTokens: 150, totalTokens: 650 },
    cached: false,
    refused: false,
    generatedAt: '2026-07-03T12:00:00.000Z',
    disclaimer: 'This explanation was generated by AI based on deterministic analysis results.',
  };

  it('can be constructed with all required fields', () => {
    expect(validExplanation.id).toBe('exp_1');
    expect(validExplanation.subjectId).toBe('fin_abc123');
    expect(validExplanation.mode).toBe('technical');
    expect(validExplanation.cached).toBe(false);
    expect(validExplanation.refused).toBe(false);
  });

  it('includes refusal reason when refused', () => {
    const refused: Explanation = {
      ...validExplanation,
      refused: true,
      refusalReason: 'Insufficient evidence to explain this finding.',
    };
    expect(refused.refused).toBe(true);
    expect(refused.refusalReason).toBe('Insufficient evidence to explain this finding.');
  });

  it('supports all subject types', () => {
    const finding: Explanation = { ...validExplanation, subjectType: 'finding' };
    const chain: Explanation = { ...validExplanation, subjectId: 'bc_1', subjectType: 'chain' };
    const risk: Explanation = { ...validExplanation, subjectId: 'D500', subjectType: 'risk' };
    const report: Explanation = { ...validExplanation, subjectId: 'rep_1', subjectType: 'report' };

    expect(finding.subjectType).toBe('finding');
    expect(chain.subjectType).toBe('chain');
    expect(risk.subjectType).toBe('risk');
    expect(report.subjectType).toBe('report');
  });
});

// ── ExplainResult Discriminated Union Tests ──

describe('ExplainResult', () => {
  it("narrows to ExplainSuccess on kind === 'success'", () => {
    const result: ExplainResult = {
      kind: 'success',
      explanation: {
        id: 'exp_1',
        subjectId: 'fin_1',
        subjectType: 'finding',
        mode: 'simple',
        text: 'Test',
        citations: [],
        citationValidation: {
          valid: true,
          totalCitations: 0,
          verifiedCitations: 0,
          failedCitations: 0,
          citations: [],
        },
        provider: { id: 'mock', model: 'mock' },
        promptVersion: '1.0.0',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        cached: false,
        refused: false,
        generatedAt: '2026-01-01T00:00:00.000Z',
        disclaimer: 'AI-generated',
      },
    };

    if (result.kind === 'success') {
      expect(result.explanation.text).toBe('Test');
    } else {
      // This branch should never be reached
      expect(true).toBe(false);
    }
  });

  it("narrows to ExplainRefused on kind === 'refused'", () => {
    const result: ExplainResult = {
      kind: 'refused',
      reason: 'Insufficient evidence',
      subjectId: 'fin_1',
      subjectType: 'finding',
    };

    if (result.kind === 'refused') {
      expect(result.reason).toBe('Insufficient evidence');
    } else {
      expect(true).toBe(false);
    }
  });

  it("narrows to ExplainError on kind === 'error'", () => {
    const result: ExplainResult = {
      kind: 'error',
      code: 'PROVIDER_UNAVAILABLE',
      message: 'AI provider is not responding',
      subjectId: 'fin_1',
      subjectType: 'finding',
      recoverable: true,
    };

    if (result.kind === 'error') {
      expect(result.code).toBe('PROVIDER_UNAVAILABLE');
      expect(result.recoverable).toBe(true);
    } else {
      expect(true).toBe(false);
    }
  });

  it('covers all three variants exhaustively', () => {
    const results: ExplainResult[] = [
      { kind: 'success', explanation: null as unknown as never },
      { kind: 'refused', reason: '', subjectId: '', subjectType: '' },
      { kind: 'error', code: '', message: '', subjectId: '', subjectType: '', recoverable: false },
    ];
    expect(results.length).toBe(3);
  });
});

// ── ExplainedContext Tests ──

describe('ExplainedContext', () => {
  const finding: ExplainedFinding = {
    id: 'fin_abc123',
    title: 'Hardcoded AWS Key',
    severity: { level: 'critical', score: 9.5 },
    confidence: 0.95,
    ruleId: 'secrets/aws-key',
    description: 'A hardcoded AWS access key was detected.',
    taxonomyIds: ['CWE-798', 'OWASP-A2:2021'],
    evidenceIds: ['ev_1', 'ev_2'],
  };

  const evidence: ExplainedEvidence = {
    id: 'ev_1',
    sourceLocation: {
      path: 'src/config.ts',
      startLine: 42,
      startColumn: 5,
      snippet: 'key = "AKIA..."',
    },
    matchDetail: { kind: 'regex', value: 'AKIA[0-9A-Z]{16}' },
    confidence: 0.98,
  };

  const rule: ExplainedRule = {
    id: 'secrets/aws-key',
    name: 'AWS Access Key Detection',
    description: 'Detects hardcoded AWS access keys',
    severity: { level: 'critical', score: 7.0 },
    packId: 'secrets',
    cweIds: ['CWE-798'],
    owaspIds: ['A2:2021'],
  };

  const artifact: ExplainedArtifact = {
    id: 'art_1',
    path: 'src/config.ts',
    type: 'script',
    subType: 'TypeScript',
  };

  it('can be constructed with all required fields', () => {
    const context: ExplainedContext = {
      subject: finding,
      evidence: [evidence],
      rule,
      artifact,
      tokenBudget: { allocated: 4000, used: 3500, remaining: 500 },
      contextSchemaVersion: '1.0.0',
    };

    expect(context.subject).toBe(finding);
    expect(context.evidence.length).toBe(1);
    expect(context.rule?.id).toBe('secrets/aws-key');
    expect(context.artifact?.path).toBe('src/config.ts');
    expect(context.tokenBudget.allocated).toBe(4000);
    expect(context.contextSchemaVersion).toBe('1.0.0');
  });

  it('includes contextSchemaVersion', () => {
    const context: ExplainedContext = {
      subject: finding,
      evidence: [],
      tokenBudget: { allocated: 4000, used: 0, remaining: 4000 },
      contextSchemaVersion: '1.0.0',
    };
    expect(context.contextSchemaVersion).toBe('1.0.0');
  });

  it('uses SeverityLevel for severity.level', () => {
    expect(finding.severity.level).toBe('critical');
    expect(rule.severity.level).toBe('critical');
  });

  it('supports optional risk context', () => {
    const risk: ExplainedRiskProfile = {
      overallScore: 7.5,
      overallLevel: 'high',
      dimensions: [{ id: 'D500', name: 'Secrets Management', score: 8.0, contribution: 0.6 }],
      trustScore: 0.85,
    };

    const context: ExplainedContext = {
      subject: finding,
      evidence: [evidence],
      rule,
      artifact,
      risk,
      tokenBudget: { allocated: 4000, used: 3500, remaining: 500 },
      contextSchemaVersion: '1.0.0',
    };

    expect(context.risk?.overallScore).toBe(7.5);
    expect(context.risk?.overallLevel).toBe('high');
    expect(context.risk?.dimensions?.length).toBe(1);
  });

  it('supports report summary context', () => {
    const summary: ExplainedReportSummary = {
      totalFindings: 15,
      totalArtifacts: 120,
      findingsBySeverity: { critical: 3, high: 5, medium: 4, low: 2, info: 1 },
      scanDurationMs: 45000,
    };

    const context: ExplainedContext = {
      subject: finding,
      evidence: [],
      tokenBudget: { allocated: 4000, used: 0, remaining: 4000 },
      contextSchemaVersion: '1.0.0',
      report: summary,
    };

    expect(context.report?.totalFindings).toBe(15);
    expect(context.report?.findingsBySeverity.critical).toBe(3);
  });
});

// ── ExplainedRiskProfile Tests ──

describe('ExplainedRiskProfile', () => {
  it('accepts all 5 valid risk levels', () => {
    const levels: Array<ExplainedRiskProfile['overallLevel']> = [
      'critical',
      'high',
      'medium',
      'low',
      'negligible',
    ];
    expect(levels.length).toBe(5);
  });

  it('can be constructed with dimensions', () => {
    const profile: ExplainedRiskProfile = {
      overallScore: 8.0,
      overallLevel: 'critical',
      dimensions: [
        { id: 'D100', name: 'Access Control', score: 9.0, contribution: 0.5 },
        { id: 'D200', name: 'Data Protection', score: 7.0, contribution: 0.3 },
      ],
      trustScore: 0.7,
    };
    expect(profile.overallLevel).toBe('critical');
    expect(profile.dimensions?.length).toBe(2);
  });
});

// ── ExplainedChain Tests ──

describe('ExplainedChain', () => {
  it('uses SeverityLevel for severity.level', () => {
    const chain: ExplainedChain = {
      id: 'bc_1',
      name: 'Data Exfiltration Chain',
      description: 'Chain of behaviors indicating data exfiltration',
      severity: { level: 'high', score: 8.0 },
      findingIds: ['fin_1', 'fin_2', 'fin_3'],
    };
    expect(chain.severity.level).toBe('high');
    expect(chain.findingIds.length).toBe(3);
  });
});

// ── ExplainConfig Tests ──

describe('ExplainConfig', () => {
  const defaultConfig: ExplainConfig = {
    defaultMode: 'simple',
    caching: true,
    provider: {
      active: 'ollama',
      timeoutMs: 30000,
      maxRetries: 2,
    },
    tokenBudget: {
      maxContextTokens: 5000,
      maxOutputTokens: 1350,
      reservedForEvidence: 1500,
      reservedForRules: 500,
    },
    citationValidation: {
      enabled: true,
      strictMode: false,
      maxRetriesOnFailure: 2,
    },
    output: {
      maxLength: 10000,
      includeDisclaimer: true,
    },
    logging: {
      auditEnabled: true,
      metricsEnabled: true,
    },
  };

  it('can be constructed with all required fields', () => {
    expect(defaultConfig.defaultMode).toBe('simple');
    expect(defaultConfig.provider.active).toBe('ollama');
    expect(defaultConfig.tokenBudget.maxContextTokens).toBe(5000);
  });

  it('supports all three modes as default', () => {
    const configs: ExplainConfig[] = [
      { ...defaultConfig, defaultMode: 'simple' },
      { ...defaultConfig, defaultMode: 'technical' },
      { ...defaultConfig, defaultMode: 'expert' },
    ];
    expect(configs[0].defaultMode).toBe('simple');
    expect(configs[1].defaultMode).toBe('technical');
    expect(configs[2].defaultMode).toBe('expert');
  });

  it('supports optional cache options', () => {
    const config: ExplainConfig = {
      ...defaultConfig,
      cacheOptions: {
        maxSizeMb: 200,
        defaultTtlMs: 86400000,
        dbPath: '/tmp/veris-cache.db',
        schemaVersion: 1,
      },
    };
    expect(config.cacheOptions?.maxSizeMb).toBe(200);
  });

  it('can disable caching', () => {
    const config: ExplainConfig = { ...defaultConfig, caching: false };
    expect(config.caching).toBe(false);
  });

  it('can disable citation validation', () => {
    const config: ExplainConfig = {
      ...defaultConfig,
      citationValidation: { enabled: false, strictMode: false, maxRetriesOnFailure: 0 },
    };
    expect(config.citationValidation.enabled).toBe(false);
  });

  it('can disable audit logging', () => {
    const config: ExplainConfig = {
      ...defaultConfig,
      logging: { auditEnabled: false, metricsEnabled: false },
    };
    expect(config.logging.auditEnabled).toBe(false);
  });
});

// ── CacheKey Tests ──

describe('CacheKey', () => {
  it('includes all 6 required components including mode', () => {
    const key: CacheKey = {
      promptVersion: '1.0.0',
      modelId: 'ollama',
      modelVersion: 'llama3.1:8b',
      inputHash: 'a1b2c3d4e5f6...',
      engineVersion: '0.1.0',
      mode: 'technical',
    };
    expect(key.promptVersion).toBe('1.0.0');
    expect(key.modelId).toBe('ollama');
    expect(key.modelVersion).toBe('llama3.1:8b');
    expect(key.inputHash).toBe('a1b2c3d4e5f6...');
    expect(key.engineVersion).toBe('0.1.0');
    expect(key.mode).toBe('technical');
  });

  it('different modes produce different keys', () => {
    const base = {
      promptVersion: '1.0.0',
      modelId: 'ollama',
      modelVersion: 'llama3.1:8b',
      inputHash: 'hash',
      engineVersion: '0.1.0',
    };
    const key1: CacheKey = { ...base, mode: 'simple' };
    const key2: CacheKey = { ...base, mode: 'technical' };
    const key3: CacheKey = { ...base, mode: 'expert' };
    expect(key1.mode).toBe('simple');
    expect(key2.mode).toBe('technical');
    expect(key3.mode).toBe('expert');
  });

  it('has all 6 required components', () => {
    const key: CacheKey = {
      promptVersion: '1.0.0',
      modelId: 'ollama',
      modelVersion: 'llama3.1:8b',
      inputHash: 'hash',
      engineVersion: '0.1.0',
      mode: 'simple',
    };
    expect(key.mode).toBe('simple');
    expect(key.engineVersion).toBe('0.1.0');
  });
});

// ── ExplainedSubject Union Tests ──

describe('ExplainedSubject', () => {
  it('accepts all 4 subject types', () => {
    const finding: ExplainedSubject = {
      id: 'fin_1',
      title: 'Test',
      severity: { level: 'medium', score: 5.0 },
      confidence: 0.8,
      ruleId: 'r1',
      description: 'test',
    };
    const chain: ExplainedSubject = {
      id: 'bc_1',
      name: 'Chain',
      severity: { level: 'high', score: 7.0 },
      findingIds: [],
    };
    const risk: ExplainedSubject = {
      overallScore: 5.0,
      overallLevel: 'medium',
    };
    const report: ExplainedSubject = {
      totalFindings: 10,
      totalArtifacts: 100,
      findingsBySeverity: {} as Record<string, number>,
    };

    expect(finding).toBeDefined();
    expect(chain).toBeDefined();
    expect(risk).toBeDefined();
    expect(report).toBeDefined();
  });
});

// ── ScopeManager and TokenBudget Interface Tests ──

describe('ScopeManager', () => {
  it('is a valid interface type', () => {
    const manager: ScopeManager = {
      determineScope: () => ({
        type: 'finding',
        findingId: 'fin_1',
        evidenceIds: [],
        ruleId: 'r1',
        artifactIds: [],
      }),
      determineChainScope: () => ({ type: 'chain', chainId: 'bc_1', findingIds: [] }),
      determineRiskScope: () => ({ type: 'risk', dimensionId: 'D500' }),
      determineReportScope: () => ({ type: 'report' }),
    };
    expect(manager.determineScope('fin_1', null as never).type).toBe('finding');
  });
});

describe('TokenBudget', () => {
  it('is a valid interface type', () => {
    const budget: TokenBudget = {
      allocate: () => ({ allocated: 4000, used: 3500, remaining: 500 }),
      getReport: () => ({
        totalBudget: 5000,
        totalUsed: 3500,
        totalRemaining: 1500,
        entries: [],
      }),
    };
    expect(budget.allocate(null as never, 5000).allocated).toBe(4000);
  });
});
