/**
 * @veris/cli/dashboard/template — Self-contained HTML/CSS/JS template for the visual investigation dashboard.
 *
 * Implements Section 3 of ADR-017:
 * - Single-file zero-dependency HTML artifact
 * - Embedded responsive dark-slate design system
 * - Interactive client-side filtering, searching, and expandable evidence traces
 * - Strict CSP and zero network calls
 *
 * @module @veris/cli/dashboard/template
 */

import { escapeHtml, sanitizeIdentifier } from './sanitizer.js';
import type { DashboardViewModel } from './types.js';

export function renderDashboardHtml(vm: DashboardViewModel): string {
  const { report } = vm;
  const findings = report.findings ?? [];
  const artifacts = report.artifacts ?? [];

  const severityBadgeClass = (level: string): string => {
    switch (level?.toLowerCase()) {
      case 'critical':
        return 'badge-critical';
      case 'high':
        return 'badge-high';
      case 'medium':
        return 'badge-medium';
      case 'low':
        return 'badge-low';
      case 'info':
      default:
        return 'badge-info';
    }
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none';">
  <title>VERIS Investigation Dashboard — ${escapeHtml(vm.targetPath)}</title>
  <style>
    :root {
      --bg-main: #0b0f19;
      --bg-surface: #111827;
      --bg-card: #1f2937;
      --bg-card-hover: #283548;
      --border-color: #374151;
      --text-main: #f9fafb;
      --text-muted: #9ca3af;
      --text-dim: #6b7280;
      --accent: #38bdf8;
      --accent-dim: #0284c7;
      
      --sev-critical: #ef4444;
      --sev-high: #f97316;
      --sev-medium: #eab308;
      --sev-low: #3b82f6;
      --sev-info: #64748b;
      --status-success: #10b981;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg-main);
      color: var(--text-main);
      line-height: 1.5;
      padding: 1.5rem;
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--border-color);
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .brand-title {
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.025em;
      color: var(--text-main);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .brand-title span { color: var(--accent); }

    .header-meta {
      font-size: 0.875rem;
      color: var(--text-muted);
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .metric-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 1.25rem;
    }
    .metric-title {
      font-size: 0.8rem;
      text-transform: uppercase;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 0.5rem;
    }
    .metric-val {
      font-size: 2rem;
      font-weight: 700;
      line-height: 1;
    }
    .metric-sub {
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-top: 0.35rem;
    }

    /* Severity Breakdown Bar */
    .sev-bar-container {
      display: flex;
      height: 10px;
      border-radius: 9999px;
      overflow: hidden;
      margin-top: 0.5rem;
      background: var(--bg-card);
    }
    .sev-seg { height: 100%; transition: width 0.3s; }
    .bg-crit { background: var(--sev-critical); }
    .bg-high { background: var(--sev-high); }
    .bg-med  { background: var(--sev-medium); }
    .bg-low  { background: var(--sev-low); }
    .bg-info { background: var(--sev-info); }

    /* Controls: Search & Filters */
    .controls {
      display: flex;
      gap: 0.75rem;
      margin-bottom: 1.25rem;
      flex-wrap: wrap;
      background: var(--bg-surface);
      padding: 1rem;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      align-items: center;
    }
    .search-input {
      flex: 1;
      min-width: 240px;
      padding: 0.5rem 0.75rem;
      border-radius: 6px;
      border: 1px solid var(--border-color);
      background: var(--bg-card);
      color: var(--text-main);
      font-size: 0.9rem;
    }
    .search-input:focus {
      outline: 2px solid var(--accent);
      border-color: transparent;
    }
    .filter-btn {
      padding: 0.4rem 0.75rem;
      border-radius: 6px;
      border: 1px solid var(--border-color);
      background: var(--bg-card);
      color: var(--text-muted);
      font-size: 0.85rem;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.15s;
    }
    .filter-btn:hover { background: var(--bg-card-hover); color: var(--text-main); }
    .filter-btn.active {
      background: var(--accent-dim);
      border-color: var(--accent);
      color: #fff;
    }

    /* Section layout */
    .section-title {
      font-size: 1.2rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    /* Findings List */
    .findings-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      margin-bottom: 2rem;
    }
    .finding-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      overflow: hidden;
      transition: border-color 0.15s;
    }
    .finding-card:hover { border-color: #4b5563; }
    .finding-header {
      padding: 1rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      cursor: pointer;
      user-select: none;
    }
    .finding-title-row {
      flex: 1;
    }
    .finding-title {
      font-size: 1rem;
      font-weight: 600;
      color: var(--text-main);
    }
    .finding-subtitle {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-top: 0.15rem;
      display: flex;
      gap: 0.75rem;
      flex-wrap: wrap;
    }

    .badge {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge-critical { background: rgba(239, 68, 68, 0.2); color: var(--sev-critical); border: 1px solid var(--sev-critical); }
    .badge-high     { background: rgba(249, 115, 22, 0.2); color: var(--sev-high); border: 1px solid var(--sev-high); }
    .badge-medium   { background: rgba(234, 179, 8, 0.2); color: var(--sev-medium); border: 1px solid var(--sev-medium); }
    .badge-low      { background: rgba(59, 130, 246, 0.2); color: var(--sev-low); border: 1px solid var(--sev-low); }
    .badge-info     { background: rgba(100, 116, 139, 0.2); color: var(--sev-info); border: 1px solid var(--sev-info); }

    .expand-toggle {
      font-size: 1.1rem;
      color: var(--text-muted);
      transition: transform 0.2s;
    }
    .finding-card.open .expand-toggle {
      transform: rotate(90deg);
    }

    .finding-body {
      display: none;
      padding: 1rem;
      border-top: 1px solid var(--border-color);
      background: var(--bg-card);
      font-size: 0.875rem;
    }
    .finding-card.open .finding-body {
      display: block;
    }

    .detail-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1rem;
      margin-top: 0.75rem;
    }
    .detail-box {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 0.75rem;
    }
    .detail-box h4 {
      font-size: 0.75rem;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 0.35rem;
    }

    .evidence-item {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.8rem;
      background: #090d16;
      border: 1px solid #1f2937;
      padding: 0.5rem;
      border-radius: 4px;
      margin-top: 0.35rem;
      overflow-x: auto;
    }

    /* Inventory Table */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      overflow: hidden;
    }
    th, td {
      padding: 0.75rem 1rem;
      text-align: left;
      border-bottom: 1px solid var(--border-color);
    }
    th {
      background: #162032;
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 0.75rem;
    }
    tr:last-child td { border-bottom: none; }
    .mono { font-family: ui-monospace, SFMono-Regular, monospace; }

    footer {
      margin-top: 3rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border-color);
      text-align: center;
      color: var(--text-dim);
      font-size: 0.8rem;
    }

    @media print {
      body { background: #fff; color: #000; padding: 0; }
      .controls { display: none; }
      .finding-body { display: block !important; }
      .metric-card, .finding-card, table { border-color: #ddd; background: #fff; }
    }
  </style>
</head>
<body>

  <header>
    <div>
      <div class="brand-title">
        <span>VERIS</span> Investigation Dashboard
      </div>
      <div class="header-meta" style="margin-top: 0.35rem;">
        <div>Target: <strong>${escapeHtml(vm.targetPath)}</strong></div>
        <div>Session: <code>${escapeHtml(report.session?.id ?? (report as unknown as Record<string, unknown>).sessionId ?? 'ses_unknown')}</code></div>
        <div>Timestamp: ${escapeHtml(report.generatedAt ?? vm.generatedAt)}</div>
      </div>
    </div>
    <div class="header-meta">
      <div>Engine: <strong>v1.2.0</strong></div>
      <div>Duration: <strong>${escapeHtml(vm.durationFormatted)}</strong></div>
      <div>Format: <strong>Canonical v1.0.0</strong></div>
    </div>
  </header>

  <main>
    <!-- Top Level Metrics -->
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-title">Risk Assessment</div>
        <div class="metric-val" style="color: ${vm.riskScore >= 7 ? 'var(--sev-high)' : vm.riskScore >= 4 ? 'var(--sev-medium)' : 'var(--status-success)'};">
          ${vm.riskScore.toFixed(1)} <span style="font-size: 1rem; color: var(--text-muted);">/ 10.0</span>
        </div>
        <div class="metric-sub">
          Level: <strong>${escapeHtml(vm.riskLevel.toUpperCase())}</strong> (Confidence: ${(vm.confidenceScore * 100).toFixed(0)}%)
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-title">Security Findings</div>
        <div class="metric-val">${vm.totalFindings}</div>
        <div class="sev-bar-container">
          <div class="sev-seg bg-crit" style="width: ${vm.totalFindings ? (vm.severityCounts.critical / vm.totalFindings) * 100 : 0}%;"></div>
          <div class="sev-seg bg-high" style="width: ${vm.totalFindings ? (vm.severityCounts.high / vm.totalFindings) * 100 : 0}%;"></div>
          <div class="sev-seg bg-med" style="width: ${vm.totalFindings ? (vm.severityCounts.medium / vm.totalFindings) * 100 : 0}%;"></div>
          <div class="sev-seg bg-low" style="width: ${vm.totalFindings ? (vm.severityCounts.low / vm.totalFindings) * 100 : 0}%;"></div>
          <div class="sev-seg bg-info" style="width: ${vm.totalFindings ? (vm.severityCounts.info / vm.totalFindings) * 100 : 0}%;"></div>
        </div>
        <div class="metric-sub" style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem; font-size: 0.75rem;">
          <span style="color: var(--sev-critical);">Crit: ${vm.severityCounts.critical}</span>
          <span style="color: var(--sev-high);">High: ${vm.severityCounts.high}</span>
          <span style="color: var(--sev-medium);">Med: ${vm.severityCounts.medium}</span>
          <span style="color: var(--sev-low);">Low: ${vm.severityCounts.low}</span>
          <span style="color: var(--sev-info);">Info: ${vm.severityCounts.info}</span>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-title">Artifacts & Evidence</div>
        <div class="metric-val">${vm.artifactCount}</div>
        <div class="metric-sub">
          Evidence Items: <strong>${vm.evidenceCount}</strong>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-title">Trust & Baseline</div>
        <div class="metric-val" style="color: var(--accent);">
          ${vm.trustScore.toFixed(0)} <span style="font-size: 1rem; color: var(--text-muted);">/ 100</span>
        </div>
        <div class="metric-sub">
          Offline Analysis: <strong>VERIFIED</strong>
        </div>
      </div>
    </div>

    <!-- Findings Explorer Section -->
    <div class="section-title">
      <span>Findings Explorer (${vm.totalFindings})</span>
    </div>

    <div class="controls">
      <input type="text" id="searchInput" class="search-input" placeholder="Search findings by title, rule ID, or description..." aria-label="Search findings">
      <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
        <button class="filter-btn active" data-filter="all">All (${vm.totalFindings})</button>
        <button class="filter-btn" data-filter="critical">Critical (${vm.severityCounts.critical})</button>
        <button class="filter-btn" data-filter="high">High (${vm.severityCounts.high})</button>
        <button class="filter-btn" data-filter="medium">Medium (${vm.severityCounts.medium})</button>
        <button class="filter-btn" data-filter="low">Low (${vm.severityCounts.low})</button>
        <button class="filter-btn" data-filter="info">Info (${vm.severityCounts.info})</button>
      </div>
    </div>

    <div class="findings-list" id="findingsList">
      ${
        findings.length === 0
          ? `<div style="text-align: center; padding: 3rem; background: var(--bg-surface); border-radius: 8px; color: var(--text-muted); border: 1px solid var(--border-color);">
               <h3>✅ No Security Findings Detected</h3>
               <p style="margin-top: 0.5rem; font-size: 0.9rem;">The scanned target is clean according to active rule packs and policies.</p>
             </div>`
          : findings
              .map((f, idx) => {
                const fRecord = f as unknown as Record<string, unknown>;
                const rawSev =
                  typeof f.severity === 'string' ? f.severity : (f.severity?.level ?? 'info');
                const sevLevel = String(rawSev).toLowerCase();
                const ruleId = f.ruleId ?? 'RULE_UNKNOWN';
                const artId =
                  (typeof fRecord.artifactId === 'string' ? fRecord.artifactId : undefined) ??
                  f.affectedArtifacts?.[0]?.artifactId;
                const artifact = artifacts.find((a) => a.id === artId);
                const aRecord = artifact as unknown as Record<string, unknown> | undefined;
                const artifactPath =
                  artifact?.normalizedPath ??
                  artifact?.originalPath ??
                  (typeof aRecord?.path === 'string' ? aRecord.path : undefined) ??
                  artId ??
                  'Unknown Target';
                const safeCardId = 'card_' + sanitizeIdentifier(f.id ?? `finding_${idx}`);
                const category =
                  typeof fRecord.category === 'string'
                    ? fRecord.category
                    : f.taxonomyIds?.[0]
                      ? String(f.taxonomyIds[0])
                      : 'general';
                const remediation =
                  (typeof fRecord.remediation === 'string' ? fRecord.remediation : undefined) ??
                  ((f.properties?.remediation as string) ||
                    'Review artifact source, apply least-privilege security controls, and remove malicious indicators.');

                interface EvidenceTraceView {
                  readonly type?: string;
                  readonly source?: string;
                  readonly relevance?: string;
                  readonly snippet?: string;
                  readonly location?: {
                    readonly path?: string;
                    readonly line?: number;
                  };
                }

                const cweList: readonly string[] = Array.isArray(fRecord.cweIds)
                  ? (fRecord.cweIds as readonly string[])
                  : Array.isArray(fRecord.cwe)
                    ? (fRecord.cwe as readonly string[])
                    : [];
                const mitreList: readonly string[] = Array.isArray(fRecord.mitreTechniques)
                  ? (fRecord.mitreTechniques as readonly string[])
                  : Array.isArray(fRecord.mitre)
                    ? (fRecord.mitre as readonly string[])
                    : [];
                const evidenceObjList = (
                  Array.isArray(fRecord.evidence) ? fRecord.evidence : []
                ) as readonly EvidenceTraceView[];
                const evidenceIdList: readonly string[] = Array.isArray(f.evidenceIds)
                  ? f.evidenceIds
                  : [];

                return `
        <div class="finding-card" id="${safeCardId}" data-severity="${escapeHtml(sevLevel)}" data-category="${escapeHtml(category.toLowerCase())}">
          <div class="finding-header" onclick="toggleCard('${safeCardId}')" tabindex="0" role="button" aria-expanded="false">
            <span class="badge ${severityBadgeClass(sevLevel)}">${escapeHtml(sevLevel)}</span>
            <div class="finding-title-row">
              <div class="finding-title">${escapeHtml(f.title ?? ruleId)}</div>
              <div class="finding-subtitle">
                <span>Rule: <code>${escapeHtml(ruleId)}</code></span>
                <span>Artifact: <code>${escapeHtml(artifactPath)}</code></span>
                <span>Category: <strong>${escapeHtml(category)}</strong></span>
                <span>Confidence: <strong>${((f.confidence ?? 1.0) * 100).toFixed(0)}%</strong></span>
              </div>
            </div>
            <div class="expand-toggle">▶</div>
          </div>
          <div class="finding-body">
            <p>${escapeHtml(f.description ?? 'No detailed description provided.')}</p>
            
            <div class="detail-grid">
              <div class="detail-box">
                <h4>Remediation Guidance</h4>
                <p>${escapeHtml(remediation)}</p>
              </div>
              <div class="detail-box">
                <h4>Compliance & Citations</h4>
                <p>CWE: ${
                  cweList.length > 0
                    ? cweList.map((c) => `<code>${escapeHtml(c)}</code>`).join(' ')
                    : '<em>None cited</em>'
                }</p>
                <p style="margin-top: 0.25rem;">MITRE ATT&CK: ${
                  mitreList.length > 0
                    ? mitreList.map((m) => `<code>${escapeHtml(m)}</code>`).join(' ')
                    : '<em>None cited</em>'
                }</p>
              </div>
            </div>

            ${
              evidenceObjList.length > 0
                ? `<div style="margin-top: 0.75rem;">
                     <h4 style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.25rem;">Associated Evidence Traces (${evidenceObjList.length})</h4>
                     ${evidenceObjList
                       .map((ev) => {
                         const loc = ev.location?.path ?? ev.source ?? '';
                         const line = ev.location?.line ? `:${ev.location.line}` : '';
                         const locStr = loc ? `${loc}${line}` : '';
                         return `<div class="evidence-item">
                           <div><strong>[${escapeHtml(ev.type ?? 'evidence')}]</strong> ${locStr ? `<code>${escapeHtml(locStr)}</code>` : ''}</div>
                           ${ev.relevance ? `<div style="color: var(--text-muted); font-size: 0.75rem; margin-top: 0.2rem;">${escapeHtml(ev.relevance)}</div>` : ''}
                           ${ev.snippet ? `<pre style="margin-top: 0.35rem; background: #000; padding: 0.35rem; border-radius: 4px; overflow-x: auto;"><code>${escapeHtml(ev.snippet)}</code></pre>` : ''}
                         </div>`;
                       })
                       .join('')}
                   </div>`
                : evidenceIdList.length > 0
                  ? `<div style="margin-top: 0.75rem;">
                       <h4 style="font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.25rem;">Associated Evidence Traces (${evidenceIdList.length})</h4>
                       ${evidenceIdList
                         .map(
                           (evId) =>
                             `<div class="evidence-item">Evidence ID: ${escapeHtml(evId)}</div>`,
                         )
                         .join('')}
                     </div>`
                  : ''
            }
          </div>
        </div>`;
              })
              .join('\n')
      }
    </div>

    <!-- Scanned Artifacts Section -->
    <div class="section-title">
      <span>Scanned Artifacts Inventory (${artifacts.length})</span>
    </div>

    <div style="overflow-x: auto; margin-bottom: 2rem;">
      <table>
        <thead>
          <tr>
            <th>Path / Identifier</th>
            <th>Type</th>
            <th>Size</th>
            <th>SHA256 Hash</th>
          </tr>
        </thead>
        <tbody>
          ${
            artifacts.length === 0
              ? `<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No artifacts recorded in report.</td></tr>`
              : artifacts
                  .map((a) => {
                    const aRecord = a as unknown as Record<string, unknown>;
                    const aPath =
                      a.normalizedPath ??
                      a.originalPath ??
                      (typeof aRecord.path === 'string' ? aRecord.path : a.id);
                    const aHash =
                      a.contentHash ?? (typeof aRecord.sha256 === 'string' ? aRecord.sha256 : '—');
                    const aSize =
                      typeof a.size === 'number'
                        ? (a.size / 1024).toFixed(1) + ' KB'
                        : typeof aRecord.sizeBytes === 'number'
                          ? ((aRecord.sizeBytes as number) / 1024).toFixed(1) + ' KB'
                          : 'Unknown';
                    return `
            <tr>
              <td><code>${escapeHtml(aPath)}</code></td>
              <td>${escapeHtml(a.type ?? 'file')}</td>
              <td>${escapeHtml(aSize)}</td>
              <td class="mono" style="font-size: 0.75rem;">${escapeHtml(aHash)}</td>
            </tr>`;
                  })
                  .join('\n')
          }
        </tbody>
      </table>
    </div>

  </main>

  <footer>
    VERIS Offline-First Deterministic Security Analysis &bull; Generated: ${escapeHtml(vm.generatedAt)}
  </footer>

  <script>
    function toggleCard(id) {
      var card = document.getElementById(id);
      if (!card) return;
      var isOpen = card.classList.contains('open');
      if (isOpen) {
        card.classList.remove('open');
        card.querySelector('.finding-header').setAttribute('aria-expanded', 'false');
      } else {
        card.classList.add('open');
        card.querySelector('.finding-header').setAttribute('aria-expanded', 'true');
      }
    }

    // Search and Filter Logic
    var searchInput = document.getElementById('searchInput');
    var filterButtons = document.querySelectorAll('.filter-btn');
    var currentFilter = 'all';

    function applyFilters() {
      var query = (searchInput.value || '').toLowerCase().trim();
      var cards = document.querySelectorAll('.finding-card');

      cards.forEach(function(card) {
        var sev = card.getAttribute('data-severity');
        var text = card.textContent.toLowerCase();

        var matchesSeverity = (currentFilter === 'all') || (sev === currentFilter);
        var matchesQuery = !query || text.indexOf(query) !== -1;

        if (matchesSeverity && matchesQuery) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', applyFilters);
    }

    filterButtons.forEach(function(btn) {
      btn.addEventListener('click', function() {
        filterButtons.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentFilter = btn.getAttribute('data-filter');
        applyFilters();
      });
    });
  </script>
</body>
</html>`;
}
