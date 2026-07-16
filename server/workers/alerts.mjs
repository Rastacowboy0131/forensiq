#!/usr/bin/env node
import { setTimeout as wait } from 'node:timers/promises';
import { loadConfig } from '../config.mjs';
import { createAppContext } from '../context.mjs';
import { EVENT_TYPES } from '../services/events.mjs';

const args = new Set(process.argv.slice(2));
const once = args.has('--once') || !args.has('--watch');
const dryRun = !args.has('--send');
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : 20;

const config = await loadConfig();
const ctx = createAppContext(config);

await ctx.realtime.migrate();

console.log('HoodAlerts Telegram worker');
console.log(`DB: ${ctx.db.dbPath}`);
console.log(`Mode: ${once ? 'once' : `watch every ${config.indexerPollMs}ms`}`);
console.log(`Dry run: ${dryRun}`);
console.log(`Telegram bot configured: ${Boolean(config.telegram.botToken)}`);
console.log(`Premium chat configured: ${Boolean(config.telegram.premiumChatId)}`);
console.log(`Free chat configured: ${Boolean(config.telegram.freeChatId)}`);

const previewEvent = ctx.events.buildAlertEvent(EVENT_TYPES.TOKEN_DEPLOYED, {
  symbol: 'HOOD',
  name: 'Hood Preview Token',
  token: '0x0000000000000000000000000000000000000000',
  deployer: '0x1111111111111111111111111111111111111111',
  reason: 'Preview event only — no Telegram send performed.'
}, { severity: 'info' });
console.log('\nPremium preview:');
console.log(ctx.telegramAlerts.preview(previewEvent, 'premium'));
console.log('\nFree preview:');
console.log(ctx.telegramAlerts.preview(previewEvent, 'free'));
console.log('');

async function tick() {
  const result = await ctx.telegramAlerts.deliverDue({ dryRun, limit });
  const printable = {
    at: new Date().toISOString(),
    dryRun,
    attemptedPremium: result.premium.attempted,
    attemptedFree: result.free.attempted,
    pending: result.status.pending,
    delivered: result.status.delivered,
    telegram: result.status.telegram,
    failures: [...result.premium.results, ...result.free.results].filter(row => !row.ok)
  };
  console.log(JSON.stringify(printable, null, 2));
}

if (once) {
  await tick();
} else {
  while (true) {
    await tick();
    await wait(config.indexerPollMs);
  }
}
