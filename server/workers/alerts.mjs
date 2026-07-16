#!/usr/bin/env node
import { loadConfig } from '../config.mjs';
import { createAppContext } from '../context.mjs';
import { EVENT_TYPES } from '../services/events.mjs';

const config = await loadConfig();
const ctx = createAppContext(config);
const event = ctx.events.buildAlertEvent(EVENT_TYPES.ALPHA_WALLET_BUY, {
  symbol: 'SAMPLE',
  wallet: '0x0000000000000000000000000000000000000000',
  token: '0x0000000000000000000000000000000000000000',
  reason: 'Dry-run only. No Telegram message sent.'
});

console.log('HoodAlerts dry-run');
console.log(`Telegram bot configured: ${Boolean(config.telegram.botToken)}`);
console.log(`Premium chat configured: ${Boolean(config.telegram.premiumChatId)}`);
console.log(`Free chat configured: ${Boolean(config.telegram.freeChatId)}`);
console.log('\nPremium text:');
console.log(ctx.events.previewTelegram(event, 'premium'));
console.log('\nFree text:');
console.log(ctx.events.previewTelegram(event, 'free'));
