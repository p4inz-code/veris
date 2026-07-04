/**
 * StringExtractor — extracts printable strings from binary content.
 *
 * Supports:
 * - ASCII (7-bit printable characters)
 * - UTF-8 (multi-byte sequences with printable characters)
 * - UTF-16LE (little-endian 16-bit character sequences)
 * - UTF-16BE (big-endian 16-bit character sequences)
 * - Configurable minimum string length
 *
 * Returns offset, encoding, length, and value for each string found.
 *
 * @module @veris/extractors/extractors/string-extractor
 */

import * as fsp from 'node:fs/promises';

import { BaseExtractor } from '../base-extractor.js';
import type { ExtractionContext, ExtractionResult } from '../types.js';
import { createRawFeature } from '../types.js';

/** Configuration for StringExtractor behavior. */
export interface StringExtractorConfig {
  /** Minimum string length to report (default: 4). */
  readonly minLength?: number;
  /** Maximum bytes to scan (default: 10 MB). 0 = no limit. */
  readonly maxBytes?: number;
  /** Whether to extract ASCII strings (default: true). */
  readonly enableAscii?: boolean;
  /** Whether to extract UTF-8 strings (default: true). */
  readonly enableUtf8?: boolean;
  /** Whether to extract UTF-16LE strings (default: true). */
  readonly enableUtf16le?: boolean;
  /** Whether to extract UTF-16BE strings (default: false). */
  readonly enableUtf16be?: boolean;
  /** Maximum number of strings to extract (default: 10000). */
  readonly maxStrings?: number;
}

/** A single extracted string result. */
export interface ExtractedString {
  readonly offset: number;
  readonly encoding: 'ascii' | 'utf-8' | 'utf-16le' | 'utf-16be';
  readonly length: number;
  readonly value: string;
}

const DEFAULT_CONFIG: Required<StringExtractorConfig> = {
  minLength: 4,
  maxBytes: 10 * 1024 * 1024,
  enableAscii: true,
  enableUtf8: true,
  enableUtf16le: true,
  enableUtf16be: false,
  maxStrings: 10000,
};

/**
 * Extracts printable strings from binary artifact content.
 * Deterministic: same input always produces the same output.
 */
export class StringExtractor extends BaseExtractor {
  private readonly _config: Required<StringExtractorConfig>;

  constructor(config?: StringExtractorConfig) {
    super({
      id: 'string-extractor',
      name: 'String Extractor',
      version: '0.1.0',
      supportedArtifactTypes: [
        'file',
        'binary-blob',
        'memory-region',
        'executable',
        'script',
        'document',
        'unknown',
      ],
      priority: 200,
    });
    this._config = { ...DEFAULT_CONFIG, ...config };
  }

  canExtract(context: ExtractionContext): boolean {
    return context.content !== null && context.content.length > 0;
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const features = this._extractStrings(buffer);
    const endTime = Date.now();

    return this.ok(features, {
      bytesProcessed: buffer.length,
      startTime,
      endTime,
    });
  }

  private _extractStrings(buffer: Buffer): ReturnType<typeof createRawFeature>[] {
    const maxLen =
      this._config.maxBytes > 0 ? Math.min(this._config.maxBytes, buffer.length) : buffer.length;
    const data = buffer.subarray(0, maxLen);

    const features: ReturnType<typeof createRawFeature>[] = [];
    const minLen = this._config.minLength;

    // Collect strings from each enabled encoding
    const allStrings: ExtractedString[] = [];

    if (this._config.enableAscii) {
      allStrings.push(...this._scanAscii(data, minLen));
    }
    if (this._config.enableUtf8) {
      allStrings.push(...this._scanUtf8(data, minLen));
    }
    if (this._config.enableUtf16le) {
      allStrings.push(...this._scanUtf16(data, minLen, 'utf-16le'));
    }
    if (this._config.enableUtf16be) {
      allStrings.push(...this._scanUtf16(data, minLen, 'utf-16be'));
    }

    // Sort by offset for deterministic output
    allStrings.sort((a, b) => a.offset - b.offset);

    // Limit to maxStrings
    const limited =
      this._config.maxStrings > 0 ? allStrings.slice(0, this._config.maxStrings) : allStrings;

    for (const s of limited) {
      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'string-literal',
          value: s.value,
          confidence: s.encoding === 'ascii' ? 0.95 : 0.85,
          metadata: {
            encoding: s.encoding,
            offset: s.offset,
            length: s.length,
            stringLength: s.value.length,
          },
        }),
      );
    }

    return features;
  }

  /**
   * Scan for ASCII printable strings (bytes 32-126).
   */
  private _scanAscii(data: Buffer, minLen: number): ExtractedString[] {
    const strings: ExtractedString[] = [];
    let start = -1;

    for (let i = 0; i < data.length; i++) {
      const byte = data[i];
      // Printable ASCII (32-126) or common whitespace (tab=9, newline=10, carriage return=13)
      if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
        if (start === -1) start = i;
      } else {
        if (start !== -1) {
          const length = i - start;
          if (length >= minLen) {
            strings.push({
              offset: start,
              encoding: 'ascii',
              length,
              value: data.toString('utf-8', start, i).trim(),
            });
          }
          start = -1;
        }
      }
    }

    // Handle string at end of buffer
    if (start !== -1) {
      const length = data.length - start;
      if (length >= minLen) {
        strings.push({
          offset: start,
          encoding: 'ascii',
          length,
          value: data.toString('utf-8', start, data.length).trim(),
        });
      }
    }

    return strings;
  }

  /**
   * Scan for valid UTF-8 sequences that decode to printable content.
   */
  private _scanUtf8(data: Buffer, minLen: number): ExtractedString[] {
    const strings: ExtractedString[] = [];
    let start = -1;
    let runeLen = 0;
    let validRunes = 0;

    for (let i = 0; i < data.length;) {
      const byte = data[i];

      // Determine UTF-8 sequence length
      if (byte < 0x80) {
        runeLen = 1;
      } else if (byte >= 0xc2 && byte <= 0xdf) {
        runeLen = 2;
      } else if (byte >= 0xe0 && byte <= 0xef) {
        runeLen = 3;
      } else if (byte >= 0xf0 && byte <= 0xf4) {
        runeLen = 4;
      } else {
        // Not a valid UTF-8 start byte
        if (start !== -1) {
          const length = i - start;
          if (length >= minLen && validRunes >= 1) {
            strings.push({
              offset: start,
              encoding: 'utf-8',
              length,
              value: this._safeUtf8Decode(data, start, i),
            });
          }
          start = -1;
          validRunes = 0;
        }
        i++;
        continue;
      }

      // Validate the full sequence
      if (i + runeLen > data.length) break; // Truncated sequence
      let valid = true;
      for (let j = 1; j < runeLen; j++) {
        if ((data[i + j] & 0xc0) !== 0x80) {
          valid = false;
          break;
        }
      }

      if (valid) {
        if (start === -1) start = i;
        // Check if the decoded rune is printable
        const rune = this._decodeRune(data, i, runeLen);
        if (rune !== null && this._isPrintableRune(rune)) {
          validRunes++;
        }
        i += runeLen;
      } else {
        if (start !== -1) {
          const length = i - start;
          if (length >= minLen && validRunes >= 1) {
            strings.push({
              offset: start,
              encoding: 'utf-8',
              length,
              value: this._safeUtf8Decode(data, start, i),
            });
          }
          start = -1;
          validRunes = 0;
        }
        i++;
      }
    }

    // Handle string at end of buffer
    if (start !== -1) {
      const length = data.length - start;
      if (length >= minLen && validRunes >= 1) {
        strings.push({
          offset: start,
          encoding: 'utf-8',
          length,
          value: this._safeUtf8Decode(data, start, data.length),
        });
      }
    }

    return strings;
  }

  /**
   * Scan for UTF-16 strings (both LE and BE).
   */
  private _scanUtf16(
    data: Buffer,
    minLen: number,
    encoding: 'utf-16le' | 'utf-16be',
  ): ExtractedString[] {
    const strings: ExtractedString[] = [];
    const chars: number[] = [];
    let charOffset = -1;

    // We need aligned access for UTF-16
    const startOffset = encoding === 'utf-16le' ? 0 : 0;

    for (let i = startOffset; i + 1 < data.length; i += 2) {
      const lo = data[i];
      const hi = data[i + 1];
      const codeUnit = encoding === 'utf-16le' ? (hi << 8) | lo : (lo << 8) | hi;

      // Check if this is a printable BMP character
      if (
        (codeUnit >= 32 && codeUnit <= 126) ||
        codeUnit === 9 ||
        codeUnit === 10 ||
        codeUnit === 13 ||
        codeUnit === 0x0d ||
        codeUnit === 0x0a ||
        (codeUnit >= 0xa0 && codeUnit <= 0xd7ff) ||
        (codeUnit >= 0xe000 && codeUnit <= 0xfffd)
      ) {
        if (charOffset === -1) charOffset = i;
        chars.push(codeUnit);
      } else {
        if (charOffset !== -1 && chars.length >= minLen) {
          strings.push({
            offset: charOffset,
            encoding,
            length: chars.length * 2,
            value: String.fromCodePoint(...chars),
          });
        }
        charOffset = -1;
        chars.length = 0;
      }
    }

    // Handle string at end
    if (charOffset !== -1 && chars.length >= minLen) {
      strings.push({
        offset: charOffset,
        encoding,
        length: chars.length * 2,
        value: String.fromCodePoint(...chars),
      });
    }

    return strings;
  }

  /**
   * Decode a single UTF-8 rune from the buffer at the given position.
   * Returns the code point or null if invalid.
   */
  private _decodeRune(data: Buffer, pos: number, len: number): number | null {
    if (len === 1) return data[pos];
    if (len === 2) {
      return ((data[pos] & 0x1f) << 6) | (data[pos + 1] & 0x3f);
    }
    if (len === 3) {
      return ((data[pos] & 0x0f) << 12) | ((data[pos + 1] & 0x3f) << 6) | (data[pos + 2] & 0x3f);
    }
    if (len === 4) {
      return (
        ((data[pos] & 0x07) << 18) |
        ((data[pos + 1] & 0x3f) << 12) |
        ((data[pos + 2] & 0x3f) << 6) |
        (data[pos + 3] & 0x3f)
      );
    }
    return null;
  }

  /**
   * Check if a Unicode code point is printable.
   */
  private _isPrintableRune(codePoint: number): boolean {
    // ASCII printable range
    if (codePoint >= 32 && codePoint <= 126) return true;
    // Common whitespace
    if (codePoint === 9 || codePoint === 10 || codePoint === 13) return true;
    // BMP non-surrogate printable characters
    if (codePoint >= 0xa0 && codePoint <= 0xd7ff) return true;
    if (codePoint >= 0xe000 && codePoint <= 0xfffd) return true;
    // Supplementary planes - assume printable
    if (codePoint >= 0x10000 && codePoint <= 0x10ffff) return true;
    return false;
  }

  /**
   * Safely decode a UTF-8 substring, replacing invalid sequences.
   */
  private _safeUtf8Decode(data: Buffer, start: number, end: number): string {
    try {
      return data.toString('utf-8', start, end).trim();
    } catch {
      // Fallback: decode byte by byte, replacing invalid sequences
      let result = '';
      for (let i = start; i < end;) {
        const byte = data[i];
        if (byte < 0x80) {
          result += String.fromCodePoint(byte);
          i++;
        } else if (byte >= 0xc2 && byte <= 0xdf && i + 1 < end) {
          result += String.fromCodePoint(((byte & 0x1f) << 6) | (data[i + 1] & 0x3f));
          i += 2;
        } else if (byte >= 0xe0 && byte <= 0xef && i + 2 < end) {
          result += String.fromCodePoint(
            ((byte & 0x0f) << 12) | ((data[i + 1] & 0x3f) << 6) | (data[i + 2] & 0x3f),
          );
          i += 3;
        } else if (byte >= 0xf0 && byte <= 0xf4 && i + 3 < end) {
          result += String.fromCodePoint(
            ((byte & 0x07) << 18) |
              ((data[i + 1] & 0x3f) << 12) |
              ((data[i + 2] & 0x3f) << 6) |
              (data[i + 3] & 0x3f),
          );
          i += 4;
        } else {
          i++;
        }
      }
      return result.trim();
    }
  }
}
