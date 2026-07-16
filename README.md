# HoodScan

Solscan-style Hood Chain explorer MVP powered by the public Blockscout instance at `https://robinhoodchain.blockscout.com`.

## Run locally

```bash
npm install
cp .env.example .env # optional; fill only values you actually have
npm start
```

Open: http://localhost:5177

## What works in this MVP

- Live Hood Chain stats from Blockscout
- Latest transactions and latest batches/blocks
- ERC-20 token directory
- Search by address, transaction hash, block number, token symbol, or `.hood` name placeholder
- Token detail pages with overview, holders, and latest transfers
- Address detail pages with balance/transaction/transfer sections
- Transaction detail pages
- Local proxy at `/api/blockscout?path=/api/v2/...` so the browser does not need to call Blockscout directly

## Blueprint

See [`BLUEPRINT.md`](./BLUEPRINT.md) for the full HoodScan roadmap.

Product direction:

```text
HoodScan = explorer + wallet/token intelligence
HoodID   = .hood identity layer
HoodSafe = token/contract risk layer
HoodLock = future Streamflow-style lock/vesting layer for Hood Chain tokens
HoodAlerts/HoodAlpha = delayed free TG alerts + instant premium signal layer
```

## Next build slices

1. Polish the explorer foundation: categorized search results, copy buttons, Blockscout deep links, section-level errors, mobile table cards, route titles, and starter labels. **Phase 1 shipped locally.**
2. Build the foundation layer: HoodScan API routes, provider modules, config/env, DB schema, and indexer/alert worker skeletons. **Foundation shipped locally.**
3. Plug in HoodID registry contract address + ABI and resolve `.hood` names everywhere an address appears.
4. Add HoodSafe scoring on token pages: verified contract, holder concentration, owner/mint/blacklist flags, LP lock status.
5. Add DEX price/liquidity data from Dexscreener/GeckoTerminal or the main Hood Chain DEX router/factory.
6. Add HoodAlerts/HoodAlpha: delayed free Telegram trending alerts, instant premium alpha-wallet/whale/deploy alerts, and watchlists.
7. Add HoodLock later: LP locks, team token locks, vesting streams, and public proof pages feeding HoodSafe.

## Dry-run realtime foundation

Until QuickNode keys are added, the realtime/indexer path can be exercised locally with Blockscout-backed dry-run data:

```bash
npm run db:migrate
npm run worker:indexer
npm start
```

Open:

```text
http://localhost:5177/#/realtime
```

This seeds and reads:

```text
data/hoodscan.sqlite
/api/realtime/status
/api/realtime/latest-events
/api/realtime/latest-blocks
/api/realtime/latest-transactions
```

Once QuickNode is ready, add real values only to `.env`:

```bash
QUICKNODE_RPC_URL=
QUICKNODE_WS_URL=
```

## Environment

Optional:

```bash
PORT=5177
BLOCKSCOUT_ORIGIN=https://robinhoodchain.blockscout.com
DATABASE_URL=file:./data/hoodscan.sqlite
QUICKNODE_RPC_URL=
QUICKNODE_WS_URL=
```
