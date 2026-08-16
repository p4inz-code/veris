/**
 * Persistence Mechanisms Knowledge Pack.
 *
 * Production-quality pack containing deterministic knowledge about
 * techniques and locations used by malware to maintain persistence.
 *
 * @module @veris/knowledge/packs/data
 */

import type { KnowledgePack, KnowledgeEntry } from '../types.js';

function entry(
  overrides: Partial<KnowledgeEntry> & {
    id: string;
    name: string;
    description: string;
    category: string;
    behavior: string;
    recommendedAction: string;
  },
): KnowledgeEntry {
  return Object.freeze({
    tags: [],
    severity: 'medium',
    indicators: [],
    references: [],
    mitreTechniques: [],
    relatedEntries: [],
    ...overrides,
  });
}

const ENTRIES: readonly KnowledgeEntry[] = Object.freeze([
  entry({
    id: 'registry-run-keys',
    name: 'Registry Run Keys',
    description:
      'Windows Registry Run keys are locations that automatically execute programs when a user logs in. These are the most common persistence mechanism used by malware and tools.',
    category: 'persistence',
    severity: 'high',
    tags: ['registry', 'run-keys', 'persistence', 'autorun', 'boot'],
    behavior:
      'Adds a registry value pointing to a malicious executable under Run or RunOnce keys. Executes at user logon. Common locations include HKCU and HKLM Software\\Microsoft\\Windows\\CurrentVersion\\Run.',
    recommendedAction:
      'Monitor registry Run key modifications via Sysmon Event ID 13 or Windows Audit policy. Investigate unexpected Run key entries pointing to non-Microsoft executables.',
    indicators: [
      {
        type: 'registry-key',
        value: 'Software\\Microsoft\\Windows\\CurrentVersion\\Run',
        confidence: 0.8,
        description: 'Default Run key location',
      },
      {
        type: 'registry-key',
        value: 'Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
        confidence: 0.7,
        description: 'RunOnce key location',
      },
      {
        type: 'registry-key',
        value: 'Software\\Microsoft\\Windows\\CurrentVersion\\RunServices',
        confidence: 0.7,
        description: 'RunServices key location',
      },
      {
        type: 'string-pattern',
        value: 'CurrentVersion\\Run',
        confidence: 0.6,
        description: 'Registry Run key pattern',
      },
    ],
    references: [
      {
        label: 'MITRE ATT&CK T1547.001',
        url: 'https://attack.mitre.org/techniques/T1547/001/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1547.001'],
    relatedEntries: ['startup-folder', 'scheduled-tasks', 'windows-services'],
  }),
  entry({
    id: 'startup-folder',
    name: 'Startup Folder',
    description:
      'The Windows Startup folder automatically executes shortcuts or executables placed inside it when a user logs in. Commonly abused for persistence by both malware and legitimate software.',
    category: 'persistence',
    severity: 'medium',
    tags: ['startup', 'folder', 'persistence', 'autorun', 'user'],
    behavior:
      "Copies a malicious executable or .lnk shortcut to the user or common Startup folder. Executes at user logon with the user's privileges.",
    recommendedAction:
      'Monitor file creation in Startup folders: %APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup and %PROGRAMDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup.',
    indicators: [
      {
        type: 'file-path',
        value: 'Startup\\',
        confidence: 0.6,
        description: 'Startup folder path',
      },
      {
        type: 'file-path',
        value: '\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\',
        confidence: 0.8,
        description: 'Windows Startup folder',
      },
    ],
    references: [
      {
        label: 'MITRE ATT&CK T1547.001',
        url: 'https://attack.mitre.org/techniques/T1547/001/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1547.001'],
    relatedEntries: ['registry-run-keys', 'scheduled-tasks'],
  }),
  entry({
    id: 'windows-services',
    name: 'Windows Service Persistence',
    description:
      'Windows services can be created or modified to execute malicious code automatically at system startup. Services run as SYSTEM, providing privilege escalation along with persistence.',
    category: 'persistence',
    severity: 'high',
    tags: ['services', 'persistence', 'system', 'lateral-movement'],
    behavior:
      'Creates a new Windows service (via sc.exe, CreateService API, or install utilities) that points to a malicious binary. The service is configured to start automatically on boot.',
    recommendedAction:
      'Monitor for new service creation (Event ID 7045). Investigate services with non-standard binary paths, unusual service names, or binaries in temp directories.',
    indicators: [
      {
        type: 'api-call',
        value: 'CreateService',
        confidence: 0.6,
        description: 'Windows service creation API',
      },
      {
        type: 'api-call',
        value: 'OpenSCManager',
        confidence: 0.4,
        description: 'Service control manager access',
      },
      {
        type: 'api-call',
        value: 'StartService',
        confidence: 0.4,
        description: 'Service start API',
      },
      {
        type: 'string-pattern',
        value: 'sc.exe',
        confidence: 0.5,
        description: 'Service Control command-line tool',
      },
      {
        type: 'process-name',
        value: 'sc.exe',
        confidence: 0.6,
        description: 'Service Control executable',
      },
    ],
    references: [
      {
        label: 'MITRE ATT&CK T1543.003',
        url: 'https://attack.mitre.org/techniques/T1543/003/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1543.003'],
    relatedEntries: ['registry-run-keys', 'scheduled-tasks', 'dll-hijacking'],
  }),
  entry({
    id: 'dll-hijacking',
    name: 'DLL Hijacking / Side-Loading',
    description:
      'DLL hijacking exploits the Windows DLL search order to load a malicious DLL instead of a legitimate one. DLL side-loading places a malicious DLL in the same directory as a trusted executable.',
    category: 'persistence',
    severity: 'high',
    tags: ['dll', 'hijacking', 'side-loading', 'persistence', 'defense-evasion'],
    behavior:
      'Places a malicious DLL in a directory where a trusted application will search for and load it. Common targets: WinSxS, application directories, or exploitation of missing DLLs via LoadLibrary calls.',
    recommendedAction:
      'Monitor for DLL load events via Sysmon Event ID 7. Pay attention to DLLs loaded from user-writable paths by privileged processes. Use safe DLL search mode.',
    indicators: [
      {
        type: 'api-call',
        value: 'LoadLibrary',
        confidence: 0.4,
        description: 'DLL loading API (common target)',
      },
      {
        type: 'api-call',
        value: 'LoadLibraryEx',
        confidence: 0.4,
        description: 'DLL loading API with flags',
      },
      {
        type: 'api-call',
        value: 'SetDllDirectory',
        confidence: 0.5,
        description: 'DLL search directory modification',
      },
      {
        type: 'file-path',
        value: '.dll',
        confidence: 0.2,
        description: 'DLL file (common indicator)',
      },
    ],
    references: [
      {
        label: 'MITRE ATT&CK T1574.001',
        url: 'https://attack.mitre.org/techniques/T1574/001/',
        source: 'mitre-attack',
      },
      {
        label: 'MITRE ATT&CK T1574.002',
        url: 'https://attack.mitre.org/techniques/T1574/002/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1574.001', 'T1574.002'],
    relatedEntries: ['windows-services', 'image-hijacking'],
  }),
  entry({
    id: 'image-hijacking',
    name: 'Image File Execution Options / Shim Hijacking',
    description:
      'Image File Execution Options (IFEO) and Application Compatibility Shim database can be abused to redirect process execution to malicious code, providing stealthy persistence.',
    category: 'persistence',
    severity: 'high',
    tags: ['ifeo', 'shim', 'hijacking', 'persistence', 'image-file'],
    behavior:
      'Sets Debugger value under IFEO registry key (HKLM\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options) to point to a malicious executable. When the targeted executable runs, the debugger (malware) executes instead.',
    recommendedAction:
      'Monitor IFEO registry key modifications. Investigate Debugger values set on common executables like sethc.exe, osk.exe, utilman.exe (accessibility features abused for backdoor access).',
    indicators: [
      {
        type: 'registry-key',
        value: 'Image File Execution Options',
        confidence: 0.8,
        description: 'IFEO registry key',
      },
      {
        type: 'registry-key',
        value: 'Debugger',
        confidence: 0.7,
        description: 'IFEO Debugger value (execution redirection)',
      },
      {
        type: 'registry-key',
        value: 'sethc.exe',
        confidence: 0.6,
        description: 'Sticky Keys accessibility tool (common abuse target)',
      },
      {
        type: 'registry-key',
        value: 'utilman.exe',
        confidence: 0.6,
        description: 'Utility Manager accessibility tool',
      },
    ],
    references: [
      {
        label: 'MITRE ATT&CC T1546.012',
        url: 'https://attack.mitre.org/techniques/T1546/012/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1546.012'],
    relatedEntries: ['dll-hijacking', 'registry-run-keys', 'com-hijacking'],
  }),
  entry({
    id: 'com-hijacking',
    name: 'COM Object Hijacking',
    description:
      'Component Object Model (COM) hijacking modifies COM registration entries to redirect COM object instantiation to malicious code. When a legitimate application creates the COM object, the malicious payload executes.',
    category: 'persistence',
    severity: 'high',
    tags: ['com', 'hijacking', 'persistence', 'registry', 'clsid'],
    behavior:
      'Modifies COM CLSID registry entries (InprocServer32, LocalServer32) to point to malicious DLLs or executables. Target commonly used COM objects for broad coverage.',
    recommendedAction:
      'Monitor COM registry modifications. Pay attention to CLSID changes in HKCU\\Software\\Classes\\CLSID. Investigate InprocServer32 path changes for known CLSIDs.',
    indicators: [
      {
        type: 'registry-key',
        value: 'CLSID',
        confidence: 0.5,
        description: 'COM class ID registry key',
      },
      {
        type: 'registry-key',
        value: 'InprocServer32',
        confidence: 0.6,
        description: 'COM in-process server key',
      },
      {
        type: 'registry-key',
        value: 'LocalServer32',
        confidence: 0.6,
        description: 'COM local server key',
      },
    ],
    references: [
      {
        label: 'MITRE ATT&CK T1546.015',
        url: 'https://attack.mitre.org/techniques/T1546/015/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1546.015'],
    relatedEntries: ['dll-hijacking', 'image-hijacking'],
  }),
  entry({
    id: 'bootkit-persistence',
    name: 'Bootkit / Bootloader Persistence',
    description:
      'Bootkit persistence modifies the Master Boot Record (MBR), Volume Boot Record (VBR), or UEFI firmware to execute malicious code before the operating system loads, providing high-stealth persistence.',
    category: 'persistence',
    severity: 'critical',
    tags: ['bootkit', 'mbr', 'uefi', 'persistence', 'rootkit', 'firmware'],
    behavior:
      'Modifies boot components to load malicious drivers or kernel modules before OS security mechanisms initialize. Examples include modifying the MBR to load a bootstrap payload that hooks disk I/O.',
    recommendedAction:
      'Bootkits require specialized detection. Use Secure Boot with measured boot. Monitor for unexpected MBR/VBR modifications. Use hardware-backed attestation. Reimage affected systems.',
    indicators: [
      {
        type: 'string-pattern',
        value: '\\\\.\\PhysicalDrive0',
        confidence: 0.4,
        description: 'Physical drive access (raw disk write)',
      },
      {
        type: 'api-call',
        value: 'WriteFile',
        confidence: 0.2,
        description: 'File write API (when targeting raw disk)',
      },
      {
        type: 'section-name',
        value: '.text',
        confidence: 0.2,
        description: 'Standard code section',
      },
    ],
    references: [
      {
        label: 'MITRE ATT&CK T1542.001',
        url: 'https://attack.mitre.org/techniques/T1542/001/',
        source: 'mitre-attack',
      },
      {
        label: 'MITRE ATT&CK T1542.003',
        url: 'https://attack.mitre.org/techniques/T1542/003/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1542.001', 'T1542.003'],
    relatedEntries: ['kernel-driver', 'windows-services'],
  }),
  entry({
    id: 'wmi-persistence',
    name: 'WMI Event Subscription Persistence',
    description:
      'Windows Management Instrumentation (WMI) event subscriptions can be used to execute arbitrary code when specific system events occur, providing a fileless persistence mechanism.',
    category: 'persistence',
    severity: 'high',
    tags: ['wmi', 'persistence', 'event-subscription', 'fileless', 'living-off-the-land'],
    behavior:
      'Creates WMI event filters and consumers that trigger on system events (logon, process start, timer). The consumer can execute scripts, commands, or binary payloads.',
    recommendedAction:
      'Monitor WMI permanent event subscriptions via Sysmon Event ID 19-21. Investigate suspicious __FilterToConsumerBinding instances. Use Autoruns to check WMI persistence.',
    indicators: [
      {
        type: 'string-pattern',
        value: '__EventFilter',
        confidence: 0.7,
        description: 'WMI event filter class',
      },
      {
        type: 'string-pattern',
        value: 'CommandLineEventConsumer',
        confidence: 0.8,
        description: 'WMI command execution consumer',
      },
      {
        type: 'string-pattern',
        value: 'ActiveScriptEventConsumer',
        confidence: 0.8,
        description: 'WMI script execution consumer',
      },
      {
        type: 'string-pattern',
        value: '__FilterToConsumerBinding',
        confidence: 0.7,
        description: 'WMI filter-consumer binding',
      },
    ],
    references: [
      {
        label: 'MITRE ATT&CK T1546.003',
        url: 'https://attack.mitre.org/techniques/T1546/003/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1546.003'],
    relatedEntries: ['registry-run-keys', 'scheduled-tasks', 'wmi-execution'],
  }),
]);

export const PERSISTENCE_PACK: KnowledgePack = Object.freeze({
  metadata: Object.freeze({
    id: 'persistence',
    name: 'Persistence Mechanisms',
    version: '1.0.0',
    description:
      'Windows persistence mechanisms including registry run keys, services, scheduled tasks, WMI subscriptions, DLL hijacking, COM hijacking, IFEO, bootkits, and startup folders.',
    author: 'VERIS Team',
    license: 'UNLICENSED',
    source: 'https://github.com/p4inz-code/veris',
    checksum: '',
    categories: ['persistence'],
    tags: ['persistence', 'registry', 'services', 'dll', 'wmi', 'bootkit', 'autorun'],
    supportedVerisVersion: '0.1.0',
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
    dependencies: [],
    references: [
      {
        label: 'MITRE ATT&CK Persistence',
        url: 'https://attack.mitre.org/tactics/TA0003/',
        source: 'mitre-attack',
      },
    ],
  }),
  entries: ENTRIES,
  contentHash: '',
});
