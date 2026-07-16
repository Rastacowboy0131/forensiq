const ALERT_EVENT_TYPES = [
  'TOKEN_DEPLOYED',
  'LIQUIDITY_ADDED',
  'TOKEN_TRENDING',
  'ALPHA_WALLET_BUY',
  'WHALE_BUY',
  'WHALE_SELL',
  'HOODSAFE_SCORE_CHANGED',
  'LOCK_CREATED',
  'LOCK_UNLOCK_SOON'
];

const ALERT_TYPE_SQL = ALERT_EVENT_TYPES.map(type => `'${type}'`).join(',');

function nowIso() { return new Date().toISOString(); }
function shortAddr(value = '') { return value ? `${String(value).slice(0, 6)}…${String(value).slice(-4)}` : '—'; }

function parsePayload(row) {
  try { return JSON.parse(row.payload_json || '{}'); } catch { return {}; }
}

function hydrateEvent(row) {
  const payload = parsePayload(row);
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
    createdAt: row.created_at,
    deliveredPremiumAt: row.delivered_premium_at,
    deliveredFreeAt: row.delivered_free_at
  };
}

function markdownEscape(value = '') {
  return String(value).replace(/[_*`\[]/g, char => `\\${char}`);
}

export function createTelegramAlertsService({ db, config, events }) {
  function configured(tier) {
    const chatId = tier === 'free' ? config.telegram.freeChatId : config.telegram.premiumChatId;
    return Boolean(config.telegram.botToken && chatId);
  }

  function chatIdFor(tier) {
    return tier === 'free' ? config.telegram.freeChatId : config.telegram.premiumChatId;
  }

  function dueAlerts(tier = 'premium', limit = 20) {
    db.ensureReady();
    const deliveredColumn = tier === 'free' ? 'delivered_free_at' : 'delivered_premium_at';
    const dueColumn = tier === 'free' ? 'free_at' : 'premium_at';
    const rows = db.all(`SELECT * FROM events WHERE event_type IN (${ALERT_TYPE_SQL}) AND ${deliveredColumn} IS NULL AND ${dueColumn} IS NOT NULL AND datetime(${dueColumn}) <= datetime(?) ORDER BY datetime(${dueColumn}) ASC, id ASC LIMIT ?`, [nowIso(), Math.min(Number(limit) || 20, 100)]);
    return rows.map(hydrateEvent);
  }

  function deliveryStatus() {
    db.ensureReady();
    const now = nowIso();
    return {
      telegram: {
        botConfigured: Boolean(config.telegram.botToken),
        premiumChatConfigured: Boolean(config.telegram.premiumChatId),
        freeChatConfigured: Boolean(config.telegram.freeChatId),
        premiumReady: configured('premium'),
        freeReady: configured('free'),
        freeDelayMinutes: config.freeAlertDelayMinutes
      },
      pending: {
        premium: db.get(`SELECT COUNT(*) AS count FROM events WHERE event_type IN (${ALERT_TYPE_SQL}) AND delivered_premium_at IS NULL AND premium_at IS NOT NULL AND datetime(premium_at) <= datetime(?)`, [now])?.count || 0,
        free: db.get(`SELECT COUNT(*) AS count FROM events WHERE event_type IN (${ALERT_TYPE_SQL}) AND delivered_free_at IS NULL AND free_at IS NOT NULL AND datetime(free_at) <= datetime(?)`, [now])?.count || 0,
        freeScheduled: db.get(`SELECT COUNT(*) AS count FROM events WHERE event_type IN (${ALERT_TYPE_SQL}) AND delivered_free_at IS NULL AND free_at IS NOT NULL AND datetime(free_at) > datetime(?)`, [now])?.count || 0
      },
      delivered: {
        premium: db.get(`SELECT COUNT(*) AS count FROM events WHERE event_type IN (${ALERT_TYPE_SQL}) AND delivered_premium_at IS NOT NULL`)?.count || 0,
        free: db.get(`SELECT COUNT(*) AS count FROM events WHERE event_type IN (${ALERT_TYPE_SQL}) AND delivered_free_at IS NOT NULL`)?.count || 0
      },
      latestDelivered: {
        premium: db.get(`SELECT delivered_premium_at AS at FROM events WHERE delivered_premium_at IS NOT NULL ORDER BY datetime(delivered_premium_at) DESC LIMIT 1`)?.at || null,
        free: db.get(`SELECT delivered_free_at AS at FROM events WHERE delivered_free_at IS NOT NULL ORDER BY datetime(delivered_free_at) DESC LIMIT 1`)?.at || null
      }
    };
  }

  function formatMessage(event, tier = 'premium') {
    const payload = event.payload || {};
    const title = payload.symbol || payload.name || event.eventType;
    const delay = tier === 'free' ? `FREE · delayed ${config.freeAlertDelayMinutes}m` : 'PREMIUM · instant';
    const lines = [
      `🟢 *HoodScan ${delay}*`,
      '',
      `*${markdownEscape(event.eventType.replaceAll('_', ' '))}*`,
      markdownEscape(title),
      ''
    ];

    if (payload.name && payload.name !== title) lines.push(`Name: ${markdownEscape(payload.name)}`);
    if (event.tokenAddress) lines.push(`Token: \`${event.tokenAddress}\``);
    if (event.walletAddress || payload.deployer) lines.push(`Wallet: \`${event.walletAddress || payload.deployer}\``);
    if (event.blockNumber) lines.push(`Block: ${event.blockNumber}`);
    if (event.txHash) lines.push(`Tx: \`${event.txHash}\``);
    if (payload.reason) lines.push('', markdownEscape(payload.reason));

    const path = event.tokenAddress ? `/#/token/${event.tokenAddress}` : event.txHash ? `/#/tx/${event.txHash}` : event.walletAddress ? `/#/address/${event.walletAddress}` : '/#/alerts';
    lines.push('', `View: http://localhost:${config.port}${path}`);
    return lines.join('\n');
  }

  async function sendTelegramMessage({ tier, text }) {
    const chatId = chatIdFor(tier);
    if (!configured(tier)) {
      return { ok: false, skipped: true, reason: `Missing TELEGRAM_BOT_TOKEN or ${tier === 'free' ? 'FREE_ALERT_CHAT_ID' : 'PREMIUM_ALERT_CHAT_ID'}` };
    }
    const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      return { ok: false, status: res.status, reason: data.description || data.error_code || `Telegram HTTP ${res.status}` };
    }
    return { ok: true, messageId: data.result?.message_id || null, chatId };
  }

  function markDelivered(eventId, tier) {
    const column = tier === 'free' ? 'delivered_free_at' : 'delivered_premium_at';
    db.run(`UPDATE events SET ${column} = ? WHERE id = ?`, [nowIso(), eventId]);
  }

  async function deliverTier(tier = 'premium', { dryRun = true, limit = 20 } = {}) {
    const items = dueAlerts(tier, limit);
    const results = [];
    for (const event of items) {
      const text = formatMessage(event, tier);
      if (dryRun) {
        results.push({ eventId: event.id, tier, dryRun: true, ok: true, text });
        continue;
      }
      const sent = await sendTelegramMessage({ tier, text });
      results.push({ eventId: event.id, tier, dryRun: false, ...sent });
      if (sent.ok) markDelivered(event.id, tier);
    }
    return { tier, dryRun, attempted: results.length, results };
  }

  async function deliverDue({ dryRun = true, limit = 20 } = {}) {
    const premium = await deliverTier('premium', { dryRun, limit });
    const free = await deliverTier('free', { dryRun, limit });
    return {
      dryRun,
      premium,
      free,
      status: deliveryStatus()
    };
  }

  function preview(event, tier = 'premium') {
    return formatMessage(event, tier);
  }

  return { dueAlerts, deliveryStatus, formatMessage, deliverTier, deliverDue, preview };
}
