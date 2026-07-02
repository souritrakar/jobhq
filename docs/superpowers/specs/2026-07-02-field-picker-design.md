# On-page Application Field Picker — deterministic, user-driven question capture

**Date:** 2026-07-02
**Status:** Approved design, not yet implemented
**Replaces (as the extension's question flow):** LLM application-question extraction
(`EXTRACT_APPLICATION_INDEXED` and the legacy `EXTRACT_APPLICATION*` branches). The backend
routes/modules stay untouched; extension call sites are commented out with a revert note.

---

## 1. Problem & goal

Application-question capture is LLM-driven: the extension extracts *every* question, then the
user flags what matters. That is inverted from what the user actually wants: **selection first**.
Any visible application input on the page should carry an explicit add/track affordance; the
user picks exactly the fields they care about; each pick deterministically becomes the same
normalized `ApplicationQuestion` the system already saves. No LLM, no tokens, leaner flow.

Non-negotiables from the user:
- Selection is the primary interaction; controls visible **immediately when the panel opens**
  (bookmark click), no extra clicks.
- One clear affordance per field or grouped question — the duplicate/double-button failure mode
  must be structurally impossible.
- Affordance must not cover the field, its label, or clutter the page; polished sizing/padding.
- Selected state uses the **fern primary** (dark green); clear visual feedback on select AND
  deselect.
- A slight perceived-effort treatment on add: ~500ms deliberate delay with a spinner before the
  success state.
- Storage contract and downstream saved-data behavior unchanged.
- Careful DOM injection: wait for loading, survive hostile/re-rendering sites, never render
  twice for one field, only on appropriate input types.

## 2. Architecture (approved: overlay layer)

A single JobTracker-owned **overlay layer** — a host `<div>` appended to `document.documentElement`
with a shadow root, `position: fixed; inset: 0; z-index: 2147483646; pointer-events: none` —
holds one badge element per logical question. Badges (and only badges) re-enable
`pointer-events: auto`. The host page's DOM is **never mutated**: framework re-renders cannot
duplicate or delete our badges, site CSS cannot leak in, and cleanup is removing one node.

Rejected alternatives: inline insertion (mutates host DOM — the exact duplicate-button failure
mode; site CSS leakage; layout shift) and hover-following single action (fails "all controls
visible immediately").

## 3. Module & lifecycle

New content script `extension/ui/field-picker.js` → `JobTracker.ui.picker`, loaded after
`ui/application.js` (uses its harvest) and before `content.js`. API:

```js
UI.picker.activate({
  selectedKeys,        // Set<fieldKey> — pre-mark questions already tracked for this posting
  onPick(question, key),    // a field was selected → normalized ApplicationQuestion + its key
  onUnpick(key),             // a field was deselected
}) // idempotent — activating while active just refreshes
UI.picker.deactivate()       // remove layer, observers, listeners; idempotent
UI.picker.setSelectedKeys(keys) // external sync (e.g. record refreshed)
```

- **Activate:** `content.js#openSavePanel()` calls `activate()` right after `UI.modal.open(...)`
  — the affordances appear as soon as the panel does. Activation awaits `SCOPE.settle()` (the
  existing readiness gate: readyState complete + 300ms mutation-quiet, 2.5s cap) before the
  first harvest, so late-hydrating forms are caught.
- **Deactivate:** on panel close (a new `onClose` hook on `UI.modal.open` opts, called from the
  modal's existing `close()`), and on SPA navigation (the existing `onNav` handler that closes
  the modal). Deactivation is also safe to call when never activated.
- **Refresh:** a debounced (400ms) MutationObserver re-harvest while active — late-rendered
  fields gain badges; removed fields lose them. Harvest is cheap (already runs per capture).

## 4. What gets a badge

Exactly the harvest's logical questions — `harvestQuestions()` output (labeled, visible,
fillable controls; file inputs included; radio/checkbox groups and custom button-clusters
already collapsed to one question each). To anchor badges, `harvestQuestions()` is extended to
also return `anchors: Map<fieldId, Element[]>` — the element(s) each question spans (single
control, group members, or cluster options); the badge anchors to the bounding box of that set.

Deterministic exclusions (no badge):
- Consent/legal **checkboxes** — same keyword regex as the backend (`privacy policy|terms|
  consent|gdpr|data processing|newsletter|marketing|promotional`), checkbox-kind only.
- Unlabeled fields (already dropped by the harvest).
- Hidden/disabled/readonly/non-fillable input types (already excluded by `isQuestionControl`).

## 5. Badge anatomy, positioning, states

- **Anatomy:** 26px circular button; rest state = white fill, 1.5px fern border, fern "+" glyph;
  subtle shadow; Satoshi font for the hover tooltip ("Track this question" / "Tracked — click
  to remove").
- **Positioning:** vertically centered on the anchor rect's right edge; **outside** the control
  when ≥40px of viewport space exists to its right, else tucked inside at the top-right corner
  offset above the control's border (the label/input gap) — never covering field text or the
  question label. Recomputed on scroll + resize (rAF-batched, capture-phase listeners so inner
  scroll containers count) and after each mutation re-harvest. A badge whose anchor is gone or
  invisible hides.
- **States:** `idle (+)` → click → `working` (glyph swaps to a rotating spinner, ~500ms fixed
  delay — the perceived-effort treatment) → `selected` (solid fern fill `#3f9b6a`, white check,
  ~1.08 scale pop, then settle). Click while selected → brief `working` → `idle` with a
  shrink-fade pulse (clear deselect feedback). Keyboard: badges are real `<button>`s with
  aria-pressed + labels.
- **Identity:** the layer keeps a registry `fieldKey → badge` (the existing structural
  `fieldKey(kind, label, el, optionLabels)` from `application.js`). One badge per key —
  duplicates structurally impossible; a re-rendered control re-associates with its old badge
  and keeps its selected state.

## 6. Pick → question (deterministic, no LLM)

On select, the harvested descriptor converts client-side via the same matrix the indexed
backend uses (new pure module `extension/lib/question-mapper.js`, UMD like field-adapters so
it's unit-testable):

- kind `select` → `select`; **`select[multiple]` → `multi_select`** (harvest gains a `multiple`
  flag); `radio` (native groups + button clusters) → `radio`; checkbox group → `checkbox`;
  standalone checkbox → `checkbox`; `textarea`/`contenteditable` → `long_text`; `file` →
  `file`; `combobox` → `select`.
- kind `text`: native `inputType` email/tel/url/number/date wins → that type; else `short_text`.
- Carries: `label` (harvest), `options` (exact DOM options, page order), `required`,
  `placeholder`. `helpText` is not derived (YAGNI). `flagged` stays a user action in the modal.

Result: the identical `ApplicationQuestion` shape `normalizeApplicationQuestions` validated for
the LLM path — and the same save path (`application.questions` on `POST /api/jobs`, slug ids +
`order` + `schemaVersion` server-side). **Zero storage changes.**

## 7. State & sync

- Picked questions live where extracted ones did: the anchored record's `questions` array
  (`mergeJobRecord(anchorId, { questions })`), in **page order** (harvest sequence), deduped by
  `fieldKey`. Each stored question carries a non-persisted `pickKey` client-side only long
  enough to sync; before save the payload is the plain question array (unchanged contract —
  `pickKey` is stripped, mirroring how `flagged` is user-set data that DOES persist).
  Concretely: the modal keeps `questions[]` + a parallel `keys[]` in memory; the record and the
  save payload store only the questions.
- The modal's Application tab is the live tray: `onPick` appends + re-renders through the
  existing `UI.applicationForm.render` (flags/types/options work as today); `onUnpick` removes.
  Reopening the panel on a posting with cached questions passes their keys as `selectedKeys`
  so badges pre-mark selected. Questions restored from the SERVER (saved job, no keys) still
  render in the tray read-only as today; their badges match by recomputed `fieldKey` when the
  same form is on the page, else simply aren't pre-marked (tray is still authoritative).
- Saved-job read-only answer view: unchanged (picker still runs; picking merges into the
  cached questions exactly like a re-extraction did).

## 8. What gets disconnected (revertable)

- `content.js`: the `requestApplicationExtraction()` call site (`onExtractApplication`) is
  replaced by picker wiring; the function body remains, commented at the call site with
  `// REVERT: restore LLM question extraction by …`.
- `modal.js`: the Application tab's "Extract questions" button/flow is commented out the same
  way; the tab's empty state becomes the picker hint ("Click the + next to any application
  field on the page to track it."). The "Form detected — extract questions" nudge from the
  details flow now just switches to the Application tab (wording: "Form detected — pick
  questions").
- Backend `/api/extract-application/indexed` (+ legacy routes) and all their modules/tests stay
  live and untouched (the web-app import path also still uses its own extraction).

## 9. Robustness requirements (acceptance)

- No badge before `settle()` resolves; late-hydrating fields gain badges within ~1s (debounced
  observer).
- One badge per logical question at all times — including after framework re-renders, tab
  switches within the page, and repeated activate() calls.
- Layer never intercepts page clicks outside badges; never breaks page scroll; removing the
  layer restores the page byte-identically (we never touched it).
- Non-HTML documents guarded (existing `isInjectableDocument`); cross-origin iframe forms out
  of scope (documented limitation, same as all current paths).
- Badges never render over the JobTracker panel (the panel edge is respected: badges whose
  anchor rect is under the panel are hidden while the panel overlaps them — deterministic rect
  intersection with the panel host).

## 10. Testing

- **vitest+jsdom:** `question-mapper` matrix (every kind/inputType, multiple-select, options
  passthrough, required/placeholder); picker registry idempotence (activate twice → one badge
  per key; re-harvest with a re-rendered equal-key control keeps state; unpick removes);
  consent-checkbox exclusion; selectedKeys pre-marking. Positioning math tested with rect
  stubs (outside vs tucked placement threshold).
- **Manual:** Greenhouse, Ashby, Lever — anchoring polish, scroll/resize tracking, SPA
  re-render survival, select/deselect animations, tray sync, save → web-app job page renders
  the picked questions identically to extracted ones.

## 11. Decisions log

- Picker **fully replaces** LLM question extraction in the extension; old code disconnected at
  call sites with revert comments, never deleted (user).
- Activation on **bookmark click / panel open**, always — not only on the Application tab (user).
- Overlay layer over inline injection (assistant recommendation, approved).
- Perceived-effort delay fixed at ~500ms with spinner → fern success pop (user requirement).
- Consent/legal checkboxes get no badge (consistent with the prior "ignore privacy checkboxes"
  decision).
- `select[multiple]` now maps to `multi_select` (small deterministic improvement over the LLM
  path, contract-compatible).
