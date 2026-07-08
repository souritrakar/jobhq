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
  const FRAME_BRIDGE = UI.frameBridge || null;
  // Only the top frame owns UI (button/modal/nav). Sub-frames (cross-origin iframe'd application
  // forms — Greenhouse/Lever/Ashby embeds) run a headless form-sync agent that relays their
  // questions up to the top-frame panel. See ui/frame-bridge.js.
  const IS_TOP = self.top === self.self;
  // The form-sync facade the panel drives. In the top frame this becomes the cross-frame
  // aggregator (local + every sub-frame); it falls back to the bare local engine if the bridge is
  // absent (e.g. unit tests). Assigned during top-frame wiring below.
  let SYNC = UI.formSync;
  const FONT_STYLE_ID = "jobtracker-font";
  const DASHBOARD_URL = "http://localhost:3100/dashboard";
  const DASHBOARD_SAVED_URL = "http://localhost:3100/dashboard/saved";
  // Extraction strategy. "indexed" = the block-addressed pipeline (POST /api/extract*/indexed)
  // — the DEFAULT (see docs/superpowers/specs/2026-07-01-indexed-extraction-design.md).
  // Legacy paths, kept selectable during verification: "llm" (Groq whole-page),
  // "semantic" (RAG — scheduled for deletion), "tiered" (non-LLM).
  const EXTRACTION_MODE = "indexed"; // "indexed" | "llm" | "semantic" | "tiered"
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

    // For an already-saved posting, seed the local-first to-do list from the server reminders so the
    // To-do section shows what's already scheduled (incl. web-app-added ones and auto reminders).
    // Server rows win for synced state; local unsynced adds and pending deletes are preserved. Best
    // effort with a short timeout — a sleeping worker must never block the panel from opening.
    if (record && record.saved && record.saved.id) {
      const seeded = await seedTodosFromServer(anchorId, record.saved.id, record);
      if (seeded) record = seeded;
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
    // ---- live application form sync (deterministic, zero-LLM question capture) ----
    // form-sync auto-detects the page's application fields the moment the panel opens, mirrors
    // their values BOTH ways (page ⇄ panel), and keeps capturing across the form's steps/pages.
    // Everything lives in the anchored local record ({ questions, draftAnswers, ignoredKeys });
    // the DB is touched only on save. REVERT(field picker): the manual on-page picker
    // (UI.picker / ui/field-picker.js) previously drove this tray — see git history to restore.
    const MAPPER = JT.questionMapper;
    let applicationApi = null;
    // From here on `record` is the AUTHORITATIVE in-memory copy of this posting's local record. Every
    // session edit updates it and persists the WHOLE record in a single write (persistRecord) — so
    // independent fields (details / questions / todos) can never clobber one another, and no write is
    // lost to the two-hop read-modify-write that mergeJobRecord uses. It's loaded fully at open (incl.
    // any server revalidation / todo seed above), so a full-record set never drops a field.
    if (!record) record = {};
    const persistRecord = () => setJobRecord(anchorId, { ...record, savedAt: Date.now() });

    // Seed answers for the sync session: the saved job's server answers (record.answers is a
    // { questionId: value } map; the cached questions carry those ids) UNDER local drafts.
    // A draft overrides only when it actually DIVERGES from the server value — a draft that
    // merely mirrors what was already saved must not mask a later edit made in the web app.
    const seedAnswers = {};
    const qByKey = new Map();
    if (MAPPER && Array.isArray(record.questions)) {
      for (const q of record.questions) {
        if (!q || !q.label) continue;
        const key = MAPPER.keyOf(q);
        qByKey.set(key, q);
        if (record.answers && q.id != null && q.id in record.answers) {
          seedAnswers[key] = MAPPER.decodeAnswer(q, record.answers[q.id]);
        }
      }
    }
    for (const [key, draft] of Object.entries(record.draftAnswers || {})) {
      const q = qByKey.get(key);
      if (q && MAPPER && key in seedAnswers) {
        const same = MAPPER.encodeAnswer(q, draft) === MAPPER.encodeAnswer(q, seedAnswers[key]);
        if (same) continue; // already synced — let the server copy lead
      }
      seedAnswers[key] = draft;
    }

    // Persist the sync model (debounced — answer edits arrive per keystroke). Flushed on close.
    let syncPersistTimer = null;
    const persistSyncNow = () => {
      if (syncPersistTimer) {
        clearTimeout(syncPersistTimer);
        syncPersistTimer = null;
      }
      if (!SYNC || !SYNC.isActive()) return;
      // "Clear all" (Application tab): persist NOTHING application-related so the save writes no
      // questions — form-sync keeps detecting underneath, but the user opted out for this job. Undo
      // flips the flag and the live questions persist again on the next flush.
      if (record.applicationCleared) {
        record.questions = [];
        record.draftAnswers = {};
      } else {
        record.questions = SYNC.getQuestions();
        record.draftAnswers = SYNC.getAnswers();
      }
      record.ignoredKeys = SYNC.getIgnoredKeys();
      persistRecord();
    };
    const schedulePersistSync = () => {
      if (syncPersistTimer) clearTimeout(syncPersistTimer);
      syncPersistTimer = setTimeout(persistSyncNow, 400);
    };

    // If this posting has already been saved (persisted per anchor), the panel opens straight
    // into its "already tracked" state — primary action becomes "View in dashboard".
    const savedRec = record && record.saved;
    UI.modal.open(initial, {
      dashboardUrl: DASHBOARD_URL,
      savedJob: savedRec && savedRec.id ? { id: savedRec.id, viewUrl: viewUrlFor(savedRec.id) } : null,
      // ---- pipeline status ----
      // Seed the picker from the restored/server status; default Saved. A change persists locally
      // right away, and — once the posting is tracked — PATCHes the job so the stage matches the
      // job page. On the first save the chosen status rides along in the payload (createJob honours it).
      status: record.status || "SAVED",
      onStatusChange: (status) => {
        record.status = status;
        persistRecord();
        if (savedRec && savedRec.id) patchJobStatus(savedRec.id, status);
      },
      // ---- Details (now user-triggered, like Application) ----
      // loadDetails restores a prior Details snapshot so reopening — including on a sub-URL —
      // isn't blank. onDetailsChange persists the live snapshot (debounced) so edits ride along.
      // onExtractDetails runs the LLM auto-fill ONLY when the user asks (no tokens on open).
      loadDetails: () => Promise.resolve(record.details || null),
      onDetailsChange: (details) => {
        record.details = details;
        persistRecord();
      },
      onExtractDetails: () => requestExtraction(),
      // ---- Application (live mirror; stored in the same anchored record) ----
      // form-sync owns detection + values; the modal renders whatever model it pushes. Flag
      // toggles re-persist through onApplicationExtracted (the questions are the same objects
      // form-sync tracks, so getQuestions() sees the star immediately).
      onApplicationExtracted: () => schedulePersistSync(),
      // Clear all / undo for the Application tab. The flag lives in the anchored record so it
      // survives close/reopen; persistSyncNow honours it (saves no questions while cleared).
      applicationCleared: !!record.applicationCleared,
      onApplicationClearedChange: (cleared) => {
        record.applicationCleared = cleared;
        persistSyncNow();
      },
      onAnswerEdit: (key, value) => {
        if (SYNC) SYNC.setAnswer(key, value);
        schedulePersistSync();
      },
      onQuestionDismiss: (key) => {
        if (SYNC) SYNC.dismiss(key); // fires onModel → tray re-renders without the field
        schedulePersistSync();
      },
      // REVERT(LLM extraction): restore the line below to bring back extract-on-demand.
      // onExtractApplication: () => requestApplicationExtraction(),
      onApplicationReady: (api) => {
        applicationApi = api;
      },
      // ---- Resume tab documents (real, from the backend) ----
      // loadDocuments lists the user's saved resumes/CVs; fetchDocumentFile returns one as a File so
      // the panel can drag it onto a page upload field or download it.
      loadDocuments,
      fetchDocumentFile,
      // ---- To-do (local-first) ----
      // loadTodos restores the list (+ pending server-side deletions) from the anchored record so it
      // survives close / collapse / refresh. onTodosChange persists every edit immediately — nothing
      // touches the backend here; the reconcile against the reminder API runs only on save (saveJob).
      loadTodos: () =>
        Promise.resolve({
          todos: record.todos || [],
          deleted: record.todosDeleted || [],
        }),
      onTodosChange: (todos, deleted) => {
        record.todos = todos;
        record.todosDeleted = deleted;
        persistRecord();
      },
      onClose: () => {
        persistSyncNow(); // flush BEFORE deactivate — deactivate clears the sync state
        if (SYNC) SYNC.deactivate();
        if (UI.picker) UI.picker.deactivate();
      },
      // Autofill is only meaningful once the posting is saved (it fills from saved answers). Provide
      // the hook only then; the modal shows the Autofill button when this is present (read-only view).
      onAutofillMatch:
        savedRec && savedRec.id ? (fields) => requestAutofillMatch(savedRec.id, fields) : null,
      onConfirm: async (finalJob) => {
        persistSyncNow(); // capture the freshest questions/answers before the payload is built
        const result = await saveJob(finalJob, anchorId);
        // saveJob wrote the `saved` marker straight to storage, but THIS panel's in-memory `record`
        // (the authoritative copy every persist overwrites storage with) hasn't seen it. Fold it in
        // now, or the next full-record persist — deterministically the sync flush in onClose — would
        // overwrite storage WITHOUT `saved` and wipe the marker, making a reload show "Save" again.
        if (result && result.id) {
          record.saved = {
            id: result.id,
            url: result.url || (record.saved && record.saved.url) || finalJob.url || "",
            savedAt: Date.now(),
          };
          record.status = result.status || finalJob.status || record.status || "SAVED";
        }
        return result;
      },
    });

    // Start the live sync the moment the panel opens: previously captured questions restore
    // instantly (off-page until re-found), the current page's fields stream in as detected, and
    // every page edit mirrors into the tray. Deactivated on every panel close path (onClose).
    if (SYNC && MAPPER && UI.autofill) {
      SYNC.activate({
        questions: Array.isArray(record.questions) ? record.questions : [],
        answers: seedAnswers,
        ignoredKeys: Array.isArray(record.ignoredKeys) ? record.ignoredKeys : [],
        onModel: (items) => {
          if (applicationApi) applicationApi.setModel(items);
          schedulePersistSync();
        },
        onAnswer: (key, value, fromPage) => {
          // Panel-originated edits already show in the panel; only page edits need pushing.
          if (fromPage && applicationApi) applicationApi.updateAnswer(key, value);
          schedulePersistSync();
        },
      }).catch(() => {});
    }
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

  // A trailing path segment that means "the application step OF the posting above it", so the
  // job page and its apply page should share ONE record (e.g. Ashby `/{org}/{id}/application`).
  const APPLY_STEP = /^(apply|application|apply-now)$/i;

  // Candidate ids for a page, deepest first: the page itself, and — ONLY when the trailing
  // segment is a known apply step — its immediate parent, so a job page and its /apply step
  // share one record. We deliberately do NOT climb to arbitrary shallower ancestors: a shared
  // container like a company's board ("host/{org}") is an ancestor of EVERY posting under it,
  // so climbing there made one saved posting mark all its siblings as saved (the tick showed on
  // postings the user never extracted). "host/{org}/123" → ["host/{org}/123"];
  // "host/{org}/123/application" → ["host/{org}/123/application", "host/{org}/123"].
  function candidateIds(url) {
    const id = pageId(url);
    const slash = id.indexOf("/");
    if (slash === -1) return [id]; // bare host — only matches itself
    const host = id.slice(0, slash);
    const segs = id.slice(slash + 1).split("/").filter(Boolean);
    if (!segs.length) return [host];
    const out = [host + "/" + segs.join("/")]; // the page itself
    if (segs.length >= 2 && APPLY_STEP.test(segs[segs.length - 1])) {
      out.push(host + "/" + segs.slice(0, -1).join("/")); // its posting (one level up)
    }
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

  // Like mergeJobRecord, but resolves after the write lands (and to the merged record). Used where a
  // later step must read back the merge synchronously — e.g. stamping `saved` before the to-do
  // reconcile re-reads the record. Never rejects.
  function mergeJobRecordAsync(id, partial) {
    return new Promise((resolve) => {
      try {
        const key = recordKey(id);
        chrome.storage.local.get(key, (r) => {
          if (chrome.runtime.lastError) return resolve(null);
          const prev = (r && r[key]) || {};
          const next = { ...prev, ...partial, savedAt: Date.now() };
          chrome.storage.local.set({ [key]: next }, () => resolve(next));
        });
      } catch (_) {
        resolve(null);
      }
    });
  }

  // Overwrite the whole anchor record (used by revalidation, which must also DELETE keys — a merge
  // can't remove `saved`). Resolves once written; never rejects.
  function setJobRecord(id, record) {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.set({ [recordKey(id)]: record }, () => {
          // Surface (don't swallow) a failed local write — most often "Extension context
          // invalidated" after reloading the unpacked extension while an old tab is still open,
          // which silently drops edits until the tab is reloaded. A visible warning turns that
          // confusing "my todos vanished" into an actionable "reload this tab".
          if (chrome.runtime.lastError) {
            console.warn("[JobTracker] Couldn't persist locally:", chrome.runtime.lastError.message);
          }
          resolve();
        });
      } catch (e) {
        console.warn("[JobTracker] Couldn't persist locally:", (e && e.message) || e);
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
      // The pipeline stage as it stands on the server — keeps the panel's status picker in step with
      // any change made on the job page since this posting was last opened.
      status: job.status || prev.status || "SAVED",
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

  // ---- local-first to-dos (synced to the reminder API only on save) --------------------------
  // To-dos live in the anchored record (`record.todos`); pending server-side deletions in
  // `record.todosDeleted`. The drawer edits them purely locally; content.js reconciles them against
  // the reminder worker messages when the user saves. Todo shape mirrors ui/todo.js:
  //   { id, title, done, dueAt?, hasTime?, remoteId?, type?, synced? }

  // Promise wrapper over a reminder worker message (CREATE/UPDATE/DELETE). Rejects on failure.
  function sendReminderMsg(message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (res) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (res && res.ok) resolve(res);
          else reject(new Error((res && res.error) || "Reminder request failed"));
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  // Fetch the saved job's reminders (array) with a short timeout, so a sleeping worker can't hang
  // the panel open. Resolves to the array, or null on timeout/failure (→ keep the local list as-is).
  function fetchServerReminders(jobId) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (v) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(v);
      };
      const timer = setTimeout(() => finish(null), 2500);
      try {
        chrome.runtime.sendMessage({ type: "LIST_JOB_REMINDERS", jobId }, (res) => {
          if (chrome.runtime.lastError || !res || !res.ok) return finish(null);
          finish(Array.isArray(res.reminders) ? res.reminders : []);
        });
      } catch (_) {
        finish(null);
      }
    });
  }

  // Map a server reminder to the drawer's todo shape, stamping the synced snapshot so a later
  // reconcile can tell what changed locally.
  function reminderToTodo(r) {
    return {
      id: r.id,
      title: r.title || "",
      done: !!r.done,
      dueAt: r.dueAt || undefined,
      hasTime: !!r.hasTime,
      remoteId: r.id,
      type: r.type || "user",
      synced: { done: !!r.done, dueAt: r.dueAt || null, hasTime: !!r.hasTime },
    };
  }

  // Seed record.todos from the server (source of truth on open) merged with local-only work:
  // server rows win for their own state, local unsynced adds (no remoteId) are kept, and pending
  // deletes (record.todosDeleted) drop the matching server rows so a pre-save delete survives a
  // refresh. Returns the updated record, or null when the fetch failed (keep local as-is).
  async function seedTodosFromServer(anchorId, jobId, prevRecord) {
    const server = await fetchServerReminders(jobId);
    if (!server) return null;
    const rec = (await getJobRecord(anchorId)) || prevRecord || {};
    const pendingDel = new Set(Array.isArray(rec.todosDeleted) ? rec.todosDeleted : []);
    const serverTodos = server.map(reminderToTodo).filter((t) => !pendingDel.has(t.remoteId));
    const localUnsynced = (Array.isArray(rec.todos) ? rec.todos : []).filter((t) => !t.remoteId);
    const todos = serverTodos.concat(localUnsynced);
    const next = { ...rec, todos, todosDeleted: Array.from(pendingDel) };
    await setJobRecord(anchorId, next);
    return next;
  }

  // Reconcile the local to-do list against the reminder API once the posting has a job id (called
  // from saveJob). Creates un-synced todos, pushes done/due changes for synced ones, and deletes
  // queued removals. Best effort per item: a failure leaves that item un-synced for the next save
  // and never fails the save itself. Stamps remoteIds + synced snapshots back into the record.
  async function reconcileTodos(jobId, anchorId) {
    if (!jobId) return;
    const rec = await getJobRecord(anchorId);
    if (!rec) return;
    const todos = Array.isArray(rec.todos) ? rec.todos.map((t) => ({ ...t })) : [];
    const deleted = Array.isArray(rec.todosDeleted) ? rec.todosDeleted.slice() : [];
    let mutated = false;

    // Deletions first — drop from the queue only when the server confirms.
    const stillDeleted = [];
    for (const remoteId of deleted) {
      try {
        await sendReminderMsg({ type: "DELETE_REMINDER", id: remoteId });
        mutated = true;
      } catch (_) {
        stillDeleted.push(remoteId);
      }
    }

    // Creates + updates.
    for (const t of todos) {
      try {
        if (!t.remoteId) {
          const fields = { title: t.title };
          if (t.dueAt) {
            fields.dueAt = t.dueAt;
            fields.hasTime = !!t.hasTime;
          }
          const res = await sendReminderMsg({ type: "CREATE_REMINDER", jobId, fields });
          const created = res && res.reminder;
          if (created && created.id) {
            t.remoteId = created.id;
            // CREATE starts undone; if the local todo is already checked off, push that too.
            if (t.done) {
              await sendReminderMsg({ type: "UPDATE_REMINDER", id: t.remoteId, fields: { done: true } });
            }
            t.synced = { done: !!t.done, dueAt: t.dueAt || null, hasTime: !!t.hasTime };
            mutated = true;
          }
        } else {
          const s = t.synced || {};
          const patch = {};
          if (!!s.done !== !!t.done) patch.done = !!t.done;
          if ((s.dueAt || null) !== (t.dueAt || null) || !!s.hasTime !== !!t.hasTime) {
            patch.dueAt = t.dueAt || null;
            patch.hasTime = !!t.hasTime;
          }
          if (Object.keys(patch).length) {
            await sendReminderMsg({ type: "UPDATE_REMINDER", id: t.remoteId, fields: patch });
            mutated = true;
          }
          t.synced = { done: !!t.done, dueAt: t.dueAt || null, hasTime: !!t.hasTime };
        }
      } catch (_) {
        // Leave this item un-synced; it'll be retried on the next save.
      }
    }

    // Persist stamped remoteIds/synced + any deletions that couldn't be confirmed.
    const fresh = (await getJobRecord(anchorId)) || rec;
    await setJobRecord(anchorId, { ...fresh, todos, todosDeleted: stillDeleted });
    // Re-register local alarms after the mutations (fire-and-forget).
    if (mutated) {
      try {
        chrome.runtime.sendMessage({ type: "SYNC_REMINDER_ALARMS" }, () => void chrome.runtime.lastError);
      } catch (_) {}
    }
  }

  // ---- indexed capture helpers -------------------------------------------------------------
  // Capture for the INDEXED pipeline: settle the DOM (SPA hydration), harvest the live form
  // controls, then scope the page WITH the harvest so field blocks carry the q<N> ids.
  async function captureIndexed() {
    if (SCOPE.settle) await SCOPE.settle();
    const harvest =
      UI.autofill && typeof UI.autofill.harvestQuestions === "function"
        ? UI.autofill.harvestQuestions()
        : { fields: [], controlIds: null };
    const scoped = SCOPE.scopePage ? SCOPE.scopePage({ harvest }) : null;
    if (!scoped || !scoped.blocks || !scoped.blocks.length) {
      throw new Error("Couldn't read this page's content.");
    }
    return scoped;
  }

  function sendExtractionMessage(message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, (res) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (res && res.ok) resolve(res);
          else reject(new Error((res && res.error) || "Extraction failed"));
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  // Re-scope the current DOM and ask the worker (→ backend → Groq) for the application
  // form's questions. Mirrors requestExtraction; only the message type / shape differs.
  function requestApplicationExtraction() {
    if (EXTRACTION_MODE === "indexed") {
      return (async () => {
        let scoped = await captureIndexed();
        // A slow-hydrating form can harvest empty on the first pass — settle and retry ONCE
        // before concluding "no application form".
        if (!scoped.fields.length && SCOPE.settle) {
          await SCOPE.settle({ quietMs: 400, maxMs: 3000 });
          scoped = await captureIndexed();
        }
        const res = await sendExtractionMessage({
          type: "EXTRACT_APPLICATION_INDEXED",
          context: {
            blocks: scoped.blocks,
            fields: scoped.fields,
            source: scoped.source,
            url: scoped.url,
          },
        });
        return { questions: res.questions || [], detected: res.detected };
      })();
    }
    const scoped = SCOPE.scopePage ? SCOPE.scopePage() : null;
    if (!scoped) {
      return Promise.reject(new Error("Couldn't read this page's content."));
    }
    // Tiered path: harvest the live form controls structurally and send them (no markdown, no Groq).
    // It reads the DOM directly, so it does NOT require scoped.text — a JS-rendered form whose markdown
    // came back empty still has live controls to harvest. (The LLM path below needs scoped.text.)
    if (EXTRACTION_MODE === "tiered") {
      const harvest =
        UI.autofill && typeof UI.autofill.harvestQuestions === "function"
          ? UI.autofill.harvestQuestions()
          : { fields: [] };
      return new Promise((resolve, reject) => {
        try {
          chrome.runtime.sendMessage(
            {
              type: "EXTRACT_APPLICATION_TIERED",
              context: { fields: harvest.fields || [], source: scoped.source, url: scoped.url },
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
    // LLM path: the page markdown IS the payload, so an empty capture has nothing to send.
    if (!scoped.text) {
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

  // Autofill: hand the page's harvested input fields to the worker (→ backend), which semantically
  // matches each SAVED application question to its field and returns a fill plan. The match runs
  // server-side (embeddings + the OpenAI key stay off the extension). Resolves to { matched, unmatched }.
  function requestAutofillMatch(jobId, fields) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type: "AUTOFILL_MATCH", jobId, fields }, (res) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (res && res.ok) resolve(res.plan || { matched: [], unmatched: [] });
          else reject(new Error((res && res.error) || "Autofill failed"));
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  // Ask the worker (→ backend → Groq) for the structured fields and cleaned description.
  // Re-captures the page at click time (mirrors requestApplicationExtraction) so the
  // extraction always reads the CURRENT DOM — not a snapshot frozen when the panel opened.
  // A posting and its /apply step share one panel session, so a stale open-time capture
  // would otherwise extract the wrong sub-page. Rejects on any failure so the modal can
  // fall back to manual entry; never blocks the save itself.
  function requestExtraction() {
    if (EXTRACTION_MODE === "indexed") {
      return (async () => {
        const scoped = await captureIndexed();
        const estimatedTokens = Math.ceil(
          scoped.blocks.reduce((n, b) => n + b.text.length, 0) / 4,
        );
        try {
          const res = await sendExtractionMessage({
            type: "EXTRACT_JOB_INDEXED",
            context: {
              blocks: scoped.blocks,
              fields: scoped.fields,
              titleHint: scoped.titleHint,
              source: scoped.source,
              url: scoped.url,
            },
          });
          return {
            fields: res.fields || {},
            description: res.description,
            usage: res.usage,
            // Client-side detection (free) backs up the model's judgement: harvested
            // fields on the page mean an application form is present.
            detected: {
              hasJobDetails: !!(res.detected && res.detected.hasJobDetails),
              hasApplicationForm:
                !!(res.detected && res.detected.hasApplicationForm) || scoped.fields.length > 0,
            },
            estimatedTokens,
          };
        } catch (e) {
          e.estimatedTokens = estimatedTokens;
          throw e;
        }
      })();
    }
    const scoped = SCOPE.scopePage ? SCOPE.scopePage() : null;
    if (!scoped || !scoped.text) {
      return Promise.reject(new Error("Couldn't read this page's content."));
    }

    // Route to the appropriate extraction backend
    let message;
    let estimatedTokens;
    if (EXTRACTION_MODE === "semantic") {
      // Semantic RAG: send the FULL markdown (the backend section-chunks + retrieves, so it bounds
      // the model context itself — nothing is truncated here). estimate reflects the full payload.
      const fullText = scoped.fullText || scoped.text;
      estimatedTokens = Math.ceil(fullText.length / 4);
      message = {
        type: "EXTRACT_JOB_SEMANTIC",
        context: { text: fullText, source: scoped.source, url: scoped.url },
        estimatedTokens,
      };
    } else if (EXTRACTION_MODE === "tiered" && scoped.signals) {
      estimatedTokens = Math.ceil(scoped.text.length / 4);
      // Tiered extraction: structured data + embeddings (no Groq)
      message = {
        type: "EXTRACT_JOB_TIERED",
        context: { signals: scoped.signals, source: scoped.source, url: scoped.url },
        estimatedTokens,
      };
    } else {
      // Standard LLM extraction (Groq)
      estimatedTokens = Math.ceil(scoped.text.length / 4);
      message = {
        type: "EXTRACT_JOB",
        context: { text: scoped.text, source: scoped.source, url: scoped.url },
        estimatedTokens,
      };
    }

    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(
          message,
          (res) => {
            if (chrome.runtime.lastError) {
              const err = new Error(chrome.runtime.lastError.message);
              err.estimatedTokens = estimatedTokens;
              return reject(err);
            }
            if (res && res.ok) {
              resolve({
                fields: res.fields || {},
                description: res.description,
                usage: res.usage,
                estimatedTokens,
                metadata: res.metadata, // Include semantic extraction metadata
              });
            } else {
              const err = new Error((res && res.error) || "Extraction failed");
              err.estimatedTokens = estimatedTokens;
              reject(err);
            }
          },
        );
      } catch (e) {
        reject(e);
      }
    });
  }

  // Map the local draft answers ({ contentKey → value }) to the SERVER's stored question ids
  // (content identity — questionMapper.keyOf — is the bridge) and batch-save them via the
  // worker. The saved job's application rides back on the save response, so no extra read.
  // On success the server's { questionId: value } view is cached so reopening mirrors the DB.
  async function pushDraftAnswers(saved, anchorId) {
    const MAPPER = (self.JobTracker || {}).questionMapper;
    if (!MAPPER || !saved || !saved.id) return;
    const rec = await getJobRecord(anchorId);
    const drafts = rec && rec.draftAnswers;
    if (!drafts || !Object.keys(drafts).length) return;
    const serverQuestions =
      saved.application && Array.isArray(saved.application.questions)
        ? saved.application.questions
        : null;
    if (!serverQuestions || !serverQuestions.length) return;
    const answers = MAPPER.answersForServer(serverQuestions, drafts);
    if (!answers.length) return;
    const res = await new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(
          { type: "SAVE_APPLICATION_ANSWERS", jobId: saved.id, answers },
          (r) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (r && r.ok) resolve(r.answers || null);
            else reject(new Error((r && r.error) || "Saving answers failed"));
          },
        );
      } catch (e) {
        reject(e);
      }
    });
    if (res && typeof res === "object") mergeJobRecord(anchorId, { answers: res });
  }

  // ---- documents (Resume tab) ----
  // The user's saved resume/CV list, and a File builder for one — used to drag a document onto a
  // page upload field or to download it. Bytes come from the worker (base64); the File is rebuilt
  // here with the name/mime the list already carries.
  function loadDocuments() {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "LIST_DOCUMENTS" }, (res) => {
          if (chrome.runtime.lastError || !res || !res.ok) return resolve([]);
          resolve(res.documents || []);
        });
      } catch (_) {
        resolve([]);
      }
    });
  }
  function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  function fetchDocumentFile(doc) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type: "FETCH_DOCUMENT", id: doc.id }, (res) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          if (!res || !res.ok) return reject(new Error((res && res.error) || "Document fetch failed"));
          try {
            const bytes = base64ToBytes(res.base64);
            resolve(
              new File([bytes], doc.name || "document", {
                type: doc.mimeType || "application/octet-stream",
              }),
            );
          } catch (e) {
            reject(e);
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  // Change the pipeline status of an already-tracked job — the panel's status picker after save.
  // Best effort: the local record already holds the new status (persisted by onStatusChange), so a
  // failed PATCH only means the job page lags until the next save/revalidate.
  function patchJobStatus(jobId, status) {
    if (!jobId || !status) return;
    chrome.runtime.sendMessage({ type: "PATCH_JOB", id: jobId, patch: { status } }, () => {
      void chrome.runtime.lastError; // swallow — non-fatal
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
      // Pipeline stage set in the panel (Saved/Applied/…). createJob honours it on a first save;
      // re-saving an already-tracked posting preserves the job's current status (server-side).
      status: job.status || undefined,
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
      chrome.runtime.sendMessage({ type: "SAVE_JOB", job: payload }, async (res) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (res && res.ok) {
          const saved = res.job || {};
          // Remember that this posting is now tracked (per anchor) so reopening — including on
          // a sub-URL — shows "View in dashboard" instead of prompting to save again. Await the
          // write so the record carries `saved` before the to-do reconcile re-reads it.
          await mergeJobRecordAsync(anchorId, {
            saved: { id: saved.id, url: payload.url || "", savedAt: Date.now() },
            // Record the server's authoritative status (resaves preserve an existing stage, so this
            // may differ from what we sent) so reopening the panel shows the right stage.
            status: saved.status || payload.status || "SAVED",
          });
          // Push the live-captured draft answers now that the questions carry server ids
          // (best effort; never fails the save — drafts stay local and retry next save).
          await pushDraftAnswers(saved, anchorId).catch(() => {});
          // Sync the local-first to-dos now that we have a job id (best effort; never fails the save).
          await reconcileTodos(saved.id, anchorId).catch(() => {});
          // Persistent tick + a one-shot pop to confirm the save. It stays ticked from here on
          // (the record is now saved); navigation re-derives the state per page.
          lastAnchorId = anchorId;
          UI.button.setState("saved", { animate: true });
          // Return the pieces the panel needs to keep its OWN in-memory record in step (the marker
          // was written to storage above, but the caller's `record` object hasn't seen it yet — see
          // onConfirm). url/status let onConfirm rebuild `record.saved` without a re-read.
          resolve({
            id: saved.id,
            viewUrl: viewUrlFor(saved.id),
            url: payload.url || "",
            status: saved.status || payload.status || "SAVED",
          });
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

  // Sub-frame: no UI. Run the headless form-sync agent so an iframe'd application form (the whole
  // point of all_frames) is visible to the top-frame panel, then stop — none of the button / nav /
  // popup wiring below belongs in a child frame.
  if (!IS_TOP) {
    if (FRAME_BRIDGE && UI.formSync && JT.questionMapper && UI.autofill) {
      FRAME_BRIDGE.startAgent(UI.formSync, FRAME_BRIDGE.chromeAgentTransport());
    }
    return;
  }

  // Top frame: the panel drives the cross-frame aggregator (local document + every sub-frame).
  // Created eagerly so its relay listener is live before the panel opens — it captures a
  // late-loading apply iframe's "hello" and any early frame messages.
  if (FRAME_BRIDGE && FRAME_BRIDGE.createAggregator && UI.formSync) {
    SYNC = FRAME_BRIDGE.createAggregator(
      UI.formSync,
      FRAME_BRIDGE.chromeAggregatorTransport(),
      JT.questionMapper,
    );
  }

  injectFont();
  UI.button.show(openSavePanel);

  // The toolbar popup opens the panel here too, so it's reachable even where the on-page button is
  // hidden (e.g. a framework that wipes our overlay). Respond so the popup knows the script is
  // present and can close itself.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "OPEN_SAVE_PANEL") {
      Promise.resolve().then(() => openSavePanel()).catch(() => {});
      sendResponse({ ok: true });
      return true;
    }
    return false;
  });

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
