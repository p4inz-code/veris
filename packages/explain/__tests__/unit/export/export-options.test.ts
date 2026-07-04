/**
 * Tests for export options validation.
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EXPORT_OPTIONS,
  validateExportOptions,
  SYSTEM_CLOCK,
} from '../../../src/export/export-options.js';

describe('validateExportOptions', () => {
  it('accepts valid options', () => {
    const result = validateExportOptions(DEFAULT_EXPORT_OPTIONS);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('rejects null options', () => {
    const result = validateExportOptions(null);
    expect(result.valid).toBe(false);
    expect(result.issues[0].code).toBe('OPTIONS_NOT_OBJECT');
  });

  it('rejects non-object options', () => {
    const result = validateExportOptions('invalid');
    expect(result.valid).toBe(false);
  });

  it('rejects invalid format', () => {
    const result = validateExportOptions({ format: 'html' });
    expect(result.valid).toBe(false);
    expect(result.issues[0].code).toBe('INVALID_FORMAT');
  });

  it('accepts markdown format', () => {
    const result = validateExportOptions({ format: 'markdown' });
    expect(result.valid).toBe(true);
  });

  it('accepts json format', () => {
    const result = validateExportOptions({ format: 'json' });
    expect(result.valid).toBe(true);
  });

  it('rejects invalid jsonMode', () => {
    const result = validateExportOptions({ jsonMode: 'ugly' });
    expect(result.valid).toBe(false);
    expect(result.issues[0].code).toBe('INVALID_JSON_MODE');
  });

  it('rejects non-integer jsonIndent', () => {
    const result = validateExportOptions({ jsonIndent: 1.5 });
    expect(result.valid).toBe(true);
    expect(result.issues[0].severity).toBe('warning');
    expect(result.issues[0].code).toBe('JSON_INDENT_NOT_INTEGER');
  });

  it('rejects negative jsonIndent', () => {
    const result = validateExportOptions({ jsonIndent: -1 });
    expect(result.valid).toBe(true);
    expect(result.issues[0].code).toBe('JSON_INDENT_OUT_OF_RANGE');
  });

  it('rejects empty schemaVersion', () => {
    const result = validateExportOptions({ schemaVersion: '' });
    expect(result.valid).toBe(false);
    expect(result.issues[0].code).toBe('SCHEMA_VERSION_INVALID');
  });

  it('rejects non-string schemaVersion', () => {
    const result = validateExportOptions({ schemaVersion: 123 });
    expect(result.valid).toBe(false);
    expect(result.issues[0].code).toBe('SCHEMA_VERSION_INVALID');
  });

  it('rejects invalid encoding', () => {
    const result = validateExportOptions({ encoding: 'rot13' });
    expect(result.valid).toBe(true);
    expect(result.issues[0].code).toBe('INVALID_ENCODING');
  });

  it('warns when includeToc is not boolean', () => {
    const result = validateExportOptions({ includeToc: 'yes' });
    expect(result.valid).toBe(true);
    expect(result.issues[0].code).toBe('INCLUDE_TOC_NOT_BOOLEAN');
  });

  it('warns when overwrite is not boolean', () => {
    const result = validateExportOptions({ overwrite: 1 });
    expect(result.valid).toBe(true);
    expect(result.issues[0].code).toBe('OVERWRITE_NOT_BOOLEAN');
  });
});

describe('DEFAULT_EXPORT_OPTIONS', () => {
  it('has all required fields', () => {
    expect(DEFAULT_EXPORT_OPTIONS.format).toBe('markdown');
    expect(DEFAULT_EXPORT_OPTIONS.jsonMode).toBe('pretty');
    expect(DEFAULT_EXPORT_OPTIONS.jsonIndent).toBe(2);
    expect(DEFAULT_EXPORT_OPTIONS.includeToc).toBe(true);
    expect(DEFAULT_EXPORT_OPTIONS.includeCitations).toBe(true);
    expect(DEFAULT_EXPORT_OPTIONS.includeDisclaimer).toBe(true);
    expect(DEFAULT_EXPORT_OPTIONS.overwrite).toBe(false);
    expect(DEFAULT_EXPORT_OPTIONS.schemaVersion).toBe('1.0.0');
    expect(DEFAULT_EXPORT_OPTIONS.stableOrdering).toBe(true);
    expect(DEFAULT_EXPORT_OPTIONS.encoding).toBe('utf-8');
  });

  it('has SYSTEM_CLOCK that returns Date', () => {
    const result = SYSTEM_CLOCK.now();
    expect(result).toBeInstanceOf(Date);
  });
});
