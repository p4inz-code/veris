/**
 * Robustness tests for ArchiveExtractor — malformed and edge-case archives.
 *
 * Covers:
 * - Truncated archives (ZIP, TAR, GZIP)
 * - Malformed headers
 * - Empty archives
 * - Archive entry limits (MAX_ARCHIVE_ENTRIES)
 * - No hangs or crashes on any input
 * - Bounded execution time
 *
 * @module @veris/extractors/__tests__/archive-robustness
 */

import { describe, it, expect } from 'vitest';
import { ArchiveExtractor } from '../src/extractors/archive-extractor.js';
import type { Artifact } from '@veris/core';

// ── Helpers ──

function makeContext(content: Buffer) {
  const artifact: Artifact = {
    id: 'art_archive_test',
    sessionId: 'ss_test',
    parentId: null,
    type: 'archive',
    normalizedPath: '/test/archive.bin',
    size: content.length,
    contentHash: { algorithm: 'sha-256', value: 'abc' },
    mimeType: 'application/octet-stream',
    extractedAt: new Date().toISOString(),
    extractorId: 'test',
  };
  return { artifact, sessionId: 'ss_test', content };
}

describe('ArchiveExtractor robustness', () => {
  const ext = new ArchiveExtractor();

  // ── Empty / Minimal Inputs ──

  it('handles empty buffer without crashing', async () => {
    const ctx = makeContext(Buffer.alloc(0));
    const result = await ext.extract(ctx);
    expect(result.features).toBeDefined();
  });

  it('handles single-byte buffer without crashing', async () => {
    const ctx = makeContext(Buffer.from([0x00]));
    const result = await ext.extract(ctx);
    expect(result.features).toBeDefined();
  });

  it('handles random binary data without crashing', async () => {
    const buf = Buffer.alloc(1024);
    for (let i = 0; i < buf.length; i++) {
      buf[i] = Math.floor(Math.random() * 256);
    }
    const ctx = makeContext(buf);
    const result = await ext.extract(ctx);
    expect(result.features).toBeDefined();
    // Should not detect a known archive type
    const type = result.features.find((f) => f.type === 'archive-type');
    expect(type).toBeUndefined();
  });

  it('handles all-zeros buffer without crashing', async () => {
    const ctx = makeContext(Buffer.alloc(4096));
    const result = await ext.extract(ctx);
    expect(result.features).toBeDefined();
  });

  // ── Malformed ZIP ──

  it('handles ZIP with only local file header (no EOCD)', async () => {
    // ZIP local file header without EOCD
    const buf = Buffer.alloc(30);
    buf.writeUInt32LE(0x04034b50, 0); // Local file header signature
    buf.writeUInt16LE(20, 4); // Version needed
    buf.writeUInt16LE(0, 6); // Bit flag
    buf.writeUInt16LE(0, 8); // Compression method
    buf.writeUInt32LE(0, 14); // CRC-32
    buf.writeUInt32LE(10, 18); // Compressed size
    buf.writeUInt32LE(10, 22); // Uncompressed size
    buf.writeUInt16LE(4, 26); // File name length
    buf.write('test', 30); // File name

    const ctx = makeContext(buf);
    const result = await ext.extract(ctx);
    expect(result.features).toBeDefined();
    // Should detect ZIP format from magic bytes
    const type = result.features.find((f) => f.type === 'archive-type');
    expect(type).toBeDefined();
    expect(type!.value).toBe('zip');
  });

  it('handles ZIP with corrupted central directory', async () => {
    const buf = Buffer.alloc(1024);
    // Write valid ZIP magic
    buf[0] = 0x50;
    buf[1] = 0x4b;
    buf[2] = 0x03;
    buf[3] = 0x04;
    // EOCD with crazy offsets
    buf.writeUInt32LE(0x06054b50, 900);
    buf.writeUInt16LE(9999, 910); // Total entries (huge)
    buf.writeUInt32LE(0xffffffff, 916); // CD offset (out of bounds)

    const ctx = makeContext(buf);
    const result = await ext.extract(ctx);
    expect(result.features).toBeDefined();
    // Should not crash — may return partial results
    const type = result.features.find((f) => f.type === 'archive-type');
    expect(type).toBeDefined();
  });

  it('handles ZIP with excessive MAX_ARCHIVE_ENTRIES', async () => {
    // Create a minimal ZIP that claims to have more entries than MAX_ARCHIVE_ENTRIES (10000)
    // Just the PK header + EOCD with a huge entry count
    const parts: Buffer[] = [];

    // Local file header
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(0, 18);
    header.writeUInt32LE(0, 22);
    header.writeUInt16LE(0, 26);
    header.writeUInt16LE(0, 28);
    parts.push(header);

    // EOCD with 65535 entries (max 16-bit, also > MAX_ARCHIVE_ENTRIES=10000)
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(65535, 8); // Total entries on disk (max uint16)
    eocd.writeUInt16LE(65535, 10); // Total entries
    eocd.writeUInt32LE(0, 12);
    eocd.writeUInt32LE(30, 16); // CD offset
    eocd.writeUInt16LE(0, 20);
    parts.push(eocd);

    const buf = Buffer.concat(parts);
    const ctx = makeContext(buf);
    const result = await ext.extract(ctx);
    expect(result.features).toBeDefined();
    // Should emit a limit warning
    const warning = result.features.find((f) => f.type === 'archive-limit-warning');
    expect(warning).toBeDefined();
  });

  // ── Malformed TAR ──

  it('handles TAR with only header block (no data)', async () => {
    const buf = Buffer.alloc(512);
    // Write a TAR header with ustar magic
    buf.write('filename.txt', 0, 100);
    buf.write('000000000644', 100, 12); // mode
    buf.write('000000000000', 108, 8); // uid
    buf.write('000000000000', 116, 8); // gid
    buf.write('00000000000', 124, 12); // size (0)
    buf.write('00000000000', 136, 12); // mtime
    // Type flag
    buf[156] = 48; // '0' regular file
    buf.write('ustar', 257, 5); // magic

    const ctx = makeContext(buf);
    const result = await ext.extract(ctx);
    expect(result.features).toBeDefined();
    const type = result.features.find((f) => f.type === 'archive-type');
    expect(type!.value).toBe('tar');
    const members = result.features.filter((f) => f.type === 'archive-member');
    expect(members.length).toBe(1);
  });

  it('handles TAR with truncated header (less than 512 bytes)', async () => {
    const ctx = makeContext(Buffer.alloc(256));
    const result = await ext.extract(ctx);
    expect(result.features).toBeDefined();
    // Should not crash
    const type = result.features.find((f) => f.type === 'archive-type');
    expect(type).toBeUndefined(); // Not enough bytes for ustar magic at offset 257
  });

  it('handles TAR with invalid octal sizes (non-numeric)', async () => {
    const buf = Buffer.alloc(1024);
    buf.write('invalid.tar', 0, 100);
    buf.write('ustar', 257, 5);
    // Write non-numeric size
    buf.write('hello world', 124, 12);
    buf[156] = 48; // Regular file

    const ctx = makeContext(buf);
    const result = await ext.extract(ctx);
    expect(result.features).toBeDefined();
    // parseInt of non-numeric should return 0 — no crash
    const members = result.features.filter((f) => f.type === 'archive-member');
    expect(members.length).toBe(1);
    expect(members[0].value.size).toBe(0);
  });

  it('handles TAR with negative octal values', async () => {
    const buf = Buffer.alloc(1024);
    buf.write('malicious.tar', 0, 100);
    buf.write('ustar', 257, 5);
    buf.write('77777777777', 124, 12); // Negative in octal (large unsigned)
    buf[156] = 48; // Regular file

    const ctx = makeContext(buf);
    const result = await ext.extract(ctx);
    expect(result.features).toBeDefined();
    // Large octal for size could cause issues — should be bounded
    const members = result.features.filter((f) => f.type === 'archive-member');
    expect(members.length).toBe(1);
    // parseInt of large octal might return huge number, but should not crash
    expect(typeof members[0].value.size).toBe('number');
  });

  it('handles TAR exceeding MAX_ARCHIVE_ENTRIES', async () => {
    // Create a TAR with a header block that points to more data
    // We'll put many empty header blocks to simulate many entries
    const blocks: Buffer[] = [];
    for (let i = 0; i < 10010; i++) {
      const block = Buffer.alloc(512);
      block.write(`entry_${i}.txt`, 0, 100);
      block.write('ustar', 257, 5);
      block.write('00000000000', 124, 12); // size 0
      block[156] = 48; // Regular file
      blocks.push(block);
    }

    const buf = Buffer.concat(blocks);
    const ctx = makeContext(buf);
    const result = await ext.extract(ctx);
    expect(result.features).toBeDefined();
    const members = result.features.filter((f) => f.type === 'archive-member');
    expect(members.length).toBeLessThanOrEqual(10000);
    // Should emit a limit warning
    const warning = result.features.find((f) => f.type === 'archive-limit-warning');
    expect(warning).toBeDefined();
  });

  // ── Malformed GZIP ──

  it('handles GZIP with truncated header (less than 10 bytes)', async () => {
    const ctx = makeContext(Buffer.from([0x1f, 0x8b, 0x08]));
    const result = await ext.extract(ctx);
    expect(result.features).toBeDefined();
    // Should detect GZIP but handle truncated header
    const type = result.features.find((f) => f.type === 'archive-type');
    expect(type).toBeDefined();
    expect(type!.value).toBe('gzip');
  });

  it('handles GZIP with corrupted extra fields', async () => {
    // GZIP header with extra flags but truncated extra field
    const buf = Buffer.alloc(12);
    buf[0] = 0x1f;
    buf[1] = 0x8b; // Magic
    buf[2] = 8; // Deflate
    buf[3] = 0x04; // FEXTRA flag set
    buf.writeUInt32LE(0, 4); // mtime
    buf[8] = 0; // XFL
    buf[9] = 255; // OS
    buf.writeUInt16LE(100, 10); // XLEN = 100 but buffer is only 12 bytes

    const ctx = makeContext(buf);
    const result = await ext.extract(ctx);
    expect(result.features).toBeDefined();
    // Should not crash — handle buffer bounds gracefully
  });

  it('handles GZIP with all header flags set', async () => {
    // GZIP header with FEXTRA, FNAME, FCOMMENT all set
    const parts: Buffer[] = [];
    const header = Buffer.alloc(10);
    header[0] = 0x1f;
    header[1] = 0x8b;
    header[2] = 8;
    header[3] = 0x1f; // All flags set: FTEXT(0x01), FHCRC(0x02), FEXTRA(0x04), FNAME(0x08), FCOMMENT(0x10)
    header.writeUInt32LE(0, 4);
    header[8] = 0;
    header[9] = 255;
    parts.push(header);

    // Extra field (2 bytes length + dummy data)
    const extra = Buffer.alloc(10);
    extra.writeUInt16LE(4, 0); // XLEN = 4
    extra.write('test', 2, 4);
    parts.push(extra);

    // Filename (null-terminated)
    parts.push(Buffer.from('test.txt'));
    parts.push(Buffer.from([0]));

    // Comment (null-terminated)
    parts.push(Buffer.from('hello'));
    parts.push(Buffer.from([0]));

    // CRC16 (2 bytes — for FHCRC)
    parts.push(Buffer.alloc(2));

    const buf = Buffer.concat(parts);
    const ctx = makeContext(buf);
    const result = await ext.extract(ctx);
    expect(result.features).toBeDefined();
    const type = result.features.find((f) => f.type === 'archive-type');
    expect(type).toBeDefined();
    expect(type!.value).toBe('gzip');
  });

  // ── RAR ──

  it('handles RAR magic bytes gracefully', async () => {
    const buf = Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00, ...Buffer.alloc(100)]);
    const ctx = makeContext(buf);
    const result = await ext.extract(ctx);
    expect(result.features).toBeDefined();
    const type = result.features.find((f) => f.type === 'archive-type');
    expect(type).toBeDefined();
    expect(type!.value).toBe('rar');
  });

  // ── Bounded execution ──

  it('completes within reasonable time for large inputs', async () => {
    const buf = Buffer.alloc(1024 * 1024); // 1MB of garbage
    for (let i = 0; i < buf.length; i += 4096) {
      buf[i] = 0x50;
      buf[i + 1] = 0x4b; // Fake ZIP-like patterns
    }
    const ctx = makeContext(buf);
    const start = Date.now();
    const result = await ext.extract(ctx);
    const elapsed = Date.now() - start;
    expect(result.features).toBeDefined();
    expect(elapsed).toBeLessThan(5000); // Should complete in < 5s
  });

  // ── Determinism on malformed input ──

  it('produces identical output for identical malformed input', async () => {
    const buf = Buffer.alloc(2048);
    // Write some partial TAR headers
    buf.write('ustar', 257, 5);
    buf[156] = 48;
    buf.write('00000000000', 124, 12);

    const ctx1 = makeContext(buf);
    const ctx2 = makeContext(buf);
    const [r1, r2] = await Promise.all([ext.extract(ctx1), ext.extract(ctx2)]);
    expect(JSON.stringify(r1.features)).toBe(JSON.stringify(r2.features));
  });
});
