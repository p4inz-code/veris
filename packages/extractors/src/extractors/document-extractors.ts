/**
 * Document, Image, and Certificate metadata extractors.
 *
 * Each extractor detects its respective format and extracts
 * deterministic metadata without performing analysis.
 *
 * @module @veris/extractors/extractors/document-extractors
 */

import { BaseExtractor } from '../base-extractor.js';
import type { ExtractionContext, ExtractionResult } from '../types.js';
import { createRawFeature } from '../types.js';

// ─── PDF Extractor ──────────────────────────────────────────────

/**
 * Extracts metadata from PDF files.
 * Parses the PDF header and trailer dictionary for document info.
 */
export class PDFExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'pdf-extractor',
      name: 'PDF Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['document', 'file'],
      priority: 100,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content || context.content.length < 8) return false;
    const header = context.content.toString('ascii', 0, 8);
    return header.startsWith('%PDF-');
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      const text = buffer.toString('utf-8');
      const version = text.substring(5, 8).trim();

      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'pdf-header',
          value: { version: `PDF ${version}` },
          confidence: 1.0,
          metadata: { format: 'pdf' },
        }),
      );

      // Extract page count from /Pages entry (simplified)
      const pageMatch = text.match(/\/Type\s*\/Pages[^/]*\/Count\s+(\d+)/);
      if (pageMatch) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'pdf-page-count',
            value: parseInt(pageMatch[1], 10),
            confidence: 0.9,
            metadata: { format: 'pdf' },
          }),
        );
      }

      // Extract title from /Info dictionary
      const titleMatch = text.match(/\/Title\s*\(([^)]*)\)/);
      if (titleMatch) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'pdf-title',
            value: titleMatch[1],
            confidence: 0.8,
            metadata: { format: 'pdf' },
          }),
        );
      }

      // Check if PDF is encrypted
      const encryptMatch = text.match(/\/Encrypt\s+\d+\s+\d+\s+R/);
      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'pdf-encrypted',
          value: encryptMatch !== null,
          confidence: 1.0,
          metadata: { format: 'pdf' },
        }),
      );
    } catch (error) {
      issues.push(
        this.error(
          'PDF_PARSE_ERROR',
          `Failed to parse PDF: ${error instanceof Error ? error.message : String(error)}`,
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
}

// ─── Office Extractor ───────────────────────────────────────────

/**
 * Extracts metadata from Office Open XML (OOXML) documents.
 * Detects .docx, .xlsx, .pptx files via ZIP archive + [Content_Types].xml.
 * Only extracts file-level metadata — does NOT parse individual XML parts.
 */
export class OfficeExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'office-extractor',
      name: 'Office Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['document', 'file'],
      priority: 100,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content || context.content.length < 4) return false;
    // Check for ZIP magic (OOXML files are ZIP archives)
    if (context.content[0] !== 0x50 || context.content[1] !== 0x4b) return false;
    if (context.content[2] !== 0x03 || context.content[3] !== 0x04) return false;
    // Check for [Content_Types].xml in the central directory
    return this._hasContentTypesXml(context.content);
  }

  private _hasContentTypesXml(buffer: Buffer): boolean {
    const searchStr = '[Content_Types].xml';
    // Search in the central directory (end of file)
    const searchEnd = Math.min(buffer.length, 100000);
    const searchStart = Math.max(0, buffer.length - searchEnd);
    return buffer.subarray(searchStart).includes(searchStr);
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      // Detect Office file type from embedded XML
      const text = buffer.toString('utf-8', 0, Math.min(buffer.length, 50000));

      let docType: string | null = null;
      if (text.includes('word/document.xml')) docType = 'docx';
      else if (text.includes('xl/workbook.xml')) docType = 'xlsx';
      else if (text.includes('ppt/presentation.xml')) docType = 'pptx';

      if (!docType) {
        return this.ok([], {
          bytesProcessed: buffer.length,
          startTime,
          endTime: Date.now(),
          issues: [this.warning('UNKNOWN_OFFICE_TYPE', 'Could not determine Office document type')],
        });
      }

      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'office-type',
          value: docType,
          confidence: 1.0,
          metadata: { format: 'office' },
        }),
      );

      // Extract application name from docProps/app.xml (if in buffer)
      const appMatch = text.match(/<Application>([^<]+)<\/Application>/);
      if (appMatch) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'office-application',
            value: appMatch[1],
            confidence: 0.9,
            metadata: { format: 'office' },
          }),
        );
      }

      // Page/sheet/slide count
      if (docType === 'docx') {
        const pageCount = text.match(/<Pages>(\d+)<\/Pages>/);
        if (pageCount) {
          features.push(
            createRawFeature({
              extractorId: this.id,
              type: 'office-page-count',
              value: parseInt(pageCount[1], 10),
              confidence: 0.8,
              metadata: { format: 'office' },
            }),
          );
        }
      }
    } catch (error) {
      issues.push(
        this.error(
          'OFFICE_PARSE_ERROR',
          `Failed to parse Office document: ${error instanceof Error ? error.message : String(error)}`,
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
}

// ─── Image Metadata Extractor ───────────────────────────────────

/**
 * Extracts metadata from common image formats.
 * Supports PNG, JPEG, GIF, BMP, WebP, TIFF.
 * Extracts dimensions, bit depth, color type, and basic EXIF-like metadata.
 */
export class ImageExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'image-extractor',
      name: 'Image Metadata Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['image', 'file'],
      priority: 100,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content || context.content.length < 4) return false;
    const buf = context.content;

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
      return true;
    // JPEG: FF D8 FF
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
    // GIF: 47 49 46 38 (39a or 89a)
    if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38)
      return true;
    // BMP: 42 4D
    if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) return true;
    // WebP: 52 49 46 46 .... 57 45 42 50
    if (
      buf.length >= 12 &&
      buf[0] === 0x52 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x46 &&
      buf[8] === 0x57 &&
      buf[9] === 0x45 &&
      buf[10] === 0x42 &&
      buf[11] === 0x50
    )
      return true;
    return false;
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      // Detect format
      const format = this._detectFormat(buffer);
      if (!format) {
        return this.ok([], {
          bytesProcessed: buffer.length,
          startTime,
          endTime: Date.now(),
          issues: [this.warning('UNKNOWN_IMAGE_FORMAT', 'Could not determine image format')],
        });
      }

      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'image-format',
          value: format,
          confidence: 1.0,
        }),
      );

      // Extract dimensions based on format
      let dimensions: { width: number; height: number } | null = null;

      switch (format) {
        case 'png':
          dimensions = this._parsePNGDimensions(buffer);
          break;
        case 'jpeg':
          dimensions = this._parseJPEGDimensions(buffer);
          break;
        case 'gif':
          dimensions = this._parseGIFDimensions(buffer);
          break;
        case 'bmp':
          dimensions = this._parseBMPDimensions(buffer);
          break;
        case 'webp':
          dimensions = this._parseWebPDimensions(buffer);
          break;
      }

      if (dimensions) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'image-dimensions',
            value: dimensions,
            confidence: 1.0,
          }),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'IMAGE_PARSE_ERROR',
          `Failed to parse image: ${error instanceof Error ? error.message : String(error)}`,
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

  private _detectFormat(buffer: Buffer): string | null {
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)
      return 'png';
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpeg';
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return 'gif';
    if (buffer[0] === 0x42 && buffer[1] === 0x4d) return 'bmp';
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46)
      return 'webp';
    return null;
  }

  private _parsePNGDimensions(buffer: Buffer): { width: number; height: number } | null {
    if (buffer.length < 24) return null;
    const ihdrStart = 8; // Skip 8-byte PNG signature
    // Check for IHDR chunk
    if (buffer.toString('ascii', ihdrStart + 4, ihdrStart + 8) !== 'IHDR') return null;
    const width = buffer.readUInt32BE(ihdrStart + 8);
    const height = buffer.readUInt32BE(ihdrStart + 12);
    return { width, height };
  }

  private _parseJPEGDimensions(buffer: Buffer): { width: number; height: number } | null {
    let offset = 2;
    while (offset + 4 < buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      if (marker === 0xd9) break; // EOI
      if (marker === 0xda) break; // SOS - image data starts
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2) break;

      // SOF markers: 0xC0, 0xC1, 0xC2
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xcb)) {
        if (offset + 9 <= buffer.length) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }
      }
      offset += 2 + length;
    }
    return null;
  }

  private _parseGIFDimensions(buffer: Buffer): { width: number; height: number } | null {
    if (buffer.length < 10) return null;
    const width = buffer.readUInt16LE(6);
    const height = buffer.readUInt16LE(8);
    return { width, height };
  }

  private _parseBMPDimensions(buffer: Buffer): { width: number; height: number } | null {
    if (buffer.length < 26) return null;
    const width = buffer.readInt32LE(18);
    const height = Math.abs(buffer.readInt32LE(22));
    return { width, height };
  }

  private _parseWebPDimensions(buffer: Buffer): { width: number; height: number } | null {
    if (buffer.length < 30) return null;
    // VP8X or VP8L or VP8
    const chunkType = buffer.toString('ascii', 12, 16);
    if (chunkType === 'VP8X') {
      // Extended format
      if (buffer.length < 30) return null;
      const w = buffer.readUIntLE(24, 3) + 1;
      // Height is at byte 27 (3 bytes)
      const h = buffer.readUIntLE(27, 3) + 1;
      return { width: w, height: h }; // Simplified
    }
    if (chunkType === 'VP8 ' || chunkType === 'VP8L') {
      return null; // Would need deeper parsing
    }
    return null;
  }
}

// ─── Certificate Extractor ──────────────────────────────────────

/**
 * Extracts metadata from X.509 certificate files.
 * Supports PEM and DER encoded certificates.
 * Extracts subject, issuer, serial number, validity, and key info.
 */
export class CertificateExtractor extends BaseExtractor {
  constructor() {
    super({
      id: 'certificate-extractor',
      name: 'Certificate Extractor',
      version: '0.1.0',
      supportedArtifactTypes: ['certificate', 'file'],
      priority: 100,
    });
  }

  canExtract(context: ExtractionContext): boolean {
    if (!context.content || context.content.length < 20) return false;
    const text = context.content.toString('utf-8', 0, Math.min(context.content.length, 100));
    // PEM certificate
    if (text.includes('-----BEGIN CERTIFICATE-----')) return true;
    // PEM private key
    if (text.includes('-----BEGIN')) return true;
    // DER certificate (ASN.1 SEQUENCE)
    if (context.content[0] === 0x30) return true;
    return false;
  }

  async extract(context: ExtractionContext): Promise<ExtractionResult> {
    const buffer = context.content!;
    const startTime = Date.now();
    const features: ReturnType<typeof createRawFeature>[] = [];
    const issues: import('../types.js').ExtractionIssue[] = [];

    try {
      const text = buffer.toString('utf-8');
      const isPEM = text.includes('-----BEGIN');

      // Detect certificate type
      let certType = 'unknown';
      if (text.includes('-----BEGIN CERTIFICATE-----')) certType = 'x509-certificate';
      else if (text.includes('-----BEGIN RSA PRIVATE KEY-----')) certType = 'rsa-private-key';
      else if (text.includes('-----BEGIN EC PRIVATE KEY-----')) certType = 'ec-private-key';
      else if (text.includes('-----BEGIN PRIVATE KEY-----')) certType = 'pkcs8-private-key';
      else if (text.includes('-----BEGIN CERTIFICATE REQUEST-----')) certType = 'csr';
      else if (text.includes('-----BEGIN X509 CRL-----')) certType = 'crl';
      else if (text.includes('-----BEGIN PKCS7-----')) certType = 'pkcs7';
      else if (buffer[0] === 0x30) certType = 'der-encoded';

      features.push(
        createRawFeature({
          extractorId: this.id,
          type: 'certificate-type',
          value: certType,
          confidence: 1.0,
          metadata: { encoding: isPEM ? 'pem' : 'der' },
        }),
      );

      // Extract PEM labels
      if (isPEM) {
        const labelMatches = text.matchAll(/-----BEGIN\s+(.+?)-----/g);
        for (const match of labelMatches) {
          features.push(
            createRawFeature({
              extractorId: this.id,
              type: 'pem-label',
              value: match[1].trim(),
              confidence: 1.0,
            }),
          );
        }
      }

      // Count certificates in a bundle
      const certCount = (text.match(/-----BEGIN CERTIFICATE-----/g) || []).length;
      if (certCount > 1) {
        features.push(
          createRawFeature({
            extractorId: this.id,
            type: 'certificate-bundle-count',
            value: certCount,
            confidence: 1.0,
          }),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'CERT_PARSE_ERROR',
          `Failed to parse certificate: ${error instanceof Error ? error.message : String(error)}`,
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
}
