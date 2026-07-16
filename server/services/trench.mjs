import { EVENT_TYPES } from './events.mjs';

function nowIso() { return new Date().toISOString(); }
function addressHash(value) { return typeof value === 'string' ? value : value?.hash || null; }
function shortAddr(value = '') { return value ? `${String(value).slice(0, 6)}…${String(value).slice(-4)}` : '—'; }
function numeric(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function jsonArray(value) {
  try { return JSON.parse(value || '[]'); } catch { return []; }
}

const WHALE_VALUE_WEI = 10n * 10n ** 18n;

export function createTrenchService({ db, blockscout, marketIntel, events }) {
  function serializeEvent(event) {
    return {
      event_type: event.eventType,
      severity: event.severity,
      subject_address: event.subjectAddress,
      token_address: event.tokenAddress,
      wallet_address: event.walletAddress,
      tx_hash: event.txHash,
      block_number: event.blockNumber,
      payload_json: JSON.stringify(event.payload || {}),
      premium_at: event.premiumAt,
      free_at: event.freeAt,
      created_at: event.createdAt
    };
  }

  function pairScore(row) {
    let score = 20;
    const why = [];
    if (numeric(row.volume_5m_usd) > 5000) { score += 25; why.push('5m volume above $5k'); }
    if (numeric(row.volume_1h_usd) > 25000) { score += 20; why.push('1h volume above $25k'); }
    if (numeric(row.buys_5m) > numeric(row.sells_5m)) { score += 15; why.push('buy pressure is stronger than sell pressure'); }
    if (numeric(row.whale_txs_5m) > 0) { score += 25; why.push(`${row.whale_txs_5m} whale tx(s) in recent window`); }
    if (numeric(row.liquidity_usd) > 25000) { score += 10; why.push('liquidity above $25k'); }
    if (!why.length) why.push('listed for trench monitoring; waiting for live pair logs');
    return { score: Math.max(0, Math.min(100, score)), why };
  }

  function hydratePair(row) {
    return {
      ...row,
      why: jsonArray(row.why_json),
      scoreTone: row.trench_score >= 80 ? 'green' : row.trench_score >= 55 ? 'yellow' : ''
    };
  }

  function hydrateWhale(row) {
    return row;
  }

  async function ingestMarketPairs({ limit = 12, source = 'market-feed' } = {}) {
    db.ensureReady();
    const summary = { pairsUpserted: 0, alertsCreated: 0, whaleMovementsCreated: 0, errors: [] };
    let markets;
    try {
      markets = await marketIntel.markets('top');
    } catch (error) {
      summary.errors.push(`Market feed failed: ${error.message}`);
      markets = { items: [] };
    }

    const items = (markets.items || []).slice(0, limit);
    for (const item of items) {
      const pairAddress = item.pairAddress || item.address || item.tokenAddress || `synthetic:${item.pair || item.tokenSymbol || summary.pairsUpserted}`;
      const row = {
        pair_address: pairAddress,
        token0_address: item.address || item.tokenAddress || null,
        token1_address: item.quoteAddress || null,
        symbol: item.pair || `${item.tokenSymbol || 'TOKEN'} / WETH`,
        dex: item.venue || 'Blockscout/market feed',
        liquidity_usd: numeric(item.liquidityUsd, null),
        volume_5m_usd: numeric(item.volume5mUsd || item.volume_5m_usd, 0),
        volume_1h_usd: numeric(item.volume1hUsd || item.volume_1h_usd || item.volume24hUsd, 0) / (item.volume1hUsd || item.volume_1h_usd ? 1 : 24),
        buys_5m: numeric(item.buys5m || item.buys24h, 0),
        sells_5m: numeric(item.sells5m || item.sells24h, 0),
        whale_txs_5m: numeric(item.whaleTxs5m, 0),
        last_seen_at: nowIso(),
        updated_at: nowIso()
      };
      const scored = pairScore(row);
      row.trench_score = scored.score;
      row.why_json = JSON.stringify(scored.why);
      db.upsert('pairs', ['pair_address'], row);
      summary.pairsUpserted += 1;

      if (row.volume_5m_usd >= 5000 || row.whale_txs_5m > 0) {
        const existing = db.get('SELECT id FROM events WHERE event_type = ? AND subject_address = ? AND datetime(created_at) > datetime(?, \'-10 minutes\') LIMIT 1', [EVENT_TYPES.PAIR_VOLUME_SPIKE, pairAddress, nowIso()]);
        if (!existing) {
          db.insert('events', serializeEvent(events.buildAlertEvent(EVENT_TYPES.PAIR_VOLUME_SPIKE, {
            pair: row.symbol,
            pairAddress,
            volume5mUsd: row.volume_5m_usd,
            volume1hUsd: row.volume_1h_usd,
            buys5m: row.buys_5m,
            sells5m: row.sells_5m,
            trenchScore: row.trench_score,
            why: scored.why,
            reason: scored.why.join('; '),
            source
          }, { severity: row.trench_score >= 80 ? 'high' : 'info', subjectAddress: pairAddress } )));
          summary.alertsCreated += 1;
        }
      }
    }

    try {
      const txPayload = await blockscout.mainTransactions();
      const txs = Array.isArray(txPayload.data) ? txPayload.data.slice(0, limit) : [];
      for (const tx of txs) {
        const value = BigInt(String(tx.value || '0'));
        if (value < WHALE_VALUE_WEI) continue;
        const wallet = addressHash(tx.from);
        if (!wallet || !tx.hash) continue;
        const exists = db.get('SELECT id FROM whale_movements WHERE tx_hash = ? LIMIT 1', [tx.hash]);
        if (exists) continue;
        const amountEth = Number(value / (10n ** 14n)) / 10000;
        const amountUsd = amountEth * numeric(tx.exchange_rate, 0);
        const reason = amountUsd > 0 ? `Large native transfer worth about $${Math.round(amountUsd).toLocaleString()}` : `Large native transfer of ${amountEth} ETH`;
        db.insert('whale_movements', {
          wallet_address: wallet,
          token_address: null,
          pair_address: null,
          side: 'move',
          amount_usd: amountUsd || null,
          tx_hash: tx.hash,
          reason,
          created_at: tx.timestamp || nowIso()
        });
        db.insert('events', serializeEvent(events.buildAlertEvent(EVENT_TYPES.WHALE_WALLET_MOVE, {
          wallet,
          txHash: tx.hash,
          amountEth,
          amountUsd,
          reason,
          to: addressHash(tx.to),
          source
        }, { severity: 'high', walletAddress: wallet, txHash: tx.hash, blockNumber: Number(tx.block_number || 0) || null })));
        summary.whaleMovementsCreated += 1;
        summary.alertsCreated += 1;
      }
    } catch (error) {
      summary.errors.push(`Whale movement scan failed: ${error.message}`);
    }

    return { ...summary, overview: await overview() };
  }

  async function overview() {
    db.ensureReady();
    const hotPairs = db.all('SELECT * FROM pairs ORDER BY trench_score DESC, volume_5m_usd DESC, datetime(updated_at) DESC LIMIT 25').map(hydratePair);
    const whaleMoves = db.all('SELECT * FROM whale_movements ORDER BY datetime(created_at) DESC, id DESC LIMIT 25').map(hydrateWhale);
    const trenchAlerts = db.all(`SELECT * FROM events WHERE event_type IN ('PAIR_VOLUME_SPIKE','WHALE_BUY','WHALE_SELL','WHALE_WALLET_MOVE','LIQUIDITY_ADDED','LIQUIDITY_REMOVED','NEW_PAIR_CREATED','FRESH_WALLET_BUY') ORDER BY datetime(created_at) DESC, id DESC LIMIT 25`).map(row => {
      let payload = {};
      try { payload = JSON.parse(row.payload_json || '{}'); } catch {}
      return { id: row.id, eventType: row.event_type, severity: row.severity, subjectAddress: row.subject_address, tokenAddress: row.token_address, walletAddress: row.wallet_address, txHash: row.tx_hash, blockNumber: row.block_number, payload, createdAt: row.created_at };
    });
    const topScore = hotPairs[0]?.trench_score || 0;
    return {
      status: {
        mode: hotPairs.length ? 'market-feed-backed' : 'waiting-for-pair-data',
        hotPairs: hotPairs.length,
        whaleMoves: whaleMoves.length,
        trenchAlerts: trenchAlerts.length,
        topScore,
        note: 'MVP uses Blockscout/market-feed data now; QuickNode pair logs can replace the heuristics for instant swap-level precision.'
      },
      hotPairs,
      whaleMoves,
      trenchAlerts,
      watchlists: db.all('SELECT * FROM wallet_watchlist ORDER BY updated_at DESC LIMIT 20')
    };
  }

  function seedFixture() {
    db.ensureReady();
    const pairAddress = 'fixture:HOODRAT-WETH';
    const row = {
      pair_address: pairAddress,
      token0_address: '0x1111111111111111111111111111111111111111',
      token1_address: '0x2222222222222222222222222222222222222222',
      symbol: 'HOODRAT / WETH',
      dex: 'Fixture DEX',
      liquidity_usd: 71000,
      volume_5m_usd: 84000,
      volume_1h_usd: 220000,
      buys_5m: 42,
      sells_5m: 18,
      whale_txs_5m: 4,
      last_seen_at: nowIso(),
      updated_at: nowIso()
    };
    const scored = pairScore(row);
    row.trench_score = scored.score;
    row.why_json = JSON.stringify(scored.why);
    db.upsert('pairs', ['pair_address'], row);
    db.insert('whale_movements', {
      wallet_address: '0x3333333333333333333333333333333333333333',
      token_address: row.token0_address,
      pair_address: pairAddress,
      side: 'buy',
      amount_usd: 18250,
      tx_hash: '0x' + 'b'.repeat(64),
      reason: 'Fixture whale buy for Trench smoke test',
      created_at: nowIso()
    });
    db.insert('events', serializeEvent(events.buildAlertEvent(EVENT_TYPES.PAIR_VOLUME_SPIKE, {
      pair: row.symbol,
      pairAddress,
      volume5mUsd: row.volume_5m_usd,
      buys5m: row.buys_5m,
      sells5m: row.sells_5m,
      trenchScore: row.trench_score,
      why: scored.why,
      reason: scored.why.join('; ')
    }, { severity: 'high', subjectAddress: pairAddress })));
    return { pair: hydratePair(row), whaleMoves: 1 };
  }

  return { ingestMarketPairs, overview, seedFixture };
}
