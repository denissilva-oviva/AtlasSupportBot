#!/usr/bin/env bash
# Reproduce GitHub API errors (422 search issues, 404 list directory) locally with curl.
# Matches ToolGitHub.js: same URLs, headers, and query building.
#
# Usage:
#   export GITHUB_TOKEN="ghp_..."
#   export GITHUB_ORG="your-org"   # optional; used for search scoping like in the app
#   ./scripts/github-api-reproduce.sh
#
# Or run the curl commands below manually, replacing TOKEN and ORG.

set -e
BASE="https://api.github.com"
TOKEN="${GITHUB_TOKEN:?Set GITHUB_TOKEN}"
ORG="${GITHUB_ORG:-}"

# --- 1) Search issues (can yield HTTP 422) ---
# ToolGitHub: q = sanitizeQuery(query) + " org:" + org + " repo:" + repo
# 422 = "The listed users and repositories cannot be searched either because the resources do not exist or you do not have permission to view them."
# So: wrong/missing org, wrong repo name, or token without access to that org/repo.
QUERY="bug"
SCOPE=""
[ -n "$ORG" ] && SCOPE=" org:${ORG}"
# With a repo filter (e.g. repo:oviva-ag/backend-core):
REPO_FILTER=""
# REPO_FILTER=" repo:oviva-ag/some-repo"
Q_RAW="${QUERY}${SCOPE}${REPO_FILTER}"
# Sanitize like ToolGitHub (replace " and \ with space, collapse spaces)
Q_SANITIZED=$(printf %s "$Q_RAW" | sed 's/["\\]/ /g' | sed 's/  */ /g' | sed 's/^ *//;s/ *$//')
Q_ENC=$(python3 -c "import urllib.parse, sys; print(urllib.parse.quote(sys.argv[1]))" "$Q_SANITIZED" 2>/dev/null || echo "$Q_SANITIZED")

echo "=== 1) Search issues (expect 422 if org/repo invalid or no permission) ==="
echo "  q (raw): $Q_RAW"
curl -s -w "\nHTTP %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "$BASE/search/issues?q=${Q_ENC}&per_page=10"
echo ""

# --- 2) List directory (can yield HTTP 404) ---
# ToolGitHub: GET /repos/:owner/:repo/contents[/:path]
# 404 = repo or path does not exist, or no access.
REPO="${GITHUB_REPO:-oviva-ag/backend-core}"
PATH_SUFFIX=""  # or e.g. "src/main"
echo "=== 2) List directory (expect 404 if repo/path missing or no access) ==="
echo "  repo: $REPO path: $PATH_SUFFIX"
if [ -n "$PATH_SUFFIX" ]; then
  ENCODED_PATH=$(echo "$PATH_SUFFIX" | sed 's|/|%2F|g')
  URL="$BASE/repos/$REPO/contents/$ENCODED_PATH"
else
  URL="$BASE/repos/$REPO/contents"
fi
curl -s -w "\nHTTP %{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "$URL"
echo ""

# --- One-liner curls for quick copy-paste (replace TOKEN and ORG/REPO) ---
# Search issues (422 repro):
#   curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer TOKEN" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/search/issues?q=bug+org:YOUR_ORG&per_page=10"
# List directory (404 repro):
#   curl -s -w "\nHTTP %{http_code}\n" -H "Authorization: Bearer TOKEN" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/repos/YOUR_ORG/YOUR_REPO/contents"
