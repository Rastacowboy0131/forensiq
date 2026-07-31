"""Report renderer: compose a clean narrative-style report from scan sections.

Format (per Rasta's spec):

VERDICT: TIER, one-line characterization

chart
<market + holder distribution prose, comma-joined lines>

tech
<github / site / socials prose>

net: plain-english summary paragraph.
"""

TIER_LABELS = {
    "LEGIT-REAL": "verifiable substance, real team activity",
    "EARLY-REAL": "something real exists but it is early",
    "NARRATIVE-ONLY": "a story and a chart, no verifiable substance yet",
    "SKETCHY": "multiple warning signs, assume the worst until proven otherwise",
    "PURE-LARP": "dressed up to look real, it is not",
    "AVOID": "do not touch",
}


def _mdata(sections):
    return (sections.get("CHART") or {}).get("data") or {}


def _fmt_usd(v):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return "?"
    if v >= 1e6:
        return "${:.1f}M".format(v / 1e6)
    if v >= 1e3:
        return "${:.0f}k".format(v / 1e3)
    return "${:.0f}".format(v)


def _grab(findings, *needles):
    """Return the first finding containing any needle, else None."""
    for f in findings or []:
        low = f.lower()
        for n in needles:
            if n in low:
                return f
    return None


def _headline(sections, tier, hard):
    """One-line characterization for the VERDICT line."""
    if hard:
        return hard[0]
    worst = None
    best = None
    for name in ("GITHUB", "SITE", "SOCIALS", "CONTRACT/HOLDERS", "CHART"):
        s = sections.get(name) or {}
        if not worst and (s.get("flags") or []):
            worst = s["flags"][0]
        if not best and (s.get("good") or []):
            best = s["good"][0]
    if tier in ("LEGIT-REAL", "EARLY-REAL"):
        return best or TIER_LABELS.get(tier, "")
    if worst and best:
        return "{}, but {}".format(worst, best)
    return worst or TIER_LABELS.get(tier, "")


def _chart_block(sections):
    d = _mdata(sections)
    ch = sections.get("CHART") or {}
    co = sections.get("CONTRACT/HOLDERS") or {}
    lines = []
    if d:
        age = d.get("age_days")
        age_s = ("{:.0f} days old".format(age) if age and age >= 2
                 else "{:.1f} hours old".format(age * 24) if age is not None else "age unknown")
        lines.append("{}, {}, {}, {},".format(
            d.get("symbol") or d.get("name") or "?", d.get("chain") or "?",
            d.get("dex") or "?", age_s))
        lines.append("{} mcap, {} liq, {} vol24, {}/{} buys/sells,".format(
            _fmt_usd(d.get("mcap")), _fmt_usd(d.get("liq")), _fmt_usd(d.get("vol24")),
            d.get("buys24") or 0, d.get("sells24") or 0))
    else:
        lines.append("no dexscreener data, not trading or bad address,")

    hf = co.get("findings") or []
    holders = _grab(hf, "holders:")
    top10 = _grab(hf, "top-10 holders")
    largest = _grab(hf, "largest non-lp holder")
    dist_bits = [b for b in (holders, top10, largest) if b]
    if dist_bits:
        lines.append(", ".join(dist_bits) + ",")

    risk_bits = list(co.get("hard_flags") or []) + list(co.get("flags") or [])
    ch_flags = [f for f in (ch.get("flags") or []) if "not trading" not in f]
    risk_bits += ch_flags
    if risk_bits:
        lines.append("risk: " + ", ".join(risk_bits) + ",")
    else:
        renounced = _grab(hf, "renounced")
        taxes = _grab(hf, "taxes:")
        clean = [b for b in (renounced, taxes) if b]
        lines.append(("contract clean ({}),".format(", ".join(clean))
                      if clean else "contract clean, risk is distribution not code,"))
    return "\n".join(lines)


def _tech_block(sections):
    lines = []
    for name, label in (("GITHUB", "github"), ("SITE", "site"), ("SOCIALS", "socials")):
        s = sections.get(name) or {}
        bits = []
        for g in s.get("good") or []:
            bits.append(g)
        for f in s.get("flags") or []:
            bits.append("BUT " + f if bits else f)
        if not bits:
            # fall back to the most informative finding
            fnd = s.get("findings") or []
            skip = ("telegram checks", "domain age", "no CI", "sampled")
            informative = [x for x in fnd if not any(k in x for k in skip)]
            if informative:
                bits.append(informative[0])
        if bits:
            lines.append("{}: {},".format(label, ", ".join(bits)))
    return "\n".join(lines) if lines else "nothing to check: no github, site, or socials found,"


def _net_block(sections, tier, hard):
    goods, bads = [], []
    for name in ("CHART", "CONTRACT/HOLDERS", "GITHUB", "SITE", "SOCIALS"):
        s = sections.get(name) or {}
        goods.extend(s.get("good") or [])
        bads.extend((s.get("hard_flags") or []) + (s.get("flags") or []))
    parts = []
    if hard:
        parts.append("hard stop: {}".format(hard[0]))
    if goods and bads:
        parts.append("{}, but {}".format(goods[0], bads[0]))
    elif goods:
        parts.append(goods[0])
    elif bads:
        parts.append(bads[0])
    tail = TIER_LABELS.get(tier)
    if tail:
        parts.append(tail)
    return "net: " + ". ".join(parts) + "."


def render_report(sections, tier, total_flags, hard):
    out = []
    out.append("VERDICT: {}, {}".format(tier, _headline(sections, tier, hard)))
    out.append("")
    out.append("chart")
    out.append(_chart_block(sections))
    out.append("")
    out.append("tech")
    out.append(_tech_block(sections))
    out.append("")
    out.append(_net_block(sections, tier, hard))
    return "\n".join(out)
