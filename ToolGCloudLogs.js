/**
 * Google Cloud Logging tools: list applications and read logs from Kubernetes
 * environments (HB prod, HB IT, DG prod, DG PTA, HB PTA).
 * Uses ScriptApp.getOAuthToken() with logging.read scope; caller must have
 * roles/logging.viewer on each target GCP project.
 */

var CLOUD_LOGGING_API = "https://logging.googleapis.com/v2/entries:list";
var MAX_MESSAGE_LENGTH = 1500;

/** Map of lowercase environment key -> GCP project ID */
var ENVIRONMENT_MAP = {
  "oviva-k8s-prod": "oviva-k8s-prod",
  "hb-prod": "oviva-k8s-prod",
  "hb prod": "oviva-k8s-prod",
  "hb production": "oviva-k8s-prod",
  "oviva-k8s-hb-it": "oviva-k8s-hb-it",
  "hb-it": "oviva-k8s-hb-it",
  "hb it": "oviva-k8s-hb-it",
  "it": "oviva-k8s-hb-it",
  "oviva-k8s-dg-prod": "oviva-k8s-dg-prod",
  "dg-prod": "oviva-k8s-dg-prod",
  "dg prod": "oviva-k8s-dg-prod",
  "diga production": "oviva-k8s-dg-prod",
  "diga prod": "oviva-k8s-dg-prod",
  "oviva-k8s-dg-pta": "oviva-k8s-dg-pta",
  "dg-pta": "oviva-k8s-dg-pta",
  "dg pta": "oviva-k8s-dg-pta",
  "diga pta": "oviva-k8s-dg-pta",
  "oviva-k8s": "oviva-k8s",
  "hb-pta": "oviva-k8s",
  "hb pta": "oviva-k8s",
  "pta": "oviva-k8s"
};

/**
 * Resolves a user-provided environment name to a GCP project ID.
 * @param {string} name - Environment name (e.g. "hb-prod", "dg-pta")
 * @returns {string|null} Project ID or null if not found
 */
function resolveEnvironment(name) {
  if (!name || typeof name !== "string") return null;
  var key = name.trim().toLowerCase();
  return ENVIRONMENT_MAP[key] || null;
}

/**
 * Calls Cloud Logging entries:list API.
 * @param {string} projectId - GCP project ID
 * @param {string} filter - Logging query language filter
 * @param {number} pageSize - Max entries to return (default 50)
 * @param {string} orderBy - "timestamp desc" or "timestamp asc"
 * @param {string} pageToken - Optional pagination token
 * @returns {{ entries: Array, nextPageToken: string|null }}
 */
function callCloudLoggingApi(projectId, filter, pageSize, orderBy, pageToken) {
  pageSize = pageSize || 50;
  orderBy = orderBy || "timestamp desc";
  var payload = {
    resourceNames: ["projects/" + projectId],
    filter: filter || "resource.type=\"k8s_container\"",
    orderBy: orderBy,
    pageSize: Math.min(Math.max(1, pageSize), 1000)
  };
  if (pageToken) payload.pageToken = pageToken;

  var token = ScriptApp.getOAuthToken();
  var res = UrlFetchApp.fetch(CLOUD_LOGGING_API, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    headers: { "Authorization": "Bearer " + token },
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var body;
  try {
    body = JSON.parse(res.getContentText());
  } catch (e) {
    body = {};
  }

  if (code !== 200) {
    var msg = (body.error && body.error.message) ? body.error.message : res.getContentText();
    throw new Error("Cloud Logging API error " + code + ": " + msg);
  }

  return {
    entries: body.entries || [],
    nextPageToken: body.nextPageToken || null
  };
}

/**
 * List distinct application/container names in an environment.
 * Uses Cloud Monitoring uptime metric — every running container reports metrics
 * regardless of log volume, so quiet services are never missed.
 * @param {string} environment - Environment name (e.g. "hb-prod", "dg-pta")
 * @returns {string} Formatted list of application names or error message
 */
function toolListGCloudApplications(environment) {
  var projectId = resolveEnvironment(environment);
  if (!projectId) {
    return "Unknown environment: \"" + (environment || "") + "\". "
      + "Use one of: hb-prod, hb-it, dg-prod, dg-pta, hb-pta (or HB production, IT, DG production, DIGA PTA, HB PTA).";
  }

  var MAX_PAGES = 10;
  var PAGE_SIZE = 500;

  try {
    var range = monitoringTimeRange(1, null, null);
    var filter = 'metric.type="kubernetes.io/container/uptime"';
    var names = {};
    var pageToken = null;

    for (var page = 0; page < MAX_PAGES; page++) {
      var result = callMonitoringTimeSeries(projectId, filter, range.start, range.end, PAGE_SIZE, pageToken);
      var series = result.timeSeries || [];

      for (var i = 0; i < series.length; i++) {
        var labels = (series[i].resource && series[i].resource.labels) ? series[i].resource.labels : {};
        var containerName = labels.container_name || "";
        if (containerName) names[containerName] = true;
      }

      pageToken = result.nextPageToken;
      if (!pageToken) break;
    }

    var list = Object.keys(names).filter(function (n) { return n; }).sort();
    if (list.length === 0) {
      return "Environment \"" + environment + "\" (" + projectId + "): no applications found in recent container metrics.";
    }
    return "Environment: " + environment + " (" + projectId + ")\nApplications (" + list.length + "): " + list.join(", ");
  } catch (e) {
    console.error("gcloud_list_applications error: " + e.message);
    return "Failed to list applications: " + e.message;
  }
}

/**
 * Build timestamp filter for "last N hours".
 * @param {number} hoursAgo
 * @returns {string} ISO 8601 timestamp string
 */
function timestampSinceHoursAgo(hoursAgo) {
  var h = typeof hoursAgo === "number" && hoursAgo > 0 ? hoursAgo : 1;
  var ms = h * 60 * 60 * 1000;
  var d = new Date(Date.now() - ms);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Build severity filter. Cloud Logging: DEFAULT, DEBUG, INFO, NOTICE, WARNING, ERROR, CRITICAL.
 * @param {string} severity - Minimum severity (DEBUG, INFO, WARNING, ERROR, CRITICAL)
 * @returns {string} Filter fragment or empty
 */
function severityFilter(severity) {
  if (!severity || typeof severity !== "string") return "";
  var s = severity.toUpperCase();
  if (s === "ERROR" || s === "CRITICAL" || s === "WARNING" || s === "INFO" || s === "DEBUG") {
    return "severity>=" + s;
  }
  return "";
}

/**
 * Build timestamp filter: either absolute start/end or relative hours_ago.
 * @param {number} hoursAgo - How far back in hours (used when no startTime)
 * @param {string} startTime - Optional ISO 8601 start (e.g. 2025-02-15T20:00:00Z)
 * @param {string} endTime - Optional ISO 8601 end
 * @returns {string[]} Filter parts to add (timestamp>= and optionally timestamp<=)
 */
function buildTimestampFilterParts(hoursAgo, startTime, endTime) {
  if (startTime && typeof startTime === "string" && startTime.trim()) {
    var parts = ['timestamp>="' + startTime.trim() + '"'];
    if (endTime && typeof endTime === "string" && endTime.trim()) {
      parts.push('timestamp<="' + endTime.trim() + '"');
    }
    return parts;
  }
  var h = (typeof hoursAgo === "number" && hoursAgo > 0) ? hoursAgo : 1;
  return ['timestamp>="' + timestampSinceHoursAgo(h) + '"'];
}

/**
 * Read log entries for an application with optional filters.
 * @param {string} environment - Environment name
 * @param {string} application - Container/application name
 * @param {string} severity - Optional minimum severity (DEBUG, INFO, WARNING, ERROR, CRITICAL)
 * @param {string} searchText - Optional text to search in log messages
 * @param {number} hoursAgo - How far back in hours (default 1), ignored when startTime is set
 * @param {number} limit - Max entries (default 20, max 50)
 * @param {string} startTime - Optional ISO 8601 start (e.g. 2025-02-15T20:00:00Z). Use for specific date ranges.
 * @param {string} endTime - Optional ISO 8601 end. Pair with startTime.
 * @returns {string} Formatted log entries or error message
 */
function toolReadGCloudLogs(environment, application, severity, searchText, hoursAgo, limit, startTime, endTime) {
  var projectId = resolveEnvironment(environment);
  if (!projectId) {
    return "Unknown environment: \"" + (environment || "") + "\". "
      + "Use one of: hb-prod, hb-it, dg-prod, dg-pta, hb-pta.";
  }
  if (!application || !application.trim()) {
    return "Application name is required. Use gcloud_list_applications to discover application names for the environment.";
  }

  var app = application.trim();
  var hours = (typeof hoursAgo === "number" && hoursAgo > 0) ? hoursAgo : 1;
  var maxEntries = (typeof limit === "number" && limit > 0) ? Math.min(limit, 50) : 20;
  var timestampParts = buildTimestampFilterParts(hoursAgo, startTime, endTime);

  var parts = [
    'resource.type="k8s_container"',
    'resource.labels.container_name="' + app.replace(/"/g, '\\"') + '"'
  ].concat(timestampParts);
  var sev = severityFilter(severity);
  if (sev) parts.push(sev);
  if (searchText && searchText.trim()) {
    var term = searchText.trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    parts.push('(textPayload:"' + term + '" OR jsonPayload.message:"' + term + '")');
  }
  var filter = parts.join(" AND ");

  try {
    var result = callCloudLoggingApi(projectId, filter, maxEntries, "timestamp desc", null);
    var entries = result.entries || [];
    if (entries.length === 0) {
      var timeDesc = (startTime && startTime.trim()) ? "in the specified time range" : "in the last " + hours + " hour(s)";
      return "No log entries found for application \"" + app + "\" in " + environment + " " + timeDesc + ". "
        + "Try gcloud_list_applications to confirm the application name, or broaden the time range or filters.";
    }

    var lines = [];
    var timeLabel = (startTime && startTime.trim()) ? "time range " + (startTime.trim()) + (endTime && endTime.trim() ? " to " + endTime.trim() : "") : "last " + hours + "h";
    lines.push("Logs for \"" + app + "\" in " + environment + " (" + projectId + "), " + timeLabel + ", " + entries.length + " entries:");
    lines.push("");

    var i, e, ts, sevLabel, pod, logger, msg;
    for (i = 0; i < entries.length; i++) {
      e = entries[i];
      ts = (e.timestamp || "").replace(/\.\d+Z$/, "Z");
      sevLabel = (e.severity || "DEFAULT").toUpperCase();
      pod = (e.resource && e.resource.labels && e.resource.labels.pod_name) ? e.resource.labels.pod_name : "?";
      logger = (e.jsonPayload && e.jsonPayload.logger) ? e.jsonPayload.logger : "";
      msg = "";
      if (e.textPayload) {
        msg = e.textPayload;
      } else if (e.jsonPayload && e.jsonPayload.message) {
        msg = e.jsonPayload.message;
      }
      if (msg.length > MAX_MESSAGE_LENGTH) {
        msg = msg.substring(0, MAX_MESSAGE_LENGTH) + "... [truncated]";
      }
      lines.push("[" + ts + "] " + sevLabel + " " + app + " (pod: " + pod + ")");
      if (logger) lines.push("Logger: " + logger);
      lines.push("Message: " + (msg || "(empty)"));
      lines.push("---");
    }
    return lines.join("\n");
  } catch (err) {
    console.error("gcloud_read_logs error: " + err.message);
    return "Failed to read logs: " + err.message;
  }
}
