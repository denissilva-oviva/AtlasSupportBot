/**
 * Tools for Support Engineer agent: triage and handoff only (no logs).
 * Confluence, Jira, Freshdesk — same declarations as search, excluding gcloud_* and github_*.
 */
function getSupportEngineerToolDeclarations() {
  var all = getSearchToolDeclarations();
  return all.filter(function (t) {
    return t.name.indexOf("gcloud_") !== 0 && t.name.indexOf("github_") !== 0;
  });
}

function getSearchToolDeclarations() {
  return [
    {
      name: "confluence_search",
      description: "Search Confluence pages by keyword. Returns page titles, IDs, and URLs.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: {
            type: "STRING",
            description: "Search keywords (try different phrasings for better results)"
          }
        },
        required: ["query"]
      }
    },
    {
      name: "confluence_get_page",
      description: "Read the full content of a Confluence page by its numeric ID. ALWAYS use this after searching to read the actual content.",
      parameters: {
        type: "OBJECT",
        properties: {
          page_id: {
            type: "STRING",
            description: "Numeric Confluence page ID from search results"
          }
        },
        required: ["page_id"]
      }
    },
    {
      name: "confluence_get_page_children",
      description: "List child/sub-pages of a parent Confluence page. Use when a page is an index or overview and the real content is in its children.",
      parameters: {
        type: "OBJECT",
        properties: {
          page_id: {
            type: "STRING",
            description: "Numeric Confluence page ID of the parent page"
          }
        },
        required: ["page_id"]
      }
    },
    {
      name: "jira_list_projects",
      description: "List Jira projects (key and name). Use before searching to confirm project keys for JQL (e.g. project = NC).",
      parameters: { type: "OBJECT", properties: {} }
    },
    {
      name: "jira_list_boards",
      description: "List Jira agile boards (Scrum/Kanban). Optionally filter by project key or ID. Returns board ID, name, type. Use board ID for jira_list_sprints or board-scoped queries.",
      parameters: {
        type: "OBJECT",
        properties: {
          project_key_or_id: {
            type: "STRING",
            description: "Optional. Project key (e.g. NC) or project ID to filter boards."
          }
        },
        required: []
      }
    },
    {
      name: "jira_list_sprints",
      description: "List sprints for a Jira board. Use after jira_list_boards to get board ID. Optional state: active, future, or closed.",
      parameters: {
        type: "OBJECT",
        properties: {
          board_id: {
            type: "STRING",
            description: "Board ID from jira_list_boards"
          },
          state: {
            type: "STRING",
            description: "Optional. active, future, or closed"
          }
        },
        required: ["board_id"]
      }
    },
    {
      name: "jira_search",
      description: "Search Jira issues by JQL or keywords. IMPORTANT: before building JQL with field names you are unsure about, use jira_discover_fields to look up correct JQL clause names. The system 'priority' field has values like Highest, High, Medium, Low, Lowest. Use jira_list_projects or jira_list_boards first if you need project keys or board context.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: {
            type: "STRING",
            description: "JQL (e.g. project = NC AND priority in (High, Highest)) or search keywords"
          }
        },
        required: ["query"]
      }
    },
    {
      name: "jira_discover_fields",
      description: "Search Jira field definitions by keyword. Returns field names, JQL clause names, and whether they are system or custom fields. Use BEFORE building JQL queries when unsure about field names (e.g. search 'severity' to find if it exists and its correct JQL clause).",
      parameters: {
        type: "OBJECT",
        properties: {
          keyword: {
            type: "STRING",
            description: "Keyword to search field names (e.g. 'severity', 'priority', 'sprint', 'epic'). Leave empty to list common fields."
          }
        },
        required: []
      }
    },
    {
      name: "jira_list_priorities",
      description: "List all available Jira priority values. Use to discover valid values for the 'priority' field in JQL (e.g. priority = High).",
      parameters: { type: "OBJECT", properties: {} }
    },
    {
      name: "jira_list_statuses",
      description: "List all available Jira statuses. Use to discover valid values for the 'status' field in JQL (e.g. status = 'In Progress').",
      parameters: { type: "OBJECT", properties: {} }
    },
    {
      name: "jira_list_issue_types",
      description: "List all available Jira issue types. Use to discover valid values for the 'issuetype' field in JQL (e.g. issuetype = Bug).",
      parameters: { type: "OBJECT", properties: {} }
    },
    {
      name: "jira_get_issue",
      description: "Read full details of a Jira issue by key (e.g. PROJ-123). Includes description, comments, assignee, and status.",
      parameters: {
        type: "OBJECT",
        properties: {
          issue_key: {
            type: "STRING",
            description: "The Jira issue key (e.g. PROJ-123)"
          }
        },
        required: ["issue_key"]
      }
    },
    {
      name: "freshdesk_get_ticket",
      description: "Get full details of a Freshdesk ticket by numeric ID. Use when the user shares a Freshdesk URL (e.g. pulse.oviva.com/a/tickets/NNNN) or a ticket ID. Returns subject, description, status, priority, requester, and URL.",
      parameters: {
        type: "OBJECT",
        properties: {
          ticket_id: {
            type: "STRING",
            description: "The numeric Freshdesk ticket ID (e.g. 1502184)"
          }
        },
        required: ["ticket_id"]
      }
    },
    {
      name: "freshdesk_list_conversations",
      description: "List conversations (replies and notes) for a Freshdesk ticket. Use after freshdesk_get_ticket when more context from the thread is needed.",
      parameters: {
        type: "OBJECT",
        properties: {
          ticket_id: {
            type: "STRING",
            description: "The numeric Freshdesk ticket ID"
          }
        },
        required: ["ticket_id"]
      }
    },
    {
      name: "freshdesk_search_tickets",
      description: "Search Freshdesk for user-reported problems (tag: Oo-2nd Product & Tech). For RECENT PROBLEMS or problems in the last N days/weeks, pass days_back (e.g. 49 for 7 weeks) or created_after (YYYY-MM-DD) and do NOT pass a free-text query. For a SPECIFIC TICKET use freshdesk_get_ticket instead. Optional query: requester_id:NNNN to list tickets from that requester.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: {
            type: "STRING",
            description: "Optional. Use requester_id:12345 to list tickets from that requester. Leave empty when using days_back or created_after."
          },
          days_back: {
            type: "NUMBER",
            description: "Number of days to look back (e.g. 49 for 7 weeks, 30 for 1 month). Returns only tickets created within this window."
          },
          created_after: {
            type: "STRING",
            description: "Explicit start date in YYYY-MM-DD format. Alternative to days_back. Returns only tickets created after this date."
          }
        },
        required: []
      }
    },
    {
      name: "freshdesk_search_solutions",
      description: "Search the Freshdesk knowledge base (Solutions) for articles by keyword. Use for common questions, how-tos, and FAQs before or alongside tickets and Confluence.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: {
            type: "STRING",
            description: "Search keywords (e.g. 'password reset', 'how to export', 'Oviva app login')"
          }
        },
        required: ["query"]
      }
    },
    {
      name: "gcloud_list_applications",
      description: "List application/container names running in a Kubernetes environment. Use this first when the user asks about logs but the exact application name is unknown. Environments: hb-prod (HB production), hb-it (IT), dg-prod (DIGA production), dg-pta (DIGA PTA), hb-pta (HB PTA).",
      parameters: {
        type: "OBJECT",
        properties: {
          environment: {
            type: "STRING",
            description: "Environment name, e.g. hb-prod, hb-it, dg-prod, dg-pta, hb-pta"
          }
        },
        required: ["environment"]
      }
    },
    {
      name: "gcloud_read_logs",
      description: "Read log entries from a specific application in a Kubernetes environment. Filter by severity, search text, and time range. For incident windows use start_time and end_time (ISO 8601 UTC). Use gcloud_list_applications first if unsure of the application name.",
      parameters: {
        type: "OBJECT",
        properties: {
          environment: {
            type: "STRING",
            description: "Environment name (e.g. hb-prod, dg-pta)"
          },
          application: {
            type: "STRING",
            description: "Container/application name from gcloud_list_applications (e.g. backend-core, ocs-proxy)"
          },
          severity: {
            type: "STRING",
            description: "Optional. Minimum severity: DEBUG, INFO, WARNING, ERROR, CRITICAL"
          },
          search_text: {
            type: "STRING",
            description: "Optional. Text to search for in log messages"
          },
          hours_ago: {
            type: "NUMBER",
            description: "Optional. How far back to look in hours (default 1). Ignored when start_time is set."
          },
          limit: {
            type: "NUMBER",
            description: "Optional. Max entries to return (default 20, max 50)"
          },
          start_time: {
            type: "STRING",
            description: "Optional. ISO 8601 start time in UTC (e.g. 2025-02-15T20:00:00Z). Use for specific date ranges. Convert user timezones to UTC (CET = UTC+1, CEST = UTC+2)."
          },
          end_time: {
            type: "STRING",
            description: "Optional. ISO 8601 end time in UTC. Pair with start_time to define an incident window."
          }
        },
        required: ["environment", "application"]
      }
    },
    {
      name: "github_list_repos",
      description: "List repositories in the configured GitHub org. Use as a discovery step when you do not know which repos exist — then use the returned repo names (owner/repo or short name) with github_search_code, github_get_file, github_list_directory, etc.",
      parameters: {
        type: "OBJECT",
        properties: {
          per_page: {
            type: "NUMBER",
            description: "Optional. Max repos to return (default 100, max 100)"
          }
        },
        required: []
      }
    },
    {
      name: "github_search_code",
      description: "Search source code across the organization's GitHub repositories. Use when investigating how a component is implemented, finding where a class/function/config is defined, or locating code that could cause an error. Returns file paths, repo names, and snippets.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: {
            type: "STRING",
            description: "Search terms (e.g. class name, function name, error message, config key)"
          }
        },
        required: ["query"]
      }
    },
    {
      name: "github_get_file",
      description: "Read the content of a specific file in a GitHub repository. Use after github_search_code to read the full file. Repo format: owner/repo (e.g. myorg/backend-core).",
      parameters: {
        type: "OBJECT",
        properties: {
          repo: {
            type: "STRING",
            description: "Repository in owner/repo format (e.g. myorg/backend-core)"
          },
          path: {
            type: "STRING",
            description: "File path in the repo (e.g. src/main/java/com/app/Service.java)"
          }
        },
        required: ["repo", "path"]
      }
    },
    {
      name: "github_list_directory",
      description: "List files and folders at a path in a GitHub repository. Use to navigate repo structure. Leave path empty for repo root.",
      parameters: {
        type: "OBJECT",
        properties: {
          repo: {
            type: "STRING",
            description: "Repository in owner/repo format"
          },
          path: {
            type: "STRING",
            description: "Directory path (empty for root)"
          }
        },
        required: ["repo"]
      }
    },
    {
      name: "github_search_issues",
      description: "Search GitHub issues and pull requests by text. Returns title, state, author, labels, and URL. Optional repo filter.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: {
            type: "STRING",
            description: "Search keywords for issues/PRs"
          },
          repo: {
            type: "STRING",
            description: "Optional. Limit to one repo (owner/repo)"
          }
        },
        required: ["query"]
      }
    },
    {
      name: "github_get_pull_request",
      description: "Get full details of a pull request: description, status, reviewers, and list of changed files. Use when investigating recent code changes that might have introduced a bug.",
      parameters: {
        type: "OBJECT",
        properties: {
          repo: {
            type: "STRING",
            description: "Repository in owner/repo format"
          },
          pull_number: {
            type: "NUMBER",
            description: "Pull request number"
          }
        },
        required: ["repo", "pull_number"]
      }
    },
    {
      name: "github_list_commits",
      description: "List recent commits for a repository, optionally filtered by path. Use to understand recent changes to a file or component.",
      parameters: {
        type: "OBJECT",
        properties: {
          repo: {
            type: "STRING",
            description: "Repository in owner/repo format"
          },
          path: {
            type: "STRING",
            description: "Optional. Limit to commits that touched this path"
          },
          since: {
            type: "STRING",
            description: "Optional. ISO 8601 date (e.g. 2024-01-01T00:00:00Z) to list only commits after this time"
          }
        },
        required: ["repo"]
      }
    }
  ];
}

/**
 * SRE/DevOps agent: all search tools plus K8s events (via Cloud Logging) and Cloud Monitoring metrics.
 */
function getSREToolDeclarations() {
  var base = getSearchToolDeclarations();
  var sreTools = [
    {
      name: "k8s_get_pod_events",
      description: "Query Kubernetes pod lifecycle events from Cloud Logging (Unhealthy, Killing, BackOff, OOMKilling, Failed, Scheduled, Started). For discovery: leave application empty to get problematic events (Unhealthy/Killing/BackOff/OOMKilling/Failed) across ALL applications in the environment. When targeting one app, pass application and use start_time/end_time for incident windows.",
      parameters: {
        type: "OBJECT",
        properties: {
          environment: { type: "STRING", description: "Environment name (e.g. dg-prod, hb-prod)" },
          application: { type: "STRING", description: "Optional. Container/application name (e.g. mailer-kim). Leave empty for discovery across all applications." },
          start_time: { type: "STRING", description: "Optional. ISO 8601 start in UTC (e.g. 2025-02-15T20:00:00Z). Use for incident windows." },
          end_time: { type: "STRING", description: "Optional. ISO 8601 end in UTC. Pair with start_time." },
          hours_ago: { type: "NUMBER", description: "Optional. How far back in hours if start_time not set (default 24)." }
        },
        required: ["environment"]
      }
    },
    {
      name: "k8s_get_deployment_events",
      description: "Query FluxCD Helm deployment events from Cloud Logging (UpgradeSucceeded, InstallFailed, HelmChartConfigured). Leave application empty to list ALL recent deployment events in the environment (discovery of what was deployed). Pass application to filter by release name.",
      parameters: {
        type: "OBJECT",
        properties: {
          environment: { type: "STRING", description: "Environment name (e.g. dg-prod)" },
          application: { type: "STRING", description: "Optional. Application or Helm release name to filter (e.g. mailer-kim). Leave empty for all recent deployments (discovery)." },
          start_time: { type: "STRING", description: "Optional. ISO 8601 start in UTC." },
          end_time: { type: "STRING", description: "Optional. ISO 8601 end in UTC." },
          hours_ago: { type: "NUMBER", description: "Optional. How far back in hours if start_time not set (default 168 = 7 days)." }
        },
        required: ["environment"]
      }
    },
    {
      name: "k8s_discover_pods",
      description: "Discover current pod names and namespaces for an application from recent Cloud Logging entries. Use when you need pod names for an app in an environment.",
      parameters: {
        type: "OBJECT",
        properties: {
          environment: { type: "STRING", description: "Environment name (e.g. dg-prod)" },
          application: { type: "STRING", description: "Container/application name (e.g. mailer-kim)" }
        },
        required: ["environment", "application"]
      }
    },
    {
      name: "monitoring_restart_count",
      description: "Query Cloud Monitoring for container restart_count metric. Use to see if pods restarted during an incident window.",
      parameters: {
        type: "OBJECT",
        properties: {
          environment: { type: "STRING", description: "Environment name" },
          application: { type: "STRING", description: "Container name (e.g. mailer-kim)" },
          start_time: { type: "STRING", description: "Optional. ISO 8601 start in UTC." },
          end_time: { type: "STRING", description: "Optional. ISO 8601 end in UTC." },
          hours_ago: { type: "NUMBER", description: "Optional. How far back in hours if start_time not set (default 24)." }
        },
        required: ["environment", "application"]
      }
    },
    {
      name: "monitoring_resource_usage",
      description: "Query Cloud Monitoring for pod CPU or memory usage. metric_type: memory (used_bytes), cpu (usage_time), or uptime.",
      parameters: {
        type: "OBJECT",
        properties: {
          environment: { type: "STRING", description: "Environment name" },
          application: { type: "STRING", description: "Container name (e.g. mailer-kim)" },
          metric_type: { type: "STRING", description: "One of: memory, cpu, uptime" },
          start_time: { type: "STRING", description: "Optional. ISO 8601 start in UTC." },
          end_time: { type: "STRING", description: "Optional. ISO 8601 end in UTC." },
          hours_ago: { type: "NUMBER", description: "Optional. How far back in hours if start_time not set (default 24)." }
        },
        required: ["environment", "application", "metric_type"]
      }
    },
    {
      name: "monitoring_restart_count_all",
      description: "List restart_count for ALL containers in an environment (discovery). Use to find which containers have been restarting without specifying an application. Results sorted by restart count descending (restarters first).",
      parameters: {
        type: "OBJECT",
        properties: {
          environment: { type: "STRING", description: "Environment name (e.g. dg-prod)" },
          start_time: { type: "STRING", description: "Optional. ISO 8601 start in UTC." },
          end_time: { type: "STRING", description: "Optional. ISO 8601 end in UTC." },
          hours_ago: { type: "NUMBER", description: "Optional. How far back in hours if start_time not set (default 24)." }
        },
        required: ["environment"]
      }
    }
  ];
  return base.concat(sreTools);
}

function getActionToolDeclarations() {
  return [
    {
      name: "jira_create_issue",
      description: "Create a new Jira issue. Only works for authorized users.",
      parameters: {
        type: "OBJECT",
        properties: {
          project_key: {
            type: "STRING",
            description: "The Jira project key (e.g. PROJ)"
          },
          summary: {
            type: "STRING",
            description: "Issue title/summary"
          },
          description: {
            type: "STRING",
            description: "Detailed description of the issue"
          }
        },
        required: ["project_key", "summary"]
      }
    }
  ];
}

function getToolDeclarations() {
  return getSearchToolDeclarations().concat(getActionToolDeclarations());
}
