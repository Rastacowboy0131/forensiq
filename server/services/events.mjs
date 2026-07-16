export const EVENT_TYPES = Object.freeze({
  BLOCK_SEEN: 'BLOCK_SEEN',
  TX_SEEN: 'TX_SEEN',
  TOKEN_DEPLOYED: 'TOKEN_DEPLOYED',
  LIQUIDITY_ADDED: 'LIQUIDITY_ADDED',
  TOKEN_TRENDING: 'TOKEN_TRENDING',
  ALPHA_WALLET_BUY: 'ALPHA_WALLET_BUY',
  WHALE_BUY: 'WHALE_BUY',
  WHALE_SELL: 'WHALE_SELL',
  HOODSAFE_SCORE_CHANGED: 'HOODSAFE_SCORE_CHANGED',
  LOCK_CREATED: 'LOCK_CREATED',
  LOCK_UNLOCK_SOON: 'LOCK_UNLOCK_SOON',
  PAIR_VOLUME_SPIKE: 'PAIR_VOLUME_SPIKE',
  WHALE_WALLET_MOVE: 'WHALE_WALLET_MOVE',
  LIQUIDITY_REMOVED: 'LIQUIDITY_REMOVED',
  NEW_PAIR_CREATED: 'NEW_PAIR_CREATED',
  FRESH_WALLET_BUY: 'FRESH_WALLET_BUY'
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
    const subject = event.payload?.symbol || event.payload?.name || event.tokenAddress || event.subjectAddress || 'Hood Chain signal';
    const explorerPath = event.txHash ? `/tx/${event.txHash}` : event.tokenAddress ? `/token/${event.tokenAddress}` : event.subjectAddress ? `/address/${event.subjectAddress}` : '';
    return `🟢 HoodScan ${tier.toUpperCase()} (${delay})\n\n${event.eventType}\n${subject}\n\n${event.payload?.reason || ''}\nView: hoodscan.app${explorerPath}`;
  }

  return { buildAlertEvent, previewTelegram };
}
