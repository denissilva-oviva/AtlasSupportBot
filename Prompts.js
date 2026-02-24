function buildSystemPrompt(senderEmail) {
  var template = HtmlService.createTemplateFromFile("SystemPrompt");
  template.ticketPolicy = getTicketPolicy(senderEmail);
  template.requesterContext = getRequesterContextParagraph(senderEmail);
  return template.evaluate().getContent();
}

/**
 * Load a static prompt from an HTML file (no template variables).
 * @param {string} basename - File name without extension (e.g. "ReasoningPrompt").
 * @return {string} The prompt content.
 */
function getPromptFromHtml(basename) {
  var template = HtmlService.createTemplateFromFile(basename);
  return template.evaluate().getContent();
}

/**
 * Build the persona-specific paragraph injected as <?= requesterContext ?>.
 * Uses getRequesterContext(senderEmail) from RequesterContext.js (cache + BigQuery).
 */
function getRequesterContextParagraph(senderEmail) {
  var ctx = getRequesterContext(senderEmail);
  var p = ctx.personaLabel;
  var namePart = (ctx.firstName && ctx.firstName.trim()) ? "The requester is **" + ctx.firstName.trim() + "**" : "The requester";
  var fromPart = namePart + (ctx.firstName && ctx.firstName.trim() ? ", from " : " is from ");
  if (p === "Engineering") {
    return fromPart + "**Engineering**. If urgency or whether they are currently blocked and waiting for support is not clear, ask. "
      + "Route or suggest ownership using Atlas engineering squads: **Helios**, **Athena**, **Global Operations**, **DTX Operations**, **Oviva Clinic Operations**. "
      + "Address the user by name in your response when you know it.";
  }
  if (p === "TechOps") {
    return fromPart + "**TechOps** (1st level support). They report Freshdesk tickets. "
      + "Your role is to help decide whether an NC should be created or it's a simple fix. Help quantify impact when possible. "
      + "Address the user by name in your response when you know it.";
  }
  return fromPart + "another department (e.g. Finance, Operations, Clinical Delivery). "
    + "Triage and gather information: ask for Freshdesk ticket link if missing, impact (numbers, dates), and steps; then summarize and suggest routing or attach to an existing ticket. "
    + "Address the user by name in your response when you know it.";
}

function getTicketPolicy(senderEmail) {
  if (senderEmail === AUTHORIZED_EMAIL) {
    return "The user IS authorized to create Jira tickets.\n"
      + "When asked, extract the project key, summary, and description, then use jira_create_issue.\n"
      + "Confirm the created ticket key and URL.";
  }
  return "The user is NOT authorized to create Jira tickets.\n"
    + "If they ask, politely decline and say only Denis Dos Santos Silva can do that.";
}
