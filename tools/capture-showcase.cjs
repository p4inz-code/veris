const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const showcaseDir = path.resolve(__dirname, '../assets/showcase');
if (!fs.existsSync(showcaseDir)) {
  fs.mkdirSync(showcaseDir, { recursive: true });
}

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const tempDir = path.join(require('os').tmpdir(), 'veris-edge-showcase-' + Date.now());

function renderTerminalHtml(title, command, contentHtml, exitCode = null) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background-color: #0b0f14;
    font-family: 'Consolas', 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace;
    font-size: 13.5px;
    line-height: 1.45;
    color: #c9d1d9;
    padding: 24px;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
  }
  .terminal-window {
    width: 880px;
    background-color: #0d1117;
    border: 1px solid #30363d;
    border-radius: 10px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.65), 0 0 1px rgba(255, 255, 255, 0.1);
    overflow: hidden;
  }
  .terminal-header {
    background-color: #161b22;
    padding: 10px 16px;
    display: flex;
    align-items: center;
    border-bottom: 1px solid #21262d;
    user-select: none;
  }
  .traffic-lights {
    display: flex;
    gap: 8px;
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }
  .dot-red { background-color: #ff5f56; }
  .dot-yellow { background-color: #ffbd2e; }
  .dot-green { background-color: #27c93f; }
  .window-title {
    flex-grow: 1;
    text-align: center;
    font-size: 12px;
    color: #8b949e;
    font-weight: 500;
    margin-right: 48px;
  }
  .terminal-body {
    padding: 20px 24px;
    background-color: #0d1117;
  }
  .prompt-line {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 14px;
  }
  .prompt-user { color: #58a6ff; font-weight: bold; }
  .prompt-sep { color: #8b949e; }
  .prompt-path { color: #7ee787; }
  .prompt-char { color: #c9d1d9; font-weight: bold; }
  .prompt-cmd { color: #f0f6fc; font-weight: 600; }
  .terminal-content {
    color: #c9d1d9;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .cyan { color: #58a6ff; }
  .bright-cyan { color: #79c0ff; font-weight: bold; }
  .green { color: #7ee787; }
  .bright-green { color: #56d364; font-weight: bold; }
  .yellow { color: #e3b341; }
  .bright-yellow { color: #f2cc60; font-weight: bold; }
  .red { color: #ff7b72; }
  .bright-red { color: #ffa198; font-weight: bold; }
  .magenta { color: #bc8cff; }
  .bright-magenta { color: #d2a8ff; font-weight: bold; }
  .dim { color: #8b949e; }
  .bold { font-weight: bold; }
  .badge {
    display: inline-block;
    padding: 1px 7px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: bold;
    text-transform: uppercase;
  }
  .badge-critical { background: rgba(248, 81, 73, 0.2); color: #ff7b72; border: 1px solid #f85149; }
  .badge-high { background: rgba(227, 179, 65, 0.2); color: #f2cc60; border: 1px solid #e3b341; }
  .badge-medium { background: rgba(88, 166, 255, 0.2); color: #79c0ff; border: 1px solid #388bfd; }
  .badge-passed { background: rgba(46, 160, 67, 0.2); color: #56d364; border: 1px solid #2ea043; }
  .badge-failed { background: rgba(248, 81, 73, 0.2); color: #ff7b72; border: 1px solid #f85149; }
  .progress-bar { color: #56d364; }
  .divider { border-bottom: 1px solid #21262d; margin: 10px 0; }
  .exit-code { margin-top: 14px; font-size: 12px; color: #8b949e; }
</style>
</head>
<body>
  <div class="terminal-window">
    <div class="terminal-header">
      <div class="traffic-lights">
        <div class="dot dot-red"></div>
        <div class="dot dot-yellow"></div>
        <div class="dot dot-green"></div>
      </div>
      <div class="window-title">${title}</div>
    </div>
    <div class="terminal-body">
      <div class="prompt-line">
        <span class="prompt-user">veris</span><span class="prompt-sep">@</span><span class="prompt-path">runner</span><span class="prompt-char">:$</span>
        <span class="prompt-cmd">${command}</span>
      </div>
      <div class="terminal-content">${contentHtml}</div>
      ${exitCode !== null ? `<div class="exit-code">[Process exited with code ${exitCode}]</div>` : ''}
    </div>
  </div>
</body>
</html>`;
}

const assets = [
  {
    name: '01-startup-header.png',
    title: 'veris — system banner & info',
    command: 'veris --version && veris --help',
    content: `
<span class="bright-cyan">  _    _ ______ _____  _____  _____ </span>
<span class="bright-cyan"> | |  | |  ____|  __ \\|_   _|/ ____|</span>
<span class="bright-cyan"> | |  | | |__  | |__) | | | | (___  </span>
<span class="bright-cyan"> | |  | |  __| |  _  /  | |  \\___ \\ </span>
<span class="bright-cyan">  \\ \\/ /| |____| | \\ \\ _| |_ ____) |</span>
<span class="bright-cyan">   \\__/ |______|_|  \\_\\_____|_____/ </span>

<span class="bold">VERIS</span> - Deterministic Binary & Script Security Analysis Platform <span class="bright-green">v1.2.0</span>
<span class="dim">Architecture: x64-windows | Node: v20.18.0 | Telemetry: 0% (Disabled) | Mode: Offline-First</span>
<div class="divider"></div>
<span class="bold">CORE CAPABILITIES</span>
  * <span class="cyan">Deep PE & Script Analysis</span> : Structural inspection, entropy calculation, API call sequencing
  * <span class="cyan">100% Deterministic</span>      : Identical inputs produce bit-identical SHA-256 analysis run hashes
  * <span class="cyan">Zero Telemetry & Private</span>   : Analysis stays entirely local; zero external outbound queries
  * <span class="cyan">Enterprise CI Gates</span>        : Baseline differential scanning, SARIF v2.1.0, JUnit, HTML dashboards
  * <span class="cyan">Declarative Rule Engine</span>    : Sandboxed AST pattern matching and AI-assisted rule authoring
  * <span class="cyan">Extensible Plugin SDK</span>      : Isolated plugin runtime with resource quotas & quarantine safety
<div class="divider"></div>
<span class="bold">COMMANDS</span>
  <span class="green">scan</span>       Run static analysis on target artifacts (PE, scripts, configs)
  <span class="green">ci</span>         Evaluate security gates and regression policies in CI/CD
  <span class="green">dashboard</span>  Launch interactive, CSP-hardened visual investigation web UI
  <span class="green">rule</span>       Author, validate, and promote declarative detection rules
  <span class="green">plugins</span>    Inspect, verify, and manage sandboxed local extension plugins
  <span class="green">report</span>     Generate structured SARIF, JSON, Markdown, or HTML audits
`
  },
  {
    name: '02-active-scan.png',
    title: 'veris scan — live pipeline',
    command: 'veris scan ./production-binaries --format console --verbose',
    content: `
<span class="dim">[14:32:01.102]</span> <span class="cyan">DISCOVERY</span>  Scanning root: <span class="bright-cyan">./production-binaries</span> (recursive=true)
<span class="dim">[14:32:01.115]</span> <span class="green">DISCOVERY</span>  Found 42 targets (28 PE32+, 8 PowerShell, 6 Shell Scripts)
<span class="dim">[14:32:01.118]</span> <span class="cyan">PIPELINE</span>   Initializing 5 analysis engines:
               + <span class="dim">PE Header & Import Table Analyzer (PE32/PE32+)</span>
               + <span class="dim">Section Entropy & Packing Detector</span>
               + <span class="dim">PowerShell & Shell Script AST Tokenizer</span>
               + <span class="dim">Sensitive Credential & Private Key Extractor</span>
               + <span class="dim">Sandboxed Declarative Rule Engine (48 rules loaded)</span>
<div class="divider"></div>
<span class="bold">Analyzing targets:</span>
[<span class="progress-bar">============================================================</span>] 100% 42/42 files
<div class="divider"></div>
<span class="dim">[14:32:01.134]</span> <span class="yellow">ANALYSIS</span>   <span class="bright-yellow">bin/updater.exe</span> : Process injection API sequence identified
<span class="dim">[14:32:01.137]</span> <span class="yellow">ANALYSIS</span>   <span class="bright-yellow">scripts/deploy.ps1</span> : Obfuscated DownloadString payload detected
<span class="dim">[14:32:01.140]</span> <span class="yellow">ANALYSIS</span>   <span class="bright-yellow">config/certs.yaml</span> : Unencrypted PKCS#8 private key header found
<span class="dim">[14:32:01.144]</span> <span class="green">PIPELINE</span>   Completed in <span class="bright-green">16.42 ms</span> (Throughput: 2,558 files/sec)
<span class="dim">[14:32:01.145]</span> <span class="cyan">CANONICAL</span>  Run Hash: <span class="dim">sha256:7f9a2b8e3c1d406a9e45f1b2c3d4e5f67a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2</span>
`
  },
  {
    name: '03-findings-summary.png',
    title: 'veris scan — findings summary',
    command: 'veris scan ./production-binaries --format table',
    content: `
<span class="bold">VERIS SCAN SUMMARY</span>
Target: <span class="cyan">./production-binaries</span>  |  Files Analyzed: <span class="bold">42</span>  |  Duration: <span class="green">16.4ms</span>
Risk Score: <span class="badge badge-high">7.8 / 10.0 (HIGH)</span>  |  Determinism: <span class="bright-green">VERIFIED (100% REPRODUCIBLE)</span>
<div class="divider"></div>
<span class="bold">SECURITY FINDINGS (4 DETECTED)</span>

<span class="badge badge-critical">CRITICAL</span> <span class="bold">MAL-INJ-001</span>: Process Injection Pattern Detected
  File     : <span class="cyan">bin/updater.exe:0x4120</span>
  Evidence : API sequence calls <span class="bright-yellow">VirtualAllocEx</span> followed by <span class="bright-yellow">CreateRemoteThread</span>
  CWE      : <span class="dim">CWE-78: OS Command Injection</span>  |  Confidence: <span class="green">0.98</span>
  Advice   : Replace cross-process memory manipulation with secure IPC pipes.

<span class="badge badge-high">HIGH</span>     <span class="bold">MAL-PSH-002</span>: PowerShell Remote Download Cradle
  File     : <span class="cyan">scripts/deploy.ps1:14</span>
  Evidence : Execution pattern matches <span class="bright-yellow">DownloadString | IEX</span>
  CWE      : <span class="dim">CWE-94: Improper Control of Generation of Code</span>
  Advice   : Download scripts to temporary disk locations and verify digital signatures before invoking.

<span class="badge badge-high">HIGH</span>     <span class="bold">SEC-KEY-001</span>: Embedded Private Key Material
  File     : <span class="cyan">config/certs.yaml:45</span>
  Evidence : Unencrypted PEM header <span class="bright-yellow">BEGIN PRIVATE KEY</span> detected in repository asset
  CWE      : <span class="dim">CWE-798: Use of Hard-coded Credentials</span>

<span class="badge badge-medium">MEDIUM</span>   <span class="bold">CRY-MD5-001</span>: Deprecated Hash Function (MD5)
  File     : <span class="cyan">src/auth_token.go:88</span>
  Evidence : Invocation of <span class="bright-yellow">crypto/md5</span> for sensitive session token generation
  CWE      : <span class="dim">CWE-327: Use of a Broken or Risky Cryptographic Algorithm</span>
<div class="divider"></div>
Reports generated:
  * JSON   : <span class="dim">./veris-output/report.json</span>
  * SARIF  : <span class="dim">./veris-output/report.sarif</span>
  * HTML   : <span class="dim">./veris-output/dashboard.html</span>
`,
    exitCode: 1
  },
  {
    name: '04-plugin-workflow.png',
    title: 'veris plugins — secure extension ecosystem',
    command: 'veris plugins list && veris plugins verify @veris/plugin-container-rules',
    content: `
<span class="bold">DISCOVERED LOCAL PLUGINS</span> (2 loaded, 0 quarantined)
<div class="divider"></div>
  <span class="bright-green">✔</span> <span class="bold">@veris/plugin-container-rules</span> <span class="dim">v1.0.0</span>
    ID          : <span class="cyan">org.veris.container-security</span>
    Type        : Declarative Rule Pack (12 rules)
    Sandbox     : <span class="green">Hardened (0 network, 0 disk write, memory limit: 64MB)</span>
    Status      : <span class="badge badge-passed">ACTIVE</span>

  <span class="bright-green">✔</span> <span class="bold">@veris/plugin-yara-importer</span> <span class="dim">v0.9.4</span>
    ID          : <span class="cyan">org.veris.yara-bridge</span>
    Type        : Custom Analyzer Bridge
    Sandbox     : <span class="green">Hardened (Isolated child process, timeout: 500ms)</span>
    Status      : <span class="badge badge-passed">ACTIVE</span>
<div class="divider"></div>
<span class="bold">VERIFYING PLUGIN INTEGRITY:</span> <span class="cyan">@veris/plugin-container-rules</span>
  [1] Manifest Schema Validation       : <span class="bright-green">PASSED</span>
  [2] Runtime Dependency Check (0 deps): <span class="bright-green">PASSED (0 runtime dependencies)</span>
  [3] Offline Execution Verification   : <span class="bright-green">PASSED (zero network socket requests)</span>
  [4] Resource Envelope Limit Test     : <span class="bright-green">PASSED (execution overhead &lt; 1.2ms)</span>
  [5] Cryptographic Signature Audit    : <span class="bright-green">PASSED (sha256 digest matches manifest)</span>

<span class="bright-green">SUCCESS</span>: Plugin verified. Clean and certified safe for deterministic enterprise execution.
`
  },
  {
    name: '05-ai-rule-author.png',
    title: 'veris rule author — AI-assisted rule synthesis',
    command: 'veris rule author --intent "Detect cleartext AWS access keys in configs" --severity high --offline',
    content: `
<span class="cyan">SYNTHESIZING RULE SPECIFICATION</span>
  Target Intent : <span class="bright-cyan">"Detect cleartext AWS access keys in configs"</span>
  Provider      : <span class="bright-green">Offline Deterministic Generator (Zero network data egress)</span>
  Severity      : <span class="badge badge-high">HIGH</span>  |  Category: <span class="dim">credential-access</span>
<div class="divider"></div>
<span class="bold">SYNTHESIZED RULE CANDIDATE:</span> <span class="bright-yellow">RULE-CAND-2026-0924</span>
{
  <span class="cyan">"id"</span>: <span class="green">"RULE-CAND-2026-0924"</span>,
  <span class="cyan">"name"</span>: <span class="green">"Cleartext AWS Access Key Identifier"</span>,
  <span class="cyan">"severity"</span>: <span class="green">"high"</span>,
  <span class="cyan">"category"</span>: <span class="green">"credential-access"</span>,
  <span class="cyan">"cwe"</span>: <span class="green">"CWE-798"</span>,
  <span class="cyan">"match"</span>: {
    <span class="cyan">"target"</span>: <span class="green">"file-content"</span>,
    <span class="cyan">"matcher"</span>: <span class="green">"regex"</span>,
    <span class="cyan">"pattern"</span>: <span class="bright-yellow">"(?i)(?:aws_access_key_id|aws_secret_access_key)\\s*[:=]\\s*['\\"][A-Za-z0-9/+=]{20,40}['\\"]"</span>
  }
}
<div class="divider"></div>
<span class="bold">AUTOMATED FIXTURE VALIDATION SUITE</span>
  [+] Running 4 positive test fixtures : <span class="bright-green">4 / 4 PASSED (True positives detected)</span>
  [+] Running 4 negative test fixtures : <span class="bright-green">4 / 4 PASSED (Zero false alarms on masked tokens)</span>
  [+] Determinism Validation           : <span class="bright-green">100% REPRODUCIBLE</span>
  [+] Evaluation Performance           : <span class="dim">0.08 ms per evaluated file</span>

<span class="bright-green">SUCCESS</span>: Rule candidate generated and passed all validation gates.
Artifact written to: <span class="cyan">./candidate-rules/RULE-CAND-2026-0924.json</span>
`
  },
  {
    name: '06-ci-security-gate.png',
    title: 'veris ci — security gate enforcement',
    command: 'veris ci . --baseline ./baseline.json --fail-on high --fail-on-new --sarif results.sarif',
    content: `
<span class="bold">VERIS CI SECURITY GATE ENFORCEMENT</span>
Target Branch: <span class="cyan">pull/142 (feature/updater-v2)</span>  |  Baseline: <span class="dim">./baseline.json</span>
<div class="divider"></div>
<span class="bold">DIFF SUMMARY VS BASELINE:</span>
  Existing Baseline Findings : 12 findings (0 Critical, 4 High, 8 Medium)
  Active PR Findings         : 13 findings (<span class="bright-red">1 Critical</span>, 4 High, 8 Medium)
  Delta                      : <span class="bright-red">+1 New Finding</span> (<span class="badge badge-critical">CRITICAL</span>)
<div class="divider"></div>
<span class="bold">EVALUATING CI POLICIES:</span>
  [<span class="red">FAIL</span>] <span class="bold">--fail-on high</span>
         Violated: 1 finding with severity >= high (Found: 1 Critical)
         <span class="bright-red">&gt; MAL-INJ-001: Process Injection in bin/updater.exe</span>

  [<span class="red">FAIL</span>] <span class="bold">--fail-on-new</span>
         Violated: 1 new finding introduced compared to baseline commit.

  [<span class="green">PASS</span>] <span class="bold">--max-risk 8.5</span>
         Passed: Overall risk score 7.8 &lt;= ceiling 8.5.

  [<span class="green">PASS</span>] <span class="bold">--fail-on-plugin-quarantine</span>
         Passed: 0 plugins crashed or quarantined.
<div class="divider"></div>
<span class="badge badge-failed">CI GATE FAILED</span> <span class="red">Security gate criteria not met (1 policy failure).</span>
Exported GitHub Step Summary: <span class="dim">$GITHUB_STEP_SUMMARY</span>
Exported SARIF report: <span class="cyan">./results.sarif</span> (compatible with GitHub Code Scanning)
`,
    exitCode: 10
  }
];

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

for (const asset of assets) {
  const htmlPath = path.join(tempDir, asset.name.replace('.png', '.html'));
  const pngPath = path.join(showcaseDir, asset.name);
  const htmlContent = renderTerminalHtml(asset.title, asset.command, asset.content, asset.exitCode);
  fs.writeFileSync(htmlPath, htmlContent, 'utf8');

  console.log(`Rendering ${asset.name}...`);
  const cmd = `"${edgePath}" --headless --disable-gpu --user-data-dir="${tempDir}\\profile" --window-size=920,620 --screenshot="${pngPath}" "file:///${htmlPath.replace(/\\\\/g, '/')}"`;
  execSync(cmd, { stdio: 'inherit' });
  console.log(`Saved: ${pngPath} (${fs.statSync(pngPath).size} bytes)`);
}

// Generate animated SVG startup banner
const svgAnimationPath = path.join(showcaseDir, 'startup-animation.svg');
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 320" width="880" height="320">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b0f14" />
      <stop offset="100%" stop-color="#161b22" />
    </linearGradient>
    <linearGradient id="cyanGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#58a6ff" />
      <stop offset="100%" stop-color="#79c0ff" />
    </linearGradient>
    <style>
      .mono { font-family: 'Consolas', 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace; }
      @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      @keyframes typeCommand {
        0% { width: 0; }
        30% { width: 260px; }
        100% { width: 260px; }
      }
      @keyframes fadeIn {
        0% { opacity: 0; }
        40% { opacity: 0; }
        55% { opacity: 1; }
        100% { opacity: 1; }
      }
      @keyframes scanProgress {
        0% { width: 0; }
        50% { width: 0; }
        75% { width: 340px; }
        100% { width: 340px; }
      }
      .cursor { animation: blink 0.9s infinite; }
      .typed-cmd {
        display: inline-block;
        overflow: hidden;
        white-space: nowrap;
        animation: typeCommand 6s infinite;
      }
      .fade-output { animation: fadeIn 6s infinite; }
      .bar-fill { animation: scanProgress 6s infinite; }
    </style>
  </defs>

  <!-- Window Frame -->
  <rect x="0" y="0" width="880" height="320" rx="10" fill="#0d1117" stroke="#30363d" stroke-width="1.5" />
  
  <!-- Header -->
  <rect x="0" y="0" width="880" height="36" rx="10" fill="#161b22" />
  <rect x="0" y="26" width="880" height="10" fill="#161b22" />
  <line x1="0" y1="36" x2="880" y2="36" stroke="#21262d" stroke-width="1" />
  
  <!-- Window Dots -->
  <circle cx="20" cy="18" r="6" fill="#ff5f56" />
  <circle cx="40" cy="18" r="6" fill="#ffbd2e" />
  <circle cx="60" cy="18" r="6" fill="#27c93f" />
  <text x="440" y="22" fill="#8b949e" font-size="12" font-weight="500" text-anchor="middle" class="mono">veris — deterministic security analysis</text>

  <!-- Terminal Content -->
  <g transform="translate(24, 64)" class="mono" font-size="13">
    <!-- Prompt -->
    <text x="0" y="0" fill="#58a6ff" font-weight="bold">veris<tspan fill="#8b949e">@</tspan><tspan fill="#7ee787">local</tspan><tspan fill="#c9d1d9">:$</tspan></text>
    <text x="110" y="0" fill="#f0f6fc" font-weight="600">veris scan ./bin --ci</text>
    <rect x="275" y="-12" width="8" height="15" fill="#58a6ff" class="cursor" />

    <!-- Output Group -->
    <g class="fade-output">
      <text x="0" y="30" fill="#58a6ff" font-weight="bold">[+] VERIS Engine v1.2.0 initialized (0 telemetry, offline-first)</text>
      <text x="0" y="52" fill="#8b949e">Discovery: 42 target artifacts discovered in 2.1ms</text>
      <text x="0" y="74" fill="#8b949e">Executing AST, PE, and heuristic detection pipelines...</text>

      <!-- Progress Bar Track -->
      <rect x="0" y="90" width="340" height="8" rx="4" fill="#21262d" />
      <rect x="0" y="90" height="8" rx="4" fill="#56d364" class="bar-fill" />
      <text x="355" y="98" fill="#56d364" font-size="11" font-weight="bold">100% COMPLETE (16.4ms)</text>

      <line x1="0" y1="120" x2="832" y2="120" stroke="#21262d" stroke-width="1" />

      <!-- Result Banner -->
      <text x="0" y="146" fill="#7ee787" font-weight="bold">✔ ZERO FALSE POSITIVES</text>
      <text x="210" y="146" fill="#58a6ff" font-weight="bold">✔ 100% DETERMINISTIC</text>
      <text x="430" y="146" fill="#bc8cff" font-weight="bold">✔ 0 RUNTIME DEPENDENCIES</text>
      <text x="690" y="146" fill="#e3b341" font-weight="bold">✔ SARIF EXPORTED</text>

      <text x="0" y="174" fill="#8b949e">Deterministic Run Hash: <tspan fill="#c9d1d9">sha256:7f9a2b8e3c1d406a9e45f1b2c3d4e5f67a8b9c0d1e2f3a4b</tspan></text>
      <text x="0" y="196" fill="#7ee787">Audit completed with 0 errors. Gate passed cleanly.</text>
    </g>
  </g>
</svg>`;

fs.writeFileSync(svgAnimationPath, svgContent, 'utf8');
console.log(`Saved: ${svgAnimationPath} (${fs.statSync(svgAnimationPath).size} bytes)`);

console.log('\\nAll showcase assets successfully generated!');
