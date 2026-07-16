export class HttpError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function json(res, status, body, headers = {}) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    ...headers
  });
  res.end(JSON.stringify(body));
}

export function ok(res, body, headers = {}) {
  return json(res, 200, body, headers);
}

export function notFound(res) {
  return json(res, 404, { error: 'Not found' });
}

export function parseRoute(pathname, pattern) {
  const pathParts = pathname.split('/').filter(Boolean);
  const patternParts = pattern.split('/').filter(Boolean);
  if (pathParts.length !== patternParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i += 1) {
    const want = patternParts[i];
    const got = pathParts[i];
    if (want.startsWith(':')) params[want.slice(1)] = decodeURIComponent(got);
    else if (want !== got) return null;
  }
  return params;
}

export function isAddress(value = '') {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function isTxHash(value = '') {
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

export function normalizeAddress(value = '') {
  return String(value || '').toLowerCase();
}
