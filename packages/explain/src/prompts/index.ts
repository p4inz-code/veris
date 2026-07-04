/**
 * Prompts module — versioned prompt templates with Handlebars rendering.
 *
 * Implements SPEC-011 Section 9: Prompt Architecture with:
 * - YAML frontmatter parsing and validation
 * - Template semantic versioning (MAJOR.MINOR.PATCH)
 * - Handlebars rendering with built-in helpers
 * - Variable validation and missing-variable detection
 * - Template registry with caching
 * - Deterministic rendering
 * - Prompt injection safeguards
 *
 * @module @veris/explain/prompts
 */

// Frontmatter
export { parseFrontmatter, validateSemver, compareSemver } from './frontmatter.js';
export type { TemplateFrontmatter, ParsedTemplate, TemplateType } from './frontmatter.js';

// Variables
export { extractVariables, validateVariables, detectMissingVariables } from './variables.js';
export type { TemplateVariable, VariableValidationResult } from './variables.js';

// Helpers
export { createBuiltinHelpers } from './helpers.js';

// Validator
export { validateTemplate, validateTemplateId } from './validator.js';
export type { ValidationSeverity, ValidationIssue, ValidationResult } from './validator.js';

// Template Loader
export { TemplateLoader } from './template-loader.js';
export type { TemplateLoaderOptions } from './template-loader.js';

// Template Registry
export { TemplateRegistry } from './template-registry.js';
export type {
  TemplateInfo,
  TemplateRegistryOptions,
  PromptRegistry,
  RenderedPrompt,
} from './template-registry.js';

// Renderer
export { PromptRenderer } from './renderer.js';
export type { PromptRendererOptions, RenderResult } from './renderer.js';

// Cache Key
export {
  extractCacheKeyComponents,
  formatPromptVersion,
  isCacheStale,
  encodePromptSegment,
  getMajorVersion,
  isVersionCompatible,
} from './cache-key.js';
export type { PromptCacheKeyComponents } from './cache-key.js';
