@echo off
rem Fill in the two values, keep this file private (it contains your token).
set GITHUB_TOKEN=PUT_YOUR_FINE_GRAINED_TOKEN_HERE
set GITHUB_REPO=OWNER/REPO_NAME
set GITHUB_BRANCH=main
python "%~dp0push_live_status.py" >> "%~dp0push.log" 2>&1
