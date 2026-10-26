#!/usr/bin/env python3
"""Run this on a computer INSIDE Iran (Aparat only answers from Iran). It reads Aparat's live status and
publishes live-status.json to your GitHub repo through the GitHub API, so the site can show it.

Required environment variables:
  GITHUB_TOKEN  fine-grained token for ONLY this repository, permission "Contents: Read and write"
  GITHUB_REPO   owner/name, e.g. tahakazrwny/uniquetaha
Optional: GITHUB_BRANCH (default main), STATUS_PATH (default live-status.json), HEARTBEAT_MIN (default 20)

Safety: if Aparat or GitHub fails, nothing is written (the file goes stale and the site shows "unknown").
It never writes "offline" because of an error. A write happens only when the status changed or the last
write is older than HEARTBEAT_MIN, so the repository does not get a commit every minute.
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

APARAT_URL = os.environ.get("APARAT_STATUS_URL", "https://www.aparat.com/api/fa/v2/Live/LiveStream/show/username/uniquetaha")
API = os.environ.get("GITHUB_API_URL", "https://api.github.com")
TOKEN = os.environ.get("GITHUB_TOKEN", "")
REPO = os.environ.get("GITHUB_REPO", "")
BRANCH = os.environ.get("GITHUB_BRANCH", "main")
PATH = os.environ.get("STATUS_PATH", "live-status.json")
HEARTBEAT_MIN = int(os.environ.get("HEARTBEAT_MIN", "20"))


def aparat_status():
    req = urllib.request.Request(APARAT_URL, headers={
        "Accept": "application/json",
        "User-Agent": "UniqueTahaLiveStatus/1.0 (+https://uniquetaha.ir)",
        "Referer": "https://www.aparat.com/uniquetaha/live",
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
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


def github(method, body=None):
    url = f"{API}/repos/{REPO}/contents/{PATH}" + (f"?ref={BRANCH}" if method == "GET" else "")
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body else None, headers={
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "uniquetaha-live-status",
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    if not TOKEN or not REPO:
        print("ERROR: set GITHUB_TOKEN and GITHUB_REPO first.")
        return 2
    try:
        status = aparat_status()
    except Exception as exc:
        print(f"WARNING: could not read Aparat, nothing written: {exc}")
        return 0

    now = datetime.now(timezone.utc)
    sha = None
    try:
        current = github("GET")
        sha = current["sha"]
        old = json.loads(base64.b64decode(current["content"]).decode("utf-8"))
        old_time = datetime.fromisoformat(old["checkedAt"].replace("Z", "+00:00"))
        if old.get("status") == status and now - old_time < timedelta(minutes=HEARTBEAT_MIN):
            print(f"Status unchanged ({status}) and fresh; nothing to write.")
            return 0
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            print(f"ERROR: GitHub returned HTTP {exc.code} while reading {PATH}")
            return 1
    except (KeyError, ValueError):
        pass  # unreadable/old format: overwrite it
    except Exception as exc:
        print(f"ERROR: cannot reach GitHub: {exc}")
        return 1

    content = json.dumps({"status": status, "checkedAt": now.strftime("%Y-%m-%dT%H:%M:%SZ")}) + "\n"
    body = {"message": f"live status: {status}", "content": base64.b64encode(content.encode()).decode(), "branch": BRANCH}
    if sha:
        body["sha"] = sha
    try:
        github("PUT", body)
    except urllib.error.HTTPError as exc:
        print(f"ERROR: GitHub refused the update (HTTP {exc.code}). Check the token's repository and permission.")
        return 1
    except Exception as exc:
        print(f"ERROR: cannot reach GitHub: {exc}")
        return 1
    print(f"Published {PATH}: {status}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
