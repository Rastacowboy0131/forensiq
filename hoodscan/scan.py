"""CLI entrypoint: python3 -m hoodscan.scan <token_address> [chain] [options]."""
import argparse
import json
import sys

from . import market, contract, github_forensics, site, socials, verdict


def discover_site(market_data):
    """Find the project website in dexscreener token info links."""
    info = (market_data or {}).get("info") or {}
    for item in info.get("websites") or []:
        url = item.get("url") or ""
        if url and "github.com" not in url:
            return url
    return None


def discover_twitter(market_data):
    """Find the twitter handle in dexscreener token info socials."""
    import re as _re
    info = (market_data or {}).get("info") or {}
    for item in info.get("socials") or []:
        stype = (item.get("type") or "").lower()
        url = item.get("url") or ""
        if stype in ("twitter", "x") or "twitter.com" in url or "x.com" in url:
            m = _re.search(r"(?:twitter\.com|x\.com)/(@?[A-Za-z0-9_]{1,15})(?:[/?]|$)", url)
            if m:
                handle = m.group(1).lstrip("@")
                if handle.lower() not in ("intent", "share", "home", "search", "i"):
                    return handle
            h = item.get("handle")
            if h and not h.startswith("http"):
                return h.lstrip("@")
    return None


def main():
    ap = argparse.ArgumentParser(prog="hoodscan.scan",
                                 description="HoodScan: rug/larp scanner (v1, rule-based)")
    ap.add_argument("address", help="token or pair address")
    ap.add_argument("chain", nargs="?", default="robinhood", help="chain slug (default: robinhood)")
    ap.add_argument("--github", help="github org or repo URL")
    ap.add_argument("--site", help="project website URL")
    ap.add_argument("--twitter", help="twitter handle")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    args = ap.parse_args()

    sections = {}

    m = market.scan(args.address, args.chain)
    sections["CHART"] = m
    mdata = m.get("data") or {}
    token_addr = mdata.get("token_addr") or args.address
    chain = mdata.get("chain") or args.chain
    launch_ms = mdata.get("launch_ms")

    sections["CONTRACT/HOLDERS"] = contract.scan(token_addr, chain, mdata.get("pair_addr"))

    gh_url = args.github or github_forensics.discover_from_market(mdata)
    sections["GITHUB"] = github_forensics.scan(gh_url, launch_ms)

    site_url = args.site or discover_site(mdata)
    twitter = args.twitter or discover_twitter(mdata)
    sections["SITE"] = site.scan(site_url)
    sections["SOCIALS"] = socials.scan(twitter, launch_ms)

    tier, total_flags, hard = verdict.compute_tier(sections)

    if args.json:
        out = {"address": token_addr, "chain": chain, "tier": tier,
               "total_flags": total_flags, "hard_flags": hard,
               "sections": {k: {kk: vv for kk, vv in v.items() if kk != "data"}
                            for k, v in sections.items()}}
        print(json.dumps(out, indent=2))
    else:
        print(verdict.render(sections, tier, total_flags, hard))


if __name__ == "__main__":
    sys.exit(main())
