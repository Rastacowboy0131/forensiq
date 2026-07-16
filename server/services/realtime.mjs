import { EVENT_TYPES } from './events.mjs';

function nowIso() { return new Date().toISOString(); }
function hexToInt(value) {
  if (!value) return null;
  try { return Number.parseInt(String(value), 16); } catch { return null; }
}
function addressHash(value) { return typeof value === 'string' ? value : value?.hash || null; }
function blockTimestamp(block) { return block?.timestamp || nowIso(); }

export function createRealtimeService({ db, blockscout, rpc, events }) {
  async function migrate() {
    db.ensureReady();
    return status();
  }

  async function status() {
    db.ensureReady();
    return {
      databasePath: db.dbPath,
      quickNodeRpcConfigured: rpc.rpcUrlConfigured,
      quickNodeWsConfigured: rpc.wsUrlConfigured,
      counts: {
        blocks: db.count('blocks'),
        transactions: db.count('transactions'),
        events: db.count('events'),
        tokens: db.count('tokens'),
        addresses: db.count('addresses')
      }
    };
  }

  async function ingestLatest({ limit = 8, source = 'dry-run' } = {}) {
    db.ensureReady();
    const summary = {
      mode: rpc.rpcUrlConfigured ? 'quicknode-ready' : 'dry-run-blockscout',
      source,
      latestRpcBlock: null,
      blocksUpserted: 0,
      transactionsUpserted: 0,
      eventsCreated: 0,
      errors: []
    };

    if (rpc.rpcUrlConfigured) {
      try { summary.latestRpcBlock = hexToInt(await rpc.blockNumber()); }
      catch (error) { summary.errors.push(`QuickNode blockNumber failed: ${error.message}`); }
    }

    try {
      const blocksPayload = await blockscout.mainBlocks();
      const blocks = Array.isArray(blocksPayload.data) ? blocksPayload.data.slice(0, limit) : [];
      for (const block of blocks) {
        const height = Number(block.height);
        if (!Number.isFinite(height)) continue;
        db.upsert('blocks', ['height'], {
          height,
          hash: block.hash || null,
          timestamp: blockTimestamp(block),
          transactions_count: Number(block.transactions_count || 0),
          gas_used: block.gas_used ? String(block.gas_used) : null,
          updated_at: nowIso()
        });
        summary.blocksUpserted += 1;
      }
    } catch (error) {
      summary.errors.push(`Blockscout blocks ingest failed: ${error.message}`);
    }

    try {
      const txPayload = await blockscout.mainTransactions();
      const txs = Array.isArray(txPayload.data) ? txPayload.data.slice(0, limit) : [];
      for (const tx of txs) {
        if (!tx.hash) continue;
        db.upsert('transactions', ['hash'], {
          hash: tx.hash,
          block_number: Number(tx.block_number || tx.block || 0) || null,
          timestamp: tx.timestamp || nowIso(),
          from_address: addressHash(tx.from),
          to_address: addressHash(tx.to),
          method: tx.method || tx.transaction_tag || tx.result || null,
          status: tx.status || tx.result || null,
          value: tx.value ? String(tx.value) : null,
          gas_fee: tx.fee?.value ? String(tx.fee.value) : tx.transaction_fee ? String(tx.transaction_fee) : null,
          updated_at: nowIso()
        });
        const already = db.get('SELECT id FROM events WHERE event_type = ? AND tx_hash = ? LIMIT 1', ['TX_SEEN', tx.hash]);
        if (!already) {
          db.insert('events', serializeEvent(events.buildAlertEvent('TX_SEEN', {
            txHash: tx.hash,
            method: tx.method || tx.transaction_tag || 'transaction',
            from: addressHash(tx.from),
            to: addressHash(tx.to),
            source
          }, { severity: 'info', txHash: tx.hash, blockNumber: Number(tx.block_number || 0) || null })));
          summary.eventsCreated += 1;
        }
        summary.transactionsUpserted += 1;
      }
    } catch (error) {
      summary.errors.push(`Blockscout transactions ingest failed: ${error.message}`);
    }

    const latestBlock = latestBlocks(1)[0];
    if (latestBlock && !db.get('SELECT id FROM events WHERE event_type = ? AND block_number = ? LIMIT 1', ['BLOCK_SEEN', latestBlock.height])) {
      db.insert('events', serializeEvent(events.buildAlertEvent('BLOCK_SEEN', {
        blockNumber: latestBlock.height,
        transactionsCount: latestBlock.transactions_count,
        source
      }, { severity: 'info', blockNumber: latestBlock.height })));
      summary.eventsCreated += 1;
    }

    return { ...summary, status: await status() };
  }

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

  function hydrateEvent(row) {
    let payload = {};
    try { payload = JSON.parse(row.payload_json || '{}'); } catch {}
    return {
      id: row.id,
      eventType: row.event_type,
      severity: row.severity,
      subjectAddress: row.subject_address,
      tokenAddress: row.token_address,
      walletAddress: row.wallet_address,
      txHash: row.tx_hash,
      blockNumber: row.block_number,
      payload,
      premiumAt: row.premium_at,
      freeAt: row.free_at,
      createdAt: row.created_at
    };
  }

  function latestEvents(limit = 20) {
    return db.all('SELECT * FROM events ORDER BY datetime(created_at) DESC, id DESC LIMIT ?', [Math.min(Number(limit) || 20, 100)]).map(hydrateEvent);
  }

  function latestBlocks(limit = 12) {
    return db.all('SELECT * FROM blocks ORDER BY height DESC LIMIT ?', [Math.min(Number(limit) || 12, 100)]);
  }

  function latestTransactions(limit = 12) {
    return db.all('SELECT * FROM transactions ORDER BY datetime(timestamp) DESC, hash DESC LIMIT ?', [Math.min(Number(limit) || 12, 100)]);
  }

  function latestTransfers() {
    return { items: [], note: 'Ready for QuickNode eth_getLogs Transfer-topic ingestion once QUICKNODE_RPC_URL/WS are added.' };
  }

  return { migrate, status, ingestLatest, latestEvents, latestBlocks, latestTransactions, latestTransfers };
}
