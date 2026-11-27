import http from 'node:http';
import fs from 'node:fs';
import { loadConfig } from './config.js';
import { statusJsonPath } from './paths.js';
import { readToken } from './token_mgmt.js';
import { bearerEqual, redactSecrets } from './util.js';

const FAIL_WINDOW_MS = 60_000;
const FAIL_LIMIT = 30;
const failMap = new Map();

function clientKey(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) return cf.trim();
  return req.socket.remoteAddress || 'unknown';
}

function rateLimited(key) {
  const now = Date.now();
  let entry = failMap.get(key);
  if (!entry || now - entry.start > FAIL_WINDOW_MS) {
    entry = { start: now, count: 0 };
    failMap.set(key, entry);
  }
  entry.count += 1;
  // LRU-ish cap
  if (failMap.size > 500) {
    const first = failMap.keys().next().value;
    failMap.delete(first);
  }
  return entry.count > FAIL_LIMIT;
}

function logLine(...parts) {
  const msg = redactSecrets(parts.join(' '));
  console.log(new Date().toISOString(), msg);
}

export function startServer({ port } = {}) {
  const cfg = loadConfig();
  const listenPort = port || cfg.port || 8787;

  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url || '/', `http://127.0.0.1:${listenPort}`);
      if (req.method === 'GET' && url.pathname === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('ok');
        return;
      }
      if (req.method === 'GET' && url.pathname === '/status.json') {
        const key = clientKey(req);
        const token = readToken();
        const auth = req.headers.authorization || '';
        const got = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
        if (!token || !bearerEqual(got, token)) {
          if (rateLimited(key)) {
            res.writeHead(429, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('');
            logLine('429', key);
            return;
          }
          res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('');
          logLine('401', key);
          return;
        }
        const p = statusJsonPath();
        if (!fs.existsSync(p)) {
          res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end('{"error":"not_ready"}');
          return;
        }
        const body = fs.readFileSync(p);
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        });
        res.end(body);
        return;
      }
      res.writeHead(404);
      res.end('');
    } catch (e) {
      logLine('serve error', e?.message || e);
      res.writeHead(500);
      res.end('');
    }
  });

  server.listen(listenPort, '127.0.0.1', () => {
    logLine(`listening 127.0.0.1:${listenPort}`);
  });
  return server;
}
