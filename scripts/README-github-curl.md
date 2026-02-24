# Reproduce GitHub API errors with curl

These curl commands match **ToolGitHub.js** (same URLs, headers, query building). Use them to reproduce **HTTP 422** (search issues) and **HTTP 404** (list directory) locally.

**Security:** Do not commit your real token. Use `export GITHUB_TOKEN=ghp_...` and run the script, or substitute in the one-liners below and run from your machine only.

---

## 1) Search issues → HTTP 422

**What the app does:** `GET /search/issues?q=<sanitized_query>+org:<GITHUB_ORG>+repo:<repo>&per_page=10`  
**422** means: the `org` or `repo` in `q` either don’t exist or the token has no access.

Replace `YOUR_TOKEN` and `YOUR_ORG` (e.g. `oviva-ag`). If the org is wrong or the token can’t see it, you get 422.

```bash
# Minimal (often 422 if org/repo not visible to token)
curl -s -w "\nHTTP %{http_code}\n" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/search/issues?q=bug+org%3AYOUR_ORG&per_page=10"

# With repo filter (same as app when repo is passed)
curl -s -w "\nHTTP %{http_code}\n" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/search/issues?q=bug+org%3AYOUR_ORG+repo%3AYOUR_ORG%2Fbackend-core&per_page=10"
```

---

## 2) List directory → HTTP 404

**What the app does:** `GET /repos/:owner/:repo/contents` or `.../contents/:path`  
**404** means: repo or path doesn’t exist, or the token has no access.

Replace `YOUR_TOKEN` and `YOUR_ORG/YOUR_REPO` (e.g. `oviva-ag/backend-core`).

```bash
# Root of repo
curl -s -w "\nHTTP %{http_code}\n" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/YOUR_ORG/YOUR_REPO/contents"

# With path (e.g. src/main)
curl -s -w "\nHTTP %{http_code}\n" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/YOUR_ORG/YOUR_REPO/contents/src%2Fmain"
```

---

## Run the script (recommended)

Uses env vars so the token never touches the repo:

```bash
export GITHUB_TOKEN="ghp_..."      # required
export GITHUB_ORG="oviva-ag"       # optional; omit to test without org scope
export GITHUB_REPO="oviva-ag/backend-core"   # for list-directory test

./scripts/github-api-reproduce.sh
```

You should see the same 422/404 and response bodies as in the app logs.
