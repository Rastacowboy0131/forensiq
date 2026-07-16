# HoodScan Blueprint

HoodScan is the Solscan-style intelligence layer for Hood Chain. Blockscout answers "what happened on-chain?" HoodScan should answer "what does this mean for this wallet/token/contract?"

## Product stack

| Product | Role | Status |
|---|---|---|
| HoodScan | Explorer + wallet/token intelligence | Active MVP |
| HoodID | `.hood` identity/name layer | Existing external product |
| HoodSafe | Risk scoring inside token/contract pages | Planned after token intelligence |
| HoodLock | Token/LP/team vesting + locks, Streamflow-style for Hood Chain | Future add-on, design now |
| HoodAlerts | Telegram/X scanner alerts powered by HoodScan indexer | Planned monetization layer |
| HoodAlpha | Alpha-wallet/trending signal engine feeding HoodScan + HoodAlerts | Planned premium layer |

## Build order

### Phase 1 — Explorer foundation polish

Goal: make the current Blockscout-powered MVP feel usable and credible.

- [x] Categorized search results: tokens, wallets/contracts, txns, blocks, `.hood` names.
- [x] Copy buttons for token CAs, wallet addresses, tx hashes, block numbers.
- [x] "Open on Blockscout" links on token/address/tx/block pages.
- [x] Better per-section loading/error states so one flaky Blockscout endpoint does not kill the whole page.
- [x] Mobile-friendly token/address cards for tables.
- [x] Token/address/tx route titles and metadata.
- [x] Basic labels: contract, EOA, token, verified contract, proxy, router/factory/manual labels later.

### Phase 2 — HoodID integration

Goal: make `.hood` names show up everywhere addresses appear.

Required inputs:

- HoodID registry contract address.
- HoodID ABI.
- Hood Chain RPC URL.
- Reverse lookup method, if contract supports wallet -> name.

Features:

- [ ] Resolve `.hood` search to wallet.
- [ ] Resolve wallet to `.hood` name if available.
- [ ] Show `.hood` names in latest txns, token holders, token transfers, deployers, and wallet pages.
- [ ] Link HoodID names to `https://www.hoodid.domains/name.hood`.
- [ ] Cache name/address resolutions.

### Phase 3 — Token intelligence

Goal: make HoodScan the default page people check before buying Hood Chain tokens.

Features:

- [ ] Holder concentration: top 1, top 10, top 25, top 100 percentages.
- [ ] Exclude known LP/burn/system wallets where possible.
- [ ] Token age: created block/time and first transfer.
- [ ] Deployer section: deployer wallet, HoodID, prior tokens, first funding wallet later.
- [ ] Transfer velocity: transfers last 5m/1h/24h once indexed.
- [ ] New token deploy feed with actual newest ERC-20 contracts.
- [ ] Trending token feed using transfer/holder/search activity.

### Phase 4 — HoodSafe Lite

Goal: add a plain-English safety/risk layer on token pages.

Initial score inputs:

| Check | Source |
|---|---|
| Contract verified | Blockscout |
| Proxy/upgradeability | Blockscout contract metadata/source |
| Holder concentration | HoodScan holder analysis |
| Owner/admin present | contract reads/source/ABI where available |
| Dangerous functions | ABI/source scan |
| Deployer history | HoodScan indexer |
| LP lock/burn status | HoodLock/DEX/holder data later |

Example output:

```text
HoodSafe Score: 72/100 — CAUTION

✅ Contract verified
✅ No obvious mint function in ABI
⚠️ Owner/admin can change settings
⚠️ Top 10 holders own 42%
❓ LP lock unknown

Verdict: Not an instant red flag, but holder concentration and admin controls require caution.
```

### Phase 5 — DEX price/liquidity

Goal: make token pages useful like Dexscreener/Solscan.

Required inputs:

- Main Hood Chain DEX router/factory addresses.
- Native wrapped token address.
- Stablecoin addresses.
- Dexscreener/GeckoTerminal support status, or custom pair indexer.

Features:

- [ ] Price, market cap, liquidity, volume.
- [ ] Pool/pair links.
- [ ] Swap decoding: buy, sell, add LP, remove LP.
- [ ] Mini charts: price, holders, transfers, concentration.

### Phase 6 — HoodAlerts + HoodAlpha

Goal: turn HoodScan intelligence into Telegram/X distribution and monetization.

HoodAlerts is the alert delivery layer. HoodAlpha is the scoring layer that decides what is worth alerting.

Signals:

- New token deploys.
- New liquidity added.
- LP lock/vesting events from HoodLock later.
- High transfer velocity.
- Fast holder growth.
- Whale buys/sells.
- Known/alpha wallet buys.
- Smart deployer launches.
- HoodSafe score changes.
- New trending tokens.
- Large top-holder movement.

Telegram products:

| Tier | Delivery | Features |
|---|---|---|
| Free | Delayed, e.g. 10–30 minutes | public trending, new token summaries, delayed alpha-wallet hits |
| Premium | Instant | real-time deploys, instant alpha-wallet buys, whale alerts, HoodSafe changes, watchlists |
| Private group | Fastest + curated | admin-curated calls, higher confidence alerts, custom filters |
| Project/API | Webhooks/API | alert feed for other bots/sites |

Important: free alerts should still be useful, but premium gets speed and detail.

Example free alert:

```text
🔥 Hood Trending — delayed 20m

$TOKEN is heating up
Holders: 420 → 690
Transfers 1h: 1,284
HoodSafe: 71/100 CAUTION

View: hoodscan.app/token/0x...
```

Example premium alert:

```text
⚡ INSTANT ALPHA WALLET BUY

Known alpha wallet bought $TOKEN
Wallet: rasta.hood / 0xabc...123
Amount: 2.4 ETH
Token age: 4m
HoodSafe: 68/100 CAUTION
Top 10 holders: 31%

View: hoodscan.app/token/0x...
```

Monetization rules:

- Free feed gets delay + less detail.
- Premium feed gets instant + more context.
- Never expose private Telegram user/chat/thread IDs in public outputs.
- Avoid calling anything guaranteed profit; use "signal", "risk", "watch", "alpha wallet activity" wording.
- Let users configure risk levels instead of blasting every risky deploy.

Alpha-wallet signal model:

```text
Alpha Score =
  early alpha-wallet buys
+ number of trusted wallets buying
+ wallet historical hit rate
+ wallet hold behavior
+ transfer/holder velocity
+ liquidity depth
+ HoodSafe score
- deployer risk
- holder concentration risk
- missing LP lock penalty
```

Data needed:

- Wallet watchlist/labels.
- Wallet token buy detection from DEX swaps.
- Historical outcome tracking by market cap/liquidity/time.
- Token deploy timestamps.
- Liquidity data.
- HoodSafe score history.

### Phase 7 — HoodScan backend/indexer

Goal: stop depending only on live Blockscout calls and make HoodScan reliable.

Start with SQLite locally, then move to Postgres/Supabase/Railway when deployed.

Cache/index:

- tokens
- addresses
- transactions
- contract deploys
- token holders snapshots
- token transfer snapshots
- HoodID resolutions
- labels
- HoodSafe scores
- search counts/trending scores
- alert subscriptions and delivery tiers
- alpha-wallet labels and signal history

## HoodLock future module

HoodLock should be planned into the product now even if it ships later.

### Concept

HoodLock is a Streamflow-style locking/vesting tool for Hood Chain tokens:

- Lock LP tokens.
- Lock team allocations.
- Create token vesting streams.
- Create cliff unlock schedules.
- Create public proof pages for locks.
- Feed lock status directly into HoodScan/HoodSafe.

### Why it belongs with HoodScan

Every token page needs answers like:

```text
Is liquidity locked?
When does it unlock?
Who controls team tokens?
Is vesting public?
Can the dev dump today?
```

HoodLock provides the proof layer, HoodScan displays it, and HoodSafe scores it.

### HoodLock primitives

| Primitive | Use |
|---|---|
| Fixed lock | Lock LP/team tokens until a timestamp |
| Linear vesting | Stream tokens over time |
| Cliff + linear vesting | No release until cliff, then linear unlock |
| Multi-recipient vesting | Team/advisor/community schedules |
| Cancelable stream optional | Only for clearly labeled vesting types |
| Public proof page | Shareable lock/vesting receipt |

### HoodLock pages inside HoodScan

Future routes:

```text
/locks
/lock/:lockId
/token/:ca#locks
/address/:wallet#locks
```

Token page module:

```text
Locks & Vesting

LP locked: Yes
Locked amount: 82% of LP
Unlock date: Aug 15, 2026
Locker: HoodLock
Team vesting: 4 streams
Next unlock: 2.5M TOKEN in 14 days
```

### HoodSafe scoring integration

HoodSafe should reward:

- LP locked or burned.
- Team supply vested.
- Long lock duration.
- Non-cancelable locks.
- Public lock/vesting proof.

HoodSafe should penalize:

- No LP lock detected.
- Huge unlock within 24h/7d.
- Cancelable locks not disclosed.
- Team wallet has unlocked high supply.

### HoodLock MVP later

1. Read-only lock registry/proof display first.
2. Fixed token lock contract.
3. LP lock support.
4. Linear vesting streams.
5. UI to create locks/streams.
6. HoodScan/HoodSafe integration.

### Contract safety notes

Before any real HoodLock funds are involved:

- Use audited/token-locking patterns.
- Avoid upgradeable custody unless absolutely necessary.
- Make cancelability explicit in contract + UI.
- Add emergency/admin powers only if clearly disclosed.
- Require tests for ERC-20 edge cases, fee-on-transfer tokens, decimals, unlock timing, and recipient changes.
- Consider third-party audit before public value-bearing launch.

## Paid realtime data provider

QuickNode publicly lists Robinhood Chain support at `https://www.quicknode.com/chains/robinhood`, including mainnet/testnet, RPC endpoints, and real-time webhooks. For HoodScan/HoodAlerts, QuickNode should be treated as the preferred paid realtime provider unless testing shows latency/coverage problems.

Recommended data stack:

```text
QuickNode Robinhood Chain RPC/WebSocket/Webhooks
↓
HoodScan indexer + event DB
↓
HoodScan API + Telegram alert queues
↓
Premium instant alerts / free delayed alerts
```

Keep Blockscout as enrichment/fallback explorer data, not the premium realtime source.

## Near-term next slice

Phase 1 polish is complete. Next, build the foundation that prevents rewrites:

1. HoodScan API routes that hide provider details from the frontend. **Done.**
2. SQLite cache/schema for tokens, addresses, labels, events, and alert queues. **Schema added.**
3. Provider modules for Blockscout, QuickNode RPC, HoodID, labels, and later DEX/HoodSafe. **Blockscout/QuickNode/HoodID/labels skeletons added.**
4. Indexer/alert worker skeleton for future instant Telegram alerts. **Dry-run workers added.**
5. `.env.example` with QuickNode, HoodID, DB, and Telegram config placeholders. **Done.**

Next: add real QuickNode/HoodID env values, then move to HoodID integration.
