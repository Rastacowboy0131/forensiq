"""CONTRACT/HOLDERS section: goplus token security plus blockscout holder distribution."""
from .http import get_json

GOPLUS_CHAINS = {
    "robinhood": "4663", "ethereum": "1", "bsc": "56",
    "base": "8453", "arbitrum": "42161", "polygon": "137",
}
BLOCKSCOUT_BASES = {
    "robinhood": "https://robinhoodchain.blockscout.com",
    "ethereum": "https://eth.blockscout.com",
    "base": "https://base.blockscout.com",
    "arbitrum": "https://arbitrum.blockscout.com",
    "polygon": "https://polygon.blockscout.com",
}
BURN_ADDRS = {
    "0x0000000000000000000000000000000000000000",
    "0x000000000000000000000000000000000000dead",
}
ZERO = "0x0000000000000000000000000000000000000000"


def _goplus(addr, chain, findings, flags, hard_flags):
    cid = GOPLUS_CHAINS.get(chain)
    if not cid:
        findings.append("no goplus coverage for chain '{}'".format(chain))
        return None
    g = get_json("https://api.gopluslabs.io/api/v1/token_security/{}".format(cid),
                 params={"contract_addresses": addr})
    res = ((g or {}).get("result") or {}).get(addr.lower())
    if not res:
        findings.append("goplus returned no data")
        return None

    if res.get("is_honeypot") == "1":
        flags.append("HONEYPOT (cannot sell)")
        hard_flags.append("honeypot")
    if res.get("is_mintable") == "1":
        flags.append("mintable (supply can be inflated)")
        hard_flags.append("mint authority live")
    simple = [("can_take_back_ownership", "ownership can be taken back"),
              ("hidden_owner", "hidden owner"),
              ("selfdestruct", "selfdestruct in contract"),
              ("is_blacklisted", "blacklist function"),
              ("transfer_pausable", "transfers pausable"),
              ("is_proxy", "proxy contract (logic can change)")]
    for k, label in simple:
        if res.get(k) == "1":
            flags.append(label)

    bt, st = res.get("buy_tax"), res.get("sell_tax")
    try:
        if float(bt or 0) > 0.05 or float(st or 0) > 0.05:
            flags.append("high taxes: buy {} / sell {}".format(bt, st))
        elif bt or st:
            findings.append("taxes: buy {} / sell {}".format(bt, st))
    except ValueError:
        pass

    owner = res.get("owner_address")
    if owner in ("", ZERO):
        findings.append("ownership renounced")
    elif owner:
        findings.append("owner: {}".format(owner))
    if res.get("creator_address"):
        findings.append("creator: {}".format(res["creator_address"]))
    if res.get("holder_count"):
        findings.append("holders: {}".format(res["holder_count"]))
        try:
            if int(res["holder_count"]) < 50:
                flags.append("very few holders ({})".format(res["holder_count"]))
        except ValueError:
            pass
    if res.get("is_open_source") == "0":
        flags.append("contract source not verified")
    return res


def _lp_addresses(gp):
    """Collect LP pool addresses reported by goplus dex info."""
    out = set()
    for d in (gp or {}).get("dex") or []:
        if d.get("pair"):
            out.add(d["pair"].lower())
    for lp in (gp or {}).get("lp_holders") or []:
        if lp.get("address"):
            out.add(lp["address"].lower())
    return out


def _blockscout_holders(addr, chain, gp, findings, flags, hard_flags):
    base = BLOCKSCOUT_BASES.get(chain)
    if not base:
        findings.append("no blockscout endpoint known for chain '{}'".format(chain))
        return
    tok = get_json("{}/api/v2/tokens/{}".format(base, addr))
    hold = get_json("{}/api/v2/tokens/{}/holders".format(base, addr))
    if not tok or not hold:
        findings.append("blockscout unavailable, holder distribution skipped")
        return
    try:
        supply = float(tok.get("total_supply") or 0)
    except ValueError:
        supply = 0
    if supply <= 0:
        findings.append("blockscout: no supply data")
        return

    lp_addrs = _lp_addresses(gp)
    creator = ((gp or {}).get("creator_address") or "").lower()
    items = (hold.get("items") or [])
    non_lp = []
    lp_pct = 0.0
    for it in items:
        a = ((it.get("address") or {}).get("hash") or "").lower()
        try:
            pct = float(it.get("value") or 0) / supply * 100
        except ValueError:
            continue
        if a in BURN_ADDRS:
            continue
        if a in lp_addrs or (it.get("address") or {}).get("is_contract") and a in lp_addrs:
            lp_pct += pct
            continue
        if a in lp_addrs:
            continue
        non_lp.append((a, pct, (it.get("address") or {}).get("is_contract")))

    top10 = sum(p for _, p, _ in non_lp[:10])
    findings.append("top-10 holders (excl LP/burn): {:.1f}% of supply".format(top10))
    if lp_pct:
        findings.append("LP pools hold {:.1f}%".format(lp_pct))
    if non_lp:
        a, p, _ = non_lp[0]
        findings.append("largest non-LP holder: {:.1f}% ({})".format(p, a[:10] + "..."))
        if p > 20:
            flags.append("top holder owns {:.0f}%".format(p))
        if a == creator and p > 10:
            flags.append("creator holds {:.0f}% of supply".format(p))
            # LP lock status is not reliably reported on this chain; treat unlocked
            # dev-held LP plus high concentration as a hard flag when goplus says so.
            lp_locked = any(l.get("is_locked") == 1 for l in (gp or {}).get("lp_holders") or [])
            if p > 30 and not lp_locked:
                hard_flags.append("dev-held high concentration with unlocked LP")
    if top10 > 50:
        flags.append("top-10 concentration {:.0f}%".format(top10))


def scan(addr, chain):
    """Return {findings, flags, hard_flags} for the CONTRACT/HOLDERS section."""
    findings, flags, hard_flags = [], [], []
    gp = _goplus(addr, chain, findings, flags, hard_flags)
    _blockscout_holders(addr, chain, gp, findings, flags, hard_flags)
    return {"findings": findings, "flags": flags, "hard_flags": hard_flags}
