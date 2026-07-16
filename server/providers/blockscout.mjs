import { HttpError } from '../http.mjs';

export function createBlockscoutProvider(config) {
  const origin = config.blockscoutOrigin;

  function safeApiPath(rawPath) {
    if (!rawPath || typeof rawPath !== 'string') return null;
    let decoded;
    try { decoded = decodeURIComponent(rawPath); } catch { return null; }
    if (!decoded.startsWith('/api/v2/')) return null;
    if (decoded.includes('://') || decoded.includes('..')) return null;
    return decoded;
  }

  async function request(path) {
    const apiPath = safeApiPath(path);
    if (!apiPath) throw new HttpError(400, 'Bad Blockscout API path. Must start with /api/v2/.');
    const upstreamUrl = new URL(apiPath, origin);
    let upstream;
    try {
      upstream = await fetch(upstreamUrl, {
        headers: { accept: 'application/json', 'user-agent': 'HoodScan/0.2 foundation' }
      });
    } catch (error) {
      throw new HttpError(502, 'Blockscout fetch failed', { source: upstreamUrl.toString(), message: error.message });
    }
    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (!upstream.ok) {
      throw new HttpError(upstream.status, data?.message || data?.error || 'Blockscout error', { source: upstreamUrl.toString(), data });
    }
    return { data, source: upstreamUrl.toString(), status: upstream.status };
  }

  return {
    origin,
    safeApiPath,
    request,
    stats: () => request('/api/v2/stats'),
    mainTransactions: () => request('/api/v2/main-page/transactions'),
    mainBlocks: () => request('/api/v2/main-page/blocks'),
    tokens: () => request('/api/v2/tokens?type=ERC-20'),
    search: (query) => request(`/api/v2/search?q=${encodeURIComponent(query)}`),
    token: (address) => request(`/api/v2/tokens/${address}`),
    tokenHolders: (address) => request(`/api/v2/tokens/${address}/holders`),
    tokenTransfers: (address) => request(`/api/v2/tokens/${address}/transfers`),
    address: (address) => request(`/api/v2/addresses/${address}`),
    addressTransactions: (address) => request(`/api/v2/addresses/${address}/transactions`),
    addressTokenTransfers: (address) => request(`/api/v2/addresses/${address}/token-transfers`),
    transaction: (hash) => request(`/api/v2/transactions/${hash}`),
    block: (height) => request(`/api/v2/blocks/${height}`)
  };
}
