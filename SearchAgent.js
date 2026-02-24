function runSearchAgent(question, priorKnowledge, feedback, personaHint) {
  var systemPrompt = getPromptFromHtml("SearchAgentPrompt");
  var prefix = (personaHint && typeof personaHint === "string") ? personaHint : "";
  var parts = [prefix + "Research this question: " + question];

  if (priorKnowledge.length > 0) {
    parts.push("\n\nPrevious research already found:\n" + priorKnowledge.join("\n---\n"));
  }
  if (feedback) {
    parts.push("\n\nA quality review flagged these gaps: " + feedback);
    parts.push("Focus on filling these gaps. Try different search terms.");
  }

  var history = [{ role: "user", parts: [{ text: parts.join("") }] }];
  var tools = getSearchToolDeclarations();

  for (var i = 0; i < MAX_SEARCH_ITERATIONS; i++) {
    var result = callGemini(systemPrompt, history, tools);

    if (result.functionCall) {
      console.log("SearchAgent iter " + i + " | tool=" + result.functionCall.name
        + " | args=" + JSON.stringify(result.functionCall.args));

      history.push({ role: "model", parts: [{ functionCall: result.functionCall }] });

      var toolResult = executeSearchTool(result.functionCall.name, result.functionCall.args);
      console.log("SearchAgent tool result length: " + (toolResult || "").length);

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

    console.log("SearchAgent completed at iter " + i);
    return result.text || "No findings.";
  }

  history.push({
    role: "user",
    parts: [{ text: "You have used all your search iterations. Summarize your findings NOW using the structured format (SOURCES, KEY FINDINGS, CONFIDENCE, GAPS)." }]
  });

  var forced = callGemini(systemPrompt, history, null);
  return forced.text || "No findings after exhausting search iterations.";
}

function executeSearchTool(toolName, args) {
  try {
    var queryPreview = (args && args.query) ? firstNWords(args.query, 15) : (args ? firstNWords(JSON.stringify(args), 15) : "");
    if (queryPreview) debugLog("tool_search", toolName, queryPreview);
    var toolResult;
    switch (toolName) {
      case "confluence_search":
        toolResult = toolSearchConfluence(args.query || "");
        break;
      case "confluence_get_page":
        toolResult = toolGetConfluencePage(args.page_id || "");
        break;
      case "confluence_get_page_children":
        toolResult = toolGetConfluencePageChildren(args.page_id || "");
        break;
      case "jira_list_projects":
        toolResult = toolListJiraProjects();
        break;
      case "jira_list_boards":
        toolResult = toolListJiraBoards(args.project_key_or_id || "");
        break;
      case "jira_list_sprints":
        toolResult = toolListJiraSprints(args.board_id || "", args.state || "");
        break;
      case "jira_search":
        toolResult = toolSearchJira(args.query || "");
        break;
      case "jira_discover_fields":
        toolResult = toolListJiraFieldsByKeyword(args.keyword || "");
        break;
      case "jira_list_priorities":
        toolResult = toolListJiraPriorities();
        break;
      case "jira_list_statuses":
        toolResult = toolListJiraStatuses();
        break;
      case "jira_list_issue_types":
        toolResult = toolListJiraIssueTypes();
        break;
      case "jira_get_issue":
        toolResult = toolGetJiraIssue(args.issue_key || "");
        break;
      case "freshdesk_get_ticket":
        toolResult = toolGetFreshdeskTicket(args.ticket_id || "");
        break;
      case "freshdesk_list_conversations":
        toolResult = toolGetFreshdeskConversations(args.ticket_id || "");
        break;
      case "freshdesk_search_tickets":
        toolResult = toolSearchFreshdeskTickets(args.query || "", args.days_back, args.created_after);
        break;
      case "freshdesk_search_solutions":
        toolResult = toolSearchFreshdeskSolutions(args.query || args.term || "");
        break;
      case "gcloud_list_applications":
        toolResult = toolListGCloudApplications(args.environment || "");
        break;
      case "gcloud_read_logs":
        toolResult = toolReadGCloudLogs(
          args.environment || "",
          args.application || "",
          args.severity,
          args.search_text,
          args.hours_ago,
          args.limit,
          args.start_time,
          args.end_time
        );
        break;
      case "github_list_repos":
        toolResult = toolListOrgRepositories(args.per_page);
        break;
      case "github_search_code":
        toolResult = toolSearchGitHubCode(args.query || "");
        break;
      case "github_get_file":
        toolResult = toolGetGitHubFile(args.repo || "", args.path || "");
        break;
      case "github_list_directory":
        toolResult = toolListGitHubDirectory(args.repo || "", args.path || "");
        break;
      case "github_search_issues":
        toolResult = toolSearchGitHubIssues(args.query || "", args.repo || "");
        break;
      case "github_get_pull_request":
        toolResult = toolGetGitHubPullRequest(args.repo || "", args.pull_number);
        break;
      case "github_list_commits":
        toolResult = toolListGitHubCommits(args.repo || "", args.path || "", args.since || "");
        break;
      case "k8s_get_pod_events":
        toolResult = toolGetK8sPodEvents(
          args.environment || "",
          args.application || "",
          args.start_time,
          args.end_time,
          args.hours_ago
        );
        break;
      case "k8s_get_deployment_events":
        toolResult = toolGetK8sDeploymentEvents(
          args.environment || "",
          args.application,
          args.start_time,
          args.end_time,
          args.hours_ago
        );
        break;
      case "k8s_discover_pods":
        toolResult = toolDiscoverK8sPods(args.environment || "", args.application || "");
        break;
      case "monitoring_restart_count":
        toolResult = toolGetRestartCount(
          args.environment || "",
          args.application || "",
          args.start_time,
          args.end_time,
          args.hours_ago
        );
        break;
      case "monitoring_resource_usage":
        toolResult = toolGetResourceUsage(
          args.environment || "",
          args.application || "",
          args.metric_type || "memory",
          args.start_time,
          args.end_time,
          args.hours_ago
        );
        break;
      case "monitoring_restart_count_all":
        toolResult = toolGetRestartCountAll(
          args.environment || "",
          args.start_time,
          args.end_time,
          args.hours_ago
        );
        break;
      default:
        toolResult = "Unknown tool: " + toolName;
    }
    debugLog("tool_result", toolName, resultPreview(toolResult, 15));
    return toolResult;
  } catch (e) {
    console.error("SearchAgent tool error (" + toolName + "): " + e.message);
    return "Tool error: " + e.message;
  }
}
