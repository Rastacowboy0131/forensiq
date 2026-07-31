"""GITHUB section: repo forensics via unauthenticated GitHub REST API.

Returns findings (neutral facts), good (positive signals), flags (negative signals).
"""
import re
from datetime import datetime, timezone
from .http import get_json

API = "https://api.github.com"


def _parse_dt(s):
    try:
        return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except Exception:
        return None


def discover_from_market(market_data):
    """Try to find a github URL in dexscreener token info links."""
    info = (market_data or {}).get("info") or {}
    for group in ("websites", "socials"):
        for item in info.get(group) or []:
            url = item.get("url") or ""
            if "github.com" in url:
                return url
    return None


def discover_from_site(site_url):
    """Find a github repo link on the project site, including inside JS bundles.

    SPA dashboards often have a bare index.html with the github link buried in
    the compiled bundle, so scan up to 3 script assets too.
    """
    from .http import get_text
    from urllib.parse import urljoin
    if not site_url:
        return None
    if not site_url.startswith("http"):
        site_url = "https://" + site_url
    status, html = get_text(site_url)
    if status is None or status >= 400 or not html:
        return None
    m = re.search(r"github\.com/([\w.-]+/[\w.-]+)", html)
    if m:
        return "https://github.com/" + m.group(1)
    scripts = re.findall(r'src=["\'](.*?\.js[^"\']*)["\']', html)[:3]
    for s in scripts:
        st, js = get_text(urljoin(site_url, s))
        if st is None or st >= 400 or not js:
            continue
        m = re.search(r"github\.com/([\w.-]+/[\w.-]+)", js)
        if m:
            name = m.group(1)
            # Skip common vendor repos that show up in bundle license headers.
            low = name.lower()
            if any(v in low for v in ("facebook/", "vitejs/", "vuejs/", "sveltejs/",
                                      "twbs/", "jquery/", "webpack/", "babel/")):
                continue
            return "https://github.com/" + name
    return None


def _parse_repo(url):
    m = re.search(r"github\.com/([\w.-]+)(?:/([\w.-]+))?", url or "")
    if not m:
        return None, None
    return m.group(1), m.group(2)


def scan(github_url, launch_ms=None):
    """Return {findings, good, flags} for the GITHUB section."""
    findings, good, flags = [], [], []
    if not github_url:
        return {"findings": ["no github URL provided or discovered"], "good": [], "flags": []}

    owner, repo = _parse_repo(github_url)
    if not owner:
        return {"findings": ["could not parse github URL: {}".format(github_url)],
                "good": [], "flags": []}

    if not repo:
        # Org URL: pick the most recently pushed repo.
        repos = get_json("{}/users/{}/repos?sort=pushed&per_page=5".format(API, owner))
        if isinstance(repos, dict) and repos.get("_rate_limited"):
            return {"findings": ["github API rate limited, skipped"], "good": [], "flags": []}
        if not repos or not isinstance(repos, list):
            return {"findings": ["github org/user '{}' not found or empty".format(owner)],
                    "good": [], "flags": ["github org/user not found"]}
        repo = repos[0].get("name")
        findings.append("org URL given, inspecting most active repo: {}/{}".format(owner, repo))

    r = get_json("{}/repos/{}/{}".format(API, owner, repo))
    if isinstance(r, dict) and r.get("_rate_limited"):
        return {"findings": ["github API rate limited, skipped"], "good": [], "flags": []}
    if not r or "full_name" not in r:
        return {"findings": ["repo {}/{} not found".format(owner, repo)],
                "good": [], "flags": ["github repo not found"]}

    created = _parse_dt(r.get("created_at"))
    pushed = _parse_dt(r.get("pushed_at"))
    stars = r.get("stargazers_count") or 0
    forks = r.get("forks_count") or 0
    findings.append("repo: {} (created {})".format(r["full_name"], created.date() if created else "?"))
    findings.append("stars {} / forks {} / open issues {}".format(stars, forks, r.get("open_issues_count", 0)))

    if r.get("fork"):
        flags.append("repo is a fork of {}".format((r.get("parent") or {}).get("full_name", "unknown")))
    if stars >= 50 and forks == 0:
        flags.append("star:fork anomaly ({} stars, 0 forks, possible bought stars)".format(stars))
    elif stars >= 20 and forks >= 3:
        good.append("organic-looking traction ({} stars, {} forks)".format(stars, forks))

    if r.get("description"):
        findings.append("description: {}".format(r["description"][:100]))
    lang = r.get("language")
    if lang:
        findings.append("primary language: {}".format(lang))

    # Recency: is anyone still working on this?
    now = datetime.now(timezone.utc)
    if pushed:
        stale_days = (now - pushed).days
        if stale_days <= 7:
            good.append("active development (last push {} days ago)".format(stale_days))
        elif stale_days > 60:
            flags.append("repo abandoned ({} days since last push)".format(stale_days))
        else:
            findings.append("last push {} days ago".format(stale_days))

    # Commit history analysis.
    commits = get_json("{}/repos/{}/{}/commits?per_page=100".format(API, owner, repo))
    authors = set()
    first_commit = None
    if isinstance(commits, list) and commits:
        dates = []
        for c in commits:
            a = (c.get("author") or {}).get("login") or ((c.get("commit") or {}).get("author") or {}).get("name")
            if a:
                authors.add(a)
            dt = _parse_dt(((c.get("commit") or {}).get("author") or {}).get("date") or "")
            if dt:
                dates.append(dt)
        last = commits[-1]
        first_commit = _parse_dt(((last.get("commit") or {}).get("author") or {}).get("date") or "")
        findings.append("recent commits: {} (last 100 max), distinct authors: {}".format(
            len(commits), len(authors)))

        if len(authors) >= 3:
            good.append("{} distinct contributors (real team, not one dev)".format(len(authors)))
        elif len(commits) >= 20 and len(authors) == 1:
            findings.append("single-author repo")

        # Commit time spread: history dumped in one burst is a backdating/copy tell.
        # Skip for brand-new repos where the span physically can't be longer.
        repo_age_days = (now - created).days if created else 999
        if len(dates) >= 10 and repo_age_days > 7:
            span_days = (max(dates) - min(dates)).days
            distinct_days = len({d.date() for d in dates})
            if span_days <= 2:
                flags.append("{} commits all within {} days (history dumped in one burst)".format(
                    len(dates), max(span_days, 1)))
            elif distinct_days >= 10:
                good.append("commits spread over {} distinct days across {} days (organic history)".format(
                    distinct_days, span_days))

        # Commits slightly predating creation happens with local commits pushed
        # after repo creation; only a real tell when the gap is days.
        if first_commit and created and (created - first_commit).days >= 2:
            flags.append("commits predate repo creation (history copied or repo recreated)")
    else:
        findings.append("could not fetch commits")

    if launch_ms and created:
        launch = datetime.fromtimestamp(launch_ms / 1000, tz=timezone.utc)
        delta = (launch - created).days
        findings.append("repo created {} days before token launch".format(delta))
        if 0 <= delta <= 7:
            flags.append("repo created within a week of token launch")
        elif delta > 90:
            good.append("repo predates token launch by {} months".format(delta // 30))

    # Releases: shipped artifacts are strong substance.
    rel = get_json("{}/repos/{}/{}/releases?per_page=5".format(API, owner, repo))
    if isinstance(rel, list) and rel:
        latest = rel[0]
        good.append("{} release(s) published, latest: {}".format(
            len(rel), latest.get("tag_name") or latest.get("name") or "?"))

    wf = get_json("{}/repos/{}/{}/contents/.github/workflows".format(API, owner, repo))
    if isinstance(wf, list) and wf:
        good.append("CI workflows present ({})".format(len(wf)))
    else:
        findings.append("no CI workflows")

    return {"findings": findings, "good": good, "flags": flags}
