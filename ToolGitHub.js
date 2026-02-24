/**
 * GitHub read-only tools for Senior Engineer agent.
 * Uses GitHub REST API v3 with token auth. All operations are read-only.
 * Requires GITHUB_TOKEN (GitHub Personal Access Token, not Atlassian) and optionally GITHUB_ORG.
 */

var GITHUB_API_BASE = "https://api.github.com";
var GITHUB_FILE_TRUNCATE = 8000;
var GITHUB_SEARCH_LIMIT = 10;
var GITHUB_COMMITS_DEFAULT = 10;
var GITHUB_COMMITS_MAX = 30;
var GITHUB_PR_FILES_LIMIT = 20;

var GITHUB_LIST_REPOS_DEFAULT = 100;
var GITHUB_LIST_REPOS_MAX = 100;

/** Use GITHUB_ORG for repo: "backend-core" -> "org/backend-core"; "oviva/backend-core" -> "org/backend-core" when org is set. */
function normalizeRepo(repo) {
  if (!repo) return repo;
  var org = githubOrg();
  if (!org) return repo;
  var idx = repo.indexOf("/");
  if (idx < 0) return org + "/" + repo;
  var owner = repo.substring(0, idx);
  var name = repo.substring(idx + 1);
  return owner === org ? repo : org + "/" + name;
}

/**
 * List repositories for the configured GitHub org. Use as a discovery step when the model
 * does not know which repos exist before running code search, get file, or list directory.
 */
function toolListOrgRepositories(perPage) {
  if (!githubToken()) return "GitHub is not configured (missing GITHUB_TOKEN).";
  var org = githubOrg();
  if (!org) return "GitHub org is not configured (missing GITHUB_ORG). Use this tool only when GITHUB_ORG is set.";

  var limit = perPage != null ? Math.min(Math.max(1, parseInt(perPage, 10) || GITHUB_LIST_REPOS_DEFAULT), GITHUB_LIST_REPOS_MAX) : GITHUB_LIST_REPOS_DEFAULT;
  var url = GITHUB_API_BASE + "/orgs/" + encodeURIComponent(org) + "/repos?per_page=" + limit + "&sort=full_name";

  console.log("GitHub list org repos: " + org + " per_page=" + limit);

  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: {
      "Authorization": githubAuthHeader(),
      "Accept": "application/vnd.github.v3+json"
    },
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    var body = res.getContentText();
    console.error("GitHub list org repos failed: HTTP " + res.getResponseCode() + " " + body.substring(0, 300));
    return "Failed to list repositories (HTTP " + res.getResponseCode() + "): " + (body.substring(0, 500) || "check token has org read access");
  }

  var repos = JSON.parse(res.getContentText());
  if (!Array.isArray(repos) || repos.length === 0) return "No repositories found for org: " + org;

  var lines = repos.map(function (r) {
    var fullName = r.full_name || r.name || "?";
    var desc = (r.description || "").substring(0, 120);
    var branch = r.default_branch || "?";
    return "- *" + fullName + "* (default: " + branch + ")" + (desc ? " — " + desc : "");
  });

  return "Repositories in org **" + org + "** (" + repos.length + "):\n\n" + lines.join("\n");
}

function toolSearchGitHubCode(query) {
  if (!query) return "No query provided.";
  if (!githubToken()) return "GitHub is not configured (missing GITHUB_TOKEN).";
  var org = githubOrg();
  if (!org) return "GitHub org is not configured (missing GITHUB_ORG).";

  var q = encodeURIComponent(sanitizeQuery(query) + (org ? " org:" + org : ""));
  var url = GITHUB_API_BASE + "/search/code?q=" + q + "&per_page=" + GITHUB_SEARCH_LIMIT;

  console.log("GitHub code search: " + query);

  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: {
      "Authorization": githubAuthHeader(),
      "Accept": "application/vnd.github.v3+json"
    },
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    console.error("GitHub code search failed: HTTP " + res.getResponseCode());
    return "GitHub code search failed (HTTP " + res.getResponseCode() + "): " + (res.getContentText().substring(0, 200));
  }

  var data = JSON.parse(res.getContentText());
  var items = data.items || [];
  if (items.length === 0) return "No code found for: " + query;

  var results = items.map(function (item) {
    var repo = item.repository?.full_name || "?";
    var path = item.path || "?";
    var htmlUrl = item.html_url || "";
    var snippet = (item.text_matches && item.text_matches[0]) ? item.text_matches[0].fragment : "";
    snippet = snippet.replace(/\s+/g, " ").trim().substring(0, 300);
    return "- *" + repo + "* / " + path + "\n  " + htmlUrl + (snippet ? "\n  Snippet: " + snippet : "");
  });

  return "Found " + results.length + " code result(s):\n\n" + results.join("\n\n");
}

function toolGetGitHubFile(repo, path) {
  if (!repo) return "No repo provided (use owner/repo, e.g. myorg/backend-core).";
  if (!path) return "No path provided (e.g. src/main/java/App.java).";
  if (!githubToken()) return "GitHub is not configured (missing GITHUB_TOKEN).";
  repo = normalizeRepo(repo);

  var encodedPath = path.split("/").map(function (seg) { return encodeURIComponent(seg); }).join("/");
  var url = GITHUB_API_BASE + "/repos/" + repo + "/contents/" + encodedPath;

  console.log("GitHub get file: " + repo + " " + path);

  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: {
      "Authorization": githubAuthHeader(),
      "Accept": "application/vnd.github.v3+json"
    },
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    console.error("GitHub get file failed: HTTP " + res.getResponseCode());
    return "Failed to get file (HTTP " + res.getResponseCode() + "): " + (res.getContentText().substring(0, 200));
  }

  var file = JSON.parse(res.getContentText());
  if (file.type !== "file") return "Path is not a file (it may be a directory). Use github_list_directory instead.";

  var content = file.content ? Utilities.newBlob(Utilities.base64Decode(file.content)).getDataAsString() : "";
  if (content.length > GITHUB_FILE_TRUNCATE) {
    content = content.substring(0, GITHUB_FILE_TRUNCATE) + "\n\n[Content truncated — file is longer]";
  }

  var htmlUrl = file.html_url || "https://github.com/" + repo + "/blob/main/" + path;
  return "*" + repo + "* / " + path + "\n" + htmlUrl + "\n\n" + content;
}

function toolListGitHubDirectory(repo, path) {
  if (!repo) return "No repo provided (use owner/repo, e.g. myorg/backend-core).";
  if (!githubToken()) return "GitHub is not configured (missing GITHUB_TOKEN).";
  repo = normalizeRepo(repo);

  var url = GITHUB_API_BASE + "/repos/" + repo + "/contents";
  if (path) {
    var encodedPath = path.split("/").map(function (seg) { return encodeURIComponent(seg); }).join("/");
    url += "/" + encodedPath;
  }

  console.log("GitHub list directory: " + repo + " " + (path || "/"));

  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: {
      "Authorization": githubAuthHeader(),
      "Accept": "application/vnd.github.v3+json"
    },
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    console.error("GitHub list directory failed: HTTP " + res.getResponseCode());
    return "Failed to list directory (HTTP " + res.getResponseCode() + "): " + (res.getContentText().substring(0, 200));
  }

  var items = JSON.parse(res.getContentText());
  if (!Array.isArray(items)) items = [items];

  var lines = items.map(function (item) {
    var type = item.type === "dir" ? "dir " : "file";
    var size = item.size != null ? " " + item.size + " B" : "";
    return "- [" + item.name + "](" + (item.html_url || "") + ") (" + type + size + ")";
  });

  if (lines.length === 0) return "Directory is empty.";
  return "Contents of " + repo + (path ? "/" + path : "") + ":\n\n" + lines.join("\n");
}

function toolSearchGitHubIssues(query, repo) {
  if (!query) return "No query provided.";
  if (!githubToken()) return "GitHub is not configured (missing GITHUB_TOKEN).";

  var org = githubOrg();
  if (repo) repo = normalizeRepo(repo);
  var q = encodeURIComponent(sanitizeQuery(query) + (org ? " org:" + org : "") + (repo ? " repo:" + repo : ""));
  var url = GITHUB_API_BASE + "/search/issues?q=" + q + "&per_page=" + GITHUB_SEARCH_LIMIT;

  console.log("GitHub search issues: " + query + (repo ? " repo:" + repo : ""));

  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: {
      "Authorization": githubAuthHeader(),
      "Accept": "application/vnd.github.v3+json"
    },
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    var body = res.getContentText();
    console.error("GitHub search issues failed: HTTP " + res.getResponseCode() + " " + body.substring(0, 300));
    return "GitHub issue search failed (HTTP " + res.getResponseCode() + "): " + (body.substring(0, 500) || res.getResponseCode());
  }

  var data = JSON.parse(res.getContentText());
  var items = data.items || [];
  if (items.length === 0) return "No issues or pull requests found for: " + query;

  var results = items.map(function (item) {
    var kind = item.pull_request ? "PR" : "Issue";
    var title = item.title || "?";
    var state = item.state || "?";
    var author = item.user?.login || "?";
    var labels = (item.labels || []).map(function (l) { return l.name; }).join(", ");
    var htmlUrl = item.html_url || "";
    return "- *[" + kind + "] " + title + "* — " + state + " by " + author + (labels ? " [" + labels + "]" : "") + "\n  " + htmlUrl;
  });

  return "Found " + results.length + " issue(s)/PR(s):\n\n" + results.join("\n\n");
}

function toolGetGitHubPullRequest(repo, pullNumber) {
  if (!repo) return "No repo provided (use owner/repo).";
  if (!pullNumber) return "No pull request number provided.";
  if (!githubToken()) return "GitHub is not configured (missing GITHUB_TOKEN).";
  repo = normalizeRepo(repo);

  var pullUrl = GITHUB_API_BASE + "/repos/" + repo + "/pulls/" + encodeURIComponent(String(pullNumber));
  var filesUrl = pullUrl + "/files?per_page=" + GITHUB_PR_FILES_LIMIT;

  console.log("GitHub get PR: " + repo + " #" + pullNumber);

  var res = UrlFetchApp.fetch(pullUrl, {
    method: "get",
    headers: {
      "Authorization": githubAuthHeader(),
      "Accept": "application/vnd.github.v3+json"
    },
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    console.error("GitHub get PR failed: HTTP " + res.getResponseCode());
    return "Failed to get pull request (HTTP " + res.getResponseCode() + "): " + (res.getContentText().substring(0, 200));
  }

  var pr = JSON.parse(res.getContentText());
  var body = (pr.body || "").substring(0, 2000);
  var lines = [
    "*" + pr.title + "*",
    "URL: " + (pr.html_url || ""),
    "State: " + (pr.state || "?") + " | Author: " + (pr.user?.login || "?") + " | Base: " + (pr.base?.ref || "?") + " → " + (pr.head?.ref || "?"),
    "Created: " + (pr.created_at || "?") + " | Updated: " + (pr.updated_at || "?"),
    "",
    "Description:",
    body || "(no description)"
  ];

  var filesRes = UrlFetchApp.fetch(filesUrl, {
    method: "get",
    headers: {
      "Authorization": githubAuthHeader(),
      "Accept": "application/vnd.github.v3+json"
    },
    muteHttpExceptions: true
  });

  if (filesRes.getResponseCode() === 200) {
    var files = JSON.parse(filesRes.getContentText());
    if (files.length > 0) {
      lines.push("");
      lines.push("Changed files (" + files.length + "):");
      files.slice(0, GITHUB_PR_FILES_LIMIT).forEach(function (f) {
        lines.push("- " + (f.status || "?") + " " + (f.filename || "?"));
      });
      if (files.length > GITHUB_PR_FILES_LIMIT) lines.push("... and " + (files.length - GITHUB_PR_FILES_LIMIT) + " more");
    }
  }

  return lines.join("\n");
}

function toolListGitHubCommits(repo, path, since) {
  if (!repo) return "No repo provided (use owner/repo).";
  if (!githubToken()) return "GitHub is not configured (missing GITHUB_TOKEN).";
  repo = normalizeRepo(repo);

  var limit = Math.min(GITHUB_COMMITS_DEFAULT, GITHUB_COMMITS_MAX);
  var url = GITHUB_API_BASE + "/repos/" + repo + "/commits?per_page=" + limit;
  if (path) url += "&path=" + encodeURIComponent(path);
  if (since) url += "&since=" + encodeURIComponent(since);

  console.log("GitHub list commits: " + repo + (path ? " path=" + path : "") + (since ? " since=" + since : ""));

  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: {
      "Authorization": githubAuthHeader(),
      "Accept": "application/vnd.github.v3+json"
    },
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    var body = res.getContentText();
    console.error("GitHub list commits failed: HTTP " + res.getResponseCode() + " " + body.substring(0, 300));
    return "Failed to list commits (HTTP " + res.getResponseCode() + "): " + (body.substring(0, 500) || "check repo exists and token has access");
  }

  var commits = JSON.parse(res.getContentText());
  if (commits.length === 0) return "No commits found for " + repo + (path ? " in " + path : ".");

  var results = commits.map(function (c) {
    var sha = (c.sha || "").substring(0, 7);
    var msg = (c.commit?.message || "?").split("\n")[0].substring(0, 80);
    var author = c.commit?.author?.name || c.author?.login || "?";
    var date = c.commit?.author?.date || "?";
    return "- " + sha + " " + msg + " — " + author + " " + date;
  });

  return "Recent commits for " + repo + (path ? " (" + path + ")" : "") + ":\n\n" + results.join("\n");
}
