/**
 * Display names for research agent personas (used when informing who took up the analysis).
 */
var RESEARCH_AGENT_NAMES = {
  support_engineer: { name: "Alex", role: "Support Engineer" },
  senior_engineer:   { name: "Sam",  role: "Senior Engineer" },
  sre_engineer:     { name: "Riley", role: "SRE Engineer" }
};

/**
 * @param {"support_engineer"|"senior_engineer"|"sre_engineer"} researchAgent
 * @returns {string} e.g. "Alex (Support Engineer)"
 */
function getResearchAgentDisplay(researchAgent) {
  var a = RESEARCH_AGENT_NAMES[researchAgent];
  return (a && a.name && a.role) ? (a.name + " (" + a.role + ")") : "Research";
}

/**
 * Uses an LLM to produce a concise summary of the thread history.
 * Only called for follow-up messages (threadHistory with 2+ messages).
 * Returns "" for first messages or on failure, so callers degrade gracefully.
 *
 * @param {Array<{role: string, text: string}>} threadHistory
 * @returns {string} Compact summary or "".
 */
function buildConversationSummary(threadHistory) {
  if (!threadHistory || threadHistory.length < 2) return "";

  try {
    var systemPrompt = getPromptFromHtml("ConversationSummaryPrompt");
    var formatted = [];
    for (var i = 0; i < threadHistory.length; i++) {
      var role = threadHistory[i].role === "model" ? "Atlas Support" : "User";
      formatted.push(role + ": " + (threadHistory[i].text || "").trim());
    }
    var contents = [{ role: "user", parts: [{ text: formatted.join("\n\n") }] }];
    var result = callGemini(systemPrompt, contents, null);
    var summary = (result.text || "").trim();
    debugLog("conversation_summary", firstNWords(summary, 50), "length=" + summary.length);
    return summary;
  } catch (e) {
    console.warn("buildConversationSummary failed, continuing without summary: " + e.message);
    return "";
  }
}

/**
 * Appends the precomputed conversation summary to the current query so
 * downstream agents can resolve references from prior turns.
 *
 * @param {string} currentMessage - The user's current (possibly rewritten) message.
 * @param {string} conversationSummary - LLM-generated summary from buildConversationSummary.
 * @returns {string} Query with optional summary block.
 */
function buildContextualizedQuery(currentMessage, conversationSummary) {
  var query = (currentMessage || "").trim();
  if (!conversationSummary) return query;
  return query
    + "\n\nConversation summary (prior discussion in this thread):\n"
    + conversationSummary;
}

/**
 * Orchestrator: coordinates research agents (Support Engineer / Senior Engineer) and ReasoningAgent in a loop.
 *
 * Flow:
 *   1. Router selects research agent by persona and question (Support Engineer vs Senior Engineer).
 *   2. Selected agent researches (Support Engineer: triage/handoff, no logs; Senior Engineer: full tools including logs).
 *   3. ReasoningAgent evaluates: is the answer satisfactory?
 *   4. After all rounds, runResponderAgent produces the final answer.
 *
 * Ticket creation bypasses the research loop entirely.
 */
function runAgent(userMessage, senderEmail, threadHistory) {
  threadHistory = threadHistory || [];
  var conversationSummary = buildConversationSummary(threadHistory);

  var effectiveQuery = isThinkingModeEnabled()
    ? rewriteUserQuery(userMessage, conversationSummary)
    : (userMessage || "").trim();
  if (!effectiveQuery) {
    effectiveQuery = (userMessage || "").trim();
  }

  var knowledge = [];
  var feedback = "";
  var ctx = getRequesterContext(senderEmail);
  var personaHint = buildSearchPersonaHint(ctx);
  var sourceHint = buildSourceHint_(effectiveQuery);

  var contextualizedQuery = buildContextualizedQuery(effectiveQuery, conversationSummary);

  debugLog("orchestrator_query", firstNWords(contextualizedQuery, 50));
  var researchAgent = selectResearchAgent(contextualizedQuery, ctx);
  var researchAgentDisplay = getResearchAgentDisplay(researchAgent);
  debugLog("agent_selected", researchAgent + " (" + researchAgentDisplay + ")");
  console.log("Orchestrator selected research agent: " + researchAgent + " (" + researchAgentDisplay + ")");

  for (var round = 0; round < MAX_ORCHESTRATOR_ROUNDS; round++) {
    console.log("=== Orchestrator round " + round + " ===");

    var hintForRound = null;
    if (round === 0) {
      var parts = [];
      if (personaHint) parts.push(personaHint);
      if (sourceHint) parts.push(sourceHint);
      if (parts.length > 0) hintForRound = parts.join(" ");
    }
    var findings = researchAgent === "support_engineer"
      ? runSupportEngineerAgent(contextualizedQuery, knowledge, feedback, hintForRound)
      : researchAgent === "sre_engineer"
        ? runSREAgent(contextualizedQuery, knowledge, feedback, hintForRound)
        : runSeniorEngineerAgent(contextualizedQuery, knowledge, feedback, hintForRound);
    knowledge.push(findings);
    console.log("Round " + round + " findings length: " + findings.length);

    var evaluation = runReasoningAgent(contextualizedQuery, knowledge);
    console.log("Round " + round + " satisfied: " + evaluation.satisfied);
    if (evaluation.feedback) debugLog("orchestrator_feedback", firstNWords(evaluation.feedback, 50));

    if (evaluation.satisfied && evaluation.answer) {
      return "**" + researchAgentDisplay + "** led this analysis.\n\n" + evaluation.answer;
    }

    if (evaluation.clarificationNeeded && evaluation.clarificationQuestion) {
      return "To give you a better answer, could you clarify: " + evaluation.clarificationQuestion;
    }

    feedback = evaluation.feedback;
    if (evaluation.followUpQueries.length > 0) {
      feedback += "\nSuggested search terms: " + evaluation.followUpQueries.join(", ");
    }
  }

  return runResponderAgent(effectiveQuery, knowledge, senderEmail, threadHistory, researchAgentDisplay);
}

/**
 * Fallback responder: generates the best possible answer from accumulated
 * knowledge. Also handles ticket creation if that's what the user asked for.
 * @param {string} [researchAgentDisplay] - e.g. "Alex (Support Engineer)" to inform who led the analysis.
 */
function runResponderAgent(userMessage, knowledge, senderEmail, threadHistory, researchAgentDisplay) {
  debugLog("responder_start", firstNWords(userMessage, 50), "knowledge_blobs=" + (knowledge ? knowledge.length : 0));
  var systemPrompt = buildSystemPrompt(senderEmail);
  var knowledgeText = knowledge.join("\n\n---\n\n");
  threadHistory = threadHistory || [];
  var ledByLine = (researchAgentDisplay && researchAgentDisplay.trim())
    ? ("The research for this request was conducted by **" + researchAgentDisplay.trim() + "**. ")
    : "";

  var history = [];
  var i;
  if (threadHistory.length === 0) {
    history.push({ role: "user", parts: [{ text: userMessage }] });
  } else {
    for (i = 0; i < threadHistory.length; i++) {
      history.push({
        role: threadHistory[i].role,
        parts: [{ text: threadHistory[i].text }]
      });
    }
    var lastUser = null;
    for (i = threadHistory.length - 1; i >= 0; i--) {
      if (threadHistory[i].role === "user") {
        lastUser = (threadHistory[i].text || "").trim();
        break;
      }
    }
    var currentTrimmed = (userMessage || "").trim();
    if (currentTrimmed && lastUser !== currentTrimmed) {
      history.push({ role: "user", parts: [{ text: userMessage }] });
    }
  }
  history.push({
    role: "model",
    parts: [{ text: "I've finished researching. Let me compile my findings." }]
  });
  history.push({
    role: "user",
    parts: [{
      text: ledByLine + "Here is everything the research agent found:\n\n"
        + knowledgeText
        + "\n\nUsing ONLY the research above and the conversation so far, give the best possible answer. "
        + "Resolve references like \"this service\", \"it\", or \"the outage\" from the conversation context above. "
        + "Lead with concrete facts, cite sources at the end. "
        + "Format your reply using only Google Chat native syntax: *bold*, _italic_, `monospace`, bullet lists, [title](url). Keep the message scannable. "
        + "If the user asked to create a Jira ticket instead of asking a question, do that."
    }]
  });

  var tools = getActionToolDeclarations();
  var result = callGemini(systemPrompt, history, tools);

  if (result.functionCall && result.functionCall.name === "jira_create_issue") {
    var ticketResult = toolCreateTicket(result.functionCall.args, senderEmail);
    history.push({ role: "model", parts: [{ functionCall: result.functionCall }] });
    history.push({
      role: "function",
      parts: [{
        functionResponse: {
          name: "jira_create_issue",
          response: { result: ticketResult }
        }
      }]
    });
    var followUp = callGemini(systemPrompt, history, null);
    var ticketReply = followUp.text || ticketResult;
    if (ledByLine && ticketReply) {
      ticketReply = "**" + (researchAgentDisplay || "Research") + "** led this analysis.\n\n" + ticketReply;
    }
    return ticketReply;
  }

  var finalText = result.text || ("I wasn't able to find a clear answer after extensive research. "
    + "Your request has been escalated to the engineering team for further assistance.");
  if (ledByLine && result.text) {
    finalText = "**" + researchAgentDisplay + "** led this analysis.\n\n" + finalText;
  }
  return finalText;
}

/**
 * Uses an LLM to decide which research agent should handle the question.
 * @param {string} query - The (possibly rewritten) user query.
 * @param {{ personaLabel: string }|null} ctx - Requester context from getRequesterContext.
 * @returns {"support_engineer"|"senior_engineer"|"sre_engineer"}
 */
function selectResearchAgent(query, ctx) {
  var persona = (ctx && ctx.personaLabel) ? ctx.personaLabel : "Other";
  var systemPrompt = getPromptFromHtml("AgentRouterPrompt");
  var userMessage = "Question: " + query + "\nPersona: " + persona;
  debugLog("agent_router_input", firstNWords(userMessage, 50));
  var contents = [{ role: "user", parts: [{ text: userMessage }] }];

  try {
    var result = callGemini(systemPrompt, contents, null);
    var text = (result.text || "").trim();
    var jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      var parsed = JSON.parse(jsonMatch[0]);
      var agent = (parsed.agent || "").toLowerCase();
      if (agent === "senior_engineer" || agent === "support_engineer" || agent === "sre_engineer") {
        debugLog("agent_router_output", agent, parsed.reason || "");
        console.log("AgentRouter chose: " + agent + " | reason: " + (parsed.reason || ""));
        return agent;
      }
    }
  } catch (e) {
    console.error("AgentRouter error, defaulting to support_engineer: " + e.message);
  }

  return "support_engineer";
}

/**
 * Returns a source-preference hint when the user explicitly asks only about Freshdesk.
 * @param {string} query - The (possibly rewritten) user query.
 * @returns {string|null}
 */
function buildSourceHint_(query) {
  var q = (query || "").toLowerCase();
  var mentionsFreshdesk = q.indexOf("freshdesk") !== -1 || q.indexOf("fresh desk") !== -1;
  var mentionsOther = q.indexOf("confluence") !== -1 || q.indexOf("jira") !== -1;
  if (mentionsFreshdesk && !mentionsOther) {
    return "User asked only about Freshdesk; use only Freshdesk tools for this request.";
  }
  return null;
}
