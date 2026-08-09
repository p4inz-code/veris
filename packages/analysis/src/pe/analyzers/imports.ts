/**
 * PE Import Analysis — analyzes import tables and detects suspicious API combinations.
 *
 * Detects:
 * - Import grouping by category (memory, network, registry, process, etc.)
 * - Suspicious API combinations (e.g., VirtualAlloc + WriteProcessMemory + CreateRemoteThread)
 * - PowerShell spawning indicators
 * - Known malicious API patterns
 *
 * @module @veris/analysis/pe/analyzers/imports
 */

import { SUSPICIOUS_APIS, SUSPICIOUS_DLLS } from '../constants.js';
import type { PEParsed, PEImport } from '../types.js';

export interface ImportFinding {
  readonly type: string;
  readonly severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  readonly explanation: string;
  readonly confidence: number;
  readonly metadata: Record<string, unknown>;
  readonly relatedImports: readonly string[];
}

/** Group imports by functional category. */
export interface ImportGroup {
  readonly category: string;
  readonly imports: readonly PEImport[];
  readonly count: number;
}

/** Analyze imports and detect suspicious combinations. */
export function analyzeImports(pe: PEParsed): {
  readonly findings: readonly ImportFinding[];
  readonly groups: readonly ImportGroup[];
} {
  const findings: ImportFinding[] = [];
  const groups: ImportGroup[] = [];
  const allImports = pe.imports;

  if (allImports.length === 0) {
    return { findings: Object.freeze([]), groups: Object.freeze([]) };
  }

  // Group by DLL
  const byDll = new Map<string, PEImport[]>();
  for (const imp of allImports) {
    const list = byDll.get(imp.dll) ?? [];
    list.push(imp);
    byDll.set(imp.dll, list);
  }

  // Group by category from SUSPICIOUS_APIS
  const apiToCategory = new Map<string, string>();
  for (const [category, apis] of SUSPICIOUS_APIS) {
    for (const api of apis) {
      apiToCategory.set(api.toLowerCase(), category);
    }
  }

  // Build groups
  const categoryImports = new Map<string, PEImport[]>();
  const normalImports: PEImport[] = [];

  for (const imp of allImports) {
    if (imp.name) {
      const category = apiToCategory.get(imp.name.toLowerCase());
      if (category) {
        const list = categoryImports.get(category) ?? [];
        list.push(imp);
        categoryImports.set(category, list);
      } else {
        normalImports.push(imp);
      }
    }
  }

  for (const [category, catImports] of categoryImports) {
    groups.push({
      category,
      imports: Object.freeze(catImports),
      count: catImports.length,
    });
  }

  // ── Suspicious API Combinations ──

  // Process injection: VirtualAllocEx + WriteProcessMemory + CreateRemoteThread
  if (
    hasApi(allImports, 'CreateRemoteThread') ||
    hasApi(allImports, 'NtCreateThreadEx') ||
    hasApi(allImports, 'RtlCreateUserThread')
  ) {
    if (hasApi(allImports, 'VirtualAllocEx') && hasApi(allImports, 'WriteProcessMemory')) {
      findings.push({
        type: 'pe-suspicious-process-injection',
        severity: 'high',
        explanation:
          'Process injection pattern detected: VirtualAllocEx + WriteProcessMemory + CreateRemoteThread — classic remote code injection in another process',
        confidence: 0.9,
        metadata: {
          apis: ['VirtualAllocEx', 'WriteProcessMemory', 'CreateRemoteThread'],
          dlls: findDllForApis(byDll, [
            'VirtualAllocEx',
            'WriteProcessMemory',
            'CreateRemoteThread',
          ]),
        },
        relatedImports: ['VirtualAllocEx', 'WriteProcessMemory', 'CreateRemoteThread'],
      });
    }
  }

  // Memory code execution: VirtualAlloc + VirtualProtect + GetProcAddress
  if (
    hasApi(allImports, 'VirtualAlloc') &&
    hasApi(allImports, 'VirtualProtect') &&
    hasApi(allImports, 'GetProcAddress')
  ) {
    findings.push({
      type: 'pe-suspicious-code-execution',
      severity: 'medium',
      explanation:
        'Memory code execution pattern: VirtualAlloc + VirtualProtect + GetProcAddress — allocate memory with executable permissions and resolve API addresses',
      confidence: 0.7,
      metadata: {
        apis: ['VirtualAlloc', 'VirtualProtect', 'GetProcAddress'],
      },
      relatedImports: ['VirtualAlloc', 'VirtualProtect', 'GetProcAddress'],
    });
  }

  // Credential dumping: MiniDumpWriteDump + OpenProcess
  if (hasApi(allImports, 'MiniDumpWriteDump') && hasApi(allImports, 'OpenProcess')) {
    findings.push({
      type: 'pe-suspicious-credential-dumping',
      severity: 'high',
      explanation:
        'Credential dumping pattern: MiniDumpWriteDump + OpenProcess — used to dump LSASS process memory for credential theft',
      confidence: 0.85,
      metadata: {
        apis: ['MiniDumpWriteDump', 'OpenProcess'],
      },
      relatedImports: ['MiniDumpWriteDump', 'OpenProcess'],
    });
  }

  // Process hollowing: CreateProcess + NtUnmapViewOfSection + WriteProcessMemory + SetThreadContext + ResumeThread
  if (hasApi(allImports, 'NtUnmapViewOfSection') || hasApi(allImports, 'ZwUnmapViewOfSection')) {
    if (hasApi(allImports, 'CreateProcess') && hasApi(allImports, 'WriteProcessMemory')) {
      findings.push({
        type: 'pe-suspicious-process-hollowing',
        severity: 'high',
        explanation:
          'Process hollowing pattern: CreateProcess + NtUnmapViewOfSection + WriteProcessMemory — unmaps legitimate process memory and replaces with malicious code',
        confidence: 0.85,
        metadata: {
          apis: ['CreateProcess', 'NtUnmapViewOfSection', 'WriteProcessMemory'],
        },
        relatedImports: ['CreateProcess', 'NtUnmapViewOfSection', 'WriteProcessMemory'],
      });
    }
  }

  // DSPawning: CreateProcess + ShellExecute + WinExec
  if (
    hasApi(allImports, 'CreateProcess') &&
    hasApi(allImports, 'ShellExecute') &&
    hasApi(allImports, 'WinExec')
  ) {
    findings.push({
      type: 'pe-suspicious-process-creation',
      severity: 'medium',
      explanation:
        'Multiple process creation APIs: CreateProcess + ShellExecute + WinExec — may be used for process execution and lateral movement',
      confidence: 0.6,
      metadata: {
        apis: ['CreateProcess', 'ShellExecute', 'WinExec'],
      },
      relatedImports: ['CreateProcess', 'ShellExecute', 'WinExec'],
    });
  }

  // PowerShell spawning: CreateProcess + ShellExecute (common for powershell -EncodedCommand)
  if (hasApi(allImports, 'ShellExecuteEx') || hasApi(allImports, 'CreateProcess')) {
    const hasPowerShellRef =
      byDll.has('powershell.dll') || hasDllImport(byDll, 'shell32.dll', 'ShellExecute');
    if (hasPowerShellRef) {
      findings.push({
        type: 'pe-powershell-spawning',
        severity: 'medium',
        explanation:
          'Process creation for PowerShell/lateral movement detected — may be used for download cradles or lateral movement',
        confidence: 0.5,
        metadata: {
          apis: ['ShellExecute', 'CreateProcess'],
        },
        relatedImports: ['ShellExecute', 'CreateProcess'],
      });
    }
  }

  // Anti-debugging
  const antiDebugApis = [
    'IsDebuggerPresent',
    'CheckRemoteDebuggerPresent',
    'NtQueryInformationProcess',
    'NtSetInformationThread',
    'OutputDebugStringA',
  ];
  const foundAntiDebug = antiDebugApis.filter((api) => hasApi(allImports, api));
  if (foundAntiDebug.length >= 2) {
    findings.push({
      type: 'pe-suspicious-anti-debugging',
      severity: 'medium',
      explanation: `Anti-debugging pattern: ${foundAntiDebug.join(', ')} — ${foundAntiDebug.length} debugger detection API(s) detected`,
      confidence: 0.7,
      metadata: { apis: foundAntiDebug },
      relatedImports: foundAntiDebug,
    });
  }

  // Network + download
  if (hasApi(allImports, 'URLDownloadToFile') || hasApi(allImports, 'URLDownloadToCacheFile')) {
    findings.push({
      type: 'pe-suspicious-url-download',
      severity: 'high',
      explanation:
        'URL download API detected: URLDownloadToFile — commonly used by malware to download additional payloads from remote servers',
      confidence: 0.8,
      metadata: { apis: ['URLDownloadToFile'] },
      relatedImports: ['URLDownloadToFile'],
    });
  }

  // Encrypt/Decrypt
  if (hasApi(allImports, 'CryptProtectData') && hasApi(allImports, 'CryptUnprotectData')) {
    findings.push({
      type: 'pe-suspicious-crypto-combination',
      severity: 'medium',
      explanation:
        'CryptProtectData + CryptUnprotectData — may be used for protecting stolen credential data',
      confidence: 0.5,
      metadata: { apis: ['CryptProtectData', 'CryptUnprotectData'] },
      relatedImports: ['CryptProtectData', 'CryptUnprotectData'],
    });
  }

  // Privilege escalation
  if (hasApi(allImports, 'AdjustTokenPrivileges') && hasApi(allImports, 'OpenProcessToken')) {
    findings.push({
      type: 'pe-suspicious-privilege-escalation',
      severity: 'high',
      explanation:
        'Privilege escalation pattern: AdjustTokenPrivileges + OpenProcessToken — used to enable SeDebugPrivilege for process manipulation',
      confidence: 0.75,
      metadata: { apis: ['AdjustTokenPrivileges', 'OpenProcessToken'] },
      relatedImports: ['AdjustTokenPrivileges', 'OpenProcessToken'],
    });
  }

  // Total import count
  if (allImports.length === 0) {
    findings.push({
      type: 'pe-no-imports',
      severity: 'medium',
      explanation:
        'No imports found — highly unusual for a Windows executable; may be packed, statically linked, or have obfuscated import table',
      confidence: 0.8,
      metadata: { importCount: 0 },
      relatedImports: [],
    });
  }

  return {
    findings: Object.freeze(findings),
    groups: Object.freeze(groups),
  };
}

function hasApi(imports: readonly PEImport[], name: string): boolean {
  const lower = name.toLowerCase();
  return imports.some((i) => i.name?.toLowerCase() === lower);
}

function hasDllImport(byDll: Map<string, PEImport[]>, dll: string, api: string): boolean {
  const lowerDll = dll.toLowerCase();
  const list = byDll.get(lowerDll);
  if (!list) return false;
  return list.some((i) => i.name?.toLowerCase() === api.toLowerCase());
}

function findDllForApis(byDll: Map<string, PEImport[]>, apis: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const api of apis) {
    for (const [dll, imps] of byDll) {
      if (imps.some((i) => i.name?.toLowerCase() === api.toLowerCase())) {
        result[api] = dll;
        break;
      }
    }
  }
  return result;
}
