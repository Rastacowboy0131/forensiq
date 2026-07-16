#!/usr/bin/env node
import { setTimeout as wait } from 'node:timers/promises';
import { loadConfig } from '../config.mjs';
import { createAppContext } from '../context.mjs';
import { EVENT_TYPES } from '../services/events.mjs';

const args = new Set(process.argv.slice(2));
const once = args.has('--once') || !args.has('--watch');

const config = await loadConfig();
const ctx = createAppContext(config);

console.log('HoodScan realtime indexer');
console.log(`DB: ${ctx.db.dbPath}`);
console.log(`Blockscout: ${config.blockscoutOrigin}`);
console.log(`QuickNode RPC configured: ${ctx.rpc.rpcUrlConfigured}`);
console.log(`QuickNode WS configured: ${ctx.rpc.wsUrlConfigured}`);
console.log(`Mode: ${once ? 'single dry-run/local-ready pass' : `watch every ${config.indexerPollMs}ms`}`);

await ctx.realtime.migrate();

async function tick() {
  const result = await ctx.realtime.ingestLatest({ limit: 10, source: ctx.rpc.rpcUrlConfigured ? 'quicknode-rpc' : 'blockscout-dry-run' });
  console.log(JSON.stringify({
    at: new Date().toISOString(),
    mode: result.mode,
    latestRpcBlock: result.latestRpcBlock,
    blocksUpserted: result.blocksUpserted,
    transactionsUpserted: result.transactionsUpserted,
    eventsCreated: result.eventsCreated,
    errors: result.errors,
    counts: result.status.counts
  }, null, 2));
}

try {
  const status = await ctx.explorer.providerStatus();
  console.log('Provider status:');
  console.log(JSON.stringify(status, null, 2));
} catch (error) {
  console.error('Provider status failed:', error.message);
}

const preview = ctx.events.buildAlertEvent(EVENT_TYPES.TOKEN_TRENDING, {
  symbol: 'HOOD',
  reason: 'Indexer dry-run preview'
});
console.log('\nPremium alert preview:');
console.log(ctx.events.previewTelegram(preview, 'premium'));
console.log('\nFree alert preview:');
console.log(ctx.events.previewTelegram(preview, 'free'));
console.log('');

if (once) {
  await tick();
} else {
  while (true) {
    await tick();
    await wait(config.indexerPollMs);
  }
}
