/**
 * Suspicious API Patterns Knowledge Pack.
 *
 * Production-quality pack containing deterministic knowledge about
 * Windows API call patterns commonly associated with malicious behavior.
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
    id: 'process-injection-apis',
    name: 'Process Injection API Pattern',
    description:
      'The classic process injection API sequence: OpenProcess, VirtualAllocEx, WriteProcessMemory, CreateRemoteThread. This combination in user-mode code is highly indicative of injection behavior.',
    category: 'suspicious-apis',
    severity: 'high',
    tags: ['injection', 'apis', 'process', 'remote-thread', 'win32'],
    behavior:
      'A sequence of Windows API calls that allocates memory in a remote process (VirtualAllocEx), writes code into that memory (WriteProcessMemory), and executes it (CreateRemoteThread or RtlCreateUserThread).',
    recommendedAction:
      'Monitor for cross-process memory operations. EDR rules should flag sequences of OpenProcess+VirtualAllocEx+WriteProcessMemory+CreateRemoteThread targeting processes like lsass.exe, svchost.exe, or explorer.exe.',
    indicators: [
      {
        type: 'api-call',
        value: 'OpenProcess',
        confidence: 0.3,
        description: 'Process handle opening (first step of injection)',
      },
      {
        type: 'api-call',
        value: 'VirtualAllocEx',
        confidence: 0.6,
        description: 'Remote memory allocation (injection indicator)',
      },
      {
        type: 'api-call',
        value: 'WriteProcessMemory',
        confidence: 0.6,
        description: 'Remote memory write (injection indicator)',
      },
      {
        type: 'api-call',
        value: 'CreateRemoteThread',
        confidence: 0.7,
        description: 'Remote thread creation (injection indicator)',
      },
      {
        type: 'api-call',
        value: 'RtlCreateUserThread',
        confidence: 0.7,
        description: 'NT API remote thread creation',
      },
      {
        type: 'api-call',
        value: 'NtCreateThreadEx',
        confidence: 0.6,
        description: 'NT API thread creation in remote process',
      },
      {
        type: 'api-call',
        value: 'QueueUserAPC',
        confidence: 0.5,
        description: 'APC injection (alternate injection method)',
      },
    ],
    references: [
      {
        label: 'MITRE ATT&CK T1055',
        url: 'https://attack.mitre.org/techniques/T1055/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1055.001', 'T1055.012', 'T1055.004'],
    relatedEntries: ['credential-access-apis', 'anti-debug-apis'],
  }),
  entry({
    id: 'credential-access-apis',
    name: 'Credential Access API Pattern',
    description:
      'Windows APIs commonly used to access LSASS process memory for credential dumping, including MiniDumpWriteDump, OpenProcess targeting lsass.exe, and security token manipulation.',
    category: 'suspicious-apis',
    severity: 'high',
    tags: ['credentials', 'apis', 'lsass', 'dumping', 'win32', 'security'],
    behavior:
      'Accesses the Local Security Authority Subsystem Service (LSASS) process to extract credential material. Common techniques include using MiniDumpWriteDump to dump LSASS memory or using comsvcs.dll Minidump function.',
    recommendedAction:
      'Monitor calls to MiniDumpWriteDump targeting lsass.exe. Monitor OpenProcess with PROCESS_VM_READ access on lsass.exe (Event ID 4663). Enable LSASS protection (RunAsPPL).',
    indicators: [
      {
        type: 'api-call',
        value: 'MiniDumpWriteDump',
        confidence: 0.7,
        description: 'Memory dump API (LSASS dumping)',
      },
      {
        type: 'api-call',
        value: 'OpenProcess',
        confidence: 0.2,
        description: 'Process open (when targeting lsass.exe)',
      },
      {
        type: 'api-call',
        value: 'SeDebugPrivilege',
        confidence: 0.5,
        description: 'Debug privilege (required for process access)',
      },
      {
        type: 'api-call',
        value: 'AdjustTokenPrivileges',
        confidence: 0.3,
        description: 'Privilege adjustment API',
      },
    ],
    references: [
      {
        label: 'MITRE ATT&CK T1003.001',
        url: 'https://attack.mitre.org/techniques/T1003/001/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1003.001', 'T1003.002', 'T1003.004'],
    relatedEntries: ['process-injection-apis', 'anti-debug-apis'],
  }),
  entry({
    id: 'anti-debug-apis',
    name: 'Anti-Debugging API Pattern',
    description:
      'Windows APIs commonly used to detect debuggers or sandbox environments. Their presence in a binary is a strong indicator of anti-analysis techniques.',
    category: 'suspicious-apis',
    severity: 'medium',
    tags: ['anti-debug', 'apis', 'anti-analysis', 'evasion', 'win32'],
    behavior:
      'Uses API calls to detect debugging: IsDebuggerPresent, CheckRemoteDebuggerPresent, NtQueryInformationProcess (ProcessDebugPort/ProcessDebugFlags), NtSetInformationThread (ThreadHideFromDebugger), or timing checks via QueryPerformanceCounter / rdtsc.',
    recommendedAction:
      'Presence of anti-debug APIs is suspicious. Investigate samples that combine multiple anti-debug checks with other malicious indicators. Use sandbox environments that bypass common anti-debug checks.',
    indicators: [
      {
        type: 'api-call',
        value: 'IsDebuggerPresent',
        confidence: 0.7,
        description: 'Debugger detection API',
      },
      {
        type: 'api-call',
        value: 'CheckRemoteDebuggerPresent',
        confidence: 0.7,
        description: 'Remote debugger detection',
      },
      {
        type: 'api-call',
        value: 'NtQueryInformationProcess',
        confidence: 0.5,
        description: 'Process info query (used for debug checks)',
      },
      {
        type: 'api-call',
        value: 'NtSetInformationThread',
        confidence: 0.5,
        description: 'Thread info set (hide from debugger)',
      },
      {
        type: 'api-call',
        value: 'OutputDebugStringA',
        confidence: 0.4,
        description: 'Debug output API (test if debugger present)',
      },
      {
        type: 'api-call',
        value: 'CloseHandle',
        confidence: 0.2,
        description: 'Handle close (INVALID_HANDLE_VALUE anti-debug)',
      },
    ],
    references: [
      {
        label: 'MITRE ATT&CK T1622',
        url: 'https://attack.mitre.org/techniques/T1622/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1622', 'T1497'],
    relatedEntries: ['process-injection-apis', 'anti-vm-apis'],
  }),
  entry({
    id: 'anti-vm-apis',
    name: 'Anti-VM / Sandbox Detection API Pattern',
    description:
      'Windows APIs used to detect virtualized or sandboxed environments. Malware uses these to avoid analysis by not exhibiting malicious behavior in monitored environments.',
    category: 'suspicious-apis',
    severity: 'medium',
    tags: ['anti-vm', 'apis', 'anti-analysis', 'sandbox', 'evasion'],
    behavior:
      'Detects virtualization by checking for VM artifacts via registry queries, WMI queries (Win32_ComputerSystem, Win32_BIOS), hardware checks (cpuid hypervisor bit), specific device names, or MAC address prefixes associated with VM vendors.',
    recommendedAction:
      'Presence of VM detection APIs suggests the binary modifies behavior based on the execution environment. Combined with other indicators, this is highly suspicious.',
    indicators: [
      {
        type: 'api-call',
        value: 'cpuid',
        confidence: 0.4,
        description: 'CPU identification instruction (hypervisor bit check)',
      },
      {
        type: 'api-call',
        value: 'GetSystemFirmwareTable',
        confidence: 0.3,
        description: 'Firmware table query (VM detection)',
      },
    ],
    references: [
      {
        label: 'MITRE ATT&CK T1497.001',
        url: 'https://attack.mitre.org/techniques/T1497/001/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1497.001', 'T1497.002'],
    relatedEntries: ['anti-debug-apis', 'process-injection-apis'],
  }),
  entry({
    id: 'code-injection-apis',
    name: 'Code Injection API Pattern',
    description:
      'Windows APIs used for code injection, including memory allocation with RWX permissions, thread context manipulation, and asynchronous procedure call injection.',
    category: 'suspicious-apis',
    severity: 'high',
    tags: ['injection', 'apis', 'code-execution', 'win32', 'memory'],
    behavior:
      'Creates executable memory with read-write-execute permissions (VirtualAlloc with PAGE_EXECUTE_READWRITE), writes shellcode, and executes it via thread creation, context modification, or APC injection.',
    recommendedAction:
      'Monitor for VirtualAlloc with PAGE_EXECUTE_READWRITE (0x40). Investigate memory regions with both write and execute permissions. Alert on SetThreadContext calls targeting remote processes.',
    indicators: [
      {
        type: 'api-call',
        value: 'VirtualAlloc',
        confidence: 0.4,
        description: 'Memory allocation (especially with RWX)',
      },
      {
        type: 'api-call',
        value: 'VirtualProtect',
        confidence: 0.4,
        description: 'Memory protection change (to executable)',
      },
      {
        type: 'api-call',
        value: 'SetThreadContext',
        confidence: 0.6,
        description: 'Thread context modification (injection via context)',
      },
      {
        type: 'api-call',
        value: 'GetThreadContext',
        confidence: 0.4,
        description: 'Thread context retrieval',
      },
      {
        type: 'api-call',
        value: 'NtGetContextThread',
        confidence: 0.5,
        description: 'NT API thread context retrieval',
      },
    ],
    references: [
      {
        label: 'MITRE ATT&CK T1055',
        url: 'https://attack.mitre.org/techniques/T1055/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1055.001', 'T1055.012', 'T1055.004'],
    relatedEntries: ['process-injection-apis', 'anti-debug-apis'],
  }),
  entry({
    id: 'persistence-apis',
    name: 'Persistence API Pattern',
    description:
      'Windows APIs and registry operations used to establish persistence through service creation, registry modification, scheduled task creation, and startup folder manipulation.',
    category: 'suspicious-apis',
    severity: 'medium',
    tags: ['persistence', 'apis', 'registry', 'services', 'startup'],
    behavior:
      'Creates or modifies Windows services (CreateService, ChangeServiceConfig), edits registry Run keys, creates scheduled tasks (SchRpcRegisterTask), or copies files to startup directories.',
    recommendedAction:
      'Monitor for CreateService calls from non-installer processes. Flag registry modifications to Run keys from unexpected sources. Alert on SchRpcRegisterTask calls creating persistent tasks.',
    indicators: [
      {
        type: 'api-call',
        value: 'CreateService',
        confidence: 0.5,
        description: 'Windows service creation',
      },
      {
        type: 'api-call',
        value: 'ChangeServiceConfig',
        confidence: 0.4,
        description: 'Service configuration modification',
      },
      {
        type: 'api-call',
        value: 'SchRpcRegisterTask',
        confidence: 0.5,
        description: 'Scheduled task registration',
      },
      {
        type: 'api-call',
        value: 'CopyFile',
        confidence: 0.2,
        description: 'File copy (for startup folder persistence)',
      },
    ],
    references: [
      {
        label: 'MITRE ATT&CK TA0003',
        url: 'https://attack.mitre.org/tactics/TA0003/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1547.001', 'T1543.003', 'T1053.005'],
    relatedEntries: ['process-injection-apis', 'anti-debug-apis'],
  }),
  entry({
    id: 'network-apis',
    name: 'Network Communication API Pattern',
    description:
      'Windows networking APIs commonly used for C2 communication, data exfiltration, and remote access. Including Winsock API calls, URL download functions, and HTTP-based APIs.',
    category: 'suspicious-apis',
    severity: 'medium',
    tags: ['network', 'apis', 'c2', 'winsock', 'download', 'win32'],
    behavior:
      'Initializes Winsock (WSAStartup), creates sockets (socket), connects to remote hosts (connect/connectEx), sends data (send) and receives data (recv). May use URL download functions (URLDownloadToFile) or WinHTTP/WinINet APIs.',
    recommendedAction:
      'Network API usage is normal for many applications. Focus on unusual patterns: processes that do not normally access the network making socket calls, or connections to known malicious IPs.',
    indicators: [
      {
        type: 'api-call',
        value: 'WSAStartup',
        confidence: 0.1,
        description: 'Winsock initialization',
      },
      { type: 'api-call', value: 'socket', confidence: 0.15, description: 'Socket creation' },
      { type: 'api-call', value: 'connect', confidence: 0.2, description: 'Socket connect' },
      {
        type: 'api-call',
        value: 'URLDownloadToFile',
        confidence: 0.6,
        description: 'URL download API (malware download)',
      },
      {
        type: 'api-call',
        value: 'InternetOpen',
        confidence: 0.2,
        description: 'WinINet initialization',
      },
      {
        type: 'api-call',
        value: 'InternetConnect',
        confidence: 0.2,
        description: 'WinINet connection',
      },
      {
        type: 'api-call',
        value: 'HttpOpenRequest',
        confidence: 0.2,
        description: 'HTTP request creation',
      },
    ],
    references: [
      {
        label: 'MITRE ATT&CK T1071',
        url: 'https://attack.mitre.org/techniques/T1071/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1071.001', 'T1105', 'T1048'],
    relatedEntries: ['process-injection-apis', 'credential-access-apis'],
  }),
]);

export const SUSPICIOUS_APIS_PACK: KnowledgePack = Object.freeze({
  metadata: Object.freeze({
    id: 'suspicious-apis',
    name: 'Suspicious API Patterns',
    version: '1.0.0',
    description:
      'Windows API call patterns associated with malicious behavior including process injection, credential theft, anti-debugging, anti-VM, code injection, persistence, and network communication.',
    author: 'VERIS Team',
    license: 'UNLICENSED',
    source: 'https://github.com/p4inz-code/veris',
    checksum: '',
    categories: ['suspicious-apis'],
    tags: ['windows-api', 'system-calls', 'native-api', 'win32', 'injection', 'anti-debug'],
    supportedVerisVersion: '0.1.0',
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
    dependencies: [],
    references: [
      {
        label: 'Windows API Index',
        url: 'https://docs.microsoft.com/en-us/windows/win32/api/',
        source: 'microsoft',
      },
    ],
  }),
  entries: ENTRIES,
  contentHash: '',
});
