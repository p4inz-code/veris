import { describe, it, expect } from 'vitest';
import { VerisError } from '../src/errors/veris-error.js';
import { ParseError, ParseErrorCodes } from '../src/errors/parse-error.js';
import { ExtractError, ExtractErrorCodes } from '../src/errors/extract-error.js';
import { RuleError, RuleErrorCodes } from '../src/errors/rule-error.js';

describe('VerisError', () => {
  it('creates an error with code, category, and message', () => {
    const err = new VerisError({ code: 'TEST_001', category: 'internal', message: 'Test error' });
    expect(err.code).toBe('TEST_001');
    expect(err.category).toBe('internal');
    expect(err.message).toBe('Test error');
    expect(err.name).toBe('VerisError');
  });

  it('sets userMessage to message if not provided', () => {
    const err = new VerisError({ code: 'TEST_001', category: 'internal', message: 'Test error' });
    expect(err.userMessage).toBe('Test error');
  });

  it('supports custom userMessage', () => {
    const err = new VerisError({
      code: 'TEST_001',
      category: 'internal',
      message: 'Internal details',
      userMessage: 'User-safe message',
    });
    expect(err.userMessage).toBe('User-safe message');
  });

  it('supports nested cause', () => {
    const cause = new Error('Root cause');
    const err = new VerisError({
      code: 'TEST_001',
      category: 'internal',
      message: 'Wrapper',
      cause,
    });
    expect(err.cause).toBe(cause);
  });

  it('supports metadata', () => {
    const err = new VerisError({
      code: 'TEST_001',
      category: 'internal',
      message: 'Test',
      metadata: { file: 'test.ts', line: 42 },
    });
    expect(err.metadata.file).toBe('test.ts');
    expect(err.metadata.line).toBe(42);
  });

  it('is immutable - metadata is frozen', () => {
    const err = new VerisError({
      code: 'TEST_001',
      category: 'internal',
      message: 'Test',
      metadata: { key: 'value' },
    });
    expect(Object.isFrozen(err.metadata)).toBe(true);
  });

  it('serializes to JSON correctly', () => {
    const err = new VerisError({ code: 'TEST_001', category: 'internal', message: 'Test error' });
    const json = err.toJSON();
    expect(json.name).toBe('VerisError');
    expect(json.code).toBe('TEST_001');
    expect(json.category).toBe('internal');
    expect(json.message).toBe('Test error');
    expect(json.cause).toBeNull();
    expect(json.stack).toBeTypeOf('string');
  });

  it('serializes nested cause in JSON', () => {
    const cause = new VerisError({ code: 'CAUSE_001', category: 'internal', message: 'Cause' });
    const err = new VerisError({
      code: 'TEST_001',
      category: 'internal',
      message: 'Wrapper',
      cause,
    });
    const json = err.toJSON();
    expect(json.cause).not.toBeNull();
    expect(json.cause!.code).toBe('CAUSE_001');
  });

  it('returns error chain from getChain()', () => {
    const cause = new VerisError({ code: 'CAUSE', category: 'internal', message: 'Cause' });
    const err = new VerisError({ code: 'MAIN', category: 'internal', message: 'Main', cause });
    const chain = err.getChain();
    expect(chain.length).toBe(2);
    expect(chain[0].code).toBe('MAIN');
    expect(chain[1].code).toBe('CAUSE');
  });

  it('withMetadata returns a new instance with additional metadata', () => {
    const err = new VerisError({
      code: 'TEST',
      category: 'internal',
      message: 'Test',
      metadata: { original: true },
    });
    const enhanced = err.withMetadata({ additional: true });
    expect(enhanced.metadata.original).toBe(true);
    expect(enhanced.metadata.additional).toBe(true);
    expect(err.metadata.additional).toBeUndefined();
  });
});

describe('ParseError', () => {
  it('creates with correct name and category', () => {
    const err = new ParseError({ message: 'Parse failed' });
    expect(err.name).toBe('ParseError');
    expect(err.category).toBe('parse');
  });

  it('uses default code if not specified', () => {
    const err = new ParseError({ message: 'Syntax error' });
    expect(err.code).toBe('PARSE_001');
  });

  it('allows custom code', () => {
    const err = new ParseError({ code: ParseErrorCodes.ENCODING_ERROR, message: 'Encoding issue' });
    expect(err.code).toBe('PARSE_002');
  });
});

describe('ExtractError', () => {
  it('creates with correct name and category', () => {
    const err = new ExtractError({ message: 'Extraction failed' });
    expect(err.name).toBe('ExtractError');
    expect(err.category).toBe('extract');
  });

  it('uses expected error codes', () => {
    expect(ExtractErrorCodes.SECURITY_VIOLATION).toBe('EXTRACT_003');
    expect(ExtractErrorCodes.PARSER_TIMEOUT).toBe('EXTRACT_006');
  });
});

describe('RuleError', () => {
  it('creates with correct name and category', () => {
    const err = new RuleError({ message: 'Rule failed' });
    expect(err.name).toBe('RuleError');
    expect(err.category).toBe('rule');
  });

  it('has correct error codes', () => {
    expect(RuleErrorCodes.DEPENDENCY_CYCLE).toBe('RULE_004');
    expect(RuleErrorCodes.SANDBOX_VIOLATION).toBe('RULE_006');
  });
});
