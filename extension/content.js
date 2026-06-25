// Content script (ISOLATED world) — the orchestrator.
//
// Simplified pipeline: the Save button is ALWAYS available (a small corner pill). When
// the user clicks it we CAPTURE the page's readable text (parsers/capture.js — generic,
// no per-site parsing) and hand it to the backend, which runs ONE Groq call (server-side)
// and returns the structured fields AND the cleaned description. The modal opens
// immediately and fills in when the extraction resolves. The user reviews/edits, saves.
//
// We read only the rendered DOM and issue no page-level fetch/XHR, which keeps us
// ban-safe on instrumented sites. Extraction is user-triggered, so we never spend tokens
// while the user is merely browsing.
//
// Modules loaded before this file via the manifest: JobTracker.scope (capture);
// UI: JobTracker.ui.{button,modal}.
(function () {
  const JT = self.JobTracker || {};
  const UI = JT.ui || {};
  const SCOPE = JT.scope || {};
  const FONT_STYLE_ID = "jobtracker-font";
  const DASHBOARD_URL = "http://localhost:3100/dashboard";
  const DASHBOARD_SAVED_URL = "http://localhost:3100/dashboard/saved";
  // Deep-link to a saved posting in the dashboard. The id rides along as a query param so the
  // saved page can highlight it later; on its own it lands the user on their saved jobs.
  function viewUrlFor(id) {
    return id ? `${DASHBOARD_SAVED_URL}?job=${encodeURIComponent(id)}` : DASHBOARD_SAVED_URL;
  }
  // Everything the panel extracts for a posting — the Details snapshot AND the application
  // questions — is cached together in one per-posting record in chrome.storage.local
  // (survives panel close, sub-page navigation, AND browser restart — no backend).
  //
  // Records are keyed by a normalized page id (host + pathname). The catch: a posting often
  // spans sibling sub-URLs — the job page (…/jobs/123) and its application step (…/jobs/123/apply).
  // So lookups don't use an exact key; they WALK UP the path (deepest first) and reuse the
  // nearest ancestor record. The resolved key — the "anchor" — is computed once when the
  // panel opens, and every write that session goes back to it. Net effect: extract details on
  // the job page, click Apply, reopen on …/apply → the same record, details intact. Nothing
  // here is site-specific; it's pure path geometry.
  const JOB_PREFIX = "jt:job:";

  // Anchors already revalidated against the DB during THIS page load (in-memory, per content-script
  // instance). The saved/unsaved tick is driven purely by chrome.storage.local; the DB is hit only
  // ONCE per posting per page load, the first time its panel opens — reopening the panel on the same
  // page reuses the refreshed cache (no refetch). A real page reload makes a fresh instance → refetch.
  const revalidatedAnchors = new Set();

  // ---- font ----
  // Satoshi is the single product typeface — shared with the web app (webapp/app/fonts/satoshi.woff2)
  // so the extension and site read as one product. A single variable woff2 covering the 300–900
  // weight range. Keep this in sync with popup/popup.css and ui/modal.js's --font token.
  function injectFont() {
    if (document.getElementById(FONT_STYLE_ID)) return;
    const faces = `@font-face{font-family:"Satoshi";font-style:normal;font-weight:300 900;
        font-display:swap;src:url("${chrome.runtime.getURL(
          "fonts/satoshi.woff2",
        )}") format("woff2");}`;
    const style = document.createElement("style");
    style.id = FONT_STYLE_ID;
    style.textContent = faces;
    (document.head || document.documentElement).appendChild(style);
  }

  function hostname() {
    return location.hostname.replace(/^www\./, "");
  }
  function cleanHref() {
    try {
      const u = new URL(location.href);
      return u.origin + u.pathname;
    } catch {
      return location.href;
    }
  }

  // ============ open the save panel (button click) ============
  async function openSavePanel() {
    const scoped = SCOPE.scopePage ? SCOPE.scopePage() : null;
    const pageUrl = (scoped && scoped.url) || cleanHref();
    // Resolve the posting's anchor record up front (walks up sub-URLs). Both extraction
    // surfaces — Details and Application — now restore from and write to this one record, so
    // navigating between a job page and its /apply step never loses what was already pulled.
    let { id: anchorId, record } = await loadJobRecord(pageUrl);

    // If this posting is already saved, revalidate it against the DB the FIRST time its panel opens
    // this page load (the only browse-time read) so the panel mirrors the web app — details AND the
    // application form — and self-corrects if it was deleted there. Reopening the panel on the same
    // page reuses the refreshed cache; only a page reload triggers another fetch.
    if (record && record.saved && record.saved.id && !revalidatedAnchors.has(anchorId)) {
      const fresh = await revalidateSaved(record.saved.id);
      if (fresh) {
        // Definitive answer (found or deleted) → cache for this page load so reopening won't refetch.
        revalidatedAnchors.add(anchorId);
        if (fresh.job === null) {
          record = await clearSavedRecord(anchorId);
          if (UI.button && UI.button.setState) UI.button.setState("idle");
        } else if (fresh.job) {
          record = await applyServerJob(anchorId, fresh.job);
        }
      }
    }

    // For an already-saved posting, refresh the cached reminders into the anchored record (best
    // effort, fire-and-forget). The modal's reminders section fetches its own live list on open;
    // this just keeps the local-first record in step so it carries `reminders` like details/questions.
    if (record && record.saved && record.saved.id) {
      refreshReminders(anchorId, record.saved.id);
    }

    // Seed the modal with what we have before any extraction (url, a title hint). The restored
    // record (if any) fills the rest; otherwise the user triggers extraction or types manually.
    const initial = {
      title: (scoped && scoped.titleHint) || "",
      company: "",
      location: "",
      salary: "",
      employmentType: "",
      workplaceType: "",
      url: pageUrl,
      description: "",
      source: (scoped && scoped.source) || hostname(),
      logoUrl: "",
    };
    // If this posting has already been saved (persisted per anchor), the panel opens straight
    // into its "already tracked" state — primary action becomes "View in dashboard".
    const savedRec = record && record.saved;
    UI.modal.open(initial, {
      dashboardUrl: DASHBOARD_URL,
      savedJob: savedRec && savedRec.id ? { id: savedRec.id, viewUrl: viewUrlFor(savedRec.id) } : null,
      // ---- Details (now user-triggered, like Application) ----
      // loadDetails restores a prior Details snapshot so reopening — including on a sub-URL —
      // isn't blank. onDetailsChange persists the live snapshot (debounced) so edits ride along.
      // onExtractDetails runs the LLM auto-fill ONLY when the user asks (no tokens on open).
      loadDetails: () => Promise.resolve((record && record.details) || null),
      onDetailsChange: (details) => mergeJobRecord(anchorId, { details }),
      onExtractDetails: () =>
        scoped && scoped.text
          ? requestExtraction(scoped)
          : Promise.reject(new Error("Couldn't read this page's content.")),
      // ---- Application (unchanged flow; now stored in the same anchored record) ----
      // Restores the cached questions and — for an already-saved job — the current answers, so the
      // panel shows the live values read-only (the user can copy them out). `saved` flips the form
      // into that read-only answer view; a fresh, unsaved extraction stays an editable preview.
      loadApplication: () =>
        Promise.resolve(
          record && record.questions
            ? {
                questions: record.questions,
                answers: record.answers || null,
                saved: !!(record.saved && record.saved.id),
              }
            : null,
        ),
      onApplicationExtracted: (questions) => mergeJobRecord(anchorId, { questions }),
      // User-triggered. Re-captures the page at click time so the user can open/expand the
      // actual form first. Resolves to { questions } or rejects → the modal's error/retry state.
      onExtractApplication: () => requestApplicationExtraction(),
      onConfirm: (finalJob) => saveJob(finalJob, anchorId),
    });
  }

  // ============ dev / dummy save panel (no backend, no Groq) ============
  // Opens the exact same modal as openSavePanel, but every async hook resolves instantly with
  // canned local data so the Details + Application UI can be designed against without hitting
  // the backend or spending tokens. Visually triggered by the amber "flask" button.

  // A small inline-SVG monogram so the header logo path is exercised without a network fetch.
  const DUMMY_LOGO =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
        '<rect width="64" height="64" rx="14" fill="#2b6a4b"/>' +
        '<text x="32" y="42" font-family="system-ui,sans-serif" font-size="32" font-weight="700" ' +
        'fill="#fff" text-anchor="middle">N</text></svg>',
    );

  const DUMMY_FIELDS = {
    title: "Senior Frontend Engineer",
    company: "Northwind Labs",
    location: "San Francisco, CA (Remote OK)",
    salary: "$180K – $230K + equity",
    employmentType: "Full-time",
    workplaceType: "Remote",
  };

  const DUMMY_DESCRIPTION =
    "<p>Northwind Labs builds tools that thousands of teams rely on every day. We're a small, " +
    "senior team that ships fast and sweats the details.</p>" +
    "<h3>What you'll do</h3><ul>" +
    "<li>Own complex features end to end across our web app.</li>" +
    "<li>Partner with design to turn rough ideas into polished, accessible UI.</li>" +
    "<li>Set the bar for frontend quality, performance, and testing.</li></ul>" +
    "<h3>What we're looking for</h3><ul>" +
    "<li>5+ years building production React/TypeScript applications.</li>" +
    "<li>A strong eye for interaction detail and design systems.</li>" +
    "<li>Comfort working autonomously in a remote-first team.</li></ul>" +
    "<p>We offer competitive pay, meaningful equity, and a genuine remote culture.</p>";

  // A spread of question types so the Application renderer's every control is exercised.
  const DUMMY_QUESTIONS = [
    { type: "short_text", label: "Full name", required: true, placeholder: "Jane Doe" },
    { type: "email", label: "Email", required: true, placeholder: "you@example.com" },
    { type: "tel", label: "Phone", placeholder: "+1 555 0100" },
    { type: "url", label: "LinkedIn / portfolio", placeholder: "https://…" },
    { type: "number", label: "Years of experience", placeholder: "5" },
    { type: "date", label: "Earliest start date" },
    {
      type: "select",
      label: "How did you hear about us?",
      options: ["LinkedIn", "Referral", "Job board", "Other"],
      placeholder: "Choose one",
    },
    {
      type: "radio",
      label: "Are you authorized to work in the US?",
      required: true,
      options: ["Yes", "No"],
    },
    {
      type: "multi_select",
      label: "Which time zones overlap with yours?",
      options: ["PT", "MT", "CT", "ET", "GMT"],
    },
    {
      type: "long_text",
      label: "Why do you want to work here?",
      required: true,
      placeholder: "Tell us a bit…",
      helpText: "A few sentences is plenty.",
    },
    { type: "file", label: "Resume / CV", required: true, helpText: "PDF preferred." },
    { type: "checkbox", label: "I agree to the candidate privacy policy.", required: true },
  ];

  function openDummySavePanel() {
    const initial = {
      title: "",
      company: "",
      location: "",
      salary: "",
      employmentType: "",
      workplaceType: "",
      url: "https://example.com/jobs/senior-frontend-engineer",
      description: "",
      source: "example.com",
      logoUrl: DUMMY_LOGO,
      skills: ["React", "TypeScript", "GraphQL", "Design Systems"],
    };
    UI.modal.open(initial, {
      dashboardUrl: DASHBOARD_URL,
      savedJob: null,
      // Every hook resolves instantly with canned data — no worker message, no Groq. Both
      // extractions start blank (user-triggered) so the dev panel mirrors the real flow.
      loadDetails: () => Promise.resolve(null),
      onDetailsChange: () => {},
      onExtractDetails: () => Promise.resolve({ fields: DUMMY_FIELDS, description: DUMMY_DESCRIPTION }),
      loadApplication: () => Promise.resolve(null),
      onApplicationExtracted: () => {},
      onExtractApplication: () => Promise.resolve({ questions: DUMMY_QUESTIONS }),
      // No real save: flip the dev button to its confirmed state and resolve a view link so the
      // success view's "View in dashboard" CTA works.
      onConfirm: () => {
        UI.devButton.setState("saved");
        return Promise.resolve({ viewUrl: DASHBOARD_URL });
      },
    });
  }

  // ---- per-posting record store (path-prefix anchored) ----

  // Normalize a URL to a stable record id: "host/path", no scheme/query/hash/www, no trailing
  // slash. This is what records are keyed by (under JOB_PREFIX).
  function pageId(url) {
    try {
      const u = new URL(url);
      return u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/+$/, "");
    } catch (_) {
      return String(url || "");
    }
  }

  // Candidate ids for a page, deepest first: the page itself, then each shallower ancestor path
  // down to (but not including) the bare host — so siblings never collide, but a sub-page finds
  // its parent. "host/jobs/123/apply" → ["host/jobs/123/apply", "host/jobs/123", "host/jobs"].
  function candidateIds(url) {
    const id = pageId(url);
    const slash = id.indexOf("/");
    if (slash === -1) return [id]; // bare host — only matches itself
    const host = id.slice(0, slash);
    const segs = id.slice(slash + 1).split("/").filter(Boolean);
    if (!segs.length) return [host];
    const out = [];
    for (let i = segs.length; i >= 1; i--) out.push(host + "/" + segs.slice(0, i).join("/"));
    return out;
  }

  function recordKey(id) {
    return JOB_PREFIX + id;
  }

  // Resolve the anchor for a page: the deepest EXISTING record among the page's candidate ids,
  // or — if none yet — the page's own id (so the first extraction here becomes the anchor).
  // Resolves to { id, record }; never rejects.
  function loadJobRecord(url) {
    return new Promise((resolve) => {
      const ids = candidateIds(url);
      try {
        chrome.storage.local.get(ids.map(recordKey), (r) => {
          if (chrome.runtime.lastError || !r) return resolve({ id: ids[0], record: null });
          for (const id of ids) {
            if (r[recordKey(id)]) return resolve({ id, record: r[recordKey(id)] });
          }
          resolve({ id: ids[0], record: null });
        });
      } catch (_) {
        resolve({ id: ids[0], record: null });
      }
    });
  }

  function getJobRecord(id) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(recordKey(id), (r) => {
          resolve((r && r[recordKey(id)]) || null);
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  // Shallow-merge a partial into the anchor record (e.g. { details } or { questions }).
  // Best-effort: a storage failure must never break the extraction the user just ran.
  function mergeJobRecord(id, partial) {
    try {
      const key = recordKey(id);
      chrome.storage.local.get(key, (r) => {
        if (chrome.runtime.lastError) return;
        const prev = (r && r[key]) || {};
        chrome.storage.local.set({ [key]: { ...prev, ...partial, savedAt: Date.now() } });
      });
    } catch (_) {}
  }

  // Overwrite the whole anchor record (used by revalidation, which must also DELETE keys — a merge
  // can't remove `saved`). Resolves once written; never rejects.
  function setJobRecord(id, record) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [recordKey(id)]: record }, () => resolve());
      } catch (_) {
        resolve();
      }
    });
  }

  // ---- revalidate-on-open (stale-while-revalidate) ----
  // The saved/unsaved button state and the panel's restored snapshot come from chrome.storage.local
  // (zero DB reads while browsing). The ONE place that can drift is after the user edits or deletes
  // the job in the web app. So when the panel opens on an ALREADY-SAVED posting, we do a single
  // GET /api/jobs/:id to refresh the cached snapshot (or clear it if the job was deleted). This is
  // the only browse-time DB read, and only for a posting the user already saved.
  function revalidateSaved(id) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(v);
      };
      // Network is slow / worker asleep → don't make the user wait: open with the cached snapshot.
      const timer = setTimeout(() => finish(undefined), 2500);
      try {
        chrome.runtime.sendMessage({ type: "GET_JOB", id }, (res) => {
          if (chrome.runtime.lastError || !res || !res.ok) return finish(undefined);
          finish({ job: res.job }); // res.job === null ⇒ deleted in the web app
        });
      } catch (_) {
        finish(undefined);
      }
    });
  }

  // Refresh the cached record from the server job (source of truth). Server values win when present;
  // otherwise keep what was cached (so a field the server happens not to return isn't blanked).
  async function applyServerJob(anchorId, job) {
    const prev = (await getJobRecord(anchorId)) || {};
    const pd = prev.details || {};
    // The application form as saved (GET /api/jobs/:id includes it). Refresh the cached questions —
    // incl. the flagged state — so the Application tab matches the web app. Keep cached questions
    // when the server has none (job saved without a form).
    const serverQuestions =
      job.application && Array.isArray(job.application.questions) && job.application.questions.length
        ? job.application.questions
        : null;
    // The saved answers ({ questionId: value }) ride along on the same fetch — cached so the panel
    // shows the current values (read-only) without any extra read. Only meaningful alongside
    // questions; default to {} so a saved job with no answers yet still reads as "answered: none".
    const serverAnswers =
      serverQuestions && job.application.answers && typeof job.application.answers === "object"
        ? job.application.answers
        : null;
    const next = {
      ...prev,
      details: {
        title: job.title || pd.title || "",
        company: job.company || pd.company || "",
        location: job.location || pd.location || "",
        salary: job.salary || pd.salary || "",
        url: job.url || pd.url || "",
        employmentType: job.employmentType || pd.employmentType || "",
        workplaceType: job.workplaceType || pd.workplaceType || "",
        description: job.description || pd.description || "",
        notes: job.notes || pd.notes || "",
        extracted: true,
      },
      ...(serverQuestions ? { questions: serverQuestions, answers: serverAnswers || {} } : {}),
      saved: { id: job.id, url: job.url || "", savedAt: Date.now() },
    };
    await setJobRecord(anchorId, next);
    return next;
  }

  // Drop the local "saved" marker after the job was deleted in the web app, so the panel/button
  // stop claiming it's tracked. Cached details stay (the posting is still on the page, easy to re-save).
  async function clearSavedRecord(anchorId) {
    const prev = await getJobRecord(anchorId);
    if (!prev) return null;
    const next = { ...prev };
    delete next.saved;
    await setJobRecord(anchorId, next);
    return next;
  }

  // Cache the saved job's reminders into its anchored record (best effort). The reminders UI in
  // the modal reads its live list straight from the worker; this keeps the local-first record in
  // step so `reminders` rides alongside details/questions/answers. Never blocks panel open.
  function refreshReminders(anchorId, jobId) {
    try {
      chrome.runtime.sendMessage({ type: "LIST_JOB_REMINDERS", jobId }, (res) => {
        if (chrome.runtime.lastError || !res || !res.ok) return;
        mergeJobRecord(anchorId, { reminders: Array.isArray(res.reminders) ? res.reminders : [] });
      });
    } catch (_) {}
  }

  // Re-scope the current DOM and ask the worker (→ backend → Groq) for the application
  // form's questions. Mirrors requestExtraction; only the message type / shape differs.
  function requestApplicationExtraction() {
    const scoped = SCOPE.scopePage ? SCOPE.scopePage() : null;
    if (!scoped || !scoped.text) {
      return Promise.reject(new Error("Couldn't read this page's content."));
    }
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(
          {
            type: "EXTRACT_APPLICATION",
            context: { text: scoped.text, source: scoped.source, url: scoped.url },
          },
          (res) => {
            if (chrome.runtime.lastError) {
              return reject(new Error(chrome.runtime.lastError.message));
            }
            if (res && res.ok) resolve({ questions: res.questions || [] });
            else reject(new Error((res && res.error) || "Extraction failed"));
          },
        );
      } catch (e) {
        reject(e);
      }
    });
  }

  // Ask the worker (→ backend → Groq) for the structured fields and cleaned description.
  // Rejects on any failure so the modal can fall back to manual entry; never blocks the
  // save itself.
  function requestExtraction(scoped) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(
          {
            type: "EXTRACT_JOB",
            context: {
              text: scoped.text,
              source: scoped.source,
              url: scoped.url,
            },
          },
          (res) => {
            if (chrome.runtime.lastError) {
              return reject(new Error(chrome.runtime.lastError.message));
            }
            if (res && res.ok) resolve({ fields: res.fields || {}, description: res.description });
            else reject(new Error((res && res.error) || "Extraction failed"));
          },
        );
      } catch (e) {
        reject(e);
      }
    });
  }

  async function saveJob(job, anchorId) {
    const payload = {
      title: job.title,
      company: job.company,
      url: job.url || "",
      location: job.location || "",
      description: job.description || "",
      salary: job.salary || "",
      employmentType: job.employmentType || "",
      workplaceType: job.workplaceType || "",
      source: job.source || hostname(),
      logoUrl: job.logoUrl || "",
      notes: job.notes || "",
      deadline: job.deadline ? new Date(job.deadline).toISOString() : undefined,
      // Opt-in flag from the save panel. Forwarded to the worker, which decides whether
      // to kick off background AI prep once that backend exists (no-op until then).
      aiPrep: !!job.aiPrep,
    };
    // Application questions are OPTIONAL: include them only when the user actually extracted
    // them for this posting (cached in the anchored record). No extraction → no `application`
    // field → the backend saves nothing application-related for this job.
    const rec = await getJobRecord(anchorId);
    const questions = rec && rec.questions;
    if (questions && questions.length) {
      payload.application = { questions };
    }
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "SAVE_JOB", job: payload }, (res) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (res && res.ok) {
          const saved = res.job || {};
          // Remember that this posting is now tracked (per anchor) so reopening — including on
          // a sub-URL — shows "View in dashboard" instead of prompting to save again.
          mergeJobRecord(anchorId, { saved: { id: saved.id, url: payload.url || "", savedAt: Date.now() } });
          // Persistent tick + a one-shot pop to confirm the save. It stays ticked from here on
          // (the record is now saved); navigation re-derives the state per page.
          lastAnchorId = anchorId;
          UI.button.setState("saved", { animate: true });
          resolve({ id: saved.id, viewUrl: viewUrlFor(saved.id) });
        } else {
          reject(new Error((res && res.error) || "Save failed"));
        }
      });
    });
  }

  // ---- wire up ----
  // The content script matches every http(s) URL, which includes standalone NON-HTML resources —
  // a directly-served .svg/.svgz, raw XML/JSON, an image. Those have no styleable HTML DOM
  // (document.body is absent, createElement("div").style is undefined), so injecting our UI throws
  // ("Cannot set properties of undefined (setting 'all')"). Only initialize on real HTML pages.
  function isInjectableDocument() {
    try {
      if (!document.body) return false;
      const probe = document.createElement("div");
      return !!(probe && probe.style);
    } catch (_) {
      return false;
    }
  }
  if (!isInjectableDocument()) return;

  injectFont();
  UI.button.show(openSavePanel);
  // Second, dummy-data button (no backend/Groq) for fast UI iteration.
  if (UI.devButton && UI.devButton.show) UI.devButton.show(openDummySavePanel);

  // ---- per-page saved-state status light ----
  // The Save button doubles as a status light: a persistent tick whenever THIS posting is
  // already saved (record.saved exists for its anchor), a bookmark otherwise. We derive that
  // purely from the URL → storage — no DOM, no wait on the posting's content to render — so it's
  // correct the instant the page or an SPA route settles.
  let lastHref = location.href;
  let lastAnchorId = null; // the posting we last resolved; used to tell a real posting-change
  //                          from same-posting churn (job page → /apply, query-only changes).
  let refreshGen = 0;      // bumps per refresh so a slow storage read can't clobber a newer nav.

  async function refreshButtonForPage() {
    const gen = ++refreshGen;
    const { id, record } = await loadJobRecord(cleanHref());
    if (gen !== refreshGen) return null; // superseded by a newer navigation — drop this result
    UI.button.setState(record && record.saved ? "saved" : "idle");
    return { id, record };
  }

  // Initial paint: flip to the tick if this page is already tracked.
  refreshButtonForPage().then((res) => { lastAnchorId = res ? res.id : null; });

  // SPA navigations (LinkedIn et al. swap the posting without a full reload). Re-derive the
  // button state for the new page; only tear down the open modal / dev tick when the posting
  // actually CHANGES. Navigating within the same posting leaves an already-saved job's UI
  // untouched — no refresh, no flicker.
  let navTimer = null;
  const onNav = () => {
    if (location.href === lastHref) return; // ignore no-op replaceState churn
    lastHref = location.href;
    const prevAnchor = lastAnchorId;
    clearTimeout(navTimer);
    // Debounce: some sites fire pushState/replaceState in bursts; act once it settles.
    navTimer = setTimeout(async () => {
      const res = await refreshButtonForPage();
      if (!res) return;
      if (res.id !== prevAnchor) {
        if (UI.modal && UI.modal.close) UI.modal.close();
        if (UI.devButton && UI.devButton.setState) UI.devButton.setState("idle");
      }
      lastAnchorId = res.id;
    }, 150);
  };
  ["pushState", "replaceState"].forEach((fn) => {
    const orig = history[fn];
    history[fn] = function () {
      const r = orig.apply(this, arguments);
      onNav();
      return r;
    };
  });
  window.addEventListener("popstate", onNav);
})();
