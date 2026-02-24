var MAX_SEARCH_ITERATIONS = 5;
var MAX_ORCHESTRATOR_ROUNDS = 2;
var AUTHORIZED_EMAIL = "denis.silva@oviva.com";

/** POC phase: only these users can send messages to the bot. */
var WHITELISTED_USERS = [
  "denis.silva@oviva.com",
  "arindam.ghosh@oviva.com",
  "karsten.wolke@oviva.com",
  "manuel.baumann@oviva.com",
  "diogo.monteiro@oviva.com"
];

function isWhitelistedUser(email) {
  if (!email) return false;
  return WHITELISTED_USERS.indexOf(email.trim().toLowerCase()) !== -1;
}

var GEMINI_MODEL = "gemini-2.5-pro";

function getProps() {
  return PropertiesService.getScriptProperties();
}

/** Whether thinking mode is enabled (rewrite user query before agent). Enabled when not set; set THINKING_MODE to "false" to disable. */
function isThinkingModeEnabled() {
  var val = getProps().getProperty("THINKING_MODE");
  if (val === "false" || val === "0") return false;
  return true;
}

function geminiKey()      { return getProps().getProperty("GEMINI_API_KEY"); }
function jiraUrl()        { return getProps().getProperty("JIRA_URL"); }
function jiraUsername()    { return getProps().getProperty("JIRA_USERNAME"); }
function jiraToken()      { return getProps().getProperty("JIRA_API_TOKEN"); }
function confluenceUrl()  { return getProps().getProperty("CONFLUENCE_URL"); }

function freshdeskDomain() {
  return getProps().getProperty("FRESHDESK_DOMAIN") || "https://oviva.freshdesk.com";
}
function freshdeskAuthHeader() {
  return "Basic " + Utilities.base64Encode(getProps().getProperty("FRESHDESK_API") + ":X");
}

function atlassianAuthHeader() {
  return "Basic " + Utilities.base64Encode(jiraUsername() + ":" + jiraToken());
}

function githubToken() {
  return getProps().getProperty("GITHUB_TOKEN");
}
function githubOrg() {
  return getProps().getProperty("GITHUB_ORG");
}
function githubAuthHeader() {
  return "Bearer " + (githubToken() || "");
}

/**
 * One-time setup: run this function from the Apps Script editor to populate
 * Script Properties. Fill in real values in the UI (File → Project properties →
 * Script properties) or pass them here and delete after running.
 */
function setupProperties() {
  var required = [
    "GEMINI_API_KEY",
    "JIRA_URL",
    "JIRA_USERNAME",
    "JIRA_API_TOKEN",
    "CONFLUENCE_URL",
    "FRESHDESK_API",
    "FRESHDESK_DOMAIN",
    "GITHUB_TOKEN",
    "GITHUB_ORG"
  ];
  var props = getProps();
  var missing = required.filter(function(k) { return !props.getProperty(k); });
  if (missing.length) {
    throw new Error("Missing script properties: " + missing.join(", ") +
      ". Set them via File → Project properties → Script properties.");
  }
  Logger.log("All required properties are set.");
}
