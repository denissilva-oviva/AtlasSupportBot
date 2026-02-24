function looksLikeJql(s) {
  if (!s || s.length < 3) return false;
  var t = s.toUpperCase();
  return (t.indexOf("=") !== -1 || t.indexOf(" IN (") !== -1) &&
    (t.indexOf(" AND ") !== -1 || t.indexOf(" OR ") !== -1 || t.indexOf(" PROJECT ") !== -1 ||
     t.indexOf("PROJECT =") !== -1 || t.indexOf("PRIORITY") !== -1 || t.indexOf("CREATED") !== -1 ||
     t.indexOf("STATUS") !== -1 || t.indexOf("ORDER BY") !== -1);
}

function toolListJiraProjects() {
  var url = jiraUrl() + "/rest/api/3/project?maxResults=100";
  console.log("Jira list projects");
  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { "Authorization": atlassianAuthHeader(), "Accept": "application/json" },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    var body = res.getContentText();
    console.error("Jira list projects failed: HTTP " + res.getResponseCode() + (body ? " " + body.substring(0, 200) : ""));
    return "Failed to list Jira projects (HTTP " + res.getResponseCode() + ")" + (body ? ": " + body.substring(0, 150) : "");
  }
  var data = JSON.parse(res.getContentText());
  var list = Array.isArray(data) ? data : (data.values || data.results || []);
  if (list.length === 0) return "No Jira projects found (or no permission).";
  var lines = list.map(function (p) {
    var key = p.key || p.projectKey || p.id;
    var name = p.name || "";
    return "- " + key + ": " + name;
  });
  return "Jira projects (" + list.length + "):\n\n" + lines.join("\n");
}

function toolListJiraBoards(projectKeyOrId) {
  var url = jiraUrl() + "/rest/agile/1.0/board?maxResults=50";
  if (projectKeyOrId) url += "&projectKeyOrId=" + encodeURIComponent(projectKeyOrId);
  console.log("Jira list boards" + (projectKeyOrId ? " project=" + projectKeyOrId : ""));
  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { "Authorization": atlassianAuthHeader(), "Accept": "application/json" },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    var body = res.getContentText();
    console.error("Jira list boards failed: HTTP " + res.getResponseCode() + (body ? " " + body.substring(0, 200) : ""));
    return "Failed to list Jira boards (HTTP " + res.getResponseCode() + ")" + (body ? ": " + body.substring(0, 150) : "");
  }
  var data = JSON.parse(res.getContentText());
  var list = data.values || [];
  if (list.length === 0) return "No Jira boards found for this project (or no permission).";
  var lines = list.map(function (b) {
    var loc = b.location;
    var proj = (loc && loc.projectKey) ? loc.projectKey : ((loc && loc.projectName) ? loc.projectName : "");
    return "- Board ID " + b.id + ": \"" + (b.name || "") + "\" (" + (b.type || "board") + ")" + (proj ? " — project: " + proj : "");
  });
  return "Jira boards (" + list.length + "):\n\n" + lines.join("\n");
}

function toolListJiraSprints(boardId, state) {
  if (!boardId) return "No board ID provided. Use jira_list_boards first to get board IDs.";
  var url = jiraUrl() + "/rest/agile/1.0/board/" + encodeURIComponent(String(boardId)) + "/sprint?maxResults=50";
  if (state) url += "&state=" + encodeURIComponent(state);
  console.log("Jira list sprints boardId=" + boardId + (state ? " state=" + state : ""));
  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { "Authorization": atlassianAuthHeader(), "Accept": "application/json" },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    var body = res.getContentText();
    console.error("Jira list sprints failed: HTTP " + res.getResponseCode() + (body ? " " + body.substring(0, 200) : ""));
    return "Failed to list Jira sprints (HTTP " + res.getResponseCode() + ")" + (body ? ": " + body.substring(0, 150) : "");
  }
  var data = JSON.parse(res.getContentText());
  var list = data.values || [];
  if (list.length === 0) return "No sprints found for this board.";
  var lines = list.map(function (s) {
    return "- Sprint ID " + s.id + ": \"" + (s.name || "") + "\" (state: " + (s.state || "?") + ")" + (s.startDate ? " " + s.startDate : "") + (s.endDate ? " – " + s.endDate : "");
  });
  return "Sprints for board " + boardId + " (" + list.length + "):\n\n" + lines.join("\n");
}

function toolSearchJira(query) {
  if (!query) return "No query provided.";

  var q = (query || "").trim();
  var jql;
  if (looksLikeJql(q)) {
    jql = q.indexOf("ORDER BY") === -1 ? q + " ORDER BY updated DESC" : q;
  } else {
    jql = 'text ~ "' + sanitizeQuery(q) + '" ORDER BY updated DESC';
  }

  // Use new JQL search endpoint; /rest/api/3/search returns 410 Gone (deprecated)
  var url = jiraUrl() + "/rest/api/3/search/jql";

  console.log("Jira search: " + query);

  var res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { "Authorization": atlassianAuthHeader(), "Accept": "application/json" },
    payload: JSON.stringify({
      jql: jql,
      maxResults: 5,
      fields: ["summary", "status", "assignee", "updated", "issuetype", "project"]
    }),
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    var body = res.getContentText();
    console.error("Jira search failed: HTTP " + res.getResponseCode() + (body ? " " + body.substring(0, 300) : ""));
    return "Jira search failed (HTTP " + res.getResponseCode() + ")" + (body ? ": " + body.substring(0, 200) : "");
  }

  var data = JSON.parse(res.getContentText());
  console.log("Jira results: " + (data.issues || []).length);

  var issues = (data.issues || []).map(function (issue) {
    var issueUrl = jiraUrl() + "/browse/" + issue.key;
    return "- *" + issue.key + "*: " + issue.fields?.summary
      + " [" + (issue.fields?.issuetype?.name || "?") + " | " + (issue.fields?.status?.name || "?") + "]"
      + " (Project: " + (issue.fields?.project?.key || "?") + ")"
      + "\n  " + issueUrl;
  });

  if (issues.length === 0) return "No Jira tickets found for: " + query;
  return "Found " + issues.length + " Jira ticket(s):\n\n" + issues.join("\n\n");
}

function toolGetJiraIssue(issueKey) {
  if (!issueKey) return "No issue key provided.";

  var url = jiraUrl() + "/rest/api/3/issue/" + encodeURIComponent(issueKey)
    + "?fields=summary,status,assignee,reporter,description,comment,priority,issuetype,project,updated,created";

  console.log("Jira get issue: " + issueKey);

  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { "Authorization": atlassianAuthHeader(), "Accept": "application/json" },
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    console.error("Jira get issue failed: HTTP " + res.getResponseCode());
    return "Failed to retrieve issue (HTTP " + res.getResponseCode() + ")";
  }

  var issue = JSON.parse(res.getContentText());
  var f = issue.fields || {};
  var issueUrl = jiraUrl() + "/browse/" + issue.key;

  var desc = extractAdfText(f.description).substring(0, 2000);
  if (!desc) desc = "(no description)";

  var lines = [
    "*" + issue.key + "*: " + (f.summary || ""),
    "URL: " + issueUrl,
    "Type: " + (f.issuetype?.name || "?") + " | Status: " + (f.status?.name || "?") + " | Priority: " + (f.priority?.name || "?"),
    "Project: " + (f.project?.key || "?"),
    "Assignee: " + (f.assignee?.displayName || "Unassigned"),
    "Reporter: " + (f.reporter?.displayName || "?"),
    "Created: " + (f.created || "?") + " | Updated: " + (f.updated || "?"),
    "",
    "Description:",
    desc
  ];

  var comments = f.comment?.comments || [];
  if (comments.length > 0) {
    lines.push("");
    lines.push("Comments (" + comments.length + "):");
    var shown = comments.slice(-3);
    for (var i = 0; i < shown.length; i++) {
      var c = shown[i];
      var commentText = extractAdfText(c.body).substring(0, 300);
      lines.push("- " + (c.author?.displayName || "?") + " (" + (c.created || "") + "): " + commentText);
    }
  }

  return lines.join("\n");
}

function toolCreateTicket(args, senderEmail) {
  if (senderEmail !== AUTHORIZED_EMAIL) {
    return "UNAUTHORIZED: Only Denis Dos Santos Silva can create tickets.";
  }

  var projectKey  = args.project_key;
  var summary     = args.summary;
  var description = args.description || "";

  if (!projectKey || !summary) {
    return "Missing required fields: project_key and summary are required.";
  }

  var url = jiraUrl() + "/rest/api/3/issue";

  var payload = {
    fields: {
      project: { key: projectKey },
      summary: summary,
      description: {
        version: 1,
        type: "doc",
        content: [{
          type: "paragraph",
          content: [{ type: "text", text: description || "Created by Support Assistant" }]
        }]
      },
      issuetype: { name: "Task" }
    }
  };

  console.log("Jira create issue: " + projectKey + " / " + summary);

  var res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    headers: { "Authorization": atlassianAuthHeader(), "Accept": "application/json" },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    console.error("Jira create failed: HTTP " + res.getResponseCode());
    return "Failed to create ticket (HTTP " + res.getResponseCode() + "): " + res.getContentText();
  }

  var data = JSON.parse(res.getContentText());
  var issueUrl = jiraUrl() + "/browse/" + data.key;
  return "Ticket created: " + data.key + " - " + issueUrl;
}

function toolListJiraFieldsByKeyword(keyword) {
  var url = jiraUrl() + "/rest/api/3/field";
  console.log("Jira list fields");
  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { "Authorization": atlassianAuthHeader(), "Accept": "application/json" },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    return "Failed to list Jira fields (HTTP " + res.getResponseCode() + ")";
  }
  var fields = JSON.parse(res.getContentText());
  if (keyword) {
    var kw = keyword.toLowerCase();
    fields = fields.filter(function (f) {
      return (f.name || "").toLowerCase().indexOf(kw) !== -1;
    });
  }
  if (fields.length === 0) return "No Jira fields found" + (keyword ? " matching '" + keyword + "'" : "") + ".";
  var lines = fields.slice(0, 30).map(function (f) {
    var clauses = (f.clauseNames || []).join(", ");
    var scope = f.scope ? " (project-scoped)" : "";
    return "- " + f.name + " | JQL clause: " + clauses + " | id: " + f.id + (f.custom ? " [custom]" : " [system]") + scope;
  });
  return "Jira fields (" + Math.min(fields.length, 30) + (fields.length > 30 ? " of " + fields.length : "") + "):\n\n" + lines.join("\n");
}

function toolListJiraPriorities() {
  var url = jiraUrl() + "/rest/api/3/priority";
  console.log("Jira list priorities");
  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { "Authorization": atlassianAuthHeader(), "Accept": "application/json" },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    return "Failed to list Jira priorities (HTTP " + res.getResponseCode() + ")";
  }
  var data = JSON.parse(res.getContentText());
  var list = Array.isArray(data) ? data : (data.values || []);
  if (list.length === 0) return "No priorities found.";
  var lines = list.map(function (p) {
    return "- " + (p.name || "?") + " (id: " + p.id + ")";
  });
  return "Jira priorities (use 'priority' field in JQL):\n\n" + lines.join("\n");
}

function toolListJiraStatuses() {
  var url = jiraUrl() + "/rest/api/3/status";
  console.log("Jira list statuses");
  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { "Authorization": atlassianAuthHeader(), "Accept": "application/json" },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    return "Failed to list Jira statuses (HTTP " + res.getResponseCode() + ")";
  }
  var data = JSON.parse(res.getContentText());
  var list = Array.isArray(data) ? data : (data.values || []);
  if (list.length === 0) return "No statuses found.";
  var seen = {};
  var unique = list.filter(function (s) {
    var key = (s.name || "").toLowerCase();
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
  var lines = unique.slice(0, 40).map(function (s) {
    var cat = s.statusCategory ? s.statusCategory.name : "";
    return "- " + (s.name || "?") + (cat ? " [" + cat + "]" : "");
  });
  return "Jira statuses (use 'status' field in JQL, " + unique.length + " unique):\n\n" + lines.join("\n");
}

function toolListJiraIssueTypes() {
  var url = jiraUrl() + "/rest/api/3/issuetype";
  console.log("Jira list issue types");
  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { "Authorization": atlassianAuthHeader(), "Accept": "application/json" },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    return "Failed to list Jira issue types (HTTP " + res.getResponseCode() + ")";
  }
  var data = JSON.parse(res.getContentText());
  var list = Array.isArray(data) ? data : (data.values || []);
  if (list.length === 0) return "No issue types found.";
  var seen = {};
  var unique = list.filter(function (t) {
    var key = (t.name || "").toLowerCase();
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
  var lines = unique.map(function (t) {
    return "- " + (t.name || "?") + (t.subtask ? " [subtask]" : "") + (t.scope ? " (project-scoped)" : "");
  });
  return "Jira issue types (use 'issuetype' field in JQL):\n\n" + lines.join("\n");
}

function extractAdfText(adfNode) {
  if (!adfNode) return "";
  if (typeof adfNode === "string") return adfNode;
  if (adfNode.text) return adfNode.text;
  if (Array.isArray(adfNode.content)) {
    return adfNode.content.map(extractAdfText).join(" ");
  }
  return "";
}
