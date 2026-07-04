/**
 * Language-specific extractors for source code files.
 *
 * Each extractor detects its respective language and extracts
 * deterministic features such as imports, exports, and basic constructs.
 *
 * @module @veris/extractors/extractors/language-extractors
 */

import { BaseExtractor } from '../base-extractor.js';
import type { ExtractionContext, ExtractionResult } from '../types.js';
import { createRawFeature } from '../types.js';

// ─── JavaScript Extractor ───────────────────────────────────────

/**
 * Extracts deterministic features from JavaScript files.
 * Detects imports, exports, top-level declarations, and "use strict" mode.
 */
export class JavaScriptExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'javascript-extractor',
      name: 'JavaScript Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['script', 'file'],
      priority: 200,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content || context.content.length < 4) return false;
    // Check extension
    const ext = context.artifact.mimeType;
    if (ext?.includes('javascript')) return true;
    // Check for shebang with node
    const firstLine = context.content.toString('utf-8', 0, Math.min(context.content.length, 100));
    if (firstLine.startsWith('#!/usr/bin/env node') || firstLine.startsWith('#!/usr/bin/node'))
      return true;
    return false;
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const text = buffer.toString('utf-8');

    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      // Detect strict mode
      if (text.includes('"use strict"') || text.includes("'use strict'")) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'use-strict',
            value: true,
            confidence: 1.0,
          }),
        );
      }

      // Extract imports
      const importRe =
        /(?:import\s+(?:[\w*{},\s]+\s+from\s+)?["']([^"']+)["']|require\(["']([^"']+)["']\))/g;
      const imports = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(text)) !== null) {
        imports.add(m[1] ?? m[2]);
      }
      for (const imp of imports) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'js-import',
            value: imp,
            confidence: 0.95,
          }),
        );
      }

      // Extract exports
      const exportRe =
        /(?:export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)|module\.exports\s*=\s*(\w+))/g;
      const exports = new Set<string>();
      while ((m = exportRe.exec(text)) !== null) {
        exports.add(m[1] ?? m[2]);
      }
      for (const exp of exports) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'js-export',
            value: exp,
            confidence: 0.95,
          }),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'JS_PARSE_ERROR',
          `Failed to parse JavaScript: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(features, { bytesProcessed: buffer.length, startTime, endTime, issues });
  }
}

// ─── TypeScript Extractor ───────────────────────────────────────

/**
 * Extracts deterministic features from TypeScript files.
 * Detects imports, exports, interfaces, types, and enums.
 */
export class TypeScriptExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'typescript-extractor',
      name: 'TypeScript Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['script', 'file'],
      priority: 200,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content || context.content.length < 4) return false;
    const mime = context.artifact.mimeType;
    if (mime?.includes('typescript')) return true;
    return false;
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const text = buffer.toString('utf-8');
    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      // Extract imports (including type imports)
      const importRe =
        /import\s+(?:\{\s*[^}]+\}\s+)?(?:type\s+)?(?:\{[^}]+\}\s+)?from\s+["']([^"']+)["']/g;
      const imports = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(text)) !== null) imports.add(m[1]);
      for (const imp of imports) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'ts-import',
            value: imp,
            confidence: 0.95,
          }),
        );
      }

      // Extract type/interface names
      const typeRe = /(?:interface|type)\s+(\w+)/g;
      const types = new Set<string>();
      while ((m = typeRe.exec(text)) !== null) types.add(m[1]);
      for (const t of types) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'ts-type-declaration',
            value: t,
            confidence: 0.95,
          }),
        );
      }

      // Extract enum names
      const enumRe = /enum\s+(\w+)/g;
      while ((m = enumRe.exec(text)) !== null) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'ts-enum',
            value: m[1],
            confidence: 0.95,
          }),
        );
      }

      // Extract exports
      const exportRe =
        /export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g;
      while ((m = exportRe.exec(text)) !== null) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'ts-export',
            value: m[1],
            confidence: 0.95,
          }),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'TS_PARSE_ERROR',
          `Failed to parse TypeScript: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(features, { bytesProcessed: buffer.length, startTime, endTime, issues });
  }
}

// ─── Python Extractor ───────────────────────────────────────────

/**
 * Extracts deterministic features from Python files.
 */
export class PythonExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'python-extractor',
      name: 'Python Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['script', 'file'],
      priority: 200,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content || context.content.length < 4) return false;
    const mime = context.artifact.mimeType;
    if (mime?.includes('python')) return true;
    const firstLine = context.content.toString('utf-8', 0, Math.min(context.content.length, 100));
    if (firstLine.startsWith('#!/usr/bin/env python') || firstLine.startsWith('#!/usr/bin/python'))
      return true;
    return false;
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const text = buffer.toString('utf-8');
    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      // Extract imports
      const importRe = /^(?:import\s+(\S+)|from\s+(\S+)\s+import)/gm;
      const imports = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(text)) !== null) imports.add(m[1] ?? m[2]);
      for (const imp of imports) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'py-import',
            value: imp,
            confidence: 0.95,
          }),
        );
      }

      // Extract function and class definitions
      const defRe = /^(?:def\s+|class\s+|async\s+def\s+)(\w+)/gm;
      while ((m = defRe.exec(text)) !== null) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'py-definition',
            value: m[1],
            confidence: 0.95,
          }),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'PY_PARSE_ERROR',
          `Failed to parse Python: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(features, { bytesProcessed: buffer.length, startTime, endTime, issues });
  }
}

// ─── Go Extractor ───────────────────────────────────────────────

/**
 * Extracts deterministic features from Go source files.
 */
export class GoExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'go-extractor',
      name: 'Go Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['script', 'file'],
      priority: 200,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content || context.content.length < 4) return false;
    const mime = context.artifact.mimeType;
    if (mime?.includes('go')) return true;
    return false;
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const text = buffer.toString('utf-8');
    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      // Extract package name
      const pkgMatch = text.match(/^package\s+(\w+)/m);
      if (pkgMatch) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'go-package',
            value: pkgMatch[1],
            confidence: 1.0,
          }),
        );
      }

      // Extract imports
      const importRe = /"(?:[\w\/.@-]+)"/g;
      const imports = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(text)) !== null) imports.add(m[1]);
      for (const imp of imports) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'go-import',
            value: imp,
            confidence: 0.85,
          }),
        );
      }

      // Extract function declarations
      const funcRe = /^func\s+(?:\([^)]+\)\s+)?(\w+)/gm;
      while ((m = funcRe.exec(text)) !== null) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'go-function',
            value: m[1],
            confidence: 0.95,
          }),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'GO_PARSE_ERROR',
          `Failed to parse Go: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(features, { bytesProcessed: buffer.length, startTime, endTime, issues });
  }
}

// ─── Rust Extractor ─────────────────────────────────────────────

/**
 * Extracts deterministic features from Rust source files.
 */
export class RustExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'rust-extractor',
      name: 'Rust Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['script', 'file'],
      priority: 200,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content || context.content.length < 4) return false;
    const mime = context.artifact.mimeType;
    if (mime?.includes('rust')) return true;
    return false;
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const text = buffer.toString('utf-8');
    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      // Extract extern crate / use statements
      const useRe = /^(?:use\s+(.+);|extern\s+crate\s+(\w+))/gm;
      const imports = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = useRe.exec(text)) !== null) imports.add(m[1] ?? m[2]);
      for (const imp of imports) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'rs-import',
            value: imp,
            confidence: 0.95,
          }),
        );
      }

      // Extract function declarations
      const funcRe =
        /^(?:(?:pub\s+)?(?:unsafe\s+)?(?:async\s+)?fn\s+(\w+)|pub\s+(?:struct|enum|trait|type|impl|mod)\s+(\w+))/gm;
      while ((m = funcRe.exec(text)) !== null) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'rs-declaration',
            value: m[1] ?? m[2],
            confidence: 0.95,
          }),
        );
      }

      // Check for unsafe code
      if (/\bunsafe\b/.test(text)) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'rs-unsafe-usage',
            value: true,
            confidence: 1.0,
          }),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'RS_PARSE_ERROR',
          `Failed to parse Rust: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(features, { bytesProcessed: buffer.length, startTime, endTime, issues });
  }
}

// ─── Java Extractor ─────────────────────────────────────────────

/**
 * Extracts deterministic features from Java source files.
 */
export class JavaExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'java-extractor',
      name: 'Java Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['script', 'file'],
      priority: 200,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content || context.content.length < 4) return false;
    const mime = context.artifact.mimeType;
    if (mime?.includes('java')) return true;
    return false;
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const text = buffer.toString('utf-8');
    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      // Extract package
      const pkgMatch = text.match(/^package\s+([\w.]+);/m);
      if (pkgMatch) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'java-package',
            value: pkgMatch[1],
            confidence: 1.0,
          }),
        );
      }

      // Extract imports
      const importRe = /^import\s+(?:static\s+)?([\w.*]+);/gm;
      const imports = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = importRe.exec(text)) !== null) imports.add(m[1]);
      for (const imp of imports) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'java-import',
            value: imp,
            confidence: 0.95,
          }),
        );
      }

      // Extract class declarations
      const classRe =
        /(?:public|private|protected)?\s*(?:abstract|final)?\s*(?:class|interface|enum|@interface|record)\s+(\w+)/g;
      while ((m = classRe.exec(text)) !== null) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'java-class',
            value: m[1],
            confidence: 0.95,
          }),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'JAVA_PARSE_ERROR',
          `Failed to parse Java: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(features, { bytesProcessed: buffer.length, startTime, endTime, issues });
  }
}

// ─── C# Extractor ───────────────────────────────────────────────

/**
 * Extracts deterministic features from C# source files.
 */
export class CSharpExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'csharp-extractor',
      name: 'C# Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['script', 'file'],
      priority: 200,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content || context.content.length < 4) return false;
    const mime = context.artifact.mimeType;
    if (mime?.includes('csharp')) return true;
    return false;
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const text = buffer.toString('utf-8');
    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      // Extract using statements
      const usingRe = /^using\s+([\w.]+);/gm;
      const usings = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = usingRe.exec(text)) !== null) usings.add(m[1]);
      for (const u of usings) {
        features.push(
          createRawFeature({ extractorId: this.id, type: 'cs-using', value: u, confidence: 0.95 }),
        );
      }

      // Extract namespace
      const nsMatch = text.match(/^namespace\s+([\w.]+)/m);
      if (nsMatch) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'cs-namespace',
            value: nsMatch[1],
            confidence: 1.0,
          }),
        );
      }

      // Extract class/struct/interface declarations
      const classRe =
        /(?:public|private|protected|internal)?\s*(?:abstract|sealed|static)?\s*(?:class|struct|interface|record|enum)\s+(\w+)/g;
      while ((m = classRe.exec(text)) !== null) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'cs-type',
            value: m[1],
            confidence: 0.95,
          }),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'CS_PARSE_ERROR',
          `Failed to parse C#: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(features, { bytesProcessed: buffer.length, startTime, endTime, issues });
  }
}

// ─── Shell Extractor ────────────────────────────────────────────

/**
 * Extracts deterministic features from shell script files.
 */
export class ShellExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'shell-extractor',
      name: 'Shell Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['script', 'file'],
      priority: 200,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content || context.content.length < 4) return false;
    const firstLine = context.content.toString('utf-8', 0, Math.min(context.content.length, 100));
    if (
      firstLine.startsWith('#!/bin/sh') ||
      firstLine.startsWith('#!/bin/bash') ||
      firstLine.startsWith('#!/usr/bin/env bash') ||
      firstLine.startsWith('#!/bin/zsh') ||
      firstLine.startsWith('#!/bin/dash') ||
      firstLine.startsWith('#!/bin/ksh')
    )
      return true;
    return false;
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const text = buffer.toString('utf-8');
    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      // Detect shell type from shebang
      const shebangMatch = text.match(/^#!\s*\/(?:usr\/)?(?:bin\/)?(\w+)/m);
      if (shebangMatch) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'shell-shebang',
            value: shebangMatch[1],
            confidence: 1.0,
          }),
        );
      }

      // Extract sourced files
      const sourceRe = /^(?:source|\.)\s+["']?([^"'\s]+)["']?/gm;
      const sources = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = sourceRe.exec(text)) !== null) sources.add(m[1]);
      for (const src of sources) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'shell-source',
            value: src,
            confidence: 0.9,
          }),
        );
      }

      // Extract function definitions
      const funcRe = /^(?:\w+)\s*\(\s*\)\s*\{/gm;
      let funcCount = 0;
      while (funcRe.exec(text) !== null) funcCount++;
      if (funcCount > 0) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'shell-function-count',
            value: funcCount,
            confidence: 1.0,
          }),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'SH_PARSE_ERROR',
          `Failed to parse shell script: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(features, { bytesProcessed: buffer.length, startTime, endTime, issues });
  }
}
