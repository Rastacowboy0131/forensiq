#!/usr/bin/env node
import { loadConfig } from '../config.mjs';
import { createDbClient } from './client.mjs';

const config = await loadConfig();
const db = createDbClient(config);
db.ensureReady();
console.log(`HoodScan DB ready: ${db.dbPath}`);
console.log(JSON.stringify({
  blocks: db.count('blocks'),
  transactions: db.count('transactions'),
  events: db.count('events'),
  tokens: db.count('tokens'),
  addresses: db.count('addresses')
}, null, 2));
