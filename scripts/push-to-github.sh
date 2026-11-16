#!/usr/bin/env bash
# One-command push to GitHub to trigger the TrollStore IPA cloud build.
#
# Usage (from Git Bash in the project directory):
#   bash scripts/push-to-github.sh https://github.com/<user>/<repo>.git
#   bash scripts/push-to-github.sh <user>/<repo>          # shorthand
#
# When git asks for a password, paste a GitHub Personal Access Token
# (classic token with the "repo" scope), NOT your account password.
set -euo pipefail
cd "$(dirname "$0")/.."

REPO_URL="${1:-}"
if [ -z "$REPO_URL" ]; then
  echo "Usage: bash scripts/push-to-github.sh <github-repo-url>"
  echo "Example: bash scripts/push-to-github.sh https://github.com/myuser/aistream-ipa.git"
  exit 1
fi

case "$REPO_URL" in
  http*|git@*) ;;
  */*) REPO_URL="https://github.com/${REPO_URL}.git" ;;
  *) echo "Invalid repository URL: $REPO_URL" >&2; exit 1 ;;
esac

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REPO_URL"
else
  git remote add origin "$REPO_URL"
fi

echo "==> Pushing source to $REPO_URL"
echo "    (If prompted for a password, paste a GitHub Personal Access Token with 'repo' scope.)"
git push -u origin main

echo ""
echo "==> Push complete. Next steps:"
echo "    1. Open ${REPO_URL%.git}/actions"
echo "    2. Run workflow: 'Build TrollStore IPA'"
echo "    3. Download artifact 'AIStream-TrollStore-IPA', unzip it"
echo "    4. Install the .ipa with TrollStore"
