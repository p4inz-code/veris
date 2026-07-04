/**
 * Persistence Analyzer — produces evidence about persistence mechanism features.
 *
 * @module @veris/analysis/analyzers/persistence-analyzer
 */

import { BaseAnalyzer } from '../base-analyzer.js';
import type { AnalysisContext, AnalysisResult } from '../types.js';

/**
 * Analyzes features for evidence of persistence mechanisms.
 *
 * Detects patterns related to:
 * - Registry run keys
 * - Scheduled tasks / cron jobs
 * - Startup folders
 * - Service creation
 * - Boot persistence
 */
export class PersistenceAnalyzer extends BaseAnalyzer {
  constructor() {
    super({
      id: 'persistence-analyzer',
      name: 'Persistence Analyzer',
      version: '0.1.0',
      supportedArtifactTypes: ['file', 'executable', 'script', 'configuration'],
      priority: 200,
    });
  }

  canAnalyze(context: AnalysisContext): boolean {
    return context.features.some((f) => f.type === 'string-literal' || f.type === 'registry-key');
  }

  async analyze(context: AnalysisContext): Promise<AnalysisResult> {
    const startTime = Date.now();
    const evidenceList: import('../types.js').Evidence[] = [];
    const issues: import('../types.js').AnalysisIssue[] = [];

    try {
      const stringFeatures = context.features.filter((f) => f.type === 'string-literal');
      const registryKeyFeatures = context.features.filter((f) => f.type === 'registry-key');
      const strings = stringFeatures.map((f) => String(f.value));

      // Registry auto-run keys
      const autorunPatterns = [
        /Software\\Microsoft\\Windows\\CurrentVersion\\Run/,
        /Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce/,
        /Software\\Microsoft\\Windows\\CurrentVersion\\RunServices/,
        /Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Run/,
        /Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer\\Run/,
      ];

      const foundAutorun: string[] = [];
      for (const s of strings) {
        for (const pattern of autorunPatterns) {
          if (pattern.test(s)) {
            foundAutorun.push(s.substring(0, 80));
            break;
          }
        }
      }

      if (foundAutorun.length > 0) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'persistence',
            'registry-autorun',
            'Registery autorun keys detected, indicating persistence via registry',
            {
              confidence: 0.9,
              featureIds: stringFeatures
                .filter((f) => {
                  const s = String(f.value);
                  return autorunPatterns.some((p) => p.test(s));
                })
                .map((f) => f.id),
              locations: [],
              metadata: { entries: foundAutorun, count: foundAutorun.length },
            },
          ),
        );
      }

      // Scheduled tasks
      const schtaskPatterns = [
        /schtasks\s+\/create/i,
        /schtasks\s+\/run/i,
        /at\s+\d{2}:\d{2}/i,
        /ScheduledTasks/,
        /TaskScheduler/,
      ];

      const foundTasks: string[] = [];
      for (const s of strings) {
        for (const pattern of schtaskPatterns) {
          if (pattern.test(s)) {
            foundTasks.push(s.substring(0, 80));
            break;
          }
        }
      }

      if (foundTasks.length > 0) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'persistence',
            'scheduled-task',
            'Scheduled task creation detected',
            {
              confidence: 0.9,
              featureIds: stringFeatures
                .filter((f) => {
                  const s = String(f.value);
                  return schtaskPatterns.some((p) => p.test(s));
                })
                .map((f) => f.id),
              locations: [],
              metadata: { tasks: foundTasks, count: foundTasks.length },
            },
          ),
        );
      }

      // Linux cron jobs
      const cronPatterns = [
        /\/etc\/cron\.(daily|weekly|monthly|hourly)/,
        /\/var\/spool\/cron/,
        /crontab\s+-[ae]/,
        /@reboot\s+/,
        /@daily\s+/,
        /systemd\/system\//,
      ];

      const foundCron: string[] = [];
      for (const s of strings) {
        for (const pattern of cronPatterns) {
          if (pattern.test(s)) {
            foundCron.push(s.substring(0, 80));
            break;
          }
        }
      }

      if (foundCron.length > 0) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'persistence',
            'cron-persistence',
            'Cron job or systemd service detected, indicating Linux persistence',
            {
              confidence: 0.9,
              featureIds: stringFeatures
                .filter((f) => {
                  const s = String(f.value);
                  return cronPatterns.some((p) => p.test(s));
                })
                .map((f) => f.id),
              locations: [],
              metadata: { entries: foundCron, count: foundCron.length },
            },
          ),
        );
      }

      // Startup folder
      const startupPatterns = [
        /\\Microsoft\\Windows\\Start Menu\\Programs\\Startup/,
        /Startup\\/,
        /~\/(\.config\/autostart|\.config\/systemd)/,
      ];

      const foundStartup: string[] = [];
      for (const s of strings) {
        for (const pattern of startupPatterns) {
          if (pattern.test(s)) {
            foundStartup.push(s.substring(0, 80));
            break;
          }
        }
      }

      if (foundStartup.length > 0) {
        evidenceList.push(
          this.makeEvidence(
            context.artifact.id,
            'persistence',
            'startup-folder',
            'Startup folder paths detected, indicating file-based persistence',
            {
              confidence: 0.8,
              featureIds: stringFeatures
                .filter((f) => {
                  const s = String(f.value);
                  return startupPatterns.some((p) => p.test(s));
                })
                .map((f) => f.id),
              locations: [],
              metadata: { entries: foundStartup, count: foundStartup.length },
            },
          ),
        );
      }
    } catch (error) {
      issues.push(
        this.error(
          'PERSISTENCE_ANALYSIS_ERROR',
          `Failed to analyze persistence: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const endTime = Date.now();
    return this.ok(evidenceList, { startTime, endTime, issues });
  }
}
