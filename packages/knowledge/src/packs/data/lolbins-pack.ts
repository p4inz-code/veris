/**
 * Living-off-the-Land Binaries & Scripts Knowledge Pack.
 *
 * Production-quality pack containing verified knowledge about
 * legitimate system binaries and scripts commonly abused by attackers.
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
    id: 'powershell',
    name: 'PowerShell.exe',
    description:
      'PowerShell is a task automation and configuration management program. It is the most commonly abused LOLBin for executing arbitrary code, downloading payloads, and bypassing application whitelisting.',
    category: 'lolbins',
    severity: 'high',
    tags: ['powershell', 'scripting', 'execution', 'lolbin'],
    behavior:
      'Executes arbitrary PowerShell scripts and commands. Supports encoded commands, remote downloading, and in-memory execution. Can bypass execution policy and Constrained Language Mode.',
    recommendedAction:
      'Enforce Constrained Language Mode via AppLocker or WDAC. Monitor for suspicious PowerShell parameters (-EncodedCommand, -ExecutionPolicy Bypass). Limit PowerShell usage to administrative users.',
    indicators: [
      {
        type: 'process-name',
        value: 'powershell.exe',
        confidence: 0.7,
        description: 'PowerShell executable',
      },
      {
        type: 'string-pattern',
        value: '-EncodedCommand',
        confidence: 0.6,
        description: 'Encoded command parameter',
      },
      {
        type: 'string-pattern',
        value: '-ExecutionPolicy Bypass',
        confidence: 0.7,
        description: 'Execution policy bypass',
      },
      {
        type: 'string-pattern',
        value: '-WindowStyle Hidden',
        confidence: 0.6,
        description: 'Hidden window execution',
      },
      {
        type: 'string-pattern',
        value: '-NoProfile',
        confidence: 0.4,
        description: 'No profile loading',
      },
    ],
    references: [
      {
        label: 'LOLBAS PowerShell',
        url: 'https://lolbas-project.github.io/lolbas/Binaries/Powershell/',
        source: 'lolbas',
      },
      {
        label: 'MITRE ATT&CK T1059.001',
        url: 'https://attack.mitre.org/techniques/T1059/001/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1059.001'],
    relatedEntries: ['cmd', 'wscript', 'cscript'],
  }),
  entry({
    id: 'cmd',
    name: 'cmd.exe',
    description:
      'cmd.exe is the Windows command interpreter. While less capable than PowerShell, it is frequently used for basic command execution, batch scripts, and launching other tools in attacks.',
    category: 'lolbins',
    severity: 'medium',
    tags: ['cmd', 'command-prompt', 'execution', 'lolbin'],
    behavior:
      'Executes Windows commands and batch scripts. Commonly used to launch other tools, modify system settings, and establish initial execution footholds.',
    recommendedAction:
      'Monitor for cmd.exe spawned by suspicious parent processes (e.g., Microsoft Office, browsers). Review command-line arguments for encoded or obfuscated commands.',
    indicators: [
      {
        type: 'process-name',
        value: 'cmd.exe',
        confidence: 0.5,
        description: 'Windows command interpreter',
      },
    ],
    references: [
      {
        label: 'LOLBAS Cmd',
        url: 'https://lolbas-project.github.io/lolbas/Binaries/Cmd/',
        source: 'lolbas',
      },
      {
        label: 'MITRE ATT&CK T1059.003',
        url: 'https://attack.mitre.org/techniques/T1059/003/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1059.003'],
    relatedEntries: ['powershell', 'wscript', 'cscript'],
  }),
  entry({
    id: 'wscript',
    name: 'wscript.exe / cscript.exe',
    description:
      'Windows Script Host executables that execute VBScript and JScript files. Commonly abused to run malicious scripts that download and execute payloads.',
    category: 'lolbins',
    severity: 'medium',
    tags: ['wscript', 'cscript', 'vbscript', 'jscript', 'scripting', 'lolbin'],
    behavior:
      'Executes VBScript (.vbs) and JScript (.js) files. Can be used for file download, process execution, and persistence through scheduled tasks or startup folders.',
    recommendedAction:
      'Monitor for wscript.exe or cscript.exe spawning from Office applications. Review .vbs and .js file execution for suspicious content. Disable Windows Script Host if not needed.',
    indicators: [
      {
        type: 'process-name',
        value: 'wscript.exe',
        confidence: 0.6,
        description: 'Windows Script Host (GUI)',
      },
      {
        type: 'process-name',
        value: 'cscript.exe',
        confidence: 0.6,
        description: 'Windows Script Host (Console)',
      },
    ],
    references: [
      {
        label: 'LOLBAS Wscript',
        url: 'https://lolbas-project.github.io/lolbas/Binaries/Wscript/',
        source: 'lolbas',
      },
      {
        label: 'MITRE ATT&CK T1059.005',
        url: 'https://attack.mitre.org/techniques/T1059/005/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1059.005', 'T1059.007'],
    relatedEntries: ['powershell', 'cmd'],
  }),
  entry({
    id: 'rundll32',
    name: 'rundll32.exe',
    description:
      'rundll32.exe loads and executes DLLs. Commonly abused to execute arbitrary DLLs and JavaScript, often used for bypassing application whitelisting and for one-shot payload execution.',
    category: 'lolbins',
    severity: 'high',
    tags: ['rundll32', 'dll', 'execution', 'lolbin', 'defense-evasion'],
    behavior:
      'Loads a specified DLL and calls an exported function. Attackers abuse this to execute malicious DLLs, JavaScript (via url.dll), and to stage payloads via JavaScript execution.',
    recommendedAction:
      'Monitor for rundll32.exe executing non-Microsoft DLLs. Particularly monitor for JavaScript execution via url.dll (rundll32.exe javascript:).',
    indicators: [
      {
        type: 'process-name',
        value: 'rundll32.exe',
        confidence: 0.7,
        description: 'DLL execution host',
      },
      {
        type: 'string-pattern',
        value: 'javascript:',
        confidence: 0.9,
        description: 'JavaScript execution via rundll32',
      },
      {
        type: 'string-pattern',
        value: 'url.dll',
        confidence: 0.6,
        description: 'URL DLL often abused for JS execution',
      },
    ],
    references: [
      {
        label: 'LOLBAS Rundll32',
        url: 'https://lolbas-project.github.io/lolbas/Binaries/Rundll32/',
        source: 'lolbas',
      },
      {
        label: 'MITRE ATT&CK T1218.011',
        url: 'https://attack.mitre.org/techniques/T1218/011/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1218.011'],
    relatedEntries: ['regsvr32', 'mshta'],
  }),
  entry({
    id: 'regsvr32',
    name: 'regsvr32.exe',
    description:
      'regsvr32.exe registers and unregisters DLLs and ActiveX controls. Attackers abuse it to bypass application whitelisting and execute arbitrary code through COM registration.',
    category: 'lolbins',
    severity: 'high',
    tags: ['regsvr32', 'com', 'dll', 'execution', 'lolbin', 'whitelisting-bypass'],
    behavior:
      'Loads a DLL and calls its DllRegisterServer export. Can be used with "squiblydoo" technique to execute arbitrary code via COM Scriptlet URLs.',
    recommendedAction:
      'Monitor for regsvr32.exe execution with non-standard DLLs. Block regsvr32.exe from accessing the internet. Particularly monitor regsvr32 with .sct file references.',
    indicators: [
      {
        type: 'process-name',
        value: 'regsvr32.exe',
        confidence: 0.7,
        description: 'COM/DLL registration binary',
      },
      { type: 'string-pattern', value: '/s', confidence: 0.4, description: 'Silent mode flag' },
      {
        type: 'string-pattern',
        value: '/i:',
        confidence: 0.4,
        description: 'Install flag commonly used in abuse',
      },
      {
        type: 'string-pattern',
        value: '.sct',
        confidence: 0.7,
        description: 'Scriptlet file (squiblydoo technique)',
      },
    ],
    references: [
      {
        label: 'LOLBAS Regsvr32',
        url: 'https://lolbas-project.github.io/lolbas/Binaries/Regsvr32/',
        source: 'lolbas',
      },
      {
        label: 'MITRE ATT&CK T1218.010',
        url: 'https://attack.mitre.org/techniques/T1218/010/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1218.010'],
    relatedEntries: ['rundll32', 'mshta'],
  }),
  entry({
    id: 'mshta',
    name: 'mshta.exe',
    description:
      'mshta.exe executes Microsoft HTML Applications (HTA). Attackers abuse mshta to execute malicious JavaScript/VBScript within HTA files for initial access and payload delivery.',
    category: 'lolbins',
    severity: 'high',
    tags: ['mshta', 'hta', 'html-application', 'execution', 'lolbin', 'phishing'],
    behavior:
      'Executes HTML Application (.hta) files containing JavaScript or VBScript. Often delivered via phishing emails or drive-by downloads, executing in the context of the user.',
    recommendedAction:
      'Block .hta file execution via email attachments. Monitor for mshta.exe execution with URL or network references. Use AppLocker to restrict mshta.exe execution.',
    indicators: [
      {
        type: 'process-name',
        value: 'mshta.exe',
        confidence: 0.8,
        description: 'HTA execution binary',
      },
      {
        type: 'string-pattern',
        value: '.hta',
        confidence: 0.6,
        description: 'HTML Application file',
      },
    ],
    references: [
      {
        label: 'LOLBAS Mshta',
        url: 'https://lolbas-project.github.io/lolbas/Binaries/Mshta/',
        source: 'lolbas',
      },
      {
        label: 'MITRE ATT&CK T1218.005',
        url: 'https://attack.mitre.org/techniques/T1218/005/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1218.005'],
    relatedEntries: ['rundll32', 'regsvr32'],
  }),
  entry({
    id: 'certutil',
    name: 'certutil.exe',
    description:
      'certutil.exe is a Windows certificate utility that can be abused to download files, encode/decode data (commonly base64), and bypass application whitelisting.',
    category: 'lolbins',
    severity: 'medium',
    tags: ['certutil', 'download', 'encoding', 'lolbin', 'defense-evasion'],
    behavior:
      'Downloads files via URL. Encodes/decodes files using base64. Commonly used to download payloads from remote servers and decode them on the target system.',
    recommendedAction:
      'Monitor for certutil.exe with -urlcache or -split parameters. Block certutil.exe from accessing the internet except for CRL validation.',
    indicators: [
      {
        type: 'process-name',
        value: 'certutil.exe',
        confidence: 0.7,
        description: 'Certificate utility binary',
      },
      {
        type: 'string-pattern',
        value: '-urlcache',
        confidence: 0.8,
        description: 'URL cache parameter (file download)',
      },
      {
        type: 'string-pattern',
        value: '-split',
        confidence: 0.7,
        description: 'Split parameter for file download',
      },
      {
        type: 'string-pattern',
        value: '-encode',
        confidence: 0.5,
        description: 'Base64 encode parameter',
      },
      {
        type: 'string-pattern',
        value: '-decode',
        confidence: 0.5,
        description: 'Base64 decode parameter',
      },
    ],
    references: [
      {
        label: 'LOLBAS Certutil',
        url: 'https://lolbas-project.github.io/lolbas/Binaries/Certutil/',
        source: 'lolbas',
      },
      {
        label: 'MITRE ATT&CK T1140',
        url: 'https://attack.mitre.org/techniques/T1140/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1140', 'T1105'],
    relatedEntries: ['bitsadmin', 'powershell'],
  }),
  entry({
    id: 'bitsadmin',
    name: 'bitsadmin.exe',
    description:
      'Background Intelligent Transfer Service (BITS) admin tool. Attackers abuse BITSAdmin for file download, data staging, and maintaining persistence through BITS jobs.',
    category: 'lolbins',
    severity: 'medium',
    tags: ['bitsadmin', 'bits', 'download', 'persistence', 'lolbin'],
    behavior:
      'Creates BITS transfer jobs to download or upload files. Jobs can be configured to run programmatically upon completion, providing a stealthy persistence mechanism.',
    recommendedAction:
      'Monitor for BITSAdmin execution creating new transfer jobs. Investigate BITS jobs that execute programs upon completion. Block BITS transfers to unknown destinations.',
    indicators: [
      {
        type: 'process-name',
        value: 'bitsadmin.exe',
        confidence: 0.7,
        description: 'BITS admin binary',
      },
      {
        type: 'string-pattern',
        value: '/transfer',
        confidence: 0.7,
        description: 'BITS transfer parameter',
      },
      {
        type: 'string-pattern',
        value: '/addfile',
        confidence: 0.6,
        description: 'Add file to BITS job',
      },
      {
        type: 'string-pattern',
        value: '/SetNotifyCmdLine',
        confidence: 0.8,
        description: 'BITS job command execution',
      },
    ],
    references: [
      {
        label: 'LOLBAS Bitsadmin',
        url: 'https://lolbas-project.github.io/lolbas/Binaries/Bitsadmin/',
        source: 'lolbas',
      },
      {
        label: 'MITRE ATT&CK T1197',
        url: 'https://attack.mitre.org/techniques/T1197/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1197', 'T1105'],
    relatedEntries: ['certutil', 'powershell'],
  }),
]);

export const LOBINS_PACK: KnowledgePack = Object.freeze({
  metadata: Object.freeze({
    id: 'lolbins',
    name: 'Living-off-the-Land Binaries',
    version: '1.0.0',
    description:
      'Legitimate system binaries and scripts commonly abused by attackers for code execution, download, encoding, and persistence. Based on the LOLBAS project.',
    author: 'VERIS Team',
    license: 'UNLICENSED',
    source: 'https://github.com/p4inz-code/veris',
    checksum: '',
    categories: ['lolbins', 'living-off-the-land'],
    tags: ['lolbins', 'lolbas', 'living-off-the-land', 'execution', 'download', 'defense-evasion'],
    supportedVerisVersion: '0.1.0',
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
    dependencies: [],
    references: [
      { label: 'LOLBAS Project', url: 'https://lolbas-project.github.io/', source: 'lolbas' },
    ],
  }),
  entries: ENTRIES,
  contentHash: '',
});
