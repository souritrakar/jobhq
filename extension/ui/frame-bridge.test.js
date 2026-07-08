// Unit tests for the cross-frame aggregator (ui/frame-bridge.js). No chrome: the transport is a
// fake, and the local form-sync is a controllable stub, so we exercise the merge / ordering /
// answer-store / routing logic directly. Uses the real questionMapper for key identity.
import { describe, it, expect, beforeEach, vi } from "vitest";

import "../lib/question-mapper.js";
import bridge from "./frame-bridge.js";

const mapper = globalThis.JobTracker.questionMapper;
const K = (label, type, options) => mapper.keyOf({ label, type, options });
const item = (label, type, answer = "", onPage = true, options) => ({
  key: K(label, type, options),
  question: options ? { label, type, options } : { label, type },
  answer,
  onPage,
});

// A stub standing in for the top frame's own form-sync (the "local" source).
function fakeLocal() {
  let hooks = {};
  return {
    activate(opts) {
      hooks = opts || {};
      return Promise.resolve();
    },
    setAnswer: vi.fn(),
    dismiss: vi.fn(),
    deactivate: vi.fn(),
    emitModel: (items) => hooks.onModel && hooks.onModel(items),
    emitAnswer: (key, value, fromPage) => hooks.onAnswer && hooks.onAnswer(key, value, fromPage),
  };
}

// A fake transport with drivers to simulate messages arriving from sub-frames.
function fakeTransport() {
  let frameHandler = null;
  return {
    broadcasts: [],
    toFrame: [],
    broadcast(p) {
      this.broadcasts.push(p);
    },
    sendToFrame(fid, p) {
      this.toFrame.push({ fid, p });
    },
    onFrameMessage(h) {
      frameHandler = h;
    },
    fromFrame: (fid, payload) => frameHandler && frameHandler(fid, payload),
  };
}

let local, transport, agg, models;
function labels(model) {
  return model.map((m) => m.question.label);
}
beforeEach(() => {
  local = fakeLocal();
  transport = fakeTransport();
  models = [];
  agg = bridge.createAggregator(local, transport, mapper);
});

describe("aggregator — merge & ordering", () => {
  it("broadcasts activate and merges local + remote sources in first-seen order", async () => {
    await agg.activate({ onModel: (m) => models.push(m) });
    expect(transport.broadcasts[0]).toEqual({ kind: "activate", ignoredKeys: [] });

    local.emitModel([item("First name", "short_text"), item("Why us?", "long_text")]);
    transport.fromFrame(7, { kind: "model", items: [item("Visa status", "select")] });

    expect(labels(models[models.length - 1])).toEqual(["First name", "Why us?", "Visa status"]);
  });

  it("keeps a question in its first-seen slot when it later goes off-page in its frame", async () => {
    await agg.activate({ onModel: (m) => models.push(m) });
    local.emitModel([item("A", "short_text"), item("B", "short_text")]);
    transport.fromFrame(7, { kind: "model", items: [item("C", "short_text")] });
    const order = labels(models[models.length - 1]);

    // Frame 7 re-reports C off-page (still present, just not detected on-page this pass).
    transport.fromFrame(7, { kind: "model", items: [item("C", "short_text", "", false)] });
    const after = models[models.length - 1];
    expect(labels(after)).toEqual(order); // unmoved
    expect(after.find((m) => m.question.label === "C").onPage).toBe(false);
  });
});

describe("aggregator — restored answers & dedupe", () => {
  it("keeps a restored answer when the owning frame reports the question blank", async () => {
    const q = { label: "Desired salary", type: "select", options: ["Low", "High"] };
    const key = mapper.keyOf(q);
    await agg.activate({
      questions: [q],
      answers: { [key]: "High" },
      onModel: (m) => models.push(m),
    });
    // Restored, no frame yet: shown off-page with its saved answer.
    let m = models[models.length - 1].find((x) => x.key === key);
    expect(m.answer).toBe("High");
    expect(m.onPage).toBe(false);

    // Frame 7 mounts the same question but the page control is blank (reopened form).
    transport.fromFrame(7, { kind: "model", items: [{ key, question: q, answer: [], onPage: true }] });
    m = models[models.length - 1].find((x) => x.key === key);
    expect(m.answer).toBe("High"); // blank remote report never clobbers the restored answer
    expect(m.onPage).toBe(true); // now owned/on-page in frame 7
    expect(agg.getAnswers()[key]).toBe("High");
  });

  it("a page value change in a frame updates the store and emits onAnswer(fromPage)", async () => {
    const changes = [];
    await agg.activate({ onModel: () => {}, onAnswer: (k, v, fp) => changes.push({ k, v, fp }) });
    const key = K("Phone", "short_text");
    transport.fromFrame(7, { kind: "model", items: [item("Phone", "short_text")] }); // question first
    transport.fromFrame(7, { kind: "answer", key, value: "+1 555" }); // then the user types
    expect(changes[changes.length - 1]).toEqual({ k: key, v: "+1 555", fp: true });
    expect(agg.getAnswers()[key]).toBe("+1 555");
  });
});

describe("aggregator — edit & dismiss routing", () => {
  it("routes a panel edit to the frame that owns the question", async () => {
    await agg.activate({ onModel: (m) => models.push(m) });
    const key = K("Cover letter", "long_text");
    transport.fromFrame(7, { kind: "model", items: [item("Cover letter", "long_text")] });

    agg.setAnswer(key, "Dear team");
    expect(transport.toFrame).toContainEqual({ fid: 7, p: { kind: "setAnswer", key, value: "Dear team" } });
    expect(local.setAnswer).not.toHaveBeenCalled();
    expect(agg.getAnswers()[key]).toBe("Dear team");
  });

  it("routes a panel edit to the local engine when the top frame owns the question", async () => {
    await agg.activate({ onModel: (m) => models.push(m) });
    const key = K("First name", "short_text");
    local.emitModel([item("First name", "short_text")]);

    agg.setAnswer(key, "Ada");
    expect(local.setAnswer).toHaveBeenCalledWith(key, "Ada");
    expect(transport.toFrame).toHaveLength(0);
  });

  it("dismiss removes the question, tells every frame, and keeps it out", async () => {
    await agg.activate({ onModel: (m) => models.push(m) });
    const key = K("Gender", "select");
    transport.fromFrame(7, { kind: "model", items: [item("Gender", "select")] });
    expect(labels(models[models.length - 1])).toContain("Gender");

    agg.dismiss(key);
    expect(transport.broadcasts).toContainEqual({ kind: "dismiss", key });
    expect(local.dismiss).toHaveBeenCalledWith(key);
    expect(labels(models[models.length - 1])).not.toContain("Gender");

    // A re-report from the frame must not resurrect it.
    transport.fromFrame(7, { kind: "model", items: [item("Gender", "select")] });
    expect(labels(models[models.length - 1])).not.toContain("Gender");
    expect(agg.getIgnoredKeys()).toContain(key);
  });

  it("keeps an explicit clear as \"\" in getAnswers (dirty), omits untouched empties", async () => {
    await agg.activate({ onModel: () => {} });
    const key = K("First name", "short_text");
    local.emitModel([item("First name", "short_text", "Ada")]);
    expect(agg.getAnswers()[key]).toBe("Ada");

    agg.setAnswer(key, ""); // user cleared it in the panel
    expect(agg.getAnswers()[key]).toBe("");
  });
});

describe("aggregator — lifecycle", () => {
  it("activates a late-loading frame that says hello while already active", async () => {
    await agg.activate({ onModel: () => {} });
    transport.fromFrame(9, { kind: "hello" });
    expect(transport.toFrame).toContainEqual({ fid: 9, p: { kind: "activate", ignoredKeys: [] } });
  });

  it("deactivate tears down and broadcasts to sub-frames", async () => {
    await agg.activate({ onModel: () => {} });
    agg.deactivate();
    expect(local.deactivate).toHaveBeenCalled();
    expect(transport.broadcasts).toContainEqual({ kind: "deactivate" });
    expect(agg.isActive()).toBe(false);
  });
});
