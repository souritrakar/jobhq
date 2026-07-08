// Popup UI — a quick launcher + a glance at recently saved jobs. All storage/network goes through
// the service worker. The primary action opens the in-page tracker panel (drawer) on the current
// tab, so it works even on sites where the on-page button is hidden or wiped by the page's framework.

const DASH = "http://localhost:3100"; // web app origin (dev); matches background.js API_BASE host
const RECENT_LIMIT = 6;

// The content script files, in load order — injected on demand if the panel message finds no
// receiver (a page where the declared content scripts didn't run). Mirrors manifest content_scripts.
const CONTENT_SCRIPTS = [
  "parsers/clean-dom.js",
  "parsers/capture.js",
  "ui/button.js",
  "ui/application.js",
  "ui/modal.js",
  "ui/todo.js",
  "content.js",
];

const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const countEl = document.getElementById("count");
const loaderEl = document.getElementById("loader");
const viewAllEl = document.getElementById("view-all");

function send(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

// ---- icons (lucide-style, drawn at currentColor) ----
const SVGNS = "http://www.w3.org/2000/svg";
const ICON = {
  bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  bookmarkPlus:
    '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/><path d="M9 10h6"/><path d="M12 7v6"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
};
function icon(paths) {
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = paths;
  return svg;
}

// ---- helpers ----
const STATUS = {
  SAVED: { label: "Saved", cls: "" },
  APPLIED: { label: "Applied", cls: "st-applied" },
  INTERVIEWING: { label: "Interviewing", cls: "st-interview" },
  OFFER: { label: "Offer", cls: "st-offer" },
  REJECTED: { label: "Rejected", cls: "st-rejected" },
  ARCHIVED: { label: "Archived", cls: "" },
};

// Compact relative time ("just now", "3h", "2d", "4w") falling back to a short date for older jobs.
function relTime(input) {
  const t = typeof input === "number" ? input : Date.parse(input);
  if (!t || isNaN(t)) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h";
  const d = Math.floor(h / 24);
  if (d < 7) return d + "d";
  const w = Math.floor(d / 7);
  if (w < 5) return w + "w";
  return new Date(t).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function logoNode(job) {
  const d = document.createElement("div");
  d.className = "logo";
  const initial = (job.company || job.title || "?").trim().charAt(0).toUpperCase() || "?";
  if (job.logoUrl) {
    const img = document.createElement("img");
    img.src = job.logoUrl;
    img.alt = "";
    img.addEventListener("error", () => { d.replaceChildren(document.createTextNode(initial)); });
    d.appendChild(img);
  } else {
    d.textContent = initial;
  }
  return d;
}

function render(jobs) {
  const all = Array.isArray(jobs) ? jobs : [];
  countEl.textContent = String(all.length);
  emptyEl.classList.toggle("hidden", all.length > 0);
  viewAllEl.classList.toggle("hidden", all.length === 0);
  listEl.innerHTML = "";

  for (const job of all.slice(0, RECENT_LIMIT)) {
    const item = document.createElement("a");
    item.className = "item";
    item.href = `${DASH}/dashboard/saved?job=${encodeURIComponent(job.id)}`;
    item.target = "_blank";
    item.rel = "noopener";

    const body = document.createElement("div");
    body.className = "item-body";

    const row = document.createElement("div");
    row.className = "item-row";
    const title = document.createElement("p");
    title.className = "item-title";
    title.textContent = job.title || "Untitled role";
    const date = document.createElement("span");
    date.className = "item-date";
    date.textContent = relTime(job.createdAt ?? job.savedAt);
    row.append(title, date);

    const meta = document.createElement("div");
    meta.className = "item-meta";
    if (job.company) {
      const company = document.createElement("span");
      company.className = "item-company";
      company.textContent = job.company;
      meta.append(company);
    }
    const st = STATUS[job.status] || STATUS.SAVED;
    const pill = document.createElement("span");
    pill.className = "status " + st.cls;
    pill.textContent = st.label;
    meta.append(pill);

    body.append(row, meta);
    item.append(logoNode(job), body);
    listEl.appendChild(item);
  }
}

// ---- open the in-page tracker panel on the active tab ----
// Try messaging the content script; if there's no receiver (its declared content scripts never ran
// on this page), inject them on demand and retry. Returns true once the panel was asked to open.
function sendOpen(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "OPEN_SAVE_PANEL" }, (resp) => {
      if (chrome.runtime.lastError) return resolve({ present: false });
      resolve({ present: true, ok: !!(resp && resp.ok) });
    });
  });
}

async function openPanelOnTab(tabId) {
  let r = await sendOpen(tabId);
  if (r.present) return r.ok;
  // No content script on this page — inject it (activeTab grants host access on this user gesture).
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_SCRIPTS });
  } catch (_) {
    return false; // restricted page (chrome://, web store, PDF viewer, …)
  }
  await new Promise((res) => setTimeout(res, 150));
  r = await sendOpen(tabId);
  return r.present && r.ok;
}

const openBtn = document.getElementById("open-panel");
const btnLabel = openBtn.querySelector(".btn-label");
openBtn.addEventListener("click", async () => {
  openBtn.disabled = true;
  btnLabel.textContent = "Opening…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id != null && (await openPanelOnTab(tab.id))) {
      window.close(); // panel is opening on the page; get out of the way
      return;
    }
    btnLabel.textContent = "Can't open on this page";
  } catch (_) {
    btnLabel.textContent = "Couldn't open — try again";
  } finally {
    openBtn.disabled = false;
    setTimeout(() => { btnLabel.textContent = "Save this tab"; }, 2200);
  }
});

// ---- static icons + dashboard links ----
document.getElementById("brand-mark").append(icon(ICON.bookmark));
document.getElementById("btn-ic").append(icon(ICON.bookmarkPlus));
const dash = document.getElementById("open-dashboard");
dash.append(icon(ICON.grid));
dash.href = `${DASH}/dashboard`;
dash.target = "_blank";
dash.rel = "noopener";
viewAllEl.href = `${DASH}/dashboard/saved`;
viewAllEl.target = "_blank";
viewAllEl.rel = "noopener";

(async function init() {
  const res = await send({ type: "GET_JOBS" });
  loaderEl.classList.add("hidden");
  render(res?.jobs || []);
})();
