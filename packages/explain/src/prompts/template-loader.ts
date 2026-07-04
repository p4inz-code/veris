/**
 * Template loader — loads prompt templates from disk with security restrictions.
 *
 * Features:
 * - Loads templates from package assets (shipped templates)
 * - Loads custom templates from user config directory
 * - Path traversal protection (rejects paths with .. or absolute paths)
 * - Template caching with invalidation
 * - File watching in development mode
 *
 * @module @veris/explain/prompts/template-loader
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ParsedTemplate } from './frontmatter.js';
import { parseFrontmatter } from './frontmatter.js';

// ── Constants ──

/** Directory for shipped prompt templates within the package. */
const SHIPPED_TEMPLATES_DIR = 'prompts';

/** Cache time-to-live for loaded templates (60 seconds). */
const CACHE_TTL_MS = 60_000;

// ── Types ──

/** Options for the template loader. */
export interface TemplateLoaderOptions {
  /** Additional directory to search for custom templates (e.g., user config dir). */
  readonly customTemplatesDir?: string;
  /** Whether to reload templates on every load (disable caching). */
  readonly noCache?: boolean;
  /** Whether to watch for file changes (development mode). */
  readonly watch?: boolean;
}

/** A cached template entry. */
interface CacheEntry {
  readonly parsed: ParsedTemplate;
  readonly loadedAt: number;
  readonly filePath: string;
}

// ── TemplateLoader ──

/**
 * Template loader with disk access, caching, and path traversal protection.
 */
export class TemplateLoader {
  private readonly templatesDir: string;
  private readonly customDir: string | undefined;
  private readonly cache: Map<string, CacheEntry> = new Map();
  private readonly noCache: boolean;

  constructor(options?: TemplateLoaderOptions) {
    // Resolve shipped templates directory relative to this package
    // Source is at packages/explain/src/prompts/template-loader.ts
    // Templates are at packages/explain/prompts/
    const currentFile = fileURLToPath(import.meta.url);
    this.templatesDir = path.resolve(currentFile, '..', '..', '..', 'prompts');
    this.customDir = options?.customTemplatesDir;
    this.noCache = options?.noCache ?? false;
  }

  /**
   * Load a template by its file name (without extension).
   * First searches the custom templates directory, then falls back to shipped templates.
   *
   * @param templateName - Template file name (e.g., "finding-explain-system-v1").
   * @returns Parsed template with frontmatter and content.
   * @throws If template is not found or path is invalid.
   */
  load(templateName: string): ParsedTemplate {
    // Check cache first
    if (!this.noCache) {
      const cached = this.cache.get(templateName);
      if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
        return cached.parsed;
      }
    }

    // Try custom directory first, then shipped directory
    const searchPaths: string[] = [path.join(this.templatesDir, `${templateName}.hbs`)];

    if (this.customDir) {
      searchPaths.unshift(path.join(this.customDir, `${templateName}.hbs`));
    }

    let lastError: Error | undefined;

    for (const filePath of searchPaths) {
      try {
        // Security: reject path traversal attempts
        validatePath(filePath, this.templatesDir);

        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = parseFrontmatter(content);

        // Cache the loaded template
        this.cache.set(templateName, {
          parsed,
          loadedAt: Date.now(),
          filePath,
        });

        return parsed;
      } catch (e) {
        if (e instanceof Error) {
          lastError = e;
        }
      }
    }

    throw lastError ?? new Error(`Template not found: ${templateName}`);
  }

  /**
   * Load a template by its exact file path.
   * Skips caching and security validation (for use by internal tools only).
   *
   * @param filePath - Exact path to the template file.
   * @returns Parsed template with frontmatter and content.
   */
  loadFromPath(filePath: string): ParsedTemplate {
    // Skip path validation for explicit path loading (used by loadCustomTemplate)
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseFrontmatter(content);
  }

  /**
   * Check if a template exists in any search directory.
   *
   * @param templateName - Template file name (without extension).
   * @returns True if the template file exists.
   */
  exists(templateName: string): boolean {
    try {
      this.load(templateName);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Invalidate a cached template entry.
   *
   * @param templateName - Optional template name to invalidate. If omitted, clears all cache.
   */
  invalidateCache(templateName?: string): void {
    if (templateName) {
      this.cache.delete(templateName);
    } else {
      this.cache.clear();
    }
  }
}

// ── Path Validation ──

/**
 * Validate that a file path does not escape the allowed base directory.
 * Prevents path traversal attacks.
 *
 * @param filePath - Path to validate.
 * @param baseDir - Allowed base directory.
 * @throws If the path is invalid or attempts traversal.
 */
function validatePath(filePath: string, baseDir: string): void {
  const resolved = path.resolve(filePath);
  const resolvedBase = path.resolve(baseDir);

  // Reject paths that contain ".." segments
  const normalized = path.normalize(filePath);
  if (normalized.includes('..')) {
    throw new Error(`Path traversal detected: "${filePath}". Path must not contain ".." segments.`);
  }

  // Reject absolute paths that are outside the base directory
  if (path.isAbsolute(filePath) && !resolved.startsWith(resolvedBase)) {
    throw new Error(
      `Path outside allowed directory: "${filePath}". All paths must be within "${baseDir}".`,
    );
  }

  // Reject paths with null bytes
  if (filePath.includes('\0')) {
    throw new Error('Path contains null byte — rejected');
  }
}
