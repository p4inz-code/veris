/**
 * Individual signal detectors for VERIS artifact classification.
 *
 * Each signal detector provides a specific type of classification signal
 * that contributes to the overall weighted voting process.
 *
 * @module @veris/classification/signals
 */

import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

import type { DiscoveredArtifact } from '@veris/core';

import {
  MAGIC_BYTE_PATTERNS,
  SHEBANG_PATTERNS,
  BOM_PATTERNS,
  EXTENSION_CATEGORY_MAP,
  EXTENSION_MIME_MAP,
} from './magic-bytes.js';
import type { SignalResult, ClassificationCategory, ClassificationConfig } from './types.js';
import { DEFAULT_CLASSIFICATION_CONFIG } from './types.js';

/**
 * Read the first N bytes of a file for magic byte detection.
 */
async function readMagicBytes(filePath: string, bytesToRead: number): Promise<Buffer | null> {
  try {
    const fd = await fsp.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(bytesToRead);
      const { bytesRead } = await fd.read(buffer, 0, bytesToRead, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await fd.close();
    }
  } catch {
    return null;
  }
}

/**
 * Detect file type using magic bytes (first 16-64 bytes of file content).
 * Priority 1 — highest confidence signal.
 */
export async function detectMagicBytes(
  artifact: DiscoveredArtifact,
  config: Required<ClassificationConfig> = DEFAULT_CLASSIFICATION_CONFIG,
): Promise<SignalResult> {
  if (artifact.isDirectory || !config.enableMagicBytes) {
    return {
      detected: false,
      category: null,
      subType: null,
      confidence: 0,
      detail: 'Directory or magic bytes disabled',
    };
  }

  if (artifact.size === 0) {
    return {
      detected: false,
      category: null,
      subType: null,
      confidence: 0,
      detail: 'Empty file — no magic bytes',
    };
  }

  const buffer = await readMagicBytes(artifact.absolutePath, config.maxMagicBytesRead);
  if (!buffer || buffer.length === 0) {
    return {
      detected: false,
      category: null,
      subType: null,
      confidence: 0,
      detail: 'Could not read file',
    };
  }

  const hex = buffer.toString('hex').toLowerCase();

  // Try to match each pattern
  for (const pattern of MAGIC_BYTE_PATTERNS) {
    const offsetHex = hex.slice(pattern.offset * 2);
    if (offsetHex.startsWith(pattern.bytes)) {
      return {
        detected: true,
        category: pattern.category as ClassificationCategory,
        subType: pattern.subType,
        confidence: pattern.confidence,
        detail: `Magic bytes match: ${pattern.name}`,
        mimeType: pattern.mimeType,
      };
    }
  }

  return {
    detected: false,
    category: null,
    subType: null,
    confidence: 0,
    detail: 'No magic byte pattern matched',
  };
}

/**
 * Detect file type using file signature patterns (known byte patterns at specific offsets).
 * Priority 2 — high confidence for well-known signatures.
 */
export async function detectFileSignature(
  artifact: DiscoveredArtifact,
  config: Required<ClassificationConfig> = DEFAULT_CLASSIFICATION_CONFIG,
): Promise<SignalResult> {
  // File signatures are a subset of magic bytes for our implementation
  // Delegate to magic bytes with additional context
  return detectMagicBytes(artifact, config);
}

/**
 * Detect file type using MIME type mapping.
 * Priority 3 — standardized classification.
 */
export async function detectMimeByExtension(artifact: DiscoveredArtifact): Promise<SignalResult> {
  if (artifact.isDirectory) {
    return {
      detected: true,
      category: 'binary',
      subType: null,
      confidence: 0.9,
      detail: 'Directory — inode/directory',
      mimeType: 'inode/directory',
    };
  }

  const mimeType = EXTENSION_MIME_MAP[artifact.extension];
  if (mimeType) {
    const category = EXTENSION_CATEGORY_MAP[artifact.extension] ?? 'unknown';
    return {
      detected: true,
      category: category as ClassificationCategory,
      subType: null,
      confidence: 0.75,
      detail: `MIME type mapped from extension: ${mimeType}`,
      mimeType,
    };
  }

  // Default to octet-stream for unknown extensions
  return {
    detected: true,
    category: 'unknown',
    subType: null,
    confidence: 0.3,
    detail: 'No MIME mapping for extension — defaulting to application/octet-stream',
    mimeType: 'application/octet-stream',
  };
}

/**
 * Detect file type using the shebang (first line of script files).
 * Priority 4 — definitive for scripts.
 */
export async function detectShebang(artifact: DiscoveredArtifact): Promise<SignalResult> {
  if (artifact.isDirectory || artifact.size === 0) {
    return {
      detected: false,
      category: null,
      subType: null,
      confidence: 0,
      detail: 'Not a file or empty file',
    };
  }

  // Don't bother if the file is too large
  if (artifact.size > 1024 * 1024) {
    return {
      detected: false,
      category: null,
      subType: null,
      confidence: 0,
      detail: 'File too large for shebang detection',
    };
  }

  try {
    // Read first 256 bytes to get the shebang line
    const buffer = await readMagicBytes(artifact.absolutePath, 256);
    if (!buffer) {
      return {
        detected: false,
        category: null,
        subType: null,
        confidence: 0,
        detail: 'Could not read file',
      };
    }

    const content = buffer.toString('utf-8');

    // Check for shebang (#!)
    if (!content.startsWith('#!')) {
      return {
        detected: false,
        category: null,
        subType: null,
        confidence: 0,
        detail: 'No shebang found',
      };
    }

    // Extract the interpreter path from the shebang
    const shebangLine = content.split('\n')[0].trim();
    const shebang = shebangLine.slice(2).trim(); // Remove "#!"

    // Find which interpreter this matches
    for (const pattern of SHEBANG_PATTERNS) {
      if (shebang.includes(pattern.pattern)) {
        return {
          detected: true,
          category: pattern.category as ClassificationCategory,
          subType: pattern.subType,
          confidence: 0.95,
          detail: `Shebang detected: ${shebangLine} → ${pattern.subType}`,
          mimeType: pattern.mimeType,
        };
      }
    }

    // Unknown interpreter — still classify as script
    return {
      detected: true,
      category: 'script',
      subType: 'Unknown-Interpreter',
      confidence: 0.6,
      detail: `Shebang detected but interpreter not recognized: ${shebangLine}`,
    };
  } catch {
    return {
      detected: false,
      category: null,
      subType: null,
      confidence: 0,
      detail: 'Error reading shebang',
    };
  }
}

/**
 * Detect file type using extension heuristic.
 * Priority 5 — never trusted alone (extension can be renamed).
 */
export async function detectExtension(artifact: DiscoveredArtifact): Promise<SignalResult> {
  if (artifact.isDirectory) {
    return {
      detected: false,
      category: null,
      subType: null,
      confidence: 0,
      detail: 'Directory has no extension',
    };
  }

  const category = EXTENSION_CATEGORY_MAP[artifact.extension];
  if (category) {
    return {
      detected: true,
      category: category as ClassificationCategory,
      subType: null,
      confidence: 0.5,
      detail: `Extension heuristic: ${artifact.extension} → ${category}`,
    };
  }

  if (artifact.extension) {
    return {
      detected: true,
      category: 'binary',
      subType: null,
      confidence: 0.2,
      detail: `Unknown extension: ${artifact.extension} — treating as binary`,
    };
  }

  return {
    detected: true,
    category: 'unknown',
    subType: null,
    confidence: 0.1,
    detail: 'No extension — unknown type',
  };
}

/**
 * Detect file encoding using Byte Order Mark (BOM).
 * Priority 5 — encoding detection only.
 */
export async function detectBOM(artifact: DiscoveredArtifact): Promise<SignalResult> {
  if (artifact.isDirectory || artifact.size < 2) {
    return {
      detected: false,
      category: null,
      subType: null,
      confidence: 0,
      detail: 'File too small for BOM detection',
    };
  }

  const buffer = await readMagicBytes(artifact.absolutePath, 6);
  if (!buffer || buffer.length < 2) {
    return {
      detected: false,
      category: null,
      subType: null,
      confidence: 0,
      detail: 'Could not read file',
    };
  }

  const hex = buffer.toString('hex').toLowerCase();

  // Check each BOM pattern
  for (const pattern of BOM_PATTERNS) {
    if (hex.startsWith(pattern.bytes)) {
      return {
        detected: true,
        category: 'unknown', // BOM doesn't determine file type
        subType: null,
        confidence: 0.4,
        detail: `${pattern.name} detected — encoding: ${pattern.encoding}`,
        encoding: pattern.encoding,
      };
    }
  }

  return {
    detected: false,
    category: null,
    subType: null,
    confidence: 0,
    detail: 'No BOM detected',
  };
}

/**
 * Lightweight content sampling for files.
 * Priority 6 — low confidence fallback.
 * Analyzes the first few KB to determine if content is text or binary.
 */
export async function detectContentSampling(
  artifact: DiscoveredArtifact,
  config: Required<ClassificationConfig> = DEFAULT_CLASSIFICATION_CONFIG,
): Promise<SignalResult> {
  if (artifact.isDirectory) {
    return {
      detected: false,
      category: null,
      subType: null,
      confidence: 0,
      detail: 'Directory — no content to sample',
    };
  }

  if (artifact.size === 0) {
    return {
      detected: false,
      category: null,
      subType: null,
      confidence: 0,
      detail: 'Empty file',
    };
  }

  const buffer = await readMagicBytes(artifact.absolutePath, config.maxContentSampleBytes);
  if (!buffer || buffer.length === 0) {
    return {
      detected: false,
      category: null,
      subType: null,
      confidence: 0,
      detail: 'Could not read file',
    };
  }

  // Analyze the buffer to determine if it's text or binary
  let textChars = 0;
  let controlChars = 0;
  let nullBytes = 0;
  let highBitBytes = 0;
  const total = buffer.length;

  for (let i = 0; i < total; i++) {
    const byte = buffer[i];
    if (byte === 0) {
      nullBytes++;
    } else if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
      // Control characters (except tab, newline, carriage return)
      controlChars++;
    } else if (byte >= 32 && byte <= 126) {
      // Printable ASCII
      textChars++;
    } else if (byte >= 128) {
      // High-bit bytes (UTF-8 or binary)
      highBitBytes++;
    }
  }

  const nullRatio = nullBytes / total;
  const controlRatio = controlChars / total;
  const textRatio = textChars / total;

  // Heuristic: if many null bytes or control characters, it's likely binary
  if (nullRatio > 0.05) {
    return {
      detected: true,
      category: 'binary',
      subType: null,
      confidence: 0.7,
      detail: `Content sampling: ${(nullRatio * 100).toFixed(1)}% null bytes — binary file`,
    };
  }

  if (controlRatio > 0.15) {
    return {
      detected: true,
      category: 'binary',
      subType: null,
      confidence: 0.6,
      detail: `Content sampling: ${(controlRatio * 100).toFixed(1)}% control chars — likely binary`,
    };
  }

  // Check if it looks like a known text format
  const text = buffer.toString('utf-8').substring(0, 500);

  if (text.startsWith('<?xml') || text.startsWith('<!DOCTYPE')) {
    return {
      detected: true,
      category: 'configuration',
      subType: 'XML',
      confidence: 0.55,
      detail: 'Content sampling: XML document detected',
    };
  }

  if (text.startsWith('{') || text.startsWith('[')) {
    // Could be JSON
    return {
      detected: true,
      category: 'configuration',
      subType: 'JSON',
      confidence: 0.4,
      detail: 'Content sampling: appears to be JSON-like structured data',
    };
  }

  // It's likely text
  if (textRatio > 0.5) {
    // Check for common script patterns
    if (
      text.includes('import ') ||
      text.includes('from ') ||
      text.includes('def ') ||
      text.includes('class ')
    ) {
      return {
        detected: true,
        category: 'script',
        subType: null,
        confidence: 0.45,
        detail: 'Content sampling: contains code-like patterns (import/def/class)',
      };
    }

    if (
      text.includes('function ') ||
      text.includes('const ') ||
      text.includes('let ') ||
      text.includes('var ')
    ) {
      return {
        detected: true,
        category: 'script',
        subType: null,
        confidence: 0.4,
        detail: 'Content sampling: contains JavaScript-like patterns (function/const/let)',
      };
    }

    return {
      detected: true,
      category: 'document',
      subType: null,
      confidence: 0.3,
      detail: 'Content sampling: appears to be text content',
    };
  }

  // Fallback: high-bit bytes with no clear structure
  if (highBitBytes > total * 0.1) {
    return {
      detected: true,
      category: 'binary',
      subType: null,
      confidence: 0.35,
      detail: `Content sampling: ${((highBitBytes / total) * 100).toFixed(1)}% high-bit bytes — likely binary`,
    };
  }

  return {
    detected: false,
    category: null,
    subType: null,
    confidence: 0,
    detail: 'Content sampling: inconclusive',
  };
}
