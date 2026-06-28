// Tests for the field-adapters fill engine (DOM-interaction layer of autofill). Run with jsdom so
// the native `value` descriptor on HTMLInputElement.prototype behaves like a real browser — that
// descriptor is exactly what React's controlled-input value tracker hooks, and getting it right is
// the whole point of this module.
import { describe, it, expect, beforeEach } from "vitest";

import fill from "./field-adapters.js";

const { setNativeValue, createAdapter, fillField, FilledRegistry, norm } = fill;

// ---- DOM builders ----------------------------------------------------------
function mount(el) {
  document.body.append(el);
  return el;
}
function input(type = "text", attrs = {}) {
  const el = document.createElement("input");
  el.type = type;
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return mount(el);
}
function textarea() {
  return mount(document.createElement("textarea"));
}
function selectEl(options, { placeholder = true } = {}) {
  const sel = document.createElement("select");
  if (placeholder) {
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = "Select…";
    sel.append(ph);
  }
  for (const o of options) {
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label ?? o.value;
    sel.append(opt);
  }
  return mount(sel);
}
function radioOptions(name, opts) {
  const fs = mount(document.createElement("fieldset"));
  return opts.map((o) => {
    const el = document.createElement("input");
    el.type = "radio";
    el.name = name;
    el.value = o.value;
    fs.append(el);
    return { el, value: o.value, label: o.label ?? o.value };
  });
}
function checkboxOptions(name, opts) {
  const fs = mount(document.createElement("fieldset"));
  return opts.map((o) => {
    const el = document.createElement("input");
    el.type = "checkbox";
    el.name = name;
    el.value = o.value;
    fs.append(el);
    return { el, value: o.value, label: o.label ?? o.value };
  });
}
function buttonOptions(labels) {
  const wrap = mount(document.createElement("div"));
  return labels.map((t) => {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = t;
    // a typical custom segmented control reflects selection via aria-pressed
    el.addEventListener("click", () => {
      wrap.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false"));
      el.setAttribute("aria-pressed", "true");
    });
    wrap.append(el);
    return { el, label: t };
  });
}
function comboboxEl(optionTexts, { preselect } = {}) {
  const el = input("text", { role: "combobox", "aria-controls": "lb1", "aria-autocomplete": "list" });
  const lb = document.createElement("div");
  lb.id = "lb1";
  lb.setAttribute("role", "listbox");
  for (const t of optionTexts) {
    const o = document.createElement("div");
    o.setAttribute("role", "option");
    o.textContent = t;
    o.addEventListener("click", () => {
      setNativeValue(el, t);
      el.setAttribute("data-chosen", t);
    });
    lb.append(o);
  }
  mount(lb);
  if (preselect) {
    el.value = preselect;
    el.setAttribute("data-chosen", preselect);
  }
  return el;
}
function contentEditable() {
  const el = document.createElement("div");
  el.setAttribute("contenteditable", "true");
  return mount(el);
}

// Faithful reproduction of React's _valueTracker: an instance-level `value` accessor that records
// the last value it saw set THROUGH IT, while delegating reads/writes to the real prototype
// descriptor. The native-setter trick bypasses this instance setter, so the tracker stays stale —
// which is precisely how React detects a programmatic change and fires onChange.
function attachReactTracker(el) {
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  let current = el.value;
  Object.defineProperty(el, "value", {
    configurable: true,
    get() {
      return proto.get.call(this);
    },
    set(v) {
      current = String(v);
      proto.set.call(this, v);
    },
  });
  return { getValue: () => current };
}

function records(el, types) {
  const log = [];
  for (const t of types) el.addEventListener(t, (e) => log.push(e.type));
  return log;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

// ===========================================================================
describe("setNativeValue", () => {
  it("sets the value and dispatches bubbling input then change in order", () => {
    const el = input();
    const log = records(el, ["input", "change"]);
    setNativeValue(el, "hello");
    expect(el.value).toBe("hello");
    expect(log).toEqual(["input", "change"]);
  });

  it("dispatches a real InputEvent (so editors that gate on InputEvent see it)", () => {
    const el = input();
    let evt = null;
    el.addEventListener("input", (e) => (evt = e));
    setNativeValue(el, "x");
    expect(evt).toBeInstanceOf(InputEvent);
  });

  it("input/change bubble to an ancestor (frameworks listen via delegation)", () => {
    const el = input();
    const log = records(el.parentElement || document.body, ["input", "change"]);
    setNativeValue(el, "y");
    expect(log).toEqual(["input", "change"]);
  });

  it("uses the prototype native setter so a React-style value tracker detects the change", () => {
    const el = input();
    const tracker = attachReactTracker(el); // tracker.current = ""
    let seenByTracker = null;
    let seenValue = null;
    el.addEventListener("input", () => {
      seenByTracker = tracker.getValue();
      seenValue = el.value;
    });
    setNativeValue(el, "John");
    expect(seenValue).toBe("John");
    // If the code had done `el.value = "John"`, the tracker would already read "John" and React
    // would see no change. Staying "" at input time proves the native setter bypassed tracking.
    expect(seenByTracker).toBe("");
  });
});

// ===========================================================================
describe("text adapter — idempotent fill policy", () => {
  it("fills an empty field and reports 'filled'", async () => {
    const el = input();
    const a = createAdapter({ kind: "text", el });
    const r = await fillField(a, { value: "Ada" });
    expect(el.value).toBe("Ada");
    expect(r.status).toBe("filled");
    expect(r.changed).toBe(true);
  });

  it("is a no-op when the field already holds the target value (no events, 'already')", async () => {
    const el = input();
    setNativeValue(el, "Ada");
    const log = records(el, ["input", "change"]);
    const a = createAdapter({ kind: "text", el });
    const r = await fillField(a, { value: "Ada" });
    expect(r.status).toBe("already");
    expect(r.changed).toBe(false);
    expect(log).toEqual([]); // nothing re-dispatched — no wasted work
  });

  it("treats whitespace/case-different-but-equal as already filled", async () => {
    const el = input();
    setNativeValue(el, "New York");
    const a = createAdapter({ kind: "text", el });
    const r = await fillField(a, { value: "  new york " });
    expect(r.status).toBe("already");
  });

  it("does NOT overwrite non-empty content the user typed ('skipped-user')", async () => {
    const el = input();
    setNativeValue(el, "user typed this");
    const a = createAdapter({ kind: "text", el });
    const r = await fillField(a, { value: "autofilled" });
    expect(el.value).toBe("user typed this");
    expect(r.status).toBe("skipped-user");
    expect(r.changed).toBe(false);
  });

  it("re-fills a field that was reset to empty (controlled re-render restore)", async () => {
    const el = input();
    const a = createAdapter({ kind: "text", el });
    const reg = new FilledRegistry();
    await fillField(a, { value: "Ada" }, { registry: reg, key: "name" });
    setNativeValue(el, ""); // simulate a re-render wiping the controlled input
    const r = await fillField(a, { value: "Ada" }, { registry: reg, key: "name" });
    expect(el.value).toBe("Ada");
    expect(r.status).toBe("filled");
  });

  it("with a registry, updates a field that still holds OUR previously-written value", async () => {
    const el = input();
    const a = createAdapter({ kind: "text", el });
    const reg = new FilledRegistry();
    await fillField(a, { value: "old" }, { registry: reg, key: "f" });
    const r = await fillField(a, { value: "new" }, { registry: reg, key: "f" });
    expect(el.value).toBe("new");
    expect(r.status).toBe("filled");
  });

  it("reports 'empty-target' and writes nothing when there is no value to fill", async () => {
    const el = input();
    const a = createAdapter({ kind: "text", el });
    const r = await fillField(a, { value: null });
    expect(el.value).toBe("");
    expect(r.status).toBe("empty-target");
  });
});

// ===========================================================================
describe("lifecycle — blur fires so validation-on-blur runs", () => {
  it("dispatches blur after change on a successful text fill", async () => {
    const el = input();
    const order = records(el, ["change", "blur"]);
    const a = createAdapter({ kind: "text", el });
    await fillField(a, { value: "z" });
    expect(order).toContain("blur");
    expect(order.indexOf("blur")).toBeGreaterThan(order.indexOf("change"));
  });
});

// ===========================================================================
describe("read-back escalation", () => {
  it("escalates when the first write does not stick, then succeeds", async () => {
    // A stubborn control: it reverts a programmatic value on 'input' UNLESS a 'beforeinput' was
    // seen first (mimics editors/masks that only accept gated input). Tier 1 has no beforeinput so
    // it reverts; the engine must escalate (beforeinput-gated write) and verify success.
    const el = input();
    let armed = false;
    el.addEventListener("beforeinput", () => (armed = true));
    el.addEventListener("input", () => {
      if (!armed) {
        const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
        proto.set.call(el, "");
      }
      armed = false;
    });
    const a = createAdapter({ kind: "text", el });
    const r = await fillField(a, { value: "persisted" });
    expect(el.value).toBe("persisted");
    expect(r.status).toBe("filled");
  });

  it("reports 'failed' (not a false success) when the value can never stick", async () => {
    const el = input();
    const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    el.addEventListener("input", () => proto.set.call(el, "")); // always reverts
    const a = createAdapter({ kind: "text", el });
    const r = await fillField(a, { value: "nope" });
    expect(r.status).toBe("failed");
  });
});

// ===========================================================================
describe("select adapter", () => {
  it("selects by option value and fires change", async () => {
    const sel = selectEl([
      { value: "us", label: "United States" },
      { value: "ca", label: "Canada" },
    ]);
    const log = records(sel, ["change"]);
    const a = createAdapter({ kind: "select", el: sel });
    const r = await fillField(a, { optionValues: ["ca"] });
    expect(sel.value).toBe("ca");
    expect(r.status).toBe("filled");
    expect(log).toEqual(["change"]);
  });

  it("matches by visible option label when the value differs", async () => {
    const sel = selectEl([
      { value: "1", label: "Yes" },
      { value: "0", label: "No" },
    ]);
    const a = createAdapter({ kind: "select", el: sel });
    await fillField(a, { optionValues: ["Yes"] });
    expect(sel.value).toBe("1");
  });

  it("is idempotent — already-selected option is left alone", async () => {
    const sel = selectEl([
      { value: "us", label: "US" },
      { value: "ca", label: "CA" },
    ]);
    sel.value = "ca";
    const log = records(sel, ["change"]);
    const a = createAdapter({ kind: "select", el: sel });
    const r = await fillField(a, { optionValues: ["ca"] });
    expect(r.status).toBe("already");
    expect(log).toEqual([]);
  });
});

// ===========================================================================
describe("radio adapter", () => {
  it("checks the matching option via a real click", async () => {
    const opts = radioOptions("auth", [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ]);
    const a = createAdapter({ kind: "radio", options: opts });
    const r = await fillField(a, { optionValues: ["yes"] });
    expect(opts[0].el.checked).toBe(true);
    expect(opts[1].el.checked).toBe(false);
    expect(r.status).toBe("filled");
  });

  it("matches by option label too", async () => {
    const opts = radioOptions("q", [
      { value: "a", label: "Authorized" },
      { value: "b", label: "Not" },
    ]);
    const a = createAdapter({ kind: "radio", options: opts });
    await fillField(a, { optionValues: ["Authorized"] });
    expect(opts[0].el.checked).toBe(true);
  });

  it("is idempotent — already-checked option is not re-clicked", async () => {
    const opts = radioOptions("q", [{ value: "a" }, { value: "b" }]);
    opts[0].el.checked = true;
    let clicks = 0;
    opts[0].el.addEventListener("click", () => clicks++);
    const a = createAdapter({ kind: "radio", options: opts });
    const r = await fillField(a, { optionValues: ["a"] });
    expect(r.status).toBe("already");
    expect(clicks).toBe(0);
  });
});

// ===========================================================================
describe("checkbox group adapter (select many)", () => {
  it("checks every matching option", async () => {
    const opts = checkboxOptions("skills", [{ value: "js" }, { value: "ts" }, { value: "go" }]);
    const a = createAdapter({ kind: "checkbox", options: opts });
    await fillField(a, { optionValues: ["js", "go"] });
    expect(opts[0].el.checked).toBe(true);
    expect(opts[1].el.checked).toBe(false);
    expect(opts[2].el.checked).toBe(true);
  });

  it("is idempotent when the wanted set is already checked", async () => {
    const opts = checkboxOptions("s", [{ value: "js" }, { value: "ts" }]);
    opts[0].el.checked = true;
    const a = createAdapter({ kind: "checkbox", options: opts });
    const r = await fillField(a, { optionValues: ["js"] });
    expect(r.status).toBe("already");
  });
});

// ===========================================================================
describe("consent checkbox adapter (single)", () => {
  it("checks the box for a truthy answer", async () => {
    const el = input("checkbox");
    const a = createAdapter({ kind: "checkbox", el });
    await fillField(a, { value: "yes" });
    expect(el.checked).toBe(true);
  });

  it("is idempotent when already in the desired state", async () => {
    const el = input("checkbox");
    el.checked = true;
    let clicks = 0;
    el.addEventListener("click", () => clicks++);
    const a = createAdapter({ kind: "checkbox", el });
    const r = await fillField(a, { value: "true" });
    expect(r.status).toBe("already");
    expect(clicks).toBe(0);
  });
});

// ===========================================================================
describe("buttons adapter (custom segmented / pill choice)", () => {
  it("clicks the option whose text matches the answer", async () => {
    const opts = buttonOptions(["Yes", "No"]);
    const a = createAdapter({ kind: "buttons", options: opts });
    const r = await fillField(a, { optionValues: ["Yes"] });
    expect(opts[0].el.getAttribute("aria-pressed")).toBe("true");
    expect(r.status).toBe("filled");
  });

  it("is idempotent — an already-pressed option is not re-clicked", async () => {
    const opts = buttonOptions(["Yes", "No"]);
    opts[0].el.setAttribute("aria-pressed", "true");
    let clicks = 0;
    opts[0].el.addEventListener("click", () => clicks++);
    const a = createAdapter({ kind: "buttons", options: opts });
    const r = await fillField(a, { optionValues: ["Yes"] });
    expect(r.status).toBe("already");
    expect(clicks).toBe(0);
  });
});

// ===========================================================================
describe("combobox adapter (ARIA listbox)", () => {
  it("opens and clicks the matching option", async () => {
    const el = comboboxEl(["Remote", "Hybrid", "On-site"]);
    const a = createAdapter({ kind: "combobox", el });
    const r = await fillField(a, { value: "Hybrid" });
    expect(el.getAttribute("data-chosen")).toBe("Hybrid");
    expect(el.value).toBe("Hybrid");
    expect(r.status).toBe("filled");
  });

  it("is idempotent when the combobox already shows the value", async () => {
    const el = comboboxEl(["Remote", "Hybrid"], { preselect: "Hybrid" });
    const a = createAdapter({ kind: "combobox", el });
    const r = await fillField(a, { value: "Hybrid" });
    expect(r.status).toBe("already");
  });
});

// ===========================================================================
describe("contenteditable adapter", () => {
  it("sets text and fires input", async () => {
    const el = contentEditable();
    const log = records(el, ["input"]);
    const a = createAdapter({ kind: "contenteditable", el });
    const r = await fillField(a, { value: "hello world" });
    expect(el.textContent).toBe("hello world");
    expect(log).toContain("input");
    expect(r.status).toBe("filled");
  });

  it("is idempotent when text already matches", async () => {
    const el = contentEditable();
    el.textContent = "hello";
    const a = createAdapter({ kind: "contenteditable", el });
    const r = await fillField(a, { value: "hello" });
    expect(r.status).toBe("already");
  });
});

// ===========================================================================
describe("FilledRegistry — track filled fields, avoid wasted work", () => {
  it("records and reads back what was filled", () => {
    const reg = new FilledRegistry();
    reg.record("k", { value: "v" });
    expect(reg.has("k")).toBe(true);
    expect(reg.get("k")).toEqual({ value: "v" });
  });

  it("never invokes adapter.write when the field is already correct", async () => {
    const el = input();
    setNativeValue(el, "done");
    let wrote = 0;
    const spy = {
      kind: "text",
      isEmpty: () => el.value === "",
      isFilledWith: () => norm(el.value) === norm("done"),
      snapshot: () => () => {},
      write: async () => {
        wrote++;
        return true;
      },
    };
    const r = await fillField(spy, { value: "done" });
    expect(wrote).toBe(0);
    expect(r.status).toBe("already");
  });

  it("undo restores the prior value", async () => {
    const el = input();
    setNativeValue(el, "before");
    const a = createAdapter({ kind: "text", el });
    const r = await fillField(a, { value: "before" }); // already → no undo
    expect(r.status).toBe("already");

    const el2 = input();
    const a2 = createAdapter({ kind: "text", el: el2 });
    const r2 = await fillField(a2, { value: "after" });
    expect(typeof r2.undo).toBe("function");
    r2.undo();
    expect(el2.value).toBe("");
  });
});
