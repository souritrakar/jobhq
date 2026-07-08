# Live application-form sync (extension) — design

**Date:** 2026-07-04
**Status:** Approved for implementation (autonomous session; decisions recorded here)
**Replaces:** the manual on-page field picker as the way application questions reach the panel
(`2026-07-02-field-picker-design.md`). The picker module stays on disk behind REVERT comments.

## Problem

Question capture today is manual: the user must click a badge on each long-text field to track
it, only `long_text` fields are pickable, answer values are never captured, and multi-page forms
require re-picking on every step. That's confusing and laborious. We want the Application tab to
just *mirror the form*: every question on the page appears automatically, and whatever the user
types into the page shows up live in the panel — with nothing written to the DB until "Save
application".

## Goals

1. **Deterministic, zero-LLM question extraction** of ALL field types (text, textarea,
   select, multi-select, radio, checkbox groups, consent checkboxes, comboboxes, custom
   button clusters, contenteditable, file) — reusing the existing generic harvest
   (`ui/application.js#harvestQuestions`) + mapper (`lib/question-mapper.js`). No per-site code.
2. **Automatic**: questions appear when the panel opens and as the form mounts/changes —
   MutationObserver-driven re-harvest handles multi-page/multi-view forms with no user action.
3. **Live value sync (page → panel)**: editing any page field updates the matching panel
   control in real time. **Panel → page** works too, through the tested fill engine
   (`lib/field-adapters.js`), so the panel is a true two-way mirror.
4. **Local-first persistence**: questions + draft answers live in the per-posting
   `chrome.storage.local` record (same pattern as details/notes/todos). DB writes happen ONLY
   on "Save application" / "Save changes".
5. Robust and generalizable: no site-specific selectors, tolerant of framework re-renders,
   never mutates the host page's DOM except through deliberate user-driven writes.

## Non-goals

- Filling files (unchanged: files are display-only — we show the chosen filename).
- Browse-time scanning: sync runs only while the panel is open (preserves the zero
  browse-time-reads constraint).
- Backend changes. None are needed: `POST /api/jobs` already accepts
  `application.questions` (server assigns stable label-slug ids and returns the stored
  application), and `PUT /api/jobs/:id/application/answers` batch-saves answers keyed by
  question id, with multi-values JSON-encoded per `lib/application/answer-codec.ts`.

## Architecture

New module `extension/ui/form-sync.js` (isolated-world global `JobTracker.ui.formSync`,
UMD-exported for vitest like `field-picker.js`). It owns the live model; the modal renders it;
content.js persists it.

```
page DOM ──harvestQuestions()──► form-sync model ──onChange/onAnswer──► modal tray (panel UI)
   ▲                                   │  ▲                                   │
   └──── adapter.write() ◄─────────────┘  └────────── onEdit(key, value) ◄────┘
                          (panel → page)                 (user types in panel)
content.js: persists { questions, draftAnswers, ignoredKeys } to the anchored record;
on save: POST /api/jobs (questions) → map keys→server ids → PUT …/application/answers.
```

### Model

`entries: Map<key, entry>` where `key = questionMapper.keyOf(question)` (content identity:
label+type+options — survives DOM re-renders and storage round-trips). Entry:

```js
{ key, question,            // ApplicationQuestion shape (backend-validated)
  answer,                   // string | string[] (multi-select family) | "" — the live value
  onPage,                   // false = seen earlier (another step/page) but not in current DOM
  descriptor,               // { kind, el | options[] } — live elements for read/write
  baseline }                // combobox only: widget box text at harvest (placeholder detection)
```

Duplicate keys on one page (two identical label+type+options fields) collapse to the first
occurrence — a documented limitation, same as the picker had.

### Detection (deterministic)

`harvestQuestions()` is extended to also return `descriptors` (fieldId → fill descriptor,
mirroring the autofill `harvestMap`) so sync can read/write each field. It additionally gains a
generic **structural noise gate**: controls inside `nav / header / footer /
[role=search|navigation|banner|contentinfo]` or inside our own overlay hosts are never
questions. Everything else stays: label resolution (ARIA → label[for] → wrapping label →
proximity → placeholder → humanized name) and the consent-noise checkbox filter are unchanged.

### Page → panel (live)

- Document-level capture listeners: `input`, `change`, `click` (for radios/checkboxes/custom
  clusters/comboboxes). Events retargeted from our own shadow hosts are ignored
  (`e.target.id ∈ {jobtracker-modal-host, jobtracker-picker-host, …}`).
- Event target → entry via a WeakMap(element → key) built at harvest, plus containment checks
  for cluster containers. Click-driven widgets are re-read on a microtask delay so the
  framework applies state first.
- Value readers live on the adapters (`adapter.read()`, new): value for text/textarea/
  contenteditable; selected option label(s) for select/radio/checkbox groups; `"true"|""` for
  consent; selected-state labels for button clusters; `el.value` for comboboxes with a
  **baseline-diff fallback** (widget box text captured at harvest = placeholder; if the box
  text later differs and is non-empty, that's the selected value — generic, no site CSS).
- Echo suppression: a read that equals `entry.answer` is a no-op, which breaks any loop.
- Notify: `onAnswer(key, value)` → modal updates ONE control in place (no re-render, no focus
  loss) unless that panel control is currently focused; content.js persists (debounced 400ms,
  flushed on close).

### Mutations / multi-page forms

MutationObserver on `documentElement` (debounced 400ms, same cadence as the picker) →
re-harvest → merge by key:

- **New key** → append entry (page order), read initial value from the page.
- **Existing key** → refresh descriptor/elements; if the page value is non-empty take it,
  else keep the stored answer (protects step transitions that remount fields empty).
- **Missing key** → keep the entry, mark `onPage: false` (question + answer survive; the panel
  shows a quiet "other step" tag; edits persist locally but can't write to the page).

SPA navigation within the same posting anchor triggers mutations → same path. Navigating to a
different posting closes the panel (existing content.js behavior), which deactivates sync.

### Panel → page

Panel controls are editable. `onEdit(key, value)` → sync writes via
`UI.fill.createAdapter(descriptor).write(target)` (text debounced ~250ms/field; choices
immediate). The user explicitly edited the mirror, so the write intentionally replaces the page
value (no `fillField` skip-user policy). Off-page entries just update the local record. File
controls are read-only in the panel.

### Dismiss ("not a question")

Each live field gets a quiet dismiss (×). Dismissing removes the entry and records its key in
`record.ignoredKeys`, so re-harvests never resurrect it. (Un-ignoring = future work; the set is
per-posting so the cost of a mis-click is bounded.)

### Persistence & save

Anchored record gains:

- `questions` — same backend-validated shape as today (no answer inside; unchanged save payload).
- `draftAnswers` — `{ [key]: string | string[] }`, local only.
- `ignoredKeys` — `string[]`.

On open: seed sync from the record (questions restore as `onPage:false` until found). For a
saved job, the server's `record.answers` (`{questionId: value}`) are translated to keys by
`keyOf(serverQuestion)` and merged UNDER local drafts (local wins). The old read-only
saved-answer view is retired — the panel is a live mirror in all states.

On "Save application" / "Save changes" (`saveJob`):

1. `POST /api/jobs` with `application.questions` (unchanged; server returns the stored
   application with per-question ids).
2. Map local keys → server ids via `keyOf` over the returned questions; encode multi-values as
   JSON arrays (mirror of `answer-codec.ts`, implemented in `lib/question-mapper.js`).
3. New worker message `SAVE_APPLICATION_ANSWERS { jobId, answers }` →
   `PUT /api/jobs/:id/application/answers`. Best-effort like the todo reconcile: an answers
   failure never fails the save; drafts stay local and retry on the next save.

### Error handling

- Harvest/read/write wrapped in try/catch; a hostile page mid-teardown skips a tick, never
  breaks the panel.
- Storage writes surface (console.warn) the invalidated-context failure, as today.
- All listeners passive where possible; observer debounced; per-field text writes debounced.
- `deactivate()` (on every panel close path, incl. navigation) removes all listeners/observers.

## Files

| File | Change |
|---|---|
| `extension/ui/form-sync.js` | NEW — the sync controller |
| `extension/lib/field-adapters.js` | `read()` on every adapter |
| `extension/ui/application.js` | harvest descriptors + noise gate; live render mode (values, onEdit, dismiss, off-page tag, `updateAnswer`) |
| `extension/ui/modal.js` | Application pane = live tray; retire picker hint + read-only view |
| `extension/content.js` | activate form-sync (picker behind REVERT); `draftAnswers`/`ignoredKeys`; save-time answer push |
| `extension/background.js` | `SAVE_APPLICATION_ANSWERS` handler |
| `extension/lib/question-mapper.js` | answer codec mirror + key→server-id mapping |
| `extension/manifest.json` | load `ui/form-sync.js` |

## Testing

Extension vitest (jsdom, local binary): adapter `read()` per kind; harvest descriptors + noise
gate; form-sync model (initial harvest → model, page event → answer, re-harvest merge/off-page,
ignoredKeys, echo suppression); mapper codec + server-id mapping. Existing suites
(field-picker, harvest-questions, autofill-integration, question-mapper, field-adapters, todo)
must stay green.
