/**
 * Tests for OutputFilter.
 *
 * Covers:
 * - Forbidden content detection (HTML, JavaScript)
 * - Prompt leakage detection
 * - Template leakage detection
 * - Internal path leakage
 * - Secret/token leakage
 * - Invalid Unicode handling
 * - Max length enforcement
 * - Off-topic content detection
 * - Determinism (100 runs)
 */

import { describe, it, expect } from 'vitest';
import { OutputFilter } from '../../../src/output/output-filter.js';

describe('OutputFilter', () => {
  const filter = new OutputFilter();

  describe('name', () => {
    it('has the correct name', () => {
      expect(filter.name).toBe('OutputFilter');
    });
  });

  describe('forbidden content detection', () => {
    it('blocks script tags', () => {
      const content = "Normal text <script>alert('xss')</script> more text.";
      const result = filter.filter(content);
      expect(result.valid).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.issues.some((i) => i.code === 'FORBIDDEN_HTML_DETECTED')).toBe(true);
    });

    it('blocks iframe tags', () => {
      const content = 'Text <iframe src="http://evil.com"></iframe> text.';
      const result = filter.filter(content);
      expect(result.blocked).toBe(true);
    });

    it('blocks JavaScript event handlers', () => {
      const content = 'Click <span onerror="alert(1)">here</span>.';
      const result = filter.filter(content);
      expect(result.blocked).toBe(true);
      expect(result.issues.some((i) => i.code === 'FORBIDDEN_JS_DETECTED')).toBe(true);
    });

    it('allows normal markdown without HTML', () => {
      const content = 'This is a **bold** statement about the finding.';
      const result = filter.filter(content);
      expect(result.valid).toBe(true);
      expect(result.blocked).toBe(false);
    });
  });

  describe('prompt leakage detection', () => {
    it('detects system prompt role statements', () => {
      const content = 'You are a security analysis explanation assistant for VERIS...';
      const result = filter.filter(content);
      expect(result.blocked).toBe(true);
      expect(result.issues.some((i) => i.code === 'PROMPT_LEAKAGE_DETECTED')).toBe(true);
    });

    it('detects citation format instructions', () => {
      const content = 'Use citation format: [src:finding:id] for every claim.';
      const result = filter.filter(content);
      expect(result.blocked).toBe(true);
    });

    it('allows normal content without prompt leakage', () => {
      const content =
        'The finding [src:finding:fin_abc123] was detected in the configuration file.';
      const result = filter.filter(content);
      expect(result.blocked).toBe(false);
    });
  });

  describe('template leakage detection', () => {
    it('detects Handlebars variable leakage', () => {
      const content = 'Variable {{finding.title}} leaked into output.';
      const result = filter.filter(content);
      expect(result.blocked).toBe(true);
      expect(result.issues.some((i) => i.code === 'TEMPLATE_LEAKAGE_DETECTED')).toBe(true);
    });

    it('detects Handlebars block leakage', () => {
      const content = 'Template {{#each evidence}} leaked.';
      const result = filter.filter(content);
      expect(result.blocked).toBe(true);
    });
  });

  describe('internal path leakage', () => {
    it('detects .veris directory references', () => {
      const content = 'Found in /home/user/.veris/logs/audit.jsonl.';
      const result = filter.filter(content);
      expect(result.valid).toBe(true); // Warning-only
      expect(result.issues.some((i) => i.code === 'INTERNAL_PATH_LEAKAGE')).toBe(true);
    });

    it('detects node_modules paths', () => {
      const content = 'Module at /project/node_modules/package/index.js.';
      const result = filter.filter(content);
      expect(result.issues.some((i) => i.code === 'INTERNAL_PATH_LEAKAGE')).toBe(true);
    });

    it('detects internal paths on Windows', () => {
      const content = 'Path: C:\\project\\.veris\\config.json.';
      const result = filter.filter(content);
      expect(result.issues.some((i) => i.code === 'INTERNAL_PATH_LEAKAGE')).toBe(true);
    });
  });

  describe('secret/token leakage', () => {
    it('detects AWS access keys', () => {
      const content = 'Key: AKIAIOSFODNN7EXAMPLE found in config.';
      const result = filter.filter(content);
      expect(result.blocked).toBe(true);
      expect(result.issues.some((i) => i.code === 'SECRET_LEAKAGE_DETECTED')).toBe(true);
    });

    it('detects JWT tokens', () => {
      const content =
        'Token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNqP3sVQKjIu0N1wNQ in header.';
      const result = filter.filter(content);
      expect(result.blocked).toBe(true);
    });

    it('detects SSH private keys', () => {
      const content = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...';
      const result = filter.filter(content);
      expect(result.blocked).toBe(true);
    });

    it('detects bearer tokens', () => {
      const content = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.token.here';
      const result = filter.filter(content);
      expect(result.blocked).toBe(true);
    });
  });

  describe('invalid Unicode handling', () => {
    it('detects replacement characters (U+FFFD)', () => {
      const content = 'Text with \uFFFD replacement char.';
      const result = filter.filter(content);
      expect(result.issues.some((i) => i.code === 'BROKEN_UNICODE')).toBe(true);
    });

    it('removes unpaired surrogates', () => {
      const content = 'Text with \uD800 unpaired surrogate.';
      const result = filter.filter(content);
      expect(result.issues.some((i) => i.code === 'INVALID_UNICODE_SURROGATES')).toBe(true);
    });

    it('normalizes Unicode to NFC', () => {
      // E + combining accent vs é
      const content = 'caf\u00E9'; // Already NFC
      const result = filter.filter(content);
      // Content should be normalized
      const normalized = result.sanitizedContent;
      expect(normalized.normalize('NFC')).toBe(normalized);
    });
  });

  describe('max length enforcement', () => {
    it('truncates content exceeding max length', () => {
      const longContent = 'A'.repeat(200 * 1024);
      const result = filter.filter(longContent);
      expect(result.issues.some((i) => i.code === 'OUTPUT_EXCEEDS_MAX_LENGTH')).toBe(true);
    });

    it('does not truncate content within limits', () => {
      const content = 'Normal length content.';
      const result = filter.filter(content);
      expect(result.issues.length).toBe(0);
      expect(result.sanitizedContent).toBe(content);
    });
  });

  describe('off-topic content detection', () => {
    it('detects greeting messages', () => {
      const content = 'Hello! How can I help you today?';
      const result = filter.filter(content);
      expect(result.issues.some((i) => i.code === 'OFF_TOPIC_CONTENT')).toBe(true);
    });

    it('detects thank you messages', () => {
      const content = 'Thank you for your question. The finding was...';
      const result = filter.filter(content);
      expect(result.issues.some((i) => i.code === 'OFF_TOPIC_CONTENT')).toBe(true);
    });

    it('allows normal explanation content', () => {
      const content = 'The finding [src:finding:fin_abc123] detected a hardcoded key.';
      const result = filter.filter(content);
      expect(result.issues.filter((i) => i.code === 'OFF_TOPIC_CONTENT').length).toBe(0);
    });
  });

  describe('empty and null handling', () => {
    it('handles empty content', () => {
      const result = filter.filter('');
      expect(result.valid).toBe(true);
      expect(result.blocked).toBe(false);
    });

    it('handles null content', () => {
      const result = filter.filter(null as unknown as string);
      expect(result.valid).toBe(true);
      expect(result.blocked).toBe(false);
      expect(result.sanitizedContent).toBe('');
    });
  });

  describe('determinism', () => {
    it('produces identical results across 100 runs', () => {
      const content =
        'The finding [src:finding:fin_abc123] detected a hardcoded key in src/config.ts.';
      const firstResult = filter.filter(content);
      for (let i = 0; i < 100; i++) {
        const result = filter.filter(content);
        expect(result.valid).toBe(firstResult.valid);
        expect(result.blocked).toBe(firstResult.blocked);
        expect(result.sanitizedContent).toBe(firstResult.sanitizedContent);
        expect(result.issues.length).toBe(firstResult.issues.length);
      }
    });

    it('produces identical results for blocked content across 100 runs', () => {
      const content = "<script>alert('xss')</script>";
      const firstResult = filter.filter(content);
      for (let i = 0; i < 100; i++) {
        const result = filter.filter(content);
        expect(result.valid).toBe(firstResult.valid);
        expect(result.blocked).toBe(firstResult.blocked);
      }
    });
  });
});
