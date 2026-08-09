/**
 * EvidenceValueExtractor — extracts meaningful values from evidence metadata
 * for deep knowledge pack matching.
 *
 * Instead of matching only on evidence.type, this extractor pulls out:
 * - API names, DLL names, section names
 * - Compiler, certificate issuer/subject
 * - Packers, imports, resources, overlay info
 * - Timestamp anomalies, entry points, TLS callbacks
 * - Strings, file names, registry paths, network indicators
 * - Persistence methods, etc.
 *
 * This enables knowledge packs to match against real extracted values
 * rather than just evidence type strings.
 *
 * @module @veris/knowledge/packs/evidence-extractor
 */

/** A single extracted value for matching. */
export interface ExtractedValue {
  /** The type of indicator (matches KnowledgeIndicator.type). */
  readonly indicatorType: string;
  /** The extracted value to match against. */
  readonly value: string;
  /** Confidence in this extraction [0.0, 1.0]. */
  readonly confidence: number;
  /** Source evidence type that produced this value. */
  readonly sourceEvidenceType: string;
  /** Optional context about where this value came from. */
  readonly context?: string;
}

/**
 * EvidenceValueExtractor — extracts values from evidence metadata
 * for deterministic knowledge pack matching.
 */
export class EvidenceValueExtractor {
  /**
   * Extract matching values from evidence metadata.
   *
   * @param type - The evidence type (e.g., "pe-import", "pe-rwx-section")
   * @param category - The evidence category
   * @param metadata - The evidence metadata record
   * @returns Array of extracted values for matching
   */
  extract(
    type: string,
    category: string,
    metadata?: Readonly<Record<string, unknown>>,
  ): readonly ExtractedValue[] {
    const values: ExtractedValue[] = [];

    // Extract based on evidence type
    this.extractFromType(type, category, metadata, values);

    // Extract from metadata fields by pattern
    if (metadata) {
      this.extractFromMetadata(metadata, values, type);
    }

    return Object.freeze(values);
  }

  /**
   * Extract values based on evidence type pattern.
   */
  private extractFromType(
    type: string,
    category: string,
    metadata: Readonly<Record<string, unknown>> | undefined,
    values: ExtractedValue[],
  ): void {
    // PE Import evidence
    if (type.startsWith('pe-') && category === 'behavior') {
      this.extractPEImportValues(metadata, values);
    }

    // PE format evidence
    if (type === 'pe-format') {
      this.extractPEFormatValues(metadata, values);
    }

    // PE section evidence
    if (type.includes('section') || type.includes('rwx')) {
      this.extractPESectionValues(metadata, values);
    }

    // PE packer evidence
    if (type === 'pe-packer') {
      this.extractPackerValues(metadata, values);
    }

    // PE compiler evidence
    if (type === 'pe-compiler') {
      this.extractCompilerValues(metadata, values);
    }

    // PE signature evidence
    if (type.startsWith('pe-signature') || type === 'pe-no-signature') {
      this.extractSignatureValues(metadata, values);
    }

    // PE resource evidence
    if (
      type.startsWith('pe-') &&
      (type.includes('resource') ||
        type.includes('embedded') ||
        type.includes('icon') ||
        type.includes('manifest'))
    ) {
      this.extractResourceValues(metadata, values);
    }

    // PE overlay evidence
    if (type.includes('overlay')) {
      this.extractOverlayValues(metadata, values);
    }

    // PE TLS evidence
    if (type.includes('tls')) {
      this.extractTLSValues(metadata, values);
    }

    // PE entry point evidence
    if (type.includes('entry-point')) {
      this.extractEntryPointValues(metadata, values);
    }

    // PE timestamp evidence
    if (type.includes('timestamp')) {
      this.extractTimestampValues(metadata, values);
    }

    // Import/string based evidence
    if (type === 'pe-import' || type === 'pe-dll-import' || type === 'string-literal') {
      this.extractStringAndImportValues(metadata, values, type);
    }
  }

  /**
   * Extract values from generic metadata fields.
   */
  private extractFromMetadata(
    metadata: Readonly<Record<string, unknown>>,
    values: ExtractedValue[],
    sourceType: string,
  ): void {
    // Extract API names from 'apis' or 'relatedImports' arrays
    const apis = metadata['apis'];
    if (Array.isArray(apis)) {
      for (const api of apis) {
        if (typeof api === 'string' && api.length > 0) {
          values.push({
            indicatorType: 'api-call',
            value: api,
            confidence: 0.8,
            sourceEvidenceType: sourceType,
            context: 'Extracted from metadata apis array',
          });
        }
      }
    }

    const relatedImports = metadata['relatedImports'];
    if (Array.isArray(relatedImports)) {
      for (const imp of relatedImports) {
        if (typeof imp === 'string' && imp.length > 0) {
          values.push({
            indicatorType: 'import-name',
            value: imp,
            confidence: 0.7,
            sourceEvidenceType: sourceType,
            context: 'Extracted from metadata relatedImports',
          });
        }
      }
    }

    // Extract DLL names from 'dlls' or 'dll' fields
    const dlls = metadata['dlls'];
    if (Array.isArray(dlls)) {
      for (const dll of dlls) {
        if (typeof dll === 'string' && dll.length > 0) {
          values.push({
            indicatorType: 'api-call',
            value: dll.toLowerCase(),
            confidence: 0.6,
            sourceEvidenceType: sourceType,
            context: 'Extracted from metadata dlls',
          });
        }
      }
    }

    const dll = metadata['dll'];
    if (typeof dll === 'string' && dll.length > 0) {
      values.push({
        indicatorType: 'import-name',
        value: dll.toLowerCase(),
        confidence: 0.6,
        sourceEvidenceType: sourceType,
        context: 'Extracted from metadata dll',
      });
    }

    // Extract section name
    const section = metadata['section'];
    if (typeof section === 'string' && section.length > 0) {
      values.push({
        indicatorType: 'section-name',
        value: section,
        confidence: 0.9,
        sourceEvidenceType: sourceType,
        context: 'Extracted from metadata section',
      });
    }

    // Extract names array
    const names = metadata['names'];
    if (Array.isArray(names)) {
      for (const name of names) {
        if (typeof name === 'string' && name.length > 0) {
          values.push({
            indicatorType: 'section-name',
            value: name,
            confidence: 0.6,
            sourceEvidenceType: sourceType,
            context: 'Extracted from metadata names',
          });
        }
      }
    }

    // Extract packer name
    const packer = metadata['packer'];
    if (typeof packer === 'string' && packer.length > 0) {
      values.push({
        indicatorType: 'string-pattern',
        value: packer,
        confidence: 0.9,
        sourceEvidenceType: sourceType,
        context: 'Packer name from metadata',
      });
    }

    // Extract compiler name
    const compiler = metadata['compiler'];
    if (typeof compiler === 'string' && compiler.length > 0) {
      values.push({
        indicatorType: 'feature-type',
        value: compiler,
        confidence: 0.8,
        sourceEvidenceType: sourceType,
        context: 'Compiler from metadata',
      });
    }

    // Extract certificate fields
    const issuer = metadata['issuer'];
    if (typeof issuer === 'string' && issuer.length > 0) {
      values.push({
        indicatorType: 'string-pattern',
        value: issuer,
        confidence: 0.7,
        sourceEvidenceType: sourceType,
        context: 'Certificate issuer',
      });
    }

    const subject = metadata['subject'];
    if (typeof subject === 'string' && subject.length > 0) {
      values.push({
        indicatorType: 'string-pattern',
        value: subject,
        confidence: 0.7,
        sourceEvidenceType: sourceType,
        context: 'Certificate subject',
      });
    }

    // Extract file/process names
    const fileName = metadata['fileName'] ?? metadata['filename'] ?? metadata['file'];
    if (typeof fileName === 'string' && fileName.length > 0) {
      values.push({
        indicatorType: 'file-name',
        value: fileName,
        confidence: 0.8,
        sourceEvidenceType: sourceType,
      });
    }

    const processName = metadata['processName'] ?? metadata['process'];
    if (typeof processName === 'string' && processName.length > 0) {
      values.push({
        indicatorType: 'process-name',
        value: processName,
        confidence: 0.8,
        sourceEvidenceType: sourceType,
      });
    }

    // Extract registry paths
    const registryKey = metadata['registryKey'] ?? metadata['registry'];
    if (typeof registryKey === 'string' && registryKey.length > 0) {
      values.push({
        indicatorType: 'registry-key',
        value: registryKey,
        confidence: 0.8,
        sourceEvidenceType: sourceType,
      });
    }

    // Extract URL/domain patterns
    const url = metadata['url'] ?? metadata['uri'];
    if (typeof url === 'string' && url.length > 0) {
      values.push({
        indicatorType: 'url-pattern',
        value: url,
        confidence: 0.8,
        sourceEvidenceType: sourceType,
      });
    }

    const domain = metadata['domain'] ?? metadata['host'];
    if (typeof domain === 'string' && domain.length > 0) {
      values.push({
        indicatorType: 'domain-name',
        value: domain,
        confidence: 0.7,
        sourceEvidenceType: sourceType,
      });
    }

    const ip = metadata['ip'] ?? metadata['ipAddress'];
    if (typeof ip === 'string' && ip.length > 0) {
      values.push({
        indicatorType: 'ip-address',
        value: ip,
        confidence: 0.8,
        sourceEvidenceType: sourceType,
      });
    }
  }

  private extractPEImportValues(
    metadata: Readonly<Record<string, unknown>> | undefined,
    values: ExtractedValue[],
  ): void {
    if (!metadata) return;

    const apis = metadata['apis'] as readonly string[] | undefined;
    if (Array.isArray(apis)) {
      for (const api of apis) {
        if (typeof api === 'string') {
          values.push({
            indicatorType: 'api-call',
            value: api,
            confidence: 0.85,
            sourceEvidenceType: 'pe-import',
            context: 'Suspicious API from PE import analysis',
          });
        }
      }
    }

    const dlls = metadata['dlls'] as Record<string, string> | undefined;
    if (dlls && typeof dlls === 'object') {
      for (const [api, dll] of Object.entries(dlls)) {
        values.push({
          indicatorType: 'import-name',
          value: api,
          confidence: 0.7,
          sourceEvidenceType: 'pe-import',
          context: `API from ${dll}`,
        });
      }
    }
  }

  private extractPEFormatValues(
    metadata: Readonly<Record<string, unknown>> | undefined,
    values: ExtractedValue[],
  ): void {
    if (!metadata) return;

    const machine = metadata['machine'];
    if (typeof machine === 'string') {
      values.push({
        indicatorType: 'feature-type',
        value: machine,
        confidence: 0.9,
        sourceEvidenceType: 'pe-format',
        context: 'PE machine type',
      });
    }

    const subsystem = metadata['subsystem'];
    if (typeof subsystem === 'string') {
      values.push({
        indicatorType: 'feature-type',
        value: subsystem,
        confidence: 0.7,
        sourceEvidenceType: 'pe-format',
        context: 'PE subsystem',
      });
    }
  }

  private extractPESectionValues(
    metadata: Readonly<Record<string, unknown>> | undefined,
    values: ExtractedValue[],
  ): void {
    if (!metadata) return;

    const section = metadata['section'];
    if (typeof section === 'string') {
      values.push({
        indicatorType: 'section-name',
        value: section,
        confidence: 0.95,
        sourceEvidenceType: 'pe-section',
        context: 'Section from PE section analysis',
      });
    }
  }

  private extractPackerValues(
    metadata: Readonly<Record<string, unknown>> | undefined,
    values: ExtractedValue[],
  ): void {
    if (!metadata) return;

    const packer = metadata['packer'];
    if (typeof packer === 'string') {
      values.push({
        indicatorType: 'string-pattern',
        value: packer,
        confidence: 0.95,
        sourceEvidenceType: 'pe-packer',
        context: 'Detected packer name',
      });
    }

    const signals = metadata['signals'] as readonly string[] | undefined;
    if (Array.isArray(signals)) {
      for (const signal of signals) {
        if (typeof signal === 'string') {
          values.push({
            indicatorType: 'feature-type',
            value: signal,
            confidence: 0.5,
            sourceEvidenceType: 'pe-packer',
            context: 'Packer detection signal',
          });
        }
      }
    }
  }

  private extractCompilerValues(
    metadata: Readonly<Record<string, unknown>> | undefined,
    values: ExtractedValue[],
  ): void {
    if (!metadata) return;

    const compiler = metadata['compiler'];
    if (typeof compiler === 'string') {
      values.push({
        indicatorType: 'feature-type',
        value: compiler,
        confidence: 0.9,
        sourceEvidenceType: 'pe-compiler',
        context: 'Identified compiler',
      });

      values.push({
        indicatorType: 'string-pattern',
        value: compiler,
        confidence: 0.7,
        sourceEvidenceType: 'pe-compiler',
        context: 'Compiler family string',
      });
    }
  }

  private extractSignatureValues(
    metadata: Readonly<Record<string, unknown>> | undefined,
    values: ExtractedValue[],
  ): void {
    if (!metadata) return;

    const certificateType = metadata['certificateType'];
    if (typeof certificateType === 'string') {
      values.push({
        indicatorType: 'string-pattern',
        value: certificateType,
        confidence: 0.7,
        sourceEvidenceType: 'pe-signature',
        context: 'Certificate type',
      });
    }

    // Extract issuer from raw bytes if present
    const rawBytes = metadata['rawBytes'];
    if (rawBytes && typeof rawBytes === 'string' && rawBytes.length > 10) {
      // Simple extraction: look for CN= patterns in the raw data
      const cnMatch = rawBytes.match(/CN=([^,\n\r]+)/);
      if (cnMatch) {
        values.push({
          indicatorType: 'string-pattern',
          value: cnMatch[1],
          confidence: 0.6,
          sourceEvidenceType: 'pe-signature',
          context: 'Certificate common name from raw bytes',
        });
      }
    }
  }

  private extractResourceValues(
    metadata: Readonly<Record<string, unknown>> | undefined,
    values: ExtractedValue[],
  ): void {
    if (!metadata) return;

    const resourceName = metadata['resourceName'];
    if (typeof resourceName === 'string') {
      values.push({
        indicatorType: 'string-pattern',
        value: resourceName,
        confidence: 0.7,
        sourceEvidenceType: 'pe-resource',
      });
    }

    const manifestText = metadata['manifestText'];
    if (typeof manifestText === 'string') {
      // Check for embedded executables or scripts in manifest
      if (
        manifestText.includes('requireAdministrator') ||
        manifestText.includes('highestAvailable')
      ) {
        values.push({
          indicatorType: 'feature-type',
          value: 'requireAdministrator',
          confidence: 0.9,
          sourceEvidenceType: 'pe-manifest',
          context: 'Manifest: requires admin privileges',
        });
      }
    }
  }

  private extractOverlayValues(
    metadata: Readonly<Record<string, unknown>> | undefined,
    values: ExtractedValue[],
  ): void {
    if (!metadata) return;

    const entropy = metadata['entropy'];
    if (typeof entropy === 'number') {
      if (entropy > 7.0) {
        values.push({
          indicatorType: 'feature-type',
          value: 'high-entropy-overlay',
          confidence: Math.min(1.0, (entropy - 7.0) / 1.0),
          sourceEvidenceType: 'pe-overlay',
          context: 'High entropy overlay data',
        });
      }
    }
  }

  private extractTLSValues(
    metadata: Readonly<Record<string, unknown>> | undefined,
    values: ExtractedValue[],
  ): void {
    if (!metadata) return;

    const callbackCount = metadata['callbackCount'];
    if (typeof callbackCount === 'number' && callbackCount > 0) {
      values.push({
        indicatorType: 'feature-type',
        value: `tls-callbacks:${callbackCount}`,
        confidence: 0.8,
        sourceEvidenceType: 'pe-tls',
        context: `${callbackCount} TLS callback(s)`,
      });
    }

    const callbacks = metadata['callbacks'] as readonly { address: string }[] | undefined;
    if (Array.isArray(callbacks)) {
      for (const cb of callbacks) {
        if (cb?.address) {
          values.push({
            indicatorType: 'string-pattern',
            value: `TLS_CB_${cb.address}`,
            confidence: 0.5,
            sourceEvidenceType: 'pe-tls',
          });
        }
      }
    }
  }

  private extractEntryPointValues(
    metadata: Readonly<Record<string, unknown>> | undefined,
    values: ExtractedValue[],
  ): void {
    if (!metadata) return;

    const section = metadata['section'];
    if (typeof section === 'string') {
      values.push({
        indicatorType: 'section-name',
        value: section,
        confidence: 0.8,
        sourceEvidenceType: 'pe-entry-point',
        context: 'Entry point section',
      });
    }

    const packer = metadata['packer'];
    if (typeof packer === 'string') {
      values.push({
        indicatorType: 'string-pattern',
        value: packer,
        confidence: 0.8,
        sourceEvidenceType: 'pe-entry-point',
        context: 'Entry point packer association',
      });
    }
  }

  private extractTimestampValues(
    metadata: Readonly<Record<string, unknown>> | undefined,
    values: ExtractedValue[],
  ): void {
    if (!metadata) return;

    const epochName = metadata['epochName'];
    if (typeof epochName === 'string') {
      values.push({
        indicatorType: 'feature-type',
        value: 'epoch-timestamp',
        confidence: 0.8,
        sourceEvidenceType: 'pe-timestamp',
        context: epochName,
      });
    }
  }

  private extractStringAndImportValues(
    metadata: Readonly<Record<string, unknown>> | undefined,
    values: ExtractedValue[],
    type: string,
  ): void {
    if (!metadata) return;

    // Extract any string values from specific known fields
    const valueFields = ['value', 'name', 'path', 'indicator'];
    for (const field of valueFields) {
      const val = metadata[field];
      if (typeof val === 'string' && val.length > 0) {
        values.push({
          indicatorType: type === 'pe-dll-import' ? 'import-name' : 'string-pattern',
          value: val,
          confidence: 0.7,
          sourceEvidenceType: type,
          context: `Extracted from metadata ${field}`,
        });
      }
    }

    const dllField = metadata['dll'];
    if (typeof dllField === 'string' && dllField.length > 0) {
      values.push({
        indicatorType: 'import-name',
        value: dllField.toLowerCase().replace('.dll', ''),
        confidence: 0.8,
        sourceEvidenceType: type,
        context: 'DLL name from import evidence',
      });
    }
  }
}

/** Singleton instance for convenience. */
export const defaultEvidenceExtractor = new EvidenceValueExtractor();
