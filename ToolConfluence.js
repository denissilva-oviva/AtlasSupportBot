function toolSearchConfluence(query) {
  if (!query) return "No query provided.";

  var cql = 'type=page AND text ~ "' + sanitizeQuery(query) + '"';
  var url = confluenceUrl() + "/rest/api/content/search"
    + "?cql=" + encodeURIComponent(cql)
    + "&limit=10"
    + "&expand=metadata.labels";

  console.log("Confluence search: " + query);

  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { "Authorization": atlassianAuthHeader(), "Accept": "application/json" },
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    console.error("Confluence search failed: HTTP " + res.getResponseCode());
    return "Confluence search failed (HTTP " + res.getResponseCode() + ")";
  }

  var data = JSON.parse(res.getContentText());
  console.log("Confluence results: " + (data.results || []).length);

  var results = (data.results || []).map(function (page) {
    var pageUrl = confluenceUrl().replace("/wiki", "") + page._links?.webui;
    return "- *" + page.title + "* (ID: " + page.id + ")\n  " + pageUrl;
  });

  if (results.length === 0) return "No Confluence pages found for: " + query;
  return "Found " + results.length + " Confluence page(s):\n\n" + results.join("\n\n");
}

function toolGetConfluencePage(pageId) {
  if (!pageId) return "No page ID provided.";

  var url = confluenceUrl() + "/rest/api/content/" + pageId
    + "?expand=body.view";

  console.log("Confluence get page: " + pageId);

  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { "Authorization": atlassianAuthHeader(), "Accept": "application/json" },
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    console.error("Confluence get page failed: HTTP " + res.getResponseCode());
    return "Failed to retrieve page (HTTP " + res.getResponseCode() + ")";
  }

  var page = JSON.parse(res.getContentText());
  var pageUrl = confluenceUrl().replace("/wiki", "") + page._links?.webui;
  var content = extractTextFromHtml(page.body?.view?.value || "");

  if (content.length > 8000) {
    content = content.substring(0, 8000) + "\n\n[Content truncated — page is longer]";
  }

  return "*" + page.title + "*\n" + pageUrl + "\n\n" + content;
}

function toolGetConfluencePageChildren(pageId) {
  if (!pageId) return "No page ID provided.";

  var url = confluenceUrl() + "/rest/api/content/" + pageId + "/child/page"
    + "?limit=20&expand=metadata.labels";

  console.log("Confluence get children: " + pageId);

  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { "Authorization": atlassianAuthHeader(), "Accept": "application/json" },
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    console.error("Confluence get children failed: HTTP " + res.getResponseCode());
    return "Failed to retrieve child pages (HTTP " + res.getResponseCode() + ")";
  }

  var data = JSON.parse(res.getContentText());
  var children = (data.results || []).map(function (page) {
    var pageUrl = confluenceUrl().replace("/wiki", "") + page._links?.webui;
    return "- *" + page.title + "* (ID: " + page.id + ")\n  " + pageUrl;
  });

  if (children.length === 0) return "No child pages found under page " + pageId;
  return "Found " + children.length + " child page(s):\n\n" + children.join("\n\n");
}

function extractTextFromHtml(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
