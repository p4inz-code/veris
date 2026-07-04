/**
 * Tests for ResponseParser — content parsing, citation extraction, refusal detection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ResponseParser } from '../../../src/engine/response-parser.js';
import type { GenerateResult } from '@veris/ai';

describe('ResponseParser', () => {
  let parser: ResponseParser;

  beforeEach(() => {
    parser = new ResponseParser();
  });

  function makeResult(overrides: Partial<GenerateResult> = {}): GenerateResult {
    return {
      content: 'Default response content.',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      provider: 'mock',
      model: 'mock-model',
      ...overrides,
    };
  }

  it('parses a basic response into an Explanation', () => {
    const result = makeResult({
      content: 'This finding indicates a SQL injection vulnerability.',
    });

    const explanation = parser.parse(result, 'SQL_INJECTION', 'finding', 'simple', '1.0.0');

    expect(explanation.subjectId).toBe('SQL_INJECTION');
    expect(explanation.subjectType).toBe('finding');
    expect(explanation.mode).toBe('simple');
    expect(explanation.text).toBe('This finding indicates a SQL injection vulnerability.');
    expect(explanation.promptVersion).toBe('1.0.0');
    expect(explanation.cached).toBe(false);
    expect(explanation.refused).toBe(false);
  });

  it('extracts citation markers from content', () => {
    const content = `
      The finding [ref:finding:SQL_INJECTION] was detected in
      the login form [ref:artifact:login.ts]. The rule [ref:rule:sql-injection-rule]
      matched with confidence [ref:evidence:ev_001].
    `;

    const explanation = parser.parse(
      makeResult({ content }),
      'SQL_INJECTION',
      'finding',
      'technical',
      '1.0.0',
    );

    expect(explanation.citations.length).toBe(4);
    expect(explanation.citations[0].sourceType).toBe('finding');
    expect(explanation.citations[0].sourceId).toBe('SQL_INJECTION');
    expect(explanation.citations[1].sourceType).toBe('artifact');
    expect(explanation.citations[1].sourceId).toBe('login.ts');
    expect(explanation.citations[2].sourceType).toBe('rule');
    expect(explanation.citations[3].sourceType).toBe('evidence');
  });

  it('assigns sequential citation IDs', () => {
    const content = '[ref:finding:A] text [ref:rule:B] text [ref:evidence:C]';
    const explanation = parser.parse(makeResult({ content }), 'A', 'finding', 'simple', '1.0.0');

    expect(explanation.citations.map((c) => c.id)).toEqual(['cit_1', 'cit_2', 'cit_3']);
  });

  it('marks citations as unverified by default', () => {
    const content = '[ref:finding:A]';
    const explanation = parser.parse(makeResult({ content }), 'A', 'finding', 'simple', '1.0.0');

    expect(explanation.citations[0].verified).toBe(false);
  });

  it('maps provider metadata', () => {
    const result = makeResult({ provider: 'openai', model: 'gpt-4' });
    const explanation = parser.parse(result, 'F1', 'finding', 'simple', '1.0.0');

    expect(explanation.provider.id).toBe('openai');
    expect(explanation.provider.model).toBe('gpt-4');
  });

  it('maps token usage', () => {
    const result = makeResult({
      usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
    });
    const explanation = parser.parse(result, 'F1', 'finding', 'simple', '1.0.0');

    expect(explanation.tokenUsage.promptTokens).toBe(50);
    expect(explanation.tokenUsage.completionTokens).toBe(100);
    expect(explanation.tokenUsage.totalTokens).toBe(150);
  });

  it('detects refusal when content starts with refusal pattern', () => {
    const result = makeResult({
      content: 'I cannot explain this finding because there is insufficient evidence.',
    });
    const explanation = parser.parse(result, 'F1', 'finding', 'simple', '1.0.0');

    expect(explanation.refused).toBe(true);
    expect(explanation.refusalReason).toBeDefined();
  });

  it('detects non-refusal for normal responses', () => {
    const result = makeResult({
      content: 'This finding shows a critical vulnerability in the authentication module.',
    });
    const explanation = parser.parse(result, 'F1', 'finding', 'simple', '1.0.0');

    expect(explanation.refused).toBe(false);
    expect(explanation.refusalReason).toBeUndefined();
  });

  it('includes AI disclaimer', () => {
    const explanation = parser.parse(makeResult(), 'F1', 'finding', 'simple', '1.0.0');

    expect(explanation.disclaimer).toContain('AI-generated');
    expect(explanation.disclaimer).toContain('informational purposes');
  });

  it('sets cached flag when specified', () => {
    const explanation = parser.parse(makeResult(), 'F1', 'finding', 'simple', '1.0.0', true);
    expect(explanation.cached).toBe(true);
  });

  it('generates explanation IDs', () => {
    const explanation = parser.parse(makeResult(), 'FINDING_001', 'finding', 'simple', '1.0.0');
    expect(explanation.id).toContain('exp_');
    expect(explanation.id).toContain('FINDING_001');
  });

  it('handles content with no citations', () => {
    const explanation = parser.parse(
      makeResult({ content: 'Plain text without references.' }),
      'F1',
      'finding',
      'simple',
      '1.0.0',
    );
    expect(explanation.citations).toHaveLength(0);
    expect(explanation.citationValidation.totalCitations).toBe(0);
  });
});
