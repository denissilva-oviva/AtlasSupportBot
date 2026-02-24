/**
 * Freshdesk API v2 tools: get ticket, list conversations, search tickets, search solutions (knowledge base).
 * Uses script property FRESHDESK_API and base URL https://oviva.freshdesk.com.
 */

function toolGetFreshdeskTicket(ticketId) {
  if (!ticketId) return "No ticket ID provided.";

  var url = freshdeskDomain() + "/api/v2/tickets/" + encodeURIComponent(ticketId) + "?include=requester";
  console.log("Freshdesk get ticket: " + ticketId);

  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { "Authorization": freshdeskAuthHeader(), "Content-Type": "application/json" },
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    console.error("Freshdesk get ticket failed: HTTP " + res.getResponseCode());
    return "Failed to retrieve Freshdesk ticket (HTTP " + res.getResponseCode() + ")";
  }

  var t = JSON.parse(res.getContentText());
  var ticketUrl = "https://pulse.oviva.com/a/tickets/" + t.id;
  var statusLabel = freshdeskStatusLabel(t.status);
  var priorityLabel = freshdeskPriorityLabel(t.priority);
  var typeLabel = (t.type && t.type !== "") ? t.type : "?";
  var desc = stripHtml((t.description_text || t.description || "") + "").substring(0, 2000);
  if (!desc) desc = "(no description)";

  var requester = t.requester || {};
  var requesterLine = (requester.name || requester.email || "?") + (requester.email ? " (" + requester.email + ")" : "") + " [requester_id: " + (t.requester_id || "?") + "]";

  var lines = [
    "*Ticket #" + t.id + "*: " + (t.subject || ""),
    "URL: " + ticketUrl,
    "Status: " + statusLabel + " | Priority: " + priorityLabel + " | Type: " + typeLabel,
    "Requester: " + requesterLine,
    "Created: " + (t.created_at || "?") + " | Updated: " + (t.updated_at || "?"),
    "Tags: " + ((t.tags && t.tags.length) ? t.tags.join(", ") : "none"),
    "",
    "Description:",
    desc
  ];

  return lines.join("\n");
}

function toolGetFreshdeskConversations(ticketId) {
  if (!ticketId) return "No ticket ID provided.";

  var url = freshdeskDomain() + "/api/v2/tickets/" + encodeURIComponent(ticketId) + "/conversations?per_page=20";
  console.log("Freshdesk list conversations: " + ticketId);

  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { "Authorization": freshdeskAuthHeader(), "Content-Type": "application/json" },
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    console.error("Freshdesk conversations failed: HTTP " + res.getResponseCode());
    return "Failed to retrieve conversations (HTTP " + res.getResponseCode() + ")";
  }

  var list = JSON.parse(res.getContentText());
  if (!Array.isArray(list) || list.length === 0) {
    return "No conversations for this ticket.";
  }

  var maxBodyLen = 400;
  var lines = ["Conversations (last " + list.length + "):", ""];
  for (var i = 0; i < list.length; i++) {
    var c = list[i];
    var body = stripHtml((c.body_text || c.body || "") + "").substring(0, maxBodyLen);
    if (body.length >= maxBodyLen) body += "...";
    var from = (c.from_email || c.user_id || "?") + (c.private ? " [private note]" : "");
    lines.push("- " + from + " (" + (c.created_at || "?") + "): " + body);
  }

  return lines.join("\n");
}

/** Static tag for user-reported problems (2nd product & tech). See ticket 1502184. */
var FRESHDESK_SEARCH_TAG = "Oo-2nd Product & Tech";

function toolSearchFreshdeskTickets(query, daysBack, createdAfter) {
  var queryStr = (query || "").trim();
  var url;

  var requesterMatch = queryStr.match(/requester_id\s*:\s*(\d+)/i);
  if (requesterMatch) {
    var rid = requesterMatch[1];
    url = freshdeskDomain() + "/api/v2/tickets?requester_id=" + encodeURIComponent(rid) + "&per_page=10&order_by=created_at&order_type=desc";
  } else {
    var innerQuery = "tag:'" + FRESHDESK_SEARCH_TAG + "'";

    var dateFilter = resolveDateFilter_(daysBack, createdAfter);
    if (dateFilter) {
      innerQuery += " AND created_at:>'" + dateFilter + "'";
    }

    var encodedQuery = encodeURIComponent('"' + innerQuery + '"');
    url = freshdeskDomain() + "/api/v2/search/tickets?query=" + encodedQuery + "&page=1";
  }

  console.log("Freshdesk search tickets: query=" + queryStr
    + " days_back=" + (daysBack || "") + " created_after=" + (createdAfter || "")
    + " url=" + url);

  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { "Authorization": freshdeskAuthHeader(), "Content-Type": "application/json" },
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    console.error("Freshdesk search failed: HTTP " + res.getResponseCode() + " body=" + res.getContentText());
    return "Freshdesk ticket search failed (HTTP " + res.getResponseCode() + ")";
  }

  var data = JSON.parse(res.getContentText());
  var tickets = data.results || data;
  if (!Array.isArray(tickets)) tickets = [];

  if (tickets.length === 0) {
    var desc = dateFilter ? "since " + dateFilter : (queryStr || "all user-reported problems");
    return "No Freshdesk tickets found (" + desc + ").";
  }

  var lines = tickets.map(function (t) {
    var statusLabel = freshdeskStatusLabel(t.status);
    var ticketUrl = "https://pulse.oviva.com/a/tickets/" + t.id;
    return "- *#" + t.id + "*: " + (t.subject || "?") + " [" + statusLabel + "] " + (t.created_at || "") + "\n  " + ticketUrl;
  });

  return "Found " + tickets.length + " Freshdesk ticket(s):\n\n" + lines.join("\n\n");
}

/**
 * Search the Freshdesk knowledge base (Solutions) for articles by keyword.
 * Use for common questions, how-tos, and FAQs.
 * @param {string} term - Search keyword(s).
 * @returns {string} Formatted list of matching articles (title, snippet, URL) or an error message.
 */
function toolSearchFreshdeskSolutions(term) {
  var searchTerm = (term || "").trim();
  if (!searchTerm) return "No search term provided. Pass a keyword or phrase (e.g. 'password reset', 'how to').";

  var url = freshdeskDomain() + "/api/v2/search/solutions?term=" + encodeURIComponent(searchTerm);
  console.log("Freshdesk search solutions: term=" + searchTerm);

  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { "Authorization": freshdeskAuthHeader(), "Content-Type": "application/json" },
    muteHttpExceptions: true
  });

  if (res.getResponseCode() !== 200) {
    console.error("Freshdesk solutions search failed: HTTP " + res.getResponseCode() + " body=" + res.getContentText());
    return "Freshdesk knowledge base search failed (HTTP " + res.getResponseCode() + ").";
  }

  var data;
  try {
    data = JSON.parse(res.getContentText());
  } catch (e) {
    console.error("Freshdesk solutions search: invalid JSON");
    return "Freshdesk knowledge base search returned invalid response.";
  }

  var articles = data.results || data.articles || data;
  if (!Array.isArray(articles)) articles = [];

  if (articles.length === 0) {
    return "No knowledge base articles found for \"" + searchTerm + "\". Try different keywords or check Confluence/tickets.";
  }

  var maxArticles = 10;
  var maxSnippetLen = 200;
  var lines = [];
  for (var i = 0; i < articles.length && i < maxArticles; i++) {
    var a = articles[i];
    var id = a.id != null ? a.id : (a.article_id != null ? a.article_id : "");
    var title = (a.title || a.name || "Untitled") + "";
    var body = stripHtml((a.description || a.description_text || a.body || a.content || "") + "").substring(0, maxSnippetLen);
    if (body.length >= maxSnippetLen) body += "...";
    var articleUrl = "https://pulse.oviva.com/a/solutions/articles/" + id;
    lines.push("- *" + title + "*\n  " + (body || "(no snippet)") + "\n  " + articleUrl);
  }

  var total = articles.length > maxArticles ? " (showing first " + maxArticles + ")" : "";
  return "Found " + articles.length + " knowledge base article(s)" + total + ":\n\n" + lines.join("\n\n");
}

/**
 * Resolve a YYYY-MM-DD date string from days_back or created_after.
 * @param {number|string} daysBack - Number of days to look back from today.
 * @param {string} createdAfter - Explicit start date (YYYY-MM-DD).
 * @returns {string|null} YYYY-MM-DD or null if neither param is usable.
 */
function resolveDateFilter_(daysBack, createdAfter) {
  if (daysBack && Number(daysBack) > 0) {
    var d = new Date();
    d.setDate(d.getDate() - Number(daysBack));
    return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  if (createdAfter && /^\d{4}-\d{2}-\d{2}$/.test(createdAfter)) {
    return createdAfter;
  }
  return null;
}

function freshdeskStatusLabel(code) {
  var map = { 2: "Open", 3: "Pending", 4: "Resolved", 5: "Closed", 6: "Waiting on Customer", 7: "Waiting on Third Party" };
  return map[code] || ("Status " + code);
}

function freshdeskPriorityLabel(code) {
  var map = { 1: "Low", 2: "Medium", 3: "High", 4: "Urgent" };
  return map[code] || ("Priority " + code);
}

function stripHtml(html) {
  if (!html) return "";
  return (html + "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
