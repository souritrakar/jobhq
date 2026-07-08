// To-do section for the save panel's Details tab. A single list holds both plain to-dos and
// reminders — the only difference is a due date (mirrors the web app's job-detail TodoCard). It is
// LOCAL-FIRST: every add / toggle / convert / delete mutates an in-memory list and calls back to the
// host (content.js) to persist it into the posting's chrome.storage.local record. Nothing touches the
// backend here — the drawer reconciles the list against the reminder API only when the user SAVES.
// So the section is usable immediately, even on an unsaved posting, and survives close / collapse /
// refresh like Details and notes already do.
//
// Shares ui/modal.js's shadow-DOM idioms: same design tokens (--accent fern, neutral white surface),
// createElement-only DOM (no innerHTML for user content, so a crafted title can't inject markup), and
// lucide-style stroke icons. Self-contained: renders its own scoped styles (under .jt-todo) into
// whatever container the modal hands it.
//
// Isolated-world global: window.JTTodo = { render }.
//   render(container, {
//     todos,        // Array<Todo> — the restored list (may be empty)
//     deleted,      // Array<string> — remoteIds pending deletion (survives refresh until next save)
//     onChange,     // (todos, deleted) => void — persist the live list + pending-deletes
//     host,         // the modal host element (unused today; reserved for popover anchoring)
//   })
// Todo shape: { id, title, done, dueAt?, hasTime?, remoteId?, type?, synced? }
//   id       — local, stable across the session/refresh
//   remoteId — the server reminder id once synced (absent until the posting is saved)
//   type     — "system" for auto reminders seeded from the server (Auto badge; not convert/delete-able)
//   synced   — { done, dueAt, hasTime } snapshot from the last successful sync (reconcile diffs it)
(function (root) {
  const SVGNS = "http://www.w3.org/2000/svg";

  // lucide-style geometry (24×24), drawn at currentColor.
  const ICON = {
    bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
    bellPlus:
      '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M15 8h6"/><path d="M18 5v6"/><path d="M20.002 14.464a1 1 0 0 0 .738 1.673H4a1 1 0 0 0 .74-1.673C6.068 13.956 7.477 12.499 7.477 8a4.52 4.52 0 0 1 .5-2.064"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    trash:
      '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    alert:
      '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
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

  function newId() {
    try {
      if (root.crypto && root.crypto.randomUUID) return "t_" + root.crypto.randomUUID();
    } catch (_) {}
    return "t_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  // ---- due-date helpers (mirrors reminders.js + the web app) ----
  function formatDue(dueAt, hasTime) {
    if (!dueAt) return "";
    const d = new Date(dueAt);
    if (isNaN(d.getTime())) return "";
    const day = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    if (!hasTime) return day;
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    return day + " at " + time;
  }
  function isOverdue(dueAt, hasTime) {
    const d = new Date(dueAt);
    if (isNaN(d.getTime())) return false;
    const now = new Date();
    if (hasTime) return d.getTime() < now.getTime();
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return day.getTime() < today.getTime();
  }

  // Quick-pick chips → whole-day offsets from today (date-only reminders default to 9am so
  // day-bucketing stays stable away from midnight). Mirrors the web app's reminder-popover.
  const CHIPS = [
    { key: "tomorrow", label: "Tomorrow", days: 1 },
    { key: "in3", label: "In 3 days", days: 3 },
    { key: "nextweek", label: "Next week", days: 7 },
  ];
  function startOfDayPlus(days) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return d;
  }
  // Resolve the active chip / custom date / optional time into { dueAt, hasTime }. No date → null.
  function buildDue(chipDays, customDate, time) {
    let base = null;
    if (chipDays != null) base = startOfDayPlus(chipDays);
    else if (customDate) {
      const parts = customDate.split("-").map(Number);
      if (parts.length === 3 && !parts.some(isNaN)) base = new Date(parts[0], parts[1] - 1, parts[2]);
    }
    if (!base) return null;
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
      .jt-todo{display:flex;flex-direction:column;gap:2px;}

      /* list */
      .jt-todo-list{display:flex;flex-direction:column;}
      .jt-todo-item{display:flex;align-items:flex-start;gap:9px;padding:8px 2px;
        border-bottom:1px solid var(--line);}
      .jt-todo-item:last-child{border-bottom:none;}
      .jt-todo-check{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:18px;
        height:18px;margin-top:1px;border:1.5px solid var(--line-strong);border-radius:50%;background:var(--bg);
        cursor:pointer;color:transparent;transition:background .12s ease,border-color .12s ease,color .12s ease;}
      .jt-todo-check:hover{border-color:var(--accent);}
      .jt-todo-check svg{width:12px;height:12px;stroke-width:3;}
      .jt-todo-check.done{background:var(--accent);border-color:var(--accent);color:var(--accent-fg);}
      .jt-todo-check:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
      .jt-todo-body{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px;}
      .jt-todo-title{font-size:13.5px;line-height:1.4;color:var(--ink);overflow-wrap:anywhere;}
      .jt-todo-item.done .jt-todo-title{color:var(--ink-3);text-decoration:line-through;}
      .jt-todo-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}
      .jt-todo-due{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:500;
        color:var(--ink-3);}
      .jt-todo-due svg{width:12px;height:12px;}
      .jt-todo-item.done .jt-todo-due{color:var(--ink-3);opacity:.7;}
      /* overdue: a filled destructive pill, matching the web app's reminders feed */
      .jt-todo-overdue{display:inline-flex;align-items:center;gap:4px;white-space:nowrap;font-size:11.5px;
        font-weight:600;padding:1px 8px;border-radius:999px;background:var(--danger-bg);color:var(--danger);}
      .jt-todo-overdue svg{width:12px;height:12px;}
      .jt-todo-auto{font-size:10px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;
        padding:1px 6px;border-radius:5px;background:var(--accent-bg);color:var(--accent-ink);}
      /* row hover affordances (convert + delete) — quiet until the row is hovered */
      .jt-todo-act{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:26px;height:26px;
        border:none;background:none;cursor:pointer;border-radius:6px;color:var(--ink-3);opacity:0;
        transition:opacity .12s ease,background .12s ease,color .12s ease;}
      .jt-todo-item:hover .jt-todo-act,.jt-todo-act:focus-visible{opacity:1;}
      .jt-todo-act svg{width:15px;height:15px;}
      .jt-todo-act:focus-visible{outline:2px solid var(--accent);outline-offset:1px;}
      .jt-todo-convert:hover{background:var(--accent-bg);color:var(--accent-ink);}
      .jt-todo-del:hover{background:var(--danger-bg);color:var(--danger);}

      /* composer (always present — the fast path) */
      .jt-todo-composer{display:flex;align-items:center;gap:9px;padding:9px 2px 2px;}
      .jt-todo-composer .lead{flex:0 0 auto;display:flex;color:var(--ink-3);opacity:.55;}
      .jt-todo-composer .lead svg{width:16px;height:16px;}
      .jt-todo-input{flex:1 1 auto;min-width:0;font-family:var(--font);font-size:13.5px;line-height:1.4;
        color:var(--ink);background:transparent;border:none;padding:2px 0;}
      .jt-todo-input::placeholder{color:var(--ink-3);}
      .jt-todo-input:focus{outline:none;}
      .jt-todo-bell{flex:0 0 auto;display:flex;align-items:center;justify-content:center;width:28px;height:28px;
        border:none;background:none;cursor:pointer;border-radius:6px;color:var(--ink-3);
        transition:background .12s ease,color .12s ease,opacity .12s ease;}
      .jt-todo-bell:hover{background:var(--bg-hover);color:var(--ink);}
      .jt-todo-bell.on{background:var(--accent-bg);color:var(--accent-ink);}
      .jt-todo-bell[disabled]{opacity:.4;cursor:default;}
      .jt-todo-bell svg{width:15px;height:15px;}
      .jt-todo-bell:focus-visible{outline:2px solid var(--accent);outline-offset:1px;}

      /* schedule popover (inline card; one open at a time) */
      .jt-todo-sched{display:flex;flex-direction:column;gap:9px;margin:4px 0 8px;padding:11px;
        border:1px solid var(--line);border-radius:var(--r2);background:var(--bg-sunken);}
      .jt-todo-chips{display:flex;flex-wrap:wrap;gap:6px;}
      .jt-todo-chip{font-family:var(--font);font-size:11.5px;font-weight:600;cursor:pointer;padding:5px 11px;
        border-radius:999px;border:1px solid var(--line-strong);background:var(--bg);color:var(--ink-2);
        transition:border-color .12s ease,background .12s ease,color .12s ease;}
      .jt-todo-chip:hover{border-color:var(--accent);color:var(--ink);}
      .jt-todo-chip[aria-pressed="true"]{border-color:var(--accent);background:var(--accent-bg);
        color:var(--accent-ink);}
      .jt-todo-chip:focus-visible{outline:2px solid var(--accent);outline-offset:1px;}
      .jt-todo-when{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
      .jt-todo-date,.jt-todo-time{font-family:var(--font);font-size:12.5px;color:var(--ink);
        background:var(--bg);border:1px solid var(--line);border-radius:var(--r1);padding:6px 8px;
        transition:border-color .14s ease,box-shadow .14s ease;}
      .jt-todo-date:focus,.jt-todo-time:focus{outline:none;border-color:var(--accent);box-shadow:var(--ring);}
      .jt-todo-sched-actions{display:flex;align-items:center;gap:8px;}
      .jt-todo-set{font-family:var(--font);font-weight:600;font-size:12.5px;display:inline-flex;
        align-items:center;justify-content:center;gap:6px;cursor:pointer;border:1px solid transparent;
        border-radius:var(--r2);padding:7px 13px;line-height:1;background:var(--accent);color:var(--accent-fg);
        transition:background .14s ease,opacity .14s ease;}
      .jt-todo-set svg{width:14px;height:14px;}
      .jt-todo-set:hover{background:var(--accent-press);}
      .jt-todo-set[disabled]{opacity:.5;cursor:default;}
      .jt-todo-set:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
      .jt-todo-cancel{font-family:var(--font);font-size:12.5px;font-weight:600;cursor:pointer;border:none;
        background:none;color:var(--ink-3);padding:7px 8px;border-radius:6px;}
      .jt-todo-cancel:hover{color:var(--ink);background:var(--bg-hover);}
    `;
  }

  function render(container, ctx) {
    if (!container) return;
    ctx = ctx || {};
    container.replaceChildren();

    // Scoped styles, injected once per container (the modal re-renders cheaply; guard a dup).
    if (!container.querySelector("style[data-jt-todo]")) {
      const style = el("style");
      style.setAttribute("data-jt-todo", "");
      style.textContent = styles();
      container.append(style);
    }

    // Working copy of the list + pending server-side deletions. Every mutation runs through
    // commit() → onChange, which persists both into the posting's local record.
    let todos = Array.isArray(ctx.todos) ? ctx.todos.map((t) => ({ ...t })) : [];
    let deleted = Array.isArray(ctx.deleted) ? ctx.deleted.slice() : [];
    const onChange = typeof ctx.onChange === "function" ? ctx.onChange : () => {};

    const wrap = el("div", { class: "jt-todo" });
    container.append(wrap);
    const listEl = el("div", { class: "jt-todo-list" });
    wrap.append(listEl);

    // Only one schedule popover open at a time (composer OR a row's convert).
    let activeSched = null;
    function closeSched() {
      if (activeSched) {
        activeSched.remove();
        activeSched = null;
      }
    }

    function commit() {
      // Open (not-done) sort before done; otherwise stable insertion order.
      todos.sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1));
      onChange(todos, deleted);
      renderList();
    }

    // ---- schedule popover ----
    // Builds the chips + date/time card. `onPick({dueAt, hasTime})` fires on confirm. Inserted after
    // `anchor` in the DOM. `initial` pre-selects an existing due (used by the convert flow).
    function openSched(anchor, initial, onPick) {
      closeSched();
      let chipDays = null;
      const chipBtns = [];
      const chipsRow = el("div", { class: "jt-todo-chips" });
      CHIPS.forEach((c) => {
        const b = el("button", { class: "jt-todo-chip", type: "button", "aria-pressed": "false", text: c.label });
        b.addEventListener("click", () => {
          const on = chipDays !== c.days;
          chipDays = on ? c.days : null;
          if (on) dateInput.value = "";
          chipBtns.forEach((x) => x.setAttribute("aria-pressed", "false"));
          b.setAttribute("aria-pressed", on ? "true" : "false");
          syncConfirm();
        });
        chipBtns.push(b);
        chipsRow.append(b);
      });

      const dateInput = el("input", { class: "jt-todo-date", type: "date", "aria-label": "Custom date" });
      const timeInput = el("input", { class: "jt-todo-time", type: "time", "aria-label": "Time (optional)" });
      if (initial && initial.dueAt) {
        const d = new Date(initial.dueAt);
        if (!isNaN(d.getTime())) {
          const pad = (n) => String(n).padStart(2, "0");
          dateInput.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          if (initial.hasTime) timeInput.value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
        }
      }
      dateInput.addEventListener("input", () => {
        if (dateInput.value) {
          chipDays = null;
          chipBtns.forEach((x) => x.setAttribute("aria-pressed", "false"));
        }
        syncConfirm();
      });

      const setBtn = el("button", { class: "jt-todo-set", type: "button" });
      setBtn.append(icon(ICON.bell), el("span", { text: "Set reminder" }));
      const cancelBtn = el("button", { class: "jt-todo-cancel", type: "button", text: "Cancel" });
      cancelBtn.addEventListener("click", closeSched);
      function syncConfirm() {
        setBtn.disabled = chipDays == null && !dateInput.value;
      }
      setBtn.addEventListener("click", () => {
        const due = buildDue(chipDays, dateInput.value, timeInput.value);
        if (!due) return;
        onPick(due);
        closeSched();
      });

      const card = el("div", { class: "jt-todo-sched" }, [
        chipsRow,
        el("div", { class: "jt-todo-when" }, [dateInput, timeInput]),
        el("div", { class: "jt-todo-sched-actions" }, [setBtn, cancelBtn]),
      ]);
      syncConfirm();
      anchor.after(card);
      activeSched = card;
      (chipBtns[0] || dateInput).focus();
    }

    // ---- list ----
    function renderList() {
      listEl.replaceChildren();
      todos.forEach((t) => listEl.append(itemRow(t)));
    }

    function itemRow(t) {
      const done = !!t.done;
      const system = t.type === "system";
      const overdue = !done && t.dueAt && isOverdue(t.dueAt, t.hasTime);
      const row = el("div", { class: "jt-todo-item" + (done ? " done" : "") });

      const check = el("button", {
        class: "jt-todo-check" + (done ? " done" : ""),
        type: "button",
        "aria-pressed": done ? "true" : "false",
        "aria-label": done ? "Mark as not done" : "Mark as done",
        title: done ? "Mark as not done" : "Mark as done",
      });
      check.append(icon(ICON.check));
      check.addEventListener("click", () => {
        closeSched();
        t.done = !t.done;
        commit();
      });

      const body = el("div", { class: "jt-todo-body" });
      body.append(el("span", { class: "jt-todo-title", text: t.title || "To-do" }));
      const meta = el("div", { class: "jt-todo-meta" });
      const dueLabel = formatDue(t.dueAt, t.hasTime);
      if (dueLabel) {
        if (overdue) {
          meta.append(
            el("span", { class: "jt-todo-overdue" }, [icon(ICON.alert), el("span", { text: dueLabel })]),
          );
        } else {
          meta.append(
            el("span", { class: "jt-todo-due" }, [icon(ICON.bell), el("span", { text: dueLabel })]),
          );
        }
      }
      if (system) {
        meta.append(el("span", { class: "jt-todo-auto", title: "Created automatically", text: "Auto" }));
      }
      if (meta.childNodes.length) body.append(meta);
      row.append(check, body);

      // A plain (undated) to-do gets a "remind me" affordance to convert it into a reminder.
      // Dated rows already show their bell + due; system rows aren't user-editable.
      if (!t.dueAt && !done && !system) {
        const convert = el("button", {
          class: "jt-todo-act jt-todo-convert",
          type: "button",
          "aria-label": `Remind me about "${t.title}"`,
          title: "Remind me — pick a date",
        });
        convert.append(icon(ICON.bellPlus));
        convert.addEventListener("click", () => {
          const isOpen = activeSched && activeSched.previousSibling === row;
          if (isOpen) return closeSched();
          openSched(row, null, (due) => {
            t.dueAt = due.dueAt;
            t.hasTime = due.hasTime;
            commit();
          });
        });
        row.append(convert);
      }

      // System reminders are managed by the backend — no manual delete.
      if (!system) {
        const del = el("button", {
          class: "jt-todo-act jt-todo-del",
          type: "button",
          "aria-label": `Delete "${t.title}"`,
          title: "Delete",
        });
        del.append(icon(ICON.x));
        del.addEventListener("click", () => {
          closeSched();
          todos = todos.filter((x) => x.id !== t.id);
          // A synced todo must be removed server-side on the next save; queue its remoteId.
          if (t.remoteId && deleted.indexOf(t.remoteId) === -1) deleted.push(t.remoteId);
          commit();
        });
        row.append(del);
      }

      return row;
    }

    // ---- composer (type + Enter = plain to-do; bell = dated reminder) ----
    const input = el("input", {
      class: "jt-todo-input",
      type: "text",
      placeholder: "Add a task…",
      "aria-label": "Add a task",
      maxlength: "300", // mirrors createReminderSchema's cap
    });
    const bell = el("button", {
      class: "jt-todo-bell",
      type: "button",
      "aria-label": "Remind me — pick a date",
      title: "Remind me — pick a date",
    });
    bell.append(icon(ICON.bell));

    function addTodo(title, due) {
      const clean = (title || "").trim();
      if (!clean) {
        input.focus();
        return false;
      }
      const todo = { id: newId(), title: clean, done: false };
      if (due) {
        todo.dueAt = due.dueAt;
        todo.hasTime = due.hasTime;
      }
      todos.push(todo);
      input.value = "";
      syncBell();
      commit();
      input.focus();
      return true;
    }

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        closeSched();
        addTodo(input.value);
      }
    });
    input.addEventListener("input", syncBell);
    function syncBell() {
      bell.disabled = input.value.trim().length === 0;
      if (bell.disabled) bell.classList.remove("on");
    }

    bell.addEventListener("click", () => {
      if (bell.disabled) return;
      const isOpen = activeSched && activeSched.previousSibling === composer;
      if (isOpen) {
        bell.classList.remove("on");
        return closeSched();
      }
      bell.classList.add("on");
      openSched(composer, null, (due) => {
        bell.classList.remove("on");
        addTodo(input.value, due);
      });
    });

    const composer = el("div", { class: "jt-todo-composer" }, [
      el("span", { class: "lead" }, [icon(ICON.plus)]),
      input,
      bell,
    ]);
    wrap.append(composer);

    syncBell();
    renderList();
  }

  root.JTTodo = { render };
})(typeof self !== "undefined" ? self : this);
