function callGemini(systemInstruction, contents, toolDeclarations) {
  var url = "https://generativelanguage.googleapis.com/v1beta/models/"
    + GEMINI_MODEL + ":generateContent?key=" + geminiKey();

  var payload = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: contents,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
      thinkingConfig: {
        thinkingBudget: 8192
      }
    }
  };

  if (toolDeclarations) {
    payload.tools = [{ function_declarations: toolDeclarations }];
    payload.tool_config = { function_calling_config: { mode: "AUTO" } };
  }

  var systemPreview = firstNWords(systemInstruction, 50);
  var lastUserText = "";
  if (contents && contents.length > 0) {
    for (var c = contents.length - 1; c >= 0; c--) {
      var parts = contents[c].parts;
      if (parts) {
        for (var p = 0; p < parts.length; p++) {
          if (parts[p].text) {
            lastUserText = parts[p].text;
            break;
          }
        }
      }
      if (lastUserText) break;
    }
  }
  debugLog("llm_request", "system: " + systemPreview, "user_last: " + firstNWords(lastUserText, 50));

  var res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var body = JSON.parse(res.getContentText());

  if (res.getResponseCode() !== 200) {
    throw new Error("Gemini API error " + res.getResponseCode() + ": "
      + (body.error?.message || res.getContentText()));
  }

  var parts = body.candidates?.[0]?.content?.parts || [];
  var text = "";
  var functionCall = null;

  for (var i = 0; i < parts.length; i++) {
    if (parts[i].text) text += parts[i].text;
    if (parts[i].functionCall) functionCall = parts[i].functionCall;
  }

  if (functionCall) {
    debugLog("llm_response", "functionCall: " + (functionCall.name || "?"), JSON.stringify(functionCall.args || {}));
  } else {
    debugLog("llm_response", firstNWords(text, 50), "length=" + (text || "").length);
  }
  return { text: text, functionCall: functionCall };
}
