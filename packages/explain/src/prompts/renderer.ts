/**
 * Prompt renderer — Handlebars-based template rendering for prompt generation.
 *
 * The renderer:
 * 1. Compiles Handlebars templates
 * 2. Pre-processes ExplainedContext into a flat object for Handlebars consumption
 * 3. Registers built-in helpers
 * 4. Renders the template with the context
 * 5. Detects any unreplaced variables (rendering failures)
 *
 * @module @veris/explain/prompts/renderer
 */

import Handlebars from 'handlebars';
import type { Template } from 'handlebars';

import { createBuiltinHelpers } from './helpers.js';
import { detectMissingVariables } from './variables.js';

// ── Types ──

/** Options for the prompt renderer. */
export interface PromptRendererOptions {
  /** Whether to strip extra whitespace from rendered output (default: true). */
  readonly stripWhitespace?: boolean;
}

/** Result of rendering a prompt template. */
export interface RenderResult {
  /** The rendered template content. */
  readonly content: string;
  /** Number of tokens estimated from the rendered output. */
  readonly tokenEstimate: number;
  /** Any variables that were not replaced. */
  readonly missingVariables: readonly string[];
}

// ── PromptRenderer ──

/**
 * Handlebars-based prompt renderer.
 *
 * Provides:
 * - Handlebars compilation safety (pre-compiled templates)
 * - Context pre-processing (flatten TypeScript types for Handlebars)
 * - Custom helper registration
 * - Missing-variable detection on rendered output
 */
export class PromptRenderer {
  private readonly handlebars: typeof Handlebars;
  private readonly compiledCache: Map<string, HandlebarsTemplateDelegate>;
  private readonly stripWhitespace: boolean;

  constructor(options?: PromptRendererOptions) {
    this.handlebars = Handlebars.create();
    this.compiledCache = new Map();
    this.stripWhitespace = options?.stripWhitespace ?? true;

    // Register built-in helpers
    this.handlebars.registerHelper(createBuiltinHelpers());
  }

  /**
   * Render a template string with the given context.
   *
   * @param templateContent - The Handlebars template content (without frontmatter).
   * @param context - Context data to inject into the template.
   * @returns Render result with content and metadata.
   */
  render(templateContent: string, context: Record<string, unknown>): RenderResult {
    // Pre-process context for Handlebars compatibility
    const processedContext = preprocessContext(context);

    // Compile or get from cache
    let compiled = this.compiledCache.get(templateContent);
    if (!compiled) {
      compiled = this.handlebars.compile(templateContent, {
        noEscape: false,
        strict: false,
        preventIndent: true,
      });
      this.compiledCache.set(templateContent, compiled);
    }

    // Render
    let rendered = compiled(processedContext);

    // Post-process: strip extra whitespace
    if (this.stripWhitespace) {
      rendered = rendered
        .replace(/[ \t]+\n/g, '\n') // Trailing whitespace
        .replace(/\n{3,}/g, '\n\n') // Multiple blank lines → max 2
        .replace(/^[ \t]+/gm, '') // Leading whitespace on each line
        .trim();
    }

    // Detect missing variables
    const missingVariables = detectMissingVariables(rendered);

    return {
      content: rendered,
      tokenEstimate: estimateTokens(rendered),
      missingVariables,
    };
  }

  /**
   * Render a template with a pre-compiled template delegate.
   * Use this when rendering the same template multiple times for better performance.
   *
   * @param compiled - A pre-compiled Handlebars template.
   * @param context - Context data.
   * @returns Render result.
   */
  renderCompiled(
    compiled: HandlebarsTemplateDelegate,
    context: Record<string, unknown>,
  ): RenderResult {
    const processedContext = preprocessContext(context);
    let rendered = compiled(processedContext);

    if (this.stripWhitespace) {
      rendered = rendered
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/^[ \t]+/gm, '')
        .trim();
    }

    return {
      content: rendered,
      tokenEstimate: estimateTokens(rendered),
      missingVariables: detectMissingVariables(rendered),
    };
  }

  /**
   * Compile a template string for later use.
   * Useful for pre-compiling templates at startup.
   *
   * @param templateContent - Template content.
   * @returns Compiled template delegate.
   */
  compile(templateContent: string): HandlebarsTemplateDelegate {
    let compiled = this.compiledCache.get(templateContent);
    if (!compiled) {
      compiled = this.handlebars.compile(templateContent);
      this.compiledCache.set(templateContent, compiled);
    }
    return compiled;
  }

  /**
   * Clear the compiled template cache.
   * Call this when templates change at runtime.
   */
  clearCache(): void {
    this.compiledCache.clear();
  }

  /**
   * Register additional Handlebars helpers.
   *
   * @param helpers - Record of helper functions to register.
   */
  registerHelpers(helpers: Record<string, (...args: unknown[]) => unknown>): void {
    for (const [name, fn] of Object.entries(helpers)) {
      this.handlebars.registerHelper(name, fn);
    }
  }
}

// ── Context Pre-processing ──

/**
 * Pre-process context object for Handlebars compatibility.
 *
 * Handlebars cannot traverse TypeScript's readonly or nested types directly.
 * This function:
 * 1. Converts readonly arrays to plain arrays (Handlebars #each)
 * 2. Preserves nested object structure
 * 3. Adds index helpers for #each iterations (automatically handled by Handlebars)
 *
 * @param context - The raw context object.
 * @returns A processed object suitable for Handlebars.
 */
function preprocessContext(context: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(context)) {
    result[key] = deepConvert(value);
  }

  return result;
}

/**
 * Deep-convert a value for Handlebars compatibility.
 * Converts readonly arrays to plain arrays.
 */
function deepConvert(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(deepConvert);
  }

  if (typeof value === 'object' && !(value instanceof Date)) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = deepConvert(v);
    }
    return result;
  }

  return value;
}

// ── Helpers ──

/**
 * Rough token estimate (4 chars ≈ 1 token).
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Re-export Handlebars type for public API
export type { Template as HandlebarsTemplateDelegate };
