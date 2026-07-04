/**
 * Configuration file extractors for JSON, YAML, XML, Docker, and Kubernetes.
 *
 * Each extractor detects its respective format and extracts deterministic
 * metadata without performing analysis or validation.
 *
 * @module @veris/extractors/extractors/config-extractors
 */

import { BaseExtractor } from '../base-extractor.js';
import type { ExtractionContext, ExtractionResult } from '../types.js';
import { createRawFeature } from '../types.js';

// ─── JSON Extractor ─────────────────────────────────────────────

/**
 * Extracts deterministic metadata from JSON files.
 * Detects structure: top-level keys, nesting depth, array sizes, etc.
 */
export class JSONExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'json-extractor',
      name: 'JSON Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['configuration', 'file'],
      priority: 200,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content || context.content.length < 2) return false;
    const trimmed = context.content
      .toString('utf-8', 0, Math.min(context.content.length, 1000))
      .trim();
    return (
      (trimmed.startsWith('{') && trimmed.includes('}')) ||
      (trimmed.startsWith('[') && trimmed.includes(']'))
    );
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      const text = buffer.toString('utf-8');

      // Try to parse
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return this.ok([], {
          bytesProcessed: buffer.length,
          startTime,
          endTime: Date.now(),
          issues: [this.warning('JSON_PARSE_ERROR', 'File is not valid JSON — treating as text')],
        });
      }

      // Top-level type
      const topType = Array.isArray(parsed) ? 'array' : typeof parsed;
      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'json-top-level-type',
          value: topType,
          confidence: 1.0,
        }),
      );

      // Extract top-level keys for objects
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        const keys = Object.keys(parsed as Record<string, unknown>);
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'json-top-level-keys',
            value: keys,
            confidence: 1.0,
            metadata: { count: keys.length },
          }),
        );
      }

      // Array length
      if (Array.isArray(parsed)) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'json-array-length',
            value: parsed.length,
            confidence: 1.0,
          }),
        );
      }

      // File size estimation
      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'json-byte-size',
          value: buffer.length,
          confidence: 1.0,
        }),
      );
    } catch (error) {
      issues.push(
        this.error(
          'JSON_ERROR',
          `Failed to process JSON: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(features, { bytesProcessed: buffer.length, startTime, endTime, issues });
  }
}

// ─── YAML Extractor ─────────────────────────────────────────────

/**
 * Extracts deterministic metadata from YAML files.
 * Detects structure and top-level keys without full parsing.
 */
export class YAMLExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'yaml-extractor',
      name: 'YAML Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['configuration', 'file'],
      priority: 200,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content || context.content.length < 4) return false;
    const ext = context.artifact.mimeType ?? '';
    if (ext.includes('yaml') || ext.includes('yml')) return true;
    // Check for YAML-like content start
    const text = context.content.toString('utf-8', 0, Math.min(context.content.length, 200));
    return /^[\w-]+:/.test(text);
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const text = buffer.toString('utf-8');
    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      // Extract top-level keys (lines starting with word characters at column 0)
      const keyRe = /^([\w][\w.-]*):/gm;
      const keys = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = keyRe.exec(text)) !== null) keys.add(m[1]);
      const topKeys = Array.from(keys);

      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'yaml-top-level-keys',
          value: topKeys,
          confidence: 0.9,
          metadata: { count: topKeys.length },
        }),
      );

      // Detect if it contains multi-document YAML
      if (text.includes('---')) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'yaml-multi-document',
            value: true,
            confidence: 1.0,
          }),
        );
      }

      // Count lines
      const lineCount = text.split('\n').length;
      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'yaml-line-count',
          value: lineCount,
          confidence: 1.0,
        }),
      );
    } catch (error) {
      issues.push(
        this.error(
          'YAML_ERROR',
          `Failed to process YAML: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(features, { bytesProcessed: buffer.length, startTime, endTime, issues });
  }
}

// ─── XML Extractor ──────────────────────────────────────────────

/**
 * Extracts deterministic metadata from XML files.
 * Detects root element, namespace, declared encoding, and DOCTYPE.
 */
export class XMLExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'xml-extractor',
      name: 'XML Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['configuration', 'document', 'file'],
      priority: 200,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content || context.content.length < 10) return false;
    const text = context.content.toString('utf-8', 0, Math.min(context.content.length, 200)).trim();
    return text.startsWith('<?xml') || text.startsWith('<');
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const text = buffer.toString('utf-8');
    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      // Extract XML declaration version/encoding
      const declMatch = text.match(/^<\?xml\s+([^?]+)\?>/);
      if (declMatch) {
        const decl = declMatch[1];
        const verMatch = decl.match(/version=["']([^"']+)["']/);
        const encMatch = decl.match(/encoding=["']([^"']+)["']/);

        if (verMatch) {
          features.push(
            createRawFeature({
              extractorId: this.id,
              type: 'xml-version',
              value: verMatch[1],
              confidence: 1.0,
            }),
          );
        }
        if (encMatch) {
          features.push(
            createRawFeature({
              extractorId: this.id,
              type: 'xml-encoding',
              value: encMatch[1],
              confidence: 1.0,
            }),
          );
        }
      }

      // Extract DOCTYPE
      const doctypeMatch = text.match(/<!DOCTYPE\s+(\w+)/);
      if (doctypeMatch) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'xml-doctype',
            value: doctypeMatch[1],
            confidence: 1.0,
          }),
        );
      }

      // Extract root element
      const rootMatch = text.match(/<(\w[\w.-]*)(?:\s[^>]*)?>/);
      if (rootMatch) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'xml-root-element',
            value: rootMatch[1],
            confidence: 1.0,
          }),
        );
      }

      // Check for namespaces
      const nsMatch = text.match(/xmlns[:\w]*=["']([^"']+)["']/g);
      if (nsMatch) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'xml-namespaces',
            value: nsMatch.length,
            confidence: 1.0,
          }),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'XML_ERROR',
          `Failed to process XML: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(features, { bytesProcessed: buffer.length, startTime, endTime, issues });
  }
}

// ─── Docker Extractor ───────────────────────────────────────────

/**
 * Extracts deterministic features from Dockerfiles.
 */
export class DockerExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'docker-extractor',
      name: 'Docker Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['configuration', 'file'],
      priority: 200,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content || context.content.length < 4) return false;
    const fileName = context.artifact.normalizedPath.toLowerCase();
    if (fileName.endsWith('/dockerfile') || fileName === 'dockerfile') return true;
    const firstLine = context.content.toString('utf-8', 0, Math.min(context.content.length, 200));
    return /^FROM\s+/im.test(firstLine);
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const text = buffer.toString('utf-8');
    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      // Extract FROM images
      const fromRe = /^FROM\s+(\S+)/gm;
      const images = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = fromRe.exec(text)) !== null) images.add(m[1]);
      for (const img of images) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'docker-from-image',
            value: img,
            confidence: 1.0,
          }),
        );
      }

      // Extract RUN commands (simplified: just count them)
      const runCount = (text.match(/^RUN\s+/gm) || []).length;
      if (runCount > 0) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'docker-run-commands',
            value: runCount,
            confidence: 1.0,
          }),
        );
      }

      // Detect multi-stage build
      if (images.size > 1) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'docker-multi-stage',
            value: true,
            confidence: 1.0,
          }),
        );
      }

      // Extract EXPOSE ports
      const exposeRe = /^EXPOSE\s+(\d+)/gm;
      const ports: number[] = [];
      while ((m = exposeRe.exec(text)) !== null) ports.push(parseInt(m[1], 10));
      if (ports.length > 0) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'docker-exposed-ports',
            value: ports,
            confidence: 1.0,
          }),
        );
      }

      // Check for USER
      if (/^USER\s+/m.test(text)) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'docker-non-root-user',
            value: true,
            confidence: 1.0,
          }),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'DOCKER_ERROR',
          `Failed to process Dockerfile: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(features, { bytesProcessed: buffer.length, startTime, endTime, issues });
  }
}

// ─── Kubernetes Extractor ───────────────────────────────────────

/**
 * Extracts deterministic metadata from Kubernetes manifests.
 * Detects resource type, name, API version, and namespace.
 */
export class KubernetesExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'kubernetes-extractor',
      name: 'Kubernetes Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['configuration', 'file'],
      priority: 200,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content || context.content.length < 10) return false;
    const text = context.content.toString('utf-8', 0, Math.min(context.content.length, 1000));
    // Check for Kubernetes resource markers
    return /apiVersion:\s*[\w/.]+/.test(text) && /kind:\s*\w+/.test(text);
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const text = buffer.toString('utf-8');
    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      // Extract apiVersion
      const apiMatch = text.match(/^apiVersion:\s*([\w./]+)/m);
      if (apiMatch) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'k8s-api-version',
            value: apiMatch[1],
            confidence: 1.0,
          }),
        );
      }

      // Extract kind
      const kindMatch = text.match(/^kind:\s*(\w+)/m);
      if (kindMatch) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'k8s-resource-kind',
            value: kindMatch[1],
            confidence: 1.0,
          }),
        );
      }

      // Extract name
      const nameMatch = text.match(/(?:^\s{2}|^\s{4})name:\s*(\S+)/m);
      if (nameMatch) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'k8s-resource-name',
            value: nameMatch[1],
            confidence: 1.0,
          }),
        );
      }

      // Extract namespace
      const nsMatch = text.match(/^namespace:\s*(\S+)/m);
      if (nsMatch) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'k8s-namespace',
            value: nsMatch[1],
            confidence: 1.0,
          }),
        );
      }

      // Detect multi-resource document (--- separator)
      if (text.includes('---')) {
        const resources = text.split(/^---/m).filter((s) => s.trim().length > 0);
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'k8s-resource-count',
            value: resources.length,
            confidence: 1.0,
          }),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'K8S_ERROR',
          `Failed to process K8s manifest: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(features, { bytesProcessed: buffer.length, startTime, endTime, issues });
  }
}
