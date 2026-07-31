"""SITE section: substance analysis, template-shell detection, dead-link sampling.

Returns findings (neutral facts), good (positive signals), flags (negative signals).
"""
import re
from urllib.parse import urljoin, urlparse
from .http import get_text

TEMPLATE_MARKERS = [
    ("gitbook", "gitbook shell"),
    ("cdn.gitbook.com", "gitbook shell"),
    ("framerusercontent", "framer template"),
    ("wixstatic", "wix template"),
    ("carrd.co", "carrd one-pager"),
    ("notion.site", "notion page as site"),
]

# Substance markers: links/paths that suggest a real product, not a landing page.
SUBSTANCE_PATTERNS = [
    (r'href=["\'][^"\']*(?:/docs|docs\.)', "docs"),
    (r'href=["\'][^"\']*(?:/app|app\.)', "app"),
    (r'href=["\'][^"\']*(?:/api\b|api\.)', "api"),
    (r'href=["\'][^"\']*github\.com', "github link"),
    (r'href=["\'][^"\']*(?:/whitepaper|whitepaper\.|litepaper)', "whitepaper"),
    (r'href=["\'][^"\']*(?:/blog|blog\.|/changelog)', "blog/changelog"),
    (r'href=["\'][^"\']*(?:/dashboard|dashboard\.)', "dashboard"),
]


def scan(site_url):
    """Return {findings, good, flags} for the SITE section.

    Note: domain age (whois) is out of scope for v1, no whois dependency.
    """
    findings, good, flags = [], [], []
    if not site_url:
        return {"findings": ["no site URL provided"], "good": [], "flags": []}
    if not site_url.startswith("http"):
        site_url = "https://" + site_url

    status, html = get_text(site_url)
    if status is None:
        return {"findings": ["site unreachable: {}".format(site_url)],
                "good": [], "flags": ["site unreachable"]}
    if status >= 400:
        return {"findings": ["site returned HTTP {}".format(status)],
                "good": [], "flags": ["site returns error {}".format(status)]}

    findings.append("site reachable ({} bytes)".format(len(html)))
    text = re.sub(r"<script.*?</script>|<style.*?</style>|<[^>]+>", " ", html, flags=re.S)
    words = len(text.split())
    findings.append("visible text: ~{} words".format(words))

    low = html.lower()

    # SPA detection: tiny server HTML with a JS bundle and a mount div is a
    # client-rendered app, not an empty page. We cannot render JS here, so do
    # not punish it; check the bundle for substance instead.
    scripts = re.findall(r'src=["\'](.*?\.js[^"\']*)["\']', html)
    has_mount = bool(re.search(r'<div[^>]+id=["\'](?:root|app|__next)["\']', low))
    is_spa = words < 100 and scripts and has_mount
    bundle_js = ""
    if is_spa:
        findings.append("client-rendered app (SPA): {} script bundle(s), cannot render JS here".format(len(scripts)))
        st, bundle_js = get_text(urljoin(site_url, scripts[0]))
        if st is None or st >= 400:
            bundle_js = ""
        if bundle_js and len(bundle_js) > 100000:
            good.append("substantial application bundle ({}kb of compiled app code)".format(len(bundle_js) // 1000))

    if words < 100 and not is_spa:
        flags.append("near-empty homepage (<100 words of content)")
    elif words >= 400:
        good.append("substantial homepage content (~{} words)".format(words))

    for marker, label in TEMPLATE_MARKERS:
        if marker in low:
            flags.append("template shell detected: {}".format(label))
            break

    # Substance markers (search bundle too for SPAs, where URLs live in JS).
    substance = []
    bundle_low = bundle_js.lower()[:500000] if bundle_js else ""
    bundle_markers = [
        ("github.com/", "github link"),
        ("/docs", "docs"),
        ("whitepaper", "whitepaper"),
        ("/changelog", "blog/changelog"),
    ]
    for pat, label in SUBSTANCE_PATTERNS:
        if re.search(pat, low):
            substance.append(label)
    for needle, label in bundle_markers:
        if label not in substance and needle in bundle_low:
            substance.append(label)
    if substance:
        findings.append("substance links found: {}".format(", ".join(substance)))
        if len(substance) >= 2:
            good.append("real product surface: {} linked from homepage".format(" + ".join(substance[:4])))
    else:
        findings.append("no docs/app/api/github links on homepage")

    # HTTPS and basic hygiene.
    if site_url.startswith("https://"):
        pass  # expected, not praiseworthy
    if "<title>" in low:
        m = re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I)
        title = (m.group(1).strip() if m else "")[:80]
        if title:
            findings.append("title: {}".format(title))
        if title.lower() in ("", "document", "untitled", "react app", "vite app", "home"):
            flags.append("default/unset page title ('{}'), template never customized".format(title or "empty"))

    # Sample up to 10 internal links, count dead ones.
    host = urlparse(site_url).netloc
    links = re.findall(r'href=["\'](.*?)["\']', html)
    internal = []
    seen = set()
    for l in links:
        if l.startswith(("#", "mailto:", "javascript:")):
            continue
        full = urljoin(site_url, l)
        if urlparse(full).netloc != host or full in seen:
            continue
        seen.add(full)
        internal.append(full)
        if len(internal) >= 10:
            break
    dead = 0
    for l in internal:
        s, _ = get_text(l)
        if s is None or s >= 400:
            dead += 1
    findings.append("sampled {} internal links, {} dead".format(len(internal), dead))
    if internal and dead / len(internal) > 0.3:
        flags.append("{}/{} sampled internal links dead (facade site)".format(dead, len(internal)))
    elif len(internal) >= 5 and dead == 0:
        good.append("all {} sampled internal pages load".format(len(internal)))

    findings.append("domain age check: out of scope for v1 (no whois)")
    return {"findings": findings, "good": good, "flags": flags}
