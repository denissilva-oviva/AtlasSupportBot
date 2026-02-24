/**
 * Kubernetes status tools via Cloud Logging API (no direct K8s API — clusters are private).
 * Pod lifecycle events, FluxCD deployment events, and pod discovery.
 * Uses resolveEnvironment, callCloudLoggingApi, and buildTimestampFilterParts from ToolGCloudLogs.js.
 */

/**
 * Query pod lifecycle events (Unhealthy, Killing, BackOff, OOMKilling, Failed, Scheduled, Started).
 * When application is empty: returns problematic events (Unhealthy, Killing, BackOff, OOMKilling, Failed) across ALL pods — use for discovery of which apps had issues.
 * @param {string} environment - Environment name (e.g. dg-prod)
 * @param {string} application - Optional. Container/application name (e.g. mailer-kim). Leave empty for discovery across all applications.
 * @param {string} startTime - Optional ISO 8601 start UTC
 * @param {string} endTime - Optional ISO 8601 end UTC
 * @param {number} hoursAgo - Optional hours back when no startTime (default 24)
 * @returns {string} Formatted events or error message
 */
function toolGetK8sPodEvents(environment, application, startTime, endTime, hoursAgo) {
  var projectId = resolveEnvironment(environment);
  if (!projectId) {
    return "Unknown environment: \"" + (environment || "") + "\". Use one of: hb-prod, hb-it, dg-prod, dg-pta, hb-pta.";
  }
  var hours = (typeof hoursAgo === "number" && hoursAgo > 0) ? hoursAgo : 24;
  var timestampParts = buildTimestampFilterParts(hours, startTime, endTime);
  var parts = ['resource.type="k8s_pod"', 'logName:"events"'];
  if (application && application.trim()) {
    var app = application.trim().replace(/"/g, '\\"');
    parts.push('resource.labels.pod_name=~"' + app + '"');
  } else {
    parts.push('(jsonPayload.reason="Unhealthy" OR jsonPayload.reason="Killing" OR jsonPayload.reason="BackOff" OR jsonPayload.reason="OOMKilling" OR jsonPayload.reason="Failed")');
  }
  parts = parts.concat(timestampParts);
  var filter = parts.join(" AND ");
  var pageSize = (application && application.trim()) ? 50 : 100;

  try {
    var result = callCloudLoggingApi(projectId, filter, pageSize, "timestamp asc", null);
    var entries = result.entries || [];
    if (entries.length === 0) {
      return (application && application.trim())
        ? "No pod events found for \"" + application.trim() + "\" in " + environment + " in the specified time range. Try broadening the window or check the application name."
        : "No problematic pod events (Unhealthy/Killing/BackOff/OOMKilling/Failed) found in " + environment + " in the specified time range.";
    }
    var lines = [];
    lines.push((application && application.trim())
      ? "Pod events for \"" + application.trim() + "\" in " + environment + " (" + entries.length + " entries):"
      : "Problematic pod events (all applications) in " + environment + " (" + entries.length + " entries) — use pod name prefix to infer application:");
    lines.push("");
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var ts = (e.timestamp || "").replace(/\.\d+Z$/, "Z");
      var payload = e.jsonPayload || {};
      var reason = payload.reason || "?";
      var podName = (e.resource && e.resource.labels && e.resource.labels.pod_name) ? e.resource.labels.pod_name : (payload.involvedObject && payload.involvedObject.name) || "?";
      var msg = payload.message || "";
      if (msg.length > 500) msg = msg.substring(0, 497) + "...";
      lines.push(ts + "  " + reason + "  " + podName + "  " + msg);
    }
    return lines.join("\n");
  } catch (err) {
    console.error("k8s_get_pod_events error: " + err.message);
    return "Failed to get pod events: " + err.message;
  }
}

/**
 * Query FluxCD Helm deployment events (UpgradeSucceeded, InstallFailed, HelmChartConfigured).
 * @param {string} environment - Environment name
 * @param {string} application - Optional app/release name to filter (e.g. mailer-kim)
 * @param {string} startTime - Optional ISO 8601 start UTC
 * @param {string} endTime - Optional ISO 8601 end UTC
 * @param {number} hoursAgo - Optional hours back when no startTime (default 168 = 7 days)
 * @returns {string} Formatted deployment events or error message
 */
function toolGetK8sDeploymentEvents(environment, application, startTime, endTime, hoursAgo) {
  var projectId = resolveEnvironment(environment);
  if (!projectId) {
    return "Unknown environment: \"" + (environment || "") + "\". Use one of: hb-prod, hb-it, dg-prod, dg-pta, hb-pta.";
  }
  var hours = (typeof hoursAgo === "number" && hoursAgo > 0) ? hoursAgo : 168;
  var timestampParts = buildTimestampFilterParts(hours, startTime, endTime);
  var parts = [
    'resource.type="k8s_cluster"',
    'logName:"events"',
    'jsonPayload.reportingComponent="helm-controller"'
  ].concat(timestampParts);
  if (application && application.trim()) {
    var app = application.trim().replace(/"/g, '\\"').replace(/\[/g, "\\[");
    parts.push('jsonPayload.involvedObject.name=~"' + app + '"');
  }
  var filter = parts.join(" AND ");

  try {
    var result = callCloudLoggingApi(projectId, filter, 50, "timestamp asc", null);
    var entries = result.entries || [];
    if (entries.length === 0) {
      return "No FluxCD deployment events found for " + environment + (application && application.trim() ? " matching \"" + application.trim() + "\"" : "") + " in the specified time range.";
    }
    var lines = [];
    lines.push("Deployment events (FluxCD Helm) in " + environment + " (" + entries.length + " entries):");
    lines.push("");
    for (var j = 0; j < entries.length; j++) {
      var e = entries[j];
      var ts = (e.timestamp || "").replace(/\.\d+Z$/, "Z");
      var payload = e.jsonPayload || {};
      var reason = payload.reason || "?";
      var name = (payload.involvedObject && payload.involvedObject.name) ? payload.involvedObject.name : "?";
      var msg = payload.message || "";
      if (msg.length > 400) msg = msg.substring(0, 397) + "...";
      lines.push(ts + "  " + reason + "  " + name + "  " + msg);
    }
    return lines.join("\n");
  } catch (err) {
    console.error("k8s_get_deployment_events error: " + err.message);
    return "Failed to get deployment events: " + err.message;
  }
}

/**
 * Discover current pod names and namespaces for an application from recent container logs.
 * @param {string} environment - Environment name
 * @param {string} application - Container/application name
 * @returns {string} Formatted list of pods (name, namespace, cluster) or error message
 */
function toolDiscoverK8sPods(environment, application) {
  var projectId = resolveEnvironment(environment);
  if (!projectId) {
    return "Unknown environment: \"" + (environment || "") + "\". Use one of: hb-prod, hb-it, dg-prod, dg-pta, hb-pta.";
  }
  if (!application || !application.trim()) {
    return "Application name is required (e.g. mailer-kim).";
  }
  var app = application.trim().replace(/"/g, '\\"');
  var filter = 'resource.type="k8s_container" AND resource.labels.container_name="' + app + '"';

  try {
    var result = callCloudLoggingApi(projectId, filter, 100, "timestamp desc", null);
    var entries = result.entries || [];
    var seen = {};
    var list = [];
    for (var i = 0; i < entries.length; i++) {
      var r = entries[i].resource || {};
      var labels = r.labels || {};
      var podName = labels.pod_name || "";
      var ns = labels.namespace_name || "";
      var cluster = labels.cluster_name || "";
      if (podName && !seen[podName]) {
        seen[podName] = true;
        list.push({ pod: podName, namespace: ns, cluster: cluster });
      }
    }
    if (list.length === 0) {
      return "No pods found for application \"" + application.trim() + "\" in " + environment + " in recent logs. Check the application name with gcloud_list_applications.";
    }
    var lines = [];
    lines.push("Pods for \"" + application.trim() + "\" in " + environment + " (" + projectId + "):");
    lines.push("");
    for (var k = 0; k < list.length; k++) {
      lines.push(list[k].pod + "  namespace: " + list[k].namespace + "  cluster: " + list[k].cluster);
    }
    return lines.join("\n");
  } catch (err) {
    console.error("k8s_discover_pods error: " + err.message);
    return "Failed to discover pods: " + err.message;
  }
}
