"""Optional LLM polish layer: rewrite the rule-based report as sharper narrative.

Fully optional. The engine never requires it: if no API key is configured or the
call fails, callers fall back to the rule-based report from report.py.

Config via env vars (OpenAI-compatible chat completions API):
  FORENSIQ_LLM_API_KEY   required to enable polish
  FORENSIQ_LLM_MODEL     default gpt-4o-mini
  FORENSIQ_LLM_URL       default https://api.openai.com/v1/chat/completions
"""
import json
import os
import urllib.request

TIMEOUT = 30

SYSTEM = """You are Forensiq, a rug and larp scanner for crypto tokens. You turn raw scan
findings into a tight verdict report for degens. Style rules:
- Format exactly:
VERDICT: <TIER>, <one-line characterization in plain english>

chart
<2-4 short comma-chained lines: market stats, holder distribution, contract risk>

tech
<pitch line if a claimed product/narrative is evident from the data, then what the
github/site/socials evidence actually shows, calling out contradictions bluntly>

net: <2-3 sentence bottom line: what is real, what is not, what would change the read.>
- Keep the TIER exactly as given, never change it.
- Lowercase section headers "chart" and "tech", no markdown, no bullet points, no em-dashes.
- Every claim must come from the findings given. Never invent numbers, links, or facts.
- Blunt, dry, trench-native tone. Call out contradictions between marketing and evidence.
- Under 220 words total."""


def enabled():
    return bool(os.environ.get("FORENSIQ_LLM_API_KEY"))


def polish(sections, tier, total_flags, hard, fallback):
    """Return an LLM-polished report string, or `fallback` on any failure."""
    key = os.environ.get("FORENSIQ_LLM_API_KEY")
    if not key:
        return fallback
    model = os.environ.get("FORENSIQ_LLM_MODEL", "gpt-4o-mini")
    url = os.environ.get("FORENSIQ_LLM_URL", "https://api.openai.com/v1/chat/completions")

    # Strip the raw data blob, keep findings/good/flags per section.
    slim = {}
    for name, s in sections.items():
        slim[name] = {k: v for k, v in (s or {}).items()
                      if k in ("findings", "good", "flags", "hard_flags") and v}
    user = json.dumps({
        "tier": tier, "total_flags": total_flags, "hard_flags": hard,
        "sections": slim, "rule_based_report": fallback,
    }, indent=1)

    body = json.dumps({
        "model": model,
        "messages": [{"role": "system", "content": SYSTEM},
                     {"role": "user", "content": user}],
        "temperature": 0.4,
        "max_tokens": 500,
    }).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer {}".format(key),
    })
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            out = json.loads(r.read().decode("utf-8"))
        text = (out.get("choices") or [{}])[0].get("message", {}).get("content", "").strip()
        # Sanity: must keep the tier and the format skeleton.
        if text and tier in text and "net:" in text.lower():
            return text
    except Exception:
        pass
    return fallback
