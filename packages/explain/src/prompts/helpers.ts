/**
 * Handlebars helpers — built-in formatting helpers for prompt templates.
 *
 * These helpers are registered with Handlebars at render time and provide
 * common formatting operations used in template files:
 *
 * - severity-label: Maps severity level to a human-readable label
 * - format-confidence: Formats [0,1] confidence as percentage string
 * - format-score: Formats a numeric score to 1 decimal place
 * - eq: Equality check for #if blocks
 * - gt: Greater-than check
 * - lt: Less-than check
 * - and: Logical AND
 * - or: Logical OR
 * - not: Logical NOT
 * - json: JSON-stringify a value
 * - pluralize: Simple pluralization helper
 * - concat: String concatenation
 *
 * @module @veris/explain/prompts/helpers
 */

import type { HelperDeclareSpec } from 'handlebars';

/**
 * Create the set of built-in Handlebars helpers used by prompt templates.
 *
 * @returns A record of helper name → helper function for Handlebars.registerHelpers.
 */
export function createBuiltinHelpers(): HelperDeclareSpec {
  return {
    /**
     * Map severity level to human-readable label.
     * Usage: {{severity-label finding.severity.level}}
     * Output: "Critical" | "High" | "Medium" | "Low" | "Negligible"
     */
    'severity-label'(level: string): string {
      const labels: Record<string, string> = {
        critical: 'Critical',
        high: 'High',
        medium: 'Medium',
        low: 'Low',
        negligible: 'Negligible',
      };
      return labels[level?.toLowerCase()] ?? level;
    },

    /**
     * Format confidence [0,1] as a percentage string.
     * Usage: {{format-confidence evidence.confidence}}
     * Output: "95%"
     */
    'format-confidence'(confidence: number): string {
      const val = typeof confidence === 'number' && !Number.isNaN(confidence) ? confidence : 0;
      return `${Math.round(val * 100)}%`;
    },

    /**
     * Format a numeric score to 1 decimal place.
     * Usage: {{format-score finding.severity.score}}
     * Output: "9.5"
     */
    'format-score'(score: number): string {
      const val = typeof score === 'number' ? score : 0;
      return val.toFixed(1);
    },

    /**
     * Equality check. Used in #if blocks.
     * Usage: {{#if (eq a b)}}equal{{/if}}
     */
    eq(a: unknown, b: unknown): boolean {
      return a === b;
    },

    /**
     * Greater-than check.
     * Usage: {{#if (gt score 5)}}above threshold{{/if}}
     */
    gt(a: number, b: number): boolean {
      return a > b;
    },

    /**
     * Less-than check.
     * Usage: {{#if (lt score 3)}}low severity{{/if}}
     */
    lt(a: number, b: number): boolean {
      return a < b;
    },

    /**
     * Logical AND of two values.
     */
    and(a: unknown, b: unknown): boolean {
      return Boolean(a) && Boolean(b);
    },

    /**
     * Logical OR of two values.
     */
    or(a: unknown, b: unknown): boolean {
      return Boolean(a) || Boolean(b);
    },

    /**
     * Logical NOT of a value.
     */
    not(a: unknown): boolean {
      return !a;
    },

    /**
     * JSON-stringify a value.
     * Usage: {{json someObject}}
     */
    json(value: unknown): string {
      return JSON.stringify(value, null, 2);
    },

    /**
     * Simple pluralization. Adds "s" or custom plural for values != 1.
     * Handles the Handlebars options object that gets appended as the last argument.
     * Usage: {{pluralize evidence.length "match"}}
     * Output: "1 match" or "3 matches"
     */
    pluralize(...args: unknown[]): string {
      const count = args[0] as number;
      const singular = args[1] as string;
      // When Handlebars calls the helper with 2 user args (count, singular),
      // the 3rd arg is the Handlebars options object.
      // When called with 3 user args (count, singular, plural),
      // the 4th arg is the options object.
      const hasCustomPlural =
        args.length > 2 && typeof args[2] === 'string' && args[2] !== '[object Object]';
      const pluralOpt = hasCustomPlural ? (args[2] as string) : undefined;
      const val = typeof count === 'number' && !Number.isNaN(count) ? count : 0;
      if (val === 1) return `${val} ${singular}`;
      return `${val} ${pluralOpt ?? `${singular}s`}`;
    },

    /**
     * Concatenate strings.
     * Usage: {{concat "hello" " " "world"}}
     */
    concat(...args: unknown[]): string {
      // Last argument is the Handlebars options object — remove it
      const values = args.slice(0, -1) as string[];
      return values.join('');
    },
  };
}
