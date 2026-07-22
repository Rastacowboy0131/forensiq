# HoodScan v1

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
