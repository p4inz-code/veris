/**
 * Tests for dashboard HTML sanitizer and protocol allowlisting.
 *
 * @module @veris/cli/__tests__/dashboard/sanitizer.test
 */

import { describe, it, expect } from 'vitest';
import { escapeHtml, sanitizeUrl, sanitizeIdentifier } from '../../src/dashboard/sanitizer.js';

describe('Dashboard Sanitizer', () => {
  describe('escapeHtml', () => {
    it('escapes dangerous HTML characters', () => {
      const malicious = '<script>alert("XSS & \'pwnd\'")</script>';
      const safe = escapeHtml(malicious);
      expect(safe).not.toContain('<script>');
      expect(safe).toContain('&lt;script&gt;');
      expect(safe).toContain('&quot;XSS');
      expect(safe).toContain('&amp;');
      expect(safe).toContain('&#39;pwnd&#39;');
      expect(safe).toContain('&lt;/script&gt;');
    });

    it('handles empty, null, or undefined values gracefully', () => {
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml(null as unknown as string)).toBe('');
      expect(escapeHtml(undefined as unknown as string)).toBe('');
    });

    it('leaves safe alphanumeric strings untouched', () => {
      expect(escapeHtml('Clean text 123')).toBe('Clean text 123');
    });
  });

  describe('sanitizeUrl', () => {
    it('allows valid http and https URLs', () => {
      expect(sanitizeUrl('https://example.com/advisory')).toBe('https://example.com/advisory');
      expect(sanitizeUrl('http://localhost:8080/path')).toBe('http://localhost:8080/path');
    });

    it('blocks dangerous protocols', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBe('#');
      expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBe('#');
      expect(sanitizeUrl('vbscript:msgbox(1)')).toBe('#');
      expect(sanitizeUrl('file:///etc/passwd')).toBe('#');
    });

    it('blocks invalid or blank URLs', () => {
      expect(sanitizeUrl('')).toBe('#');
      expect(sanitizeUrl('not a url')).toBe('#');
      expect(sanitizeUrl('   ')).toBe('#');
    });
  });

  describe('sanitizeIdentifier', () => {
    it('cleans non-alphanumeric characters for safe DOM IDs', () => {
      expect(sanitizeIdentifier('finding#123:cwe-78')).toBe('finding-123-cwe-78');
      expect(sanitizeIdentifier('rule/path/to/threat.rule')).toBe('rule-path-to-threat-rule');
    });

    it('collapses multiple consecutive dashes', () => {
      expect(sanitizeIdentifier('test---id___123')).toBe('test-id-123');
    });
  });
});
