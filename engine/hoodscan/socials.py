"""SOCIALS section: twitter via fxtwitter, telegram stubbed for v1."""
from datetime import datetime, timezone
from .http import get_json


def scan(twitter_handle=None, launch_ms=None):
    """Return {findings, flags} for the SOCIALS section."""
    findings, flags = [], []
    if not twitter_handle:
        findings.append("no twitter handle provided")
    else:
        handle = twitter_handle.lstrip("@")
        d = get_json("https://api.fxtwitter.com/{}".format(handle))
        user = (d or {}).get("user")
        if not user:
            findings.append("fxtwitter unavailable or account not found: @{}".format(handle))
        else:
            followers = user.get("followers")
            created_raw = user.get("joined") or user.get("created_at")
            findings.append("@{}: {} followers".format(handle, followers))
            created = None
            if created_raw:
                try:
                    created = datetime.strptime(created_raw, "%a %b %d %H:%M:%S %z %Y")
                except Exception:
                    try:
                        created = datetime.strptime(
                            created_raw, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                    except Exception:
                        pass
            if created:
                findings.append("account created {}".format(created.date()))
                if launch_ms:
                    launch = datetime.fromtimestamp(launch_ms / 1000, tz=timezone.utc)
                    delta = (launch - created).days
                    if 0 <= delta <= 14:
                        flags.append("twitter account created within 2 weeks of launch")
            if followers is not None and followers < 100:
                flags.append("tiny twitter following ({})".format(followers))
    findings.append("telegram checks: not implemented in v1")
    return {"findings": findings, "flags": flags}
