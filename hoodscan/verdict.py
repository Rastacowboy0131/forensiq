"""Verdict aggregation: turn section signals into a tier plus a plain-english summary."""

TIERS = ["LEGIT-REAL", "EARLY-REAL", "NARRATIVE-ONLY", "SKETCHY", "PURE-LARP", "AVOID"]

SECTION_ORDER = ["CHART", "CONTRACT/HOLDERS", "GITHUB", "SITE", "SOCIALS"]


def compute_tier(sections):
    """Tier from flag counts plus hard flags, tempered by good signals.

    Hard flags force AVOID. Good signals can lift a borderline tier one step.
    """
    hard = []
    total_flags = 0
    total_good = 0
    for s in sections.values():
        hard.extend(s.get("hard_flags") or [])
        total_flags += len(s.get("flags") or [])
        total_good += len(s.get("good") or [])
    if hard:
        return "AVOID", total_flags, hard

    # Substance signals: does anything real exist beyond a chart?
    gh_flags = len(sections.get("GITHUB", {}).get("flags") or [])
    gh_findings = sections.get("GITHUB", {}).get("findings") or []
    has_repo = any(f.startswith("repo:") for f in gh_findings)
    site_findings = sections.get("SITE", {}).get("findings") or []
    has_site = any("reachable" in f for f in site_findings)
    has_substance = has_repo or has_site

    if total_flags == 0:
        tier = "LEGIT-REAL" if has_repo and gh_flags == 0 else ("EARLY-REAL" if has_substance else "NARRATIVE-ONLY")
    elif total_flags <= 2:
        tier = "EARLY-REAL" if has_substance else "NARRATIVE-ONLY"
    elif total_flags <= 4:
        tier = "SKETCHY"
    elif total_flags <= 6:
        tier = "PURE-LARP"
    else:
        tier = "AVOID"

    # Strong positive evidence lifts a borderline negative tier one step
    # (never past EARLY-REAL, and never out of AVOID).
    if total_good >= 4 and tier in ("SKETCHY", "NARRATIVE-ONLY"):
        idx = TIERS.index(tier)
        tier = TIERS[max(idx - 1, 1)]

    return tier, total_flags, hard


def summarize(sections, tier, total_flags, hard):
    """Plain-english one-paragraph summary: strongest good, worst bad, net read."""
    goods, bads = [], []
    for name in SECTION_ORDER:
        s = sections.get(name) or {}
        for g in s.get("good") or []:
            goods.append((name, g))
        for f in (s.get("hard_flags") or []) + (s.get("flags") or []):
            bads.append((name, f))

    parts = []
    if hard:
        parts.append("Hard stop: {}.".format(hard[0]))
    if goods:
        top = goods[:3]
        parts.append("Strongest positives: " + "; ".join(
            "{} ({})".format(g, n.lower()) for n, g in top) + ".")
    else:
        parts.append("No positive signals found beyond basic existence.")
    if bads:
        top = bads[:3]
        parts.append("Biggest concerns: " + "; ".join(
            "{} ({})".format(f, n.lower()) for n, f in top) + ".")
    elif not hard:
        parts.append("No red flags in any section.")

    net = {
        "LEGIT-REAL": "Net read: real project with verifiable substance.",
        "EARLY-REAL": "Net read: something real exists but it is early, size accordingly.",
        "NARRATIVE-ONLY": "Net read: a story and a chart, no verifiable substance yet.",
        "SKETCHY": "Net read: multiple warning signs, assume the worst until proven otherwise.",
        "PURE-LARP": "Net read: dressed up to look real, it is not.",
        "AVOID": "Net read: do not touch.",
    }.get(tier, "")
    if net:
        parts.append(net)
    return " ".join(parts)


def render(sections, tier, total_flags, hard):
    lines = []
    for name in SECTION_ORDER:
        s = sections.get(name) or {}
        lines.append("== {} ==".format(name))
        for f in s.get("hard_flags") or []:
            lines.append("  [HARD FLAG] {}".format(f))
        for f in s.get("flags") or []:
            lines.append("  [FLAG] {}".format(f))
        for g in s.get("good") or []:
            lines.append("  [GOOD] {}".format(g))
        for f in s.get("findings") or []:
            lines.append("  - {}".format(f))
        lines.append("")
    total_good = sum(len(s.get("good") or []) for s in sections.values())
    lines.append("VERDICT: {} ({} flag{}, {} good signal{}{})".format(
        tier, total_flags, "s" if total_flags != 1 else "",
        total_good, "s" if total_good != 1 else "",
        ", hard flags force AVOID" if hard else ""))
    lines.append("")
    lines.append(summarize(sections, tier, total_flags, hard))
    return "\n".join(lines)
