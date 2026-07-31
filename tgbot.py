"""Forensiq Telegram bot: stdlib only, long polling, runs on Python 3.6+.

Commands:
  /start             intro and usage
  /scan <addr> [chain] [github=URL] [site=URL] [twitter=handle]
Bare messages containing an EVM address (0x + 40 hex) scan on robinhood,
a Solana base58 address (32 to 44 chars) scans on solana.

Env:
  TELEGRAM_BOT_TOKEN  required
  FORENSIQ_URL        full report site (default the Railway deployment)
  PREMIUM_CHAT_IDS    comma separated user ids with unlimited scans

Run: python3 tgbot.py
Self test (no token needed): python3 tgbot.py --selftest
"""
import html
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from hoodscan import market, contract, github_forensics, site as site_mod, socials, verdict
from hoodscan import scan as scan_cli

FORENSIQ_URL = os.environ.get("FORENSIQ_URL", "https://forensiq-production-d50a.up.railway.app")

CACHE_TTL = 600          # 10 minutes, same pattern as server.py
FREE_DAILY_LIMIT = 5
MAX_MSG = 4000

_cache = {}              # (address, chain) -> (ts, payload)
_usage = {}              # user_id -> {"day": "YYYY-MM-DD", "count": n}
_lock = threading.Lock()

EVM_RE = re.compile(r"\b(0x[a-fA-F0-9]{40})\b")
# base58 alphabet, no 0, O, I, l; word-boundary matched, EVM checked first
SOL_RE = re.compile(r"\b([1-9A-HJ-NP-Za-km-z]{32,44})\b")

# RH only for now per Rasta 2026-07-30.
CHAINS = ("robinhood",)

TIER_EMOJI = {
    "LEGIT-REAL": "\U0001F7E2",      # green circle
    "EARLY-REAL": "\U0001F7E2",
    "NARRATIVE-ONLY": "\U0001F7E1",  # yellow circle
    "SKETCHY": "\U0001F7E0",         # orange circle
    "PURE-LARP": "\U0001F534",       # red circle
    "AVOID": "\U0001F534",
}
WARN = "\u26A0\uFE0F"

START_TEXT = (
    "<b>Forensiq</b>: rug and larp scanner for Robinhood Chain.\n\n"
    "Usage:\n"
    "/scan &lt;address&gt;\n"
    "Optional extras: github=URL site=URL twitter=handle\n\n"
    "Or just paste a token address and I will scan it.\n\n"
    "Full reports: " + FORENSIQ_URL
)


def log(msg):
    print("[%s] %s" % (time.strftime("%Y-%m-%d %H:%M:%S"), msg), flush=True)


# ---------- scan engine ----------

def run_scan(address, chain, github=None, site_url=None, twitter=None):
    sections = {}
    m = market.scan(address, chain)
    sections["CHART"] = m
    mdata = m.get("data") or {}
    token_addr = mdata.get("token_addr") or address
    chain = mdata.get("chain") or chain
    launch_ms = mdata.get("launch_ms")
    token_name = mdata.get("name") or mdata.get("symbol") or ""

    sections["CONTRACT/HOLDERS"] = contract.scan(token_addr, chain, mdata.get("pair_addr"))
    gh_url = github or github_forensics.discover_from_market(mdata)
    sections["GITHUB"] = github_forensics.scan(gh_url, launch_ms)
    sections["SITE"] = site_mod.scan(site_url or scan_cli.discover_site(mdata))
    sections["SOCIALS"] = socials.scan(twitter or scan_cli.discover_twitter(mdata), launch_ms, site_url or scan_cli.discover_site(mdata))

    tier, total_flags, hard = verdict.compute_tier(sections)
    return {
        "address": token_addr,
        "chain": chain,
        "name": token_name,
        "tier": tier,
        "total_flags": total_flags,
        "hard_flags": hard,
        "sections": sections,
    }


def cached_scan(address, chain, github=None, site_url=None, twitter=None):
    key = (address.lower(), chain)
    now = time.time()
    with _lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < CACHE_TTL:
            return hit[1]
    result = run_scan(address, chain, github, site_url, twitter)
    with _lock:
        _cache[key] = (now, result)
    return result


# ---------- formatting ----------

def format_result(result):
    """Render a scan result as Telegram HTML, kept under MAX_MSG chars."""
    tier = result["tier"]
    emoji = TIER_EMOJI.get(tier, "")
    head = "%s <b>%s</b> (%d flag%s)" % (
        emoji, html.escape(tier), result["total_flags"],
        "s" if result["total_flags"] != 1 else "")
    name = result.get("name") or ""
    title = "%s %s on %s" % (html.escape(name), code(result["address"]), html.escape(result["chain"]))

    footer = '\nFull report: %s' % html.escape(FORENSIQ_URL)
    budget = MAX_MSG - len(head) - len(title) - len(footer) - 20

    blocks = []
    for sec_name in verdict.SECTION_ORDER:
        s = result["sections"].get(sec_name) or {}
        lines = ["<b>%s</b>" % html.escape(sec_name)]
        for f in (s.get("hard_flags") or []):
            lines.append("%s <b>%s</b>" % (WARN, html.escape(f)))
        for f in (s.get("flags") or []):
            lines.append("%s %s" % (WARN, html.escape(f)))
        for g in (s.get("good") or []):
            lines.append("\u2705 %s" % html.escape(g))
        for f in (s.get("findings") or []):
            lines.append("\u2022 %s" % html.escape(f))
        blocks.append(lines)

    # Assemble within budget, truncating findings first if needed.
    out_blocks = []
    used = 0
    for lines in blocks:
        block = "\n".join(lines)
        if used + len(block) + 2 > budget:
            # keep header and flags, drop findings progressively
            kept = [l for l in lines if not l.startswith("\u2022")]
            block = "\n".join(kept)
            if used + len(block) + 2 > budget:
                block = lines[0] + "\n(truncated)"
            else:
                block += "\n(findings truncated)"
        used += len(block) + 2
        out_blocks.append(block)

    return "%s\n%s\n\n%s\n%s" % (head, title, "\n\n".join(out_blocks), footer)


def code(s):
    return "<code>%s</code>" % html.escape(s)


# ---------- rate limiting / premium ----------

def premium_ids():
    raw = os.environ.get("PREMIUM_CHAT_IDS", "")
    return set(p.strip() for p in raw.split(",") if p.strip())


def allow_scan(user_id):
    if str(user_id) in premium_ids():
        return True
    day = time.strftime("%Y-%m-%d")
    with _lock:
        u = _usage.get(user_id)
        if not u or u["day"] != day:
            u = {"day": day, "count": 0}
        if u["count"] >= FREE_DAILY_LIMIT:
            _usage[user_id] = u
            return False
        u["count"] += 1
        _usage[user_id] = u
        return True


LIMIT_TEXT = (
    "Daily limit reached: %d free scans per day.\n"
    "Premium (unlimited scans) is coming soon. Meanwhile, use the site: %s"
    % (FREE_DAILY_LIMIT, FORENSIQ_URL))


# ---------- telegram api ----------

class Tg(object):
    def __init__(self, token):
        self.base = "https://api.telegram.org/bot%s/" % token

    def call(self, method, **params):
        data = urllib.parse.urlencode(
            {k: v for k, v in params.items() if v is not None}).encode("utf-8")
        req = urllib.request.Request(self.base + method, data=data)
        try:
            with urllib.request.urlopen(req, timeout=70) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            try:
                body = e.read().decode("utf-8")
            except Exception:
                body = str(e)
            log("api error %s: %s" % (method, body))
            return {"ok": False, "error": body}
        except Exception as e:
            log("api error %s: %s" % (method, e))
            return {"ok": False, "error": str(e)}

    def send(self, chat_id, text, reply_to=None):
        return self.call("sendMessage", chat_id=chat_id, text=text,
                         parse_mode="HTML", disable_web_page_preview="true",
                         reply_to_message_id=reply_to)

    def edit(self, chat_id, message_id, text):
        return self.call("editMessageText", chat_id=chat_id, message_id=message_id,
                         text=text, parse_mode="HTML", disable_web_page_preview="true")


# ---------- message handling ----------

def parse_scan_args(parts):
    """From tokens after the address, pick chain and key=value extras."""
    chain = "robinhood"
    extras = {}
    for p in parts:
        if "=" in p:
            k, v = p.split("=", 1)
            if k in ("github", "site", "twitter"):
                extras[k] = v
        elif p.lower() in CHAINS:
            chain = p.lower()
    return chain, extras


def detect_address(text):
    """Return (address, chain) or (None, None)."""
    m = EVM_RE.search(text)
    if m:
        return m.group(1), "robinhood"
    m = SOL_RE.search(text)
    if m:
        return m.group(1), "solana"
    return None, None


def handle_update(tg, upd):
    msg = upd.get("message") or upd.get("edited_message")
    if not msg or "text" not in msg:
        return
    chat_id = msg["chat"]["id"]
    user_id = (msg.get("from") or {}).get("id", chat_id)
    text = msg["text"].strip()

    if text.startswith("/start") or text.startswith("/help"):
        tg.send(chat_id, START_TEXT)
        return

    address = None
    chain = "robinhood"
    extras = {}
    if text.startswith("/scan"):
        parts = text.split()[1:]
        if not parts:
            tg.send(chat_id, "Usage: /scan &lt;address&gt; [chain] [github=URL site=URL twitter=handle]")
            return
        address = parts[0]
        chain, extras = parse_scan_args(parts[1:])
        # if no explicit chain and it looks base58 not EVM, default to solana
        if chain == "robinhood" and not EVM_RE.match(address) and SOL_RE.match(address):
            det, det_chain = detect_address(address)
            if det:
                chain = det_chain
    else:
        address, chain = detect_address(text)
        if not address:
            return  # ignore chatter

    if not allow_scan(user_id):
        tg.send(chat_id, html.escape(LIMIT_TEXT))
        return

    sent = tg.send(chat_id, "scanning...", reply_to=msg.get("message_id"))
    mid = (sent.get("result") or {}).get("message_id")
    try:
        result = cached_scan(address, chain, extras.get("github"),
                             extras.get("site"), extras.get("twitter"))
        out = format_result(result)
    except Exception as e:
        log("scan failed for %s/%s: %s" % (address, chain, e))
        out = "Scan failed: %s" % html.escape(str(e))
    if mid:
        tg.edit(chat_id, mid, out)
    else:
        tg.send(chat_id, out)


def poll_loop(tg):
    offset = None
    log("polling started")
    while True:
        try:
            resp = tg.call("getUpdates", timeout=50, offset=offset)
            for upd in resp.get("result") or []:
                offset = upd["update_id"] + 1
                try:
                    handle_update(tg, upd)
                except Exception as e:
                    log("update error: %s" % e)
        except Exception as e:
            log("poll error: %s" % e)
            time.sleep(5)


# ---------- self test ----------

def selftest():
    print("== address detection ==")
    cases = [
        ("0x8Cad179555e3dE1E99CbDb900eaE0593b9eC79Db", ("0x8Cad179555e3dE1E99CbDb900eaE0593b9eC79Db", "robinhood")),
        ("check 0x8Cad179555e3dE1E99CbDb900eaE0593b9eC79Db pls", ("0x8Cad179555e3dE1E99CbDb900eaE0593b9eC79Db", "robinhood")),
        ("So11111111111111111111111111111111111111112", ("So11111111111111111111111111111111111111112", "solana")),
        ("hello world", (None, None)),
        ("0x123", (None, None)),  # too short
        ("0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl", (None, None)),  # invalid base58 chars
    ]
    ok = True
    for text, want in cases:
        got = detect_address(text)
        status = "PASS" if got == want else "FAIL"
        if got != want:
            ok = False
        print("  %s %r -> %r" % (status, text[:50], got))

    print("\n== live scan + formatting ==")
    result = cached_scan("0x8Cad179555e3dE1E99CbDb900eaE0593b9eC79Db", "robinhood")
    out = format_result(result)
    print(out)
    print("\nlength: %d chars (limit %d)" % (len(out), MAX_MSG))
    assert len(out) < MAX_MSG, "message too long"
    assert result["tier"] in out, "tier missing from output"
    print("tier present: %s" % result["tier"])
    print("SELFTEST %s" % ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


def main():
    if "--selftest" in sys.argv:
        return selftest()
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        print("TELEGRAM_BOT_TOKEN is not set. Create a bot with @BotFather, "
              "then export TELEGRAM_BOT_TOKEN=<token> and rerun.")
        return 1
    poll_loop(Tg(token))
    return 0


if __name__ == "__main__":
    sys.exit(main())
