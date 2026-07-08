> **SUPERSEDED (2026-07-04):** the manual picker was replaced by automatic live
> form-sync — see `2026-07-04-live-application-sync-design.md`. `ui/field-picker.js`
> stays on disk (no longer activated) for the revert path.

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

**Scope (revised 2026-07-02): only `long_text` questions** — `<textarea>` and contenteditable,
i.e. every multi-line free-text box. These are the free-text/paragraph answers ("why us",
essays, cover-letter-style prompts) worth saving to reuse; short text, selects, radios, dates,
and file uploads are trivial or profile data that autofill already covers, so they get no badge.
Enforced by `const PICKABLE_TYPES = new Set(["long_text"])` in `field-picker.js` — `refresh()`
skips any harvested question whose mapped `type` isn't in the set.

Within that scope, badges track the harvest's logical questions — `harvestQuestions()` output
(labeled, visible, fillable controls). To anchor badges, `harvestQuestions()` returns
`anchors: Map<fieldId, Element[]>` — the element(s) each question spans; the badge anchors to the
bounding box of that set.

Deterministic exclusions (no badge):
- **Anything that isn't `long_text`** (the scope rule above) — short text, select/combobox,
  radio, checkbox, date, number, file.
- Consent/legal **checkboxes** — same keyword regex as the backend (`privacy policy|terms|
  consent|gdpr|data processing|newsletter|marketing|promotional`), checkbox-kind only.
- Unlabeled fields (already dropped by the harvest).
- Hidden/disabled/readonly/non-fillable input types (already excluded by `isQuestionControl`).

## 5. Badge anatomy, positioning, states

Final design (2026-07-02) — a **Simplify-style "Save" pill**, modelled on how Simplify pins its
mark inside a field's corner. (Earlier iterations, superseded: a right-edge gutter badge — broke
on multi-column rows and needed external space; then a corner-straddling badge paired with a fern
**field-highlight overlay** — rejected because our high-z layer painted the tint *over* the field
content and read as an injected element. The highlight is gone entirely; the badge now never
touches the field's own area.)

- **Anatomy:** a pill (28px tall) tucked **inside** the anchor rect's top-right corner, `PAD=8px`
  in. Idle = **icon-only circle** (fern bookmark glyph, white fill, 1.5px fern border, opacity
  0.6) — the "save for later" metaphor, quiet so it doesn't compete with the form. Real `<button>`
  with `aria-pressed` + aria-label.
- **Positioning:** **right-anchored** (`style.right = viewportW − (rect.right − PAD)`, `left:auto`)
  so the pill grows **leftward** as it expands, never spilling past the field's right edge or
  off-screen. Works because we only badge textareas, whose top-right is empty space, so it never
  covers the answer text. Recomputed on scroll + resize (rAF-batched, capture-phase) and after each
  mutation re-harvest. Hidden when the anchor is gone, invisible, off-screen, or its right edge is
  under the open save panel.
- **Expand on intent:** on hover / focus / `.near`, the pill goes full opacity and **expands
  leftward** to reveal a `Save` label (label `max-width` 0→130px + `padding-right`). Bloom is
  driven by a passive `pointermove` listener (the layer is `pointer-events:none`, so the page still
  gets every event) that adds `.near` to the badge of the field under the cursor — so N idle badges
  stay recessive while the one you're aiming at opens up.
- **Mode chip:** a persistent bottom-left pill — bookmark dot + "Save the long-answer questions
  you'll want to reuse · N saved" (live count) — carries discoverability so idle badges stay quiet.
- **States:** `idle (bookmark · "Save")` → click → `working` (spinner · "Saving…", ~500ms fixed
  delay — the perceived-effort treatment) → `selected` (solid fern fill `#3f9b6a`, white check ·
  "Saved", ~1.08 scale pop; stays full-opacity so saved fields read at a glance). Click while
  selected → brief `working` → `idle` with a shrink-fade pulse. The label shows only while
  hovered/focused, in every state.
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
