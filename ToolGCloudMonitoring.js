/**
 * Cloud Monitoring tools: container restart count and resource usage (CPU, memory, uptime).
 * Uses Monitoring API v3 timeSeries list. Requires cloud-platform.read-only or monitoring.read scope.
 */

var MONITORING_TIMESERIES_URL = "https://monitoring.googleapis.com/v3/projects";

/**
 * Build start and end time for Monitoring API (ISO 8601).
 * @param {number} hoursAgo - Hours back when no startTime
 * @param {string} startTime - Optional ISO 8601 start
 * @param {string} endTime - Optional ISO 8601 end
 * @returns {{ start: string, end: string }}
 */
function monitoringTimeRange(hoursAgo, startTime, endTime) {
  var now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  if (startTime && typeof startTime === "string" && startTime.trim()) {
    return {
      start: startTime.trim(),
      end: (endTime && typeof endTime === "string" && endTime.trim()) ? endTime.trim() : now
    };
  }
  var h = (typeof hoursAgo === "number" && hoursAgo > 0) ? hoursAgo : 24;
  var start = new Date(Date.now() - h * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  return { start: start, end: now };
}

/**
 * Call Monitoring API v3 projects.timeSeries.list.
 * @param {string} projectId - GCP project ID
 * @param {string} filter - Monitoring filter (e.g. metric.type="..." AND resource.labels.container_name="...")
 * @param {string} startTime - ISO 8601
 * @param {string} endTime - ISO 8601
 * @param {number} pageSize - Max series to return
 * @returns {{ timeSeries: Array }}
 */
function callMonitoringTimeSeries(projectId, filter, startTime, endTime, pageSize, pageToken) {
  pageSize = pageSize || 20;
  var url = MONITORING_TIMESERIES_URL + "/" + projectId + "/timeSeries"
    + "?filter=" + encodeURIComponent(filter)
    + "&interval.startTime=" + encodeURIComponent(startTime)
    + "&interval.endTime=" + encodeURIComponent(endTime)
    + "&pageSize=" + Math.min(Math.max(1, pageSize), 1000);
  if (pageToken) url += "&pageToken=" + encodeURIComponent(pageToken);

  var token = ScriptApp.getOAuthToken();
  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { "Authorization": "Bearer " + token },
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var body = {};
  try {
    body = JSON.parse(res.getContentText());
  } catch (e) {}

  if (code !== 200) {
    var msg = (body.error && body.error.message) ? body.error.message : res.getContentText();
    throw new Error("Cloud Monitoring API error " + code + ": " + msg);
  }

  return { timeSeries: body.timeSeries || [], nextPageToken: body.nextPageToken || null };
}

/**
 * Query container restart_count metric.
 * @param {string} environment - Environment name
 * @param {string} application - Container name (e.g. mailer-kim)
 * @param {string} startTime - Optional ISO 8601 start UTC
 * @param {string} endTime - Optional ISO 8601 end UTC
 * @param {number} hoursAgo - Optional hours back when no startTime (default 24)
 * @returns {string} Formatted restart counts per pod or error message
 */
function toolGetRestartCount(environment, application, startTime, endTime, hoursAgo) {
  var projectId = resolveEnvironment(environment);
  if (!projectId) {
    return "Unknown environment: \"" + (environment || "") + "\". Use one of: hb-prod, hb-it, dg-prod, dg-pta, hb-pta.";
  }
  if (!application || !application.trim()) {
    return "Application (container) name is required (e.g. mailer-kim).";
  }
  var app = application.trim().replace(/"/g, '\\"');
  var range = monitoringTimeRange(hoursAgo || 24, startTime, endTime);
  var filter = 'metric.type="kubernetes.io/container/restart_count" AND resource.labels.container_name="' + app + '"';

  try {
    var result = callMonitoringTimeSeries(projectId, filter, range.start, range.end, 30);
    var series = result.timeSeries || [];
    if (series.length === 0) {
      return "No restart_count data for \"" + application.trim() + "\" in " + environment + " in the specified time range.";
    }
    var lines = [];
    lines.push("Restart count for \"" + application.trim() + "\" in " + environment + " (" + range.start + " to " + range.end + "):");
    lines.push("");
    for (var i = 0; i < series.length; i++) {
      var ts = series[i];
      var pod = (ts.resource && ts.resource.labels && ts.resource.labels.pod_name) ? ts.resource.labels.pod_name : "?";
      var points = ts.points || [];
      var value = points.length > 0 && points[0].value && points[0].value.int64Value !== undefined
        ? parseInt(points[0].value.int64Value, 10) : "?";
      lines.push(pod + ": restart_count=" + value);
    }
    return lines.join("\n");
  } catch (err) {
    console.error("monitoring_restart_count error: " + err.message);
    return "Failed to get restart count: " + err.message;
  }
}

/**
 * Query container memory, CPU, or uptime metric.
 * @param {string} environment - Environment name
 * @param {string} application - Container name
 * @param {string} metricType - One of: memory, cpu, uptime
 * @param {string} startTime - Optional ISO 8601 start UTC
 * @param {string} endTime - Optional ISO 8601 end UTC
 * @param {number} hoursAgo - Optional hours back when no startTime (default 24)
 * @returns {string} Formatted metric values per pod or error message
 */
function toolGetResourceUsage(environment, application, metricType, startTime, endTime, hoursAgo) {
  var projectId = resolveEnvironment(environment);
  if (!projectId) {
    return "Unknown environment: \"" + (environment || "") + "\". Use one of: hb-prod, hb-it, dg-prod, dg-pta, hb-pta.";
  }
  if (!application || !application.trim()) {
    return "Application (container) name is required (e.g. mailer-kim).";
  }
  var typeMap = {
    "memory": "kubernetes.io/container/memory/used_bytes",
    "cpu": "kubernetes.io/container/cpu/usage_time",
    "uptime": "kubernetes.io/container/uptime"
  };
  var mt = (metricType || "").toLowerCase();
  var metricTypeFull = typeMap[mt] || typeMap.memory;
  var app = application.trim().replace(/"/g, '\\"');
  var range = monitoringTimeRange(hoursAgo || 24, startTime, endTime);
  var filter = 'metric.type="' + metricTypeFull + '" AND resource.labels.container_name="' + app + '"';

  try {
    var result = callMonitoringTimeSeries(projectId, filter, range.start, range.end, 30);
    var series = result.timeSeries || [];
    if (series.length === 0) {
      return "No " + (mt || "memory") + " data for \"" + application.trim() + "\" in " + environment + " in the specified time range.";
    }
    var lines = [];
    lines.push((mt || "memory") + " for \"" + application.trim() + "\" in " + environment + " (" + range.start + " to " + range.end + "):");
    lines.push("");
    for (var j = 0; j < series.length; j++) {
      var ts = series[j];
      var pod = (ts.resource && ts.resource.labels && ts.resource.labels.pod_name) ? ts.resource.labels.pod_name : "?";
      var points = ts.points || [];
      var raw = points.length > 0 && points[0].value ? points[0].value.int64Value || points[0].value.doubleValue : null;
      var valueStr = "?";
      if (raw !== null && raw !== undefined) {
        if (mt === "memory") {
          var mb = (parseInt(raw, 10) / (1024 * 1024)).toFixed(2);
          valueStr = raw + " bytes (~" + mb + " MB)";
        } else if (mt === "cpu") {
          valueStr = raw + " seconds (cumulative)";
        } else {
          valueStr = raw + " seconds";
        }
      }
      lines.push(pod + ": " + valueStr);
    }
    return lines.join("\n");
  } catch (err) {
    console.error("monitoring_resource_usage error: " + err.message);
    return "Failed to get resource usage: " + err.message;
  }
}

/**
 * List restart_count for all containers in an environment (discovery). Use when you need to find which containers have been restarting without specifying an application.
 * @param {string} environment - Environment name
 * @param {string} startTime - Optional ISO 8601 start UTC
 * @param {string} endTime - Optional ISO 8601 end UTC
 * @param {number} hoursAgo - Optional hours back when no startTime (default 24)
 * @returns {string} Formatted list of container | pod | restart_count, sorted by count descending (restarters first)
 */
function toolGetRestartCountAll(environment, startTime, endTime, hoursAgo) {
  var projectId = resolveEnvironment(environment);
  if (!projectId) {
    return "Unknown environment: \"" + (environment || "") + "\". Use one of: hb-prod, hb-it, dg-prod, dg-pta, hb-pta.";
  }
  var range = monitoringTimeRange(hoursAgo || 24, startTime, endTime);
  var filter = 'metric.type="kubernetes.io/container/restart_count"';

  try {
    var result = callMonitoringTimeSeries(projectId, filter, range.start, range.end, 100);
    var series = result.timeSeries || [];
    if (series.length === 0) {
      return "No restart_count data in " + environment + " in the specified time range.";
    }
    var rows = [];
    for (var i = 0; i < series.length; i++) {
      var ts = series[i];
      var container = (ts.resource && ts.resource.labels && ts.resource.labels.container_name) ? ts.resource.labels.container_name : "?";
      var pod = (ts.resource && ts.resource.labels && ts.resource.labels.pod_name) ? ts.resource.labels.pod_name : "?";
      var points = ts.points || [];
      var value = points.length > 0 && points[0].value && points[0].value.int64Value !== undefined
        ? parseInt(points[0].value.int64Value, 10) : 0;
      rows.push({ container: container, pod: pod, count: value });
    }
    rows.sort(function (a, b) { return (b.count - a.count); });
    var lines = [];
    lines.push("Restart count (all containers) in " + environment + " (" + range.start + " to " + range.end + "). Sorted by count descending (restarters first):");
    lines.push("");
    lines.push("container_name | pod_name | restart_count");
    lines.push("---");
    for (var j = 0; j < rows.length; j++) {
      lines.push(rows[j].container + " | " + rows[j].pod + " | " + rows[j].count);
    }
    return lines.join("\n");
  } catch (err) {
    console.error("monitoring_restart_count_all error: " + err.message);
    return "Failed to get restart counts: " + err.message;
  }
}
