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

// Only long-text (textarea/contenteditable) answers are pickable — those are the free-text
// responses worth saving to reuse. Fixtures use textareas so they get badges.
function twoFields() {
  const a1 = fakeAnchor({ top: 10, left: 10, width: 300, height: 80 });
  const a2 = fakeAnchor({ top: 120, left: 10, width: 300, height: 80 });
  const fields = [
    { id: "q1", label: "Why do you want to work here?", kind: "textarea", required: true },
    { id: "q2", label: "Cover letter", kind: "textarea" },
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
afterEach(() => {
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

  it("skips consent checkboxes and unlabeled fields", async () => {
    const a = fakeAnchor({ top: 10, left: 10, width: 300, height: 40 });
    stubHarvest(
      [{ id: "q1", label: "I agree to the privacy policy", kind: "checkbox" }],
      new Map([["q1", [a]]]),
    );
    await picker.activate({});
    expect(badges().length).toBe(0);
  });

  it("badges ONLY long-text (textarea) answers — short text, selects, files excluded", async () => {
    const a1 = fakeAnchor({ top: 10, left: 10, width: 300, height: 40 });
    const a2 = fakeAnchor({ top: 60, left: 10, width: 300, height: 40 });
    const a3 = fakeAnchor({ top: 110, left: 10, width: 300, height: 40 });
    const a4 = fakeAnchor({ top: 160, left: 10, width: 300, height: 80 });
    stubHarvest(
      [
        { id: "q1", label: "First name", kind: "text" },
        { id: "q2", label: "Country", kind: "select", options: ["US", "CA"] },
        { id: "q3", label: "Resume", kind: "file" },
        { id: "q4", label: "Why do you want this role?", kind: "textarea" },
      ],
      new Map([["q1", [a1]], ["q2", [a2]], ["q3", [a3]], ["q4", [a4]]]),
    );
    await picker.activate({});
    expect(badges().length).toBe(1); // only the textarea
    expect(picker.isActive()).toBe(true);
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
    expect(question).toEqual({ label: "Why do you want to work here?", type: "long_text", required: true });
    expect(typeof key).toBe("string");
    expect(picker.getSelected().map((q) => q.label)).toEqual(["Why do you want to work here?"]);
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
