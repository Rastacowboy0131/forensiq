"""SOCIALS section: twitter via fxtwitter, telegram stubbed for v1.

Returns findings (neutral facts), good (positive signals), flags (negative signals).
"""
from datetime import datetime, timezone
from .http import get_json


def _parse_created(raw):
    if not raw:
        return None
    for fmt in ("%a %b %d %H:%M:%S %z %Y", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            dt = datetime.strptime(raw, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except Exception:
            continue
    return None


def scan(twitter_handle=None, launch_ms=None, site_url=None):
    """Return {findings, good, flags} for the SOCIALS section."""
    findings, good, flags = [], [], []
    if not twitter_handle:
        findings.append("no twitter listed on dex profile or provided")
        flags.append("no twitter/X presence found")
        return {"findings": findings, "good": good, "flags": flags}

    handle = twitter_handle.lstrip("@")
    d = get_json("https://api.fxtwitter.com/{}".format(handle))
    user = (d or {}).get("user")
    if not user:
        findings.append("fxtwitter unavailable or account not found: @{}".format(handle))
        flags.append("twitter account @{} could not be verified".format(handle))
        return {"findings": findings, "good": good, "flags": flags}

    followers = user.get("followers")
    following = user.get("following")
    tweets = user.get("tweets") or user.get("statuses_count")
    verified = user.get("verified") or (user.get("verification") or {}).get("verified")
    desc = user.get("description") or ""
    website = ((user.get("website") or {}).get("url")
               if isinstance(user.get("website"), dict) else user.get("website")) or ""
    created = _parse_created(user.get("joined") or user.get("created_at"))

    findings.append("@{}: {} followers, {} following, {} tweets".format(
        handle, followers, following, tweets))

    # Account age vs token launch.
    if created:
        findings.append("account created {}".format(created.date()))
        age_days = (datetime.now(timezone.utc) - created).days
        if launch_ms:
            launch = datetime.fromtimestamp(launch_ms / 1000, tz=timezone.utc)
            delta = (launch - created).days
            if 0 <= delta <= 14:
                flags.append("twitter account created within 2 weeks of launch (burner pattern)")
            elif delta > 180:
                good.append("twitter account predates launch by {} months (not a burner)".format(delta // 30))
        if age_days >= 365 and not launch_ms:
            good.append("account over a year old")

    # Follower quality.
    if followers is not None:
        if followers < 100:
            flags.append("tiny twitter following ({})".format(followers))
        elif followers >= 1000:
            good.append("established following ({} followers)".format(followers))
        # Follower/age ratio: >5k followers on an account under 30 days old smells bought.
        if created:
            age_days = max((datetime.now(timezone.utc) - created).days, 1)
            if followers > 5000 and age_days < 30:
                flags.append("{} followers on a {}-day-old account (likely bought)".format(followers, age_days))

    # Activity level.
    if tweets is not None:
        if tweets < 5:
            flags.append("almost no tweet history ({} tweets)".format(tweets))
        elif tweets >= 100:
            good.append("active account ({} tweets)".format(tweets))

    if verified:
        good.append("verified account")

    # Does the account link back to the project site?
    if site_url and website:
        try:
            from urllib.parse import urlparse
            site_host = urlparse(site_url if site_url.startswith("http") else "https://" + site_url).netloc.replace("www.", "")
            bio_host = urlparse(website if website.startswith("http") else "https://" + website).netloc.replace("www.", "")
            if site_host and site_host == bio_host:
                good.append("bio links back to project site ({})".format(site_host))
        except Exception:
            pass
    elif desc and site_url and site_url.replace("https://", "").replace("http://", "").rstrip("/") in desc:
        good.append("project site mentioned in bio")

    findings.append("telegram checks: not implemented in v1")
    return {"findings": findings, "good": good, "flags": flags}
