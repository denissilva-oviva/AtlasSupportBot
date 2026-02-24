/**
 * SRE/DevOps agent: infrastructure incident investigation.
 * Full tool set including enhanced gcloud logs (date range), K8s pod/deployment events,
 * Cloud Monitoring metrics, plus Confluence, Jira, Freshdesk, GitHub.
 * Reuses executeSearchTool from SearchAgent.js for tool execution.
 */

function runSREAgent(question, priorKnowledge, feedback, personaHint) {
  var systemPrompt = getPromptFromHtml("SREAgentPrompt");
  var prefix = (personaHint && typeof personaHint === "string") ? personaHint : "";
  var parts = [prefix + "Investigate this infrastructure/incident question: " + question];

  if (priorKnowledge.length > 0) {
    parts.push("\n\nPrevious research already found:\n" + priorKnowledge.join("\n---\n"));
  }
  if (feedback) {
    parts.push("\n\nA quality review flagged these gaps: " + feedback);
    parts.push("Focus on filling these gaps. Try different search terms or tools.");
  }

  var history = [{ role: "user", parts: [{ text: parts.join("") }] }];
  var tools = getSREToolDeclarations();

  for (var i = 0; i < MAX_SEARCH_ITERATIONS; i++) {
    var result = callGemini(systemPrompt, history, tools);

    if (result.functionCall) {
      console.log("SREAgent iter " + i + " | tool=" + result.functionCall.name
        + " | args=" + JSON.stringify(result.functionCall.args));

      history.push({ role: "model", parts: [{ functionCall: result.functionCall }] });

      var toolResult = executeSearchTool(result.functionCall.name, result.functionCall.args);
      console.log("SREAgent tool result length: " + (toolResult || "").length);

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

    console.log("SREAgent completed at iter " + i);
    return result.text || "No findings.";
  }

  history.push({
    role: "user",
    parts: [{ text: "You have used all your iterations. Summarize your findings NOW using the structured format (TIMELINE, ROOT CAUSE HYPOTHESIS, AFFECTED COMPONENTS, EVIDENCE, RECOMMENDED ACTIONS, CONFIDENCE, GAPS)." }]
  });

  var forced = callGemini(systemPrompt, history, null);
  return forced.text || "No findings after exhausting investigation iterations.";
}
