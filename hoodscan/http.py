"""Shared HTTP helpers: 10s timeouts, per-run in-memory cache.

Uses requests when available, falls back to urllib (some hosts lack requests).
"""
import json as _json

try:
    import requests as _requests
except ImportError:
    _requests = None

import urllib.request
import urllib.parse
import urllib.error

TIMEOUT = 10
_cache = {}
HEADERS = {"User-Agent": "hoodscan/1.0"}


def _raw_get(url):
    """Return (status_code, text) or (None, None)."""
    if _requests:
        try:
            r = _requests.get(url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True)
            return r.status_code, r.text
        except Exception:
            return None, None
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.getcode(), r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception:
        return None, None


def get_json(url, params=None):
    """GET a URL, return parsed JSON or None. Cached per run.

    Returns {"_rate_limited": True} on HTTP 403.
    """
    if params:
        url = url + ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    if url in _cache:
        return _cache[url]
    status, text = _raw_get(url)
    if status == 403:
        data = {"_rate_limited": True}
    elif status == 200 and text:
        try:
            data = _json.loads(text)
        except ValueError:
            data = None
    else:
        data = None
    _cache[url] = data
    return data


def get_text(url):
    """GET a URL, return (status_code, text) or (None, None). Cached per run."""
    key = "text:" + url
    if key in _cache:
        return _cache[key]
    out = _raw_get(url)
    _cache[key] = out
    return out


def fmt_usd(v):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return "?"
    if v >= 1e6:
        return "${:.1f}M".format(v / 1e6)
    if v >= 1e3:
        return "${:.1f}k".format(v / 1e3)
    return "${:.0f}".format(v)
