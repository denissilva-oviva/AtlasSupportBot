function runReasoningAgent(question, knowledge) {
  var systemPrompt = getPromptFromHtml("ReasoningPrompt");
  var prompt = "Original question: " + question
    + "\n\nAccumulated research findings:\n\n" + knowledge.join("\n\n---\n\n");

  debugLog("reasoning_input", firstNWords(prompt, 50));
  var contents = [{ role: "user", parts: [{ text: prompt }] }];
  var result = callGemini(systemPrompt, contents, null);

  var text = (result.text || "").trim();
  debugLog("reasoning_response", firstNWords(text, 50), "length=" + text.length);
  console.log("ReasoningAgent raw response length: " + text.length);

  try {
    var jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      var parsed = JSON.parse(jsonMatch[0]);
      var clarificationQuestion = (parsed.clarification_question || "").trim();
      return {
        satisfied: !!parsed.satisfied,
        answer: parsed.answer || "",
        feedback: parsed.feedback || "",
        followUpQueries: parsed.follow_up_queries || [],
        clarificationNeeded: !!parsed.clarification_needed && clarificationQuestion.length > 0,
        clarificationQuestion: clarificationQuestion
      };
    }
  } catch (e) {
    console.error("ReasoningAgent JSON parse error: " + e.message);
  }

  return {
    satisfied: false,
    answer: "",
    feedback: text || "Could not evaluate findings. Try different search terms.",
    followUpQueries: [],
    clarificationNeeded: false,
    clarificationQuestion: ""
  };
}
