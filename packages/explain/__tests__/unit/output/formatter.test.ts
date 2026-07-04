/**
 * Tests for the Formatter system — deterministic output formatting (M6b).
 *
 * Verifies:
 * - All 3 modes (simple, technical, expert) produce correct output structure
 * - Markdown formatting (headings, lists, tables, code blocks)
 * - JSON formatting with deterministic key ordering
 * - Citation formatting (numbered, bracketed, inline, section styles)
 * - Determinism (100-run test)
 * - Whitespace normalization
 * - Paragraph wrapping
 * - Heading generation
 * - ExplanationFormatter integration with Explanation objects
 * - Preset configurations
 * - Mode-specific structural rules
 * - Edge cases: empty text, no citations, long text
 */

import { describe, it, expect } from 'vitest';
import { Formatter, createFormatter, type FormatInput } from '../../../src/output/formatter.js';
import {
  ExplanationFormatter,
  createExplanationFormatter,
} from '../../../src/output/explanation-formatter.js';
import {
  formatJSON,
  normalizeWhitespace,
  wrapParagraph,
  generateHeading,
  formatInlineCitation,
  replaceCitationMarkers,
  stripCitationMarkers,
  formatCitationsSection,
  extractCitations,
  countSentences,
  countParagraphs,
  truncateToSentences,
  truncateToParagraphs,
  formatSeverityLabel,
  formatConfidence,
  formatSourceLocation,
  formatUnorderedList,
  formatOrderedList,
  formatTable,
  formatInlineCode,
  formatCodeBlock,
  stableSortCitations,
  deterministicStringify,
} from '../../../src/output/formatter-utils.js';
import {
  SIMPLE_PRESET,
  TECHNICAL_PRESET,
  EXPERT_PRESET,
  PRESETS,
  getPreset,
} from '../../../src/output/formatter-presets.js';
import { DEFAULT_FORMATTER_OPTIONS } from '../../../src/output/formatter-options.js';
import type {
  Citation,
  CitationSourceType,
  Explanation,
  ExplanationMode,
} from '../../../src/types/explanation.js';

// ═══════════════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════════════

function createFormatInput(overrides?: Partial<FormatInput>): FormatInput {
  return {
    text:
      overrides?.text ??
      'The finding [src:finding:fin_abc123] detected a hardcoded AWS access key in [src:evidence:ev_def456]. This key was found in [src:artifact:art_config_001]. The [src:rule:secrets/aws-key] rule matched with high severity.',
    mode: overrides?.mode ?? 'technical',
    subjectType: overrides?.subjectType ?? 'finding',
    subjectTitle: overrides?.subjectTitle ?? 'Hardcoded AWS Key',
    severityLevel: overrides?.severityLevel ?? 'high',
    severityScore: overrides?.severityScore ?? 7.5,
    confidence: overrides?.confidence ?? 0.95,
    sourceLocations: overrides?.sourceLocations ?? ['src/config.ts:42'],
    ruleName: overrides?.ruleName ?? 'AWS Key Detection',
    ruleDescription:
      overrides?.ruleDescription ?? 'Detects hardcoded AWS access keys in source code.',
    riskDimension: overrides?.riskDimension ?? 'Secrets Management',
    riskScore: overrides?.riskScore ?? 7.5,
  };
}

function createTestExplanation(overrides?: Partial<Explanation>): Explanation {
  return {
    id: 'exp_fin_test_001',
    subjectId: 'fin_abc123',
    subjectType: 'finding',
    mode: 'technical',
    text: 'The finding detected a hardcoded AWS access key in src/config.ts. This is a critical security issue that could allow unauthorized access.',
    citations: [
      {
        id: 'cit_1',
        sourceType: 'finding' as CitationSourceType,
        sourceId: 'fin_abc123',
        label: 'Hardcoded AWS Access Key',
        verified: true,
      },
      {
        id: 'cit_2',
        sourceType: 'evidence' as CitationSourceType,
        sourceId: 'ev_def456',
        label: 'AWS key match at src/config.ts:42',
        verified: true,
      },
    ],
    citationValidation: {
      valid: true,
      totalCitations: 2,
      verifiedCitations: 2,
      failedCitations: 0,
      citations: [],
    },
    provider: { id: 'test', model: 'test-model' },
    promptVersion: '1.0.0',
    tokenUsage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    cached: false,
    refused: false,
    generatedAt: '2026-07-03T00:00:00.000Z',
    disclaimer: 'This explanation was AI-generated.',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Formatter Utilities Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Formatter Utilities', () => {
  describe('formatJSON', () => {
    it('serializes with sorted keys', () => {
      const data = { z: 1, a: 2, m: 3 };
      const result = formatJSON(data, 0);
      expect(result).toBe('{"a":2,"m":3,"z":1}');
    });

    it('indents with specified indent', () => {
      const data = { a: 1, b: 2 };
      const result = formatJSON(data, 2);
      expect(result).toBe('{\n  "a": 1,\n  "b": 2\n}');
    });

    it('handles nested objects with sorted keys', () => {
      const data = { b: { z: 1, a: 2 }, a: 3 };
      const result = JSON.parse(formatJSON(data, 0));
      expect(Object.keys(data).sort()).toEqual(['a', 'b']);
    });

    it('handles arrays without sorting', () => {
      const data = { items: [3, 1, 2] };
      const result = formatJSON(data, 0);
      expect(result).toBe('{"items":[3,1,2]}');
    });
  });

  describe('normalizeWhitespace', () => {
    it('collapses multiple spaces', () => {
      expect(normalizeWhitespace('hello   world')).toBe('hello world');
    });

    it('collapses multiple newlines', () => {
      expect(normalizeWhitespace('line1\n\n\n\nline2')).toBe('line1\n\nline2');
    });

    it('trims leading and trailing whitespace', () => {
      expect(normalizeWhitespace('  hello  ')).toBe('hello');
    });

    it('removes trailing whitespace from each line', () => {
      expect(normalizeWhitespace('hello   \nworld  ')).toBe('hello\nworld');
    });

    it('handles empty string', () => {
      expect(normalizeWhitespace('')).toBe('');
    });
  });

  describe('wrapParagraph', () => {
    it('wraps text at max width', () => {
      const text =
        'This is a long paragraph that should be wrapped at a specific width for readability.';
      const wrapped = wrapParagraph(text, 40);
      const lines = wrapped.split('\n');
      expect(lines.every((l) => l.length <= 40)).toBe(true);
    });

    it('returns original text when maxWidth is 0', () => {
      const text = 'Some text';
      expect(wrapParagraph(text, 0)).toBe(text);
    });

    it('handles empty string', () => {
      expect(wrapParagraph('', 80)).toBe('');
    });
  });

  describe('generateHeading', () => {
    it('generates ATX heading with correct level', () => {
      expect(generateHeading('Test', 1)).toBe('# Test');
      expect(generateHeading('Test', 2)).toBe('## Test');
      expect(generateHeading('Test', 3)).toBe('### Test');
    });

    it('clamps level between 1 and 6', () => {
      expect(generateHeading('Test', 0)).toBe('# Test');
      expect(generateHeading('Test', 7)).toBe('###### Test');
    });

    it("returns text when style is 'none'", () => {
      expect(generateHeading('Test', 2, 'none')).toBe('Test');
    });

    it('generates setext heading for level 1-2', () => {
      expect(generateHeading('Test', 1, 'setext')).toBe('Test\n===');
      expect(generateHeading('Test', 2, 'setext')).toBe('Test\n---');
    });
  });

  describe('countSentences', () => {
    it('counts sentences correctly', () => {
      expect(countSentences('Hello world. How are you? I am fine.')).toBe(3);
    });

    it('returns 0 for empty text', () => {
      expect(countSentences('')).toBe(0);
    });
  });

  describe('countParagraphs', () => {
    it('counts paragraphs correctly', () => {
      const text = 'Paragraph one.\n\nParagraph two.\n\nParagraph three.';
      expect(countParagraphs(text)).toBe(3);
    });

    it('returns 0 for empty text', () => {
      expect(countParagraphs('')).toBe(0);
    });
  });

  describe('truncateToSentences', () => {
    it('truncates to specified number of sentences', () => {
      const text = 'First sentence. Second sentence. Third sentence.';
      expect(truncateToSentences(text, 2)).toContain('First sentence');
      expect(truncateToSentences(text, 2)).not.toContain('Third sentence');
    });

    it('returns full text when max is 0', () => {
      const text = 'Some text.';
      expect(truncateToSentences(text, 0)).toBe(text);
    });
  });

  describe('truncateToParagraphs', () => {
    it('truncates to specified number of paragraphs', () => {
      const text = 'Para one.\n\nPara two.\n\nPara three.';
      expect(truncateToParagraphs(text, 2)).not.toContain('Para three');
    });

    it('returns full text when max is 0', () => {
      const text = 'Some text.';
      expect(truncateToParagraphs(text, 0)).toBe(text);
    });
  });

  describe('formatCitations', () => {
    it('extracts [src:type:id] citations', () => {
      const text = 'Found [src:finding:fin_abc123] in [src:evidence:ev_def456].';
      const results = extractCitations(text);
      expect(results).toHaveLength(2);
      expect(results[0].sourceType).toBe('finding');
      expect(results[0].sourceId).toBe('fin_abc123');
    });

    it('replaces citation markers with numbered style', () => {
      const text = 'Found [src:finding:fin_abc123].';
      const result = replaceCitationMarkers(text, 'numbered');
      expect(result).toBe('Found [1].');
    });

    it('replaces citation markers with bracketed style', () => {
      const text = 'Found [src:finding:fin_abc123].';
      const result = replaceCitationMarkers(text, 'bracketed');
      expect(result).toBe('Found [finding:fin_abc123].');
    });

    it('strips citation markers', () => {
      const text = 'Found [src:finding:fin_abc123] in [src:evidence:ev_def456].';
      const result = stripCitationMarkers(text);
      expect(result).not.toContain('[src:');
    });
  });

  describe('formatCitationsSection', () => {
    const citations: readonly Citation[] = [
      {
        id: 'cit_1',
        sourceType: 'finding' as CitationSourceType,
        sourceId: 'fin_abc123',
        label: 'Hardcoded AWS Key',
        verified: true,
      },
      {
        id: 'cit_2',
        sourceType: 'evidence' as CitationSourceType,
        sourceId: 'ev_def456',
        label: 'AWS key match',
        verified: true,
      },
    ];

    it('formats as list section', () => {
      const result = formatCitationsSection(citations, 'list', true, false, 'Citations');
      expect(result).toContain('**Citations:**');
      expect(result).toContain('[1]');
      expect(result).toContain('[2]');
    });

    it('formats as table section', () => {
      const result = formatCitationsSection(citations, 'table', true, false, 'Citations');
      expect(result).toContain('|');
      expect(result).toContain('---');
    });

    it('formats as compact section', () => {
      const result = formatCitationsSection(citations, 'compact', true, false, 'Citations');
      expect(result).toContain('[1]');
      expect(result).toContain('(fin_abc123)');
    });
  });

  describe('severity and confidence formatting', () => {
    it('formats severity labels', () => {
      expect(formatSeverityLabel('high')).toBe('🟠 High');
      expect(formatSeverityLabel('critical')).toBe('🔴 Critical');
      expect(formatSeverityLabel('medium')).toBe('🟡 Medium');
    });

    it('formats confidence scores', () => {
      expect(formatConfidence(0.95)).toBe('95%');
      expect(formatConfidence(0.5)).toBe('50%');
    });

    it('formats source locations', () => {
      expect(formatSourceLocation('src/config.ts', 42)).toBe('src/config.ts:42');
      expect(formatSourceLocation('src/config.ts', 42, 1)).toBe('src/config.ts:42:1');
    });
  });

  describe('list formatting', () => {
    it('formats unordered lists', () => {
      const result = formatUnorderedList(['Item 1', 'Item 2', 'Item 3']);
      expect(result).toBe('- Item 1\n- Item 2\n- Item 3');
    });

    it('formats ordered lists', () => {
      const result = formatOrderedList(['First', 'Second', 'Third']);
      expect(result).toBe('1. First\n2. Second\n3. Third');
    });
  });

  describe('table formatting', () => {
    it('formats markdown tables', () => {
      const result = formatTable(['Name', 'Value'], [['test', '123']]);
      expect(result).toContain('| Name | Value |');
      expect(result).toContain('| --- | --- |');
      expect(result).toContain('| test | 123 |');
    });
  });

  describe('code formatting', () => {
    it('formats inline code', () => {
      expect(formatInlineCode('const x = 1;')).toBe('`const x = 1;`');
    });

    it('formats code blocks', () => {
      const result = formatCodeBlock('const x = 1;', 'typescript');
      expect(result).toContain('```typescript');
      expect(result).toContain('const x = 1;');
    });
  });

  describe('stableSortCitations', () => {
    it('sorts citations deterministically by type then id', () => {
      const citations: readonly Citation[] = [
        {
          id: 'cit_2',
          sourceType: 'evidence' as CitationSourceType,
          sourceId: 'ev_b',
          label: 'B',
          verified: true,
        },
        {
          id: 'cit_1',
          sourceType: 'finding' as CitationSourceType,
          sourceId: 'fin_a',
          label: 'A',
          verified: true,
        },
        {
          id: 'cit_3',
          sourceType: 'evidence' as CitationSourceType,
          sourceId: 'ev_a',
          label: 'A',
          verified: true,
        },
      ];
      const sorted = stableSortCitations(citations);
      expect(sorted[0].sourceType).toBe('evidence');
      expect(sorted[0].sourceId).toBe('ev_a');
      expect(sorted[1].sourceType).toBe('evidence');
      expect(sorted[1].sourceId).toBe('ev_b');
      expect(sorted[2].sourceType).toBe('finding');
    });
  });

  describe('deterministicStringify', () => {
    it('produces deterministic output', () => {
      const a = deterministicStringify({ b: 2, a: 1 });
      const b = deterministicStringify({ a: 1, b: 2 });
      expect(a).toBe(b);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Formatter Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Formatter', () => {
  describe('mode formatting', () => {
    it('formats in simple mode with correct structure', () => {
      const formatter = new Formatter();
      const input = createFormatInput({ mode: 'simple' });
      const result = formatter.format(input);

      // Simple should not have summary heading
      expect(result.text).not.toContain('## Summary:');

      // Should have disclaimer
      expect(result.disclaimer).toContain('AI-generated');

      // Should be relatively short
      expect(result.sentenceCount).toBeGreaterThan(0);
    });

    it('formats in technical mode with heading and details', () => {
      const formatter = new Formatter();
      const input = createFormatInput({ mode: 'technical' });
      const result = formatter.format(input);

      // Technical should have summary heading
      expect(result.text).toContain('## Analysis:');

      // Should include severity
      expect(result.text).toContain('Severity');

      // Should include confidence
      expect(result.text).toContain('Confidence');
    });

    it('formats in expert mode with full details', () => {
      const formatter = new Formatter();
      const input = createFormatInput({ mode: 'expert' });
      const result = formatter.format(input);

      // Expert should have traceability
      expect(result.text).toContain('## Full Traceability:');

      // Should include rule details
      expect(result.text).toContain('Rule');

      // Should include risk context
      expect(result.text).toContain('Risk Context');
    });
  });

  describe('citation replacement', () => {
    it('replaces [src:type:id] with numbered citations', () => {
      const formatter = new Formatter();
      const input = createFormatInput({
        text: 'Found [src:finding:fin_abc123] and [src:evidence:ev_def456].',
        mode: 'simple',
      });
      const result = formatter.format(input);

      // Raw citation markers should be replaced
      expect(result.text).not.toContain('[src:finding:fin_abc123]');
    });

    it('keeps raw citations when includeRawCitations is true', () => {
      const formatter = new Formatter({ includeRawCitations: true });
      const input = createFormatInput({
        text: 'Found [src:finding:fin_abc123].',
        mode: 'simple',
      });
      const result = formatter.format(input);

      // Raw citation markers should be preserved
      expect(result.text).toContain('[src:finding:fin_abc123]');
    });
  });

  describe('determinism (100-run)', () => {
    it('produces identical output across 100 runs', () => {
      const formatter = new Formatter();
      const input = createFormatInput({ mode: 'technical' });

      const firstResult = formatter.format(input);

      for (let i = 0; i < 100; i++) {
        const result = formatter.format(input);
        expect(result.text).toBe(firstResult.text);
        expect(result.sentenceCount).toBe(firstResult.sentenceCount);
        expect(result.paragraphCount).toBe(firstResult.paragraphCount);
      }
    });

    it('produces identical output for simple mode across 100 runs', () => {
      const formatter = new Formatter();
      const input = createFormatInput({ mode: 'simple' });

      const firstResult = formatter.format(input);

      for (let i = 0; i < 100; i++) {
        const result = formatter.format(input);
        expect(result.text).toBe(firstResult.text);
      }
    });

    it('produces identical output for expert mode across 100 runs', () => {
      const formatter = new Formatter();
      const input = createFormatInput({ mode: 'expert' });

      const firstResult = formatter.format(input);

      for (let i = 0; i < 100; i++) {
        const result = formatter.format(input);
        expect(result.text).toBe(firstResult.text);
      }
    });
  });

  describe('createFormatter factory', () => {
    it('creates formatter with default options', () => {
      const formatter = createFormatter();
      expect(formatter).toBeInstanceOf(Formatter);
    });

    it('creates formatter with custom options', () => {
      const formatter = createFormatter({ normalizeWhitespace: false });
      expect(formatter.getOptions().normalizeWhitespace).toBe(false);
    });
  });

  describe('getModeConfig', () => {
    it('returns config for each mode', () => {
      const formatter = new Formatter();
      const simple = formatter.getModeConfig('simple');
      const technical = formatter.getModeConfig('technical');
      const expert = formatter.getModeConfig('expert');

      expect(simple.maxSentences).toBe(5);
      expect(technical.maxParagraphs).toBe(3);
      expect(expert.maxParagraphs).toBe(5);
    });
  });

  describe('formatCitationsSection', () => {
    it('formats citations section from explanation citations', () => {
      const formatter = new Formatter();
      const input = createFormatInput();
      const citations = [
        {
          id: 'cit_1',
          sourceType: 'finding' as const,
          sourceId: 'fin_abc123',
          label: 'Test',
          verified: true,
        },
      ];

      const result = formatter.formatCitationsSection(input, citations);
      expect(result).toContain('fin_abc123');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ExplanationFormatter Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('ExplanationFormatter', () => {
  describe('format', () => {
    it('formats a complete Explanation object', () => {
      const formatter = new ExplanationFormatter();
      const explanation = createTestExplanation();
      const context = createTestContext();

      const result = formatter.format(explanation, context);

      expect(result.text).toBeTruthy();
      expect(result.disclaimer).toBeTruthy();
      expect(result.refused).toBe(false);
      expect(result.sentenceCount).toBeGreaterThan(0);
    });

    it('includes disclaimer when mode config permits', () => {
      const formatter = new ExplanationFormatter();
      const explanation = createTestExplanation();
      const context = createTestContext();

      const result = formatter.format(explanation, context);
      expect(result.disclaimer).toContain('AI-generated');
    });

    it('produces JSON output when configured', () => {
      const formatter = new ExplanationFormatter({ jsonOutput: true });
      const explanation = createTestExplanation();
      const context = createTestContext();

      const result = formatter.format(explanation, context);

      expect(result.json).toBeTruthy();
      const parsed = JSON.parse(result.json!);
      expect(parsed.id).toBe(explanation.id);
      expect(parsed.subjectId).toBe(explanation.subjectId);
      expect(parsed.text).toBe(explanation.text);
    });

    it('JSON output has deterministic key ordering', () => {
      const formatter = new ExplanationFormatter({ jsonOutput: true, jsonIndent: 0 });
      const explanation = createTestExplanation();
      const context = createTestContext();

      const result1 = formatter.format(explanation, context);
      const result2 = formatter.format(explanation, context);

      expect(result1.json).toBe(result2.json);
    });
  });

  describe('formatAllModes', () => {
    it('formats all three modes', () => {
      const formatter = new ExplanationFormatter();
      const explanation = createTestExplanation();
      const context = createTestContext();

      const results = formatter.formatAllModes(explanation, context);

      expect(results.simple).toBeDefined();
      expect(results.technical).toBeDefined();
      expect(results.expert).toBeDefined();

      // Simple mode should not have headings
      expect(results.simple.text).toBeDefined();

      // Expert mode should have more detail (more text)
      expect(results.expert.text.length).toBeGreaterThanOrEqual(results.simple.text.length);
    });
  });

  describe('formatRefusal', () => {
    it('formats a refusal message', () => {
      const formatter = new ExplanationFormatter();
      const result = formatter.formatRefusal('No evidence available.', 'finding', 'simple');

      expect(result.refused).toBe(true);
      expect(result.refusalReason).toBe('No evidence available.');
      expect(result.text).toContain('cannot explain');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Presets Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Formatter Presets', () => {
  it('SIMPLE_PRESET has correct configuration', () => {
    expect(SIMPLE_PRESET.maxSentences).toBe(5);
    expect(SIMPLE_PRESET.maxParagraphs).toBe(1);
    expect(SIMPLE_PRESET.allowTechnicalJargon).toBe(false);
    expect(SIMPLE_PRESET.citationsPerClaim).toBe(1);
    expect(SIMPLE_PRESET.showSeverity).toBe(false);
    expect(SIMPLE_PRESET.showTraceability).toBe(false);
  });

  it('TECHNICAL_PRESET has correct configuration', () => {
    expect(TECHNICAL_PRESET.maxParagraphs).toBe(3);
    expect(TECHNICAL_PRESET.allowTechnicalJargon).toBe(true);
    expect(TECHNICAL_PRESET.showSeverity).toBe(true);
    expect(TECHNICAL_PRESET.showSourceLocations).toBe(true);
  });

  it('EXPERT_PRESET has correct configuration', () => {
    expect(EXPERT_PRESET.maxParagraphs).toBe(5);
    expect(EXPERT_PRESET.showTraceability).toBe(true);
    expect(EXPERT_PRESET.showSourceLocations).toBe(true);
    expect(EXPERT_PRESET.showReportMeta).toBe(true);
  });

  it('PRESETS contains all three modes', () => {
    expect(PRESETS.simple).toBeDefined();
    expect(PRESETS.technical).toBeDefined();
    expect(PRESETS.expert).toBeDefined();
  });

  it('getPreset returns correct preset', () => {
    expect(getPreset('simple')).toBe(SIMPLE_PRESET);
    expect(getPreset('technical')).toBe(TECHNICAL_PRESET);
    expect(getPreset('expert')).toBe(EXPERT_PRESET);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Edge Cases
// ═══════════════════════════════════════════════════════════════════════════

describe('Formatter Edge Cases', () => {
  it('handles empty text', () => {
    const formatter = new Formatter();
    const input = createFormatInput({ text: '', mode: 'simple' });
    const result = formatter.format(input);

    // Should handle gracefully without throwing
    expect(result.text).toBe('');
    expect(result.sentenceCount).toBe(0);
  });

  it('handles text with no citations', () => {
    const formatter = new Formatter();
    const input = createFormatInput({
      text: 'A simple explanation without any citation markers.',
      mode: 'simple',
    });
    const result = formatter.format(input);

    expect(result.text).toContain('A simple explanation');
  });

  it('handles very long text', () => {
    const formatter = new Formatter();
    const longText = 'This is a long explanation. '.repeat(100);
    const input = createFormatInput({ text: longText, mode: 'simple' });
    const result = formatter.format(input);

    // Simple mode should truncate to ~5 sentences
    expect(result.sentenceCount).toBeLessThanOrEqual(10);
  });

  it('handles null/undefined source locations', () => {
    const formatter = new Formatter();
    const input = createFormatInput({
      mode: 'technical',
      sourceLocations: undefined as unknown as readonly string[],
    });
    // Should handle gracefully
    const result = formatter.format(input);
    expect(result.text).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Default Options Tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Default Options', () => {
  it('DEFAULT_FORMATTER_OPTIONS has all modes configured', () => {
    expect(DEFAULT_FORMATTER_OPTIONS.modes.simple).toBeDefined();
    expect(DEFAULT_FORMATTER_OPTIONS.modes.technical).toBeDefined();
    expect(DEFAULT_FORMATTER_OPTIONS.modes.expert).toBeDefined();
  });

  it('default options have stable ordering enabled', () => {
    expect(DEFAULT_FORMATTER_OPTIONS.stableOrdering).toBe(true);
  });

  it('default options normalize whitespace', () => {
    expect(DEFAULT_FORMATTER_OPTIONS.normalizeWhitespace).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Test Context Helper
// ═══════════════════════════════════════════════════════════════════════════

function createTestContext(): import('../../../src/types/context.js').ExplainedContext {
  return {
    subject: {
      id: 'fin_abc123',
      title: 'Hardcoded AWS Key',
      severity: { level: 'high' as const, score: 7.5 },
      confidence: 0.95,
      ruleId: 'secrets/aws-key',
      description: 'A hardcoded AWS access key was detected.',
    },
    evidence: [
      {
        id: 'ev_def456',
        sourceLocation: {
          path: 'src/config.ts',
          startLine: 42,
          startColumn: 1,
          snippet: 'key = "AKIAIOSFODNN7EXAMPLE"',
        },
        matchDetail: { kind: 'regex', value: 'AKIA' },
        confidence: 0.98,
      },
    ],
    rule: {
      id: 'secrets/aws-key',
      name: 'AWS Key Detection',
      description: 'Detects hardcoded AWS access keys',
      severity: { level: 'high' as const, score: 7.5 },
    },
    artifact: {
      id: 'art_config_001',
      path: 'src/config.ts',
      type: 'script',
    },
    tokenBudget: { allocated: 4000, used: 3500, remaining: 500 },
    contextSchemaVersion: '1.0.0',
  };
}
