@echo off
rem 1) Copy this file to run.bat  2) fill in the values below  3) NEVER upload run.bat to GitHub (it holds your token).
set GITHUB_TOKEN=PUT_YOUR_FINE_GRAINED_TOKEN_HERE
set GITHUB_REPO=OWNER/REPO_NAME
set GITHUB_BRANCH=main
python "%~dp0push_live_status.py" >> "%~dp0push.log" 2>&1
