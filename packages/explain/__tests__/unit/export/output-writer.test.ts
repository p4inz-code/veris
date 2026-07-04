/**
 * Tests for output writer — atomic writes and overwrite protection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { OutputWriter } from '../../../src/export/output-writer.js';

describe('OutputWriter', () => {
  const writer = new OutputWriter('utf-8');
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'veris-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes content to a file', () => {
    const filePath = path.join(tmpDir, 'test.md');
    const result = writer.write(filePath, 'Hello, world!', false);
    expect(result.success).toBe(true);
    expect(result.path).toBe(filePath);
    expect(result.bytesWritten).toBeGreaterThan(0);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('Hello, world!');
  });

  it('protects against overwriting', () => {
    const filePath = path.join(tmpDir, 'existing.md');
    fs.writeFileSync(filePath, 'Original content', 'utf-8');

    const result = writer.write(filePath, 'New content', false);
    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('Original content');
  });

  it('overwrites when overwrite flag is set', () => {
    const filePath = path.join(tmpDir, 'overwrite.md');
    fs.writeFileSync(filePath, 'Original content', 'utf-8');

    const result = writer.write(filePath, 'New content', true);
    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('New content');
  });

  it('creates parent directories', () => {
    const filePath = path.join(tmpDir, 'nested', 'deep', 'file.md');
    const result = writer.write(filePath, 'Nested content', false);
    expect(result.success).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('handles empty content', () => {
    const filePath = path.join(tmpDir, 'empty.md');
    const result = writer.write(filePath, '', false);
    expect(result.success).toBe(true);
    expect(result.bytesWritten).toBe(0);
  });

  it('handles unicode content', () => {
    const filePath = path.join(tmpDir, 'unicode.md');
    const content = 'Hello, 世界! 🌍 Unicode content with café and résumé.';
    const result = writer.write(filePath, content, false);
    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(content);
  });

  it('reports bytes written correctly', () => {
    const filePath = path.join(tmpDir, 'bytes.md');
    const content = 'Hello, world!';
    const result = writer.write(filePath, content, false);
    expect(result.bytesWritten).toBe(13);
  });

  it('handles invalid paths gracefully', () => {
    const result = writer.write('', 'content', false);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('is deterministic — same content produces same result', () => {
    const filePath1 = path.join(tmpDir, 'det1.md');
    const filePath2 = path.join(tmpDir, 'det2.md');
    const content = 'Deterministic content';

    const r1 = writer.write(filePath1, content, false);
    const r2 = writer.write(filePath2, content, false);

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r1.bytesWritten).toBe(r2.bytesWritten);
  });

  it('async write produces same result as sync', async () => {
    const filePath = path.join(tmpDir, 'async.md');
    const content = 'Async content';

    const result = await writer.writeAsync(filePath, content, false);
    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe(content);
  });

  it('checks file existence', () => {
    const filePath = path.join(tmpDir, 'exists.md');
    expect(writer.exists(filePath)).toBe(false);
    fs.writeFileSync(filePath, 'content', 'utf-8');
    expect(writer.exists(filePath)).toBe(true);
  });

  it('large content write', () => {
    const filePath = path.join(tmpDir, 'large.md');
    const largeContent = 'A'.repeat(100000);
    const result = writer.write(filePath, largeContent, false);
    expect(result.success).toBe(true);
    expect(result.bytesWritten).toBe(100000);
  });

  it('writes in different encoding', () => {
    const hexWriter = new OutputWriter('hex');
    const filePath = path.join(tmpDir, 'hex.txt');
    // "hello" in hex is "68656c6c6f"
    const result = hexWriter.write(filePath, '68656c6c6f', false);
    expect(result.success).toBe(true);
  });
});
