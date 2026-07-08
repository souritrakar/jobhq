// Unit tests for the live application-form sync controller (ui/form-sync.js): automatic
// deterministic detection, page→panel value capture, panel→page writes, multi-step off-page
// retention, dismiss/ignore, and the dirty-empty answer rules. Loads the real engines
// (field-adapters + application.js harvest + question-mapper) against jsdom.
//
// jsdom has no layout, so the harvest's isVisible() (getClientRects) would treat every element
// as unrendered — stub it to a non-empty rect, exactly like harvest-questions.test.js.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import "../lib/field-adapters.js";
import "../lib/question-mapper.js";
import "./application.js";
import sync from "./form-sync.js";

function labeled(text, control, id) {
  control.id = id;
  const wrap = document.createElement("div");
  const lab = document.createElement("label");
  lab.setAttribute("for", id);
  lab.textContent = text;
  wrap.append(lab, control);
  return wrap;
}
function input(type, attrs = {}) {
  const el = document.createElement("input");
  el.type = type;
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}
function fire(el, type) {
  el.dispatchEvent(new Event(type, { bubbles: true }));
}
const keyFor = (label, type, options) =>
  globalThis.JobTracker.questionMapper.keyOf({ label, type, options });

let origRects;
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = "";
  origRects = Element.prototype.getClientRects;
  Element.prototype.getClientRects = () => [{ width: 10, height: 10, top: 0, left: 0 }];
});
afterEach(() => {
  sync.deactivate();
  Element.prototype.getClientRects = origRects;
  vi.useRealTimers();
});

function buildForm() {
  const form = document.createElement("form");
  const name = input("text");
  name.value = "Ada Lovelace"; // pre-filled → initial answer must capture it
  form.append(labeled("Full name", name, "name"));

  const ta = document.createElement("textarea");
  form.append(labeled("Why us?", ta, "why"));

  const fs = document.createElement("fieldset");
  const lg = document.createElement("legend");
  lg.textContent = "Authorized to work?";
  fs.append(lg);
  ["Yes", "No"].forEach((v, i) =>
    fs.append(labeled(v, input("radio", { name: "auth", value: v }), "auth" + i)),
  );
  form.append(fs);

  document.body.append(form);
  return { form, name, ta, auth: Array.from(form.querySelectorAll("input[type=radio]")) };
}

describe("formSync — detection & initial model", () => {
  it("auto-detects all fields on activate and captures pre-filled values", async () => {
    const { ta } = buildForm();
    void ta;
    const models = [];
    await sync.activate({ onModel: (m) => models.push(m) });

    const model = models[models.length - 1];
    // Harvest emits grouped controls (radio sets) before singles — assert on content, not order.
    const byLabel = Object.fromEntries(model.map((e) => [e.question.label, e]));
    expect(Object.keys(byLabel).sort()).toEqual(["Authorized to work?", "Full name", "Why us?"]);
    expect(model.every((e) => e.onPage)).toBe(true);
    expect(byLabel["Full name"].answer).toBe("Ada Lovelace"); // pre-filled input captured
    expect(byLabel["Authorized to work?"].question.type).toBe("radio");
    expect(byLabel["Authorized to work?"].question.options).toEqual(["Yes", "No"]);
  });

  it("ignores controls inside page chrome (nav/search) — the structural noise gate", async () => {
    buildForm();
    const nav = document.createElement("nav");
    nav.append(labeled("Search jobs", input("text"), "q"));
    document.body.append(nav);

    const models = [];
    await sync.activate({ onModel: (m) => models.push(m) });
    const labels = models[models.length - 1].map((e) => e.question.label);
    expect(labels).not.toContain("Search jobs");
  });

  it("restores previously captured questions as off-page with their answers", async () => {
    document.body.innerHTML = ""; // nothing on the page at all
    const q = { label: "Desired salary", type: "short_text" };
    const key = keyFor("Desired salary", "short_text");
    const models = [];
    await sync.activate({
      questions: [q],
      answers: { [key]: "120k" },
      onModel: (m) => models.push(m),
    });
    const model = models[models.length - 1];
    expect(model).toHaveLength(1);
    expect(model[0].onPage).toBe(false);
    expect(model[0].answer).toBe("120k");
  });
});

describe("formSync — page → panel", () => {
  it("captures typing on the page and emits onAnswer(fromPage=true)", async () => {
    const { name } = buildForm();
    const changes = [];
    await sync.activate({ onAnswer: (key, value, fromPage) => changes.push({ key, value, fromPage }) });

    name.value = "Grace Hopper";
    fire(name, "input");
    await vi.advanceTimersByTimeAsync(10);

    const last = changes[changes.length - 1];
    expect(last.value).toBe("Grace Hopper");
    expect(last.fromPage).toBe(true);
    expect(sync.getAnswers()[last.key]).toBe("Grace Hopper");
  });

  it("captures a radio choice via change events", async () => {
    const { auth } = buildForm();
    await sync.activate({});
    auth[1].checked = true;
    fire(auth[1], "change");
    await vi.advanceTimersByTimeAsync(100);
    expect(sync.getAnswers()[keyFor("Authorized to work?", "radio", ["Yes", "No"])]).toBe("No");
  });

  it("is echo-proof: an event whose value equals the model is a no-op", async () => {
    const { name } = buildForm();
    const changes = [];
    await sync.activate({ onAnswer: () => changes.push(1) });
    changes.length = 0; // ignore the initial pre-fill capture — only count post-activate events
    fire(name, "input"); // value unchanged ("Ada Lovelace")
    await vi.advanceTimersByTimeAsync(10);
    expect(changes).toHaveLength(0);
  });
});

describe("formSync — panel → page", () => {
  it("writes a panel text edit to the live control (debounced)", async () => {
    const { name } = buildForm();
    await sync.activate({});
    const key = keyFor("Full name", "short_text");
    sync.setAnswer(key, "Katherine Johnson");
    expect(name.value).toBe("Ada Lovelace"); // not yet — debounce window
    await vi.advanceTimersByTimeAsync(300);
    expect(name.value).toBe("Katherine Johnson");
  });

  it("writes a panel radio choice immediately", async () => {
    const { auth } = buildForm();
    await sync.activate({});
    sync.setAnswer(keyFor("Authorized to work?", "radio", ["Yes", "No"]), "Yes");
    expect(auth[0].checked).toBe(true);
  });
});

describe("formSync — multi-step forms & dismiss", () => {
  it("keeps a removed field off-page with its answer, and adds newly mounted fields", async () => {
    const { form, name } = buildForm();
    const models = [];
    await sync.activate({ onModel: (m) => models.push(m) });
    const nameKey = keyFor("Full name", "short_text");

    // "Next step": name unmounts, a new question mounts.
    name.closest("div").remove();
    form.append(labeled("Notice period", input("text"), "notice"));
    await vi.advanceTimersByTimeAsync(600); // observer throttle + settle

    const model = models[models.length - 1];
    const byLabel = Object.fromEntries(model.map((e) => [e.question.label, e]));
    expect(byLabel["Full name"].onPage).toBe(false);
    expect(byLabel["Full name"].answer).toBe("Ada Lovelace"); // survives the step change
    expect(byLabel["Notice period"].onPage).toBe(true);
    expect(sync.getQuestions().map((q) => q.label)).toContain("Notice period");
    void nameKey;
  });

  it("a flag toggled in the panel survives re-harvests (question object identity is kept)", async () => {
    buildForm();
    const models = [];
    await sync.activate({ onModel: (m) => models.push(m) });
    const entry = models[models.length - 1].find((e) => e.question.label === "Why us?");
    entry.question.flagged = true; // exactly what the panel's flag button does

    document.body.append(document.createElement("p")); // any mutation → re-harvest
    await vi.advanceTimersByTimeAsync(600);
    expect(sync.getQuestions().find((q) => q.label === "Why us?").flagged).toBe(true);
  });

  it("dismiss removes the question and re-harvests never resurrect it", async () => {
    buildForm();
    const models = [];
    await sync.activate({ onModel: (m) => models.push(m) });
    const key = keyFor("Why us?", "long_text");

    sync.dismiss(key);
    expect(models[models.length - 1].map((e) => e.key)).not.toContain(key);
    expect(sync.getIgnoredKeys()).toContain(key);

    document.body.append(document.createElement("p")); // any mutation → re-harvest
    await vi.advanceTimersByTimeAsync(600);
    expect(models[models.length - 1].map((e) => e.key)).not.toContain(key);
  });
});

describe("formSync — stable first-seen ordering & file pin", () => {
  it("keeps every question in its first-seen slot across a remount (no hoisting)", async () => {
    const { form, name } = buildForm(); // Full name, Why us?, Authorized to work?
    const models = [];
    await sync.activate({ onModel: (m) => models.push(m) });
    const initial = models[models.length - 1].map((e) => e.question.label);
    const nameIdx = initial.indexOf("Full name");

    // Full name unmounts (goes off-page); a new field mounts. Order must NOT reshuffle: Full name
    // holds its slot, the new field lands at the end.
    name.closest("div").remove();
    form.append(labeled("Notice period", input("text"), "notice"));
    await vi.advanceTimersByTimeAsync(600);

    const after = models[models.length - 1].map((e) => e.question.label);
    expect(after.indexOf("Full name")).toBe(nameIdx); // unmoved
    expect(after[after.length - 1]).toBe("Notice period"); // appended, not hoisted
  });

  it("a file field stays in place and on-page after its input disappears (upload)", async () => {
    const form = document.createElement("form");
    form.append(labeled("First name", input("text"), "fn"));
    const file = input("file");
    const fileWrap = labeled("Resume", file, "resume");
    form.append(fileWrap);
    form.append(labeled("Cover letter", input("text"), "cl"));
    document.body.append(form);

    const models = [];
    await sync.activate({ onModel: (m) => models.push(m) });
    const resumeKey = keyFor("Resume", "file");

    // Simulate an upload: the file input reports a chosen file, then is removed from the DOM
    // (the ATS swaps it for a "filename + remove" chip). jsdom won't let us set .files, so drive
    // the captured answer through the panel-facing read path via a change event on a stubbed input.
    Object.defineProperty(file, "files", { value: [{ name: "resume.pdf" }], configurable: true });
    fire(file, "change");
    await vi.advanceTimersByTimeAsync(100);
    expect(sync.getAnswers()[resumeKey]).toBe("resume.pdf");

    const orderBefore = models[models.length - 1].map((e) => e.question.label);
    fileWrap.remove(); // input gone after upload
    await vi.advanceTimersByTimeAsync(600);

    const entry = models[models.length - 1].find((e) => e.key === resumeKey);
    expect(entry.onPage).toBe(true); // pinned — not dimmed, not tagged "Other step"
    expect(models[models.length - 1].map((e) => e.question.label)).toEqual(orderBefore); // unmoved
  });
});

describe("formSync — answer bookkeeping", () => {
  it("omits untouched empties but keeps an explicit clear as \"\"", async () => {
    const { name, ta } = buildForm();
    void ta;
    await sync.activate({});
    const nameKey = keyFor("Full name", "short_text");
    const whyKey = keyFor("Why us?", "long_text");

    // "Why us?" was never touched → absent. Clearing "Full name" IS a deliberate edit → "".
    name.value = "";
    fire(name, "input");
    await vi.advanceTimersByTimeAsync(10);

    const answers = sync.getAnswers();
    expect(answers[nameKey]).toBe("");
    expect(whyKey in answers).toBe(false);
  });

  it("an empty re-mounted control never clobbers a stored answer", async () => {
    document.body.innerHTML = "";
    const q = { label: "Desired salary", type: "short_text" };
    const key = keyFor("Desired salary", "short_text");
    await sync.activate({ questions: [q], answers: { [key]: "120k" } });

    // The field mounts EMPTY (a step transition re-render) — stored answer must survive.
    document.body.append(labeled("Desired salary", input("text"), "sal"));
    await vi.advanceTimersByTimeAsync(600);
    expect(sync.getAnswers()[key]).toBe("120k");
  });
});
