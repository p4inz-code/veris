/**
 * Tests for local loopback dashboard HTTP server.
 *
 * @module @veris/cli/__tests__/dashboard/server.test
 */

import * as http from 'node:http';
import { describe, it, expect, afterEach } from 'vitest';
import { startDashboardServer } from '../../src/dashboard/server.js';
import type { DashboardServerInstance } from '../../src/dashboard/types.js';

function fetchHttp(
  url: string,
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            body,
          });
        });
      })
      .on('error', reject);
  });
}

describe('Dashboard Server', () => {
  let instance: DashboardServerInstance | undefined;

  afterEach(async () => {
    if (instance) {
      await instance.close();
      instance = undefined;
    }
  });

  it('starts loopback server on ephemeral port and serves HTML with security headers', async () => {
    const testHtml = '<!DOCTYPE html><html><body><h1>VERIS Test Dashboard</h1></body></html>';
    instance = await startDashboardServer({
      html: testHtml,
      port: 0,
      noOpen: true,
    });

    expect(instance.port).toBeGreaterThan(0);
    expect(instance.url).toBe(`http://127.0.0.1:${instance.port}`);

    const res = await fetchHttp(instance.url);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.body).toBe(testHtml);
  });

  it('responds with 200 OK on /health', async () => {
    instance = await startDashboardServer({
      html: '<html><body>Hello</body></html>',
      port: 0,
      noOpen: true,
    });

    const res = await fetchHttp(`${instance.url}/health`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    const parsed = JSON.parse(res.body);
    expect(parsed.status).toBe('ok');
  });

  it('returns 404 for unknown endpoints', async () => {
    instance = await startDashboardServer({
      html: '<html><body>Hello</body></html>',
      port: 0,
      noOpen: true,
    });

    const res = await fetchHttp(`${instance.url}/unrecognized-route`);
    expect(res.statusCode).toBe(404);
  });
});
