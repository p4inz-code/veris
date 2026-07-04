/**
 * ArchiveExtractor — extracts metadata from archive files.
 *
 * Supports: ZIP, TAR, GZIP.
 * Only extracts metadata (member names, sizes, compression, timestamps).
 * Does NOT recursively extract or analyze contents.
 *
 * @module @veris/extractors/extractors/archive-extractor
 */

import * as zlib from 'node:zlib';

import { MAX_ARCHIVE_ENTRIES } from '@veris/core';

import { BaseExtractor } from '../base-extractor.js';
import type { ExtractionContext, ExtractionResult } from '../types.js';
import { createRawFeature } from '../types.js';

/** Metadata for a single archive member. */
export interface ArchiveMember {
  readonly name: string;
  readonly size: number;
  readonly compressedSize?: number;
  readonly compressionMethod?: string;
  readonly timestamp?: string;
  readonly isDirectory: boolean;
}

/**
 * Extracts metadata from archive files.
 * Deterministic: same archive → same metadata.
 * Does NOT extract or decompress file contents.
 */
export class ArchiveExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'archive-extractor',
      name: 'Archive Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['archive', 'file'],
      priority: 100,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    return context.content !== null && context.content.length > 0;
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const issues: import('../types.js').ExtractionIssue[] = [];
    const features: ReturnType<typeof createRawFeature>[] = [];

    // Detect archive type from content (magic bytes)
    const archiveType = this._detectArchiveType(buffer);

    if (!archiveType) {
      return this.ok([], {
        bytesProcessed: buffer.length,
        startTime,
        endTime: Date.now(),
        issues: [this.warning('UNKNOWN_ARCHIVE', 'Could not determine archive type from content')],
      });
    }

    features.push(
      createRawFeature({
        extractorId: this.id,
        type: 'archive-type',
        value: archiveType,
        confidence: 1.0,
        metadata: { detectedFrom: 'magic-bytes' },
      }),
    );

    try {
      switch (archiveType) {
        case 'gzip':
          features.push(...this._extractGzipMetadata(buffer));
          break;
        case 'zip':
          features.push(...this._extractZipMetadata(buffer));
          break;
        case 'tar':
          features.push(...this._extractTarMetadata(buffer));
          break;
      }
    } catch (error) {
      issues.push(
        this.error(
          'ARCHIVE_PARSE_ERROR',
          `Failed to parse ${archiveType} archive: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(features, {
      bytesProcessed: buffer.length,
      startTime,
      endTime,
      issues,
    });
  }

  /**
   * Detect archive type from magic bytes.
   */
  private _detectArchiveType(buffer: Buffer): string | null {
    // GZIP: 1f 8b
    if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
      return 'gzip';
    }
    // ZIP: PK\x03\x04
    if (
      buffer.length >= 4 &&
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04
    ) {
      return 'zip';
    }
    // TAR: 257-byte offset has "ustar" magic
    if (buffer.length >= 262) {
      const magic = buffer.toString('ascii', 257, 262);
      if (magic === 'ustar') return 'tar';
    }
    // RAR: 52 61 72 21 1A 07 00 ("Rar!\x1a\x07\x00")
    if (
      buffer.length >= 7 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x61 &&
      buffer[2] === 0x72 &&
      buffer[3] === 0x21 &&
      buffer[4] === 0x1a &&
      buffer[5] === 0x07 &&
      buffer[6] === 0x00
    ) {
      return 'rar';
    }
    return null;
  }

  /**
   * Extract GZIP metadata (no decompression).
   */
  private _extractGzipMetadata(buffer: Buffer): ReturnType<typeof createRawFeature>[] {
    const features: ReturnType<typeof createRawFeature>[] = [];

    // Parse GZIP header
    // See RFC 1952
    if (buffer.length < 10) return features;

    const compressionMethod = buffer[2]; // 8 = deflate
    const flags = buffer[3];
    const mtime = buffer.readUInt32LE(4); // Unix timestamp
    const xfl = buffer[8]; // Extra flags
    const os = buffer[9]; // OS

    let headerSize = 10;
    if (flags & 0x04) {
      // Extra field
      const xlen = buffer.readUInt16LE(headerSize);
      headerSize += 2 + xlen;
    }
    if (flags & 0x08) {
      // Original filename
      while (headerSize < buffer.length && buffer[headerSize] !== 0) headerSize++;
      headerSize++; // null terminator
    }
    if (flags & 0x10) {
      // Comment
      while (headerSize < buffer.length && buffer[headerSize] !== 0) headerSize++;
      headerSize++;
    }

    const compressedSize = buffer.length;
    const uncompressedSize =
      buffer.length >= headerSize + 8 ? buffer.readUInt32LE(buffer.length - 4) : 0;

    features.push(
      createRawFeature({
        extractorId: this.id,
        type: 'archive-member',
        value: {
          name: 'content',
          size: uncompressedSize,
          compressedSize,
          compressionMethod: compressionMethod === 8 ? 'deflate' : `unknown-${compressionMethod}`,
          timestamp: mtime > 0 ? new Date(mtime * 1000).toISOString() : undefined,
          isDirectory: false,
        },
        confidence: 1.0,
        metadata: {
          archiveType: 'gzip',
          flags,
          os,
          xfl,
          memberCount: 1,
        },
      }),
    );

    features.push(
      createRawFeature({
        extractorId: this.id,
        type: 'archive-metadata',
        value: {
          format: 'gzip',
          compressedSize,
          uncompressedSize,
          compressionRatio:
            compressedSize > 0 ? Math.round((uncompressedSize / compressedSize) * 100) / 100 : 0,
          memberCount: 1,
        },
        confidence: 1.0,
      }),
    );

    return features;
  }

  /**
   * Extract ZIP metadata by reading the Central Directory.
   */
  private _extractZipMetadata(buffer: Buffer): ReturnType<typeof createRawFeature>[] {
    const features: ReturnType<typeof createRawFeature>[] = [];
    const members: ArchiveMember[] = [];

    // Find End of Central Directory Record (EOCD)
    const eocdSignature = 0x06054b50;
    const eocdSigBytes = Buffer.alloc(4);
    eocdSigBytes.writeUInt32LE(eocdSignature, 0);

    // Use native `lastIndexOf` for the EOCD scan (much faster than byte-by-byte loop)
    const eocdOffset = buffer.lastIndexOf(eocdSigBytes);

    if (eocdOffset === -1) return features; // No EOCD found

    let totalEntries = buffer.readUInt16LE(eocdOffset + 10);
    // Enforce MAX_ARCHIVE_ENTRIES to prevent OOM on malicious archives
    if (totalEntries > MAX_ARCHIVE_ENTRIES) {
      totalEntries = MAX_ARCHIVE_ENTRIES;
      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'archive-limit-warning',
          value: {
            limit: 'MAX_ARCHIVE_ENTRIES',
            actual: buffer.readUInt16LE(eocdOffset + 10),
            truncated: MAX_ARCHIVE_ENTRIES,
          },
          confidence: 1.0,
          metadata: { warning: 'Archive entry count exceeded MAX_ARCHIVE_ENTRIES limit' },
        }),
      );
    }

    const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);

    // Parse Central Directory entries
    const cdSignature = 0x02014b50;
    let offset = centralDirOffset;

    for (let i = 0; i < totalEntries && offset + 46 <= buffer.length; i++) {
      if (buffer.readUInt32LE(offset) !== cdSignature) break;

      const compressionMethod = buffer.readUInt16LE(offset + 10);
      const compressedSize = buffer.readUInt32LE(offset + 20);
      const uncompressedSize = buffer.readUInt32LE(offset + 24);
      const fileNameLength = buffer.readUInt16LE(offset + 28);
      const extraFieldLength = buffer.readUInt16LE(offset + 30);
      const commentLength = buffer.readUInt16LE(offset + 32);
      const dosTime = buffer.readUInt16LE(offset + 12);
      const dosDate = buffer.readUInt16LE(offset + 14);
      const internalAttrs = buffer.readUInt16LE(offset + 36);

      const name = buffer.toString('utf-8', offset + 46, offset + 46 + fileNameLength);
      const isDirectory = name.endsWith('/') || (internalAttrs & 0x01) !== 0;

      const compressionMethods: Record<number, string> = {
        0: 'stored',
        1: 'shrunk',
        2: 'reduced-1',
        3: 'reduced-2',
        4: 'reduced-3',
        5: 'reduced-4',
        6: 'imploded',
        8: 'deflated',
        9: 'deflated-64',
        10: 'PKWare-DCL-imploded',
        12: 'bzip2',
        14: 'LZMA',
        93: 'zstd',
      };

      members.push({
        name,
        size: uncompressedSize,
        compressedSize,
        compressionMethod: compressionMethods[compressionMethod] ?? `unknown-${compressionMethod}`,
        timestamp: this._dosTimestampToISO(dosDate, dosTime),
        isDirectory,
      });

      offset += 46 + fileNameLength + extraFieldLength + commentLength;
    }

    // Emit metadata features
    for (const member of members) {
      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'archive-member',
          value: member,
          confidence: 1.0,
          metadata: { archiveType: 'zip' },
        }),
      );
    }

    const totalSize = members.reduce((sum, m) => sum + m.size, 0);
    const totalCompressed = members.reduce((sum, m) => sum + (m.compressedSize ?? 0), 0);

    features.push(
      createRawFeature({
        extractorId: this.id,
        type: 'archive-metadata',
        value: {
          format: 'zip',
          memberCount: members.length,
          totalUncompressedSize: totalSize,
          totalCompressedSize: totalCompressed > 0 ? totalCompressed : undefined,
        },
        confidence: 1.0,
      }),
    );

    return features;
  }

  /**
   * Extract TAR metadata.
   * Parses the 512-byte header blocks.
   */
  private _extractTarMetadata(buffer: Buffer): ReturnType<typeof createRawFeature>[] {
    const features: ReturnType<typeof createRawFeature>[] = [];
    const members: ArchiveMember[] = [];

    let offset = 0;
    let entriesParsed = 0;
    const blockSize = 512;

    while (offset + blockSize <= buffer.length && entriesParsed < MAX_ARCHIVE_ENTRIES) {
      const header = buffer.subarray(offset, offset + blockSize);

      // Check for end-of-archive (all zeros)
      if (header[0] === 0) break;

      const name = this._readTarString(header, 0, 100);
      const sizeStr = this._readTarString(header, 124, 12);
      const mtimeStr = this._readTarString(header, 136, 12);
      const typeFlag = header[156];
      const magic = this._readTarString(header, 257, 6);
      const version = this._readTarString(header, 263, 2);

      // Support GNU tar long name extension (typeflag 'L' = 76)
      let fileName = name;
      if (typeFlag === 76) {
        // GNU long name extension entry - next block has the actual name
        const longNameSize = parseInt(sizeStr, 8);
        if (longNameSize > 0 && offset + blockSize + longNameSize <= buffer.length) {
          fileName = buffer
            .toString('utf-8', offset + blockSize, offset + blockSize + longNameSize)
            .replace(/\0/g, '');
          offset += blockSize + Math.ceil(longNameSize / blockSize) * blockSize;
          continue;
        }
      }

      const size = parseInt(sizeStr, 8) || 0;
      const mtime = parseInt(mtimeStr, 8) || 0;

      const isDirectory = typeFlag === 5 || fileName.endsWith('/');

      const format = magic === 'ustar' && version === '00' ? 'ustar' : 'pre-posix';

      members.push({
        name: fileName,
        size,
        compressionMethod: 'none',
        timestamp: mtime > 0 ? new Date(mtime * 1000).toISOString() : undefined,
        isDirectory,
      });

      // Move to next header (aligned to 512 bytes)
      const dataBlocks = Math.ceil(size / blockSize);
      offset += (1 + dataBlocks) * blockSize;
      entriesParsed++;
    }

    // Emit warning if truncated by limit
    if (entriesParsed >= MAX_ARCHIVE_ENTRIES && offset + blockSize <= buffer.length) {
      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'archive-limit-warning',
          value: {
            limit: 'MAX_ARCHIVE_ENTRIES',
            actual: entriesParsed,
            truncated: MAX_ARCHIVE_ENTRIES,
          },
          confidence: 1.0,
          metadata: { warning: 'Archive entry count exceeded MAX_ARCHIVE_ENTRIES limit' },
        }),
      );
    }

    // Emit metadata features
    for (const member of members) {
      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'archive-member',
          value: member,
          confidence: 1.0,
          metadata: { archiveType: 'tar' },
        }),
      );
    }

    const totalSize = members.reduce((sum, m) => sum + m.size, 0);

    features.push(
      createRawFeature({
        extractorId: this.id,
        type: 'archive-metadata',
        value: {
          format: 'tar',
          memberCount: members.length,
          totalUncompressedSize: totalSize,
        },
        confidence: 1.0,
      }),
    );

    return features;
  }

  /**
   * Read a null-terminated string from a TAR header field.
   */
  private _readTarString(buffer: Buffer, offset: number, maxLen: number): string {
    const end = buffer.indexOf(0, offset);
    if (end < 0 || end > offset + maxLen) {
      return buffer.toString('utf-8', offset, offset + maxLen).trim();
    }
    return buffer.toString('utf-8', offset, end).trim();
  }

  /**
   * Convert DOS date/time to ISO 8601 string.
   */
  private _dosTimestampToISO(dosDate: number, dosTime: number): string | undefined {
    if (dosDate === 0 && dosTime === 0) return undefined;

    const year = ((dosDate >> 9) & 0x7f) + 1980;
    const month = (dosDate >> 5) & 0x0f;
    const day = dosDate & 0x1f;
    const hours = (dosTime >> 11) & 0x1f;
    const minutes = (dosTime >> 5) & 0x3f;
    const seconds = (dosTime & 0x1f) * 2;

    if (year < 1980 || month < 1 || month > 12 || day < 1 || day > 31) return undefined;

    try {
      return new Date(year, month - 1, day, hours, minutes, seconds).toISOString();
    } catch {
      return undefined;
    }
  }
}
