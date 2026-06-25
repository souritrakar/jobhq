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

// Central message handler. Return true to keep the channel open for async sendResponse.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "EXTRACT_JOB") {
    extractJob(msg.context || {})
      .then((r) => sendResponse({ ok: true, fields: r.fields, description: r.description }))
      .catch((err) => sendResponse({ ok: false, error: String(err), fields: {} }));
    return true;
  }
  if (msg?.type === "EXTRACT_APPLICATION") {
    extractApplication(msg.context || {})
      .then((r) => sendResponse({ ok: true, questions: r.questions }))
      .catch((err) => sendResponse({ ok: false, error: String(err), questions: [] }));
    return true;
  }
  if (msg?.type === "SAVE_JOB") {
    saveJob(msg.job)
      .then((saved) => sendResponse({ ok: true, job: saved }))
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
  dlog("extract: POST /api/extract | source:", source, "| context chars:", text.length);
  const result = await apiFetch("/api/extract", {
    method: "POST",
    body: JSON.stringify({ text, source, url }),
  });
  const fields = (result && result.fields) || {};
  dlog("extract: got fields", fields, "| usage", result && result.usage);
  return { fields, description: result && result.description };
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

// Keep badge in sync on startup. Swallow errors (server may be down) so the worker
// doesn't throw on boot.
getJobs().catch(() => updateBadge(0));
