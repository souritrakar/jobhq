// Reminders section for the save panel's Details tab. Lists, adds, toggles, and deletes
// reminders for an ALREADY-SAVED posting (an unsaved job has no id to anchor them to, so the
// section degrades to a quiet "save first" gate). The backend + worker message handlers
// already exist (background.js): this module is pure UI over those messages.
//
// Mirrors the shadow-DOM idioms of ui/modal.js — same design tokens (--accent #3f9b6a fern,
// neutral white surface), createElement-only DOM (no innerHTML for user content, so a crafted
// reminder title can't inject markup), and lucide-style stroke icons. Self-contained: it
// renders its own scoped styles (under .jt-rem) into whatever container the modal hands it, so
// it can't disturb the rest of the Details pane.
//
// Isolated-world global: window.JTReminders = { render }. render(container, { jobId, host }).
(function (root) {
  const SVGNS = "http://www.w3.org/2000/svg";

  // lucide-style geometry (24×24), drawn at currentColor.
  const ICON = {
    bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    trash:
      '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  };

  function el(tag, attrs, kids) {
    const n = document.createElement(tag);
    if (attrs)
      for (const k in attrs) {
        if (k === "text") n.textContent = attrs[k];
        else if (attrs[k] != null) n.setAttribute(k, attrs[k]);
      }
    for (const c of kids || []) n.append(c);
    return n;
  }

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

  // ---- worker message helpers (Promise wrappers over chrome.runtime.sendMessage) ----
  function hasRuntime() {
    return typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage;
  }
  function send(msg) {
    return new Promise((resolve, reject) => {
      if (!hasRuntime()) return reject(new Error("Extension messaging unavailable."));
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (res && res.ok) resolve(res);
          else reject(new Error((res && res.error) || "Request failed"));
        });
      } catch (e) {
        reject(e);
      }
    });
  }
  // Fire-and-forget alarm refresh after any mutation (guarded; never throws to the caller).
  function syncAlarms() {
    if (!hasRuntime()) return;
    try {
      chrome.runtime.sendMessage({ type: "SYNC_REMINDER_ALARMS" }, () => {
        void chrome.runtime.lastError; // swallow — fire-and-forget
      });
    } catch (_) {}
  }

  // ---- due-date formatting ----
  // Date-only reminders show just the day; hasTime ones append the local time. Quietly tolerant
  // of a bad/missing dueAt (returns "" → no label rendered).
  function formatDue(dueAt, hasTime) {
    if (!dueAt) return "";
    const d = new Date(dueAt);
    if (isNaN(d.getTime())) return "";
    const day = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    if (!hasTime) return day;
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return day + " at " + time;
  }

  // Quick-pick chips → a whole number of days from today (date-only reminders default to 9am so
  // day-bucketing stays stable away from midnight). Mirrors the web app's reminder-popover.
  const CHIPS = [
    { key: "tomorrow", label: "Tomorrow 9am", days: 1 },
    { key: "in3", label: "In 3 days", days: 3 },
    { key: "nextweek", label: "Next week", days: 7 },
  ];
  function startOfDayPlus(days) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return d;
  }
  // Resolve the active chip / custom date / optional time into { dueAt, hasTime }. No date → {}.
  function buildDue(chipDays, customDate, time) {
    let base = null;
    if (chipDays != null) base = startOfDayPlus(chipDays);
    else if (customDate) {
      const parts = customDate.split("-").map(Number);
      if (parts.length === 3 && !parts.some(isNaN)) base = new Date(parts[0], parts[1] - 1, parts[2]);
    }
    if (!base) return {};
    const hasTime = Boolean(time);
    if (hasTime) {
      const [h, min] = time.split(":").map(Number);
      base.setHours(h, min, 0, 0);
    } else {
      base.setHours(9, 0, 0, 0);
    }
    return { dueAt: base.toISOString(), hasTime };
  }

  function styles() {
    return `
      .jt-rem{display:flex;flex-direction:column;gap:11px;}
      .jt-rem-gate{font-size:12.5px;line-height:1.5;color:var(--ink-3);font-style:italic;}

      /* list */
      .jt-rem-list{display:flex;flex-direction:column;gap:2px;}
      .jt-rem-empty{font-size:12.5px;color:var(--ink-3);padding:2px 0;}
      .jt-rem-item{display:flex;align-items:flex-start;gap:9px;padding:7px 4px;border-radius:var(--r1);
        transition:background .12s ease;}
      .jt-rem-item:hover{background:var(--bg-hover);}
      .jt-rem-check{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:18px;
        height:18px;margin-top:1px;border:1.5px solid var(--line-strong);border-radius:50%;background:var(--bg);
        cursor:pointer;color:transparent;transition:background .12s ease,border-color .12s ease,color .12s ease;}
      .jt-rem-check:hover{border-color:var(--accent);}
      .jt-rem-check svg{width:12px;height:12px;}
      .jt-rem-check.done{background:var(--accent);border-color:var(--accent);color:var(--accent-fg);}
      .jt-rem-check:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
      .jt-rem-body{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px;}
      .jt-rem-title{font-size:13px;line-height:1.4;color:var(--ink);overflow-wrap:anywhere;}
      .jt-rem-item.done .jt-rem-title{color:var(--ink-3);text-decoration:line-through;}
      .jt-rem-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
      .jt-rem-due{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:500;
        color:var(--ink-3);}
      .jt-rem-due svg{width:12px;height:12px;}
      .jt-rem-auto{font-size:10px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;
        padding:1px 6px;border-radius:5px;background:var(--accent-bg);color:var(--accent-ink);}
      .jt-rem-del{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:26px;height:26px;
        border:none;background:none;cursor:pointer;border-radius:6px;color:var(--ink-3);opacity:0;
        transition:opacity .12s ease,background .12s ease,color .12s ease;}
      .jt-rem-item:hover .jt-rem-del,.jt-rem-del:focus-visible{opacity:1;}
      .jt-rem-del:hover{background:var(--danger-bg);color:var(--danger);}
      .jt-rem-del svg{width:15px;height:15px;}
      .jt-rem-del:focus-visible{outline:2px solid var(--accent);outline-offset:1px;}

      /* add form */
      .jt-rem-form{display:flex;flex-direction:column;gap:9px;padding-top:4px;}
      .jt-rem-input{width:100%;font-family:var(--font);font-size:13px;color:var(--ink);
        background:var(--bg-sunken);border:1px solid var(--line);border-radius:var(--r2);padding:9px 11px;
        transition:border-color .14s ease,box-shadow .14s ease,background .14s ease;}
      .jt-rem-input::placeholder{color:var(--ink-3);}
      .jt-rem-input:hover{border-color:var(--line-strong);}
      .jt-rem-input:focus{outline:none;background:var(--bg);border-color:var(--accent);box-shadow:var(--ring);}
      .jt-rem-chips{display:flex;flex-wrap:wrap;gap:6px;}
      .jt-rem-chip{font-family:var(--font);font-size:11.5px;font-weight:600;cursor:pointer;padding:5px 11px;
        border-radius:999px;border:1px solid var(--line-strong);background:var(--bg);color:var(--ink-2);
        transition:border-color .12s ease,background .12s ease,color .12s ease;}
      .jt-rem-chip:hover{border-color:var(--accent);color:var(--ink);}
      .jt-rem-chip[aria-pressed="true"]{border-color:var(--accent);background:var(--accent-bg);
        color:var(--accent-ink);}
      .jt-rem-chip:focus-visible{outline:2px solid var(--accent);outline-offset:1px;}
      .jt-rem-when{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
      .jt-rem-date,.jt-rem-time{font-family:var(--font);font-size:12.5px;color:var(--ink);
        background:var(--bg-sunken);border:1px solid var(--line);border-radius:var(--r1);padding:6px 8px;
        transition:border-color .14s ease,box-shadow .14s ease;}
      .jt-rem-date:focus,.jt-rem-time:focus{outline:none;border-color:var(--accent);box-shadow:var(--ring);}
      .jt-rem-actions{display:flex;align-items:center;gap:8px;}
      .jt-rem-add{font-family:var(--font);font-weight:600;font-size:13px;display:inline-flex;
        align-items:center;justify-content:center;gap:6px;cursor:pointer;border:1px solid transparent;
        border-radius:var(--r2);padding:8px 14px;line-height:1;background:var(--accent);color:var(--accent-fg);
        box-shadow:0 1px 1px oklch(0.2 0.02 250 / .08);
        transition:background .14s ease,opacity .14s ease;}
      .jt-rem-add svg{width:14px;height:14px;}
      .jt-rem-add:hover{background:var(--accent-press);}
      .jt-rem-add[disabled]{opacity:.55;cursor:default;box-shadow:none;}
      .jt-rem-add:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
      .jt-rem-err{font-size:11.5px;color:var(--danger);font-weight:600;}
    `;
  }

  // render(container, { jobId, host }). When jobId is falsy the section is gated (job not saved).
  function render(container, ctx) {
    container = container || null;
    if (!container) return;
    ctx = ctx || {};
    container.replaceChildren();

    // Scoped styles, injected once per container (the modal re-renders cheaply, so guard a dup).
    if (!container.querySelector("style[data-jt-rem]")) {
      const style = el("style");
      style.setAttribute("data-jt-rem", "");
      style.textContent = styles();
      container.append(style);
    }

    const wrap = el("div", { class: "jt-rem" });
    container.append(wrap);

    if (!ctx.jobId) {
      wrap.append(el("p", { class: "jt-rem-gate", text: "Save this job to add reminders." }));
      return;
    }

    // Local cache of the list; mutated optimistically-after-confirm and re-rendered in place.
    let reminders = [];
    const listEl = el("div", { class: "jt-rem-list" });
    wrap.append(listEl);

    // Open (not-done) reminders sort before done ones; otherwise keep server order.
    function sortReminders() {
      reminders.sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1));
    }

    function renderList() {
      listEl.replaceChildren();
      if (!reminders.length) {
        listEl.append(el("p", { class: "jt-rem-empty", text: "No reminders yet." }));
        return;
      }
      reminders.forEach((r) => listEl.append(itemRow(r)));
    }

    function itemRow(r) {
      const done = !!r.done;
      const row = el("div", { class: "jt-rem-item" + (done ? " done" : "") });

      const check = el("button", {
        class: "jt-rem-check" + (done ? " done" : ""),
        type: "button",
        "aria-pressed": done ? "true" : "false",
        "aria-label": done ? "Mark as not done" : "Mark as done",
        title: done ? "Mark as not done" : "Mark as done",
      });
      check.append(icon(ICON.check));
      check.addEventListener("click", () => onToggle(r, check));

      const body = el("div", { class: "jt-rem-body" });
      body.append(el("span", { class: "jt-rem-title", text: r.title || "Reminder" }));
      const meta = el("div", { class: "jt-rem-meta" });
      const dueLabel = formatDue(r.dueAt, r.hasTime);
      if (dueLabel) {
        meta.append(el("span", { class: "jt-rem-due" }, [icon(ICON.clock), el("span", { text: dueLabel })]));
      }
      if (r.type === "system") {
        meta.append(el("span", { class: "jt-rem-auto", title: "Created automatically", text: "Auto" }));
      }
      if (meta.childNodes.length) body.append(meta);

      const del = el("button", {
        class: "jt-rem-del",
        type: "button",
        "aria-label": "Delete reminder",
        title: "Delete reminder",
      });
      del.append(icon(ICON.trash));
      del.addEventListener("click", () => onDelete(r, del));

      row.append(check, body, del);
      return row;
    }

    function onToggle(r, btn) {
      const next = !r.done;
      btn.disabled = true;
      send({ type: "TOGGLE_REMINDER", id: r.id, done: next })
        .then((res) => {
          const updated = (res && res.reminder) || { ...r, done: next };
          r.done = updated.done;
          if (updated.dueAt !== undefined) r.dueAt = updated.dueAt;
          if (updated.hasTime !== undefined) r.hasTime = updated.hasTime;
          sortReminders();
          renderList();
          syncAlarms();
        })
        .catch(() => {
          btn.disabled = false;
        });
    }

    function onDelete(r, btn) {
      btn.disabled = true;
      send({ type: "DELETE_REMINDER", id: r.id })
        .then(() => {
          reminders = reminders.filter((x) => x.id !== r.id);
          renderList();
          syncAlarms();
        })
        .catch(() => {
          btn.disabled = false;
        });
    }

    // ---- add form ----
    const titleInput = el("input", {
      class: "jt-rem-input",
      type: "text",
      placeholder: "Remind me to…",
      "aria-label": "Reminder text",
    });

    let chipDays = null; // active chip's day-offset, or null when none / custom-date in use
    const chipBtns = [];
    const chipsRow = el("div", { class: "jt-rem-chips" });
    CHIPS.forEach((c) => {
      const b = el("button", {
        class: "jt-rem-chip",
        type: "button",
        "aria-pressed": "false",
        text: c.label,
      });
      b.addEventListener("click", () => {
        const turningOn = chipDays !== c.days;
        chipDays = turningOn ? c.days : null;
        if (turningOn) dateInput.value = ""; // chip and custom date are mutually exclusive
        chipBtns.forEach((x) => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", turningOn ? "true" : "false");
      });
      chipBtns.push(b);
      chipsRow.append(b);
    });

    const dateInput = el("input", { class: "jt-rem-date", type: "date", "aria-label": "Custom date" });
    const timeInput = el("input", { class: "jt-rem-time", type: "time", "aria-label": "Time (optional)" });
    // Picking a custom date clears any active chip (they're mutually exclusive).
    dateInput.addEventListener("input", () => {
      if (dateInput.value) {
        chipDays = null;
        chipBtns.forEach((x) => x.setAttribute("aria-pressed", "false"));
      }
    });
    const whenRow = el("div", { class: "jt-rem-when" }, [dateInput, timeInput]);

    const errEl = el("p", { class: "jt-rem-err" });
    errEl.style.display = "none";

    const addBtn = el("button", { class: "jt-rem-add", type: "button" });
    addBtn.append(icon(ICON.plus), el("span", { text: "Add reminder" }));
    addBtn.addEventListener("click", submit);

    const form = el("div", { class: "jt-rem-form" }, [
      titleInput,
      chipsRow,
      whenRow,
      errEl,
      el("div", { class: "jt-rem-actions" }, [addBtn]),
    ]);
    wrap.append(form);

    titleInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    });

    function resetForm() {
      titleInput.value = "";
      dateInput.value = "";
      timeInput.value = "";
      chipDays = null;
      chipBtns.forEach((x) => x.setAttribute("aria-pressed", "false"));
    }

    function submit() {
      const title = titleInput.value.trim();
      if (!title) {
        titleInput.focus();
        return;
      }
      errEl.style.display = "none";
      addBtn.disabled = true;
      titleInput.disabled = true;
      const fields = { title, ...buildDue(chipDays, dateInput.value, timeInput.value) };
      send({ type: "CREATE_REMINDER", jobId: ctx.jobId, fields })
        .then((res) => {
          const created = res && res.reminder;
          if (created) reminders.push(created);
          sortReminders();
          renderList();
          resetForm();
          syncAlarms();
        })
        .catch((err) => {
          errEl.textContent = (err && err.message) || "Couldn't save the reminder.";
          errEl.style.display = "";
        })
        .finally(() => {
          addBtn.disabled = false;
          titleInput.disabled = false;
          titleInput.focus();
        });
    }

    // Initial load.
    listEl.append(el("p", { class: "jt-rem-empty", text: "Loading reminders…" }));
    send({ type: "LIST_JOB_REMINDERS", jobId: ctx.jobId })
      .then((res) => {
        reminders = Array.isArray(res && res.reminders) ? res.reminders.slice() : [];
        sortReminders();
        renderList();
      })
      .catch(() => {
        reminders = [];
        renderList();
      });
  }

  root.JTReminders = { render };
})(typeof self !== "undefined" ? self : this);
