/**
 * Thinking mode: interprets the user's raw message and rewrites it into a single,
 * clear, self-contained sentence before the main agent pipeline (SearchAgent,
 * ReasoningAgent, ResponderAgent). Improves search relevance and answer quality.
 */

/**
 * Rewrites the user's raw message into a clearer, single-sentence query.
 * When a conversation summary is provided (follow-up messages), it is
 * included so the rewriter can produce a fully self-contained query.
 *
 * @param {string} userMessage - Raw message from the user.
 * @param {string} [conversationSummary] - LLM-generated summary of prior thread messages.
 * @return {string} Rewritten query, or userMessage if rewrite fails or is skipped.
 */
function rewriteUserQuery(userMessage, conversationSummary) {
  if (typeof userMessage !== "string" || !userMessage.trim()) {
    return userMessage || "";
  }

  try {
    var text = userMessage.trim();
    if (conversationSummary) {
      text += "\n\nContext from prior conversation:\n" + conversationSummary;
    }
    debugLog("thinking_input", firstNWords(text, 50));
    var systemPrompt = getPromptFromHtml("ThinkingPrompt");
    var history = [{ role: "user", parts: [{ text: text }] }];
    var result = callGemini(systemPrompt, history, null);
    var rewritten = (result.text && result.text.trim()) ? result.text.trim() : "";
    debugLog("thinking_output", firstNWords(rewritten, 50));
    return rewritten || userMessage.trim();
  } catch (e) {
    console.warn("ThinkingAgent rewrite failed, using original message", e);
    return userMessage.trim();
  }
}
