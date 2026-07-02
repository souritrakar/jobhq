# On-page Application Field Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace LLM application-question extraction in the extension with a deterministic on-page field picker: badges next to every question-worthy control; each pick converts to the exact stored `ApplicationQuestion` shape.

**Architecture:** A JobTracker-owned overlay layer (shadow-rooted host on `<html>`, `pointer-events:none`, badges re-enable) anchors one badge per logical question from the existing `harvestQuestions()` output. Picks map through a pure client-side type matrix (`extension/lib/question-mapper.js`) into the unchanged questions contract, merged into the anchored record and rendered live in the modal's Application tab. LLM call sites are commented out with revert notes.

**Tech Stack:** Vanilla-JS content scripts (UMD pattern from `lib/field-adapters.js`), vitest+jsdom (`cd extension && ./node_modules/.bin/vitest run` — local binary, never `npx`).

**Spec:** `docs/superpowers/specs/2026-07-02-field-picker-design.md` — read first.

## Global Constraints

- Host page DOM is NEVER mutated; all UI lives in the picker's own shadow-rooted layer.
- One badge per logical question at all times (registry keyed by question identity `keyOf(question)`).
- Selected state = fern `#3f9b6a`; add flow = ~500ms deliberate spinner (`ADD_DELAY_MS = 500`).
- Storage contract unchanged: picks produce the same `{ label, type, required?, placeholder?, options?, flagged? }` questions, saved via the existing record → `POST /api/jobs` path.
- LLM question-extraction code is disconnected at call sites with `// REVERT:` comments — never deleted. Backend untouched.
- Consent/legal checkboxes get no badge (regex identical to `webapp/lib/llm/indexed-questions.ts`'s `CONSENT_NOISE`).
- Picker layer z-index `2147483645` (below the panel `2147483647` and FAB `2147483646`); badges under the open panel's strip are hidden.
- Commit after every task.

---

### Task 1: `extension/lib/question-mapper.js` — pure pick→question mapping

**Files:**
- Create: `extension/lib/question-mapper.js`
- Create: `extension/lib/question-mapper.test.js`
- Modify: `extension/manifest.json` (add `"lib/question-mapper.js"` after `"lib/field-adapters.js"`)

**Interfaces:**
- Consumes: nothing (pure).
- Produces (global `JobTracker.questionMapper`, `module.exports` for tests):
  - `toQuestion(field) → ApplicationQuestion | null` where `field = { label, kind, inputType?, options?(string[]), required?, placeholder?, multiple? }`; null for unlabeled or consent-noise checkboxes.
  - `keyOf(question) → string` — normalized `label::type::options` identity.
  - `mergePicked(existing, pageSelected) → question[]` — off-page questions keep order, then page-ordered picks; `flagged` preserved by key.
  - `isConsentNoise(label) → boolean`.

- [ ] **Step 1: Write the failing tests**

Create `extension/lib/question-mapper.test.js`:

```js
// Pure pick→question mapping — the deterministic replacement for the LLM's classification.
import { describe, it, expect } from "vitest";

import mapper from "./question-mapper.js";

const { toQuestion, keyOf, mergePicked, isConsentNoise } = mapper;

describe("toQuestion type matrix", () => {
  const t = (field) => toQuestion(field)?.type;
  it("maps every DOM kind", () => {
    expect(t({ label: "Country", kind: "select", options: ["US"] })).toBe("select");
    expect(t({ label: "Skills", kind: "select", options: ["Go"], multiple: true })).toBe("multi_select");
    expect(t({ label: "Authorized?", kind: "radio", options: ["Yes", "No"] })).toBe("radio");
    expect(t({ label: "Locations", kind: "checkbox", options: ["Remote", "Hybrid"] })).toBe("checkbox");
    expect(t({ label: "Why us?", kind: "textarea" })).toBe("long_text");
    expect(t({ label: "Pitch", kind: "contenteditable" })).toBe("long_text");
    expect(t({ label: "Resume", kind: "file" })).toBe("file");
    expect(t({ label: "Role", kind: "combobox" })).toBe("select");
    expect(t({ label: "Name", kind: "text" })).toBe("short_text");
  });
  it("native input types win on text kind", () => {
    expect(t({ label: "Email", kind: "text", inputType: "email" })).toBe("email");
    expect(t({ label: "Phone", kind: "text", inputType: "tel" })).toBe("tel");
    expect(t({ label: "Site", kind: "text", inputType: "url" })).toBe("url");
    expect(t({ label: "Years", kind: "text", inputType: "number" })).toBe("number");
    expect(t({ label: "Start", kind: "text", inputType: "date" })).toBe("date");
  });
});

describe("toQuestion shape", () => {
  it("carries label/required/placeholder/options verbatim (normalized whitespace)", () => {
    const q = toQuestion({
      label: "  Country of  residence ",
      kind: "select",
      options: ["United States", " Canada "],
      required: true,
      placeholder: "Select…",
    });
    expect(q).toEqual({
      label: "Country of residence",
      type: "select",
      required: true,
      placeholder: "Select…",
      options: ["United States", "Canada"],
    });
  });
  it("omits options for free-entry types", () => {
    const q = toQuestion({ label: "Name", kind: "text", options: ["junk"] });
    expect(q.options).toBeUndefined();
  });
  it("returns null for unlabeled fields and consent checkboxes", () => {
    expect(toQuestion({ label: "  ", kind: "text" })).toBeNull();
    expect(toQuestion({ label: "I agree to the privacy policy", kind: "checkbox" })).toBeNull();
    // consent wording on a RADIO survives (checkbox-only filter)
    expect(toQuestion({ label: "Do you consent to a background check?", kind: "radio", options: ["Yes", "No"] })).not.toBeNull();
  });
});

describe("keyOf", () => {
  it("is case/whitespace-insensitive over label+type+options", () => {
    const a = toQuestion({ label: "Full  Name", kind: "text" });
    const b = toQuestion({ label: "full name ", kind: "text" });
    expect(keyOf(a)).toBe(keyOf(b));
    const c = toQuestion({ label: "Full Name", kind: "textarea" });
    expect(keyOf(a)).not.toBe(keyOf(c));
  });
});

describe("mergePicked", () => {
  const q = (label, extra = {}) => ({ label, type: "short_text", ...extra });
  it("keeps off-page questions first (original order), then page-ordered picks", () => {
    const existing = [q("Old A"), q("Name"), q("Old B")];
    const page = [q("Email"), q("Name")]; // page order: Email before Name
    expect(mergePicked(existing, page).map((x) => x.label)).toEqual([
      "Old A", "Old B", "Email", "Name",
    ]);
  });
  it("preserves the flagged star across a re-pick", () => {
    const existing = [q("Name", { flagged: true })];
    const page = [q("Name")];
    expect(mergePicked(existing, page)[0].flagged).toBe(true);
  });
  it("handles empty inputs", () => {
    expect(mergePicked([], [])).toEqual([]);
    expect(mergePicked([q("A")], []).map((x) => x.label)).toEqual(["A"]);
  });
});

describe("isConsentNoise", () => {
  it("matches privacy/terms/gdpr/newsletter/marketing", () => {
    expect(isConsentNoise("I accept the Terms of Service")).toBe(true);
    expect(isConsentNoise("Subscribe to our newsletter")).toBe(true);
    expect(isConsentNoise("Preferred locations")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd extension && ./node_modules/.bin/vitest run lib/question-mapper.test.js`
Expected: FAIL — cannot resolve `./question-mapper.js`.

- [ ] **Step 3: Implement `extension/lib/question-mapper.js`**

```js
// Pick → question mapper — the deterministic replacement for the LLM's classification step.
//
// A harvested field descriptor (ui/application.js#harvestQuestions) converts to the EXACT
// ApplicationQuestion shape the backend already validates and stores ({ label, type,
// required?, placeholder?, options? } — lib/validations/job.ts). Same type matrix as the
// indexed backend (webapp/lib/llm/indexed-questions.ts#domDefaultType), plus select[multiple]
// → multi_select. keyOf() is the question's stable identity — what the picker registry and
// the selected-state restore key on (content identity, so it survives DOM re-renders AND
// round-trips through storage, unlike a DOM-attribute key).
(function (root, factory) {
  "use strict";
  const api = factory();
  const NS = (root.JobTracker = root.JobTracker || {});
  NS.questionMapper = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();

  const NATIVE_TYPE = { email: "email", tel: "tel", url: "url", number: "number", date: "date" };
  const TYPES_WITH_OPTIONS = new Set(["select", "radio", "multi_select", "checkbox"]);

  // Keep identical to webapp/lib/llm/indexed-questions.ts CONSENT_NOISE.
  const CONSENT_NOISE =
    /\b(privacy\s+(policy|notice|statement)|terms\s+(of|and|&)|t&c|consent|gdpr|data\s+(processing|protection)|newsletter|marketing\s+(emails?|communications?)|promotional)\b/i;

  function isConsentNoise(label) {
    return CONSENT_NOISE.test(String(label || ""));
  }

  function typeOf(field) {
    switch (field.kind) {
      case "select":
        return field.multiple ? "multi_select" : "select";
      case "radio":
        return "radio";
      case "checkbox":
        return "checkbox";
      case "textarea":
      case "contenteditable":
        return "long_text";
      case "file":
        return "file";
      case "combobox":
        return "select";
      default:
        return NATIVE_TYPE[norm(field.inputType).toLowerCase()] || "short_text";
    }
  }

  // Harvested field → stored question. null = not a trackable question (unlabeled, or a
  // consent/legal checkbox — the "ignore privacy checkboxes" rule, checkbox-kind only).
  function toQuestion(field) {
    const label = norm(field.label);
    if (!label) return null;
    const type = typeOf(field);
    if (type === "checkbox" && isConsentNoise(label)) return null;
    const q = { label, type };
    if (field.required === true) q.required = true;
    const placeholder = norm(field.placeholder);
    if (placeholder) q.placeholder = placeholder;
    if (TYPES_WITH_OPTIONS.has(type)) {
      const options = (Array.isArray(field.options) ? field.options : [])
        .map(norm)
        .filter(Boolean);
      if (options.length) q.options = options;
    }
    return q;
  }

  /** Stable content identity: normalized label + type + options. */
  function keyOf(question) {
    const L = (s) => norm(s).toLowerCase();
    return [
      L(question.label),
      question.type,
      (question.options || []).map(L).join("|"),
    ].join("::");
  }

  // Merge the page's currently-selected questions (page order) into the existing tracked
  // set: questions NOT represented on this page keep their original relative order (they
  // were picked on another sub-page/session), then the on-page picks follow in page order.
  // The user-set `flagged` star survives a re-pick by key.
  function mergePicked(existing, pageSelected) {
    const prior = Array.isArray(existing) ? existing : [];
    const page = Array.isArray(pageSelected) ? pageSelected : [];
    const pageKeys = new Set(page.map(keyOf));
    const flaggedByKey = new Set(prior.filter((q) => q && q.flagged).map(keyOf));
    const offPage = prior.filter((q) => q && !pageKeys.has(keyOf(q)));
    const picks = page.map((q) => (flaggedByKey.has(keyOf(q)) ? { ...q, flagged: true } : q));
    return [...offPage, ...picks];
  }

  return { toQuestion, keyOf, mergePicked, isConsentNoise };
});
```

- [ ] **Step 4: Manifest entry**

In `extension/manifest.json` `content_scripts[0].js`, insert `"lib/question-mapper.js"` immediately after `"lib/field-adapters.js"`.

- [ ] **Step 5: Run tests**

Run: `cd extension && ./node_modules/.bin/vitest run lib/question-mapper.test.js`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add extension/lib/question-mapper.js extension/lib/question-mapper.test.js extension/manifest.json
git commit -m "feat(extension): deterministic pick→question mapper"
```

---

### Task 2: Harvest v3 — `multiple` flag + per-question anchors

**Files:**
- Modify: `extension/ui/application.js` (`harvestQuestions`, ~lines 864-970)

**Interfaces:**
- Consumes: existing harvest internals.
- Produces: `harvestQuestions()` now returns `{ fields, total, controlIds, anchors }` where `anchors: Map<fieldId, Element[]>` (cluster options / group inputs / [single el]); select fields gain `multiple: true` when `<select multiple>`.

- [ ] **Step 1: Add the anchors map and multiple flag**

In `harvestQuestions()` after `const controlIds = new WeakMap();` add:

```js
    // Field-id → the live element(s) the question spans. The on-page picker anchors its badge
    // to the bounding box of this set (group = all members; cluster = its option buttons).
    const anchors = new Map();
```

In the Phase-1 cluster loop, change the `fields.push({ id: nextQid(), ... })` line to:

```js
      const cf = { id: nextQid(), label, kind: "radio", options: live.map((el) => textOf(el)).slice(0, MAX_OPTIONS) };
      fields.push(cf);
      anchors.set(cf.id, live.slice());
```

In `emitGroup`, after `inputs.forEach((i) => controlIds.set(i, f.id));` add:

```js
      anchors.set(f.id, inputs.slice());
```

In the singles loop: after `else if (el.tagName === "SELECT") { kind = "select"; options = selectOptions(el).map((o) => o.label); }` handling — add the multiple flag where `f` is built, and the anchor after `controlIds.set(el, f.id);`:

```js
      const f = { id: nextQid(), label: labelForControl(el), kind };
      if (el.tagName === "SELECT" && el.multiple) f.multiple = true; // → multi_select downstream
      if (inputType) f.inputType = inputType;
```
```js
      controlIds.set(el, f.id);
      anchors.set(f.id, [el]);
```

Change the return to:

```js
    const cleaned = fields.filter((f) => f.label && f.label.trim()).slice(0, MAX_FIELDS);
    // controlIds/anchors may still reference dropped (unlabelled) ids — consumers resolve
    // against the CLEANED field list, so those entries are simply never read.
    return { fields: cleaned, total: cleaned.length, controlIds, anchors };
```

- [ ] **Step 2: Regression + syntax check**

Run: `cd extension && node --check ui/application.js && ./node_modules/.bin/vitest run`
Expected: clean + all suites pass (no test reads the new keys yet; capture tests unaffected).

- [ ] **Step 3: Commit**

```bash
git add extension/ui/application.js
git commit -m "feat(extension): harvest anchors + select[multiple] flag for the field picker"
```

---

### Task 3: `extension/ui/field-picker.js` — overlay layer, badges, states

**Files:**
- Create: `extension/ui/field-picker.js`
- Create: `extension/ui/field-picker.test.js`
- Modify: `extension/manifest.json` (add `"ui/field-picker.js"` after `"ui/application.js"`)

**Interfaces:**
- Consumes: `JobTracker.ui.autofill.harvestQuestions` (Task 2 shape), `JobTracker.questionMapper` (Task 1), `JobTracker.scope.settle`.
- Produces (global `JobTracker.ui.picker`, `module.exports` for tests):
  - `activate({ selectedKeys?, onPick?, onUnpick? }) → Promise<void>` — idempotent; `onPick(question, key)`, `onUnpick(key)`.
  - `deactivate()` — idempotent teardown.
  - `setSelectedKeys(keys)` — external sync.
  - `getSelected() → question[]` — page-ordered currently-selected questions.
  - `isActive() → boolean`.
  - `ADD_DELAY_MS = 500` (exported for tests).

- [ ] **Step 1: Write the failing tests**

Create `extension/ui/field-picker.test.js`:

```js
// Field-picker layer tests — jsdom. The harvest is stubbed (jsdom can't do visibility), so
// these exercise the picker's own contract: registry idempotence, pick/unpick flow with the
// deliberate delay, selected-state restore, and teardown.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import "../lib/question-mapper.js";
import picker from "./field-picker.js";

const LAYER_ID = "jobtracker-picker-host";

function fakeAnchor(rect) {
  const el = document.createElement("input");
  document.body.append(el);
  el.getBoundingClientRect = () => ({
    top: rect.top, left: rect.left, right: rect.left + rect.width, bottom: rect.top + rect.height,
    width: rect.width, height: rect.height, x: rect.left, y: rect.top,
  });
  el.getClientRects = () => [{}];
  return el;
}

function stubHarvest(fields, anchors) {
  const NS = (self.JobTracker = self.JobTracker || {});
  NS.ui = NS.ui || {};
  NS.ui.autofill = {
    harvestQuestions: () => ({ fields, total: fields.length, controlIds: new WeakMap(), anchors }),
  };
  NS.scope = { settle: () => Promise.resolve() };
}

function twoFields() {
  const a1 = fakeAnchor({ top: 10, left: 10, width: 300, height: 40 });
  const a2 = fakeAnchor({ top: 80, left: 10, width: 300, height: 40 });
  const fields = [
    { id: "q1", label: "Full name", kind: "text", required: true },
    { id: "q2", label: "Country", kind: "select", options: ["US", "CA"] },
  ];
  const anchors = new Map([["q1", [a1]], ["q2", [a2]]]);
  return { fields, anchors };
}

const badges = () =>
  document.getElementById(LAYER_ID).shadowRoot.querySelectorAll(".jtp-badge");

beforeEach(() => {
  document.body.innerHTML = "";
  vi.useFakeTimers();
});
afterEach(async () => {
  picker.deactivate();
  vi.useRealTimers();
});

describe("activation & registry", () => {
  it("renders ONE badge per question, even when activated twice", async () => {
    const { fields, anchors } = twoFields();
    stubHarvest(fields, anchors);
    await picker.activate({});
    await picker.activate({}); // idempotent
    expect(badges().length).toBe(2);
  });

  it("skips consent checkboxes and drops badges whose question left the page", async () => {
    const a = fakeAnchor({ top: 10, left: 10, width: 300, height: 40 });
    stubHarvest(
      [{ id: "q1", label: "I agree to the privacy policy", kind: "checkbox" }],
      new Map([["q1", [a]]]),
    );
    await picker.activate({});
    expect(badges().length).toBe(0);
  });

  it("pre-marks badges for selectedKeys", async () => {
    const { fields, anchors } = twoFields();
    stubHarvest(fields, anchors);
    const mapper = self.JobTracker.questionMapper;
    const key = mapper.keyOf(mapper.toQuestion(fields[0]));
    await picker.activate({ selectedKeys: [key] });
    const marked = document
      .getElementById(LAYER_ID)
      .shadowRoot.querySelectorAll(".jtp-badge.selected");
    expect(marked.length).toBe(1);
  });
});

describe("pick / unpick flow", () => {
  it("runs the ~500ms working state, then selects and fires onPick", async () => {
    const { fields, anchors } = twoFields();
    stubHarvest(fields, anchors);
    const onPick = vi.fn();
    await picker.activate({ onPick });
    const badge = badges()[0];
    badge.click();
    expect(badge.classList.contains("working")).toBe(true);
    expect(onPick).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(picker.ADD_DELAY_MS + 20);
    expect(badge.classList.contains("selected")).toBe(true);
    expect(onPick).toHaveBeenCalledTimes(1);
    const [question, key] = onPick.mock.calls[0];
    expect(question).toEqual({ label: "Full name", type: "short_text", required: true });
    expect(typeof key).toBe("string");
    expect(picker.getSelected().map((q) => q.label)).toEqual(["Full name"]);
  });

  it("unpick reverts to idle and fires onUnpick", async () => {
    const { fields, anchors } = twoFields();
    stubHarvest(fields, anchors);
    const onUnpick = vi.fn();
    await picker.activate({ onUnpick });
    const badge = badges()[0];
    badge.click();
    await vi.advanceTimersByTimeAsync(picker.ADD_DELAY_MS + 20);
    badge.click(); // deselect
    await vi.advanceTimersByTimeAsync(picker.ADD_DELAY_MS + 20);
    expect(badge.classList.contains("selected")).toBe(false);
    expect(onUnpick).toHaveBeenCalledTimes(1);
    expect(picker.getSelected()).toEqual([]);
  });

  it("ignores clicks while working (no double-fire)", async () => {
    const { fields, anchors } = twoFields();
    stubHarvest(fields, anchors);
    const onPick = vi.fn();
    await picker.activate({ onPick });
    const badge = badges()[0];
    badge.click();
    badge.click();
    badge.click();
    await vi.advanceTimersByTimeAsync(picker.ADD_DELAY_MS + 20);
    expect(onPick).toHaveBeenCalledTimes(1);
  });
});

describe("deactivate", () => {
  it("removes the layer entirely and is idempotent", async () => {
    const { fields, anchors } = twoFields();
    stubHarvest(fields, anchors);
    await picker.activate({});
    picker.deactivate();
    picker.deactivate();
    expect(document.getElementById(LAYER_ID)).toBeNull();
    expect(picker.isActive()).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd extension && ./node_modules/.bin/vitest run ui/field-picker.test.js`
Expected: FAIL — cannot resolve `./field-picker.js`.

- [ ] **Step 3: Implement `extension/ui/field-picker.js`**

```js
// On-page field picker — the deterministic, user-driven replacement for LLM question
// extraction. One overlay LAYER (shadow-rooted host on <html>, pointer-events:none, max-ish
// z-index BELOW the panel) holds one badge per logical question harvested from the page.
// The host page's DOM is never mutated — framework re-renders can't duplicate or delete our
// badges, site CSS can't leak in, and teardown is removing one node.
//
// Identity: badges are keyed by the QUESTION's content identity (questionMapper.keyOf —
// label+type+options), not by DOM attributes. A re-rendered control re-associates with its
// badge and keeps its selected state; stored questions restore their marks the same way.
(function (root, factory) {
  "use strict";
  const NS = (root.JobTracker = root.JobTracker || {});
  NS.ui = NS.ui || {};
  const api = factory(root);
  NS.ui.picker = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis, function (root) {
  "use strict";

  const LAYER_ID = "jobtracker-picker-host";
  const PANEL_HOST_ID = "jobtracker-modal-host";
  const ADD_DELAY_MS = 500; // deliberate perceived-effort delay before the success state
  const REMOVE_DELAY_MS = 220; // brief working state on deselect — feedback without friction
  const BADGE = 26; // px diameter
  const GAP = 8; // px between control edge and an outside badge
  const REHARVEST_MS = 400;

  const CSS = `
    :host { all: initial; }
    .jtp-layer { position: fixed; inset: 0; z-index: 2147483645; pointer-events: none;
      font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }
    .jtp-badge { position: absolute; width: ${BADGE}px; height: ${BADGE}px; border-radius: 50%;
      box-sizing: border-box; pointer-events: auto; cursor: pointer; padding: 0;
      display: flex; align-items: center; justify-content: center;
      background: #ffffff; border: 1.5px solid #3f9b6a; color: #3f9b6a;
      box-shadow: 0 1px 4px rgba(26, 43, 34, 0.18);
      transition: transform .16s ease, background .16s ease, color .16s ease, opacity .16s ease; }
    .jtp-badge:hover { transform: scale(1.08); box-shadow: 0 2px 8px rgba(26, 43, 34, 0.24); }
    .jtp-badge svg { width: 14px; height: 14px; display: block; }
    .jtp-badge.working { cursor: default; border-color: #3f9b6a; }
    .jtp-badge.working svg { animation: jtp-spin .7s linear infinite; }
    .jtp-badge.selected { background: #3f9b6a; border-color: #2f7b53; color: #ffffff;
      animation: jtp-pop .28s cubic-bezier(.32,1.6,.4,1); }
    .jtp-badge.unpicked { animation: jtp-shrink .24s ease; }
    .jtp-badge.hidden { opacity: 0; pointer-events: none; }
    .jtp-tip { position: absolute; transform: translate(-50%, -130%); padding: 4px 8px;
      border-radius: 6px; background: #1a2b22; color: #fff; font-size: 11px; line-height: 1.2;
      white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity .12s ease; }
    .jtp-badge:hover + .jtp-tip { opacity: 1; }
    @keyframes jtp-spin { to { transform: rotate(360deg); } }
    @keyframes jtp-pop { 0% { transform: scale(.7); } 60% { transform: scale(1.14); } 100% { transform: scale(1); } }
    @keyframes jtp-shrink { 0% { transform: scale(1.1); } 100% { transform: scale(1); } }
  `;

  const SVGNS = "http://www.w3.org/2000/svg";
  const GLYPH = {
    plus: "M12 5v14M5 12h14",
    check: "M20 6L9 17l-5-5",
    spinner: "M21 12a9 9 0 1 1-6.2-8.56",
  };

  function glyph(name) {
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.4");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    const p = document.createElementNS(SVGNS, "path");
    p.setAttribute("d", GLYPH[name]);
    svg.append(p);
    return svg;
  }

  // ---- module state ------------------------------------------------------------------------
  let active = false;
  let host = null;
  let layer = null;
  let registry = new Map(); // key → { badge, tip, anchors, question, order, state }
  let selected = new Set(); // keys
  let hooks = {};
  let mo = null;
  let moTimer = null;
  let rafPending = false;
  let pageOrder = []; // keys in harvest (page) order, refreshed per harvest

  function deps() {
    const NS = root.JobTracker || {};
    const ui = NS.ui || {};
    return { autofill: ui.autofill, mapper: NS.questionMapper, scope: NS.scope };
  }

  function ensureLayer() {
    if (host && host.isConnected) return;
    host = document.createElement("div");
    host.id = LAYER_ID;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    layer = document.createElement("div");
    layer.className = "jtp-layer";
    shadow.append(style, layer);
    document.documentElement.append(host);
  }

  // ---- badge state machine -----------------------------------------------------------------
  function setBadgeState(entry, state) {
    entry.state = state;
    const b = entry.badge;
    b.classList.toggle("working", state === "working");
    b.classList.toggle("selected", state === "selected");
    b.replaceChildren(glyph(state === "working" ? "spinner" : state === "selected" ? "check" : "plus"));
    b.setAttribute("aria-pressed", state === "selected" ? "true" : "false");
    const tipText = state === "selected" ? "Tracked — click to remove" : "Track this question";
    b.setAttribute("aria-label", tipText);
    entry.tip.textContent = tipText;
  }

  function onBadgeClick(entry) {
    if (!active || entry.state === "working") return;
    const wasSelected = entry.state === "selected";
    setBadgeState(entry, "working");
    setTimeout(() => {
      if (!active || !registry.has(entry.key)) return;
      if (wasSelected) {
        selected.delete(entry.key);
        setBadgeState(entry, "idle");
        entry.badge.classList.add("unpicked"); // shrink-fade deselect feedback
        setTimeout(() => entry.badge.classList.remove("unpicked"), 260);
        if (typeof hooks.onUnpick === "function") hooks.onUnpick(entry.key);
      } else {
        selected.add(entry.key);
        setBadgeState(entry, "selected");
        if (typeof hooks.onPick === "function") hooks.onPick(entry.question, entry.key);
      }
    }, wasSelected ? REMOVE_DELAY_MS : ADD_DELAY_MS);
  }

  function makeEntry(key, question) {
    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = "jtp-badge";
    const tip = document.createElement("span");
    tip.className = "jtp-tip";
    const entry = { key, question, badge, tip, anchors: [], order: 0, state: "idle" };
    badge.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onBadgeClick(entry);
    });
    layer.append(badge, tip);
    setBadgeState(entry, "idle");
    return entry;
  }

  // ---- harvest → registry --------------------------------------------------------------------
  function refresh() {
    if (!active) return;
    const { autofill, mapper } = deps();
    if (!autofill || !mapper || typeof autofill.harvestQuestions !== "function") return;
    let h;
    try {
      h = autofill.harvestQuestions();
    } catch (_) {
      return; // a hostile page mid-teardown — try again on the next mutation tick
    }
    ensureLayer();
    const seen = new Set();
    pageOrder = [];
    for (const field of h.fields || []) {
      const question = mapper.toQuestion(field);
      if (!question) continue; // unlabeled or consent-noise checkbox
      const key = mapper.keyOf(question);
      if (seen.has(key)) continue; // one badge per question identity — duplicates impossible
      const anchors = (h.anchors && h.anchors.get(field.id)) || [];
      if (!anchors.length) continue;
      seen.add(key);
      pageOrder.push(key);
      let entry = registry.get(key);
      if (!entry) {
        entry = makeEntry(key, question);
        registry.set(key, entry);
      }
      entry.question = question;
      entry.anchors = anchors;
      entry.order = pageOrder.length - 1;
      if (entry.state !== "working") {
        setBadgeState(entry, selected.has(key) ? "selected" : "idle");
      }
    }
    for (const [key, entry] of registry) {
      if (!seen.has(key)) {
        entry.badge.remove();
        entry.tip.remove();
        registry.delete(key);
      }
    }
    positionAll();
  }

  // ---- positioning ---------------------------------------------------------------------------
  function unionRect(anchors) {
    let r = null;
    for (const el of anchors) {
      if (!el || !el.isConnected) continue;
      if (el.getClientRects && el.getClientRects().length === 0) continue; // not rendered
      const b = el.getBoundingClientRect();
      if (!b || (b.width === 0 && b.height === 0)) continue;
      r = r
        ? {
            top: Math.min(r.top, b.top),
            left: Math.min(r.left, b.left),
            right: Math.max(r.right, b.right),
            bottom: Math.max(r.bottom, b.bottom),
          }
        : { top: b.top, left: b.left, right: b.right, bottom: b.bottom };
    }
    return r;
  }

  // The save panel owns the viewport's right strip while open — hide badges under it.
  function panelLeftEdge() {
    const panelHost = document.getElementById(PANEL_HOST_ID);
    if (!panelHost) return Infinity;
    try {
      const panel = panelHost.shadowRoot && panelHost.shadowRoot.querySelector(".panel");
      if (panel) {
        const r = panel.getBoundingClientRect();
        if (r.width > 0) return r.left;
      }
    } catch (_) {}
    const iw = root.innerWidth || document.documentElement.clientWidth || 0;
    return iw - Math.min(384, iw * 0.94); // panel CSS: width:min(384px,94vw), pinned right
  }

  function positionAll() {
    const iw = root.innerWidth || document.documentElement.clientWidth || 0;
    const ih = root.innerHeight || document.documentElement.clientHeight || 0;
    const panelLeft = panelLeftEdge();
    for (const entry of registry.values()) {
      const r = unionRect(entry.anchors);
      const b = entry.badge;
      if (!r || r.bottom < 0 || r.top > ih) {
        b.classList.add("hidden");
        continue;
      }
      // Outside placement (right of the control) when there's room before the viewport edge
      // AND the panel; otherwise tuck at the control's top-right corner in the label gap —
      // never over the field's text or its question label.
      let left;
      let top;
      const outsideLeft = r.right + GAP;
      if (outsideLeft + BADGE + 4 <= Math.min(iw, panelLeft)) {
        left = outsideLeft;
        top = (r.top + r.bottom) / 2 - BADGE / 2;
      } else {
        left = r.right - BADGE - 6;
        top = r.top - BADGE / 2;
      }
      if (left + BADGE / 2 > panelLeft) {
        b.classList.add("hidden"); // under the open panel
        continue;
      }
      b.classList.remove("hidden");
      b.style.left = Math.max(2, Math.min(left, iw - BADGE - 2)) + "px";
      b.style.top = Math.max(2, Math.min(top, ih - BADGE - 2)) + "px";
      entry.tip.style.left = b.style.left ? parseFloat(b.style.left) + BADGE / 2 + "px" : "0";
      entry.tip.style.top = b.style.top;
    }
  }

  function schedulePosition() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      if (active) positionAll();
    });
  }

  function onMutations() {
    clearTimeout(moTimer);
    moTimer = setTimeout(() => {
      if (active) refresh();
    }, REHARVEST_MS);
  }

  function startObservers() {
    root.addEventListener("scroll", schedulePosition, { capture: true, passive: true });
    root.addEventListener("resize", schedulePosition, { passive: true });
    try {
      mo = new MutationObserver(onMutations);
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (_) {}
  }

  function stopObservers() {
    root.removeEventListener("scroll", schedulePosition, { capture: true });
    root.removeEventListener("resize", schedulePosition);
    if (mo) mo.disconnect();
    mo = null;
    clearTimeout(moTimer);
    moTimer = null;
  }

  // ---- public API ------------------------------------------------------------------------------
  async function activate(opts) {
    opts = opts || {};
    hooks = { onPick: opts.onPick, onUnpick: opts.onUnpick };
    if (opts.selectedKeys) selected = new Set(opts.selectedKeys);
    if (active) {
      refresh();
      return;
    }
    active = true;
    const { scope } = deps();
    if (scope && typeof scope.settle === "function") await scope.settle();
    if (!active) return; // deactivated while settling
    ensureLayer();
    refresh();
    startObservers();
  }

  function deactivate() {
    if (!active && !host) return;
    active = false;
    stopObservers();
    if (host) host.remove();
    host = null;
    layer = null;
    registry = new Map();
    pageOrder = [];
  }

  function setSelectedKeys(keys) {
    selected = new Set(keys || []);
    for (const [key, entry] of registry) {
      if (entry.state === "working") continue;
      setBadgeState(entry, selected.has(key) ? "selected" : "idle");
    }
  }

  /** Currently-selected questions in page order. */
  function getSelected() {
    const out = [];
    for (const key of pageOrder) {
      if (!selected.has(key)) continue;
      const entry = registry.get(key);
      if (entry) out.push(entry.question);
    }
    return out;
  }

  function isActive() {
    return active;
  }

  return { activate, deactivate, setSelectedKeys, getSelected, isActive, ADD_DELAY_MS };
});
```

- [ ] **Step 4: Manifest entry**

In `extension/manifest.json` `content_scripts[0].js`, insert `"ui/field-picker.js"` immediately after `"ui/application.js"`.

- [ ] **Step 5: Run tests**

Run: `cd extension && ./node_modules/.bin/vitest run ui/field-picker.test.js && ./node_modules/.bin/vitest run`
Expected: PASS; full suite green.

- [ ] **Step 6: Commit**

```bash
git add extension/ui/field-picker.js extension/ui/field-picker.test.js extension/manifest.json
git commit -m "feat(extension): on-page field-picker overlay (badges, states, registry)"
```

---

### Task 4: Modal — picker tray, hint state, disconnect extraction (revertable)

**Files:**
- Modify: `extension/ui/modal.js` (module vars ~line 64, `removeHost`/`close` ~590-614, `open()` opts doc ~640, appState/renderAppBlank ~870-900, renderAppResult header ~940-968, `runAppExtraction` region ~1120-1161, details nudge ~1750)

**Interfaces:**
- Consumes: nothing new.
- Produces: `UI.modal.open(job, opts)` gains `opts.onClose()` (fired on every close path) and `opts.onApplicationReady(api)` with `api.setQuestions(questions, viewOpts)`; Application tab's blank state becomes the picker hint; extract affordances disconnected.

- [ ] **Step 1: onClose plumbing**

At line ~64 (`let activeFlush = null;`) add:

```js
  let activeOnClose = null; // per-open close hook (deactivates the on-page field picker)
```

In `removeHost()` change the reset line to also clear it, and in `close()` invoke it after `activeFlush`:

```js
  function removeHost() {
    if (host) host.remove();
    host = shadow = overlayEl = panelEl = activeFlush = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function close() {
    if (!host) return;
    // Persist the latest Details snapshot before anything tears down (close may be fired by a
    // navigation, after which storage writes from a delayed timer wouldn't land).
    if (typeof activeFlush === "function") {
      try {
        activeFlush();
      } catch (_) {}
    }
    // Tear down companions (the on-page field picker) on EVERY close path, including nav.
    if (typeof activeOnClose === "function") {
      try {
        activeOnClose();
      } catch (_) {}
      activeOnClose = null;
    }
    ...unchanged animation/removeHost logic...
  }
```

In `open()`, right after the existing `activeFlush` assignment region is fine — set it early (near the top of `open()`, after `opts = opts || {}` equivalent):

```js
    activeOnClose = typeof opts.onClose === "function" ? opts.onClose : null;
```

- [ ] **Step 2: Picker hint state + optional button in appState**

Make `appState`'s button optional (skip when no `btnLabel`) and add the hint renderer after `renderAppBlank`:

```js
    function appState({ kind, title: heading, body: text, iconPaths, btnLabel, btnIcon, loading }) {
      clearApp();
      const ic = el("div", { class: "ic" });
      ic.append(icon(iconPaths));
      const kids = [ic, el("h3", { text: heading }), el("p", { text })];
      if (btnLabel) {
        const btn = el("button", {
          class: "btn btn--primary btn--lg appextract" + (loading ? " loading" : ""),
          type: "button",
        });
        if (loading) btn.disabled = true;
        btn.append(icon(btnIcon), el("span", { text: btnLabel }));
        if (!loading) btn.addEventListener("click", runAppExtraction);
        kids.push(btn);
      }
      appPane.append(el("div", { class: "appstate" + (kind === "err" ? " err" : "") }, kids));
    }

    // Picker mode: the Application tab is a tray filled by picking fields ON THE PAGE.
    function renderAppPickerHint() {
      appState({
        kind: "blank",
        iconPaths: ICON.clipboard,
        title: "Pick questions from the page",
        body: "Click the + button next to any application field on this page to track it here. Click a tracked field again to remove it.",
      });
    }
```

- [ ] **Step 3: Disconnect extraction affordances (revertable)**

Replace the initial `renderAppBlank();` call (line ~1142) with:

```js
    // REVERT: to restore LLM question extraction, call renderAppBlank() here instead (its
    // button wires runAppExtraction), re-enable the reextract button in renderAppResult,
    // and re-enable onExtractApplication in content.js#openSavePanel.
    renderAppPickerHint();
```

In `renderAppResult`, comment out the re-extract button from the header (keep `reBtn` construction commented for revert):

```js
      // REVERT(LLM extraction): re-extract affordance, disconnected in picker mode.
      // const reBtn = el("button", {
      //   class: "reextract", type: "button", title: "Re-extract questions", "aria-label": "Re-extract questions",
      // });
      // reBtn.append(icon(ICON.refresh));
      // reBtn.addEventListener("click", runAppExtraction);
      const count = questions.length + (questions.length === 1 ? " question" : " questions");
```

and change `const headActions = el("div", { class: "apphead-actions" }, [reBtn]);` to:

```js
      const headActions = el("div", { class: "apphead-actions" }, []);
```

`runAppExtraction` itself stays (unreferenced now except by the commented code — add `// eslint-disable-line` style note not needed; keep as-is with a REVERT comment above it).

- [ ] **Step 4: Application API for the tray**

After the `loadApplication` restore block (~line 1161) add:

```js
    // Picker-mode tray API: content.js pushes the picked-question set here as the user picks/
    // unpicks fields on the page. setQuestions marks appInteracted so a slow loadApplication
    // restore can't clobber a fresher pick.
    if (typeof opts.onApplicationReady === "function") {
      opts.onApplicationReady({
        setQuestions(questions, viewOpts) {
          appInteracted = true;
          if (questions && questions.length) renderAppResult(questions, viewOpts);
          else renderAppPickerHint();
        },
      });
    }
```

- [ ] **Step 5: Nudge wording**

In `runDetailsExtraction`'s detected-form block, change the button text `"Form detected — extract questions"` to `"Form detected — pick questions"` (the click already just switches to the Application tab, which is now the tray).

- [ ] **Step 6: Verify**

Run: `cd extension && node --check ui/modal.js && ./node_modules/.bin/vitest run`
Expected: clean; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add extension/ui/modal.js
git commit -m "feat(extension): modal picker tray + hint; disconnect LLM question extraction (revertable)"
```

---

### Task 5: content.js wiring — activate on open, sync picks, persist

**Files:**
- Modify: `extension/content.js` (`openSavePanel` ~80-165)

**Interfaces:**
- Consumes: `UI.picker` (Task 3), `JT.questionMapper` (Task 1), modal opts (Task 4), existing `mergeJobRecord`/record shape.
- Produces: end-to-end flow; save payload unchanged (reads `record.questions` as before).

- [ ] **Step 1: Wire the picker in `openSavePanel`**

Inside `openSavePanel()`, before the `UI.modal.open(initial, {...})` call, add:

```js
    // ---- on-page field picker (deterministic question capture) ----
    // State for this panel session: the tracked questions (seeded from the anchored record —
    // cached picks/extractions or the saved job's server copy) and the modal tray handle.
    const MAPPER = JT.questionMapper;
    let applicationApi = null;
    let pickedQuestions = record && Array.isArray(record.questions) ? record.questions.slice() : [];
    const savedView = !!(record && record.saved && record.saved.id);
    const trayViewOpts = () =>
      savedView ? { answers: (record && record.answers) || {}, readOnly: true } : undefined;
    const persistPicked = () => mergeJobRecord(anchorId, { questions: pickedQuestions });
    const refreshTray = () => {
      if (applicationApi) applicationApi.setQuestions(pickedQuestions, trayViewOpts());
    };
```

In the `UI.modal.open(initial, { ... })` options, make these changes:

```js
      onApplicationExtracted: (questions) => {
        // Flag toggles re-persist through this same hook (renderAppResult calls it).
        pickedQuestions = questions;
        mergeJobRecord(anchorId, { questions });
      },
      // REVERT(LLM extraction): restore the line below to bring back extract-on-demand.
      // onExtractApplication: () => requestApplicationExtraction(),
      onApplicationReady: (api) => {
        applicationApi = api;
      },
      onClose: () => {
        if (UI.picker) UI.picker.deactivate();
      },
```

(The `onExtractApplication:` line that exists today is what gets commented out.)

After the `UI.modal.open(...)` call, add:

```js
    // Activate the picker the moment the panel opens (bookmark click) — affordances appear
    // immediately, pre-marked for questions already tracked for this posting.
    if (UI.picker && MAPPER) {
      UI.picker
        .activate({
          selectedKeys: pickedQuestions.map((q) => MAPPER.keyOf(q)),
          onPick: () => {
            pickedQuestions = MAPPER.mergePicked(pickedQuestions, UI.picker.getSelected());
            persistPicked();
            refreshTray();
          },
          onUnpick: (key) => {
            pickedQuestions = pickedQuestions.filter((q) => MAPPER.keyOf(q) !== key);
            persistPicked();
            refreshTray();
          },
        })
        .catch(() => {});
    }
```

- [ ] **Step 2: Verify + regression**

Run: `cd extension && node --check content.js && ./node_modules/.bin/vitest run`
Expected: clean; all pass.

- [ ] **Step 3: Commit**

```bash
git add extension/content.js
git commit -m "feat(extension): wire field picker into panel open/close + record persistence"
```

---

### Task 6: Docs + manual QA

**Files:**
- Modify: `webapp/docs/BACKEND.md` (indexed-extraction section: note the extension now captures questions via the on-page picker; the `/api/extract-application/indexed` route remains live but is no longer called by the extension)
- Memory: update `indexed-extraction-module.md` accordingly.

- [ ] **Step 1: BACKEND.md note** — append to the indexed section:

```markdown
> **Update (2026-07-02):** the extension now captures application questions via the
> deterministic ON-PAGE FIELD PICKER (`extension/ui/field-picker.js` +
> `lib/question-mapper.js`; spec `docs/superpowers/specs/2026-07-02-field-picker-design.md`)
> — zero LLM calls for questions. `/api/extract-application/indexed` stays live (revert path;
> web-app import unaffected) but the extension no longer calls it. Details extraction is
> unchanged.
```

- [ ] **Step 2: Manual QA checklist (user-driven; no Playwright/DevTools MCP)**

- Greenhouse + Ashby + Lever: bookmark click → badges appear ≤ ~1s on every real question control (one per radio/checkbox group), none on privacy-consent checkboxes, none over the panel.
- Pick 3 fields incl. a dropdown → spinner ~0.5s → fern check pop; tray shows them with exact DOM options; unpick one → shrink feedback + tray updates.
- Scroll/resize → badges track; collapse/expand a form section → badges follow within ~1s; no duplicates ever (spot-check after SPA tab flips).
- Close panel → badges gone instantly; reopen → previous picks pre-marked.
- Save job → web-app job page renders picked questions identically to old extractions; flag a question → star survives reopen.

- [ ] **Step 3: Commit**

```bash
git add webapp/docs/BACKEND.md
git commit -m "docs: extension question capture now via on-page field picker"
```

---

## Self-review notes

- Spec coverage: §3 lifecycle → Tasks 3/5; §4 badge set → Tasks 1/2/3; §5 anatomy/states → Task 3; §6 mapping → Task 1; §7 state/sync → Tasks 4/5; §8 disconnect → Tasks 4/5; §9 robustness → Task 3 (+ QA); §10 testing → Tasks 1/3 + QA.
- Identity refinement vs spec §5: registry keys on `questionMapper.keyOf` (content identity) rather than DOM `fieldKey` — strictly better for restore (works from stored questions) and still guarantees one badge per logical question; spec's intent preserved.
- Type consistency: `activate/deactivate/setSelectedKeys/getSelected/isActive/ADD_DELAY_MS` used identically in Tasks 3 and 5; `toQuestion/keyOf/mergePicked` in Tasks 1, 3, 5; modal `onApplicationReady/api.setQuestions/onClose` in Tasks 4 and 5; harvest `anchors` shape in Tasks 2 and 3.
