# Application-sync fixes: display-only choices, stable ordering, cross-frame detection

Date: 2026-07-05
Status: approved (implement)

Three independent defects in the live application-form sync (extension Application tab,
`extension/ui/form-sync.js` + `extension/ui/application.js`), fixed together.

## A — Non-text fields must mirror the *selected value*, not reproduce the options

**Problem.** The live mirror tries to *reproduce* each control. For a custom combobox
(react-select, Greenhouse flyout) the options only exist in the DOM while the widget is open,
so `buildLiveControl` falls it through to a bare text input — a dropdown question rendered as an
empty box with no options (the reported bug). Native `<select>`/radio work but are redundant
copies of a control the user can drive on the page.

**Design.** Split the mirror by whether the field is *free-text entry* or *selection*:

- **Free-text** (`short_text`, `long_text`, `number`, `url`, `email`, `tel`, `date`,
  `contenteditable`) → stay fully editable in the panel. This is where the panel adds value
  (big textarea, future AI drafting).
- **Selection / file** (`select`, `combobox`→`select`, `radio`, `multi_select`, `checkbox`
  with options, single consent `checkbox`, `file`, button clusters) → a **read-only "selected
  value" display**: value chips, with a muted empty state ("Choose on the page →"). You answer
  on the page (where the real widget + its search live); the panel reflects the selection,
  updating live via the existing mirror.

This generalizes the pattern already used for `file` (a display-only filename node). It removes
the fragile "are the options in the DOM?" branching and the panel→page choice-write code path
from the *manual UI* (`writeEntry` stays as the mechanism for future AI-answering).

## B — Answered/disappearing fields must keep their position

**Problem.** `order = offPage.concat(pageOrder)` hoists every off-page question to the top.
When a file input is *hidden/replaced after upload* (common on Greenhouse/Lever), the next
re-harvest drops it from `pageOrder`, reclassifies it off-page, and it jumps to the top, dimmed
with an "Other step" tag — even though it was just answered in place on the current page.

**Design.**
1. **Stable first-seen order.** Assign a monotonic `seq` the first time a question is seen
   (restored questions seeded first → lowest `seq`). Order = all keys sorted by `seq`. A
   question never changes slot once it appears. Multi-step "earlier step first" falls out for
   free (earlier questions are seen first). Deletes the `offPage/pageOrder` split.
2. **File pin.** When a `file` question reads a non-empty filename while on-page, mark it
   `pinned`. A pinned file reports `onPage: true` to the panel even after its input leaves the
   DOM, so it is neither dimmed nor tagged "Other step". Narrow to `file` (which can't be
   re-read or edited from the panel anyway), so genuine multi-step tagging is unaffected.

## C — Applications inside a cross-origin iframe are invisible

**Problem.** LinkedIn's off-site apply (and any Greenhouse/Lever/Ashby/Workday embed) renders
the form inside a **cross-origin iframe**. `manifest.json` has no `all_frames`, so no content
script runs in the iframe; and even if it did, the panel lives in the top frame while
`harvestQuestions()` only sees its own document. The `MutationObserver` on the top
`documentElement` never sees iframe mutations either — so the panel shows "Watching for
application questions" forever.

**Design — one local engine per frame, one aggregator in the top frame.**

- `manifest.json`: `"all_frames": true`. Content scripts now inject into every frame.
- **Role guard** in `content.js`: only the top frame (`window.top === window.self`) builds the
  button/modal/nav. Sub-frames run a headless **agent**.
- New `extension/ui/frame-bridge.js` with an **injectable transport** (chrome messaging in
  production, a fake in tests):
  - `startAgent(formSync, transport)` — sub-frame: on `activate`, runs the local `form-sync`
    and relays its `onModel`/`onAnswer` up; applies `setAnswer`/`dismiss`/`deactivate` down.
  - `createAggregator(formSync, transport)` — top frame: exposes the **exact `form-sync` API**
    `content.js` already consumes (`activate/getQuestions/getAnswers/getIgnoredKeys/
    setAnswer/dismiss/deactivate/isActive`). Internally it treats the local `form-sync` and each
    remote frame as a **source**, merges their models into one first-seen-ordered model,
    keeps the authoritative answer store (page-non-empty wins; explicit clears kept), and routes
    panel edits/dismiss to the owning source.
- **Keys stay pure `questionMapper.keyOf`** (persistence + web-app interop depend on it); frame
  ownership is tracked in a side map, never mixed into the key.
- `background.js`: relay handlers — `FORMSYNC_UP` (frame→top, stamped with `sender.frameId`),
  `FORMSYNC_TO_FRAME` (top→one frame), `FORMSYNC_BROADCAST` (top→all frames). Uses
  `sender.tab.id` so content scripts never need their tab id.
- Restored questions/answers/ignored are seeded into the aggregator (top-frame local source +
  answer store), so a restored answer shows regardless of which frame later owns its question.
  Duplicate keys across sources dedupe to the on-page source; the empty page value of a blank
  remount never clobbers the stored answer.

`all_frames` is generic — no per-site selectors — so this fixes every iframe'd ATS at once.

## Testing

- A: new `ui/application.test.js` — a `select`/combobox question renders a display node (no
  `<select>`/options) and `setValue` paints chips; text stays an editable input.
- B: `ui/form-sync.test.js` — stable order across a remount; a file field stays in place and
  on-page after its input is removed.
- C: new `ui/frame-bridge.test.js` — aggregator merges two fake sources in first-seen order,
  dedupes a shared key to the on-page source, keeps a restored answer under a blank remote
  report, and routes `setAnswer`/`dismiss` to the owning source (all via a fake transport).
