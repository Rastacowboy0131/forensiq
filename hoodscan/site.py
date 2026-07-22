"""SITE section: template-shell detection and dead-link sampling for a project site."""
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


def scan(site_url):
    """Return {findings, flags} for the SITE section.

    Note: domain age (whois) is out of scope for v1, no whois dependency.
    """
    findings, flags = [], []
    if not site_url:
        return {"findings": ["no site URL provided"], "flags": []}
    if not site_url.startswith("http"):
        site_url = "https://" + site_url

    status, html = get_text(site_url)
    if status is None:
        return {"findings": ["site unreachable: {}".format(site_url)],
                "flags": ["site unreachable"]}
    if status >= 400:
        return {"findings": ["site returned HTTP {}".format(status)],
                "flags": ["site returns error {}".format(status)]}

    findings.append("site reachable ({} bytes)".format(len(html)))
    text = re.sub(r"<script.*?</script>|<style.*?</style>|<[^>]+>", " ", html, flags=re.S)
    words = len(text.split())
    findings.append("visible text: ~{} words".format(words))
    if words < 100:
        flags.append("near-empty homepage (<100 words)")

    low = html.lower()
    for marker, label in TEMPLATE_MARKERS:
        if marker in low:
            flags.append("template shell detected: {}".format(label))
            break

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
        flags.append("{}/{} sampled internal links dead".format(dead, len(internal)))

    findings.append("domain age check: out of scope for v1 (no whois)")
    return {"findings": findings, "flags": flags}
