// Popup UI — talks to the service worker for all storage operations.

const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const countEl = document.getElementById("count");
const loaderEl = document.getElementById("loader");

function send(message) {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

// lucide-style line icons, drawn at currentColor.
const SVGNS = "http://www.w3.org/2000/svg";
const ICON = {
  building:
    '<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/>',
  calendar:
    '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 2v4"/><path d="M16 2v4"/>',
  briefcase:
    '<rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  external: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
};

function icon(paths, cls) {
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  if (cls) svg.setAttribute("class", cls);
  svg.innerHTML = paths;
  return svg;
}

function metaPart(cls, iconPaths, value) {
  const span = document.createElement("span");
  span.className = cls;
  span.append(icon(iconPaths, "meta-icon"));
  const text = document.createElement("span");
  text.textContent = value;
  span.append(text);
  return span;
}

function render(jobs) {
  countEl.textContent = jobs.length;
  emptyEl.classList.toggle("hidden", jobs.length > 0);
  listEl.innerHTML = "";

  for (const job of jobs) {
    const li = document.createElement("li");
    li.className = "item";

    // Leading anchor: a generic company glyph.
    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.append(icon(ICON.building));

    const body = document.createElement("div");
    body.className = "item-body";

    const title = document.createElement("p");
    title.className = "item-title";
    if (job.url) {
      const a = document.createElement("a");
      a.href = job.url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = job.title;
      a.append(icon(ICON.external, "ext-icon"));
      title.appendChild(a);
    } else {
      title.textContent = job.title;
    }

    const meta = document.createElement("div");
    meta.className = "item-meta";
    if (job.company) meta.append(metaPart("meta-company", ICON.building, job.company));
    const when = new Date(job.createdAt ?? job.savedAt).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    meta.append(metaPart("meta-date", ICON.calendar, when));

    body.append(title, meta);

    const del = document.createElement("button");
    del.className = "del";
    del.type = "button";
    del.append(icon(ICON.x));
    del.title = "Remove";
    del.setAttribute("aria-label", `Remove ${job.title}`);
    del.addEventListener("click", async () => {
      const res = await send({ type: "DELETE_JOB", id: job.id });
      if (res?.ok) render(res.jobs);
    });

    li.append(avatar, body, del);
    listEl.appendChild(li);
  }
}

document.getElementById("capture-current").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const job = { title: tab.title || "Untitled role", url: (tab.url || "").split("?")[0] };
  const saveRes = await send({ type: "SAVE_JOB", job });
  if (saveRes?.ok) {
    const res = await send({ type: "GET_JOBS" });
    if (res?.ok) render(res.jobs);
  }
});

(async function init() {
  const res = await send({ type: "GET_JOBS" });
  loaderEl.classList.add("hidden");
  render(res?.jobs || []);
})();
