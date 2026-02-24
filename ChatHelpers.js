/**
 * Send a text message to Google Chat. Message body must use Chat's native text formatting
 * (see https://developers.google.com/workspace/chat/format-messages): *bold*, _italic_, ~strikethrough~,
 * `monospace`, ```code block```, bullet lists (* or -), [label](url). Do not send other markup.
 */
function replyInThread(spaceName, threadName, text) {
  var msg = { text: text };
  if (threadName) {
    msg.thread = { name: threadName };
  }
  Chat.Spaces.Messages.create(msg, spaceName, {
    messageReplyOption: "REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD"
  });
}

/**
 * Fetch full thread history for a thread in a space.
 * Uses Chat API list messages with filter by thread.name.
 * Returns array of { role: "user"|"model", text: string } in chronological order.
 * When the message is not from the bot, role is "user"; when from the bot, role is "model".
 *
 * @param {string} spaceName - Space resource name (e.g. spaces/xxx)
 * @param {string} threadName - Thread resource name (e.g. spaces/xxx/threads/yyy)
 * @returns {Array<{role: string, text: string}>}
 */
function getThreadHistory(spaceName, threadName) {
  if (!spaceName || !threadName) return [];
  var all = [];
  var pageToken = null;
  var maxPages = 5;
  var pageSize = 100;
  for (var p = 0; p < maxPages; p++) {
    var url = "https://chat.googleapis.com/v1/" + spaceName + "/messages?pageSize=" + pageSize;
    url += "&filter=" + encodeURIComponent('thread.name="' + threadName.replace(/"/g, '\\"') + '"');
    if (pageToken) url += "&pageToken=" + encodeURIComponent(pageToken);
    try {
      var res = UrlFetchApp.fetch(url, {
        headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });
      if (res.getResponseCode() !== 200) {
        console.warn("getThreadHistory API error: " + res.getResponseCode() + " " + res.getContentText());
        break;
      }
      var body = JSON.parse(res.getContentText());
      var messages = body.messages || [];
      for (var i = 0; i < messages.length; i++) {
        var msg = messages[i];
        var text = (msg.text || "").trim();
        if (!text) continue;
        var role = (msg.sender && msg.sender.type === "BOT") ? "model" : "user";
        if (role === "user") text = stripBotMention(text);
        if (!text) continue;
        all.push({
          role: role,
          text: text,
          createTime: msg.createTime || ""
        });
      }
      pageToken = body.nextPageToken || null;
      if (!pageToken) break;
    } catch (e) {
      console.warn("getThreadHistory error: " + e.message);
      break;
    }
  }
  all.sort(function (a, b) { return (a.createTime || "").localeCompare(b.createTime || ""); });
  return all.map(function (m) { return { role: m.role, text: m.text }; });
}

function stripBotMention(text) {
  return text.replace(/<users\/[^>]+>/g, "").trim();
}

function sanitizeQuery(text) {
  return text.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
}
