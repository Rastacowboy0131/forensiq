import http from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './server/config.mjs';
import { createAppContext } from './server/context.mjs';
import { handleApi } from './server/routes.mjs';
import { json, ok, HttpError } from './server/http.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const config = await loadConfig();
const ctx = createAppContext(config);

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.ico', 'image/x-icon']
]);

async function proxyBlockscout(req, res, url) {
  const pathParam = url.searchParams.get('path');
  try {
    const result = await ctx.blockscout.request(pathParam);
    return ok(res, result.data, { 'cache-control': 'public, max-age=8', 'x-hoodscan-source': result.source });
  } catch (error) {
    if (error instanceof HttpError) return json(res, error.status, { error: error.message, ...error.details });
    return json(res, 502, { error: 'Blockscout fetch failed', message: error.message });
  }
}

async function serveStatic(req, res, url) {
  let requestedPath = decodeURIComponent(url.pathname);
  if (requestedPath === '/') requestedPath = '/index.html';
  const filePath = path.normalize(path.join(publicDir, requestedPath));
  if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
    const fallback = path.join(publicDir, 'index.html');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    createReadStream(fallback).pipe(res);
    return;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, { 'content-type': contentTypes.get(ext) || 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/health') {
      return ok(res, {
        ok: true,
        blockscout: config.blockscoutOrigin,
        quickNodeRpcConfigured: ctx.rpc.rpcUrlConfigured,
        quickNodeWsConfigured: ctx.rpc.wsUrlConfigured,
        hoodIdConfigured: ctx.hoodId.configured
      });
    }
    if (url.pathname === '/api/blockscout') return proxyBlockscout(req, res, url);
    if (url.pathname.startsWith('/api/')) return handleApi(req, res, url, ctx);
    return serveStatic(req, res, url);
  } catch (error) {
    console.error('HoodScan server error:', error);
    if (error instanceof HttpError && !res.headersSent) return json(res, error.status, { error: error.message, ...error.details });
    if (!res.headersSent) return json(res, 500, { error: 'Internal server error', message: error.message });
    res.end();
  }
});

server.listen(config.port, () => {
  console.log(`HoodScan running at http://localhost:${config.port}`);
  console.log(`Blockscout provider: ${config.blockscoutOrigin}`);
  console.log(`QuickNode RPC configured: ${ctx.rpc.rpcUrlConfigured}`);
});
