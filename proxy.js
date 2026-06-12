#!/usr/bin/env node
// Simple CORS proxy — no dependencies, just Node.js built-ins.
// Usage: node proxy.js [port]
const http  = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = parseInt(process.argv[2] || '3001', 10);

const server = http.createServer((req, res) => {
  // Allow the browser app to call this proxy (including from HTTPS pages via Chrome's Private Network Access)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'POST' || req.url !== '/proxy') {
    res.writeHead(404); res.end('Not found'); return;
  }

  let raw = '';
  req.on('data', chunk => raw += chunk);
  req.on('end', () => {
    let payload;
    try { payload = JSON.parse(raw); } catch {
      res.writeHead(400); res.end('Bad JSON'); return;
    }

    const { url, method = 'GET', headers = {}, body } = payload;
    if (!url) { res.writeHead(400); res.end('Missing url'); return; }

    let target;
    try { target = new URL(url); } catch {
      res.writeHead(400); res.end('Invalid URL'); return;
    }

    const lib = target.protocol === 'https:' ? https : http;
    const reqBody = body ? Buffer.from(body) : null;

    const outHeaders = { ...headers };
    if (reqBody) outHeaders['content-length'] = reqBody.length;

    const options = {
      hostname: target.hostname,
      port:     target.port || (target.protocol === 'https:' ? 443 : 80),
      path:     target.pathname + target.search,
      method,
      headers:  outHeaders,
    };

    console.log(`→ ${method} ${url}`);
    console.log('  headers:', JSON.stringify(outHeaders));

    const proxyReq = lib.request(options, proxyRes => {
      console.log(`← ${proxyRes.statusCode} ${proxyRes.statusMessage}`);
      // Forward status + all original response headers, plus CORS header
      const fwdHeaders = { ...proxyRes.headers, 'access-control-allow-origin': '*' };
      res.writeHead(proxyRes.statusCode, fwdHeaders);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', err => {
      if (!res.headersSent) res.writeHead(502);
      res.end(JSON.stringify({ error: err.message }));
    });

    if (reqBody) proxyReq.write(reqBody);
    proxyReq.end();
  });
});

server.listen(PORT, '127.0.0.1', () =>
  console.log(`Proxy listening on http://localhost:${PORT}/proxy  (Ctrl+C to stop)`)
);
