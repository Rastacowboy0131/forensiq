"""GITHUB section: repo forensics via unauthenticated GitHub REST API."""
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


def _parse_repo(url):
    m = re.search(r"github\.com/([\w.-]+)(?:/([\w.-]+))?", url or "")
    if not m:
        return None, None
    return m.group(1), m.group(2)


def scan(github_url, launch_ms=None):
    """Return {findings, flags} for the GITHUB section."""
    findings, flags = [], []
    if not github_url:
        return {"findings": ["no github URL provided or discovered"], "flags": []}

    owner, repo = _parse_repo(github_url)
    if not owner:
        return {"findings": ["could not parse github URL: {}".format(github_url)], "flags": []}

    if not repo:
        # Org URL: pick the most recently pushed repo.
        repos = get_json("{}/users/{}/repos?sort=pushed&per_page=5".format(API, owner))
        if isinstance(repos, dict) and repos.get("_rate_limited"):
            return {"findings": ["github API rate limited, skipped"], "flags": []}
        if not repos or not isinstance(repos, list):
            return {"findings": ["github org/user '{}' not found or empty".format(owner)], "flags": []}
        repo = repos[0].get("name")
        findings.append("org URL given, inspecting most active repo: {}/{}".format(owner, repo))

    r = get_json("{}/repos/{}/{}".format(API, owner, repo))
    if isinstance(r, dict) and r.get("_rate_limited"):
        return {"findings": ["github API rate limited, skipped"], "flags": []}
    if not r or "full_name" not in r:
        return {"findings": ["repo {}/{} not found".format(owner, repo)], "flags": ["github repo not found"]}

    created = _parse_dt(r.get("created_at"))
    stars = r.get("stargazers_count") or 0
    forks = r.get("forks_count") or 0
    findings.append("repo: {} (created {})".format(r["full_name"], created.date() if created else "?"))
    findings.append("stars {} / forks {} / open issues {}".format(stars, forks, r.get("open_issues_count", 0)))

    if r.get("fork"):
        flags.append("repo is a fork of {}".format((r.get("parent") or {}).get("full_name", "unknown")))
    if stars >= 50 and forks == 0:
        flags.append("star:fork anomaly ({} stars, 0 forks, possible bought stars)".format(stars))

    # First commit date via oldest page of commits (cheap approximation: last page).
    commits = get_json("{}/repos/{}/{}/commits?per_page=100".format(API, owner, repo))
    authors = set()
    first_commit = None
    if isinstance(commits, list) and commits:
        for c in commits:
            a = (c.get("author") or {}).get("login") or ((c.get("commit") or {}).get("author") or {}).get("name")
            if a:
                authors.add(a)
        last = commits[-1]
        first_commit = _parse_dt(((last.get("commit") or {}).get("author") or {}).get("date") or "")
        findings.append("recent commits: {} (last 100 max), distinct authors: {}".format(len(commits), len(authors)))
        if len(commits) >= 20 and len(authors) == 1:
            findings.append("single-author repo")
        if first_commit and created and first_commit < created:
            flags.append("commits predate repo creation (history copied or repo recreated)")
    else:
        findings.append("could not fetch commits")

    if launch_ms and created:
        launch = datetime.fromtimestamp(launch_ms / 1000, tz=timezone.utc)
        delta = (launch - created).days
        findings.append("repo created {} days before token launch".format(delta))
        if 0 <= delta <= 7:
            flags.append("repo created within a week of token launch")

    wf = get_json("{}/repos/{}/{}/contents/.github/workflows".format(API, owner, repo))
    if isinstance(wf, list) and wf:
        findings.append("CI workflows present ({})".format(len(wf)))
    else:
        findings.append("no CI workflows")

    return {"findings": findings, "flags": flags}
