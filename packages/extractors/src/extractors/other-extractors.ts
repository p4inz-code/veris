/**
 * Specialized extractors for environment files, requirements, packages, and lockfiles.
 *
 * @module @veris/extractors/extractors/other-extractors
 */

import { BaseExtractor } from '../base-extractor.js';
import type { ExtractionContext, ExtractionResult } from '../types.js';
import { createRawFeature } from '../types.js';

// ─── Git Repository Extractor ───────────────────────────────────

/**
 * Extracts metadata from Git repositories.
 * Detects repository structure (HEAD ref, branches, remotes).
 * Does NOT clone or fetch — operates on local .git directories.
 */
export class GitExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'git-extractor',
      name: 'Git Repository Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['repository'],
      priority: 100,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content) return false;
    // Check for .git directory indicator
    const text = context.content.toString('utf-8', 0, Math.min(context.content.length, 200));
    return text.includes('HEAD') || text.includes('ref: ') || text.includes('[core]');
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const text = buffer.toString('utf-8');
    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      // Read HEAD ref
      const headMatch = text.match(/^ref:\s+(\S+)/m);
      if (headMatch) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'git-head-ref',
            value: headMatch[1],
            confidence: 1.0,
          }),
        );
      }

      // Detect bare repository
      if (text.includes('[core]') && text.includes('bare = true')) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'git-bare-repository',
            value: true,
            confidence: 1.0,
          }),
        );
      }

      // Count remote entries
      const remoteCount = (text.match(/\[remote\s+\"/g) || []).length;
      if (remoteCount > 0) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'git-remote-count',
            value: remoteCount,
            confidence: 1.0,
          }),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'GIT_ERROR',
          `Failed to process Git repo: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(features, { bytesProcessed: buffer.length, startTime, endTime, issues });
  }
}

// ─── Environment Files Extractor ────────────────────────────────

/**
 * Extracts deterministic features from environment files (.env, .env.*).
 * Detects variable names and values (without exposing secrets in output).
 */
export class EnvFileExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'env-extractor',
      name: 'Environment File Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['configuration', 'file'],
      priority: 200,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content || context.content.length < 3) return false;
    const fileName = context.artifact.normalizedPath.toLowerCase();
    // Match .env files
    if (fileName.includes('.env')) return true;
    // Match files with only ENV_VAR=value patterns
    const firstLine = context.content.toString('utf-8', 0, Math.min(context.content.length, 200));
    return /^\w+=\S+/m.test(firstLine);
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const text = buffer.toString('utf-8');
    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      const varRe = /^(\w+)=(.*)$/gm;
      const varNames: string[] = [];
      let m: RegExpExecArray | null;

      while ((m = varRe.exec(text)) !== null) {
        const name = m[1];
        const value = m[2].replace(/["']/g, '');

        // Only store variable name and whether it's set, not the actual value
        varNames.push(name);

        // Detect if value looks sensitive (password, token, secret, key)
        const isSensitive = /(?:password|secret|token|key|auth|credential)/i.test(name);
        if (isSensitive) {
          features.push(
            createRawFeature({
              extractorId: this.id,
              type: 'env-sensitive-variable',
              value: name,
              confidence: 0.9,
              metadata: { length: value.length },
            }),
          );
        }
      }

      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'env-variable-count',
          value: varNames.length,
          confidence: 1.0,
        }),
      );

      // Detect comments/documentation
      const commentCount = (text.match(/^#/gm) || []).length;
      if (commentCount > 0) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'env-comment-count',
            value: commentCount,
            confidence: 1.0,
          }),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'ENV_ERROR',
          `Failed to process .env file: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(features, { bytesProcessed: buffer.length, startTime, endTime, issues });
  }
}

// ─── Requirements Files Extractor ───────────────────────────────

/**
 * Extracts dependencies from requirements files (requirements.txt, etc.).
 */
export class RequirementsExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'requirements-extractor',
      name: 'Requirements File Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['configuration', 'file'],
      priority: 200,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content || context.content.length < 4) return false;
    const fileName = context.artifact.normalizedPath.toLowerCase();
    if (fileName.includes('requirements') || fileName === 'requirements.txt') return true;
    // Check for common pip patterns
    const text = context.content.toString('utf-8', 0, Math.min(context.content.length, 500));
    return /^[\w.-]+(?:[<>=!~]+\s*[\d.*]+)?\s*(?:$|#)/m.test(text);
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const text = buffer.toString('utf-8');
    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      const depRe = /^([\w][\w.\-]*)(?:([<>=!~]+)\s*([\d.*]+(?:,[\s]*[\d.*]+)*))?/gm;
      const deps: string[] = [];
      let m: RegExpExecArray | null;

      while ((m = depRe.exec(text)) !== null) {
        if (m[1] && !m[1].startsWith('#') && !m[1].startsWith('-')) {
          deps.push(m[1].trim());
        }
      }

      const uniqueDeps = [...new Set(deps)];
      for (const dep of uniqueDeps) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'python-dependency',
            value: dep,
            confidence: 0.95,
          }),
        );
      }

      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'dependency-count',
          value: uniqueDeps.length,
          confidence: 1.0,
        }),
      );
    } catch (error) {
      issues.push(
        this.error(
          'REQUIREMENTS_ERROR',
          `Failed to process requirements file: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(features, { bytesProcessed: buffer.length, startTime, endTime, issues });
  }
}

// ─── Package Manifest Extractor ─────────────────────────────────

/**
 * Extracts metadata from package manager manifests.
 * Supports package.json, Cargo.toml, go.mod, Pyproject.toml, Gemfile, build.gradle.
 */
export class PackageManifestExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'package-manifest-extractor',
      name: 'Package Manifest Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['configuration', 'file'],
      priority: 200,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content || context.content.length < 10) return false;
    const fileName = context.artifact.normalizedPath.toLowerCase();
    return (
      fileName === 'package.json' ||
      fileName.endsWith('/package.json') ||
      fileName === 'cargo.toml' ||
      fileName.endsWith('/cargo.toml') ||
      fileName === 'go.mod' ||
      fileName.endsWith('/go.mod') ||
      fileName === 'pyproject.toml' ||
      fileName.endsWith('/pyproject.toml') ||
      fileName === 'gemfile' ||
      fileName.endsWith('/gemfile') ||
      fileName === 'build.gradle' ||
      fileName.endsWith('/build.gradle') ||
      fileName === 'pom.xml' ||
      fileName.endsWith('/pom.xml') ||
      fileName === 'build.gradle.kts' ||
      fileName === 'project.clj' ||
      fileName === 'mix.exs'
    );
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const text = buffer.toString('utf-8');
    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      const fileName = context.artifact.normalizedPath.toLowerCase();

      if (fileName.endsWith('package.json')) {
        features.push(...this._extractPackageJson(text));
      } else if (fileName.endsWith('cargo.toml')) {
        features.push(...this._extractCargoToml(text));
      } else if (fileName.endsWith('go.mod')) {
        features.push(...this._extractGoMod(text));
      } else if (fileName.endsWith('pyproject.toml')) {
        features.push(...this._extractPyprojectToml(text));
      } else if (fileName.endsWith('gemfile')) {
        features.push(...this._extractGemfile(text));
      } else if (fileName.endsWith('build.gradle') || fileName.endsWith('build.gradle.kts')) {
        features.push(...this._extractGradle(text));
      } else if (fileName.endsWith('pom.xml')) {
        features.push(...this._extractPomXml(text));
      }
    } catch (error) {
      issues.push(
        this.error(
          'MANIFEST_ERROR',
          `Failed to process manifest: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(features, { bytesProcessed: buffer.length, startTime, endTime, issues });
  }

  private _extractPackageJson(text: string): ReturnType<typeof createRawFeature>[] {
    const features: ReturnType<typeof createRawFeature>[] = [];
    try {
      const pkg = JSON.parse(text);
      if (pkg.name) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'package-name',
            value: pkg.name,
            confidence: 1.0,
          }),
        );
      }
      if (pkg.version) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'package-version',
            value: pkg.version,
            confidence: 1.0,
          }),
        );
      }
      if (pkg.dependencies) {
        const deps = Object.keys(pkg.dependencies);
        for (const dep of deps) {
          features.push(
            createRawFeature({
              extractorId: this.id,
              type: 'npm-dependency',
              value: dep,
              confidence: 1.0,
            }),
          );
        }
      }
      if (pkg.devDependencies) {
        const deps = Object.keys(pkg.devDependencies);
        for (const dep of deps) {
          features.push(
            createRawFeature({
              extractorId: this.id,
              type: 'npm-dev-dependency',
              value: dep,
              confidence: 1.0,
            }),
          );
        }
      }
    } catch {
      // Not valid JSON, skip
    }
    return features;
  }

  private _extractCargoToml(text: string): ReturnType<typeof createRawFeature>[] {
    const features: ReturnType<typeof createRawFeature>[] = [];
    const nameMatch = text.match(/^name\s*=\s*["']([^"']+)["']/m);
    if (nameMatch) {
      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'package-name',
          value: nameMatch[1],
          confidence: 1.0,
        }),
      );
    }
    const versionMatch = text.match(/^version\s*=\s*["']([^"']+)["']/m);
    if (versionMatch) {
      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'package-version',
          value: versionMatch[1],
          confidence: 1.0,
        }),
      );
    }
    // Extract dependencies
    const depRe = /^\[dependencies\]([\s\S]*?)(?:^\[|$)/m;
    const depMatch = text.match(depRe);
    if (depMatch) {
      const deps = depMatch[1].match(/^(\w[\w-]*)\s*=/gm);
      if (deps) {
        for (const dep of deps) {
          features.push(
            createRawFeature({
              extractorId: this.id,
              type: 'cargo-dependency',
              value: dep.replace('=', '').trim(),
              confidence: 0.9,
            }),
          );
        }
      }
    }
    return features;
  }

  private _extractGoMod(text: string): ReturnType<typeof createRawFeature>[] {
    const features: ReturnType<typeof createRawFeature>[] = [];
    const modMatch = text.match(/^module\s+(\S+)/m);
    if (modMatch) {
      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'package-name',
          value: modMatch[1],
          confidence: 1.0,
        }),
      );
    }
    const goMatch = text.match(/^go\s+([\d.]+)/m);
    if (goMatch) {
      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'go-version',
          value: goMatch[1],
          confidence: 1.0,
        }),
      );
    }
    const depRe = /^\t([\w./-]+)\s+v?[\d.]+/gm;
    const deps = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = depRe.exec(text)) !== null) deps.add(m[1]);
    for (const dep of deps) {
      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'go-dependency',
          value: dep,
          confidence: 0.95,
        }),
      );
    }
    return features;
  }

  private _extractPyprojectToml(text: string): ReturnType<typeof createRawFeature>[] {
    const features: ReturnType<typeof createRawFeature>[] = [];
    const nameMatch = text.match(/^name\s*=\s*["']([^"']+)["']/m);
    if (nameMatch) {
      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'package-name',
          value: nameMatch[1],
          confidence: 1.0,
        }),
      );
    }
    const depRe = /^\[\w*project\.dependencies\][\s\S]*?(?=^\[)/m;
    const depMatch = text.match(depRe);
    if (depMatch) {
      const deps = depMatch[1].match(/["']([\w.-]+)[<>=!~]/g);
      if (deps) {
        for (const dep of deps) {
          const clean = dep.replace(/["'<>=!~]/g, '').trim();
          if (clean) {
            features.push(
              createRawFeature({
                extractorId: this.id,
                type: 'python-dependency',
                value: clean,
                confidence: 0.85,
              }),
            );
          }
        }
      }
    }
    return features;
  }

  private _extractGemfile(text: string): ReturnType<typeof createRawFeature>[] {
    const features: ReturnType<typeof createRawFeature>[] = [];
    const gemRe = /^gem\s+["']([^"']+)["']/gm;
    const gems = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = gemRe.exec(text)) !== null) gems.add(m[1]);
    for (const gem of gems) {
      features.push(
        createRawFeature({ extractorId: this.id, type: 'ruby-gem', value: gem, confidence: 0.95 }),
      );
    }
    const sourceMatch = text.match(/^source\s+["']([^"']+)["']/m);
    if (sourceMatch) {
      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'ruby-gem-source',
          value: sourceMatch[1],
          confidence: 1.0,
        }),
      );
    }
    return features;
  }

  private _extractGradle(text: string): ReturnType<typeof createRawFeature>[] {
    const features: ReturnType<typeof createRawFeature>[] = [];
    const depRe =
      /(?:implementation|api|compileOnly|runtimeOnly|testImplementation)\s+["']([^"']+)["']/g;
    const deps = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = depRe.exec(text)) !== null) deps.add(m[1]);
    for (const dep of deps) {
      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'gradle-dependency',
          value: dep,
          confidence: 0.95,
        }),
      );
    }
    return features;
  }

  private _extractPomXml(text: string): ReturnType<typeof createRawFeature>[] {
    const features: ReturnType<typeof createRawFeature>[] = [];
    const groupMatch = text.match(/<groupId>([^<]+)<\/groupId>/);
    const artifactMatch = text.match(/<artifactId>([^<]+)<\/artifactId>/);
    const versionMatch = text.match(/<version>([^<]+)<\/version>/);
    if (groupMatch && artifactMatch) {
      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'package-name',
          value: `${groupMatch[1]}:${artifactMatch[1]}`,
          confidence: 1.0,
        }),
      );
    }
    if (versionMatch) {
      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'package-version',
          value: versionMatch[1],
          confidence: 1.0,
        }),
      );
    }
    // Extract dependencies
    const depRe =
      /<dependency>[\s\S]*?<groupId>([^<]+)<\/groupId>[\s\S]*?<artifactId>([^<]+)<\/artifactId>[\s\S]*?<\/dependency>/g;
    let m: RegExpExecArray | null;
    while ((m = depRe.exec(text)) !== null) {
      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'maven-dependency',
          value: `${m[1]}:${m[2]}`,
          confidence: 0.95,
        }),
      );
    }
    return features;
  }
}

// ─── Lockfile Extractor ─────────────────────────────────────────

/**
 * Extracts metadata from package lockfiles.
 * Supports package-lock.json, yarn.lock, pnpm-lock.yaml, Cargo.lock.
 * Only extracts top-level metadata (package count, lock version).
 */
export class LockfileExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'lockfile-extractor',
      name: 'Lockfile Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['configuration', 'file'],
      priority: 200,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content || context.content.length < 10) return false;
    const fileName = context.artifact.normalizedPath.toLowerCase();
    return (
      fileName.endsWith('package-lock.json') ||
      fileName.endsWith('yarn.lock') ||
      fileName.endsWith('pnpm-lock.yaml') ||
      fileName.endsWith('cargo.lock') ||
      fileName === 'package-lock.json' ||
      fileName === 'yarn.lock' ||
      fileName === 'pnpm-lock.yaml' ||
      fileName === 'cargo.lock'
    );
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const text = buffer.toString('utf-8');
    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      const fileName = context.artifact.normalizedPath.toLowerCase();

      if (fileName.endsWith('package-lock.json')) {
        try {
          const lock = JSON.parse(text);
          features.push(
            createRawFeature({
              extractorId: this.id,
              type: 'lockfile-type',
              value: 'npm',
              confidence: 1.0,
            }),
          );
          if (lock.lockfileVersion !== undefined) {
            features.push(
              createRawFeature({
                extractorId: this.id,
                type: 'lockfile-version',
                value: lock.lockfileVersion,
                confidence: 1.0,
              }),
            );
          }
          if (lock.packages) {
            features.push(
              createRawFeature({
                extractorId: this.id,
                type: 'lockfile-package-count',
                value: Object.keys(lock.packages).length,
                confidence: 1.0,
              }),
            );
          }
        } catch {
          // Not valid JSON
        }
      } else if (fileName.endsWith('yarn.lock')) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'lockfile-type',
            value: 'yarn',
            confidence: 1.0,
          }),
        );
        const pkgCount = (text.match(/^#\s/gm) || []).length;
        // Count entries by looking for "# yarn" header or "^\["
        const entryCount = (text.match(/^\S/gm) || []).filter(
          (l) => !l.startsWith('#') && !l.startsWith('yarn') && !l.startsWith('__metadata'),
        ).length;
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'lockfile-package-count',
            value: entryCount || 0,
            confidence: 0.8,
          }),
        );
      } else if (fileName.endsWith('pnpm-lock.yaml')) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'lockfile-type',
            value: 'pnpm',
            confidence: 1.0,
          }),
        );
        const pkgCount = (text.match(/^\s{2}\//gm) || []).length;
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'lockfile-package-count',
            value: pkgCount,
            confidence: 0.85,
          }),
        );
      } else if (fileName.endsWith('cargo.lock')) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'lockfile-type',
            value: 'cargo',
            confidence: 1.0,
          }),
        );
        const pkgCount = (text.match(/^\[\[package\]\]/gm) || []).length;
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'lockfile-package-count',
            value: pkgCount,
            confidence: 1.0,
          }),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'LOCKFILE_ERROR',
          `Failed to process lockfile: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(features, { bytesProcessed: buffer.length, startTime, endTime, issues });
  }
}
