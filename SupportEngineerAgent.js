/**
 * Support Engineer agent: triage and handoff-focused research.
 * Uses Freshdesk, Confluence, and Jira only (no gcloud logs).
 * Reuses executeSearchTool from SearchAgent.js for tool execution.
 */

function runSupportEngineerAgent(question, priorKnowledge, feedback, personaHint) {
  var systemPrompt = getPromptFromHtml("SupportEngineerPrompt");
  var prefix = (personaHint && typeof personaHint === "string") ? personaHint : "";
  var parts = [prefix + "Gather information to support the requester (engineer or TechOps). Question: " + question];

  if (priorKnowledge.length > 0) {
    parts.push("\n\nPrevious research already found:\n" + priorKnowledge.join("\n---\n"));
  }
  if (feedback) {
    parts.push("\n\nA quality review flagged these gaps: " + feedback);
    parts.push("Focus on filling these gaps.");
  }

  var history = [{ role: "user", parts: [{ text: parts.join("") }] }];
  var tools = getSupportEngineerToolDeclarations();

  for (var i = 0; i < MAX_SEARCH_ITERATIONS; i++) {
    var result = callGemini(systemPrompt, history, tools);

    if (result.functionCall) {
      console.log("SupportEngineer iter " + i + " | tool=" + result.functionCall.name
        + " | args=" + JSON.stringify(result.functionCall.args));

      history.push({ role: "model", parts: [{ functionCall: result.functionCall }] });

      var toolResult = executeSearchTool(result.functionCall.name, result.functionCall.args);
      console.log("SupportEngineer tool result length: " + (toolResult || "").length);

      history.push({
        role: "function",
        parts: [{
          functionResponse: {
            name: result.functionCall.name,
            response: { result: toolResult }
          }
        }]
      });
      continue;
    }

    console.log("SupportEngineer completed at iter " + i);
    return result.text || "No findings.";
  }

  history.push({
    role: "user",
    parts: [{ text: "You have used all your iterations. Summarize your findings NOW using the structured format (SOURCES, KEY FINDINGS, CONFIDENCE, GAPS)." }]
  });

  var forced = callGemini(systemPrompt, history, null);
  return forced.text || "No findings after exhausting iterations.";
}
