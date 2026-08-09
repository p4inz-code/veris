/**
 * Artifact Classification — detects artifact types from binary content.
 *
 * Determines:
 * - executable (PE, ELF, Mach-O)
 * - dll (PE DLLs)
 * - driver (Windows drivers, kernel modules)
 * - archive (zip, tar, gzip, 7z, rar)
 * - installer (MSI, NSIS, InnoSetup)
 * - script (Python, JavaScript, Shell, PowerShell)
 * - office document (DOCX, XLSX, PPTX, ODF)
 * - pdf
 * - image (PNG, JPEG, GIF, BMP)
 * - unknown
 *
 * @module @veris/analysis/pipeline/classification
 */

import { createHash } from 'node:crypto';

/** Artifact type classification. */
export interface ArtifactClassification {
  /** Primary artifact type. */
  readonly type: ArtifactType;
  /** More specific subtype (e.g., "pe-dll", "elf-executable"). */
  readonly subType: string;
  /** Detected MIME type. */
  readonly mimeType: string;
  /** Confidence in classification [0.0, 1.0]. */
  readonly confidence: number;
  /** File extension (if any). */
  readonly extension: string;
  /** Magic bytes that triggered the classification. */
  readonly magicBytes: string;
  /** Classification method used. */
  readonly method: ClassificationMethod;
}

/** High-level artifact type. */
export type ArtifactType =
  | 'executable'
  | 'dll'
  | 'driver'
  | 'archive'
  | 'installer'
  | 'script'
  | 'office-document'
  | 'pdf'
  | 'image'
  | 'certificate'
  | 'configuration'
  | 'text'
  | 'unknown';

/** Classification method. */
export type ClassificationMethod = 'magic-bytes' | 'extension' | 'content-analysis' | 'fallback';

/** Known magic bytes patterns. */
const MAGIC_PATTERNS: ReadonlyArray<{
  readonly offset: number;
  readonly bytes: readonly number[];
  readonly mask?: readonly number[];
  readonly type: ArtifactType;
  readonly subType: string;
  readonly mimeType: string;
  readonly name: string;
}> = Object.freeze([
  // PE executables
  {
    offset: 0,
    bytes: [0x4d, 0x5a],
    type: 'executable',
    subType: 'pe',
    mimeType: 'application/x-msdownload',
    name: 'PE',
  },
  // PE DLL (has IMAGE_FILE_DLL flag)
  {
    offset: 0,
    bytes: [0x4d, 0x5a],
    type: 'dll',
    subType: 'pe-dll',
    mimeType: 'application/x-msdownload',
    name: 'PE DLL',
  },
  // ELF
  {
    offset: 0,
    bytes: [0x7f, 0x45, 0x4c, 0x46],
    type: 'executable',
    subType: 'elf',
    mimeType: 'application/x-elf',
    name: 'ELF',
  },
  // Mach-O (32-bit)
  {
    offset: 0,
    bytes: [0xfe, 0xed, 0xfa, 0xce],
    type: 'executable',
    subType: 'macho',
    mimeType: 'application/x-mach-binary',
    name: 'Mach-O',
  },
  // Mach-O (64-bit)
  {
    offset: 0,
    bytes: [0xfe, 0xed, 0xfa, 0xcf],
    type: 'executable',
    subType: 'macho-64',
    mimeType: 'application/x-mach-binary',
    name: 'Mach-O 64',
  },
  // Mach-O (reverse 32)
  {
    offset: 0,
    bytes: [0xce, 0xfa, 0xed, 0xfe],
    type: 'executable',
    subType: 'macho',
    mimeType: 'application/x-mach-binary',
    name: 'Mach-O (reverse)',
  },
  // Mach-O (reverse 64)
  {
    offset: 0,
    bytes: [0xcf, 0xfa, 0xed, 0xfe],
    type: 'executable',
    subType: 'macho-64',
    mimeType: 'application/x-mach-binary',
    name: 'Mach-O 64 (reverse)',
  },
  // ZIP archives
  {
    offset: 0,
    bytes: [0x50, 0x4b, 0x03, 0x04],
    type: 'archive',
    subType: 'zip',
    mimeType: 'application/zip',
    name: 'ZIP',
  },
  // GZip
  {
    offset: 0,
    bytes: [0x1f, 0x8b],
    type: 'archive',
    subType: 'gzip',
    mimeType: 'application/gzip',
    name: 'GZip',
  },
  // 7z
  {
    offset: 0,
    bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c],
    type: 'archive',
    subType: '7z',
    mimeType: 'application/x-7z-compressed',
    name: '7-Zip',
  },
  // RAR
  {
    offset: 0,
    bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07],
    type: 'archive',
    subType: 'rar',
    mimeType: 'application/vnd.rar',
    name: 'RAR',
  },
  // BZip2
  {
    offset: 0,
    bytes: [0x42, 0x5a, 0x68],
    type: 'archive',
    subType: 'bzip2',
    mimeType: 'application/x-bzip2',
    name: 'BZip2',
  },
  // XZ
  {
    offset: 0,
    bytes: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00],
    type: 'archive',
    subType: 'xz',
    mimeType: 'application/x-xz',
    name: 'XZ',
  },
  // PDF
  {
    offset: 0,
    bytes: [0x25, 0x50, 0x44, 0x46],
    type: 'pdf',
    subType: 'pdf',
    mimeType: 'application/pdf',
    name: 'PDF',
  },
  // PNG
  {
    offset: 0,
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    type: 'image',
    subType: 'png',
    mimeType: 'image/png',
    name: 'PNG',
  },
  // JPEG
  {
    offset: 0,
    bytes: [0xff, 0xd8, 0xff],
    type: 'image',
    subType: 'jpeg',
    mimeType: 'image/jpeg',
    name: 'JPEG',
  },
  // GIF
  {
    offset: 0,
    bytes: [0x47, 0x49, 0x46],
    type: 'image',
    subType: 'gif',
    mimeType: 'image/gif',
    name: 'GIF',
  },
  // BMP
  {
    offset: 0,
    bytes: [0x42, 0x4d],
    type: 'image',
    subType: 'bmp',
    mimeType: 'image/bmp',
    name: 'BMP',
  },
  // MSI (Windows Installer)
  {
    offset: 0,
    bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
    type: 'installer',
    subType: 'msi',
    mimeType: 'application/x-msi',
    name: 'MSI',
  },
  // ELF shared object / library
  {
    offset: 0,
    bytes: [0x7f, 0x45, 0x4c, 0x46],
    type: 'dll',
    subType: 'elf-so',
    mimeType: 'application/x-elf',
    name: 'ELF SO',
  },
]);

/** File extension to type mapping. */
const EXTENSION_MAP: ReadonlyMap<string, ArtifactType> = new Map([
  ['.exe', 'executable'],
  ['.dll', 'dll'],
  ['.sys', 'driver'],
  ['.drv', 'driver'],
  ['.ocx', 'dll'],
  ['.cpl', 'dll'],
  ['.scr', 'executable'],
  ['.msi', 'installer'],
  ['.msp', 'installer'],
  ['.appx', 'installer'],
  ['.zip', 'archive'],
  ['.tar', 'archive'],
  ['.gz', 'archive'],
  ['.tgz', 'archive'],
  ['.bz2', 'archive'],
  ['.xz', 'archive'],
  ['.7z', 'archive'],
  ['.rar', 'archive'],
  ['.pdf', 'pdf'],
  ['.doc', 'office-document'],
  ['.docx', 'office-document'],
  ['.xls', 'office-document'],
  ['.xlsx', 'office-document'],
  ['.ppt', 'office-document'],
  ['.pptx', 'office-document'],
  ['.odt', 'office-document'],
  ['.ods', 'office-document'],
  ['.odp', 'office-document'],
  ['.py', 'script'],
  ['.js', 'script'],
  ['.ts', 'script'],
  ['.sh', 'script'],
  ['.bash', 'script'],
  ['.ps1', 'script'],
  ['.vbs', 'script'],
  ['.bat', 'script'],
  ['.cmd', 'script'],
  ['.pl', 'script'],
  ['.rb', 'script'],
  ['.php', 'script'],
  ['.png', 'image'],
  ['.jpg', 'image'],
  ['.jpeg', 'image'],
  ['.gif', 'image'],
  ['.bmp', 'image'],
  ['.ico', 'image'],
  ['.cfg', 'configuration'],
  ['.conf', 'configuration'],
  ['.ini', 'configuration'],
  ['.json', 'configuration'],
  ['.yaml', 'configuration'],
  ['.yml', 'configuration'],
  ['.xml', 'configuration'],
  ['.txt', 'text'],
  ['.md', 'text'],
  ['.log', 'text'],
]);

/**
 * Classify an artifact based on its content and metadata.
 */
export function classifyArtifact(content: Buffer | null, filePath: string): ArtifactClassification {
  // Extract extension
  const ext = extractExtension(filePath);

  // Method 1: Magic bytes (most reliable)
  if (content && content.length > 0) {
    const magicResult = classifyByMagicBytes(content);
    if (magicResult) {
      return magicResult;
    }
  }

  // Method 2: Extension-based classification
  if (ext) {
    const type = EXTENSION_MAP.get(ext.toLowerCase());
    if (type) {
      return Object.freeze({
        type,
        subType: ext.replace('.', ''),
        mimeType: extensionToMime(ext),
        confidence: type === 'script' ? 0.6 : 0.8,
        extension: ext,
        magicBytes: '',
        method: 'extension',
      });
    }
  }

  // Method 3: Content analysis for scripts
  if (content && content.length > 0) {
    const scriptResult = classifyByContent(content, ext ?? '');
    if (scriptResult) {
      return scriptResult;
    }
  }

  // Fallback
  return Object.freeze({
    type: 'unknown',
    subType: 'unknown',
    mimeType: 'application/octet-stream',
    confidence: 0.1,
    extension: ext,
    magicBytes: content && content.length > 0 ? content.slice(0, 8).toString('hex') : '',
    method: 'fallback',
  });
}

/**
 * Additional PE-specific classification for DLL vs executable.
 * Must be called after initial PE classification.
 */
export function refinePEClassification(
  content: Buffer,
  initial: ArtifactClassification,
): ArtifactClassification {
  if (content.length < 128) return initial;

  try {
    // Check PE characteristics for DLL flag (0x2000)
    const peOffset = content.readUInt32LE(0x3c);
    if (peOffset + 24 > content.length) return initial;
    const characteristics = content.readUInt16LE(peOffset + 22);

    const isDll = (characteristics & 0x2000) !== 0;
    const isDriver = (characteristics & 0x2000) !== 0 && initial.subType === 'pe';

    if (isDll && initial.type === 'executable') {
      return Object.freeze({
        ...initial,
        type: 'dll' as ArtifactType,
        subType: 'pe-dll',
        confidence: 0.95,
      });
    }

    return initial;
  } catch {
    return initial;
  }
}

function classifyByMagicBytes(content: Buffer): ArtifactClassification | null {
  for (const pattern of MAGIC_PATTERNS) {
    if (pattern.offset + pattern.bytes.length > content.length) continue;

    let matches = true;
    for (let i = 0; i < pattern.bytes.length; i++) {
      const mask = pattern.mask?.[i] ?? 0xff;
      if ((content[pattern.offset + i] & mask) !== (pattern.bytes[i] & mask)) {
        matches = false;
        break;
      }
    }

    if (matches) {
      const magicHex = content.slice(0, Math.min(8, content.length)).toString('hex');
      return Object.freeze({
        type: pattern.type,
        subType: pattern.subType,
        mimeType: pattern.mimeType,
        confidence: 0.95,
        extension: '',
        magicBytes: magicHex,
        method: 'magic-bytes',
      });
    }
  }

  return null;
}

function classifyByContent(content: Buffer, ext: string): ArtifactClassification | null {
  const head = content.slice(0, Math.min(512, content.length)).toString('utf-8').toLowerCase();

  // Shebang detection for scripts
  if (head.startsWith('#!')) {
    let subType = 'script';
    let confidence = 0.8;

    if (head.includes('python') || head.includes('python3')) {
      subType = 'python';
      confidence = 0.9;
    } else if (head.includes('bash') || head.includes('sh')) {
      subType = 'shell';
      confidence = 0.9;
    } else if (head.includes('node') || head.includes('nodejs')) {
      subType = 'javascript';
      confidence = 0.85;
    } else if (head.includes('ruby')) {
      subType = 'ruby';
      confidence = 0.85;
    } else if (head.includes('perl')) {
      subType = 'perl';
      confidence = 0.85;
    }

    return Object.freeze({
      type: 'script' as ArtifactType,
      subType,
      mimeType: `text/x-${subType}`,
      confidence,
      extension: ext,
      magicBytes: head.slice(0, 16),
      method: 'content-analysis',
    });
  }

  // XML/Office detection
  if (head.startsWith('<?xml')) {
    if (ext === '.docx' || ext === '.xlsx' || ext === '.pptx') {
      return Object.freeze({
        type: 'office-document' as ArtifactType,
        subType: ext.replace('.', ''),
        mimeType: `application/vnd.openxmlformats-officedocument`,
        confidence: 0.7,
        extension: ext,
        magicBytes: head.slice(0, 16),
        method: 'content-analysis',
      });
    }
  }

  return null;
}

function extractExtension(filePath: string): string {
  const idx = filePath.lastIndexOf('.');
  if (idx < 0) return '';
  return filePath.slice(idx).toLowerCase();
}

function extensionToMime(ext: string): string {
  const mimeMap: Record<string, string> = {
    '.exe': 'application/x-msdownload',
    '.dll': 'application/x-msdownload',
    '.sys': 'application/x-msdownload',
    '.msi': 'application/x-msi',
    '.zip': 'application/zip',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
    '.pdf': 'application/pdf',
    '.py': 'text/x-python',
    '.js': 'text/javascript',
    '.ts': 'text/typescript',
    '.sh': 'text/x-shellscript',
    '.ps1': 'text/x-powershell',
    '.bat': 'text/x-bat',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
  };
  return mimeMap[ext] ?? 'application/octet-stream';
}

/** Check if a type is considered an executable binary format. */
export function isExecutableType(type: ArtifactType): boolean {
  return type === 'executable' || type === 'dll' || type === 'driver';
}

/** Check if a type is a script format. */
export function isScriptType(type: ArtifactType): boolean {
  return type === 'script';
}

/** Check if a type is an archive format. */
export function isArchiveType(type: ArtifactType): boolean {
  return type === 'archive';
}

/** Check if a type requires binary parsing. */
export function requiresBinaryParsing(type: ArtifactType): boolean {
  return isExecutableType(type) || type === 'installer' || type === 'pdf';
}
