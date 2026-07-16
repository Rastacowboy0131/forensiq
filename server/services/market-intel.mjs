const PUBLIC_INTEL_ORIGIN = 'https://hoodscan.us.com';

export function createMarketIntelService({ blockscout }) {
  async function publicJson(path, fallback = null) {
    const url = new URL(path, PUBLIC_INTEL_ORIGIN);
    try {
      const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'HoodScan/0.3 market-intel' } });
      const text = await res.text();
      const data = JSON.parse(text);
      if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
      return { data, source: url.toString(), upstreamOk: true };
    } catch (error) {
      if (fallback !== null) return { data: fallback, source: url.toString(), upstreamOk: false, error: error.message };
      throw error;
    }
  }

  async function markets(tab = 'top') {
    const fallback = await marketsFallback(tab);
    const result = await publicJson(`/api/markets?tab=${encodeURIComponent(tab)}`, fallback);
    const items = Array.isArray(result.data?.items) ? result.data.items : Array.isArray(result.data) ? result.data : fallback.items;
    return { ...result.data, items, tab, source: result.source, upstreamOk: result.upstreamOk, error: result.error || null };
  }

  async function stockTokens() {
    const fallback = { items: [] };
    const result = await publicJson('/api/stock-tokens', fallback);
    return { ...result.data, source: result.source, upstreamOk: result.upstreamOk, error: result.error || null };
  }

  async function defiOverview() {
    const result = await publicJson('/api/defi/overview', {
      tvlUsd: null,
      dexVolume24hUsd: null,
      stablecoinSupplyUsd: null,
      protocolCount: null,
      categoryBreakdown: []
    });
    return { ...result.data, source: result.source, upstreamOk: result.upstreamOk, error: result.error || null };
  }

  async function bridgeDeposits() {
    const result = await publicJson('/api/arbitrum/deposits', { items: [] });
    return { ...result.data, source: result.source, upstreamOk: result.upstreamOk, error: result.error || null };
  }

  async function userOperations() {
    const result = await publicJson('/api/aa-operations', { items: [] });
    return { ...result.data, source: result.source, upstreamOk: result.upstreamOk, error: result.error || null };
  }

  async function gasTracker() {
    const result = await publicJson('/api/gas-tracker', {});
    return { ...result.data, source: result.source, upstreamOk: result.upstreamOk, error: result.error || null };
  }

  async function marketsFallback(tab) {
    try {
      const tokens = await blockscout.tokens();
      const items = (tokens.data.items || []).slice(0, 20).map((token, index) => ({
        rank: index + 1,
        pair: `${token.symbol || 'TOKEN'} / WETH`,
        tokenSymbol: token.symbol,
        tokenName: token.name,
        address: token.address_hash,
        venue: 'Blockscout token index',
        priceUsd: token.exchange_rate,
        change1h: null,
        change24h: null,
        liquidityUsd: null,
        volume24hUsd: token.volume_24h,
        buys24h: null,
        sells24h: null,
        traders24h: null,
        age: null,
        risk: Number(token.holders_count || 0) > 1000 ? 'Broad holder base' : 'Needs HoodSafe scan',
        holders: token.holders_count
      }));
      return { items, tab, source: tokens.source, upstreamOk: false, fallback: 'blockscout-tokens' };
    } catch (error) {
      return { items: [], tab, upstreamOk: false, error: error.message };
    }
  }

  return { markets, stockTokens, defiOverview, bridgeDeposits, userOperations, gasTracker };
}
