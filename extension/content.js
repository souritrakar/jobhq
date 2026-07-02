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
      onExtractDetails: () => requestExtraction(),
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
      // Autofill is only meaningful once the posting is saved (it fills from saved answers). Provide
      // the hook only then; the modal shows the Autofill button when this is present (read-only view).
      onAutofillMatch:
        savedRec && savedRec.id ? (fields) => requestAutofillMatch(savedRec.id, fields) : null,
      onConfirm: (finalJob) => saveJob(finalJob, anchorId),
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
