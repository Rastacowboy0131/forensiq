# FORENSIQ Frontend Spec

Brief for building the Forensiq web frontend. The backend is live and stable; you only need to build UI against the API below. Current reference implementation (plain HTML/JS) is in `public/` of the repo `Rastacowboy0131/forensiq` and running at https://web-production-22e16.up.railway.app — use it to see real responses, then rebuild it better.

## What Forensiq is

AI token forensics scanner for Robinhood Chain. User pastes a contract address (token or pair), backend runs a multi-section forensic scan (10-30s), returns a verdict tier + confidence score + per-section findings. Reports are persisted with shareable permalinks.

## API (all JSON, same origin)

### POST /api/scan
Body:
```json
{
  "address": "0x... (required, token or pair address)",
  "chain": "robinhood",
  "github": "optional org/repo URL hint",
  "site": "optional project website hint",
  "twitter": "optional handle hint"
}
```
- Takes 10-30 seconds. Show a loading state.
- Results are cached 10 min per address (`"cached": true` in response).
- Rate limited per IP (429 with `{"error": "..."}`).
- Errors: 400 invalid address/chain, 502 scan failed. Always `{"error": string}`.

Response (the full report object):
```json
{
  "address": "0x...",
  "chain": "robinhood",
  "name": "TokenName",
  "tier": "LEGIT-REAL | EARLY-REAL | NARRATIVE-ONLY | SKETCHY | PURE-LARP | AVOID",
  "score": 0-100,               // confidence score, higher = healthier
  "total_flags": 3,
  "hard_flags": ["..."],        // non-empty forces AVOID
  "summary": "plain-english one-paragraph verdict",
  "report": "longer AI-polished writeup (markdown-ish text)",
  "sections": {
    "CHART":            { "flags": [], "hard_flags": [], "good": [], "findings": [] },
    "CONTRACT/HOLDERS": { ... },
    "GITHUB":           { ... },
    "SITE":             { ... },
    "SOCIALS":          { ... }
  },
  "market": {
    "symbol": "XYZ", "price": 0.0123,
    "mcap": 123456, "liq": 45678, "vol24": 9999,
    "buys24": 12, "sells24": 8, "age_days": 3.2,
    "pair_addr": "0x...",       // use for dexscreener chart embed
    "url": "dexscreener url"
  },
  "id": "abc123def456",         // 12-char hex report id
  "permalink": "/r/abc123def456",
  "scanned_at": 1785729000,
  "cached": false
}
```
Section string arrays, in display priority: `hard_flags` (red, dealbreakers), `flags` (yellow, warnings), `good` (green, positives), `findings` (neutral, raw observations).

### GET /api/history
Last scans, newest first:
```json
[{ "address": "0x...", "chain": "robinhood", "name": "XYZ", "tier": "SKETCHY", "score": 34, "id": "abc123def456", "ts": 1785729000 }]
```

### GET /api/report/<id>
Returns a stored full report (same shape as scan response). 404 `{"error": "report not found"}` if missing.

### GET /r/<id>
Permalink page. Server returns the app shell; frontend detects the `/r/<id>` route, fetches `/api/report/<id>`, and renders it. Keep this route working, links are already shared around.

### GET /api/health
`{"ok": true}`.

## Page structure

One page app. Sections top to bottom:

1. **Header**: FORENSIQ brand, big search input (paste CA) + SCAN button, "ROBINHOOD CHAIN" badge. Collapsible "more options" with the 3 optional hint fields (github/site/twitter).
2. **Verdict panel** (hero): tier, flag count, confidence score bar (animated 0→score), token name + address, plain-english summary. Tier colors below.
3. **Stat bar**: Market Cap, Liquidity, Vol 24h, Txns 24h (buys/sells), Age, Risk Score (100 - score).
4. **Two-column grid**: left = Plain English Breakdown (hard flags then flags then goods, each tagged with its section); right = price chart (dexscreener iframe embed: `https://dexscreener.com/robinhood/<pair_addr>?embed=1&theme=dark&trades=0&info=0`) + Contract & Honeypot check card (PASSED/WARNINGS/FAILED from CONTRACT/HOLDERS section).
5. **Full scan log**: all 5 sections with every finding, `[HARD FLAG]`/`[FLAG]`/`[GOOD]` prefixed lines.
6. **Recent scans**: from /api/history, clickable rows → permalink.
7. Footer: "FORENSIQ v1 · rule engine + AI analysis · not financial advice".

**Pre-scan state matters**: don't show an empty page. Render the whole layout as a skeleton before any scan: verdict says AWAITING SCAN, stat fields show `--`, sections show a one-line description of what each checks, shimmer placeholders in the breakdown. Everything fills in when results land. (Rasta's explicit ask.)

Section descriptions for the skeleton:
- CHART: market data, mcap/liquidity/volume/txns, pair age, wash-trade heuristics
- CONTRACT/HOLDERS: honeypot check, taxes, ownership, holder concentration, sniper clusters
- GITHUB: repo discovery, commit-history forensics, backdating/burst-commit detection
- SITE: website substance, SPA/template detection
- SOCIALS: twitter presence, account age, engagement

## Design language

Dark cyber-forensics terminal. Current palette (keep or evolve):
- bg near-black `#04040d`, panels `#0a0a1c`, borders `#2a2a58`
- accents: purple `#a06bff`, cyan `#22e6ff`, lavender `#c4b5fd`
- semantic: good `#34d399`, warn `#fbbf24`, danger `#ff5a66`
- monospace font, angled clipped panel corners, subtle glow shadows
- tier colors: LEGIT-REAL green, EARLY-REAL cyan, NARRATIVE-ONLY/SKETCHY yellow-red, PURE-LARP/AVOID red

Mobile: single column under ~820px.

## Constraints

- Backend is a plain Python HTTP server serving static files from `public/`. Simplest ship: build output goes into `public/` (any framework fine, just static build). If you want a separate frontend deploy, backend needs CORS headers added, ask first.
- Don't rename or change API routes; the permalink format `/r/<12-hex>` is fixed.
- No wallet connect, no auth, nothing onchain from the frontend. It's read-only over the API.
