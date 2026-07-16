import { json, ok, parseRoute, isAddress, isTxHash, HttpError } from './http.mjs';
import { EVENT_TYPES } from './services/events.mjs';

export async function handleApi(req, res, url, ctx) {
  const { pathname, searchParams } = url;

  if (pathname === '/api/provider-status') return ok(res, await ctx.explorer.providerStatus());
  if (pathname === '/api/realtime/status') return ok(res, await ctx.realtime.status());
  if (pathname === '/api/realtime/latest-events') return ok(res, { items: ctx.realtime.latestEvents(Number(searchParams.get('limit') || 20)) });
  if (pathname === '/api/realtime/latest-blocks') return ok(res, { items: ctx.realtime.latestBlocks(Number(searchParams.get('limit') || 12)) });
  if (pathname === '/api/realtime/latest-transactions') return ok(res, { items: ctx.realtime.latestTransactions(Number(searchParams.get('limit') || 12)) });
  if (pathname === '/api/realtime/latest-transfers') return ok(res, ctx.realtime.latestTransfers());
  if (pathname === '/api/alerts') return ok(res, { items: ctx.realtime.latestAlerts(Number(searchParams.get('limit') || 40)) });
  if (pathname === '/api/alerts/latest') return ok(res, { items: ctx.realtime.latestAlerts(Number(searchParams.get('limit') || 12)) });
  if (pathname === '/api/alerts/status') return ok(res, await ctx.realtime.alertSummary());
  if (pathname === '/api/alerts/delivery-status') return ok(res, ctx.telegramAlerts.deliveryStatus());
  if (pathname === '/api/tokens/new') return ok(res, { items: ctx.realtime.newTokens(Number(searchParams.get('limit') || 40)) });
  if (pathname === '/api/home') return ok(res, await ctx.explorer.home());
  if (pathname === '/api/markets') return ok(res, await ctx.marketIntel.markets(searchParams.get('tab') || 'top'));
  if (pathname === '/api/stock-tokens') return ok(res, await ctx.marketIntel.stockTokens());
  if (pathname === '/api/defi/overview') return ok(res, await ctx.marketIntel.defiOverview());
  if (pathname === '/api/bridge/deposits') return ok(res, await ctx.marketIntel.bridgeDeposits());
  if (pathname === '/api/user-operations') return ok(res, await ctx.marketIntel.userOperations());
  if (pathname === '/api/gas-tracker') return ok(res, await ctx.marketIntel.gasTracker());
  if (pathname === '/api/hoodsafe/watchlist') return ok(res, await ctx.hoodsafe.watchlist());
  if (pathname === '/api/stats') return ok(res, await ctx.explorer.stats());
  if (pathname === '/api/search') {
    const q = searchParams.get('q') || '';
    if (!q.trim()) throw new HttpError(400, 'Missing search query');
    return ok(res, await ctx.explorer.search(q.trim()));
  }
  if (pathname === '/api/tokens') return ok(res, await ctx.explorer.tokens());
  if (pathname === '/api/transactions/latest') return ok(res, (await ctx.blockscout.mainTransactions()).data);
  if (pathname === '/api/blocks/latest') return ok(res, (await ctx.blockscout.mainBlocks()).data);

  let params = parseRoute(pathname, '/api/tokens/:address/holders');
  if (params) {
    if (!isAddress(params.address)) throw new HttpError(400, 'Invalid token address');
    return ok(res, (await ctx.blockscout.tokenHolders(params.address)).data);
  }

  params = parseRoute(pathname, '/api/tokens/:address/transfers');
  if (params) {
    if (!isAddress(params.address)) throw new HttpError(400, 'Invalid token address');
    return ok(res, (await ctx.blockscout.tokenTransfers(params.address)).data);
  }

  params = parseRoute(pathname, '/api/hoodsafe/token/:address');
  if (params) {
    if (!isAddress(params.address)) throw new HttpError(400, 'Invalid token address');
    return ok(res, await ctx.hoodsafe.tokenSnapshot(params.address));
  }

  params = parseRoute(pathname, '/api/bubble-map/:address');
  if (params) {
    if (!isAddress(params.address)) throw new HttpError(400, 'Invalid token address');
    return ok(res, await ctx.hoodsafe.bubbleMap(params.address));
  }

  params = parseRoute(pathname, '/api/deployer-intel/:address');
  if (params) {
    if (!isAddress(params.address)) throw new HttpError(400, 'Invalid token address');
    return ok(res, await ctx.tokenIntel.deployerIntel(params.address));
  }

  params = parseRoute(pathname, '/api/hoodlock/:address');
  if (params) {
    if (!isAddress(params.address)) throw new HttpError(400, 'Invalid token address');
    return ok(res, await ctx.tokenIntel.hoodLockScan(params.address));
  }

  params = parseRoute(pathname, '/api/tokens/:address');
  if (params) {
    if (!isAddress(params.address)) throw new HttpError(400, 'Invalid token address');
    return ok(res, await ctx.explorer.token(params.address));
  }

  params = parseRoute(pathname, '/api/addresses/:address/transactions');
  if (params) {
    if (!isAddress(params.address)) throw new HttpError(400, 'Invalid address');
    return ok(res, (await ctx.blockscout.addressTransactions(params.address)).data);
  }

  params = parseRoute(pathname, '/api/addresses/:address/token-transfers');
  if (params) {
    if (!isAddress(params.address)) throw new HttpError(400, 'Invalid address');
    return ok(res, (await ctx.blockscout.addressTokenTransfers(params.address)).data);
  }

  params = parseRoute(pathname, '/api/addresses/:address');
  if (params) {
    if (!isAddress(params.address)) throw new HttpError(400, 'Invalid address');
    return ok(res, await ctx.explorer.address(params.address));
  }

  params = parseRoute(pathname, '/api/tx/:hash');
  if (params) {
    if (!isTxHash(params.hash)) throw new HttpError(400, 'Invalid transaction hash');
    return ok(res, await ctx.explorer.transaction(params.hash));
  }

  params = parseRoute(pathname, '/api/blocks/:height');
  if (params) return ok(res, await ctx.explorer.block(params.height));

  if (pathname === '/api/alerts/preview') {
    const event = ctx.events.buildAlertEvent(EVENT_TYPES.TOKEN_TRENDING, {
      symbol: 'HOOD',
      token: '0x0000000000000000000000000000000000000000',
      reason: 'Preview event only — no Telegram send performed.'
    }, { severity: 'info' });
    return ok(res, {
      event,
      premiumText: ctx.events.previewTelegram(event, 'premium'),
      freeText: ctx.events.previewTelegram(event, 'free')
    });
  }

  return json(res, 404, { error: 'Unknown HoodScan API route' });
}
