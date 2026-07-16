export const EVENT_TYPES = Object.freeze({
  TOKEN_DEPLOYED: 'TOKEN_DEPLOYED',
  LIQUIDITY_ADDED: 'LIQUIDITY_ADDED',
  TOKEN_TRENDING: 'TOKEN_TRENDING',
  ALPHA_WALLET_BUY: 'ALPHA_WALLET_BUY',
  WHALE_BUY: 'WHALE_BUY',
  WHALE_SELL: 'WHALE_SELL',
  HOODSAFE_SCORE_CHANGED: 'HOODSAFE_SCORE_CHANGED',
  LOCK_CREATED: 'LOCK_CREATED',
  LOCK_UNLOCK_SOON: 'LOCK_UNLOCK_SOON'
});

export function createEventService(config) {
  function buildAlertEvent(type, payload = {}, options = {}) {
    const now = new Date();
    const freeAt = new Date(now.getTime() + config.freeAlertDelayMinutes * 60_000);
    return {
      eventType: type,
      severity: options.severity || 'info',
      subjectAddress: options.subjectAddress || payload.token || payload.wallet || null,
      tokenAddress: options.tokenAddress || payload.token || null,
      walletAddress: options.walletAddress || payload.wallet || null,
      txHash: options.txHash || payload.txHash || null,
      blockNumber: options.blockNumber || payload.blockNumber || null,
      payload,
      premiumAt: now.toISOString(),
      freeAt: freeAt.toISOString(),
      createdAt: now.toISOString()
    };
  }

  function previewTelegram(event, tier = 'premium') {
    const delay = tier === 'free' ? `delayed ${config.freeAlertDelayMinutes}m` : 'instant';
    const subject = event.payload?.symbol || event.tokenAddress || event.subjectAddress || 'Hood Chain signal';
    return `🟢 HoodScan ${tier.toUpperCase()} (${delay})\n\n${event.eventType}\n${subject}\n\nView: hoodscan.app`;
  }

  return { buildAlertEvent, previewTelegram };
}
