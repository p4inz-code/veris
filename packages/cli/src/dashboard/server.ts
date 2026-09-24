/**
 * @veris/cli/dashboard/server — Zero-dependency local loopback HTTP server.
 *
 * Implements Section 4 of ADR-017:
 * - Binds strictly to 127.0.0.1 (never 0.0.0.0)
 * - Emits strict CSP and anti-framing security headers
 * - Serves the self-contained dashboard HTML artifact
 * - Cross-platform browser opening with clean shutdown
 *
 * @module @veris/cli/dashboard/server
 */

import { exec } from 'node:child_process';
import * as http from 'node:http';

import type { DashboardServerInstance } from './types.js';

export interface ServerOptions {
  /** The rendered HTML content to serve. */
  readonly html: string;
  /** Desired port, or 0 for ephemeral port. */
  readonly port?: number;
  /** If true, do not attempt to open browser automatically. */
  readonly noOpen?: boolean;
}

/**
 * Starts a local HTTP server bound exclusively to loopback (127.0.0.1).
 */
export async function startDashboardServer(
  options: ServerOptions,
): Promise<DashboardServerInstance> {
  const desiredPort = options.port ?? 0;
  const htmlBuffer = Buffer.from(options.html, 'utf-8');

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // Security headers for all responses
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none';",
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

      const url = req.url?.split('?')[0] ?? '/';

      if (url === '/' || url === '/index.html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Length', htmlBuffer.length);
        res.writeHead(200);
        res.end(htmlBuffer);
        return;
      }

      if (url === '/health' || url === '/status') {
        const body = JSON.stringify({ status: 'ok', time: new Date().toISOString() });
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.writeHead(200);
        res.end(body);
        return;
      }

      // Default 404
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.writeHead(404);
      res.end('Not Found');
    });

    server.on('error', (err) => {
      reject(err);
    });

    // Listen STRICTLY on 127.0.0.1 (loopback)
    server.listen(desiredPort, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to obtain server address.'));
        return;
      }

      const port = address.port;
      const url = `http://127.0.0.1:${port}`;

      if (!options.noOpen) {
        openBrowser(url);
      }

      const instance: DashboardServerInstance = {
        port,
        url,
        close: async () => {
          return new Promise<void>((resClose, rejClose) => {
            const extServer = server as http.Server & { closeAllConnections?: () => void };
            if (typeof extServer.closeAllConnections === 'function') {
              extServer.closeAllConnections();
            }
            server.close((err) => {
              if (err) rejClose(err);
              else resClose();
            });
          });
        },
      };

      resolve(instance);
    });
  });
}

/**
 * Attempts to launch the platform's default web browser without blocking.
 */
function openBrowser(url: string): void {
  try {
    const platform = process.platform;
    let command: string;

    if (platform === 'darwin') {
      command = `open "${url}"`;
    } else if (platform === 'win32') {
      command = `start "" "${url}"`;
    } else {
      command = `xdg-open "${url}"`;
    }

    exec(command, () => {
      // Fire-and-forget: ignore any browser launch errors (e.g. headless environment)
    });
  } catch {
    // Non-fatal if browser opening fails
  }
}
