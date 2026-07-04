/**
 * Import Analyzer — produces evidence from import features across all executable formats.
 *
 * @module @veris/analysis/analyzers/import-analyzer
 */

import { BaseAnalyzer } from '../base-analyzer.js';
import type { AnalysisContext, AnalysisResult } from '../types.js';

/** APIs commonly used for process injection and manipulation. */
const INJECTION_APIS = [
  'CreateRemoteThread',
  'OpenProcess',
  'VirtualAllocEx',
  'WriteProcessMemory',
  'NtCreateThreadEx',
  'NtWriteVirtualMemory',
  'NtAllocateVirtualMemory',
  'QueueUserAPC',
  'SetThreadContext',
  'GetThreadContext',
  'CreateToolhelp32Snapshot',
  'Process32First',
  'Process32Next',
  'OpenThread',
  'SuspendThread',
  'ResumeThread',
];

/** APIs commonly used for persistence. */
const PERSISTENCE_APIS = [
  'RegCreateKeyEx',
  'RegSetValueEx',
  'RegOpenKeyEx',
  'CreateService',
  'OpenSCManager',
  'StartService',
  'CreateProcess',
  'ShellExecute',
  'WinExec',
  'SHGetSpecialFolderPath',
];

/** APIs commonly used for anti-debugging. */
const ANTIDEBUG_APIS = [
  'IsDebuggerPresent',
  'CheckRemoteDebuggerPresent',
  'NtQueryInformationProcess',
  'OutputDebugString',
  'SetUnhandledExceptionFilter',
  'GetStartupInfo',
  'ZwQueryInformationProcess',
];

/** APIs commonly used for keylogging. */
const KEYLOGGING_APIS = [
  'SetWindowsHookEx',
  'GetAsyncKeyState',
  'GetForegroundWindow',
  'GetWindowText',
  'GetKeyState',
  'GetKeyboardState',
  'MapVirtualKey',
];

/** APIs commonly used for network communication. */
const NETWORK_APIS = [
  'socket',
  'connect',
  'send',
  'recv',
  'WSASocket',
  'WSAConnect',
  'WSASend',
  'WSARecv',
  'InternetOpen',
  'InternetConnect',
  'HttpOpenRequest',
  'HttpSendRequest',
  'URLDownloadToFile',
  'WinHttpOpen',
  'WinHttpConnect',
  'WinHttpOpenRequest',
  'WinHttpSendRequest',
];

/**
 * Analyzes import features and produces evidence about API usage patterns.
 */
export class ImportAnalyzer extends BaseAnalyzer {
  constructor() {
    super({
      id: 'import-analyzer',
      name: 'Import Analyzer',
      version: '0.1.0',
      supportedArtifactTypes: ['executable', 'file', 'binary-blob'],
      priority: 100,
    });
  }

  canAnalyze(context: AnalysisContext): boolean {
    return context.features.some(
      (f) => f.type === 'pe-import' || f.type === 'elf-symbol' || f.type === 'pe-dll-import',
    );
  }

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now();
    const evidenceList: import('../types.js').Evidence[] = [];
    const issues: import('../types.js').AnalysisIssue[] = [];

    try {
      // Collect all import names
      const apisFound = new Map<string, string[]>(); // api -> sources

      const importFeatures = context.features.filter(
        (f) => f.type === 'pe-import' || f.type === 'pe-dll-import' || f.type === 'elf-symbol',
      );

      for (const impf of importFeatures) {
        const imp = impf.value as Record<string, unknown>;
        if (imp.name) {
          const name = imp.name as string;
          const source = (imp.dll as string) ?? 'elf';
          if (!apisFound.has(name)) {
            apisFound.set(name, []);
          }
          apisFound.get(name)!.push(source);
        }
      }

      // Check for injection APIs
      const foundInjection = INJECTION_APIS.filter((api) => apisFound.has(api));
      if (foundInjection.length > 0) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'executable',
            'process-injection-apis',
            `Executable imports process injection APIs: ${foundInjection.join(', ')}`,
            {
              confidence: Math.min(1.0, 0.6 + foundInjection.length * 0.1),
              featureIds: importFeatures
                .filter((f) => {
                  const v = f.value as Record<string, unknown>;
                  return foundInjection.includes(v.name as string);
                })
                .map((f) => f.id),
              locations: [],
              metadata: { apis: foundInjection, category: 'injection' },
            },
          ),
        );
      }

      // Check for persistence APIs
      const foundPersistence = PERSISTENCE_APIS.filter((api) => apisFound.has(api));
      if (foundPersistence.length > 0) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'persistence',
            'persistence-apis',
            `Executable imports persistence APIs: ${foundPersistence.join(', ')}`,
            {
              confidence: Math.min(1.0, 0.5 + foundPersistence.length * 0.1),
              featureIds: importFeatures
                .filter((f) => {
                  const v = f.value as Record<string, unknown>;
                  return foundPersistence.includes(v.name as string);
                })
                .map((f) => f.id),
              locations: [],
              metadata: { apis: foundPersistence, category: 'persistence' },
            },
          ),
        );
      }

      // Check for anti-debugging APIs
      const foundAntidebug = ANTIDEBUG_APIS.filter((api) => apisFound.has(api));
      if (foundAntidebug.length > 0) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'executable',
            'antidebug-apis',
            `Executable imports anti-debugging APIs: ${foundAntidebug.join(', ')}`,
            {
              confidence: Math.min(1.0, 0.5 + foundAntidebug.length * 0.15),
              featureIds: importFeatures
                .filter((f) => {
                  const v = f.value as Record<string, unknown>;
                  return foundAntidebug.includes(v.name as string);
                })
                .map((f) => f.id),
              locations: [],
              metadata: { apis: foundAntidebug, category: 'antidebug' },
            },
          ),
        );
      }

      // Check for keylogging APIs
      const foundKeylog = KEYLOGGING_APIS.filter((api) => apisFound.has(api));
      if (foundKeylog.length >= 2) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'executable',
            'keylogging-apis',
            `Executable imports keylogging APIs: ${foundKeylog.join(', ')}`,
            {
              confidence: Math.min(1.0, 0.5 + foundKeylog.length * 0.1),
              featureIds: importFeatures
                .filter((f) => {
                  const v = f.value as Record<string, unknown>;
                  return foundKeylog.includes(v.name as string);
                })
                .map((f) => f.id),
              locations: [],
              metadata: { apis: foundKeylog, category: 'keylogging' },
            },
          ),
        );
      }

      // Check for network APIs
      const foundNetwork = NETWORK_APIS.filter((api) => apisFound.has(api));
      if (foundNetwork.length > 0) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'network',
            'network-apis',
            `Executable imports network communication APIs: ${foundNetwork.join(', ')}`,
            {
              confidence: 0.9,
              featureIds: importFeatures
                .filter((f) => {
                  const v = f.value as Record<string, unknown>;
                  return foundNetwork.includes(v.name as string);
                })
                .map((f) => f.id),
              locations: [],
              metadata: { apis: foundNetwork, category: 'network' },
            },
          ),
        );
      }

      // Log all DLL imports
      const dllImports = importFeatures.filter((f) => f.type === 'pe-dll-import');
      for (const df of dllImports) {
        const dll = (df.value as Record<string, unknown>).dll as string;
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'executable',
            'dll-import',
            `Executable imports ${dll}`,
            {
              confidence: 1.0,
              featureIds: [df.id],
              locations: df.location ? [df.location] : [],
              metadata: { dll },
            },
          ),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'IMPORT_ANALYSIS_ERROR',
          `Failed to analyze imports: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(evidenceList, { startTime, endTime, issues });
  }
}
