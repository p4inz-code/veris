/**
 * Ignore rules implementation for VERIS discovery.
 *
 * Provides gitignore-style pattern matching for excluding files
 * and directories during discovery.
 *
 * @module @veris/discovery/ignore-rules
 */

import type { IgnoreRules } from './types.js';

/**
 * Create an IgnoreRules instance with support for gitignore-style patterns.
 */
export function createIgnoreRules(): IgnoreRules {
  const patterns: Array<{ pattern: string; regex: RegExp; negate: boolean }> = [];

  function isIgnored(relativePath: string): boolean {
    // Normalize path separators
    const normalized = relativePath.replace(/\\/g, '/');

    let ignored = false;

    for (const entry of patterns) {
      if (entry.negate) {
        // Negation patterns override ignores
        if (entry.regex.test(normalized)) {
          ignored = false;
        }
      } else {
        if (entry.regex.test(normalized)) {
          ignored = true;
        }
      }
    }

    return ignored;
  }

  function addPattern(pattern: string): void {
    const trimmed = pattern.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) return;

    let negate = false;
    let p = trimmed;

    // Handle negation patterns
    if (p.startsWith('!')) {
      negate = true;
      p = p.slice(1);
    }

    // Remove trailing slash for directory-only patterns
    const dirOnly = p.endsWith('/');
    if (dirOnly) p = p.slice(0, -1);

    // Escape regex special characters
    let regexStr = '';
    for (const ch of p) {
      if (ch === '*') {
        regexStr += '[^/]*';
      } else if (ch === '?') {
        regexStr += '[^/]';
      } else if (
        ch === '.' ||
        ch === '[' ||
        ch === ']' ||
        ch === '(' ||
        ch === ')' ||
        ch === '+' ||
        ch === '^' ||
        ch === '$' ||
        ch === '|' ||
        ch === '{'
      ) {
        regexStr += '\\' + ch;
      } else if (ch === '/' && regexStr === '') {
        // Pattern starting with / matches from root
        continue;
      } else {
        regexStr += ch;
      }
    }

    // If pattern doesn't contain /, it matches basename in any directory
    const fullRegex = p.includes('/')
      ? `^${regexStr}${dirOnly ? '(/.*)?$' : '$'}`
      : `(^|.*/)${regexStr}${dirOnly ? '(/.*)?$' : '$'}`;

    patterns.push({
      pattern: trimmed,
      regex: new RegExp(fullRegex),
      negate,
    });
  }

  function addPatterns(patternsToAdd: readonly string[]): void {
    for (const p of patternsToAdd) {
      addPattern(p);
    }
  }

  return { isIgnored, addPattern, addPatterns };
}

/**
 * Common default ignore patterns for VERIS discovery.
 */
export const DEFAULT_IGNORE_PATTERNS: readonly string[] = [
  '.git/',
  '.svn/',
  '.hg/',
  'node_modules/',
  '.veris/',
  '.verisignore',
  '.gitignore',
  '*.pyc',
  '__pycache__/',
  '.DS_Store',
  'Thumbs.db',
  '*.class',
  '*.o',
  '*.obj',
  '*.dll',
  '*.exe',
  '*.so',
  '*.dylib',
] as const;
