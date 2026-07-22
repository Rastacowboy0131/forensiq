"""CLI entrypoint: python3 -m hoodscan.scan <token_address> [chain] [options]."""
import argparse
import json
import sys

from . import market, contract, github_forensics, site, socials, verdict


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

    sections["CONTRACT/HOLDERS"] = contract.scan(token_addr, chain)

    gh_url = args.github or github_forensics.discover_from_market(mdata)
    sections["GITHUB"] = github_forensics.scan(gh_url, launch_ms)

    sections["SITE"] = site.scan(args.site)
    sections["SOCIALS"] = socials.scan(args.twitter, launch_ms)

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
