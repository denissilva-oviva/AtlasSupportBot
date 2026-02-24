/**
 * Entrypoint: Google Chat event handlers.
 *
 * Module layout:
 *   Code.js           - this file (event handlers)
 *   Config.js          - constants, script properties, auth helpers
 *   Prompts.js         - prompt loader (reads all .html prompts at runtime)
 *   SystemPrompt.html  - main agent system prompt (template: requesterContext, ticketPolicy)
 *   ReasoningPrompt.html   - QA agent system prompt
 *   AgentRouterPrompt.html      - LLM-based routing: decides Support Engineer vs Senior Engineer
 *   SupportEngineerPrompt.html  - Support Engineer system prompt (triage/handoff)
 *   SeniorEngineerPrompt.html   - Senior Engineer system prompt (logs, TDD, deep technical)
 *   SearchAgentPrompt.html      - legacy research agent prompt (kept for reference)
 *   ThinkingPrompt.html         - query-rewrite agent system prompt
 *   (All prompts live in .html for evolution and editing; loaded via Prompts.js.)
 *   RequesterContext.js - requester department/team from BigQuery (cache + lookup)
 *   ToolRegistry.js    - Gemini function declarations (tool schemas)
 *   ThinkingAgent.js   - thinking mode: rewrites user query before agent
 *   Agent.js           - orchestrator: routes to research agents, coordinates with QA
 *   SupportEngineerAgent.js  - Support Engineer: triage/handoff (Freshdesk, Confluence, Jira)
 *   SeniorEngineerAgent.js   - Senior Engineer: deep investigation (full tools + logs)
 *   SearchAgent.js            - shared executeSearchTool + legacy runSearchAgent
 *   ReasoningAgent.js         - QA agent: evaluates if findings answer the question
 *   Gemini.js          - Gemini API client (native function calling)
 *   ToolConfluence.js  - Confluence search + page reader
 *   ToolJira.js        - Jira search, issue reader, ticket creation
 *   ToolFreshdesk.js   - Freshdesk ticket details, conversations, search by requester
 *   ChatHelpers.js     - reply helpers, text sanitisation
 */

function onMessage(event) {
  var spaceName  = event?.space?.name;
  var threadName = event?.message?.thread?.name;
  if (!spaceName) return;

  var userMessage = stripBotMention(event?.message?.text || "");
  var senderEmail = event?.user?.email || "";

  if (!userMessage) return;

  if (!isWhitelistedUser(senderEmail)) {
    replyInThread(spaceName, threadName,
      "This is currently in the POC phase, and only requests initiated by whitelisted users are allowed.");
    return;
  }

  var threadHistory = [];
  if (threadName) {
    threadHistory = getThreadHistory(spaceName, threadName);
  }

  enqueueMessage({
    spaceName: spaceName,
    threadName: threadName,
    userMessage: userMessage,
    senderEmail: senderEmail,
    threadHistory: threadHistory
  });

  replyInThread(spaceName, threadName, "🔍 Looking into it…");
}

// ── Queue-based async processing ──────────────────────────────────────
// A persistent everyMinutes(1) trigger calls processQueue.
// Run installPollingTrigger() once to set it up.

function processQueue() {
  var payload = dequeueMessage();
  if (!payload) return;

  try {
    var threadHistory = payload.threadHistory || [];
    var answer = runAgent(payload.userMessage, payload.senderEmail, threadHistory);
    replyInThread(payload.spaceName, payload.threadName, answer);
  } catch (e) {
    console.error("Agent error (async)", e);
    replyInThread(payload.spaceName, payload.threadName,
      "Sorry, I ran into a problem while processing your request. Please try again.");
  }
}

function enqueueMessage(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var queue = JSON.parse(props.getProperty("MSG_QUEUE") || "[]");
    queue.push(payload);
    props.setProperty("MSG_QUEUE", JSON.stringify(queue));
  } finally {
    lock.releaseLock();
  }
}

function dequeueMessage() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var props = PropertiesService.getScriptProperties();
    var queue = JSON.parse(props.getProperty("MSG_QUEUE") || "[]");
    if (queue.length === 0) return null;
    var payload = queue.shift();
    props.setProperty("MSG_QUEUE", JSON.stringify(queue));
    return payload;
  } finally {
    lock.releaseLock();
  }
}

/** Run once (manually or from the script editor) to create the polling trigger. */
function installPollingTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "processQueue") {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger("processQueue")
    .timeBased()
    .everyMinutes(1)
    .create();
}

function onAddToSpace(event) {
  var message = event?.space?.singleUserBotDm
    ? "Thanks for adding me, " + (event.user?.displayName || "there") + "!"
    : "Thanks for adding me to " + (event.space?.displayName || "this chat") +
      ". Mention me and I'll try to help using Confluence docs and Jira tickets.";
  return { text: message };
}

function onRemoveFromSpace(event) {
  console.info("Bot removed from ", event?.space?.name || "this chat");
}
