"""CHART section: dexscreener market data plus wash-trade heuristic."""
import time
from .http import get_json, fmt_usd


def lookup(addr, chain=None):
    """Resolve a token or pair address via dexscreener. Returns best pair dict or None."""
    d = get_json("https://api.dexscreener.com/latest/dex/tokens/{}".format(addr))
    pairs = (d or {}).get("pairs") or []
    if not pairs:
        d = get_json("https://api.dexscreener.com/latest/dex/search", params={"q": addr})
        pairs = (d or {}).get("pairs") or []
    if chain:
        chain_pairs = [p for p in pairs if p.get("chainId") == chain]
        if chain_pairs:
            pairs = chain_pairs
    if not pairs:
        return None
    return max(pairs, key=lambda x: (x.get("liquidity") or {}).get("usd") or 0)


def scan(addr, chain=None):
    """Return {findings, flags, data} for the CHART section."""
    findings, flags, good = [], [], []
    p = lookup(addr, chain)
    if not p:
        return {"findings": ["no dexscreener data (not trading, or bad address)"],
                "flags": ["not trading on any indexed DEX"], "good": [], "data": None}

    base = p.get("baseToken") or {}
    liq = (p.get("liquidity") or {}).get("usd") or 0
    vol24 = (p.get("volume") or {}).get("h24") or 0
    tx24 = (p.get("txns") or {}).get("h24") or {}
    buys, sells = tx24.get("buys") or 0, tx24.get("sells") or 0
    created = p.get("pairCreatedAt")
    age_days = None
    if created:
        age_days = (time.time() * 1000 - created) / 86400000.0

    data = {
        "name": base.get("name"), "symbol": base.get("symbol"),
        "chain": p.get("chainId"), "dex": p.get("dexId"),
        "token_addr": base.get("address"), "pair_addr": p.get("pairAddress"),
        "price": p.get("priceUsd"), "liq": liq,
        "mcap": p.get("marketCap") or p.get("fdv"), "vol24": vol24,
        "buys24": buys, "sells24": sells, "age_days": age_days,
        "url": p.get("url"), "launch_ms": created,
        "info": p.get("info") or {},
    }

    findings.append("{} ({}) on {}/{}".format(data["name"], data["symbol"], data["chain"], data["dex"]))
    findings.append("price {} | mcap {} | liq {} | vol24 {}".format(
        data["price"], fmt_usd(data["mcap"]), fmt_usd(liq), fmt_usd(vol24)))
    findings.append("24h txns: {} buys / {} sells".format(buys, sells))
    if age_days is not None:
        findings.append("pair age: {:.1f} days".format(age_days))
        if age_days < 3:
            flags.append("very new pair (<3 days)")
        elif age_days >= 90:
            good.append("pair has survived {:.0f} days".format(age_days))
        elif age_days >= 30:
            good.append("pair over a month old")

    # Launchpad-heavy chains: thin liquidity is the norm (bonding curve tokens),
    # so it is informational there, not a flag. Elsewhere it stays a flag.
    launchpad_chain = data["chain"] in ("robinhood",)
    if liq < 5000:
        if launchpad_chain:
            findings.append("thin liquidity ({}), normal for launchpad tokens".format(fmt_usd(liq)))
        else:
            flags.append("very thin liquidity ({})".format(fmt_usd(liq)))
    elif liq < 15000:
        findings.append("thin liquidity ({})".format(fmt_usd(liq)))
    elif liq >= 100000:
        good.append("deep liquidity ({})".format(fmt_usd(liq)))
    elif liq >= 30000:
        good.append("decent liquidity ({})".format(fmt_usd(liq)))

    mcap = data["mcap"] or 0
    if mcap >= 1000000:
        good.append("market has priced this at {} and kept it there".format(fmt_usd(mcap)))

    # Sustained organic activity: real volume with a healthy number of txns.
    if total_organic_check(vol24, buys, sells, liq):
        good.append("sustained trading activity (vol24 {}, {} txns)".format(fmt_usd(vol24), buys + sells))

    # Wash-trade heuristic: high vol relative to liq plus buy:sell near 1:1 is churn.
    total_tx = buys + sells
    if liq > 0 and vol24 / liq > 10 and total_tx >= 20:
        ratio = buys / max(sells, 1)
        if 0.8 <= ratio <= 1.25:
            flags.append("possible wash trading (vol/liq {:.0f}x, buy:sell near 1:1)".format(vol24 / liq))

    return {"findings": findings, "flags": flags, "good": good, "data": data}


def total_organic_check(vol24, buys, sells, liq):
    """True when 24h volume looks real: meaningful size, plenty of txns, not churn."""
    total_tx = buys + sells
    if vol24 < 10000 or total_tx < 50:
        return False
    if liq > 0 and vol24 / liq > 10:
        ratio = buys / max(sells, 1)
        if 0.8 <= ratio <= 1.25:
            return False
    return True
