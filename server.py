"""Forensiq web server: stdlib only, runs on Python 3.6+.

Endpoints:
  POST /api/scan     {address, chain?, github?, site?, twitter?}
  GET  /api/history  last 50 scans
  GET  /             static frontend from public/

Run: python3 server.py (PORT env var, default 8080)
"""
import json
import os
import re
import socketserver
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

from hoodscan import market, contract, github_forensics, site as site_mod, socials, verdict
from hoodscan import scan as scan_cli

ROOT = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(ROOT, "public")
HISTORY_FILE = os.path.join(ROOT, "scans.json")

CACHE_TTL = 600          # 10 minutes
RATE_LIMIT = 10          # scans per minute per IP
HISTORY_MAX = 50

_cache = {}              # (address, chain) -> (ts, payload)
_rate = {}               # ip -> [timestamps]
_lock = threading.Lock()

ADDR_RE = re.compile(r"^[A-Za-z0-9]{20,64}$")
CHAINS = ("robinhood", "solana", "ethereum", "eth", "bsc", "base", "arbitrum", "polygon")


def load_history():
    try:
        with open(HISTORY_FILE) as f:
            return json.load(f)
    except Exception:
        return []


def save_history(items):
    tmp = HISTORY_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(items[:HISTORY_MAX], f)
    os.rename(tmp, HISTORY_FILE)


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
    sections["SOCIALS"] = socials.scan(twitter or scan_cli.discover_twitter(mdata), launch_ms)

    tier, total_flags, hard = verdict.compute_tier(sections)
    rendered = verdict.render(sections, tier, total_flags, hard)

    return {
        "address": token_addr,
        "chain": chain,
        "name": token_name,
        "tier": tier,
        "total_flags": total_flags,
        "hard_flags": hard,
        "sections": {k: {kk: vv for kk, vv in v.items() if kk != "data"}
                     for k, v in sections.items()},
        "rendered": rendered,
        "scanned_at": int(time.time()),
    }


def rate_ok(ip):
    now = time.time()
    with _lock:
        stamps = [t for t in _rate.get(ip, []) if now - t < 60]
        if len(stamps) >= RATE_LIMIT:
            _rate[ip] = stamps
            return False
        stamps.append(now)
        _rate[ip] = stamps
        return True


class Handler(BaseHTTPRequestHandler):
    server_version = "Forensiq/1.0"

    def log_message(self, fmt, *args):
        pass

    def _json(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/history":
            return self._json(200, load_history())
        if path == "/api/health":
            return self._json(200, {"ok": True})
        # static files
        if path == "/":
            path = "/index.html"
        fpath = os.path.normpath(os.path.join(PUBLIC, path.lstrip("/")))
        if not fpath.startswith(PUBLIC) or not os.path.isfile(fpath):
            return self._json(404, {"error": "not found"})
        ctype = {"html": "text/html", "css": "text/css", "js": "application/javascript",
                 "svg": "image/svg+xml", "png": "image/png",
                 "ico": "image/x-icon"}.get(fpath.rsplit(".", 1)[-1], "application/octet-stream")
        with open(fpath, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.split("?")[0] != "/api/scan":
            return self._json(404, {"error": "not found"})
        ip = self.headers.get("X-Forwarded-For", self.client_address[0]).split(",")[0].strip()
        if not rate_ok(ip):
            return self._json(429, {"error": "rate limit: max %d scans per minute" % RATE_LIMIT})
        try:
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
        except Exception:
            return self._json(400, {"error": "invalid JSON body"})

        address = (data.get("address") or "").strip()
        chain = (data.get("chain") or "robinhood").strip().lower()
        if not ADDR_RE.match(address):
            return self._json(400, {"error": "invalid address"})
        if chain not in CHAINS:
            return self._json(400, {"error": "unsupported chain"})

        key = (address.lower(), chain)
        now = time.time()
        with _lock:
            hit = _cache.get(key)
        if hit and now - hit[0] < CACHE_TTL:
            out = dict(hit[1])
            out["cached"] = True
            return self._json(200, out)

        try:
            result = run_scan(address, chain,
                              github=data.get("github") or None,
                              site_url=data.get("site") or None,
                              twitter=data.get("twitter") or None)
        except Exception as e:
            return self._json(502, {"error": "scan failed: %s" % e})

        with _lock:
            _cache[key] = (now, result)
            hist = load_history()
            hist.insert(0, {"address": result["address"], "chain": result["chain"],
                            "name": result.get("name") or "",
                            "tier": result["tier"], "ts": result["scanned_at"]})
            save_history(hist)

        result["cached"] = False
        return self._json(200, result)


class ThreadingServer(socketserver.ThreadingMixIn, HTTPServer):
    daemon_threads = True


def main():
    port = int(os.environ.get("PORT", "8080"))
    srv = ThreadingServer(("0.0.0.0", port), Handler)
    print("Forensiq listening on :%d" % port)
    srv.serve_forever()


if __name__ == "__main__":
    main()
