#!/usr/bin/env node
import { setTimeout as wait } from 'node:timers/promises';
import { loadConfig } from '../config.mjs';
import { createAppContext } from '../context.mjs';

const args = new Set(process.argv.slice(2));
const once = args.has('--once') || !args.has('--watch');
const seedFixture = args.has('--seed-fixture');
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 20;

const config = await loadConfig();
const ctx = createAppContext(config);
await ctx.realtime.migrate();

console.log('HoodScan Trench worker');
console.log(`DB: ${ctx.db.dbPath}`);
console.log(`Mode: ${once ? 'once' : `watch every ${config.indexerPollMs}ms`}`);
console.log(`Source: Blockscout/market feed now; QuickNode pair logs later`);

async function tick() {
  const result = seedFixture
    ? { fixture: ctx.trench.seedFixture(), overview: await ctx.trench.overview(), pairsUpserted: 1, alertsCreated: 1, whaleMovementsCreated: 1, errors: [] }
    : await ctx.trench.ingestMarketPairs({ limit, source: 'trench-worker' });
  console.log(JSON.stringify({
    at: new Date().toISOString(),
    pairsUpserted: result.pairsUpserted,
    alertsCreated: result.alertsCreated,
    whaleMovementsCreated: result.whaleMovementsCreated,
    errors: result.errors,
    status: result.overview.status
  }, null, 2));
}

if (once) {
  await tick();
} else {
  while (true) {
    await tick();
    await wait(config.indexerPollMs);
  }
}
