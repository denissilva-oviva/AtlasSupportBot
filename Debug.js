/**
 * Debug logging helpers for tracing bot behavior.
 * Use firstNWords / resultPreview to avoid logging full LLM or tool payloads.
 */

var DEBUG_LOG_PREFIX = "[DEBUG]";

/**
 * Returns the first n words of a string, or the whole string if shorter.
 * @param {string} str - Text (may be null/undefined).
 * @param {number} n - Max number of words.
 * @returns {string}
 */
function firstNWords(str, n) {
  if (str == null || str === "") return "";
  var s = (typeof str === "string") ? str : String(str);
  var words = s.trim().split(/\s+/).filter(function (w) { return w.length > 0; });
  if (words.length <= n) return s.trim();
  return words.slice(0, n).join(" ") + " ...";
}

/**
 * Preview for tool results: first n words (for debug logs).
 * @param {string} str - Tool result text.
 * @param {number} n - Max words (default 15).
 * @returns {string}
 */
function resultPreview(str, n) {
  n = n == null ? 15 : n;
  return firstNWords(str, n);
}

/**
 * Log a single debug line. Format: [DEBUG] tag: message (optional detail).
 * @param {string} tag - Category (e.g. llm_request, agent_router, tool_result).
 * @param {string} message - Short message.
 * @param {string} [detail] - Optional detail (e.g. preview text).
 */
function debugLog(tag, message, detail) {
  var line = DEBUG_LOG_PREFIX + " " + tag + ": " + message;
  if (detail != null && detail !== "") line += " | " + detail;
  console.log(line);
}
