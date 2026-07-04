/**
 * Template registry — manages versioned prompt templates with loading, caching,
 * version checking, and Handlebars rendering via PromptRenderer delegation.
 *
 * Features:
 * - Register templates with version tracking
 * - Load from disk via TemplateLoader
 * - Render templates via PromptRenderer (delegated)
 * - Version checking for cache key generation
 * - Template listing with metadata
 * - Custom template loading with security validation
 *
 * @module @veris/explain/prompts/template-registry
 */

import type { ParsedTemplate, TemplateFrontmatter } from './frontmatter.js';
import { compareSemver } from './frontmatter.js';
import { PromptRenderer } from './renderer.js';
import { TemplateLoader } from './template-loader.js';
import type { TemplateLoaderOptions } from './template-loader.js';
import { validateTemplateId } from './validator.js';

// ── Types ──

/** Information about a registered template. */
export interface TemplateInfo {
  readonly id: string;
  readonly version: string;
  readonly type: string;
  readonly description: string;
  readonly changed: string;
  /** Raw template content including frontmatter. */
  readonly rawContent: string;
  /** Template content without frontmatter. */
  readonly content: string;
}

/** Options for the template registry. */
export interface TemplateRegistryOptions extends TemplateLoaderOptions {
  /** Pre-registered templates (for testing or in-memory usage). */
  readonly templates?: TemplateInfo[];
}

// ── PromptRegistry Interface ──

/** The prompt registry interface. */
export interface PromptRegistry {
  /** Render a prompt for the given template ID and context. */
  render(templateId: string, context: Record<string, unknown>, mode: string): RenderedPrompt;
  /** List all registered templates with metadata. */
  listTemplates(): readonly TemplateInfo[];
  /** Get the version of a specific template. */
  getTemplateVersion(templateId: string): string;
  /** Load and register a custom template from a file path. */
  loadCustomTemplate(templateId: string, filePath: string): void;
  /** Get a template by ID. */
  get(id: string): TemplateInfo | undefined;
  /** Check if a template is registered. */
  has(id: string): boolean;
  /** Register a template directly. */
  register(template: TemplateInfo): void;
  /** Get the raw content of a template. */
  getContent(templateId: string): string;
}

/** A rendered prompt ready for the provider. */
export interface RenderedPrompt {
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly expectedCitations: readonly string[];
  readonly tokenEstimate: number;
  readonly version: string;
}

// ── Constants ──

const DEFAULT_SYSTEM_TEMPLATE = 'system';

// ── TemplateRegistry Implementation ──

/**
 * Default implementation of PromptRegistry.
 *
 * Manages versioned templates loaded from disk or registered programmatically.
 * Delegates actual Handlebars rendering to PromptRenderer.
 * Provides version checking for cache key integration.
 */
export class TemplateRegistry implements PromptRegistry {
  private readonly templates: Map<string, TemplateInfo> = new Map();
  private readonly loader: TemplateLoader;
  private readonly renderer: PromptRenderer;

  constructor(options?: TemplateRegistryOptions) {
    this.loader = new TemplateLoader(options);
    this.renderer = new PromptRenderer();

    // Pre-register templates if provided
    if (options?.templates) {
      for (const tpl of options.templates) {
        this.register(tpl);
      }
    }
  }

  /**
   * Render a prompt using the given template and context.
   * Delegates to PromptRenderer for actual Handlebars compilation and rendering.
   *
   * @param templateId - The template ID to render (e.g., "finding-explain-v1").
   * @param context - Context data for rendering (ExplainedContext fields).
   * @param _mode - Explanation mode ("simple", "technical", "expert").
   * @returns Rendered prompt with metadata.
   */
  render(templateId: string, context: Record<string, unknown>, _mode: string): RenderedPrompt {
    const template = this.get(templateId);
    if (!template) {
      throw new Error(`Template not registered: ${templateId}`);
    }

    // Get system template if available
    const systemTemplate = this.get(DEFAULT_SYSTEM_TEMPLATE);

    // Delegate to PromptRenderer for actual Handlebars rendering
    const systemResult = systemTemplate
      ? this.renderer.render(systemTemplate.content, context)
      : null;

    const userResult = this.renderer.render(template.content, context);

    return {
      systemPrompt: systemResult?.content ?? '',
      userPrompt: userResult.content,
      expectedCitations: [],
      tokenEstimate: userResult.tokenEstimate + (systemResult?.tokenEstimate ?? 0),
      version: template.version,
    };
  }

  /** List all registered templates. */
  listTemplates(): readonly TemplateInfo[] {
    return Array.from(this.templates.values());
  }

  /** Get the version of a specific template. */
  getTemplateVersion(templateId: string): string {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }
    return template.version;
  }

  /**
   * Load and register a custom template from a file path.
   * Path traversal attempts are rejected by the TemplateLoader.
   */
  loadCustomTemplate(templateId: string, filePath: string): void {
    const parsed = this.loader.loadFromPath(filePath);
    this.register({
      id: parsed.frontmatter.id,
      version: parsed.frontmatter.version,
      type: parsed.frontmatter.type,
      description: parsed.frontmatter.description,
      changed: parsed.frontmatter.changed,
      content: parsed.content,
      rawContent: parsed.content,
    });
  }

  /** Get a template by ID. */
  get(id: string): TemplateInfo | undefined {
    return this.templates.get(id);
  }

  /** Get raw template content by ID. */
  getContent(templateId: string): string {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }
    return template.content;
  }

  /** Check if a template is registered. */
  has(id: string): boolean {
    return this.templates.has(id);
  }

  /** Register a template directly. */
  register(template: TemplateInfo): void {
    // Validate ID format
    if (!validateTemplateId(template.id)) {
      throw new Error(
        `Invalid template ID format: "${template.id}". Must match {subject}-{purpose}-v{major}.`,
      );
    }

    this.templates.set(template.id, template);
  }

  /**
   * Compare template versions. Returns true if template a has a higher version than template b.
   */
  isNewerVersionThan(templateId: string, version: string): boolean {
    const current = this.getTemplateVersion(templateId);
    return compareSemver(current, version) > 0;
  }

  /** Total number of registered templates. */
  get size(): number {
    return this.templates.size;
  }
}
