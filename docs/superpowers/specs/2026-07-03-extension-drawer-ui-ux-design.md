# Extension drawer — UI/UX pass + local-first To-do

Date: 2026-07-03
Surface: the injected shadow-DOM save panel ("drawer") — `extension/ui/modal.js` and friends.
Scope: **drawer only** (the extension-icon popup is untouched).

## Goal

Tighten the drawer's look and make the whole panel — details, notes, to-dos, application
questions — survive a refresh or an accidental collapse **before** the user saves, so nothing is
lost if they forget to hit Save. Most of the persistence already exists (Details + notes +
questions write to an anchored `chrome.storage.local` record); the gap is reminders, which today
talk straight to the backend and are gated behind a saved job.

## Changes

### 1. Header — drop the URL subline
`ui/modal.js` header currently renders `Save to tracker` + a subline of the source host. Remove the
subline element so the header is just badge + title + collapse/close.

### 2. Tab bar → segmented pill control (Image #1)
Restyle `.tabs`/`.tab` into a segmented control: a rounded container (`--r3`, hairline border,
`--bg-sunken` fill) holding the three tabs. Active tab = white pill (`--bg`, subtle border + soft
shadow) with fern-green icon + label; inactive = muted grey, no underline. The tab registry,
roving-tabindex, and arrow-key navigation are unchanged — this is CSS + minor markup only.

### 3. "Extract with AI" → card button (Image #2)
The Details extract bar (`.dx`) becomes a full-width **card**: left a rounded-square tile (light-green
fill, green sparkles icon), two stacked text lines — **"Extract with AI"** (bold) and *"Auto-fill job
details from this page"* (muted subtitle) — and a trailing chevron. The idle / loading / done / error
states re-use the card shell (spinner in the tile; "Auto-filled by AI ✓" + Re-extract; error text).

### 4. Section icons for Notes + To-do
`Your notes` and the new `To-do` eyebrow labels get a small leading line-icon in `--ink-3`
(`.eyebrow-ic`), consistent with the existing icon language. Notes = pencil/note glyph;
To-do = checklist glyph.

### 5. Reminders → **To-do** section, local-first (the substantive change)

Replace `ui/reminders.js` with `ui/todo.js`, mirroring the web app's `TodoCard`:

- **One list.** Plain to-dos by default. Inline composer at the bottom: type + Enter = plain
  to-do. A **bell** on the composer opens a schedule popover (reuse the existing quick-pick chips +
  date/time inputs) → adds a *dated reminder*. A plain to-do row gets a hover **bell** to convert it
  (attach a due date) later. Dated rows show a bell + due label; overdue rows show the amber pill.
- **No "save first" gate.** Usable immediately, even on an unsaved posting.
- **Local-first storage.** To-dos live in the anchored record as `record.todos`, edited purely in
  local storage — **zero backend calls while editing**. Survives close/collapse/refresh exactly like
  Details + notes. Shape per todo: `{ id, title, done, dueAt?, hasTime?, remoteId?, type? }`.
  - `id` — local uuid-ish string (stable across the session/refresh).
  - `remoteId` — the server reminder id once synced; absent until then.
  - `type` — `"system"` for auto reminders (interview/digest) seeded from the server; renders the
    "Auto" badge, toggle-able, not convertible/deletable.
- **Sync only on Save.** On *Save application* / *Save changes*, after the job id is known, a
  **reconcile** makes the backend match local, using the EXISTING worker messages (no backend
  changes):
  - todo without `remoteId` → `CREATE_REMINDER` (jobId, {title, dueAt?, hasTime?}); store returned
    id as `remoteId` back into the local record.
  - todo with `remoteId` whose `done` differs from last-synced → `TOGGLE_REMINDER`.
  - todo with `remoteId` whose due differs from last-synced → update due (PATCH reminder).
  - todo removed locally (tracked in `record.todosDeleted`: a list of `remoteId`s) → `DELETE_REMINDER`.
  - After a successful reconcile, stamp each todo's last-synced `{ done, dueAt, hasTime }` so the next
    reconcile diffs correctly, and clear `record.todosDeleted`.
  - Reconcile is best-effort: a failed item is left un-synced (keeps its local state) and retried on
    the next save; a reconcile failure never blocks the job save itself.
- **Already-saved job:** on open, seed `record.todos` from the server reminders (`refreshReminders`
  already caches them into `record.reminders`) — map each server reminder to a todo carrying its
  `remoteId`, `done`, `dueAt`, `hasTime`, `type`, and a synced-snapshot. Edits stay local until
  "Save changes" reconciles.

Wiring in `ui/modal.js` mirrors the Details/notes hooks: `loadTodos()` restores from the record,
`onTodosChange(todos)` persists the live list (debounced/immediate) into `record.todos`, and the
render lives in `ui/todo.js` (self-contained, scoped styles, shadow-DOM idioms — same as
`reminders.js`). `content.js` owns the reconcile at save time (it already builds the SAVE_JOB payload
and gets the job id back).

### 6. Comment out "Prep with AI"
Comment out the `aiCard` toggle block in the action bar with a `REVERT` note. The action bar becomes
status → actions.

## Non-goals
- No backend/API/schema changes. Reconcile rides on the existing reminder worker messages.
- No changes to the extension-icon popup.
- No changes to Application-question capture, Autofill, or Resume tab behavior.

## Files
- `extension/ui/modal.js` — header, tabs, extract card, section icons, To-do wiring, comment out aiCard.
- `extension/ui/todo.js` — NEW (replaces `ui/reminders.js`): local-first To-do list + schedule popover.
- `extension/ui/reminders.js` — removed (or emptied); `manifest.json` content_scripts updated.
- `extension/content.js` — seed `record.todos` on open, `loadTodos`/`onTodosChange` hooks, save-time
  reconcile against the reminder worker messages.
- `extension/manifest.json` — swap `ui/reminders.js` → `ui/todo.js` in `content_scripts`.
- Tests: `extension/ui/todo.test.js` (NEW) for the reconcile diff + due-building; update any
  reminders test references.
