# HoodScan competitor notes: hoodscan.us.com

Date checked: 2026-07-16
Source: https://hoodscan.us.com/

## What they have

### Homepage / positioning
- Positioning: "Robinhood Chain intelligence layer" / "research desk".
- Search-first hero: address / tx / block / token.
- Market briefing block linking to DeFi dashboard.
- Top markets, flow feeds, DeFi command center, top tokens.
- Header shows ETH price and gas.

### Market terminal
- Route: `/markets`.
- Tabs: Top, Trending, Gainers, New, All.
- Columns: market, venue, price, 1h, 24h, liquidity, 24h volume, buys/sells, traders, age, risk.
- This is the strongest feature for degen/token traders.

### Stock-token desk
- Route: `/stock-tokens`.
- Canonical asset registry for Robinhood stock tokens.
- Columns: underlying/token, registry status, reference price, DEX price, 24h, onchain value, holders, multiplier.
- Uses Robinhood-published contract registry + quote feed + chain data.

### Bubble map
- Route: `/bubblemap`.
- Token search -> holder map.
- Shows wallet bubbles sized by ownership concentration and connected by recent holder-to-holder transfers.
- Controls: zoom in/out, fit, reset.
- Labels contracts/wallets like Morpho, PoolManager, SafeProxy, DexRouter, etc.

### Flow feeds
- Routes linked from homepage:
  - `/stock-tokens`
  - `/deposits` bridge activity
  - `/contracts` verified contracts
  - `/aa-txs` account abstraction / user operations

### DeFi
- Route: `/defi`.
- Shows TVL, 24h DEX volume, stablecoin supply, protocol count, protocol rankings, category breakdowns.
- API evidence includes `categoryBreakdown` and historical TVL/volume arrays.

### API surfaces observed
- `/api/stats`
- `/api/gas-tracker`
- `/api/defi/overview`
- `/api/defi/protocols`
- `/api/stock-tokens`
- `/api/tokens`
- `/api/markets`-style data inside app bundle
- `/api/arbitrum/deposits`
- `/api/arbitrum/withdrawals`
- `/api/verified-contracts`
- `/api/aa-operations`
- `/api/search`
- Account/watchlist/auth endpoints exist in JS bundle.

## Things we should borrow conceptually, not copy

### High-priority gaps for our HoodScan
1. Market terminal tabs: Top / Trending / Gainers / New / All.
2. Stock-token canonical registry page.
3. Bubble-map holder concentration visualization.
4. Bridge activity feed.
5. Account abstraction user-operation feed.
6. DeFi protocol dashboard: TVL, volume, stablecoin supply, protocol/category rankings.
7. Header live ETH/gas strip.
8. Risk column in market rows.
9. Visible buys/sells and unique trader counts.
10. Canonical/verified registry badges.

### Where our product should be stronger/different
1. `.hood` identity first-class everywhere: wallet labels, primary names, search, leaderboards.
2. HoodSafe / HoodLock risk and lock proof, not just generic "No flags".
3. Telegram HoodAlerts with free delayed vs premium instant feeds.
4. Alpha-wallet and deployer-history intelligence for memecoin traders.
5. "Why this matters" summaries on token/wallet pages, not just tables.
6. Token launch/trench mode: new deploys, first liquidity, top early buyers, KOL/insider exclusions.
7. Public proof pages for locks, safe scans, and buyback/airdrop evidence.

## Recommended next implementation order

1. Add market terminal shell with tabs and columns matching trader expectations.
2. Add stock-token registry ingest/page from the public Robinhood token registry + Blockscout holders.
3. Add DeFi overview API/page using DeFiLlama-style chain data.
4. Add bubble-map MVP: top holders + transfer links via SVG/D3/canvas.
5. Add bridge/deposit and AA user-operation feeds.
6. Add `.hood` identity overlay and HoodSafe risk overlay to all above pages.

## Noted competitor weaknesses

- Some endpoints returned 502 during check (`/api/home`, `/api/verified-contracts`). We should design per-section fallbacks so one feed does not blank a page.
- Bubble map token selection UI appeared to keep showing Ethena USDe after typing CASHCAT until a result is clicked. We should make selected-token state obvious.
- Their risk column currently often says "No flags"; this is an opening for HoodSafe to be materially better.
