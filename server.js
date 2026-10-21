import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getReport } from './src/report.js';

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https://coin-images.coingecko.com https://assets.coingecko.com",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

function send(res, status, body, type) {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed', 'text/plain');
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/api/recommendations') {
    try {
      const data = await getReport(url.searchParams.get('refresh') === '1');
      return send(res, 200, JSON.stringify(data), 'application/json; charset=utf-8');
    } catch (e) {
      console.error(e);
      return send(res, 502, JSON.stringify({ error: 'Failed to fetch market data' }), 'application/json');
    }
  }

  let rel;
  try {
    rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  } catch {
    return send(res, 400, 'Bad Request', 'text/plain');
  }
  const filePath = path.resolve(PUBLIC_DIR, '.' + path.posix.normalize(rel));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
  try {
    const body = await readFile(filePath);
    send(res, 200, body, MIME[path.extname(filePath)] || 'application/octet-stream');
  } catch {
    send(res, 404, 'Not Found', 'text/plain');
  }
});

server.listen(PORT, () => {
  console.log(`Explode Radar running at http://localhost:${PORT}`);
  getReport().catch((e) => console.error('Initial fetch failed:', e.message));
});
