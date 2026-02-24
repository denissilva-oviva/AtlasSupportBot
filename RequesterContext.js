/**
 * Requester context: department and team from bob_employee (BigQuery).
 * Lookup strategy: check cache first; if reporter not found, query BigQuery and store in cache.
 *
 * Requires BigQuery Advanced Service to be enabled (Resources > Advanced Google Services).
 * Set BQ_PROJECT_ID in Script Properties if different from data-warehouse-prod-308513.
 */

var BOB_EMPLOYEE_CACHE_PREFIX = "bob_";
var BQ_PROJECT_ID = "data-warehouse-prod-308513";
var BQ_TABLE = "mart_global_all_employees.bob_employee";

/**
 * Returns requester context for the given email: department, team, and personaLabel.
 * Persona: TechOps (team === "TechOps"), Engineering (department === "Engineering"), else Other.
 * On cache miss, queries BigQuery and caches the result.
 *
 * @param {string} senderEmail - Requester email address
 * @returns {{ department: string|null, team: string|null, personaLabel: string, firstName: string|null }}
 */
function getRequesterContext(senderEmail) {
  var email = (senderEmail || "").trim().toLowerCase();
  if (!email) {
    return { department: null, team: null, personaLabel: "Other", firstName: null };
  }

  var cached = getCachedRequester(email);
  if (cached) {
    return cached;
  }

  var row = queryBigQueryForEmail(email);
  if (row) {
    setCachedRequester(email, row.firstName, row.department, row.team);
    return {
      department: row.department,
      team: row.team,
      personaLabel: getPersonaLabel(row.department, row.team),
      firstName: row.firstName || null
    };
  }

  return { department: null, team: null, personaLabel: "Other", firstName: null };
}

function getPersonaLabel(department, team) {
  if (team === "TechOps") return "TechOps";
  if (department === "Engineering") return "Engineering";
  return "Other";
}

/**
 * One-line persona hint for SearchAgent (round 0 only). Used to prioritize research.
 * @param {{ personaLabel: string }|null} ctx - Result of getRequesterContext
 * @returns {string} Short prefix to prepend to the research question, or empty string
 */
function buildSearchPersonaHint(ctx) {
  if (!ctx || !ctx.personaLabel) return "";
  if (ctx.personaLabel === "TechOps") return "Requester: TechOps (1st level support; FD ticket context). ";
  if (ctx.personaLabel === "Engineering") return "Requester: Engineering; focus on existing Jira/Confluence and reproduction context. ";
  return "Requester: Other department; gather triage info and FD link if missing. ";
}

function getCacheKey(email) {
  return BOB_EMPLOYEE_CACHE_PREFIX + email;
}

function getCachedRequester(email) {
  try {
    var props = PropertiesService.getScriptProperties();
    var key = getCacheKey(email);
    var value = props.getProperty(key);
    if (!value) return null;
    var parts = value.split("|");
    var firstName = null;
    var department = null;
    var team = null;
    if (parts.length >= 3) {
      firstName = parts[0] || null;
      department = parts[1] || null;
      team = parts[2] || null;
    } else {
      department = parts[0] || null;
      team = parts[1] || null;
    }
    if (department === "" && team === "") return null;
    return {
      department: department || null,
      team: team || null,
      personaLabel: getPersonaLabel(department, team),
      firstName: firstName || null
    };
  } catch (e) {
    console.warn("RequesterContext cache read error: " + e.message);
    return null;
  }
}

function setCachedRequester(email, firstName, department, team) {
  try {
    var value = (firstName || "") + "|" + (department || "") + "|" + (team || "");
    if (value.length > 500) return; // Script Properties value limit
    PropertiesService.getScriptProperties().setProperty(getCacheKey(email), value);
  } catch (e) {
    console.warn("RequesterContext cache write error: " + e.message);
  }
}

/**
 * Query BigQuery for a single row by email.
 * @param {string} email - Lowercase email
 * @returns {{ firstName: string, department: string, team: string }|null}
 */
function queryBigQueryForEmail(email) {
  try {
    if (typeof BigQuery === "undefined") {
      console.warn("BigQuery Advanced Service not enabled; requester context will be Other.");
      return null;
    }
    var projectId = getProps().getProperty("BQ_PROJECT_ID") || BQ_PROJECT_ID;
    var escaped = (email || "").replace(/\\/g, "\\\\").replace(/'/g, "''");
    var query = "SELECT first_name, department, team FROM `" + projectId + "." + BQ_TABLE + "` WHERE LOWER(TRIM(email)) = '" + escaped + "' LIMIT 1";
    var result = BigQuery.Jobs.query({ query: query, useLegacySql: false }, projectId);
    var rows = result.rows;
    if (result.jobComplete && rows && rows.length > 0) {
      var f = rows[0].f;
      return {
        firstName: (f[0] && f[0].v) ? String(f[0].v) : "",
        department: (f[1] && f[1].v) ? String(f[1].v) : "",
        team: (f[2] && f[2].v) ? String(f[2].v) : ""
      };
    }
    return null;
  } catch (e) {
    console.warn("BigQuery requester lookup error: " + e.message);
  }
  return null;
}
