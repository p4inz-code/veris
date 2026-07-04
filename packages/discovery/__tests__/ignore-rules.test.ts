import { describe, it, expect } from 'vitest';
import { createIgnoreRules, DEFAULT_IGNORE_PATTERNS } from '../src/index.js';

describe('IgnoreRules', () => {
  it('should not ignore a normal path by default', () => {
    const rules = createIgnoreRules();
    expect(rules.isIgnored('src/index.ts')).toBe(false);
  });

  it('should ignore .git directories by default', () => {
    const rules = createIgnoreRules();
    rules.addPatterns(DEFAULT_IGNORE_PATTERNS);
    expect(rules.isIgnored('.git/HEAD')).toBe(true);
    expect(rules.isIgnored('.git/objects/abc123')).toBe(true);
  });

  it('should ignore node_modules by default', () => {
    const rules = createIgnoreRules();
    rules.addPatterns(DEFAULT_IGNORE_PATTERNS);
    expect(rules.isIgnored('node_modules/express/index.js')).toBe(true);
  });

  it('should handle negation patterns', () => {
    const rules = createIgnoreRules();
    rules.addPattern('*.log');
    rules.addPattern('!important.log');
    expect(rules.isIgnored('debug.log')).toBe(true);
    expect(rules.isIgnored('important.log')).toBe(false);
  });

  it('should handle directory-only patterns', () => {
    const rules = createIgnoreRules();
    rules.addPattern('build/');
    expect(rules.isIgnored('build/output.js')).toBe(true);
    expect(rules.isIgnored('build')).toBe(true);
    expect(rules.isIgnored('src/build.js')).toBe(false);
  });

  it('should handle wildcard patterns', () => {
    const rules = createIgnoreRules();
    rules.addPattern('*.pyc');
    expect(rules.isIgnored('src/__pycache__/module.pyc')).toBe(true);
    expect(rules.isIgnored('module.pyc')).toBe(true);
    expect(rules.isIgnored('module.py')).toBe(false);
  });

  it('should skip empty lines and comments', () => {
    const rules = createIgnoreRules();
    rules.addPattern('');
    rules.addPattern('  ');
    rules.addPattern('# this is a comment');
    expect(rules.isIgnored('anything.txt')).toBe(false);
  });

  it('should match nested paths', () => {
    const rules = createIgnoreRules();
    rules.addPattern('.DS_Store');
    expect(rules.isIgnored('.DS_Store')).toBe(true);
    expect(rules.isIgnored('src/.DS_Store')).toBe(true);
    expect(rules.isIgnored('src/foo/.DS_Store')).toBe(true);
  });

  it('should handle multiple patterns added at once', () => {
    const rules = createIgnoreRules();
    rules.addPatterns(['*.log', '*.tmp', 'node_modules/']);
    expect(rules.isIgnored('error.log')).toBe(true);
    expect(rules.isIgnored('temp.tmp')).toBe(true);
    expect(rules.isIgnored('node_modules/package/index.js')).toBe(true);
    expect(rules.isIgnored('src/index.ts')).toBe(false);
  });
});
