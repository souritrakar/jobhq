// Runs in the background service worker (loaded via importScripts from background.js, so it shares
// that scope — `apiFetch` and `API_BASE` are defined there). Keeps chrome.alarms in sync with the
// user's upcoming reminders and fires an OS notification when one is due. This is LOCAL delivery:
// no server push. Alarms are (re)registered on a once-daily sync + after extension-side mutations.
const REM_PREFIX = "reminder:";
const SYNC_ALARM = "jt:sync";

async function fetchUpcoming() {
  // apiFetch is defined in background.js (same SW scope). Returns the unwrapped reminders array.
  try {
    return await apiFetch("/api/reminders?upcoming=1&days=30", { method: "GET" });
  } catch (_) {
    return [];
  }
}

async function syncReminderAlarms() {
  const prefs = await getCachedPrefs(); // {extensionEnabled} cached in storage; default true
  const existing = await chrome.alarms.getAll();
  for (const a of existing) {
    if (a.name.startsWith(REM_PREFIX)) await chrome.alarms.clear(a.name);
  }
  if (prefs && prefs.extensionEnabled === false) return;

  const reminders = await fetchUpcoming();
  const map = {};
  for (const r of reminders) {
    if (!r.dueAt) continue;
    const when = new Date(r.dueAt).getTime();
    if (when <= Date.now()) continue;
    map[r.id] = { id: r.id, title: r.title, dueAt: r.dueAt, job: r.job || null };
    await chrome.alarms.create(REM_PREFIX + r.id, { when });
  }
  await chrome.storage.local.set({ "jt:reminderCache": map });
}

async function getCachedPrefs() {
  const o = await chrome.storage.local.get("jt:notifPrefs");
  return o["jt:notifPrefs"] || { extensionEnabled: true };
}

async function handleReminderAlarm(name) {
  const id = name.slice(REM_PREFIX.length);
  const o = await chrome.storage.local.get("jt:reminderCache");
  const cache = o["jt:reminderCache"] || {};
  const r = cache[id];
  if (!r) return;
  const company = r.job && r.job.company ? r.job.company + ": " : "";
  chrome.notifications.create("jtrem:" + id, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: "jobhq reminder",
    message: company + r.title,
    priority: 1,
  });
  // store the deep link for click handling
  const links = (await chrome.storage.local.get("jt:notifLinks"))["jt:notifLinks"] || {};
  links["jtrem:" + id] = r.job
    ? `${API_BASE}/dashboard/jobs/${r.job.id}`
    : `${API_BASE}/dashboard/reminders`;
  await chrome.storage.local.set({ "jt:notifLinks": links });
}

self.syncReminderAlarms = syncReminderAlarms;
self.handleReminderAlarm = handleReminderAlarm;
self.REM_PREFIX = REM_PREFIX;
self.SYNC_ALARM = SYNC_ALARM;
