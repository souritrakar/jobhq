// Service worker — event-driven, no persistent state in globals (it terminates when idle).
// Acts as the message router + API client. Jobs and extraction both live in the JobTracker
// backend (Neon/Postgres via the web app's /api/*), NOT in chrome.storage.local and no
// longer via a provider key shipped in the extension.
//
// Dev seam: the API resolves the user from the `x-user-id` header, and falls back to
// the seeded DEV_USER_ID when it's absent (see webapp/lib/auth/current-user.ts). We
// don't send a header here, so the backend uses DEV_USER_ID. Swap in a real token
// once auth lands. Requires the dev server running at API_BASE and the matching
// host_permissions entry in manifest.json.

const API_BASE = "http://localhost:3100";

// Worker-side trace. Lands in the SERVICE WORKER console
// (chrome://extensions → JobTracker → "service worker"), NOT the page console.
const DEBUG = true;
function dlog(...a) {
  if (DEBUG) console.log("[JobTracker:bg]", ...a);
}

// Local reminder delivery (chrome.alarms + chrome.notifications). Loaded into THIS service-worker
// scope so it can reuse apiFetch + API_BASE above. Defines self.syncReminderAlarms /
// self.handleReminderAlarm / self.REM_PREFIX / self.SYNC_ALARM.
importScripts("lib/reminder-alarms.js");

// ---- form-sync cross-frame relay ----------------------------------------------------------
// content scripts can't message each other directly, so the top-frame aggregator and each
// sub-frame agent talk THROUGH here. We add sender.frameId / sender.tab.id (a content script
// can't know its own tab id) and forward within the SAME tab. Fire-and-forget; lastError is
// swallowed (a frame may have torn down between send and deliver). See ui/frame-bridge.js.
function relayFormSync(msg, sender) {
  const tabId = sender && sender.tab && sender.tab.id;
  if (tabId == null) return;
  const swallow = () => void chrome.runtime.lastError;
  if (msg.type === "FS_UP") {
    // sub-frame → top frame (frame 0), stamped with the origin frame id
    chrome.tabs.sendMessage(
      tabId,
      { type: "FS_DOWN", fromFrameId: sender.frameId, payload: msg.payload },
      { frameId: 0 },
      swallow,
    );
  } else if (msg.type === "FS_TO_FRAME") {
    // top frame → one specific sub-frame
    chrome.tabs.sendMessage(tabId, { type: "FS_CMD", payload: msg.payload }, { frameId: msg.frameId }, swallow);
  } else if (msg.type === "FS_BROADCAST") {
    // top frame → every frame in the tab (only sub-frame agents listen for FS_CMD)
    chrome.tabs.sendMessage(tabId, { type: "FS_CMD", payload: msg.payload }, swallow);
  }
}

// Central message handler. Return true to keep the channel open for async sendResponse.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "FS_UP" || msg?.type === "FS_TO_FRAME" || msg?.type === "FS_BROADCAST") {
    relayFormSync(msg, sender);
    return false; // synchronous fire-and-forget relay
  }
  if (msg?.type === "EXTRACT_JOB") {
    extractJob(msg.context || {})
      .then((r) => sendResponse({ ok: true, fields: r.fields, description: r.description }))
      .catch((err) => sendResponse({ ok: false, error: String(err), fields: {} }));
    return true;
  }
  // Semantic RAG extraction — parse HTML → embed chunks → retrieve → synthesize with Groq
  if (msg?.type === "EXTRACT_JOB_SEMANTIC") {
    extractJobSemantic(msg.context || {})
      .then((r) =>
        sendResponse({
          ok: true,
          fields: r.fields,
          description: r.description,
          usage: r.usage,
          metadata: r.metadata,
        }),
      )
      .catch((err) => sendResponse({ ok: false, error: String(err), fields: {} }));
    return true;
  }
  if (msg?.type === "EXTRACT_APPLICATION") {
    extractApplication(msg.context || {})
      .then((r) => sendResponse({ ok: true, questions: r.questions }))
      .catch((err) => sendResponse({ ok: false, error: String(err), questions: [] }));
    return true;
  }
  // Tiered (non-LLM) extraction — the structured-data + embeddings alternative. Same response shapes
  // as EXTRACT_JOB / EXTRACT_APPLICATION so the content script can swap which one it calls.
  if (msg?.type === "EXTRACT_JOB_TIERED") {
    extractJobTiered(msg.context || {})
      .then((r) => sendResponse({ ok: true, fields: r.fields, description: r.description }))
      .catch((err) => sendResponse({ ok: false, error: String(err), fields: {} }));
    return true;
  }
  if (msg?.type === "EXTRACT_APPLICATION_TIERED") {
    extractApplicationTiered(msg.context || {})
      .then((r) => sendResponse({ ok: true, questions: r.questions }))
      .catch((err) => sendResponse({ ok: false, error: String(err), questions: [] }));
    return true;
  }
  // INDEXED (block-addressed) extraction — the default pipeline. The content script sends the
  // page as numbered blocks + harvested fields; the backend model points at content and the
  // values resolve deterministically (see docs/superpowers/specs/2026-07-01-indexed-extraction-design.md).
  if (msg?.type === "EXTRACT_JOB_INDEXED") {
    extractJobIndexed(msg.context || {})
      .then((r) =>
        sendResponse({
          ok: true,
          fields: r.fields,
          description: r.description,
          usage: r.usage,
          detected: r.detected,
        }),
      )
      .catch((err) => sendResponse({ ok: false, error: String(err), fields: {} }));
    return true;
  }
  if (msg?.type === "EXTRACT_APPLICATION_INDEXED") {
    extractApplicationIndexed(msg.context || {})
      .then((r) => sendResponse({ ok: true, questions: r.questions, detected: r.detected }))
      .catch((err) => sendResponse({ ok: false, error: String(err), questions: [] }));
    return true;
  }
  if (msg?.type === "SAVE_JOB") {
    saveJob(msg.job)
      .then((saved) => sendResponse({ ok: true, job: saved }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  // Update tracking fields of an already-saved job (currently the panel's status picker). Maps to
  // PATCH /api/jobs/:id, the same endpoint the web app's StatusMenu uses.
  if (msg?.type === "PATCH_JOB") {
    patchJob(msg.id, msg.patch || {})
      .then((job) => sendResponse({ ok: true, job }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  // The user's saved documents (resume/CV list in the panel's Resume tab).
  if (msg?.type === "LIST_DOCUMENTS") {
    apiFetch("/api/documents")
      .then((docs) => sendResponse({ ok: true, documents: Array.isArray(docs) ? docs : [] }))
      .catch((err) => sendResponse({ ok: false, error: String(err), documents: [] }));
    return true;
  }
  // A document's raw bytes (base64) so the panel can build a File to drag onto a page upload field
  // or to download. Bytes only — the caller pairs them with the fileName/mimeType it already holds.
  if (msg?.type === "FETCH_DOCUMENT") {
    fetchDocumentBytes(msg.id)
      .then((base64) => sendResponse({ ok: true, base64 }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg?.type === "GET_JOBS") {
    getJobs()
      .then((jobs) => sendResponse({ ok: true, jobs }))
      .catch((err) => sendResponse({ ok: false, error: String(err), jobs: [] }));
    return true;
  }
  if (msg?.type === "GET_JOB") {
    getJobById(msg.id)
      .then((job) => sendResponse({ ok: true, job }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg?.type === "DELETE_JOB") {
    deleteJob(msg.id)
      .then((jobs) => sendResponse({ ok: true, jobs }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg?.type === "AUTOFILL_MATCH") {
    autofillMatch(msg.jobId, msg.fields)
      .then((plan) => sendResponse({ ok: true, plan }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg?.type === "SAVE_APPLICATION_ANSWERS") {
    saveApplicationAnswers(msg.jobId, msg.answers)
      .then((answers) => sendResponse({ ok: true, answers }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg?.type === "LIST_JOB_REMINDERS") {
    listJobReminders(msg.jobId)
      .then((reminders) => sendResponse({ ok: true, reminders }))
      .catch((err) => sendResponse({ ok: false, error: String(err), reminders: [] }));
    return true;
  }
  if (msg?.type === "CREATE_REMINDER") {
    createReminder(msg.jobId, msg.fields)
      .then((reminder) => sendResponse({ ok: true, reminder }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg?.type === "TOGGLE_REMINDER") {
    toggleReminder(msg.id, msg.done)
      .then((reminder) => sendResponse({ ok: true, reminder }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg?.type === "UPDATE_REMINDER") {
    // Generic PATCH used by the drawer's save-time todo reconcile (done and/or due changes).
    updateReminderApi(msg.id, msg.fields || {})
      .then((reminder) => sendResponse({ ok: true, reminder }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg?.type === "DELETE_REMINDER") {
    deleteReminderApi(msg.id)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg?.type === "SYNC_REMINDER_ALARMS") {
    // Fire-and-forget: re-register local alarms after an extension-side reminder mutation.
    (typeof syncReminderAlarms === "function" ? syncReminderAlarms() : Promise.resolve())
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  return false;
});

// Ask the backend to LLM-extract the structured fields + cleaned description from the
// captured page text (one Groq call, key server-side; token usage logged per call).
// Returns { fields, description? } — description is the model's cleaned version when it
// produced one. Errors propagate to the content script, which lets the user fill the
// fields by hand.
async function extractJob({ text, source, url } = {}) {
  if (!text || !text.trim()) {
    dlog("extract: SKIPPED — empty page text");
    return { fields: {} };
  }
  // Groq has payload size limits (~100KB for request body). Truncate to ~50KB of text
  // to stay well under the limit with JSON overhead.
  const MAX_TEXT_CHARS = 50000;
  const truncated = text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;
  dlog("extract: POST /api/extract | source:", source, "| context chars:", truncated.length, truncated.length < text.length ? `(truncated from ${text.length})` : "");
  const result = await apiFetch("/api/extract", {
    method: "POST",
    body: JSON.stringify({ text: truncated, source, url }),
  });
  const fields = (result && result.fields) || {};
  dlog("extract: got fields", fields, "| usage", result && result.usage);
  return { fields, description: result && result.description, usage: result && result.usage };
}

// Semantic RAG extraction: parse HTML → embed chunks → retrieve → synthesize
// Uses Unstructured.io for HTML parsing and OpenRouter for embeddings + Groq for synthesis.
// No 413 errors because only relevant chunks are sent to Groq (~1K tokens instead of 3.5K).
// Returns { fields, description, usage, metadata } with detailed extraction info.
async function extractJobSemantic({ text, source, url } = {}) {
  if (!text || !text.trim()) {
    dlog("extract-semantic: SKIPPED — empty page text");
    return { fields: {} };
  }

  dlog("extract-semantic: POST /api/extract/semantic | source:", source, "| text chars:", text.length);

  try {
    const result = await apiFetch("/api/extract/semantic", {
      method: "POST",
      body: JSON.stringify({ text, source, url }),
    });

    const fields = (result && result.fields) || {};
    const usage = (result && result.usage) || { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
    const metadata = result && result.metadata;

    dlog(
      "extract-semantic: SUCCESS | fields:",
      Object.keys(fields).filter((k) => fields[k]).join(","),
      "| groq tokens:",
      usage.inputTokens + usage.outputTokens,
      "| chunks used/total:",
      `${metadata?.chunksUsed}/${metadata?.totalChunks}`,
      "| ctx tokens:",
      metadata?.contextTokens,
      "| cache:",
      metadata?.cacheHit,
    );

    return {
      fields,
      description: result && result.description,
      usage,
      metadata,
    };
  } catch (err) {
    dlog("extract-semantic: ERROR", String(err));
    throw err;
  }
}

// Ask the backend to LLM-extract the application form's questions from the captured page
// text (one Groq call, key server-side). Returns { questions } — a typed array the content
// script's modal renders dynamically. Errors propagate so the modal can offer a retry.
async function extractApplication({ text, source, url } = {}) {
  if (!text || !text.trim()) {
    dlog("extract-application: SKIPPED — empty page text");
    return { questions: [] };
  }
  dlog("extract-application: POST /api/extract-application | source:", source, "| chars:", text.length);
  const result = await apiFetch("/api/extract-application", {
    method: "POST",
    body: JSON.stringify({ text, source, url }),
  });
  const questions = (result && result.questions) || [];
  dlog("extract-application: got", questions.length, "questions | usage", result && result.usage);
  return { questions };
}

// TIERED (non-LLM) details extraction: send the page's structured signals (JSON-LD, meta, key/value
// segments, h1) instead of raw markdown. The backend parses them deterministically and embeds only the
// leftovers — no Groq call. Returns the same { fields, description } shape as extractJob().
async function extractJobTiered({ signals, source, url } = {}) {
  if (!signals) {
    dlog("extract-tiered: SKIPPED — no signals");
    return { fields: {} };
  }
  dlog("extract-tiered: POST /api/extract/tiered | source:", source, "| jsonLd:", (signals.jsonLd || []).length, "| segments:", (signals.segments || []).length);
  const result = await apiFetch("/api/extract/tiered", {
    method: "POST",
    body: JSON.stringify({ signals, source, url }),
  });
  const fields = (result && result.fields) || {};
  dlog("extract-tiered: got fields", fields, "| usage", result && result.usage);
  return { fields, description: result && result.description };
}

// TIERED (non-LLM) application-question extraction: send the harvested form controls (label + kind +
// native input type + options + required). The backend maps them to typed questions and runs an
// embeddings inclusion gate — no Groq call. Returns the same { questions } shape as extractApplication().
async function extractApplicationTiered({ fields, source, url } = {}) {
  const list = Array.isArray(fields) ? fields : [];
  dlog("extract-application-tiered: POST /api/extract-application/tiered | source:", source, "| fields:", list.length);
  const result = await apiFetch("/api/extract-application/tiered", {
    method: "POST",
    body: JSON.stringify({ fields: list, source, url }),
  });
  const questions = (result && result.questions) || [];
  dlog("extract-application-tiered: got", questions.length, "questions | usage", result && result.usage);
  return { questions };
}

// INDEXED details extraction: send the numbered blocks + harvested fields. The backend model
// answers with pointers (description block range) + small values; resolution is deterministic.
async function extractJobIndexed({ blocks, fields, titleHint, source, url } = {}) {
  const list = Array.isArray(blocks) ? blocks : [];
  if (!list.length) {
    dlog("extract-indexed: SKIPPED — no blocks");
    return { fields: {} };
  }
  dlog("extract-indexed: POST /api/extract/indexed | source:", source, "| blocks:", list.length, "| fields:", (fields || []).length);
  const result = await apiFetch("/api/extract/indexed", {
    method: "POST",
    body: JSON.stringify({ blocks: list, fields: fields || [], titleHint, source, url }),
  });
  dlog("extract-indexed: got fields", result && result.fields, "| detected", result && result.detected, "| usage", result && result.usage);
  return {
    fields: (result && result.fields) || {},
    description: result && result.description,
    usage: result && result.usage,
    detected: result && result.detected,
  };
}

// INDEXED application-question extraction: same payload; the backend classifies the harvested
// controls (it can never invent a question) and copies options verbatim from the DOM.
async function extractApplicationIndexed({ blocks, fields, source, url } = {}) {
  dlog("extract-application-indexed: POST /api/extract-application/indexed | source:", source, "| blocks:", (blocks || []).length, "| fields:", (fields || []).length);
  const result = await apiFetch("/api/extract-application/indexed", {
    method: "POST",
    body: JSON.stringify({
      blocks: Array.isArray(blocks) ? blocks : [],
      fields: Array.isArray(fields) ? fields : [],
      source,
      url,
    }),
  });
  const questions = (result && result.questions) || [];
  dlog("extract-application-indexed: got", questions.length, "questions | detected", result && result.detected, "| usage", result && result.usage);
  return { questions, detected: result && result.detected };
}

// Unwrap the API's `{ data }` success envelope; surface `{ error }` as a thrown Error.
async function apiFetch(path, init) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error?.message || `Request failed (${res.status})`);
  }
  return body.data;
}

async function getJobs() {
  const jobs = await apiFetch("/api/jobs");
  updateBadge(jobs.length);
  return jobs;
}

// Fetch ONE saved job by id, for the content script's revalidate-on-open (it opens the panel on an
// already-saved posting and refreshes its cached snapshot against the source of truth). Returns the
// job, or `null` when it 404s — meaning it was deleted in the web app, so the caller can clear the
// stale local "saved" state. Only called when a posting is already saved, so it adds no per-browse cost.
async function getJobById(id) {
  const res = await fetch(`${API_BASE}/api/jobs/${encodeURIComponent(id)}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (res.status === 404) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Request failed (${res.status})`);
  return body.data;
}

// PATCH tracking fields (status/deadline/notes/…) of a saved job. `updateJobSchema` validates the
// partial, and `updateJob` folds status changes through the interview-date reconciliation.
async function patchJob(id, patch) {
  return apiFetch(`/api/jobs/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch || {}),
  });
}

// Fetch a document's raw bytes as base64. The /raw route streams the file; we return only the bytes
// (chrome messaging is JSON, so no ArrayBuffer) and let the content script rebuild the File with the
// fileName + mimeType it already has from the list. `?download=1` avoids any inline rendering path.
async function fetchDocumentBytes(id) {
  const res = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(id)}/raw?download=1`);
  if (!res.ok) throw new Error(`Document fetch failed (${res.status})`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const CHUNK = 0x8000; // chunk so String.fromCharCode never overflows the arg limit on big files
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function saveJob(job) {
  // The popup's "save current tab" sends only title/url; fall back to the hostname so
  // the API's required `company` validation passes. The content script's save panel
  // sends the full set, which we forward through unchanged.
  const hostname = safeHostname(job.url);
  const payload = {
    title: job.title || "Untitled role",
    company: job.company || hostname || "Unknown",
    url: job.url || "",
    source: job.source || hostname || "extension",
  };
  if (job.location) payload.location = job.location;
  if (job.description) payload.description = job.description;
  if (job.logoUrl) payload.logoUrl = job.logoUrl;
  if (job.salary) payload.salary = job.salary;
  if (job.employmentType) payload.employmentType = job.employmentType;
  if (job.workplaceType) payload.workplaceType = job.workplaceType;
  if (job.status) payload.status = job.status; // pipeline stage set in the save panel
  if (job.deadline) payload.deadline = job.deadline;
  if (job.notes) payload.notes = job.notes;
  // Optional extracted application form. Forwarded only when the content script attached it
  // (the user extracted questions); the API persists it 1:1 with the job. Omitted otherwise.
  if (job.application) payload.application = job.application;
  // The API is idempotent per URL: this creates the job or updates the existing one for this
  // posting, and returns the saved row (incl. its id) so the panel can deep-link to it.
  const saved = await apiFetch("/api/jobs", { method: "POST", body: JSON.stringify(payload) });
  // TODO(ai-prep): when the user opted in (job.aiPrep === true) and the backend AI
  // prep endpoint exists, enqueue the background tailoring job here. Intentionally NOT
  // added to the payload above so the current strict /api/jobs schema keeps accepting saves.
  getJobs().catch(() => {}); // refresh list + badge (non-fatal; don't block the save response)
  return saved;
}

async function deleteJob(id) {
  await apiFetch(`/api/jobs/${id}`, { method: "DELETE" });
  return getJobs();
}

// Autofill: send the page's harvested input fields to the backend, which semantically matches each
// SAVED application question to its field and returns a fill plan ({ matched, unmatched }). Embeddings
// + matching are server-side (the OpenAI key never ships in the extension). apiFetch unwraps `{ data }`.
async function autofillMatch(jobId, fields) {
  return apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/application/autofill-match`, {
    method: "POST",
    body: JSON.stringify({ fields: Array.isArray(fields) ? fields : [] }),
  });
}

// Batch-save the live-captured application answers for a saved job. One PUT upserts every
// (question, value) row in a single transaction server-side and clears emptied ones; resolves
// to the saved { questionId: value } map. Called by the content script right after SAVE_JOB.
async function saveApplicationAnswers(jobId, answers) {
  return apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/application/answers`, {
    method: "PUT",
    body: JSON.stringify({ answers: Array.isArray(answers) ? answers : [] }),
  });
}

// --- Reminders (shared backend; same /api/* as the web app) ----------------------------------
// apiFetch unwraps the `{ data }` envelope, so these return the reminder(s) directly.
async function listJobReminders(jobId) {
  return apiFetch(`/api/jobs/${jobId}/reminders`, { method: "GET" });
}
async function createReminder(jobId, fields) {
  return apiFetch(`/api/jobs/${jobId}/reminders`, {
    method: "POST",
    body: JSON.stringify(fields),
  });
}
async function toggleReminder(id, done) {
  return apiFetch(`/api/reminders/${id}`, { method: "PATCH", body: JSON.stringify({ done }) });
}
// Generic reminder PATCH: forwards whatever subset of { done, dueAt, hasTime, title } the caller
// sends (the save-time todo reconcile uses this to push done AND due changes in one call). `dueAt`
// may be null to clear a due date (the API schema allows it).
async function updateReminderApi(id, fields) {
  return apiFetch(`/api/reminders/${id}`, { method: "PATCH", body: JSON.stringify(fields || {}) });
}
async function deleteReminderApi(id) {
  return apiFetch(`/api/reminders/${id}`, { method: "DELETE" });
}

function safeHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function updateBadge(count) {
  chrome.action.setBadgeBackgroundColor({ color: "#3f9b6a" }); // fern
  chrome.action.setBadgeText({ text: count ? String(count) : "" });
}

// --- Local reminder delivery wiring -----------------------------------------------------------
// Daily background sync of alarms (deliberate, once a day — NOT browse-time polling), plus a sync
// on install/startup so alarms exist after the worker (re)spins up.
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(self.SYNC_ALARM, { periodInMinutes: 1440 });
  syncReminderAlarms().catch(() => {});
});
chrome.runtime.onStartup.addListener(() => {
  syncReminderAlarms().catch(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === self.SYNC_ALARM) {
    syncReminderAlarms().catch(() => {});
    return;
  }
  if (alarm.name.startsWith(self.REM_PREFIX)) {
    handleReminderAlarm(alarm.name).catch(() => {});
  }
});

// Click an OS notification → open the stored deep link (job page or reminders feed).
chrome.notifications.onClicked.addListener(async (notifId) => {
  const links = (await chrome.storage.local.get("jt:notifLinks"))["jt:notifLinks"] || {};
  const url = links[notifId];
  if (url) chrome.tabs.create({ url });
  chrome.notifications.clear(notifId);
});

// Keep badge in sync on startup. Swallow errors (server may be down) so the worker
// doesn't throw on boot.
getJobs().catch(() => updateBadge(0));
// Register alarms whenever the worker spins up (covers the common case where neither onInstalled
// nor onStartup fired this session, e.g. the worker was revived by an event).
syncReminderAlarms().catch(() => {});
