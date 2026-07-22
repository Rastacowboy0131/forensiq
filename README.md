# Forensiq v1 (formerly HoodScan)

Web UI + rule-based scan engine. Paste a CA, get the truth.

## Web server

Stdlib only, runs on Python 3.6+:

```
cd projects/hoodscan
python3 server.py        # PORT env var, default 8080
```

- `POST /api/scan` body `{"address": "0x...", "chain": "robinhood", "github": "", "site": "", "twitter": ""}` returns scan JSON plus rendered text. Results cache 10 minutes per address+chain. Rate limit: 10 scans/min per IP.
- `GET /api/history` last 50 scans (persisted to `scans.json`).
- `GET /` static frontend from `public/`.

## Railway deploy

`railway.json`, `Procfile`, and an empty `requirements.txt` are included, so from the repo root:

```
railway init   # once, link or create a project
railway up
```

Nixpacks detects Python, no dependencies to install, start command is `python3 server.py`, and Railway injects `PORT`. Note: `scans.json` lives on the ephemeral filesystem, so history resets on redeploy (attach a Railway volume mounted at the app dir if you want it durable).

Rule-based rug/larp scanner for Robinhood Chain (chain id 4663) and other EVM chains. No LLM calls: pure API checks and heuristics.

## Usage

```
cd projects/hoodscan
python3 -m hoodscan.scan <token_or_pair_address> [chain] [options]
```

- `chain` defaults to `robinhood`. Also supported: ethereum, bsc, base, arbitrum, polygon.
- `--github URL` github org or repo (auto-discovered from dexscreener token info when possible)
- `--site URL` project website
- `--twitter HANDLE` twitter handle
- `--json` machine-readable output

Example:

```
python3 -m hoodscan.scan 0x8Cad179555e3dE1E99CbDb900eaE0593b9eC79Db robinhood --github https://github.com/org/repo --site https://example.com --twitter handle
```

## Output

Five sections (CHART, CONTRACT/HOLDERS, GITHUB, SITE, SOCIALS), each with bullet findings and `[FLAG]` markers, then a final tier:

LEGIT-REAL / EARLY-REAL / NARRATIVE-ONLY / SKETCHY / PURE-LARP / AVOID

Hard flags (honeypot, live mint authority, dev-held high concentration with unlocked LP) force AVOID regardless of everything else.

## Modules

- `hoodscan/http.py` shared HTTP layer: 10s timeouts, per-run in-memory cache, requests with urllib fallback
- `hoodscan/market.py` dexscreener lookup (token or pair address), price/liquidity/volume, pair age, wash-trade heuristic (vol/liq > 10x plus buy:sell near 1:1)
- `hoodscan/contract.py` goplus token security (honeypot, taxes, mintable, owner privileges, blacklist) plus blockscout holder distribution (top-10 excluding LP and burn addresses). Blockscout base for Robinhood Chain: https://robinhoodchain.blockscout.com (verified working). Degrades to "unavailable" if blockscout fails
- `hoodscan/github_forensics.py` unauthenticated GitHub REST: repo age vs launch date, star:fork anomaly, fork detection, author count, CI workflow presence. Reports "rate limited" cleanly on 403
- `hoodscan/site.py` homepage fetch, template-shell markers (gitbook, framer, wix, carrd, notion), word count, dead-link sampling (up to 10 internal links). Domain age is out of scope for v1 (no whois dependency)
- `hoodscan/socials.py` twitter via fxtwitter API (created date vs launch, follower count), telegram stubbed for v1
- `hoodscan/verdict.py` flag aggregation, tier computation, chat-ready rendering
- `hoodscan/scan.py` CLI entrypoint

## Notes

- goplus covers Robinhood Chain natively with chain id 4663 (honeypot, taxes, holders, creator, LP info all populated).
- Host Python is 3.6 and lacks `requests`, so http.py falls back to urllib automatically.
- Tier heuristic: hard flags force AVOID; otherwise 0 flags with a real repo is LEGIT-REAL, up to 2 flags with substance (repo or site) is EARLY-REAL, otherwise NARRATIVE-ONLY, then SKETCHY (3-4), PURE-LARP (5-6), AVOID (7+).

## Telegram bot (tgbot.py)

Single-file, stdlib-only long-polling bot. Commands: `/start`, `/scan <address> [chain] [github=URL site=URL twitter=handle]`. Bare messages containing an EVM address (0x + 40 hex) scan on robinhood, base58 addresses scan on solana. Sends "scanning...", then edits the message with a compact HTML report (tier emoji, per-section flags, footer link to the full site). Results cached 10 minutes per (address, chain). Free users get 5 scans per day; ids in `PREMIUM_CHAT_IDS` (comma separated) are unlimited (premium is a stub for now).

Env vars:

- `TELEGRAM_BOT_TOKEN` (required): from @BotFather
- `FORENSIQ_URL` (optional): full-report site link for the footer
- `PREMIUM_CHAT_IDS` (optional): comma separated Telegram user ids

Run locally: `TELEGRAM_BOT_TOKEN=... python3 tgbot.py`
Self test without a token: `python3 tgbot.py --selftest`

### Deploy on Railway as a second service

In the same repo, add a second service in the Railway project and override its start command to `python3 tgbot.py` (Settings, Deploy, Custom Start Command). The web service keeps `web: python3 server.py` from the Procfile. Set `TELEGRAM_BOT_TOKEN` (and optionally `FORENSIQ_URL`, `PREMIUM_CHAT_IDS`) on the bot service only.
