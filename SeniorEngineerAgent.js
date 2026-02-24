/**
 * Senior Engineer agent: deep technical investigation.
 * Full tool set including gcloud logs, Confluence (TDD, architecture), Jira, Freshdesk.
 * Reuses executeSearchTool from SearchAgent.js for tool execution.
 */

function runSeniorEngineerAgent(question, priorKnowledge, feedback, personaHint) {
  var systemPrompt = getPromptFromHtml("SeniorEngineerPrompt");
  var prefix = (personaHint && typeof personaHint === "string") ? personaHint : "";
  var parts = [prefix + "Investigate this question in depth: " + question];

  if (priorKnowledge.length > 0) {
    parts.push("\n\nPrevious research already found:\n" + priorKnowledge.join("\n---\n"));
  }
  if (feedback) {
    parts.push("\n\nA quality review flagged these gaps: " + feedback);
    parts.push("Focus on filling these gaps. Try different search terms or tools.");
  }

  var history = [{ role: "user", parts: [{ text: parts.join("") }] }];
  var tools = getSearchToolDeclarations();

  for (var i = 0; i < MAX_SEARCH_ITERATIONS; i++) {
    var result = callGemini(systemPrompt, history, tools);

    if (result.functionCall) {
      console.log("SeniorEngineer iter " + i + " | tool=" + result.functionCall.name
        + " | args=" + JSON.stringify(result.functionCall.args));

      history.push({ role: "model", parts: [{ functionCall: result.functionCall }] });

      var toolResult = executeSearchTool(result.functionCall.name, result.functionCall.args);
      console.log("SeniorEngineer tool result length: " + (toolResult || "").length);

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

    console.log("SeniorEngineer completed at iter " + i);
    return result.text || "No findings.";
  }

  history.push({
    role: "user",
    parts: [{ text: "You have used all your investigation iterations. Summarize your findings NOW using the structured format (SOURCES, KEY FINDINGS, CONFIDENCE, GAPS)." }]
  });

  var forced = callGemini(systemPrompt, history, null);
  return forced.text || "No findings after exhausting investigation iterations.";
}
