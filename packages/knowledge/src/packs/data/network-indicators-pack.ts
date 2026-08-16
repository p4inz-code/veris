/**
 * Network Indicators Knowledge Pack.
 *
 * Production-quality pack containing deterministic knowledge about
 * network-based indicators of compromise including C2 patterns,
 * domain generation algorithms, and anomalous connection behaviors.
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
    id: 'http-c2-beaconing',
    name: 'HTTP/HTTPS C2 Beaconing',
    description:
      'Command and control (C2) communication over HTTP/HTTPS is the most common C2 method. Beacons send periodic requests to C2 servers, often with distinctive timing and user-agent patterns.',
    category: 'network-indicators',
    severity: 'high',
    tags: ['c2', 'beaconing', 'http', 'https', 'network', 'command-control'],
    behavior:
      'Periodic HTTP requests to C2 infrastructure with consistent intervals (e.g., every 60 seconds). Uses custom user-agent strings, URL patterns (often api/, gateway/, /images/), and may include encrypted or encoded data in cookies, headers, or POST bodies.',
    recommendedAction:
      'Monitor for periodic outbound HTTP/HTTPS connections to unknown IPs. Analyze beacon intervals. Block known malicious C2 IPs and domains. Deploy network proxy with SSL inspection.',
    indicators: [
      {
        type: 'url-pattern',
        value: '/gateway.php',
        confidence: 0.5,
        description: 'Common C2 gateway pattern',
      },
      {
        type: 'url-pattern',
        value: '/api/',
        confidence: 0.3,
        description: 'API endpoint (common C2 path prefix)',
      },
      {
        type: 'url-pattern',
        value: '/images/',
        confidence: 0.3,
        description: 'Image path (C2 data exfiltration path)',
      },
      {
        type: 'string-pattern',
        value: 'Mozilla/5.0',
        confidence: 0.2,
        description: 'Common user-agent',
      },
    ],
    references: [
      {
        label: 'MITRE ATT&CK T1572',
        url: 'https://attack.mitre.org/techniques/T1572/',
        source: 'mitre-attack',
      },
      {
        label: 'MITRE ATT&CK T1071.001',
        url: 'https://attack.mitre.org/techniques/T1071/001/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1071.001', 'T1572', 'T1090'],
    relatedEntries: ['dns-c2', 'dga'],
  }),
  entry({
    id: 'dns-c2',
    name: 'DNS Tunneling / DNS C2',
    description:
      'DNS tunneling encodes data in DNS queries and responses to bypass network controls. Attackers use DNS as a C2 channel when HTTP/HTTPS is blocked or monitored.',
    category: 'network-indicators',
    severity: 'high',
    tags: ['dns', 'tunneling', 'c2', 'exfiltration', 'network'],
    behavior:
      'Encodes command data in DNS query subdomains and receives responses as DNS record values. Uses specific domain names controlled by attackers with TXT records carrying encoded payloads. Characterized by unusual DNS query patterns (long subdomains, high query volume, rare record types).',
    recommendedAction:
      'Monitor for DNS queries with unusually long subdomains, high query volume to single domains, or TXT record queries. Deploy DNS sinkholing. Block DNS queries to known DGA domains.',
    indicators: [
      {
        type: 'string-pattern',
        value: 'txt',
        confidence: 0.3,
        description: 'TXT record queries (used for C2 data)',
      },
      {
        type: 'domain-name',
        value: '.tk',
        confidence: 0.2,
        description: 'Free TLD often used in C2',
      },
      {
        type: 'domain-name',
        value: '.ml',
        confidence: 0.2,
        description: 'Free TLD often used in C2',
      },
      {
        type: 'domain-name',
        value: '.ga',
        confidence: 0.2,
        description: 'Free TLD often used in C2',
      },
      {
        type: 'domain-name',
        value: '.cf',
        confidence: 0.2,
        description: 'Free TLD often used in C2',
      },
    ],
    references: [
      {
        label: 'MITRE ATT&CK T1572',
        url: 'https://attack.mitre.org/techniques/T1572/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1572', 'T1048'],
    relatedEntries: ['http-c2-beaconing', 'dga'],
  }),
  entry({
    id: 'dga',
    name: 'Domain Generation Algorithms (DGA)',
    description:
      'Domain Generation Algorithms generate a large number of domain names algorithmically. Malware uses DGAs to find C2 infrastructure, making it difficult to block all domains.',
    category: 'network-indicators',
    severity: 'medium',
    tags: ['dga', 'domain', 'c2', 'algorithm', 'network'],
    behavior:
      'Generates domain names using deterministic algorithms (often based on date, seeds, or TLD lists). Malware attempts to resolve generated domains until it finds one registered by the attacker. DGA domains often have distinctive characteristics (length, entropy, character distribution).',
    recommendedAction:
      'Monitor for NXDOMAIN responses (many failed resolutions). Detect algorithmic domain patterns using entropy analysis. Use DNS sinkholing for known DGA families.',
    indicators: [
      {
        type: 'domain-name',
        value: '.top',
        confidence: 0.2,
        description: 'TLD common in DGA domains',
      },
      {
        type: 'domain-name',
        value: '.xyz',
        confidence: 0.2,
        description: 'TLD common in DGA domains',
      },
      {
        type: 'domain-name',
        value: '.club',
        confidence: 0.15,
        description: 'TLD common in DGA domains',
      },
    ],
    references: [
      {
        label: 'MITRE ATT&CK T1568.002',
        url: 'https://attack.mitre.org/techniques/T1568/002/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1568.002'],
    relatedEntries: ['dns-c2', 'http-c2-beaconing'],
  }),
  entry({
    id: 'data-exfiltration-http',
    name: 'Data Exfiltration over HTTP/HTTPS',
    description:
      'Data exfiltration over HTTP/HTTPS encodes stolen data in web requests to attacker-controlled servers, often disguised as normal web traffic.',
    category: 'network-indicators',
    severity: 'critical',
    tags: ['exfiltration', 'http', 'data-theft', 'network', 'c2'],
    behavior:
      'Encodes stolen data in HTTP parameters, cookies, headers, or POST bodies. Uses compression and encryption to avoid detection. May use staging (collecting data locally before batch exfiltration). High outbound data volume is a key indicator.',
    recommendedAction:
      'Monitor for anomalous outbound data volumes. Implement data loss prevention (DLP) solutions. Use network proxy with content inspection. Flag connections to new or rarely contacted external domains.',
    indicators: [
      {
        type: 'url-pattern',
        value: '/upload',
        confidence: 0.4,
        description: 'File upload endpoint',
      },
      {
        type: 'url-pattern',
        value: '/post',
        confidence: 0.3,
        description: 'POST endpoint (data exfiltration)',
      },
      { type: 'url-pattern', value: '/submit', confidence: 0.3, description: 'Submit endpoint' },
    ],
    references: [
      {
        label: 'MITRE ATT&CK T1048',
        url: 'https://attack.mitre.org/techniques/T1048/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1048', 'T1020', 'T1030'],
    relatedEntries: ['http-c2-beaconing', 'dns-c2'],
  }),
  entry({
    id: 'reverse-shell-network',
    name: 'Reverse Shell / Bind Shell Indicators',
    description:
      'Reverse shells connect from a compromised system back to an attacker, while bind shells open a listening port on the victim. Both provide remote interactive access.',
    category: 'network-indicators',
    severity: 'critical',
    tags: ['shell', 'reverse-shell', 'bind-shell', 'c2', 'remote-access', 'network'],
    behavior:
      'Reverse shell: victim initiates outbound connection to attacker, providing shell access. Bind shell: victim opens a listening port, attacker connects. Common ports: 443, 80, 8080, 4444, 31337, 1337.',
    recommendedAction:
      'Monitor for unexpected outbound connections from non-browser processes. Block outbound connections from suspicious processes. Monitor for unexpected listening ports. Restrict outbound traffic via firewall.',
    indicators: [
      {
        type: 'network-port',
        value: '4444',
        confidence: 0.5,
        description: 'Common reverse shell port',
      },
      {
        type: 'network-port',
        value: '1337',
        confidence: 0.5,
        description: 'Common reverse shell port (leet)',
      },
      {
        type: 'network-port',
        value: '31337',
        confidence: 0.6,
        description: 'Common reverse shell port (elite)',
      },
      {
        type: 'network-port',
        value: '8888',
        confidence: 0.3,
        description: 'Common reverse shell port',
      },
    ],
    references: [
      {
        label: 'MITRE ATT&CK T1059',
        url: 'https://attack.mitre.org/techniques/T1059/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1059', 'T1021'],
    relatedEntries: ['http-c2-beaconing'],
  }),
  entry({
    id: 'proxy-c2',
    name: 'Proxy / Redirector C2 Infrastructure',
    description:
      'Attackers use proxies, redirectors, and CDNs to hide their true C2 infrastructure, making takedown and blocking more difficult.',
    category: 'network-indicators',
    severity: 'medium',
    tags: ['proxy', 'redirector', 'c2', 'infrastructure', 'network', 'defense-evasion'],
    behavior:
      'C2 traffic flows through intermediate infrastructure: CDNs (Cloudflare), compromised WordPress sites acting as redirectors, or SOCKS proxies. This decouples the victim from the actual C2 server.',
    recommendedAction:
      'Look beyond the immediate destination IP. Use SSL/TLS certificate analysis to identify C2 patterns. Monitor JA3/JA3S fingerprinting for known C2 frameworks.',
    indicators: [
      {
        type: 'domain-name',
        value: 'cloudflare.com',
        confidence: 0.1,
        description: 'CDN service (can be used to hide C2)',
      },
      {
        type: 'url-pattern',
        value: '/wp-admin/',
        confidence: 0.3,
        description: 'WordPress admin path (compromised redirector)',
      },
    ],
    references: [
      {
        label: 'MITRE ATT&CK T1090',
        url: 'https://attack.mitre.org/techniques/T1090/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1090', 'T1572'],
    relatedEntries: ['http-c2-beaconing', 'dns-c2'],
  }),
  entry({
    id: 'p2p-c2',
    name: 'Peer-to-Peer (P2P) C2 Networks',
    description:
      'P2P C2 networks distribute command and control across many nodes without a single centralized server, making infrastructure takedown extremely difficult.',
    category: 'network-indicators',
    severity: 'high',
    tags: ['p2p', 'c2', 'decentralized', 'network', 'botnet'],
    behavior:
      'Nodes communicate with peers using custom P2P protocols over UDP/TCP. Commands propagate through the network. Examples include Sality, ZeroAccess, and GameOver Zeus P2P variants.',
    recommendedAction:
      'P2P C2 is difficult to detect at a single node. Look for anomalous peer-to-peer communication patterns. Use network flow analysis to detect P2P topology. Block known P2P C2 ports.',
    indicators: [
      {
        type: 'network-port',
        value: '6890',
        confidence: 0.4,
        description: 'GameOver Zeus P2P port',
      },
      {
        type: 'network-port',
        value: '1645',
        confidence: 0.3,
        description: 'Common P2P malware port',
      },
    ],
    references: [
      {
        label: 'MITRE ATT&CK T1572',
        url: 'https://attack.mitre.org/techniques/T1572/',
        source: 'mitre-attack',
      },
    ],
    mitreTechniques: ['T1572'],
    relatedEntries: ['http-c2-beaconing', 'dns-c2'],
  }),
]);

export const NETWORK_INDICATORS_PACK: KnowledgePack = Object.freeze({
  metadata: Object.freeze({
    id: 'network-indicators',
    name: 'Network Indicators',
    version: '1.0.0',
    description:
      'Network-based indicators of compromise including C2 beaconing patterns, DNS tunneling, domain generation algorithms, data exfiltration techniques, reverse shells, and proxy/redirector infrastructure.',
    author: 'VERIS Team',
    license: 'UNLICENSED',
    source: 'https://github.com/p4inz-code/veris',
    checksum: '',
    categories: ['network-indicators'],
    tags: ['network', 'c2', 'dga', 'dns', 'exfiltration', 'reverse-shell', 'p2p'],
    supportedVerisVersion: '0.1.0',
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z',
    dependencies: [],
    references: [
      {
        label: 'MITRE ATT&CK TA0011',
        url: 'https://attack.mitre.org/tactics/TA0011/',
        source: 'mitre-attack',
      },
    ],
  }),
  entries: ENTRIES,
  contentHash: '',
});
