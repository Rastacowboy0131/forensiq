"""Verdict aggregation: turn section flags into a tier and a chat-ready block."""

TIERS = ["LEGIT-REAL", "EARLY-REAL", "NARRATIVE-ONLY", "SKETCHY", "PURE-LARP", "AVOID"]

SECTION_ORDER = ["CHART", "CONTRACT/HOLDERS", "GITHUB", "SITE", "SOCIALS"]


def compute_tier(sections):
    """Tier from flag counts plus hard flags. Hard flags force AVOID."""
    hard = []
    total_flags = 0
    for s in sections.values():
        hard.extend(s.get("hard_flags") or [])
        total_flags += len(s.get("flags") or [])
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
    return tier, total_flags, hard


def render(sections, tier, total_flags, hard):
    lines = []
    for name in SECTION_ORDER:
        s = sections.get(name) or {}
        lines.append("== {} ==".format(name))
        for f in s.get("flags") or []:
            lines.append("  [FLAG] {}".format(f))
        for f in s.get("hard_flags") or []:
            lines.append("  [HARD FLAG] {}".format(f))
        for f in s.get("findings") or []:
            lines.append("  - {}".format(f))
        lines.append("")
    lines.append("VERDICT: {} ({} flag{}{})".format(
        tier, total_flags, "s" if total_flags != 1 else "",
        ", hard flags force AVOID" if hard else ""))
    return "\n".join(lines)
