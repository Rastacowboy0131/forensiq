const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function safeShort(address = '') {
  const value = String(address || '');
  if (!value) return 'Unknown';
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function normalizeToken(token = {}, address = '') {
  return {
    address: token.address_hash || token.address || address,
    symbol: token.symbol || 'TOKEN',
    name: token.name || token.symbol || 'Unknown token',
    decimals: num(token.decimals, 18),
    holdersCount: num(token.holders_count, 0),
    transfersCount: num(token.transfers_count, 0),
    priceUsd: token.exchange_rate === null ? null : token.exchange_rate,
    marketCapUsd: token.circulating_market_cap === null ? null : token.circulating_market_cap,
    volume24hUsd: token.volume_24h === null ? null : token.volume_24h,
    totalSupply: token.total_supply || '0',
    reputation: token.reputation || 'ok',
    type: token.type || 'ERC-20'
  };
}

function normalizeHolder(holder = {}, index = 0, totalSupply = '0') {
  const address = holder.address?.hash || holder.address_hash || holder.hash || holder.address || ZERO_ADDRESS;
  let pct = num(holder.value_percentage, NaN);
  if (!Number.isFinite(pct) && holder.value && totalSupply) {
    try {
      const value = BigInt(String(holder.value));
      const supply = BigInt(String(totalSupply));
      pct = supply > 0n ? Number((value * 1_000_000n) / supply) / 10_000 : 0;
    } catch { pct = 0; }
  }
  if (!Number.isFinite(pct)) pct = 0;
  return {
    rank: index + 1,
    address,
    label: holder.address?.name || holder.address?.ens_domain_name || safeShort(address),
    hoodName: holder.address?.ens_domain_name || null,
    balance: holder.value || holder.balance || '0',
    percentage: pct,
    bucket: pct >= 10 ? 'whale' : pct >= 3 ? 'large' : pct >= 1 ? 'mid' : 'retail',
    riskTags: [
      pct >= 20 ? 'supply whale' : null,
      holder.address?.is_contract ? 'contract holder' : null,
      address.toLowerCase() === ZERO_ADDRESS ? 'burn/null' : null
    ].filter(Boolean)
  };
}

function buildFindings({ token, holders, sourceNotes = [] }) {
  const top1 = holders[0]?.percentage || 0;
  const top5 = holders.slice(0, 5).reduce((sum, h) => sum + num(h.percentage), 0);
  const top10 = holders.slice(0, 10).reduce((sum, h) => sum + num(h.percentage), 0);
  const holdersCount = token.holdersCount || holders.length;
  const findings = [];

  if (top1 >= 35) findings.push({ severity: 'high', title: 'Dominant top holder', detail: `Top holder controls ${top1.toFixed(2)}% of supply.` });
  else if (top1 >= 15) findings.push({ severity: 'medium', title: 'Large top holder', detail: `Top holder controls ${top1.toFixed(2)}% of supply.` });
  else findings.push({ severity: 'low', title: 'Top holder below whale threshold', detail: `Top holder controls ${top1.toFixed(2)}% of visible supply.` });

  if (top10 >= 70) findings.push({ severity: 'high', title: 'Top-10 concentration risk', detail: `Top 10 holders control ${top10.toFixed(2)}%.` });
  else if (top10 >= 45) findings.push({ severity: 'medium', title: 'Moderate top-10 concentration', detail: `Top 10 holders control ${top10.toFixed(2)}%.` });
  else findings.push({ severity: 'low', title: 'Distributed holder base', detail: `Top 10 holders control ${top10.toFixed(2)}%.` });

  if (holdersCount < 25) findings.push({ severity: 'high', title: 'Thin holder count', detail: `${holdersCount} holders is easy to manipulate.` });
  else if (holdersCount < 150) findings.push({ severity: 'medium', title: 'Early holder base', detail: `${holdersCount} holders — still early and volatile.` });
  else findings.push({ severity: 'low', title: 'Holder count healthy', detail: `${holdersCount} holders indexed.` });

  if (token.reputation && token.reputation !== 'ok') findings.push({ severity: 'high', title: 'Blockscout reputation flag', detail: `Reputation: ${token.reputation}.` });
  if (!token.priceUsd) findings.push({ severity: 'medium', title: 'No reliable price feed', detail: 'DEX/reference price is missing from current source.' });
  if (!token.volume24hUsd) findings.push({ severity: 'medium', title: 'Low/no reported volume', detail: '24h volume is missing or zero.' });
  sourceNotes.forEach(note => findings.push(note));

  return { findings, top1, top5, top10 };
}

function scoreRisk({ token, holders, concentration }) {
  let risk = 18;
  risk += concentration.top1 >= 35 ? 28 : concentration.top1 >= 15 ? 15 : 3;
  risk += concentration.top10 >= 70 ? 24 : concentration.top10 >= 45 ? 12 : 2;
  risk += token.holdersCount < 25 ? 16 : token.holdersCount < 150 ? 8 : 0;
  risk += token.reputation && token.reputation !== 'ok' ? 22 : 0;
  risk += token.priceUsd ? -4 : 6;
  risk += token.volume24hUsd ? -4 : 7;
  risk += holders.filter(h => h.bucket === 'whale').length >= 3 ? 8 : 0;
  const riskScore = clamp(Math.round(risk));
  const safetyScore = clamp(100 - riskScore);
  const level = riskScore >= 75 ? 'extreme' : riskScore >= 55 ? 'high' : riskScore >= 35 ? 'medium' : 'low';
  const verdict = level === 'extreme' ? 'Do not ape blind' : level === 'high' ? 'High caution' : level === 'medium' ? 'Needs review' : 'Looks cleaner';
  return { riskScore, safetyScore, level, verdict };
}

function buildBubbleMap({ token, holders }) {
  const center = { id: 'token', kind: 'token', label: token.symbol, address: token.address, size: 26, x: 50, y: 50, percentage: 100 };
  const nodes = [center];
  const links = [];
  const top = holders.slice(0, 24);
  top.forEach((holder, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(top.length, 1);
    const ring = index < 8 ? 23 : index < 16 ? 34 : 43;
    const x = 50 + Math.cos(angle) * ring;
    const y = 50 + Math.sin(angle) * ring;
    const size = clamp(8 + Math.sqrt(Math.max(holder.percentage, 0)) * 5, 8, 28);
    nodes.push({
      id: holder.address,
      kind: 'holder',
      label: holder.hoodName || holder.label,
      address: holder.address,
      rank: holder.rank,
      size,
      x: clamp(x, 5, 95),
      y: clamp(y, 7, 93),
      percentage: holder.percentage,
      bucket: holder.bucket,
      riskTags: holder.riskTags
    });
    links.push({ source: 'token', target: holder.address, value: holder.percentage, kind: 'holds' });
  });

  // MVP relationship hints: connect similarly-sized whale/large wallets so the UI already feels like a holder graph.
  for (let i = 0; i < top.length - 1; i += 1) {
    const a = top[i];
    const b = top[i + 1];
    if ((a.bucket === 'whale' || a.bucket === 'large') && (b.bucket === 'whale' || b.bucket === 'large')) {
      links.push({ source: a.address, target: b.address, value: Math.min(a.percentage, b.percentage) / 2, kind: 'cluster-hint' });
    }
  }

  return { nodes, links, legend: [
    { bucket: 'whale', label: '10%+ holder', tone: 'red' },
    { bucket: 'large', label: '3–10% holder', tone: 'yellow' },
    { bucket: 'mid', label: '1–3% holder', tone: 'green' },
    { bucket: 'retail', label: '<1% holder', tone: 'muted' }
  ] };
}

function fallbackHolders() {
  return [22.4, 13.2, 8.8, 6.1, 4.5, 3.4, 2.9, 2.3, 1.7, 1.4, 1.1, 0.9].map((percentage, index) => normalizeHolder({
    address: { hash: `0x${String(index + 1).padStart(40, String((index + 1) % 10))}` },
    value_percentage: percentage,
    value: String(Math.round(percentage * 1_000_000))
  }, index));
}

export function createHoodSafeService({ blockscout, marketIntel }) {
  async function tokenSnapshot(address) {
    const notes = [];
    let token = normalizeToken({}, address);
    let holders = [];
    let source = 'fallback';

    try {
      const tokenRes = await blockscout.token(address);
      token = normalizeToken(tokenRes.data, address);
      source = tokenRes.source;
    } catch (error) {
      notes.push({ severity: 'medium', title: 'Token metadata fallback', detail: `Blockscout token metadata unavailable: ${error.message}` });
    }

    try {
      const holdersRes = await blockscout.tokenHolders(address);
      holders = (holdersRes.data.items || []).map((holder, index) => normalizeHolder(holder, index, token.totalSupply));
      source = holdersRes.source;
    } catch (error) {
      notes.push({ severity: 'medium', title: 'Holder fallback map', detail: `Live holders unavailable: ${error.message}` });
      holders = fallbackHolders();
    }

    const concentration = buildFindings({ token, holders, sourceNotes: notes });
    const score = scoreRisk({ token, holders, concentration });
    const map = buildBubbleMap({ token, holders });
    return {
      token,
      score,
      concentration: {
        top1: concentration.top1,
        top5: concentration.top5,
        top10: concentration.top10,
        holderCount: token.holdersCount || holders.length
      },
      findings: concentration.findings,
      holders,
      map,
      source,
      updatedAt: new Date().toISOString(),
      methodology: [
        'Top-holder concentration',
        'Top-10 concentration',
        'Holder count depth',
        'Blockscout reputation',
        'Price/volume availability',
        'Whale cluster hints'
      ]
    };
  }

  async function bubbleMap(address) {
    const snapshot = await tokenSnapshot(address);
    return { token: snapshot.token, score: snapshot.score, concentration: snapshot.concentration, map: snapshot.map, source: snapshot.source, updatedAt: snapshot.updatedAt };
  }

  async function watchlist() {
    try {
      const tokens = await blockscout.tokens();
      const items = (tokens.data.items || []).slice(0, 12).map((raw, index) => {
        const token = normalizeToken(raw, raw.address_hash);
        let riskScore = 26;
        if (!token.priceUsd) riskScore += 8;
        if (!token.volume24hUsd) riskScore += 8;
        if (token.holdersCount < 25) riskScore += 18;
        else if (token.holdersCount < 150) riskScore += 8;
        if (token.reputation && token.reputation !== 'ok') riskScore += 22;
        return {
          rank: index + 1,
          address: token.address,
          symbol: token.symbol,
          name: token.name,
          priceUsd: token.priceUsd,
          volume24hUsd: token.volume24hUsd,
          liquidityUsd: null,
          holders: token.holdersCount,
          riskScore: clamp(riskScore),
          level: riskScore >= 70 ? 'high' : riskScore >= 50 ? 'medium' : 'low',
          reason: token.holdersCount < 150 ? 'Thin holder base / concentration scan needed' : 'Run holder concentration scan'
        };
      });
      return { items, source: tokens.source, upstreamOk: true, updatedAt: new Date().toISOString() };
    } catch (error) {
      const markets = await marketIntel.markets('top');
      const items = (markets.items || []).slice(0, 10).map((item, index) => {
        const holders = num(item.holders || item.traders24h, 0);
        const volume = num(item.volume24hUsd || item.volume24h, 0);
        const liquidity = num(item.liquidityUsd || item.liquidity, 0);
        let riskScore = 45;
        if (!liquidity) riskScore += 12;
        if (!volume) riskScore += 10;
        if (holders && holders < 100) riskScore += 10;
        if (/risk|scan|flag|pending/i.test(item.risk || '')) riskScore += 8;
        const address = item.tokenAddress || item.baseToken?.address || item.address || item.pairAddress || item.poolAddress || '';
        return {
          rank: index + 1,
          address,
          symbol: item.tokenSymbol || item.symbol || String(item.pair || 'TOKEN').split('/')[0].trim(),
          name: item.tokenName || item.name || item.pair || 'Market token',
          priceUsd: item.priceUsd || item.price,
          volume24hUsd: volume || null,
          liquidityUsd: liquidity || null,
          holders,
          riskScore: clamp(riskScore),
          level: riskScore >= 70 ? 'high' : riskScore >= 50 ? 'medium' : 'low',
          reason: item.risk || 'Market + holder scan needed'
        };
      });
      return { items, source: markets.source, upstreamOk: false, error: error.message, updatedAt: new Date().toISOString() };
    }
  }

  return { tokenSnapshot, bubbleMap, watchlist };
}
