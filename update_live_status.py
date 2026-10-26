#!/usr/bin/env python3
"""Fetch Aparat's public live status and write live-status.json (same-origin fallback for the site).

Safety rules:
- If Aparat cannot be reached or returns something unexpected, the existing file is left untouched
  (it goes stale and the page shows "unknown"). We never write "offline" because of an error.
- The file is only rewritten when the status changed or the last check is older than HEARTBEAT_MIN,
  so the repository does not get a commit every 5 minutes.
"""
import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

URL = os.environ.get("APARAT_STATUS_URL", "https://www.aparat.com/api/fa/v2/Live/LiveStream/show/username/uniquetaha")
OUT = os.environ.get("LIVE_STATUS_FILE", "live-status.json")
HEARTBEAT_MIN = int(os.environ.get("HEARTBEAT_MIN", "20"))


def fetch_status():
    req = urllib.request.Request(URL, headers={
        "Accept": "application/json",
        "User-Agent": "UniqueTahaLiveStatus/1.0 (+https://uniquetaha.ir)",
        "Referer": "https://www.aparat.com/uniquetaha/live",
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        if resp.status != 200:
            raise RuntimeError(f"Aparat returned HTTP {resp.status}")
        data = json.loads(resp.read().decode("utf-8"))

    candidates = [
        (data.get("live_status") or {}).get("type"),
        (data.get("live_status") or {}).get("status"),
        data.get("live_type"),
        (data.get("liveStatus") or {}).get("type"),
        data.get("status"),
        ((data.get("result") or {}).get("live_status") or {}).get("type"),
        (data.get("result") or {}).get("live_type"),
    ]
    kind = next((value for value in candidates if isinstance(value, str)), None)
    if kind is None:
        raise RuntimeError(f"unrecognized live status: {kind!r}")
    kind = kind.lower()
    if kind == "live":
        return "live"
    if kind in {"nolive", "end", "offline", "notlive", "not_live"}:
        return "offline"
    raise RuntimeError(f"unrecognized live status: {kind!r}")


def main():
    try:
        status = fetch_status()
    except Exception as exc:  # network error, blocked IP, API change...
        print(f"WARNING: could not read Aparat status, leaving {OUT} unchanged: {exc}")
        return 0

    now = datetime.now(timezone.utc)
    try:
        with open(OUT, encoding="utf-8") as f:
            old = json.load(f)
        old_time = datetime.fromisoformat(old["checkedAt"].replace("Z", "+00:00"))
        if old.get("status") == status and now - old_time < timedelta(minutes=HEARTBEAT_MIN):
            print(f"Status unchanged ({status}) and fresh; nothing to write.")
            return 0
    except (OSError, ValueError, KeyError):
        pass

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"status": status, "checkedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ")}, f)
        f.write("\n")
    print(f"Wrote {OUT}: {status}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
